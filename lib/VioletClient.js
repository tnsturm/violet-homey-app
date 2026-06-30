'use strict';

// Violet HTTP read client (pure parse + one fetch) — spec §4, §11
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Builds the read URL, fetches getReadings?ALL, and normalizes the raw payload
// into the shape device.js consumes. The read path is credential-free (§13).

/**
 * Build the credential-free read URL for a host (spec §1, §13).
 * @param {string} host Hostname or IP of the Violet controller.
 * @returns {string} `http://<host>/getReadings?ALL`.
 */
function buildReadingsUrl(host) {
  return `http://${host}/getReadings?ALL`;
}

// Coerce a Violet field (string or number) to a finite number, else null.
function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a raw getReadings payload into the core M0 reading set (spec §5).
 * Only `onewireN` channels reporting state "OK" become temperature channels (§8);
 * `chlorine` is null when the controller omits `pot_value` (§5).
 * @param {object} raw Parsed JSON from getReadings?ALL.
 * @returns {{ph: ?number, orp: ?number, chlorine: ?number, pumpOn: boolean,
 *   tempChannels: Array<{id: number, value: number, state: string}>,
 *   timeUnix: ?number, pumpLastOn: ?number, raw: object}} Normalized readings.
 */
function parseReadings(raw) {
  const tempChannels = [];
  for (let id = 1; id <= 12; id += 1) {
    const state = raw[`onewire${id}_state`];
    const value = num(raw[`onewire${id}_value`]);
    if (state === 'OK' && value !== null) {
      tempChannels.push({ id, value, state });
    }
  }
  return {
    ph: num(raw.pH_value),
    orp: num(raw.orp_value),
    chlorine: raw.pot_value === undefined ? null : num(raw.pot_value),
    pumpOn: Number(raw.PUMP) === 1,
    tempChannels,
    timeUnix: num(raw.CURRENT_TIME_UNIX),
    pumpLastOn: num(raw.PUMP_LAST_ON),
    raw,
  };
}

/**
 * Fetch and JSON-parse getReadings?ALL with a hard timeout (spec §10).
 * Aborts after `timeoutMs` and throws on non-OK HTTP, so the caller's failure
 * counter can drive setUnavailable after 3 consecutive failures (§10).
 * @param {string} host Hostname or IP of the Violet controller.
 * @param {{timeoutMs?: number}} [opts] Options; `timeoutMs` default 10000.
 * @returns {Promise<object>} Parsed JSON payload.
 */
async function fetchReadings(host, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildReadingsUrl(host), { signal: controller.signal });
    if (!res.ok) throw new Error(`Violet HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { buildReadingsUrl, parseReadings, fetchReadings };
