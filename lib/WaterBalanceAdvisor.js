'use strict';

// Water-balance advisor (pure) — M8.1 spec §4
// (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
// Converts waterworks fill-water values, holds the stoichiometric dose-factor
// tables and the product side-effect matrix, estimates the CO2 equilibrium pH,
// ranks the LSI drivers and produces quantified recommendations. Pure and
// total: invalid/missing input yields null / status 'incomplete', never throws.
// LSI math itself stays in lib/Lsi.js (single source of truth, spec §3).
// Invariant since the M8.1 whole-branch review: every lever's target, dose and
// predicted LSI are read off ONE reachable state — for pH that means solving
// the coupled pH/TA path (solvePhCoupled), because acid and soda always move
// alkalinity along with the pH (spec §4.5).

const { computeLSI, classifyLSI } = require('./Lsi');

// Waterworks conversions (spec §4.1).
const DH_TO_PPM = 17.848;   // 1 °dH total hardness = 17.848 ppm CaCO3
const KS43_TO_PPM = 50.04;  // 1 mmol/L K_S4,3 = 1 meq/L = 50.04 ppm CaCO3

// Stoichiometric dose factors, g or mL per m³ per 10 ppm change (spec §4.2).
const DOSE = { taUpGPerM3Per10: 16.8, chUpGPerM3Per10: 14.7, sodaGPerM3Per10Ta: 10.6 };

// pH-minus products with fixed, labeled concentrations (spec §4.2, decisions §13).
const PH_MINUS_PRODUCTS = /** @type {Object<string, {mlPerM3Per10Ta?: number, gPerM3Per10Ta?: number}>} */ ({
  h2so4_15: { mlPerM3Per10Ta: 60 },
  hcl_30: { mlPerM3Per10Ta: 21 },
  nahso4: { gPerM3Per10Ta: 24 },
});

// Chlorine-product long-term side effects on the balance (spec §4.3).
const CHLORINE_EFFECTS = /** @type {Object<string, {ph?: string, ta?: string, chPerFc?: number, cyaPerFc?: number}>} */ ({
  naocl: { ph: 'up' },
  calhypo: { ph: 'up', chPerFc: 0.7 },
  dichlor: { cyaPerFc: 0.9 },
  trichlor: { ph: 'down', ta: 'down', cyaPerFc: 0.6 },
  electrolysis: { ph: 'up' },
  none: {},
});

// Dissolved CO2 at atmospheric equilibrium: 420 µatm × K_H 0.034 M/atm (spec §4.6).
const CO2_ATM_M = 1.43e-5;
const PK1 = 6.35;
const EQ_PH_CAP = 8.4;

/** @param {*} n @returns {boolean} */
const fin = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Convert published waterworks values to LSI inputs (spec §4.1).
 * @param {{dhTotal?: *, ks43?: *, caFractionPct?: *}} args Gesamthärte °dH, K_S4,3 mmol/L, Ca share %.
 * @returns {?{chPpm: number, taPpm: number}} null when any input is missing/non-finite.
 */
function convertFillWater({ dhTotal, ks43, caFractionPct } = {}) {
  if (!fin(dhTotal) || !fin(ks43) || !fin(caFractionPct)) return null;
  const frac = Math.min(100, Math.max(50, caFractionPct)) / 100;
  return { chPpm: dhTotal * DH_TO_PPM * frac, taPpm: ks43 * KS43_TO_PPM };
}

/**
 * Equilibrium pH after full CO2 outgassing, capped at 8.4 (spec §4.6).
 * @param {*} taPpm Total alkalinity ppm CaCO3.
 * @returns {?number} Estimated equilibrium pH, or null for non-positive/invalid TA.
 */
function equilibriumPh(taPpm) {
  if (!fin(taPpm) || taPpm <= 0) return null;
  return Math.min(PK1 + Math.log10((taPpm / 50044) / CO2_ATM_M), EQ_PH_CAP);
}

// Practical clamp ranges per lever (spec §4.4; §14 for the pH range provenance).
const CLAMP = { ph: [7.0, 7.6], ta: [80, 120], ch: [200, 400] };
const DRIVER_MIN_DELTA = 0.05;
// Largest pH shift a single recommendation step may claim (spec §4.5).
const PH_STEP_CAP = 0.5;

/** Round a dose sensibly: g/mL to 10s, % to integer (spec §4.4.4). @param {number} v @param {string} unit */
function roundAmount(v, unit) { return unit === '%' ? Math.round(v) : Math.round(v / 10) * 10; }

