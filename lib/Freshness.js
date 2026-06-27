'use strict';

// Freshness decision (pure) — spec §7
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Probe values are trustworthy only after the pump has circulated water for a
// warmup period; still-water readings must not be treated as live chemistry.
// M0 gates on an in-memory rising edge (pumpOnSince); M1 will derive freshness
// from the payload's PUMP_LAST_ON instead — see notes/2026-06-26-m1-inputs.md §1.

/**
 * Decide whether current readings reflect circulating water (spec §7).
 * @param {object}  args
 * @param {boolean} args.pumpOn        Pump currently running (PUMP === 1).
 * @param {?number} args.pumpOnSince   Unix s of the current pump-on rising edge, or null.
 * @param {number}  args.now           Current time in unix seconds (controller clock).
 * @param {number}  args.warmupSeconds Continuous run time required before readings count as fresh.
 * @returns {boolean} True when readings are fresh.
 */
function isFresh({ pumpOn, pumpOnSince, now, warmupSeconds }) {
  if (!pumpOn || pumpOnSince === null || pumpOnSince === undefined) return false;
  return now - pumpOnSince >= warmupSeconds;
}

module.exports = { isFresh };
