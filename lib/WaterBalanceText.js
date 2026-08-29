'use strict';

// Localized advisor text rendering (pure) — M8.1 spec §5
// (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
// Turns the structured results of lib/WaterBalanceAdvisor.js (adviseBalance /
// adviseFillWater) into the strings the Flow tokens and the timeline
// notification carry: full advice, compact excerpt (<= 200 chars, spec §7.3),
// fill-water startup plan. Two template packs (en/de), no i18n framework —
// `lang` comes from homey.i18n.getLanguage(), anything but 'de' falls back to
// en. Pure and total like the advisor (spec §4.8): garbage or partial results
// yield a best-effort sentence, never a throw and never a leaked placeholder.

/** All user-visible strings, one flat pack per language. `{name}` = placeholder. */
const PACKS = /** @type {Object<string, Object<string, string>>} */ ({
  en: {
    // Levers (also the `top_driver` Flow token, spec §7.1) and LSI bands (M1 §5).
    lever_ph: 'pH',
    lever_ta: 'alkalinity',
    lever_ch: 'calcium hardness',
    band_severe_corrosive: 'strongly corrosive',
    band_corrosive: 'corrosive',
    band_balanced: 'balanced',
    band_scaling: 'scale-forming',
    band_severe_scaling: 'strongly scale-forming',
    // Chemicals — labeled concentrations are part of the contract (spec §4.2).
    chem_nahco3: 'baking soda (NaHCO₃)',
    chem_soda: 'soda ash',
    chem_cacl2: 'calcium chloride',
    chem_h2so4_15: 'sulfuric acid 14.9 %',
    chem_hcl_30: 'hydrochloric acid 30 %',
    chem_nahso4: 'dry acid (NaHSO₄)',
    chem_dilution: 'partial water exchange',
    // Missing-input names (adviseBalance + adviseFillWater `missing[]`).
    miss_pH: 'pH',
    miss_tempC: 'water temperature',
    miss_chPpm: 'calcium hardness',
    miss_taPpm: 'total alkalinity',
    miss_dhTotal: 'fill-water total hardness',
    miss_ks43: 'fill-water acid capacity K_S4.3',
    miss_phTap: 'fill-water pH',
    // Reasons the device wiring can add to `missing[]` (Task 6).
    reason_stale: 'The measurements are not fresh — the pump has to circulate long enough for a valid reading.',
    reason_lsi_disabled: 'The LSI calculation is switched off in the device settings.',
    // Note keys attached to drivers/plan steps (spec §4.4-§4.7).
    note_needs_volume: 'Enter the pool volume in the settings to get quantities.',
    note_fine_tuning: 'The levers below are optional fine-tuning — nothing has to be dosed.',
    note_violet_doses_ph: 'The Violet doses pH itself — adjust its pH target there instead of dosing by hand.',
    note_aeration_first: 'Aeration (fountain, bubbler) raises the pH for free.',
    note_measure_after_outgassing: 'Re-measure after 1–2 days of circulation — CO₂ outgasses and the pH rises on its own.',
    note_fill_water_is_source: 'The fill water itself is the source — lowering by dilution is not possible.',
    note_dilution: 'Lowering is only possible via a partial water exchange.',
    // Long-term side effects of the configured chlorine product (spec §4.3).
    cl_trichlor_drift: 'Trichlor steadily lowers pH and alkalinity and builds up cyanuric acid.',
    cl_calhypo_ch: 'Calcium hypochlorite raises calcium hardness with every dose.',
    cl_dichlor_cya: 'Dichlor builds up cyanuric acid (about 0.9 ppm per 1 ppm of chlorine).',
    // Sentences.
    verb_raise: 'raise',
    verb_lower: 'lower',
    lsi_now: 'LSI {lsi} ({band}).',
    driver_top: 'Biggest lever: {verb} {lever} from {from} to {to}{unit}{measure}.',
    driver_more: 'Further lever: {verb} {lever} from {from} to {to}{unit}{measure}.',
    measure_clause: ' — about {amount} {unit} {chem}',
    measure_dilution: ' — partial water exchange of about {amount} %',
    predicted: 'Expected LSI afterwards ≈ {lsi}.',
    balanced_ok: 'The water balance is fine — no action needed.',
    poor_buffering: 'Total alkalinity is below 80 ppm — the pH swings strongly; raise alkalinity first.',
    incomplete_list: 'No recommendation possible yet — missing: {list}.',
    incomplete_generic: 'No recommendation possible yet — measurements are missing.',
    excerpt_dose: 'Biggest lever: {lever}{measure}.',
    excerpt_target: 'Biggest lever: {verb} {lever} to {to}{unit}.',
    fill_summary: 'Fill water: total alkalinity about {ta} ppm, calcium hardness about {ch} ppm, LSI {lsi} ({band}).',
    fill_summary_nolsi: 'Fill water: total alkalinity about {ta} ppm, calcium hardness about {ch} ppm.',
    fill_step: '{n}. {verb} {lever} from {from} to {to} ppm{measure}.',
    fill_step_no_from: '{n}. {verb} {lever} to {to} ppm{measure}.',
    fill_outgas: '{n}. Circulate for 1–2 days until the CO₂ has outgassed — the pH rises to about {eqph} on its own.',
    fill_outgas_plain: '{n}. Circulate for 1–2 days until the CO₂ has outgassed.',
    fill_ph: '{n}. Then set the pH to {to}.',
    fill_incomplete_list: 'Fill-water analysis not possible — missing: {list}.',
    fill_incomplete_generic: 'Fill-water analysis not possible — the waterworks values are missing.',
  },
  de: {
    lever_ph: 'pH-Wert',
    lever_ta: 'Alkalität',
    lever_ch: 'Calciumhärte',
    band_severe_corrosive: 'stark korrosiv',
    band_corrosive: 'korrosiv',
    band_balanced: 'ausgeglichen',
    band_scaling: 'kalkabscheidend',
    band_severe_scaling: 'stark kalkabscheidend',
    chem_nahco3: 'Natron (NaHCO₃)',
    chem_soda: 'Soda (Na₂CO₃)',
    chem_cacl2: 'Calciumchlorid',
    chem_h2so4_15: 'Schwefelsäure 14,9 %',
    chem_hcl_30: 'Salzsäure 30 %',
    chem_nahso4: 'pH-Minus-Granulat',
    chem_dilution: 'Teilwasserwechsel',
    miss_pH: 'pH-Wert',
    miss_tempC: 'Wassertemperatur',
    miss_chPpm: 'Calciumhärte',
    miss_taPpm: 'Alkalität',
    miss_dhTotal: 'Gesamthärte des Füllwassers',
    miss_ks43: 'Säurekapazität K_S4,3 des Füllwassers',
    miss_phTap: 'pH-Wert des Füllwassers',
    reason_stale: 'Die Messwerte sind nicht aktuell — die Pumpe muss lange genug umwälzen, damit gültig gemessen wird.',
    reason_lsi_disabled: 'Die LSI-Berechnung ist in den Einstellungen ausgeschaltet.',
    note_needs_volume: 'Für Mengenangaben bitte das Beckenvolumen in den Einstellungen eintragen.',
    note_fine_tuning: 'Die folgenden Hebel sind nur eine optionale Feinabstimmung — dosiert werden muss nichts.',
    note_violet_doses_ph: 'Den pH-Wert dosiert die Violet selbst — dort den pH-Sollwert anpassen statt von Hand zu dosieren.',
    note_aeration_first: 'Belüftung (Sprudler, Wasserspiel) hebt den pH-Wert kostenlos an.',
    note_measure_after_outgassing: 'Erst nach 1–2 Tagen Umwälzung nachmessen — CO₂ gast aus und der pH-Wert steigt dabei von selbst.',
    note_fill_water_is_source: 'Das Füllwasser selbst ist die Quelle — Absenken durch Verdünnen ist nicht möglich.',
    note_dilution: 'Absenken ist nur über einen Teilwasserwechsel möglich.',
    cl_trichlor_drift: 'Trichlor senkt pH-Wert und Alkalität dauerhaft und reichert Cyanursäure an.',
    cl_calhypo_ch: 'Calciumhypochlorit erhöht mit jeder Dosierung die Calciumhärte.',
    cl_dichlor_cya: 'Dichlor reichert Cyanursäure an (ca. 0,9 ppm je 1 ppm Chlor).',
    verb_raise: 'anheben',
    verb_lower: 'senken',
    lsi_now: 'LSI {lsi} ({band}).',
    driver_top: 'Größter Hebel: {lever} von {from} auf {to}{unit} {verb}{measure}.',
    driver_more: 'Weiterer Hebel: {lever} von {from} auf {to}{unit} {verb}{measure}.',
    measure_clause: ' — ca. {amount} {unit} {chem}',
    measure_dilution: ' — Teilwasserwechsel von ca. {amount} %',
    predicted: 'Danach voraussichtlich LSI ≈ {lsi}.',
    balanced_ok: 'Die Wasserbalance ist in Ordnung — keine Maßnahme nötig.',
    poor_buffering: 'Die Alkalität liegt unter 80 ppm — der pH-Wert schwankt dadurch stark; zuerst die Alkalität anheben.',
    incomplete_list: 'Noch keine Empfehlung möglich — es fehlen: {list}.',
    incomplete_generic: 'Noch keine Empfehlung möglich — es fehlen Messwerte.',
    excerpt_dose: 'Größter Hebel: {lever}{measure}.',
    excerpt_target: 'Größter Hebel: {lever} auf {to}{unit} {verb}.',
    fill_summary: 'Füllwasser: Alkalität ca. {ta} ppm, Calciumhärte ca. {ch} ppm, LSI {lsi} ({band}).',
    fill_summary_nolsi: 'Füllwasser: Alkalität ca. {ta} ppm, Calciumhärte ca. {ch} ppm.',
    fill_step: '{n}. {lever} von {from} auf {to} ppm {verb}{measure}.',
    fill_step_no_from: '{n}. {lever} auf {to} ppm {verb}{measure}.',
    fill_outgas: '{n}. 1–2 Tage umwälzen lassen, bis das CO₂ ausgegast ist — der pH-Wert steigt dabei von selbst auf ca. {eqph}.',
    fill_outgas_plain: '{n}. 1–2 Tage umwälzen lassen, bis das CO₂ ausgegast ist.',
    fill_ph: '{n}. Danach den pH-Wert auf {to} einstellen.',
    fill_incomplete_list: 'Füllwasser-Analyse nicht möglich — es fehlen: {list}.',
    fill_incomplete_generic: 'Füllwasser-Analyse nicht möglich — es fehlen Werte aus der Trinkwasseranalyse.',
  },
});

