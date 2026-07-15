'use strict';

// Feature-group registry & pure parsers (pure) — spec §3, §4, §5, §9
// (docs/superpowers/specs/2026-07-01-violet-homey-app-m2-full-reads-design.md).
// Turns raw getReadings fields into the M2 capability set + per-poll values.
// Detection lives in FeatureDetector; this module owns value derivation and the
// declarative registry so device.js stays thin (spec §3).

// Violet dosing field prefixes per channel key (Global Constraints).
const DOSING_PREFIX = /** @type {Object<string, string>} */ ({
  cl: 'DOS_1_CL', elo: 'DOS_2_ELO', elorev: 'DOS_3_ELO_REV',
  phm: 'DOS_4_PHM', php: 'DOS_5_PHP', floc: 'DOS_6_FLOC',
});

/**
 * Field prefix for a dosing channel key (spec §5).
 * @param {string} ch Channel key (cl|elo|elorev|phm|php|floc).
 * @returns {?string} Violet field prefix (e.g. DOS_1_CL), or undefined for an unknown key.
 */
function dosingChannelPrefix(ch) {
  return DOSING_PREFIX[ch];
}

/**
 * Parse a Violet runtime string "Hh Mm Ss" to fractional hours (spec §5, §9).
 * @param {*} str e.g. "19h 23m 23s" (coerced via String(); raw fields may be non-string).
 * @returns {?number} Hours rounded to 2 dp, or null if unparseable.
 */
