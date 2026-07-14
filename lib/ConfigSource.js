'use strict';

// Config second-source (pure parse + one fetch) — M5.7 spec §2, §3
// (docs/superpowers/specs/2026-07-14-violet-homey-app-m5.7-config-autoconfig-design.md).
// Reads a targeted whitelist of getConfig keys (never ?ALL — SR-11) and normalizes
// them into ConfigFacts for FeatureDetector. Threat model: docs/superpowers/
// security/2026-07-14-m5.7-config-read-threat-model.md (SR-11…SR-16).

// The ONE whitelist (SR-11): every key/prefix this app ever requests from
// getConfig. Live-verified 2026-07-14: comma-multi-key + prefix queries work
// without Basic Auth; secret groups stay unrequested by construction (spec §1).
const CONFIG_QUERY = [
  'COVER_control_use', 'EXTENSION_1_use', 'EXTENSION_2_use',
  'SOLAR_control_use', 'HEATER_control_use', 'HEATER_pvsurplus_use',
  'PUMP_pvsurplus_use', 'BACKWASH_control_use', 'REFILL_control_use',
  'ANALOG_adc1_use', 'ANALOG_adc2_use', 'ANALOG_adc3_use', 'ANALOG_adc4_use', 'ANALOG_adc5_use', 'ANALOG_adc6_use',
  'ANALOG_adc1_units', 'ANALOG_adc2_units', 'ANALOG_adc3_units', 'ANALOG_adc4_units', 'ANALOG_adc5_units', 'ANALOG_adc6_units',
  'IMPULS_input1_use', 'IMPULS_input2_use', 'IMPULS_input1_units', 'IMPULS_input2_units',
  'NAMES_onewire', // Präfix — expandiert zu NAMES_onewire1..12 (Spec §1.1)
  'NAMES_adc',     // Präfix — expandiert zu NAMES_adc1..6
];

/**
 * @typedef {object} ConfigFacts
 * Normalized, whitelisted view of the controller configuration (spec §3).
 * Flag fields are null when the key was absent from the response (older
 * firmware) — consumers must treat null as "unknown", not "off".
 * @property {?boolean} coverControlUse
 * @property {?boolean} extension1Use
 * @property {?boolean} extension2Use
 * @property {?boolean} solarControlUse
 * @property {?boolean} heaterControlUse
 * @property {?boolean} heaterPvsurplusUse
 * @property {?boolean} pumpPvsurplusUse
 * @property {?boolean} backwashControlUse
 * @property {?boolean} refillControlUse
 * @property {Array<{id: number, use: boolean, units: string, name: string}>} adcChannels
 * @property {Array<{id: number, use: boolean, units: string}>} impulsChannels
 * @property {Object<string, string>} onewireNames Non-empty user labels by channel id.
 */

/**
 * Build the targeted getConfig URL for a host (SR-11: whitelist only, never ?ALL).
 * @param {string} host Hostname or IP of the Violet controller.
 * @returns {string} `http://<host>/getConfig?<key,key,…>`.
 */
function buildConfigUrl(host) {
  return `http://${host}/getConfig?${CONFIG_QUERY.join(',')}`;
}

// "1"/1/true → true; "0"/0/false → false; absent/other → null (spec §1.4 Mischtypen).
/** @param {*} v @returns {?boolean} */
function flag(v) {
  if (v === '1' || v === 1 || v === true) return true;
  if (v === '0' || v === 0 || v === false) return false;
  return null;
}

// User label or null: trims, drops '' and the '-' placeholder (spec §5).
/** @param {*} v @returns {?string} */
function label(v) {
  const s = String(v ?? '').trim();
  return s === '' || s === '-' ? null : s;
}

/**
 * Normalize a raw getConfig response into ConfigFacts (spec §3). Fail-soft
 * (SR-13): any non-object input yields all-null facts; non-whitelisted keys are
 * dropped (SR-12) — the return value is safe to persist in the device store.
 * @param {*} rawConfig Parsed JSON from the targeted getConfig query (untrusted).
 * @returns {ConfigFacts}
 */
function parseConfigFacts(rawConfig) {
  const raw = /** @type {Object<string, *>} */ (
    rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {}
  );
  const adcChannels = [];
  for (let id = 1; id <= 6; id += 1) {
    const use = flag(raw[`ANALOG_adc${id}_use`]);
    if (use === null) continue; // Kanal ohne _use-Key gilt als nicht gemeldet (Spec §3)
    adcChannels.push({
      id,
      use,
      units: String(raw[`ANALOG_adc${id}_units`] ?? ''),
      name: label(raw[`NAMES_adc${id}`]) ?? '',
    });
  }
  const impulsChannels = [];
  for (let id = 1; id <= 2; id += 1) {
    const use = flag(raw[`IMPULS_input${id}_use`]);
    if (use === null) continue;
    impulsChannels.push({ id, use, units: String(raw[`IMPULS_input${id}_units`] ?? '') });
  }
  /** @type {Object<string, string>} */
  const onewireNames = {};
  for (let id = 1; id <= 12; id += 1) {
    const name = label(raw[`NAMES_onewire${id}`]);
    if (name) onewireNames[String(id)] = name;
  }
  return {
    coverControlUse: flag(raw.COVER_control_use),
    extension1Use: flag(raw.EXTENSION_1_use),
    extension2Use: flag(raw.EXTENSION_2_use),
    solarControlUse: flag(raw.SOLAR_control_use),
    heaterControlUse: flag(raw.HEATER_control_use),
    heaterPvsurplusUse: flag(raw.HEATER_pvsurplus_use),
    pumpPvsurplusUse: flag(raw.PUMP_pvsurplus_use),
    backwashControlUse: flag(raw.BACKWASH_control_use),
    refillControlUse: flag(raw.REFILL_control_use),
    adcChannels,
    impulsChannels,
    onewireNames,
  };
}