const EXCERPT_MAX = 200; // spec §7.3 — timeline excerpt stays short
const ALLOWED_UNITS = ['g', 'mL', '%'];

/** @param {*} v @returns {boolean} */
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {*} v @returns {*[]} */
const arr = (v) => (Array.isArray(v) ? v : []);
/** @param {*} v @returns {*} */
const obj = (v) => (v && typeof v === 'object' ? v : {});

/**
 * Pick the template pack; anything but 'de' falls back to en (spec §5).
 * @param {*} lang Language code from homey.i18n.getLanguage().
 * @returns {Object<string, string>} The template pack.
 */
function pack(lang) { return lang === 'de' ? PACKS.de : PACKS.en; }

/**
 * Fill `{name}` placeholders; unknown or non-string values render as empty so
 * a partial result can never leak "undefined"/"NaN" into user-visible text.
 * @param {string} template
 * @param {Object<string, string>} vars
 * @returns {string}
 */
function tpl(template, vars) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = vars[key];
    return typeof v === 'string' ? v : '';
  });
}

/**
 * Format a number for the language: de uses comma decimals, en dot; trailing
 * zeros are dropped (7.60 → "7,6", 120 → "120").
 * @param {*} v
 * @param {*} lang
 * @param {number} [decimals] Maximum decimals (default 0).
 * @returns {string} Empty string when v is not a finite number.
 */
