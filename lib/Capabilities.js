'use strict';

const FEATURE_CAPABILITY = {
  chlorine: 'measure_chlorine',
};

function channelSubCapId(id) {
  return `measure_temperature.ow${id}`;
}

function choosePrimaryTemperature(tempChannels, selectedChannel) {
  if (selectedChannel === 'auto' || selectedChannel === null || selectedChannel === undefined) {
    return tempChannels.length === 1 ? tempChannels[0].value : null;
  }
  const match = tempChannels.find((c) => c.id === Number(selectedChannel));
  return match ? match.value : null;
}

function desiredFeatureCapabilities({ features, overrides }) {
  const caps = [];
  for (const [feature, capId] of Object.entries(FEATURE_CAPABILITY)) {
    const mode = (overrides && overrides[feature]) || 'auto';
    const present = mode === 'force' || (mode === 'auto' && !!(features && features[feature]));
    if (present) caps.push(capId);
  }
  return caps;
}

function buildCapabilityUpdates({ parsed, fresh, primaryChannel }) {
  const updates = {
    pump_running: parsed.pumpOn,
    measurements_fresh: fresh,
    measure_temperature: primaryChannel,
  };
  for (const ch of parsed.tempChannels) {
    updates[channelSubCapId(ch.id)] = ch.value;
  }
  if (fresh) {
    updates.measure_ph = parsed.ph;
    updates.measure_orp = parsed.orp;
    if (parsed.chlorine !== null) updates.measure_chlorine = parsed.chlorine;
  }
  return updates;
}

module.exports = {
  FEATURE_CAPABILITY,
  channelSubCapId,
  choosePrimaryTemperature,
  desiredFeatureCapabilities,
  buildCapabilityUpdates,
};