function parseDurationToHours(str) {
  const m = /^\s*(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*s\s*$/.exec(String(str ?? ''));
  if (!m) return null;
  const hours = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  return Math.round(hours * 100) / 100;
}

/**
 * Parse a Violet range string ("37d"/"6w"/"2m"/"33h"/">99d") to days
 * (M2 spec §5, §9; M5.8 spec §5 — h-Suffix und ">"-Präfix live belegt).
 * @param {*} str e.g. "33h" (coerced via String(); raw fields may be non-string).
 * @returns {?number} Days (w=×7, m=×30, h=÷24 auf 2 Nachkommastellen), or null if unparseable.
 */
function parseRangeToDays(str) {
  const m = /^\s*>?\s*(\d+(?:\.\d+)?)\s*([dwmh])\s*$/i.exec(String(str ?? ''));
  if (!m) return null;
  const unit = m[2].toLowerCase();
  if (unit === 'h') return Math.round((Number(m[1]) / 24) * 100) / 100;
  const mult = (/** @type {Object<string, number>} */ ({ d: 1, w: 7, m: 30 }))[unit];
  return Number(m[1]) * mult;
}

/**
 * True when a Violet on/off status string is "ON" (spec §9).
 * @param {*} v Raw field value.
 * @returns {boolean}
 */
function stateIsActive(v) {
  return String(v ?? '').toUpperCase() === 'ON';
}

/**
 * Fehl-/Blockiergründe eines Violet-*STATE-Felds (M5.8 spec §5). Zwei live
 * belegte Formate: Fault-Queue-Array (["GRUND", …]) und Pipe-String
 * "<wert>|<grund>[|<grund>…]" (z. B. SOLARSTATE="0|BLOCKED_BY_SENSOR_FAULT").
 * Skalare ohne Pipe ("0", "OK", Zahlen) tragen keine Gründe.
 * @param {*} v Raw field value.
 * @returns {string[]} Gründe (ggf. leer).
 */
function stateReasons(v) {
  if (Array.isArray(v)) return v.map((x) => String(x));
  const s = String(v ?? '');
  if (!s.includes('|')) return [];
  return s.split('|').slice(1).filter((r) => r !== '');
}

/**
 * True when a *STATE field carries a real block (M5.8 spec §5): nur das
 * live/forum-belegte Vokabular BLOCKED_BY_* zählt; CL_DOSING_CONTROLLER,
 * MANUAL_*, TRESHOLDS_REACHED* sind Normalbetrieb (M4.7-todo-Test-Fix).
 * @param {*} v Raw field value.
 * @returns {boolean}
 */
function stateBlocked(v) {
  return stateReasons(v).some((r) => r.startsWith('BLOCKED_BY_'));
}

// Coerce to finite number or null (mirrors VioletClient.num for M2 fields).
/** @param {*} v @returns {?number} */
function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

// Active pump speed stage from the one-hot PUMP_RPM_0..3 (0 = off) (spec §5).
/** @param {import('./VioletClient').RawReadings} raw @returns {number} */
function pumpSpeedStage(raw) {
  for (let i = 0; i <= 3; i += 1) if (Number(raw[`PUMP_RPM_${i}`]) === 1) return i;
  return 0;
}

// COVER_STATE string → enum id, or undefined when unknown (device skips) (spec §9).
/** @param {*} v @returns {string|undefined} */
function coverState(v) {
  const s = String(v ?? '').toUpperCase();
  if (s === 'OPEN') return 'open';
  if (s === 'CLOSED') return 'closed';
  if (s.includes('STOP')) return 'stopped';
  if (s.includes('MOV') || s.includes('OPENING') || s.includes('CLOSING')) return 'moving';
  return undefined;
}

// Per-channel dosing sub-capability bases (spec §5).
const DOSING_SUBCAPS = ['measure_dosing_days_left', 'measure_dosing_daily_ml', 'dosing_active', 'alarm_dosing_blocked', 'alarm_dosing_low'];

// Feature group → {capIds it contributes, defaultMode} (spec §4). `dosing` and
// `diagnostics` are handled specially (per-channel / gated) below.
const M2_GROUPS = {
  pump: { defaultMode: 'force', capIds: ['pump_speed_stage', 'runtime_pump'] },
  eco: { defaultMode: 'auto', capIds: ['eco_active'] },
  heater: { defaultMode: 'auto', capIds: ['heater_active', 'runtime_heater'] },
  solar: { defaultMode: 'auto', capIds: ['solar_active', 'runtime_solar'] },
  backwash: { defaultMode: 'auto', capIds: ['backwash_active', 'alarm_omni_valve'] },
  cover: { defaultMode: 'auto', capIds: ['cover_state'] },
  light: { defaultMode: 'auto', capIds: ['light_on'] },
  refill: { defaultMode: 'auto', capIds: ['refill_active'] },
  overflow: { defaultMode: 'auto', capIds: ['alarm_overflow_dryrun', 'alarm_overflow_overfill', 'overflow_refill_active'] },
  waterLevel: { defaultMode: 'auto', capIds: ['measure_water_level'] },
  pv: { defaultMode: 'auto', capIds: ['pv_surplus_active'] },
};

const DIAGNOSTIC_CAPS = ['measure_system_cpu_temperature', 'measure_system_memory', 'system_uptime', 'last_error_id', 'controller_firmware'];

// M5.8 (Spec §3): Basen der Messeingangs-Sub-Caps — device.js nimmt sie in die
// Managed-Base-Menge auf, damit Remove-Reconcile sie nie übersieht.
const INPUT_SUBCAPS = ['measure_adc', 'measure_impulse'];

/**
 * Resolve which M2 capabilities should be present (spec §4, §6).
 * Per group: force → always; auto → iff detected; hide → never. Dosing expands
 * to per-channel sub-cap instances; diagnostics are gated by `diagnosticsEnabled`.
 * `features.pvSurplus` maps the `pv` group. `overrides.inputs` (M5.8 spec §3)
 * gates `measure_adc.<id>`/`measure_impulse.<id>`: auto = use=1-Kanäle, force =
 * alle gemeldeten Kanäle, hide = keine.
 * @param {{features: import('./FeatureDetector').Features, overrides?: Object<string, *>, diagnosticsEnabled?: boolean}} args
 * @returns {string[]} Capability ids (incl. `<base>.<ch>` instances).
 */
function desiredM2Capabilities({ features, overrides = {}, diagnosticsEnabled = false }) {
  const caps = [];
  const detectedOf = (/** @type {string} */ g) => (g === 'pv' ? !!features.pvSurplus : !!features[g]);
  for (const [g, def] of Object.entries(M2_GROUPS)) {
    const mode = overrides[g] || def.defaultMode;
    const present = mode === 'force' || (mode === 'auto' && detectedOf(g));
    if (present) caps.push(...def.capIds);
  }
  // Dosing: per detected channel (mode via overrides.dosing, default auto).
  const dosingMode = overrides.dosing || 'auto';
  if (dosingMode !== 'hide') {
    for (const ch of (features.dosingChannels || [])) {
      for (const base of DOSING_SUBCAPS) caps.push(`${base}.${ch}`);
    }
  }
  // Messeingänge (M5.8 Spec §3): auto = use=1-Kanäle (Config-autoritativ in
  // beide Richtungen, wie Cover M5.7 §6); force = alle gemeldeten Kanäle
  // (bewusste User-Entscheidung inkl. Müllwerten); hide = keine.
  const inputsMode = overrides.inputs || 'auto';
  if (inputsMode !== 'hide') {
    for (const ch of (features.adcChannels || [])) {
      if (inputsMode === 'force' || ch.use) caps.push(`measure_adc.${ch.id}`);
    }
    for (const ch of (features.impulsChannels || [])) {
      if (inputsMode === 'force' || ch.use) caps.push(`measure_impulse.${ch.id}`);
    }
  }
  // Diagnostics: only when explicitly enabled AND present.
  if (diagnosticsEnabled && features.diagnostics) caps.push(...DIAGNOSTIC_CAPS);
  return caps;
}

/**
 * Build the per-poll M2 capability→value map (spec §5, §6, §7).
 * Status/actuator/consumable caps update every poll (NOT fresh-gated). Absent or
 * unknown values omit the key so device.js leaves the capability untouched.
 * @param {import('./VioletClient').RawReadings} raw Parsed getReadings payload.
 * @param {{dosingChannels?: string[], dosingLowThresholdDays?: number}} [opts]
 *   Both props have defaults (checkJs, M4.5) — the JSDoc mirrors the destructuring.
 * @returns {Object<string, *>} capId (incl. `<base>.<ch>` sub-ids) → value.
 */
function buildM2Updates(raw, { dosingChannels = [], dosingLowThresholdDays = 7 } = {}) {
  const u = /** @type {Object<string, *>} */ ({});
  const put = (/** @type {string} */ cap, /** @type {*} */ val) => { if (val !== undefined && val !== null) u[cap] = val; };

  // Pump & circulation / energy
  if (raw.PUMP !== undefined) put('pump_speed_stage', pumpSpeedStage(raw));
  if (raw.ECO !== undefined) put('eco_active', Number(raw.ECO) > 0);
  put('runtime_pump', parseDurationToHours(raw.PUMP_RUNTIME) ?? undefined);
  // Heating
  if (raw.HEATER !== undefined) put('heater_active', Number(raw.HEATER) > 0);
  put('runtime_heater', parseDurationToHours(raw.HEATER_RUNTIME) ?? undefined);
  if (raw.SOLAR !== undefined) put('solar_active', Number(raw.SOLAR) > 0);
  put('runtime_solar', parseDurationToHours(raw.SOLAR_RUNTIME) ?? undefined);
  // Backwash
  if (raw.BACKWASH !== undefined) put('backwash_active', Number(raw.BACKWASH) > 0);
  if (raw.BACKWASH_OMNI_STATE !== undefined) put('alarm_omni_valve', raw.BACKWASH_OMNI_STATE !== 'OK');
  // Cover / light / refill
  put('cover_state', coverState(raw.COVER_STATE));
  if (raw.LIGHT !== undefined) put('light_on', Number(raw.LIGHT) > 0);
  if (raw.REFILL_STATE !== undefined) put('refill_active', stateIsActive(raw.REFILL_STATE));
  // Overflow
  if (raw.OVERFLOW_DRYRUN_STATE !== undefined) put('alarm_overflow_dryrun', stateIsActive(raw.OVERFLOW_DRYRUN_STATE));
  if (raw.OVERFLOW_OVERFILL_STATE !== undefined) put('alarm_overflow_overfill', stateIsActive(raw.OVERFLOW_OVERFILL_STATE));
  if (raw.OVERFLOW_REFILL_STATE !== undefined) put('overflow_refill_active', stateIsActive(raw.OVERFLOW_REFILL_STATE));
  // Water level / PV
  put('measure_water_level', num(raw.BATHING_AI_LAST_LEVEL) ?? undefined);
  if (raw.PVSURPLUS !== undefined) put('pv_surplus_active', Number(raw.PVSURPLUS) > 0);
  // Diagnostics (present only when the group is enabled; device gates addition)
  put('measure_system_cpu_temperature', num(raw.SYSTEM_cpu_temperature ?? raw.CPU_TEMP) ?? undefined);
  put('measure_system_memory', num(raw.MEMORY_USED) ?? undefined);
  put('system_uptime', raw.CPU_UPTIME !== undefined ? String(raw.CPU_UPTIME) : undefined);
  put('last_error_id', num(raw.last_error_id) ?? undefined);
  if (raw.SW_VERSION !== undefined) {
    put('controller_firmware', raw.SW_VERSION_CARRIER ? `${raw.SW_VERSION} / ${raw.SW_VERSION_CARRIER}` : String(raw.SW_VERSION));
  }
  // Messeingänge (M5.8 Spec §3): rohe Kanalwerte; welche Kacheln existieren,
  // entscheidet der Reconcile (use-Gating) — device.js setzt nur vorhandene Caps.
  for (let id = 1; id <= 6; id += 1) {
    const v = num(raw[`ADC${id}_value`]);
    if (v !== null) u[`measure_adc.${id}`] = v;
  }
  for (let id = 1; id <= 2; id += 1) {
    const v = num(raw[`IMP${id}_value`]);
    if (v !== null) u[`measure_impulse.${id}`] = v;
  }
  // Dosing per active channel
  for (const ch of dosingChannels) {
    const p = DOSING_PREFIX[ch];
    if (!p) continue;
    const days = parseRangeToDays(raw[`${p}_REMAINING_RANGE`]);
    if (days !== null) {
      u[`measure_dosing_days_left.${ch}`] = days;
      u[`alarm_dosing_low.${ch}`] = days <= dosingLowThresholdDays;
    }
    const ml = num(raw[`${p}_DAILY_DOSING_AMOUNT_ML`]);
    if (ml !== null) u[`measure_dosing_daily_ml.${ch}`] = ml;
    if (raw[p] !== undefined) u[`dosing_active.${ch}`] = Number(raw[p]) > 0;
    if (raw[`${p}_STATE`] !== undefined) u[`alarm_dosing_blocked.${ch}`] = stateBlocked(raw[`${p}_STATE`]);
  }
  return u;
}

// Diagnostics: capability id → the exact getReadings field that drives it, so the
// "Show Advanced diagnostics" mode can append the raw source value to a tile's
// title for error-finding (2026-07-05). Only opaque state/switch/alarm tiles are
// mapped — live measurements already show their raw number and re-titling them
// every poll would churn the heavy setCapabilityOptions API. Simple caps map to a
// single field; dosing sub-caps (`<base>.<ch>`) map to a suffix on DOSING_PREFIX.
const DIAG_SIMPLE = /** @type {Object<string, string>} */ ({
  pump_running: 'PUMP',
  heater_active: 'HEATER',
  solar_active: 'SOLAR',
  eco_active: 'ECO',
  backwash_active: 'BACKWASH',
  alarm_omni_valve: 'BACKWASH_OMNI_STATE',
  cover_state: 'COVER_STATE',
  light_on: 'LIGHT',
  refill_active: 'REFILL_STATE',
  overflow_refill_active: 'OVERFLOW_REFILL_STATE',
  alarm_overflow_dryrun: 'OVERFLOW_DRYRUN_STATE',
  alarm_overflow_overfill: 'OVERFLOW_OVERFILL_STATE',
  pv_surplus_active: 'PVSURPLUS',
});
const DIAG_DOSING = /** @type {Object<string, string>} */ ({
  dosing_active: '',
  alarm_dosing_blocked: '_STATE',
  alarm_dosing_low: '_REMAINING_RANGE',
  measure_dosing_days_left: '_REMAINING_RANGE',
  measure_dosing_daily_ml: '_DAILY_DOSING_AMOUNT_ML',
});

// M5.8 (Spec §6): Aktoren, deren *STATE-Feld Blockier-/Fehlgründe trägt — die
// Diagnose-Annotation hängt sie an den Rohwert an (nur Anzeige, kein Alarm:
// SOLARSTATE steht auf der Referenz dauerhaft auf BLOCKED_BY_SENSOR_FAULT).
const DIAG_STATE = /** @type {Object<string, string>} */ ({
  pump_running: 'PUMPSTATE',
  heater_active: 'HEATERSTATE',
  solar_active: 'SOLARSTATE',
});

/**
 * Whether a capability has a mapped raw source for the diagnostics annotation.
 * Guards device.js against re-titling capabilities it shouldn't touch (2026-07-05).
 * @param {string} capId Capability id, e.g. `cover_state` or `alarm_dosing_blocked.cl`.
 * @returns {boolean}
 */
function diagAnnotatable(capId) {
  const dot = capId.indexOf('.');
  const base = dot > 0 ? capId.slice(0, dot) : capId;
  return (dot > 0 && Object.prototype.hasOwnProperty.call(DIAG_DOSING, base))
    || Object.prototype.hasOwnProperty.call(DIAG_SIMPLE, base);
}

/**
 * The exact raw getReadings value behind a capability, as a short display string,
 * for the diagnostics tile-title annotation (2026-07-05). Returns null when the
 * capability has no mapped source or the field is absent (tile left unannotated).
 * @param {string} capId Capability id, e.g. `alarm_dosing_blocked.cl` or `cover_state`.
 * @param {import('./VioletClient').RawReadings} raw Parsed getReadings payload.
 * @returns {?string} e.g. `[CL_DOSING_CONTROLLER]`, `1`, `OPEN`, or null.
 */
function diagRawValue(capId, raw) {
  const dot = capId.indexOf('.');
  const base = dot > 0 ? capId.slice(0, dot) : capId;
  const ch = dot > 0 ? capId.slice(dot + 1) : null;
  let val;
  if (ch && Object.prototype.hasOwnProperty.call(DIAG_DOSING, base)) {
    const prefix = DOSING_PREFIX[ch];
    if (!prefix) return null;
    val = raw[`${prefix}${DIAG_DOSING[base]}`];
  } else if (Object.prototype.hasOwnProperty.call(DIAG_SIMPLE, base)) {
    val = raw[DIAG_SIMPLE[base]];
  } else {
    return null;
  }
  if (val === undefined || val === null) return null;
  let out = Array.isArray(val) ? `[${val.join(', ')}]` : String(val);
  const stateField = DIAG_STATE[base];
  if (stateField) {
    const reasons = stateReasons(raw[stateField]);
    if (reasons.length) out += ` | ${reasons.join(', ')}`;
  }
  return out;
}

module.exports = {
  DOSING_PREFIX,
  DOSING_SUBCAPS,
  M2_GROUPS,
  DIAGNOSTIC_CAPS,
  INPUT_SUBCAPS,
  dosingChannelPrefix,
  parseDurationToHours,
  parseRangeToDays,
  stateIsActive,
  stateReasons,
  stateBlocked,
  desiredM2Capabilities,
  buildM2Updates,
  diagAnnotatable,
  diagRawValue,
};
