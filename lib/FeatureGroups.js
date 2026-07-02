'use strict';

// Feature-group registry & pure parsers (pure) — spec §3, §4, §5, §9
// (docs/superpowers/specs/2026-07-01-violet-homey-app-m2-full-reads-design.md).
// Turns raw getReadings fields into the M2 capability set + per-poll values.
// Detection lives in FeatureDetector; this module owns value derivation and the
// declarative registry so device.js stays thin (spec §3).

// Violet dosing field prefixes per channel key (Global Constraints).
const DOSING_PREFIX = {
  cl: 'DOS_1_CL', elo: 'DOS_2_ELO', elorev: 'DOS_3_ELO_REV',
  phm: 'DOS_4_PHM', php: 'DOS_5_PHP', floc: 'DOS_6_FLOC',
};

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
 * @param {string} str e.g. "19h 23m 23s".
 * @returns {?number} Hours rounded to 2 dp, or null if unparseable.
 */
function parseDurationToHours(str) {
  const m = /^\s*(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*s\s*$/.exec(String(str ?? ''));
  if (!m) return null;
  const hours = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  return Math.round(hours * 100) / 100;
}

/**
 * Parse a Violet range string ("37d"/"6w"/"2m") to days (spec §5, §9).
 * @param {string} str e.g. "37d".
 * @returns {?number} Days (w=×7, m=×30), or null if unparseable.
 */
function parseRangeToDays(str) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([dwm])\s*$/i.exec(String(str ?? ''));
  if (!m) return null;
  const mult = { d: 1, w: 7, m: 30 }[m[2].toLowerCase()];
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
 * True when a Violet *STATE fault queue (array) is non-empty (spec §9).
 * @param {*} v Raw field value.
 * @returns {boolean}
 */
function faultQueueActive(v) {
  return Array.isArray(v) && v.length > 0;
}

// Coerce to finite number or null (mirrors VioletClient.num for M2 fields).
function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

// Active pump speed stage from the one-hot PUMP_RPM_0..3 (0 = off) (spec §5).
function pumpSpeedStage(raw) {
  for (let i = 0; i <= 3; i += 1) if (Number(raw[`PUMP_RPM_${i}`]) === 1) return i;
  return 0;
}

// COVER_STATE string → enum id, or undefined when unknown (device skips) (spec §9).
function coverState(v) {
  const s = String(v ?? '').toUpperCase();
  if (s === 'OPEN') return 'open';
  if (s === 'CLOSED') return 'closed';
  if (s.includes('STOP')) return 'stopped';
  if (s.includes('MOV') || s.includes('OPENING') || s.includes('CLOSING')) return 'moving';
  return undefined;
}

/**
 * Build the per-poll M2 capability→value map (spec §5, §6, §7).
 * Status/actuator/consumable caps update every poll (NOT fresh-gated). Absent or
 * unknown values omit the key so device.js leaves the capability untouched.
 * @param {object} raw Parsed getReadings payload.
 * @param {{dosingChannels: string[], dosingLowThresholdDays: number}} opts
 * @returns {Object<string, *>} capId (incl. `<base>.<ch>` sub-ids) → value.
 */
function buildM2Updates(raw, { dosingChannels = [], dosingLowThresholdDays = 7 } = {}) {
  const u = {};
  const put = (cap, val) => { if (val !== undefined && val !== null) u[cap] = val; };

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
    if (raw[`${p}_STATE`] !== undefined) u[`alarm_dosing_blocked.${ch}`] = faultQueueActive(raw[`${p}_STATE`]);
  }
  return u;
}

module.exports = {
  DOSING_PREFIX,
  dosingChannelPrefix,
  parseDurationToHours,
  parseRangeToDays,
  stateIsActive,
  faultQueueActive,
  buildM2Updates,
};
