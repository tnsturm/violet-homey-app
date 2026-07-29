'use strict';

// Advisor math tests — M8.1 spec §4 (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  convertFillWater, equilibriumPh, PH_MINUS_PRODUCTS, DOSE, CHLORINE_EFFECTS, adviseBalance, adviseFillWater,
} = require('../lib/WaterBalanceAdvisor');
const { computeLSI } = require('../lib/Lsi');

test('convertFillWater: 14 °dH / KS4.3 2.5 / 75% Ca → CH 187.4, TA 125.1 (spec §4.1)', () => {
  const r = convertFillWater({ dhTotal: 14, ks43: 2.5, caFractionPct: 75 });
  assert.ok(r);
  assert.ok(Math.abs(r.chPpm - 14 * 17.848 * 0.75) < 0.01); // 187.40
  assert.ok(Math.abs(r.taPpm - 2.5 * 50.04) < 0.01);        // 125.10
});

test('convertFillWater: missing/garbage inputs → null, never throws (spec §4.8)', () => {
  assert.equal(convertFillWater({ dhTotal: null, ks43: 2.5, caFractionPct: 75 }), null);
  assert.equal(convertFillWater({ dhTotal: 14, ks43: NaN, caFractionPct: 75 }), null);
  assert.equal(convertFillWater({}), null);
});

test('convertFillWater: caFractionPct clamped to [50,100]', () => {
  const lo = convertFillWater({ dhTotal: 10, ks43: 2, caFractionPct: 10 });
  const hi = convertFillWater({ dhTotal: 10, ks43: 2, caFractionPct: 150 });
  assert.ok(lo && Math.abs(lo.chPpm - 10 * 17.848 * 0.5) < 0.01);
  assert.ok(hi && Math.abs(hi.chPpm - 10 * 17.848 * 1.0) < 0.01);
});

test('equilibriumPh: TA 100 caps at 8.4; TA 50 ≈ 8.19; TA 200 caps; null-safe (spec §4.6)', () => {
  assert.equal(equilibriumPh(100), 8.4); // raw ≈8.5 → cap
  const t50 = equilibriumPh(50);
  assert.ok(t50 !== null && Math.abs(t50 - (6.35 + Math.log10((50 / 50044) / 1.43e-5))) < 0.005); // ≈8.19
  assert.equal(equilibriumPh(200), 8.4);
  assert.equal(equilibriumPh(0), null);
  assert.equal(equilibriumPh(NaN), null);
});

test('dose tables match spec §4.2 exactly', () => {
  assert.equal(DOSE.taUpGPerM3Per10, 16.8);
  assert.equal(DOSE.chUpGPerM3Per10, 14.7);
  assert.equal(DOSE.sodaGPerM3Per10Ta, 10.6);
  assert.equal(PH_MINUS_PRODUCTS.h2so4_15.mlPerM3Per10Ta, 60);
  assert.equal(PH_MINUS_PRODUCTS.hcl_30.mlPerM3Per10Ta, 21);
  assert.equal(PH_MINUS_PRODUCTS.nahso4.gPerM3Per10Ta, 24);
});

test('chlorine side-effect matrix (spec §4.3)', () => {
  assert.equal(CHLORINE_EFFECTS.calhypo.chPerFc, 0.7);
  assert.equal(CHLORINE_EFFECTS.dichlor.cyaPerFc, 0.9);
  assert.equal(CHLORINE_EFFECTS.trichlor.cyaPerFc, 0.6);
  assert.equal(CHLORINE_EFFECTS.trichlor.ph, 'down');
  assert.deepEqual(CHLORINE_EFFECTS.none, {});
});

const BASE = { volumeM3: 50, products: { phMinus: 'h2so4_15', chlorine: 'naocl' }, dosingCtx: { violetDosesPh: false }, fill: null };