/**
 * Solve the lever value in [lo,hi] that brings the LSI to 0 with the other
 * inputs fixed, clamped to the range. Bisection over computeLSI — monotonic in
 * each lever (spec §4.4.2); 40 iterations ≈ 1e-12 precision, far below rounding.
 * @param {'ph'|'ta'|'ch'} param @param {{pH:number,tempC:number,chPpm:number,taPpm:number,cya:number}} s
 * @returns {number} clamped target value
 */
function solveTarget(param, s) {
  const [lo, hi] = CLAMP[param];
  /** @param {number} v @returns {number} */
  const lsiAt = (v) => /** @type {number} */ (computeLSI({
    pH: param === 'ph' ? v : s.pH,
    tempC: s.tempC,
    calciumHardnessPpm: param === 'ch' ? v : s.chPpm,
    totalAlkalinityPpm: param === 'ta' ? v : s.taPpm,
    cya: s.cya,
  }));
  if (lsiAt(lo) >= 0) return lo;   // even the low end is non-corrosive → clamp
  if (lsiAt(hi) <= 0) return hi;   // even the high end stays ≤0 → clamp
  let a = lo, b = hi;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; (lsiAt(m) < 0 ? a = m : b = m); }
  return (a + b) / 2;
}

/**
 * Solve the ONE reachable state the pH lever can actually produce (spec
 * §4.4/§4.5). pH never moves alone: acid strips alkalinity
 * (ΔpH = log10(TA_after/TA_before), the §4.5 buffer model) and soda adds it.
 * Solving that coupled path — instead of picking a pH target at constant TA and
 * dosing against a different TA — is what keeps target, dose and predicted LSI
 * one and the same state; the whole-branch review found all three diverging
 * (pH 8.0 / TA 110 / CH 300 recommended a dose landing at LSI −0.69).
 * Parametrized by the TA change `m` (ppm): LSI is monotonic in `m` along this
 * path, so bisection applies as in solveTarget. `m` is bounded by the ±0.5 pH
 * per-step cap (§4.5), the practical pH range (§4.4) and TA >= 1 ppm; when the
 * bound binds before LSI 0 is reached, the bounded state is returned as-is —
 * an honest "this is as far as one step gets", not a fabricated LSI 0.
 * @param {'lower'|'raise'} direction
 * @param {{pH:number,tempC:number,chPpm:number,taPpm:number,cya:number}} s
 * @returns {?{pH:number, taPpm:number, taDelta:number, lsi:number}} null when no state is reachable.
 */
function solvePhCoupled(direction, s) {
  const ta = s.taPpm;
  if (!(ta > 1)) return null;
  const sign = direction === 'lower' ? -1 : 1;
  const mMax = direction === 'lower'
    ? Math.min(ta - 1, ta * (1 - Math.pow(10, -PH_STEP_CAP)), ta * (1 - Math.pow(10, CLAMP.ph[0] - s.pH)))
    : Math.min(ta * (Math.pow(10, PH_STEP_CAP) - 1), ta * (Math.pow(10, CLAMP.ph[1] - s.pH) - 1));
  if (!(mMax > 0)) return null;
  /** @param {number} m @returns {{pH:number, taPpm:number, taDelta:number, lsi:number}} */
  const at = (m) => {
    const taPpm = ta + sign * m;
    const pH = s.pH + Math.log10(taPpm / ta);
    const lsi = /** @type {number} */ (computeLSI({
      pH, tempC: s.tempC, calciumHardnessPpm: s.chPpm, totalAlkalinityPpm: taPpm, cya: s.cya,
    }));
    return { pH, taPpm, taDelta: m, lsi };
  };
  /** @param {number} lsi @returns {boolean} true once the step has crossed LSI 0 */
  const past = (lsi) => (direction === 'lower' ? lsi < 0 : lsi > 0);
  const bound = at(mMax);
  if (!past(bound.lsi)) return bound; // cap/clamp binds before LSI 0 — report it honestly
  let a = 0, b = mMax;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; (past(at(m).lsi) ? b = m : a = m); }
  return at((a + b) / 2);
}

/**
 * Driver analysis: rank the chemical levers by achievable LSI gain and attach
 * quantified measures per the configured products (spec §4.4).
 * See the Interfaces block of plan Task 2 for the exact result shape.
 * @param {*} args
 */
