'use strict';

// Feature detection (pure) — spec §9; M2 §4
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Derives which optional features a pool exposes from the payload so device.js
// can reconcile capabilities (auto-detect + override). M0 wires only chlorine +
// OK temp channels; M2 consumes the rest (§9) with history-based actuator
// detection (§4) for monotonicity and churn-free capability tracking. M5.7
// (docs/superpowers/specs/2026-07-14-violet-homey-app-m5.7-config-autoconfig-design.md
// §3/§6) adds an optional ConfigFacts second source per feature.

const { parseDurationToHours } = require('./FeatureGroups');

/**
 * @typedef {Object<string, *>} Features
 * Feature presence map from detectFeatures — M0 keys + M2:
 * {pump, eco, heater, solar, backwash, cover, light, refill, overflow,
 *  waterLevel, pvSurplus, diagnostics, chlorine, electrolysis,
 *  dosingChannels:string[], okTempChannels:number[],
 *  adcChannels:Array<{id:number, use:boolean, units:string, name:string}>,
 *  impulsChannels:Array<{id:number, use:boolean, units:string}>}. Index signature because
 * callers select groups dynamically (`features[group]`, checkJs strict M5 gate c).
 */

/**
 * Derive the set of present features from a raw payload plus optional config
 * facts (M0 spec §9; M2 §4; M5.7 spec §3 signal matrix). Without facts the
 * detection is exactly the historical heuristic (monotonic). With facts:
 * cover becomes config-authoritative in BOTH directions (the one deliberate
 * monotonicity break, M5.7 §6 — getReadings sends ghost COVER_STATE defaults);
 * solar/heater/backwash/refill gain positive-additive config signals only
 * ("Regelung aus" ≠ "ungenutzt", M5.7 §3).
 * @param {import('./VioletClient').RawReadings} raw Parsed JSON from getReadings?ALL.
 * @param {?import('./ConfigSource').ConfigFacts} [configFacts] Whitelisted config view, or null.
 * @returns {Features} Feature presence map (see typedef).
 */
function detectFeatures(raw, configFacts = null) {
  const okTempChannels = [];
  for (let id = 1; id <= 12; id += 1) {
    if (raw[`onewire${id}_state`] === 'OK') okTempChannels.push(id);
  }
  const has = (/** @type {string} */ key) => Object.prototype.hasOwnProperty.call(raw, key);
  // History-based actuator presence (M2 §4): active now, or non-zero runtime,
  // or a last-on timestamp > 0. Monotonic → churn-free.
  const ran = (/** @type {string} */ name) => Number(raw[name]) > 0
    || (parseDurationToHours(raw[`${name}_RUNTIME`]) || 0) > 0
    || Number(raw[`${name}_LAST_ON`]) > 0;
  const cf = configFacts;

  // Cover (M5.7 §3/§6): config-authoritative when the key is known. Positive
  // needs a relay extension unless both extension flags are unknown; negative
  // wins over the getReadings ghost default (the real-world false positive).
  const coverFallback = has('COVER_STATE') && String(raw.COVER_STATE) !== '';
  let cover = coverFallback;
  if (cf && cf.coverControlUse !== null) {
    const extKnownOff = cf.extension1Use === false && cf.extension2Use === false;
    cover = cf.coverControlUse === true && !extKnownOff;
  }

  const DOSING = /** @type {Object<string, string>} */ ({ cl: 'DOS_1_CL', elo: 'DOS_2_ELO', elorev: 'DOS_3_ELO_REV', phm: 'DOS_4_PHM', php: 'DOS_5_PHP', floc: 'DOS_6_FLOC' });
  const dosingChannels = Object.keys(DOSING).filter((ch) => raw[`${DOSING[ch]}_USE`] === '1');

  return {
    // M0 keys preserved:
    chlorine: raw.DOS_1_CL_USE === '1' || has('pot_value'),
    electrolysis: raw.DOS_2_ELO_USE === '1',
    pvSurplus: has('PVSURPLUS'),
    okTempChannels,
    // M2 keys (M5.7: config signals are positive-additive only, §3):
    pump: has('PUMP'),
    eco: ran('ECO'),
    heater: (cf ? cf.heaterControlUse === true || cf.heaterPvsurplusUse === true : false) || ran('HEATER'),
    solar: (cf ? cf.solarControlUse === true : false) || ran('SOLAR'),
    backwash: (cf ? cf.backwashControlUse === true : false) || ran('BACKWASH'),
    light: ran('LIGHT'),
    refill: (cf ? cf.refillControlUse === true : false) || ran('REFILL') || raw.REFILL_STATE === 'ON',
    cover,
    overflow: has('OVERFLOW_DRYRUN_STATE') || has('OVERFLOW_OVERFILL_STATE') || has('OVERFLOW_REFILL_STATE'),
    waterLevel: Number(raw.BATHING_AI_SYSTEM_BOOT) === 1,
    diagnostics: has('SYSTEM_cpu_temperature') || has('CPU_TEMP'),
    dosingChannels,
    // M5.7: informational channel lists for M5.8 (spec §3 last row).
    adcChannels: cf ? cf.adcChannels : [],
    impulsChannels: cf ? cf.impulsChannels : [],
  };
}

module.exports = { detectFeatures };