test('adviseBalance: low TA is the clear driver; amount uses 16.8 g/m³ per 10 ppm (spec §4.4)', () => {
  // pH 7.4, 26°C, CH 250 ok, TA 40 low → LSI clearly negative, TA lever dominates.
  const r = adviseBalance({ ...BASE, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 40, cya: 0 });
  assert.equal(r.status, 'ok');
  assert.ok(r.lsiNow !== null && r.lsiNow < -0.3);
  assert.equal(r.drivers[0].param, 'ta');
  assert.equal(r.drivers[0].direction, 'raise');
  assert.ok(r.drivers[0].target >= 80 && r.drivers[0].target <= 120);
  const grams = r.drivers[0].measure.amount.value;
  const expected = 16.8 * 50 * (r.drivers[0].target - 40) / 10;
  assert.ok(Math.abs(grams - expected) <= 10); // rounded to 10 g
  assert.equal(r.drivers[0].measure.amount.unit, 'g');
  assert.equal(r.drivers[0].measure.chemical, 'nahco3');
  // Ranking invariant: drivers are sorted by |deltaLsi| descending.
  for (let i = 1; i < r.drivers.length; i++) {
    assert.ok(Math.abs(r.drivers[i - 1].deltaLsi) >= Math.abs(r.drivers[i].deltaLsi));
  }
});