function adviseBalance(args = {}) {
  const { pH, tempC, chPpm, taPpm, cya, volumeM3, fill } = args;
  const products = args.products || {};
  const dosingCtx = args.dosingCtx || {};
  /** @type {string[]} */
  const missing = [];
  if (!fin(pH)) missing.push('pH');
  if (!fin(tempC)) missing.push('tempC');
  if (!fin(chPpm)) missing.push('chPpm');
  if (!fin(taPpm)) missing.push('taPpm');
  const eqPh = equilibriumPh(fin(taPpm) ? taPpm : null);
  const co2 = {
    equilibriumPh: eqPh,
    poorBuffering: fin(taPpm) ? taPpm < 80 : false,
    aerationRecommended: fin(pH) && eqPh !== null ? pH < eqPh - 0.3 : false,
  };
  const chlorineNote = products.chlorine === 'trichlor' ? 'trichlor_drift'
    : products.chlorine === 'calhypo' ? 'calhypo_ch'
      : products.chlorine === 'dichlor' ? 'dichlor_cya' : null;
  if (missing.length) {
    return { status: 'incomplete', missing, lsiNow: null, band: null, drivers: [], co2, predictedLsi: null, chlorineNote };
  }
  const state = { pH, tempC, chPpm, taPpm, cya: fin(cya) ? cya : 0 };
  const lsiNow = computeLSI({ pH, tempC, calciumHardnessPpm: chPpm, totalAlkalinityPpm: taPpm, cya: state.cya });
  const cls = classifyLSI(lsiNow);

  /** @type {Array<*>} */
  const drivers = [];
  for (const param of /** @type {Array<'ph'|'ta'|'ch'>} */ (['ph', 'ta', 'ch'])) {
    const current = param === 'ph' ? pH : param === 'ta' ? taPpm : chPpm;
    /** @type {number} */
    let target;
    /** @type {?number} */
    let lsiAfter;
    /** @type {'raise'|'lower'} */
    let direction;
    let taDelta = 0;
    if (param === 'ph') {
      // pH: one coupled state supplies target, dose and predicted LSI (§4.4/§4.5).
      // Direction comes from the LSI sign — the pH move that helps is the one
      // that pushes the index toward 0, never a clamp artifact.
      direction = /** @type {number} */ (lsiNow) > 0 ? 'lower' : 'raise';
      const sol = solvePhCoupled(direction, state);
      if (!sol) continue; // no reachable pH state (e.g. TA too low to buffer a step)
      target = sol.pH;
      lsiAfter = sol.lsi;
      taDelta = sol.taDelta;
    } else {
      // TA/CH keep the single-lever solve: NaHCO₃/CaCl₂ move their own lever
      // without a first-order pH shift (side-effect matrix §4.3).
      target = solveTarget(param, state);
      lsiAfter = computeLSI({
        pH,
        tempC,
        calciumHardnessPpm: param === 'ch' ? target : chPpm,
        totalAlkalinityPpm: param === 'ta' ? target : taPpm,
        cya: state.cya,
      });
      direction = target > current ? 'raise' : 'lower';
    }
    const deltaLsi = lsiAfter !== null && lsiNow !== null ? round2(lsiAfter - lsiNow) : 0;
    if (Math.abs(deltaLsi) < DRIVER_MIN_DELTA) continue;
    /** @type {string[]} */
    const notes = [];
    const handledByViolet = param === 'ph' && dosingCtx.violetDosesPh === true;
    if (handledByViolet) notes.push('violet_doses_ph');
    if (param === 'ph' && direction === 'raise' && co2.aerationRecommended) notes.push('aeration_first');
    if (param === 'ph' && direction === 'lower' && co2.aerationRecommended) notes.push('measure_after_outgassing');
    // Spec §4.3(2): when the Violet doses pH itself, the advice names the target
    // only — a hand-dosing amount next to "the Violet regulates this" is exactly
    // the contradiction the review flagged.
    const measure = handledByViolet
      ? null
      : buildMeasure({ param, direction, current, target, taDelta, volumeM3, products, fill, taPpm, notes });
    drivers.push({ param, current, target: round2(target), deltaLsi, lsiAfter, direction, handledByViolet, measure, notes });
  }
  drivers.sort((a, b) => Math.abs(b.deltaLsi) - Math.abs(a.deltaLsi));

  // Balanced band (classifyLSI severity 'ok', spec §5): the levers stay visible
  // as information — targets, direction, ranking — but carry no dose. Handing a
  // user 18 L of acid right after "the water balance is fine" is the review's
  // Finding 2; `fine_tuning` tells the text layer to frame them as optional.
  if (cls && cls.severity === 'ok') {
    for (const d of drivers) {
      d.measure = null;
      d.notes = d.notes.filter((/** @type {string} */ n) => n !== 'needs_volume').concat('fine_tuning');
    }
  }

  // Predicted LSI = the top lever's own post-state (spec §4.4.3) — the same
  // state its target and dose were solved from, so text can never quote a
  // number the recommendation does not actually produce.
  const predictedLsi = drivers.length ? drivers[0].lsiAfter : lsiNow;
  return { status: 'ok', missing: [], lsiNow, band: cls ? cls.band : null, drivers, co2, predictedLsi, chlorineNote };
}

