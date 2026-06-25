'use strict';

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