function fmtNum(v, lang, decimals = 0) {
  if (!fin(v)) return '';
  let s = v.toFixed(decimals);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  if (s === '-0') s = '0';
  return lang === 'de' ? s.replace('.', ',') : s;
}

/**
 * Format an LSI value with an explicit sign and 2 decimals ("+0,63" / "-0.47").
 * @param {*} v
 * @param {*} lang
 * @returns {string} Empty string when v is not a finite number.
 */
function fmtLsi(v, lang) {
  if (!fin(v)) return '';
  const r = Math.round(v * 100) / 100;
  const s = `${r < 0 ? '-' : '+'}${Math.abs(r).toFixed(2)}`;
  return lang === 'de' ? s.replace('.', ',') : s;
}

/**
 * Localized name of a chemical lever — also the `top_driver` Flow token (§7.1).
 * @param {*} param One of 'ph', 'ta', 'ch'.
 * @param {*} lang 'de' or 'en' (fallback).
 * @returns {string} Localized lever name; '' for an unknown lever.
 */
function leverName(param, lang) {
  const P = pack(lang);
  return typeof param === 'string' ? (P[`lever_${param}`] || '') : '';
}

/** @param {*} band @param {Object<string,string>} P @returns {string} */
function bandName(band, P) {
  return typeof band === 'string' ? (P[`band_${band}`] || '') : '';
}