/** @param {number} v */
function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Attach the concrete measure for one lever (spec §4.2/§4.5/§4.7). Mutates
 * `notes` for needs_volume/dilution/fill_water_is_source flags.
 * @param {*} a
 * @returns {?{chemical: string, amount: ?{value: number, unit: string}}}
 */
function buildMeasure({ param, direction, current, target, taDelta, volumeM3, products, fill, taPpm, notes }) {
  const hasVol = fin(volumeM3) && volumeM3 > 0;
  if (!hasVol) notes.push('needs_volume');
  /** @param {number} value @param {string} unit @param {string} chemical */
  const mk = (value, unit, chemical) => ({ chemical, amount: hasVol ? { value: roundAmount(value, unit), unit } : null });

  if (param === 'ta' && direction === 'raise') {
    return mk(DOSE.taUpGPerM3Per10 * volumeM3 * (target - current) / 10, 'g', 'nahco3');
  }
  if (param === 'ch' && direction === 'raise') {
    return mk(DOSE.chUpGPerM3Per10 * volumeM3 * (target - current) / 10, 'g', 'cacl2');
  }
  if ((param === 'ta' || param === 'ch') && direction === 'lower') {
    // Dilution (spec §4.7): only computable with fill-water values; honesty
    // note when the fill water itself sits at/above the target.
    if (fill && fin(fill.taPpm) && fin(fill.chPpm)) {
      const fillVal = param === 'ta' ? fill.taPpm : fill.chPpm;
      if (fillVal >= target) { notes.push('fill_water_is_source'); return null; }
      const pct = ((current - target) / (current - fillVal)) * 100;
      notes.push('dilution');
      return { chemical: 'dilution', amount: { value: roundAmount(pct, '%'), unit: '%' } };
    }
    // No fill data: TA can still go down via acid (product-dependent); CH cannot.
    if (param === 'ta' && products.phMinus && products.phMinus !== 'none') {
      return acidMeasure(products.phMinus, volumeM3, current - target, hasVol);
    }
    notes.push('dilution');
    return null;
  }
  if (param === 'ph') {
    // Both pH doses are the stoichiometric amount for `taDelta`, the alkalinity
    // change of the coupled state solvePhCoupled returned (spec §4.5) — the very
    // state `target` and the driver's lsiAfter come from. Aeration stays free
    // and is carried by the notes, not by an amount.
    if (!fin(taDelta) || taDelta <= 0) return null;
    if (direction === 'lower') {
      if (!products.phMinus || products.phMinus === 'none') return null;
      return acidMeasure(products.phMinus, volumeM3, taDelta, hasVol);
    }
    return mk(DOSE.sodaGPerM3Per10Ta * volumeM3 * taDelta / 10, 'g', 'soda');
  }
  return null;
}

/** @param {string} product @param {*} volumeM3 @param {number} taDropPpm @param {boolean} hasVol */
function acidMeasure(product, volumeM3, taDropPpm, hasVol) {
  const p = PH_MINUS_PRODUCTS[product];
  if (!p || taDropPpm <= 0) return null;
  const unit = p.mlPerM3Per10Ta ? 'mL' : 'g';
  const per10 = p.mlPerM3Per10Ta || p.gPerM3Per10Ta || 0;
  const value = hasVol ? roundAmount(per10 * /** @type {number} */ (volumeM3) * taDropPpm / 10, unit) : 0;
  return { chemical: product, amount: hasVol ? { value, unit } : null };
}

const FILL_DEFAULT_TEMP = 25; // °C, documented default when no pool temp is known (spec §4.7.1)

