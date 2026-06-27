'use strict';

// Feature detection (pure) — spec §9
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Derives which optional features a pool exposes from the payload so device.js
// can reconcile capabilities (auto-detect + override). M0 wires only chlorine +
// OK temp channels; M2 consumes the rest (§9).

/**
 * Derive the set of present features from a raw payload (spec §9).
 * Chlorine counts as present when dosing is active (`DOS_1_CL_USE === '1'`) or a
 * potentiostat value is exposed (`pot_value`) (§5).
 * @param {object} raw Parsed JSON from getReadings?ALL.
 * @returns {{chlorine: boolean, electrolysis: boolean, heater: boolean,
 *   solar: boolean, light: boolean, cover: boolean, refill: boolean,
 *   pvSurplus: boolean, okTempChannels: number[]}} Feature presence map.
 */
function detectFeatures(raw) {
  const okTempChannels = [];
  for (let id = 1; id <= 12; id += 1) {
    if (raw[`onewire${id}_state`] === 'OK') okTempChannels.push(id);
  }
  const has = (key) => Object.prototype.hasOwnProperty.call(raw, key);
  return {
    chlorine: raw.DOS_1_CL_USE === '1' || has('pot_value'),
    electrolysis: raw.DOS_2_ELO_USE === '1',
    heater: has('HEATER'),
    solar: has('SOLAR'),
    light: has('LIGHT'),
    cover: has('COVER_STATE'),
    refill: has('REFILL'),
    pvSurplus: has('PVSURPLUS'),
    okTempChannels,
  };
}

module.exports = { detectFeatures };
