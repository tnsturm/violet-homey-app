'use strict';

// Capability mapping & per-poll update planning (pure) — spec §5, §7, §8, §9
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Translates normalized readings + detected features into the capability set the
// Pool device should expose and the values to write each poll. Fresh-gating of
// ph/orp/chlorine lives here (§7); device.js just applies the result.

// Feature key → custom capability id. M0 wires only chlorine; M2 extends this (§9).
const FEATURE_CAPABILITY = {
  chlorine: 'measure_chlorine',
};

/**
 * Sub-capability id for a temperature channel (spec §8).
 * @param {number} id 1-wire channel number.
 * @returns {string} e.g. `measure_temperature.ow3`.
 */
function channelSubCapId(id) {
  return `measure_temperature.ow${id}`;
}

/**
 * Pick the value for the primary water-temperature capability (spec §8).
 * With "auto"/unset, auto-selects iff exactly one OK channel exists; otherwise
 * matches the user-selected channel id. Returns null when undecidable.
 * @param {Array<{id: number, value: number}>} tempChannels OK channels.
 * @param {string|number|null} selectedChannel Setting value or "auto".
 * @returns {?number} Chosen temperature, or null.
 */
function choosePrimaryTemperature(tempChannels, selectedChannel) {
  if (selectedChannel === 'auto' || selectedChannel === null || selectedChannel === undefined) {
    return tempChannels.length === 1 ? tempChannels[0].value : null;
  }
  const match = tempChannels.find((c) => c.id === Number(selectedChannel));
  return match ? match.value : null;
}

/**
 * Resolve which feature capabilities should be present (spec §9).
 * Per feature: "force" always shows, "auto" shows iff detected, else hidden.
 * @param {{features: object, overrides: object}} args Detected features + per-group mode.
 * @returns {string[]} Capability ids that should be present.
 */
function desiredFeatureCapabilities({ features, overrides }) {
  const caps = [];
  for (const [feature, capId] of Object.entries(FEATURE_CAPABILITY)) {
    const mode = (overrides && overrides[feature]) || 'auto';
    const present = mode === 'force' || (mode === 'auto' && !!(features && features[feature]));
    if (present) caps.push(capId);
  }
  return caps;
}

/**
 * Build the per-poll capability→value map (spec §5, §7).
 * pump_running, measurements_fresh and temperature update every poll; ph/orp/
 * chlorine are included only when `fresh`, so still-water noise never overwrites
 * the last fresh value (§7).
 * @param {{parsed: object, fresh: boolean, primaryChannel: ?number}} args
 * @returns {Object<string, *>} Capability id → value (skip null/undefined when applying).
 */
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