/**
 * Fill-water (tap water) analysis + startup plan (spec §4.7). Converts the
 * waterworks sheet (dHTotal/KS4.3/Ca share) to LSI inputs, computes the LSI
 * the fresh fill water would show, and derives a fixed-order startup plan
 * (TA → CH → outgassing → pH) that only lists steps still needed once earlier
 * steps have nudged the water toward the practical band (spec §4.4 CLAMP).
 * Pure/total: missing sheet inputs yield status 'incomplete', never throws.
 * @param {*} args
 * @returns {{status:string, missing:string[], chPpm:?number, taPpm:?number, lsiFill:?number, band:?string, equilibriumPh:?number, poorBuffering:boolean, plan:Array<*>}}
 */
function adviseFillWater(args = {}) {
  const { dhTotal, ks43, phTap, caFractionPct, volumeM3 } = args;
  const products = args.products || {};
  /** @type {string[]} */
  const missing = [];
  if (!fin(dhTotal)) missing.push('dhTotal');
  if (!fin(ks43)) missing.push('ks43');
  if (!fin(phTap)) missing.push('phTap');
  if (missing.length) {
    return { status: 'incomplete', missing, chPpm: null, taPpm: null, lsiFill: null, band: null, equilibriumPh: null, poorBuffering: false, plan: [] };
  }
  const conv = /** @type {{chPpm:number, taPpm:number}} */ (convertFillWater({ dhTotal, ks43, caFractionPct: fin(caFractionPct) ? caFractionPct : 75 }));
  const tempC = fin(args.tempC) ? args.tempC : FILL_DEFAULT_TEMP;
  const lsiFill = computeLSI({ pH: phTap, tempC, calciumHardnessPpm: conv.chPpm, totalAlkalinityPpm: conv.taPpm, cya: 0 });
  const cls = classifyLSI(lsiFill);
  const eqPh = equilibriumPh(conv.taPpm);

  // Startup plan (spec §4.7.3): fixed order TA → CH → outgassing → pH; steps
  // whose value already sits inside the practical band are omitted. Targets are
  // band centers (TA 100 / CH 250) — startup aims mid-band, not the LSI-0 edge.
  /** @type {Array<*>} */
  const plan = [];
  let ta = conv.taPpm, ch = conv.chPpm;
  if (ta < CLAMP.ta[0] || ta > CLAMP.ta[1]) {
    const target = 100;
    const direction = ta < target ? 'raise' : 'lower';
    /** @type {string[]} */
    const notes = [];
    const measure = buildMeasure({ param: 'ta', direction, current: ta, target, volumeM3, products, fill: null, taPpm: ta, notes });
    plan.push({ step: 'ta', direction, target, measure, notes });
    ta = target;
  }
  if (ch < CLAMP.ch[0] || ch > CLAMP.ch[1]) {
    const target = 250;
    const direction = ch < target ? 'raise' : 'lower';
    /** @type {string[]} */
    const notes = direction === 'lower' ? ['fill_water_is_source'] : [];
    const measure = direction === 'raise'
      ? buildMeasure({ param: 'ch', direction, current: ch, target, volumeM3, products, fill: null, taPpm: ta, notes })
      : null; // dilution cannot lower CH below the fill water's own CH (spec §4.7.3)
    plan.push({ step: 'ch', direction, target, measure, notes });
    if (direction === 'raise') ch = target;
  }
  plan.push({ step: 'outgas', direction: null, target: null, measure: null, notes: ['measure_after_outgassing'] });
  const phTarget = solveTarget('ph', { pH: phTap, tempC, chPpm: ch, taPpm: ta, cya: 0 });
  plan.push({ step: 'ph', direction: phTarget < phTap ? 'lower' : 'raise', target: round2(phTarget), measure: null, notes: [] });

  return { status: 'ok', missing: [], chPpm: round2(conv.chPpm), taPpm: round2(conv.taPpm), lsiFill, band: cls ? cls.band : null, equilibriumPh: eqPh, poorBuffering: conv.taPpm < 80, plan };
}

module.exports = {
  convertFillWater, equilibriumPh, DOSE, PH_MINUS_PRODUCTS, CHLORINE_EFFECTS, adviseBalance, adviseFillWater,
  // re-exported for Tasks 2-3 internal use and tests
  _internals: { DH_TO_PPM, KS43_TO_PPM, computeLSI, classifyLSI },
};
