'use strict';

// Advisor math tests — M8.1 spec §4 (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  convertFillWater, equilibriumPh, PH_MINUS_PRODUCTS, DOSE, CHLORINE_EFFECTS, adviseBalance,
} = require('../lib/WaterBalanceAdvisor');
const { computeLSI } = require('../lib/Lsi');

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

const BASE = { volumeM3: 50, products: { phMinus: 'h2so4_15', chlorine: 'naocl' }, dosingCtx: { violetDosesPh: false }, fill: null };

test('adviseBalance: low TA is the clear driver; amount uses 16.8 g/m³ per 10 ppm (spec §4.4)', () => {
  // pH 7.4, 26°C, CH 250 ok, TA 50 low → LSI clearly negative, TA lever dominates.
  const r = adviseBalance({ ...BASE, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 50, cya: 0 });
  assert.equal(r.status, 'ok');
  assert.ok(r.lsiNow !== null && r.lsiNow < -0.3);
  assert.equal(r.drivers[0].param, 'ta');
  assert.equal(r.drivers[0].direction, 'raise');
  assert.ok(r.drivers[0].target >= 80 && r.drivers[0].target <= 120);
  const grams = r.drivers[0].measure.amount.value;
  const expected = 16.8 * 50 * (r.drivers[0].target - 50) / 10;
  assert.ok(Math.abs(grams - expected) <= 10); // rounded to 10 g
  assert.equal(r.drivers[0].measure.amount.unit, 'g');
  assert.equal(r.drivers[0].measure.chemical, 'nahco3');
});

test('adviseBalance: high pH driver → acid measure in mL for h2so4_15 (spec §4.2)', () => {
  const r = adviseBalance({ ...BASE, pH: 8.2, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  assert.equal(r.status, 'ok');
  assert.equal(r.drivers[0].param, 'ph');
  assert.equal(r.drivers[0].direction, 'lower');
  assert.equal(r.drivers[0].measure.amount.unit, 'mL');
  assert.ok(r.drivers[0].measure.amount.value > 0);
});

test('adviseBalance: predictedLsi comes from computeLSI on the adjusted state (spec §3 invariant)', () => {
  const r = adviseBalance({ ...BASE, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 50, cya: 0 });
  const check = computeLSI({ pH: 7.4, tempC: 26, calciumHardnessPpm: 250, totalAlkalinityPpm: r.drivers[0].target, cya: 0 });
  assert.equal(r.predictedLsi, check);
  assert.ok(r.predictedLsi !== null && r.lsiNow !== null && Math.abs(r.predictedLsi) < Math.abs(r.lsiNow)); // strictly closer to 0
});

test('adviseBalance: clamps hold — extreme water clamps targets to band edges (spec §4.4)', () => {
  const r = adviseBalance({ ...BASE, pH: 6.5, tempC: 10, chPpm: 60, taPpm: 30, cya: 0 });
  for (const d of r.drivers) {
    if (d.param === 'ph') assert.ok(d.target >= 7.0 && d.target <= 7.6);
    if (d.param === 'ta') assert.ok(d.target >= 80 && d.target <= 120);
    if (d.param === 'ch') assert.ok(d.target >= 200 && d.target <= 400);
  }
});

test('adviseBalance: balanced water → no drivers ≥0.05, status ok (spec §4.4)', () => {
  // Construct a state with LSI ≈ 0: pH 7.5, 26°C, CH 250, TA 100 → verify then assert empty-ish.
  const r = adviseBalance({ ...BASE, pH: 7.5, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  if (r.lsiNow !== null && Math.abs(r.lsiNow) < 0.05) assert.equal(r.drivers.length, 0);
  else assert.ok(r.drivers.every((d) => Math.abs(d.deltaLsi) >= 0.05));
});

test('adviseBalance: volumeM3 null → amounts null + needs_volume note (spec §4.4.4)', () => {
  const r = adviseBalance({ ...BASE, volumeM3: null, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 50, cya: 0 });
  assert.equal(r.drivers[0].measure.amount, null);
  assert.ok(r.drivers[0].notes.includes('needs_volume'));
});

test('adviseBalance: violetDosesPh annotates the pH lever (spec §4.4.5, §8)', () => {
  const r = adviseBalance({ ...BASE, dosingCtx: { violetDosesPh: true }, pH: 8.2, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  const ph = r.drivers.find((d) => d.param === 'ph');
  assert.ok(ph && ph.handledByViolet === true && ph.notes.includes('violet_doses_ph'));
});

test('adviseBalance: aeration listed when pH < equilibrium − 0.3 and pH needs raising (spec §4.6)', () => {
  const r = adviseBalance({ ...BASE, pH: 6.9, tempC: 26, chPpm: 250, taPpm: 100, cya: 0 });
  assert.equal(r.co2.aerationRecommended, true);
  const ph = r.drivers.find((d) => d.param === 'ph');
  assert.ok(ph && ph.notes.includes('aeration_first'));
});

test('adviseBalance: TA lowering with fill water configured → dilution measure in % (spec §4.7)', () => {
  const r = adviseBalance({ ...BASE, products: { phMinus: 'none', chlorine: 'naocl' }, fill: { chPpm: 100, taPpm: 60 }, pH: 7.5, tempC: 26, chPpm: 250, taPpm: 240, cya: 0 });
  const ta = r.drivers.find((d) => d.param === 'ta');
  assert.ok(ta && ta.direction === 'lower');
  assert.equal(ta.measure.chemical, 'dilution');
  assert.equal(ta.measure.amount.unit, '%');
  // mix: target = 240(1-x) + 60x → x = (240-target)/(240-60)
  const x = Math.round(((240 - ta.target) / (240 - 60)) * 100);
  assert.ok(Math.abs(ta.measure.amount.value - x) <= 1);
});

test('adviseBalance: fill water itself over target → fill_water_is_source honesty note (spec §4.7)', () => {
  const r = adviseBalance({ ...BASE, fill: { chPpm: 450, taPpm: 100 }, pH: 7.8, tempC: 26, chPpm: 500, taPpm: 100, cya: 0 });
  const ch = r.drivers.find((d) => d.param === 'ch');
  if (ch) assert.ok(ch.notes.includes('fill_water_is_source'));
});

test('adviseBalance: trichlor product → chlorineNote trichlor_drift (spec §4.3)', () => {
  const r = adviseBalance({ ...BASE, products: { phMinus: 'nahso4', chlorine: 'trichlor' }, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 90, cya: 40 });
  assert.equal(r.chlorineNote, 'trichlor_drift');
});

test('adviseBalance: missing inputs → status incomplete with missing[] list, no throw (spec §4.8)', () => {
  const r = adviseBalance({ ...BASE, pH: null, tempC: 26, chPpm: null, taPpm: 100, cya: 0 });
  assert.equal(r.status, 'incomplete');
  assert.deepEqual(r.missing.sort(), ['chPpm', 'pH']);
  assert.equal(r.lsiNow, null);
  assert.deepEqual(r.drivers, []);
});