/** Levers are ppm-based except pH, which is unitless. @param {*} param @returns {string} */
function leverUnit(param) { return param === 'ph' ? '' : ' ppm'; }

/** pH needs 2 decimals, ppm values none. @param {*} param @returns {number} */
function leverDecimals(param) { return param === 'ph' ? 2 : 0; }

/**
 * Render the " — about 5880 g baking soda" clause of a measure, or '' when the
 * amount is unknown (missing pool volume, spec §4.4.4) or the measure is junk.
 * @param {*} measure @param {Object<string,string>} P @param {*} lang @returns {string}
 */
function measureClause(measure, P, lang) {
  const m = obj(measure);
  const amount = obj(m.amount);
  if (!fin(amount.value)) return '';
  const unit = typeof amount.unit === 'string' ? amount.unit : '';
  if (!ALLOWED_UNITS.includes(unit)) return '';
  if (m.chemical === 'dilution' || unit === '%') {
    return tpl(P.measure_dilution, { amount: fmtNum(amount.value, lang, 0) });
  }
  const chem = typeof m.chemical === 'string' ? P[`chem_${m.chemical}`] : '';
  if (!chem) return '';
  return tpl(P.measure_clause, { amount: fmtNum(amount.value, lang, 0), unit, chem });
}

/**
 * Render note keys once each (they repeat across levers), skipping unknown keys.
 * The `dilution` note is suppressed when the measure already states the
 * exchange percentage — otherwise the same fact is said twice.
 * @param {*} notes @param {*} measure @param {Object<string,string>} P @param {Set<string>} seen
 * @returns {string[]}
 */