test('adviseBalance: high pH driver → acid measure in mL for h2so4_15 (spec §4.2)', () => {
  const r = adviseBalance({ ...BASE, pH: 8.2, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  assert.equal(r.status, 'ok');
  assert.equal(r.drivers[0].param, 'ph');
  assert.equal(r.drivers[0].direction, 'lower');
  assert.equal(r.drivers[0].measure.amount.unit, 'mL');
  assert.ok(r.drivers[0].measure.amount.value > 0);
});

test('adviseBalance: pH acid dose, pH target and predicted LSI describe ONE state (spec §4.5)', () => {
  // Review Finding 1: target was solved at constant TA, the dose came from the
  // §4.5 buffer model and predictedLsi from a third state. All three must now
  // agree — the acid dose is exactly the TA drop implied by the pH target, and
  // computeLSI on that (pH, TA) pair is the predicted value.
  const r = adviseBalance({ ...BASE, pH: 8.0, tempC: 28, chPpm: 300, taPpm: 110, cya: 0 });
  const ph = r.drivers[0];
  assert.equal(ph.param, 'ph');
  assert.equal(ph.direction, 'lower');
  // TA drop implied by the rendered pH target via the §4.5 buffer model.
  const taAfter = 110 * Math.pow(10, ph.target - 8.0);
  const mL = ph.measure.amount.value;
  const expected = 60 * 50 * (110 - taAfter) / 10; // h2so4_15: 60 mL/m³ per 10 ppm TA
  // Tolerance covers only the two roundings: pH target to 2 decimals (≈0.6 ppm
  // TA ⇒ ≈190 mL) and the dose to 10 mL — not a second, different model.
  assert.ok(Math.abs(mL - expected) <= 250, `dose ${mL} mL must match the target's TA drop (${expected})`);
  // predictedLsi is computeLSI on that same coupled state, not on a TA-constant one.
  const check = computeLSI({ pH: ph.target, tempC: 28, calciumHardnessPpm: 300, totalAlkalinityPpm: taAfter, cya: 0 });
  assert.ok(check !== null && Math.abs(/** @type {number} */ (r.predictedLsi) - check) <= 0.01);
  assert.equal(r.predictedLsi, ph.lsiAfter);
  assert.ok(Math.abs(/** @type {number} */ (r.predictedLsi)) < 0.05, `coupled solve must land at LSI 0, got ${r.predictedLsi}`);
});

test('adviseBalance: predictedLsi comes from computeLSI on the adjusted state (spec §3 invariant)', () => {
  const r = adviseBalance({ ...BASE, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 40, cya: 0 });
  const check = computeLSI({ pH: 7.4, tempC: 26, calciumHardnessPpm: 250, totalAlkalinityPpm: r.drivers[0].target, cya: 0 });
  assert.equal(r.drivers[0].param, 'ta'); // the TA lever moves TA only — no coupling
  assert.equal(r.predictedLsi, check);
  assert.equal(r.predictedLsi, r.drivers[0].lsiAfter); // top lever's own post-state
  assert.ok(r.predictedLsi !== null && r.lsiNow !== null && Math.abs(r.predictedLsi) < Math.abs(r.lsiNow)); // strictly closer to 0
});

test('adviseBalance: no recommendation overshoots into the opposite band (review regression, spec §4.4/§4.5)', () => {
  // Every driver's post-state LSI — and the predicted LSI the text quotes —
  // must stay on the side of 0 the water started on. The pre-fix advisor sent
  // pH 8.0 / TA 110 / CH 300 / 28 °C from +0.55 to −0.69 (severe_corrosive).
  const grid = [
    { pH: 8.0, tempC: 28, chPpm: 300, taPpm: 110 },
    { pH: 7.8, tempC: 28, chPpm: 300, taPpm: 110 },
    { pH: 8.2, tempC: 26, chPpm: 250, taPpm: 100 },
    { pH: 6.9, tempC: 20, chPpm: 150, taPpm: 40 },
  ];
  for (const s of grid) {
    for (const fill of [null, { chPpm: 150, taPpm: 60 }]) {
      const r = adviseBalance({ ...BASE, fill, ...s, cya: 0 });
      assert.equal(r.status, 'ok');
      const scaling = /** @type {number} */ (r.lsiNow) > 0;
      const seen = [.../** @type {Array<*>} */ (r.drivers).map((d) => d.lsiAfter), r.predictedLsi];
      for (const lsi of seen) {
        assert.ok(typeof lsi === 'number' && Number.isFinite(lsi), 'every post-state LSI is a number');
        if (scaling) assert.ok(lsi >= -0.3, `scaling water ${JSON.stringify(s)} must not be pushed to LSI ${lsi}`);
        else assert.ok(lsi <= 0.5, `corrosive water ${JSON.stringify(s)} must not be pushed to LSI ${lsi}`);
      }
    }
  }
});

test('adviseBalance: clamps hold — extreme water clamps targets to band edges (spec §4.4)', () => {
  const r = adviseBalance({ ...BASE, pH: 6.5, tempC: 10, chPpm: 60, taPpm: 30, cya: 0 });
  for (const d of r.drivers) {
    if (d.param === 'ph') assert.ok(d.target >= 7.0 && d.target <= 7.6);
    if (d.param === 'ta') assert.ok(d.target >= 80 && d.target <= 120);
    if (d.param === 'ch') assert.ok(d.target >= 200 && d.target <= 400);
  }
});

test('adviseBalance: LSI ≈ 0 → no drivers at all, status ok (spec §4.4)', () => {
  // pH 7.55, 26 °C, CH 250, TA 100 sits at LSI -0.02 — every lever's achievable
  // gain is below DRIVER_MIN_DELTA, so the list is empty unconditionally.
  const r = adviseBalance({ ...BASE, pH: 7.55, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  assert.equal(r.status, 'ok');
  assert.ok(r.lsiNow !== null && Math.abs(r.lsiNow) < 0.05, `fixture must be near zero, got ${r.lsiNow}`);
  assert.equal(r.drivers.length, 0);
  assert.equal(r.predictedLsi, r.lsiNow);
});

test('adviseBalance: balanced band keeps informational levers but strips every dose (spec §5)', () => {
  // Review Finding 2: LSI +0.23 is classified 'ok', yet the old advisor still
  // attached litres of acid to it. Targets stay (informational), doses do not.
  const r = adviseBalance({ ...BASE, pH: 7.8, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  assert.equal(r.band, 'balanced');
  assert.ok(r.lsiNow !== null && Math.abs(r.lsiNow) > 0.05);
  assert.ok(r.drivers.length > 0, 'the levers stay visible');
  for (const d of r.drivers) {
    assert.equal(d.measure, null, `${d.param} must carry no dose in the balanced band`);
    assert.ok(d.notes.includes('fine_tuning'));
    assert.ok(Number.isFinite(d.target));
  }
});

test('adviseBalance: volumeM3 null → amounts null + needs_volume note (spec §4.4.4)', () => {
  const r = adviseBalance({ ...BASE, volumeM3: null, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 50, cya: 0 });
  assert.equal(r.drivers[0].measure.amount, null);
  assert.ok(r.drivers[0].notes.includes('needs_volume'));
});

test('adviseBalance: violetDosesPh annotates the pH lever and suppresses its dose (spec §4.3(2), §8)', () => {
  const r = adviseBalance({ ...BASE, dosingCtx: { violetDosesPh: true }, pH: 8.2, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  const ph = r.drivers.find((d) => d.param === 'ph');
  assert.ok(ph && ph.handledByViolet === true && ph.notes.includes('violet_doses_ph'));
  assert.equal(ph.measure, null, 'no hand-dosing amount next to "the Violet doses pH itself"');
  assert.ok(Number.isFinite(ph.target), 'the pH target is still stated');
  // Only the pH lever is suppressed — TA/CH still carry their amounts.
  const ta = r.drivers.find((d) => d.param === 'ta');
  assert.ok(ta && ta.measure && ta.measure.amount.value > 0);
});

test('adviseBalance: aeration listed when pH < equilibrium − 0.3 and pH needs raising (spec §4.6)', () => {
  const r = adviseBalance({ ...BASE, pH: 6.9, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  assert.equal(r.co2.aerationRecommended, true);
  const ph = r.drivers.find((d) => d.param === 'ph');
  assert.ok(ph && ph.notes.includes('aeration_first'));
});

test('adviseBalance: TA lowering with fill water configured → dilution measure in % (spec §4.7)', () => {
  // pH 7.8 (not 7.5) so the water is genuinely scale-forming — inside the
  // balanced band the advisor deliberately shows no measures at all (§5).
  const r = adviseBalance({ ...BASE, products: { phMinus: 'none', chlorine: 'naocl' }, fill: { chPpm: 100, taPpm: 60 }, pH: 7.8, tempC: 26, chPpm: 250, taPpm: 240, cya: 0 });
  const ta = r.drivers.find((d) => d.param === 'ta');
  assert.ok(ta && ta.direction === 'lower');
  assert.equal(ta.measure.chemical, 'dilution');
  assert.equal(ta.measure.amount.unit, '%');
  // mix: target = 240(1-x) + 60x → x = (240-target)/(240-60)
  const x = Math.round(((240 - ta.target) / (240 - 60)) * 100);
  assert.ok(Math.abs(ta.measure.amount.value - x) <= 1);
});

test('adviseBalance: fill water itself over target → fill_water_is_source honesty note (spec §4.7)', () => {
  const r = adviseBalance({ ...BASE, fill: { chPpm: 450, taPpm: 100 }, pH: 7.8, tempC: 26, chPpm: 500, taPpm: 100, cya: 0 });
  const ch = r.drivers.find((d) => d.param === 'ch');
  assert.ok(ch, 'the CH lever must be part of this fixture');
  assert.ok(ch.notes.includes('fill_water_is_source'));
  assert.equal(ch.measure, null, 'no dilution amount when the fill water is the source');
});

test('adviseBalance: trichlor product → chlorineNote trichlor_drift (spec §4.3)', () => {
  const r = adviseBalance({ ...BASE, products: { phMinus: 'nahso4', chlorine: 'trichlor' }, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 90, cya: 40 });
  assert.equal(r.chlorineNote, 'trichlor_drift');
});

test('adviseBalance: missing inputs → status incomplete with missing[] list, no throw (spec §4.8)', () => {
  const r = adviseBalance({ ...BASE, pH: null, tempC: 26, chPpm: null, taPpm: 100, cya: 0 });
  assert.equal(r.status, 'incomplete');
  assert.deepEqual(r.missing.sort(), ['chPpm', 'pH']);
  assert.equal(r.lsiNow, null);
  assert.deepEqual(r.drivers, []);
});

const FILLBASE = { caFractionPct: 75, tempC: 26, volumeM3: 50, products: { phMinus: 'h2so4_15', chlorine: 'naocl' } };

test('adviseFillWater: real-world sheet 14°dH / 2.5 mmol/L / pH 7.5 → converted values + LSI + plan (spec §4.7)', () => {
  const r = adviseFillWater({ ...FILLBASE, dhTotal: 14, ks43: 2.5, phTap: 7.5 });
  assert.equal(r.status, 'ok');
  assert.ok(r.chPpm !== null && r.taPpm !== null && Math.abs(r.chPpm - 187.4) < 0.1 && Math.abs(r.taPpm - 125.1) < 0.1);
  const check = computeLSI({ pH: 7.5, tempC: 26, calciumHardnessPpm: r.chPpm, totalAlkalinityPpm: r.taPpm, cya: 0 });
  assert.equal(r.lsiFill, check);
  // TA 125 slightly above 120 and CH 187 below 200 → plan contains ta(lower), ch(raise), outgas, ph.
  assert.deepEqual(r.plan.map((s) => s.step), ['ta', 'ch', 'outgas', 'ph']);
});

test('adviseFillWater: soft low-alkalinity water → poorBuffering + ta raise first with NaHCO3 amount (spec §4.6/4.7)', () => {
  const r = adviseFillWater({ ...FILLBASE, dhTotal: 6, ks43: 1.0, phTap: 7.8 });
  assert.equal(r.poorBuffering, true); // TA 50 < 80
  assert.equal(r.plan[0].step, 'ta');
  assert.equal(r.plan[0].direction, 'raise');
  assert.ok(r.plan[0].measure !== null);
  assert.equal(r.plan[0].measure.chemical, 'nahco3');
  const expected = 16.8 * 50 * (r.plan[0].target - 50.04) / 10;
  assert.ok(r.plan[0].measure.amount !== null && Math.abs(r.plan[0].measure.amount.value - expected) <= 10);
});

test('adviseFillWater: outgas step always precedes ph step; ph target solved on ADJUSTED water (spec §4.7.3)', () => {
  const r = adviseFillWater({ ...FILLBASE, dhTotal: 14, ks43: 2.5, phTap: 7.5 });
  const steps = r.plan.map((s) => s.step);
  assert.ok(steps.indexOf('outgas') < steps.indexOf('ph'));
  const ph = r.plan[steps.indexOf('ph')];
  assert.ok(ph.target !== null && ph.target >= 7.0 && ph.target <= 7.6);
});

test('adviseFillWater: in-range water → plan only outgas + ph (no ta/ch steps)', () => {
  // 10 °dH ×17.848×0.75 = 133.9 CH → below 200 → ch present; use caFraction 100 & 15°dH: 267.7 CH in range, KS 2.0 → TA 100 in range.
  const r = adviseFillWater({ ...FILLBASE, caFractionPct: 100, dhTotal: 15, ks43: 2.0, phTap: 7.6 });
  assert.deepEqual(r.plan.map((s) => s.step), ['outgas', 'ph']);
});

test('adviseFillWater: tempC missing → documented default 25 °C used (spec §4.7.1)', () => {
  const r = adviseFillWater({ ...FILLBASE, tempC: null, dhTotal: 14, ks43: 2.5, phTap: 7.5 });
  assert.ok(r.chPpm !== null && r.taPpm !== null);
  const check = computeLSI({ pH: 7.5, tempC: 25, calciumHardnessPpm: r.chPpm, totalAlkalinityPpm: r.taPpm, cya: 0 });
  assert.equal(r.lsiFill, check);
});

test('adviseFillWater: missing sheet values → incomplete with missing[], no throw (spec §4.8)', () => {
  const r = adviseFillWater({ ...FILLBASE, dhTotal: null, ks43: null, phTap: 7.5 });
  assert.equal(r.status, 'incomplete');
  assert.deepEqual(r.missing.sort(), ['dhTotal', 'ks43']);
  assert.deepEqual(r.plan, []);
});
