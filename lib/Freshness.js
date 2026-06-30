'use strict';

// Freshness decision (pure) — M1 spec §10 (docs/superpowers/specs/*.md).
// Probe values are trustworthy only after the pump has circulated water for a
// warmup period; still-water readings must not be treated as live chemistry.
// M1 derives freshness from the payload's PUMP_LAST_ON so it survives app
// restarts and tolerates a coherent controller clock (notes/2026-06-26-m1-inputs.md §1).

/**
 * Decide whether current readings reflect circulating water (M1 spec §10; M0 §7).
 * Derived from the payload's PUMP_LAST_ON so it survives app restarts and a
 * coherent controller clock avoids skew (notes/2026-06-26-m1-inputs.md §1).
 * @param {object}  args
 * @param {boolean} args.pumpOn        Pump currently running (PUMP === 1).
 * @param {?number} args.pumpLastOn    Unix s when the pump last turned on, or null.
 * @param {number}  args.now           Current time in unix seconds (controller clock).
 * @param {number}  args.warmupSeconds Continuous run time required before readings count as fresh.
 * @returns {boolean} True when readings are fresh.
 */
function isFresh({ pumpOn, pumpLastOn, now, warmupSeconds }) {
  if (!pumpOn || pumpLastOn === null || pumpLastOn === undefined) return false;
  return Math.max(0, now - pumpLastOn) >= warmupSeconds;
}

module.exports = { isFresh };
