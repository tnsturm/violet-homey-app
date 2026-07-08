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
 * Build the per-poll capability→value map (spec M0 §5, §7; clear-on-stale:
 * 2026-06-27-m0-clear-stale-measurements-design.md §3).
 * pump_running, measurements_fresh and temperature update every poll. ph/orp/
 * chlorine carry their fresh value while `fresh`; while stale they are set to
 * `null` so the GUI shows "–" and Insights records a gap instead of holding the
 * last fresh value as a flat line (§3).
 * @param {{parsed: object, fresh: boolean, primaryChannel: ?number, lsi?: number|null, alarm?: boolean|null}} args
 *   `lsi`/`alarm` may be omitted (checkJs, M4.5): the `??` fallbacks below make
 *   omission equivalent to null/false — callers without the LSI feature skip them.
 * @returns {Object<string, *>} Capability id → value. Apply rule (in device.js):
 *   `undefined` = leave as-is, `null` = clear to empty, else set.
 */
function buildCapabilityUpdates({ parsed, fresh, primaryChannel, lsi, alarm }) {
  const updates = {
    pump_running: parsed.pumpOn,
    measurements_fresh: fresh,
    measure_temperature: primaryChannel,
    // LSI (M1 §6,§9): number when enabled+fresh+inputs complete, else null
    // (cleared to "–"/Insights gap). Capability may be absent (lsi_enabled off)
    // — device.js skips absent caps. `?? null` keeps a valid 0.
    measure_lsi: lsi ?? null,
    // Water-balance alarm (M1 §7.3): boolean, true when the LSI is outside the
    // balanced band. Absent when lsi_enabled off (device.js skips absent caps).
    alarm_water_balance: alarm ?? false,
  };
  for (const ch of parsed.tempChannels) {
    updates[channelSubCapId(ch.id)] = ch.value;
  }
  if (fresh) {
    updates.measure_ph = parsed.ph;
    updates.measure_orp = parsed.orp;
    if (parsed.chlorine !== null) updates.measure_chlorine = parsed.chlorine;
  } else {
    // Stale: clear probes so the GUI shows "–" and Insights gaps instead of
    // carrying the last fresh value forward (clear-stale §3; M0 §7).
    updates.measure_ph = null;
    updates.measure_orp = null;
    updates.measure_chlorine = null;
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
