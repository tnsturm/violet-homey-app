'use strict';

// Feature detection (pure) — spec §9; M2 §4
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Derives which optional features a pool exposes from the payload so device.js
// can reconcile capabilities (auto-detect + override). M0 wires only chlorine +
// OK temp channels; M2 consumes the rest (§9) with history-based actuator
// detection (§4) for monotonicity and churn-free capability tracking.

const { parseDurationToHours } = require('./FeatureGroups');

/**
 * @typedef {Object<string, *>} Features
 * Feature presence map from detectFeatures — M0 keys + M2:
 * {pump, eco, heater, solar, backwash, cover, light, refill, overflow,
 *  waterLevel, pvSurplus, diagnostics, chlorine, electrolysis,
 *  dosingChannels:string[], okTempChannels:number[]}. Index signature because
 * callers select groups dynamically (`features[group]`, checkJs strict M5 gate c).
 */

/**
 * Derive the set of present features from a raw payload (spec §9; M2 §4).
 * Actuators without a config flag use history-based detection (currently active
 * OR ever-ran) so the set is monotonic — capabilities are never auto-removed
 * (M2 §6). Dosing channels come from their authoritative `_USE` flag.
 * @param {import('./VioletClient').RawReadings} raw Parsed JSON from getReadings?ALL.
 * @returns {Features} Feature presence map (see typedef).
 */
function detectFeatures(raw) {
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

  const DOSING = /** @type {Object<string, string>} */ ({ cl: 'DOS_1_CL', elo: 'DOS_2_ELO', elorev: 'DOS_3_ELO_REV', phm: 'DOS_4_PHM', php: 'DOS_5_PHP', floc: 'DOS_6_FLOC' });
  const dosingChannels = Object.keys(DOSING).filter((ch) => raw[`${DOSING[ch]}_USE`] === '1');

  return {
    // M0 keys preserved:
    chlorine: raw.DOS_1_CL_USE === '1' || has('pot_value'),
    electrolysis: raw.DOS_2_ELO_USE === '1',
    pvSurplus: has('PVSURPLUS'),
    okTempChannels,
    // M2 keys:
    pump: has('PUMP'),
    eco: ran('ECO'),
    heater: ran('HEATER'),
    solar: ran('SOLAR'),
    backwash: ran('BACKWASH'),
    light: ran('LIGHT'),
    refill: ran('REFILL') || raw.REFILL_STATE === 'ON',
    cover: has('COVER_STATE') && String(raw.COVER_STATE) !== '',
    overflow: has('OVERFLOW_DRYRUN_STATE') || has('OVERFLOW_OVERFILL_STATE') || has('OVERFLOW_REFILL_STATE'),
    waterLevel: Number(raw.BATHING_AI_SYSTEM_BOOT) === 1,
    diagnostics: has('SYSTEM_cpu_temperature') || has('CPU_TEMP'),
    dosingChannels,
  };
}

module.exports = { detectFeatures };
