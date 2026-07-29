'use strict';

// Water-balance advisor (pure) — M8.1 spec §4
// (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
// Converts waterworks fill-water values, holds the stoichiometric dose-factor
// tables and the product side-effect matrix, estimates the CO2 equilibrium pH,
// ranks the LSI drivers and produces quantified recommendations. Pure and
// total: invalid/missing input yields null / status 'incomplete', never throws.
// LSI math itself stays in lib/Lsi.js (single source of truth, spec §3).

const { computeLSI, classifyLSI } = require('./Lsi');

// Waterworks conversions (spec §4.1).
const DH_TO_PPM = 17.848;   // 1 °dH total hardness = 17.848 ppm CaCO3
const KS43_TO_PPM = 50.04;  // 1 mmol/L K_S4,3 = 1 meq/L = 50.04 ppm CaCO3

// Stoichiometric dose factors, g or mL per m³ per 10 ppm change (spec §4.2).
const DOSE = { taUpGPerM3Per10: 16.8, chUpGPerM3Per10: 14.7, sodaGPerM3Per10Ta: 10.6 };

// pH-minus products with fixed, labeled concentrations (spec §4.2, decisions §13).
const PH_MINUS_PRODUCTS = /** @type {Object<string, {mlPerM3Per10Ta?: number, gPerM3Per10Ta?: number}>} */ ({
  h2so4_15: { mlPerM3Per10Ta: 60 },
  hcl_30: { mlPerM3Per10Ta: 21 },
  nahso4: { gPerM3Per10Ta: 24 },
});

// Chlorine-product long-term side effects on the balance (spec §4.3).
const CHLORINE_EFFECTS = /** @type {Object<string, {ph?: string, ta?: string, chPerFc?: number, cyaPerFc?: number}>} */ ({
  naocl: { ph: 'up' },
  calhypo: { ph: 'up', chPerFc: 0.7 },
  dichlor: { cyaPerFc: 0.9 },
  trichlor: { ph: 'down', ta: 'down', cyaPerFc: 0.6 },
  electrolysis: { ph: 'up' },
  none: {},
});

// Dissolved CO2 at atmospheric equilibrium: 420 µatm × K_H 0.034 M/atm (spec §4.6).
const CO2_ATM_M = 1.43e-5;
const PK1 = 6.35;
const EQ_PH_CAP = 8.4;

/** @param {*} n @returns {boolean} */
const fin = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Convert published waterworks values to LSI inputs (spec §4.1).
 * @param {{dhTotal?: *, ks43?: *, caFractionPct?: *}} args Gesamthärte °dH, K_S4,3 mmol/L, Ca share %.
 * @returns {?{chPpm: number, taPpm: number}} null when any input is missing/non-finite.
 */
function convertFillWater({ dhTotal, ks43, caFractionPct } = {}) {
  if (!fin(dhTotal) || !fin(ks43) || !fin(caFractionPct)) return null;
  const frac = Math.min(100, Math.max(50, caFractionPct)) / 100;
  return { chPpm: dhTotal * DH_TO_PPM * frac, taPpm: ks43 * KS43_TO_PPM };
}

/**
 * Equilibrium pH after full CO2 outgassing, capped at 8.4 (spec §4.6).
 * @param {*} taPpm Total alkalinity ppm CaCO3.
 * @returns {?number} Estimated equilibrium pH, or null for non-positive/invalid TA.
 */
function equilibriumPh(taPpm) {
  if (!fin(taPpm) || taPpm <= 0) return null;
  return Math.min(PK1 + Math.log10((taPpm / 50044) / CO2_ATM_M), EQ_PH_CAP);
}

module.exports = {
  convertFillWater, equilibriumPh, DOSE, PH_MINUS_PRODUCTS, CHLORINE_EFFECTS,
  // re-exported for Tasks 2-3 internal use and tests
  _internals: { DH_TO_PPM, KS43_TO_PPM, computeLSI, classifyLSI },
};
