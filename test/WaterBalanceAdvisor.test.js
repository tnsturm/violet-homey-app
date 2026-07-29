'use strict';

// Advisor math tests — M8.1 spec §4 (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  convertFillWater, equilibriumPh, PH_MINUS_PRODUCTS, DOSE, CHLORINE_EFFECTS,
} = require('../lib/WaterBalanceAdvisor');

test('convertFillWater: 14 °dH / KS4.3 2.5 / 75% Ca → CH 187.4, TA 125.1 (spec §4.1)', () => {
  const r = convertFillWater({ dhTotal: 14, ks43: 2.5, caFractionPct: 75 });
  assert.ok(r);
  assert.ok(Math.abs(r.chPpm - 14 * 17.848 * 0.75) < 0.01); // 187.40
  assert.ok(Math.abs(r.taPpm - 2.5 * 50.04) < 0.01);        // 125.10
});

test('convertFillWater: missing/garbage inputs → null, never throws (spec §4.8)', () => {
  assert.equal(convertFillWater({ dhTotal: null, ks43: 2.5, caFractionPct: 75 }), null);
  assert.equal(convertFillWater({ dhTotal: 14, ks43: NaN, caFractionPct: 75 }), null);
  assert.equal(convertFillWater({}), null);
});

test('convertFillWater: caFractionPct clamped to [50,100]', () => {
  const lo = convertFillWater({ dhTotal: 10, ks43: 2, caFractionPct: 10 });
  const hi = convertFillWater({ dhTotal: 10, ks43: 2, caFractionPct: 150 });
  assert.ok(lo && Math.abs(lo.chPpm - 10 * 17.848 * 0.5) < 0.01);
  assert.ok(hi && Math.abs(hi.chPpm - 10 * 17.848 * 1.0) < 0.01);
});

test('equilibriumPh: TA 100 caps at 8.4; TA 50 ≈ 8.19; TA 200 caps; null-safe (spec §4.6)', () => {
  assert.equal(equilibriumPh(100), 8.4); // raw ≈8.5 → cap
  const t50 = equilibriumPh(50);
  assert.ok(t50 !== null && Math.abs(t50 - (6.35 + Math.log10((50 / 50044) / 1.43e-5))) < 0.005); // ≈8.19
  assert.equal(equilibriumPh(200), 8.4);
  assert.equal(equilibriumPh(0), null);
  assert.equal(equilibriumPh(NaN), null);
});

test('dose tables match spec §4.2 exactly', () => {
  assert.equal(DOSE.taUpGPerM3Per10, 16.8);
  assert.equal(DOSE.chUpGPerM3Per10, 14.7);
  assert.equal(DOSE.sodaGPerM3Per10Ta, 10.6);
  assert.equal(PH_MINUS_PRODUCTS.h2so4_15.mlPerM3Per10Ta, 60);
  assert.equal(PH_MINUS_PRODUCTS.hcl_30.mlPerM3Per10Ta, 21);
  assert.equal(PH_MINUS_PRODUCTS.nahso4.gPerM3Per10Ta, 24);
});

test('chlorine side-effect matrix (spec §4.3)', () => {
  assert.equal(CHLORINE_EFFECTS.calhypo.chPerFc, 0.7);
  assert.equal(CHLORINE_EFFECTS.dichlor.cyaPerFc, 0.9);
  assert.equal(CHLORINE_EFFECTS.trichlor.cyaPerFc, 0.6);
  assert.equal(CHLORINE_EFFECTS.trichlor.ph, 'down');
  assert.deepEqual(CHLORINE_EFFECTS.none, {});
});