/**
 * True when the facts carry no whitelisted signal at all (bare {date,time}
 * envelope): every flag is null and every channel/name list is empty. The
 * device treats such a response like a fetch failure — never persist it over
 * good facts (SR-13, T-M57-T1; spec §4 Fehlerpfade).
 * @param {ConfigFacts} facts
 * @returns {boolean}
 */
function factsEmpty(facts) {
  return facts.coverControlUse === null
    && facts.extension1Use === null
    && facts.extension2Use === null
    && facts.solarControlUse === null
    && facts.heaterControlUse === null
    && facts.heaterPvsurplusUse === null
    && facts.pumpPvsurplusUse === null
    && facts.backwashControlUse === null
    && facts.refillControlUse === null
    && facts.adcChannels.length === 0
    && facts.impulsChannels.length === 0
    && Object.keys(facts.onewireNames).length === 0;
}

const { basicAuthHeader } = require('./WriteClient');

// One GET against the whitelist URL; text-first so the live-verified plaintext
// "Access restricted, no Auth found" (non-JSON, spec §1.3) is detected without
// a JSON.parse crash. Returns {restricted, facts} — never the raw body upward.
/** @param {string} url @param {?string} authHeader @param {number} timeoutMs
 * @returns {Promise<{restricted: boolean, facts: ?ConfigFacts}>} */
async function configGet(url, authHeader, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      // Host-pinned like the write path: the (optional) auth header must never
      // follow a redirect to a rogue host (SR-08/SR-14).
      redirect: 'error',
      signal: controller.signal,
      ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
    });
    if (res.status === 401 || res.status === 403) return { restricted: true, facts: null };
    if (!res.ok) throw new Error(`Violet getConfig failed: HTTP ${res.status}`);
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Live-belegt: restricted-Antworten sind Klartext, kein JSON (SR-13).
      return { restricted: true, facts: null };
    }
    return { restricted: false, facts: parseConfigFacts(parsed) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch + parse the whitelisted config keys (spec §2). Default path is
 * credential-free (live-verified, spec §1.2); on a restricted signal (401/403
 * or plaintext body) it retries ONCE with Basic auth when credentials are
 * given (SR-14), else throws. Error messages never contain credentials or the
 * response body (SR-02/SR-12).
 * @param {string} host Paired controller host (SR-08: nothing else).
 * @param {{credentials?: ?{username: string, password: string}, timeoutMs?: number}} [opts]
 * @returns {Promise<ConfigFacts>}
 */
async function fetchConfigFacts(host, { credentials = null, timeoutMs = 10000 } = {}) {
  const url = buildConfigUrl(host);
  const first = await configGet(url, null, timeoutMs);
  if (!first.restricted && first.facts) return first.facts;
  if (credentials && credentials.password) {
    const second = await configGet(url, basicAuthHeader(credentials.username, credentials.password), timeoutMs);
    if (!second.restricted && second.facts) return second.facts;
  }
  throw new Error('Violet getConfig restricted (401/plaintext) — targeted keys not readable');
}

/**
 * Escalating, throttled failure-log gate for the config fetch path (SR-16;
 * violet-hass pattern: first failure warns, repeats at most every intervalMs,
 * recovery logs once). Pure state machine — caller supplies the clock and maps
 * 'first'/'repeat' → warn, 'recovered' → info, null → silence.
 * @param {number} [intervalMs] Minimum ms between repeat logs (default 5 min).
 * @returns {{failure(nowMs: number): ?('first'|'repeat'), success(nowMs: number): ?'recovered'}}
 */
function createConfigLogThrottle(intervalMs = 300000) {
  let failures = 0;
  let lastLogAt = 0;
  return {
    failure(nowMs) {
      failures += 1;
      if (failures === 1) { lastLogAt = nowMs; return 'first'; }
      if (nowMs - lastLogAt >= intervalMs) { lastLogAt = nowMs; return 'repeat'; }
      return null;
    },
    success(nowMs) {
      const hadFailures = failures > 0;
      failures = 0;
      lastLogAt = 0;
      return hadFailures ? 'recovered' : null;
    },
  };
}

module.exports = { CONFIG_QUERY, buildConfigUrl, parseConfigFacts, fetchConfigFacts, createConfigLogThrottle, factsEmpty };