function noteSentences(notes, measure, P, seen) {
  /** @type {string[]} */
  const out = [];
  const hasPct = obj(obj(measure).amount).unit === '%';
  for (const key of arr(notes)) {
    if (typeof key !== 'string' || seen.has(key)) continue;
    if (key === 'dilution' && hasPct) continue;
    const text = P[`note_${key}`];
    if (!text) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/**
 * Incomplete-status sentences: reason keys ('stale', 'lsi_disabled') get their
 * own sentence, value keys are collected into one localized list (spec §4.4.6).
 * @param {*} missing @param {Object<string,string>} P @param {'balance'|'fill'} kind
 * @returns {string[]}
 */
function incompleteSentences(missing, P, kind) {
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const names = [];
  for (const key of arr(missing)) {
    if (typeof key !== 'string') continue;
    const reason = P[`reason_${key}`];
    if (reason) { if (!reasons.includes(reason)) reasons.push(reason); continue; }
    const name = P[`miss_${key}`];
    if (name && !names.includes(name)) names.push(name);
  }
  const listTpl = kind === 'fill' ? P.fill_incomplete_list : P.incomplete_list;
  const genericTpl = kind === 'fill' ? P.fill_incomplete_generic : P.incomplete_generic;
  if (names.length) return [tpl(listTpl, { list: names.join(', ') }), ...reasons];
  if (reasons.length) return reasons;
  return [genericTpl];
}

/** @param {string[]} parts @returns {string} */
function join(parts) {
  return parts.filter((p) => typeof p === 'string' && p.trim() !== '').join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Capitalize the first word after a step number — the en templates start with
 * the verb ("1. raise alkalinity…"), the de ones with an already-capitalized noun.
 * @param {string} s @returns {string}
 */
function capAfterNumber(s) {
  return s.replace(/^(\d+\.\s*)(\p{Ll})/u, (_m, prefix, first) => `${prefix}${first.toUpperCase()}`);
}

/**
 * Drop a dangling high surrogate left by a code-unit cut — it would re-encode
 * as U+FFFD downstream. Exported (review R2-1): NotifyServer's SUBJECT cap
 * shares this guard instead of keeping its own copy.
 * @param {string} s @returns {string}
 */
function stripTrailingHighSurrogate(s) {
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xD800 && last <= 0xDBFF ? s.slice(0, -1) : s;
}

/**
 * Hard-cap a string, ending it with an ellipsis. Never splits a surrogate pair.
 * @param {string} s @param {number} max @returns {string}
 */
function clip(s, max) {
  if (s.length <= max) return s;
  const cut = stripTrailingHighSurrogate(s.slice(0, max - 1));
  return `${cut.trimEnd()}…`;
}

/**
 * Full advice text for the `advice_text` Flow token (spec §7.1): current LSI +
 * band, the ranked levers with their quantified measures and notes, product
 * side effects, and the predicted LSI — always hedged with "≈", because the
 * pH-shift estimate is an approximation capped at ±0.5 pH per step (§4.5).
 * Balanced water (no levers at all, or levers flagged `fine_tuning` by the
 * advisor) leads with the all-clear and lists targets without any amounts.
 * @param {*} result Result of adviseBalance (or anything — total).
 * @param {*} lang 'de' or 'en' (fallback).
 * @returns {string} Non-empty, single-paragraph advice text.
 */
function renderAdvice(result, lang) {
  const P = pack(lang);
  const r = obj(result);
  const drivers = arr(r.drivers).filter((d) => obj(d).param === 'ph' || obj(d).param === 'ta' || obj(d).param === 'ch');
  if (r.status !== 'ok' || !fin(r.lsiNow)) return join(incompleteSentences(r.missing, P, 'balance'));

  /** @type {string[]} */
  const parts = [tpl(P.lsi_now, { lsi: fmtLsi(r.lsiNow, lang), band: bandName(r.band, P) })];
  /** @type {Set<string>} */
  const seen = new Set();
  // Balanced water (advisor severity 'ok') carries the `fine_tuning` flag on
  // every lever and no measures: lead with the all-clear, then frame the levers
  // as optional — never a dose behind a "no action needed" (review Finding 2).
  const fineTuning = drivers.some((d) => arr(obj(d).notes).includes('fine_tuning'));
  if (!drivers.length || fineTuning) parts.push(P.balanced_ok);
  if (fineTuning) { parts.push(P.note_fine_tuning); seen.add('fine_tuning'); }
  drivers.forEach((driver, i) => {
    const d = obj(driver);
    const dec = leverDecimals(d.param);
    parts.push(tpl(i === 0 ? P.driver_top : P.driver_more, {
      lever: leverName(d.param, lang),
      verb: P[`verb_${d.direction === 'lower' ? 'lower' : 'raise'}`],
      from: fmtNum(d.current, lang, dec),
      to: fmtNum(d.target, lang, dec),
      unit: leverUnit(d.param),
      measure: measureClause(d.measure, P, lang),
    }));
    parts.push(...noteSentences(d.notes, d.measure, P, seen));
  });
  if (obj(r.co2).poorBuffering === true) parts.push(P.poor_buffering);
  if (typeof r.chlorineNote === 'string' && P[`cl_${r.chlorineNote}`]) parts.push(P[`cl_${r.chlorineNote}`]);
  if (drivers.length && fin(r.predictedLsi)) parts.push(tpl(P.predicted, { lsi: fmtLsi(r.predictedLsi, lang) }));
  return join(parts);
}

/**
 * Compact timeline excerpt (spec §7.3): band + top lever + the one amount,
 * hard-capped at 200 characters so Homey's notification never truncates it.
 * @param {*} result Result of adviseBalance (or anything — total).
 * @param {*} lang 'de' or 'en' (fallback).
 * @returns {string} Non-empty excerpt, <= 200 characters.
 */
function renderExcerpt(result, lang) {
  const P = pack(lang);
  const r = obj(result);
  if (r.status !== 'ok' || !fin(r.lsiNow)) return clip(join(incompleteSentences(r.missing, P, 'balance')), EXCERPT_MAX);

  const parts = [tpl(P.lsi_now, { lsi: fmtLsi(r.lsiNow, lang), band: bandName(r.band, P) })];
  const d = obj(arr(r.drivers).find((x) => obj(x).param === 'ph' || obj(x).param === 'ta' || obj(x).param === 'ch'));
  if (!d.param) {
    parts.push(P.balanced_ok);
  } else {
    const measure = measureClause(d.measure, P, lang);
    parts.push(measure
      ? tpl(P.excerpt_dose, { lever: leverName(d.param, lang), measure })
      : tpl(P.excerpt_target, {
        lever: leverName(d.param, lang),
        verb: P[`verb_${d.direction === 'lower' ? 'lower' : 'raise'}`],
        to: fmtNum(d.target, lang, leverDecimals(d.param)),
        unit: leverUnit(d.param),
      }));
  }
  return clip(join(parts), EXCERPT_MAX);
}

/**
 * Fill-water startup plan for the `fill_advice_text` Flow token (spec §7.2):
 * the tap water's own values and LSI, then the numbered steps in the fixed
 * order TA → CH → CO₂ outgassing → pH (spec §4.7.3), including the equilibrium
 * pH the water drifts to on its own.
 * @param {*} result Result of adviseFillWater (or anything — total).
 * @param {*} lang 'de' or 'en' (fallback).
 * @returns {string} Non-empty startup-plan text.
 */
function renderFillPlan(result, lang) {
  const P = pack(lang);
  const r = obj(result);
  /** @type {string[]} */
  const parts = [];
  if (r.status === 'ok' && fin(r.taPpm) && fin(r.chPpm)) {
    const vars = { ta: fmtNum(r.taPpm, lang, 0), ch: fmtNum(r.chPpm, lang, 0), lsi: fmtLsi(r.lsiFill, lang), band: bandName(r.band, P) };
    parts.push(fin(r.lsiFill) ? tpl(P.fill_summary, vars) : tpl(P.fill_summary_nolsi, vars));
  }
  /** @type {Set<string>} */
  const seen = new Set();
  let n = 0;
  for (const step of arr(r.plan)) {
    const s = obj(step);
    const num = String(n + 1);
    if (s.step === 'outgas') {
      const eqph = fmtNum(r.equilibriumPh, lang, 2);
      parts.push(eqph ? tpl(P.fill_outgas, { n: num, eqph }) : tpl(P.fill_outgas_plain, { n: num }));
      n += 1;
      continue;
    }
    if (!fin(s.target)) continue;
    if (s.step === 'ph') {
      parts.push(tpl(P.fill_ph, { n: num, to: fmtNum(s.target, lang, 2) }));
      n += 1;
      continue;
    }
    if (s.step !== 'ta' && s.step !== 'ch') continue;
    const from = fmtNum(s.step === 'ta' ? r.taPpm : r.chPpm, lang, 0);
    parts.push(capAfterNumber(tpl(from ? P.fill_step : P.fill_step_no_from, {
      n: num,
      lever: leverName(s.step, lang),
      verb: P[`verb_${s.direction === 'lower' ? 'lower' : 'raise'}`],
      from,
      to: fmtNum(s.target, lang, 0),
      measure: measureClause(s.measure, P, lang),
    })));
    parts.push(...noteSentences(s.notes, s.measure, P, seen));
    n += 1;
  }
  if (!parts.length) return join(incompleteSentences(r.missing, P, 'fill'));
  if (r.poorBuffering === true) parts.push(P.poor_buffering);
  return join(parts);
}

module.exports = {
  renderAdvice, renderExcerpt, renderFillPlan, leverName, stripTrailingHighSurrogate,
};
