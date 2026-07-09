'use strict';

// Langelier Saturation Index (pure) — M1 spec §4, §5
// (docs/superpowers/specs/2026-06-29-violet-homey-app-m1-lsi-design.md).
// Computes the LSI from live pH + temperature and manual chemistry, applies a
// pH-dependent cyanuric-acid (CYA) correction, converts hardness/alkalinity
// units to ppm CaCO3, and classifies the result against ANSI/PHTA/ICC-11 bands.
// All functions are pure and total: invalid/missing input yields null, never throws.

// Fixed TDS assumption (spec §4): LSI is log-insensitive to TDS, so a constant
// 1000 ppm is used (A-factor = (log10(1000)-1)/10 = 0.2).
const TDS_PPM = 1000;

// Cyanurate correction constants (spec §4): 0.3877 = CaCO3 eq-weight (50.04 mg/meq)
// / CYA molar mass (129.08 g/mol); 6.88 = first dissociation pKa of cyanuric acid.
const CYA_CACO3_FACTOR = 0.3877;
const CYA_PKA = 6.88;

// Minimum positive value fed to log10 to avoid log10(<=0) (spec §4, §11).
const LOG_FLOOR = 1;

// Unit → multiplier to ppm CaCO3 (spec §4): °dH = 17.848 mg/L, °f = 10 mg/L.
const UNIT_TO_PPM = /** @type {Object<string, number>} */ ({ ppm: 1, dH: 17.848, fH: 10 });

/**
 * Convert a hardness/alkalinity value to ppm as CaCO3 (spec §4).
 * @param {number} value Numeric reading in the given unit.
 * @param {string} unit One of "ppm", "dH", "fH".
 * @returns {?number} Value in ppm CaCO3, or null if value/unit invalid.
 */
function toPpmCaCO3(value, unit) {
  const factor = UNIT_TO_PPM[unit];
  if (factor === undefined || !Number.isFinite(value)) return null;
  return value * factor;
}

/**
 * Carbonate alkalinity = total alkalinity minus the pH-dependent cyanurate
 * contribution (spec §4). Floored to a small positive value for log10 safety.
 * @param {number} totalAlkalinityPpm Total alkalinity as ppm CaCO3.
 * @param {number|undefined} cya Cyanuric acid in ppm (treated as 0 if none/non-finite).
 * @param {number} pH Current pH.
 * @returns {number} Carbonate alkalinity as ppm CaCO3 (>= LOG_FLOOR).
 */
function carbonateAlkalinity(totalAlkalinityPpm, cya, pH) {
  const ionizedFraction = 1 / (1 + Math.pow(10, CYA_PKA - pH));
  const cyaPpm = (typeof cya === 'number' && Number.isFinite(cya)) ? cya : 0;
  const cyanurate = cyaPpm * CYA_CACO3_FACTOR * ionizedFraction;
  return Math.max(LOG_FLOOR, totalAlkalinityPpm - cyanurate);
}

/**
 * Compute the Langelier Saturation Index (Carrier closed form, spec §4).
 * Returns null if any required input (pH, tempC, calcium, alkalinity) is
 * missing or non-finite; CYA missing is treated as 0.
 * @param {object} args
 * @param {number} args.pH
 * @param {number} args.tempC Water temperature in °C.
 * @param {number} args.calciumHardnessPpm Calcium hardness as ppm CaCO3.
 * @param {number} args.totalAlkalinityPpm Total alkalinity as ppm CaCO3.
 * @param {number} [args.cya] Cyanuric acid in ppm.
 * @returns {?number} LSI rounded to 2 decimals, or null.
 */
function computeLSI({ pH, tempC, calciumHardnessPpm, totalAlkalinityPpm, cya }) {
  if (![pH, tempC, calciumHardnessPpm, totalAlkalinityPpm].every(Number.isFinite)) return null;
  const carbonate = carbonateAlkalinity(totalAlkalinityPpm, cya, pH);
  const A = (Math.log10(TDS_PPM) - 1) / 10;
  const B = -13.12 * Math.log10(tempC + 273.15) + 34.55;
  const C = Math.log10(Math.max(LOG_FLOOR, calciumHardnessPpm)) - 0.4;
  const D = Math.log10(carbonate);
  const pHs = (9.3 + A + B) - (C + D);
  return Math.round((pH - pHs) * 100) / 100;
}

/**
 * Classify an LSI value against ANSI/PHTA/ICC-11 bands (spec §5). The critical
 * thresholds (-0.5 / +1.0) are the app's own severity escalation.
 * @param {?number} lsi LSI value, or null.
 * @returns {?{band: string, direction: string, severity: string}} null when lsi is null.
 */
function classifyLSI(lsi) {
  if (lsi === null || !Number.isFinite(lsi)) return null;
  if (lsi < -0.5) return { band: 'severe_corrosive', direction: 'corrosive', severity: 'critical' };
  if (lsi < -0.3) return { band: 'corrosive', direction: 'corrosive', severity: 'warning' };
  if (lsi <= 0.5) return { band: 'balanced', direction: 'balanced', severity: 'ok' };
  if (lsi <= 1.0) return { band: 'scaling', direction: 'scaling', severity: 'warning' };
  return { band: 'severe_scaling', direction: 'scaling', severity: 'critical' };
}

module.exports = { toPpmCaCO3, carbonateAlkalinity, computeLSI, classifyLSI, TDS_PPM };
