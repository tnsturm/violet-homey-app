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

module.exports = {
  DOSING_PREFIX,
  dosingChannelPrefix,
  parseDurationToHours,
  parseRangeToDays,
  stateIsActive,
  faultQueueActive,
};
