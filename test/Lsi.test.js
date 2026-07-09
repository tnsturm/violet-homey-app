'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { toPpmCaCO3, carbonateAlkalinity, computeLSI, classifyLSI } = require('../lib/Lsi');

const near = (/** @type {?number} */ actual, /** @type {number} */ expected, eps = 0.01) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= eps, `expected ${actual} ≈ ${expected}`);

test('toPpmCaCO3 converts units', () => {
  assert.strictEqual(toPpmCaCO3(100, 'ppm'), 100);
  near(toPpmCaCO3(10, 'dH'), 178.48);
  assert.strictEqual(toPpmCaCO3(30, 'fH'), 300);
  assert.strictEqual(toPpmCaCO3(NaN, 'ppm'), null);
  assert.strictEqual(toPpmCaCO3(100, 'xx'), null);
});

test('carbonateAlkalinity applies pH-dependent CYA correction', () => {
  // CYA=0 ⇒ unchanged.
  near(carbonateAlkalinity(100, 0, 7.5), 100);
  // At pH 7.6 the factor ≈ 1/3 (industry rule of thumb).
  near(carbonateAlkalinity(100, 60, 7.6), 100 - 60 / 3, 0.5);
  // Floored to >= 1 (never log10(<=0)).
  assert.ok(carbonateAlkalinity(10, 1000, 7.5) >= 1);
});

test('computeLSI: corrosive reference case', () => {
  // pH 7.2, 28 °C, Ca 300 ppm, TA 80 ppm, CYA 0 → ≈ -0.35.
  near(computeLSI({ pH: 7.2, tempC: 28, calciumHardnessPpm: 300, totalAlkalinityPpm: 80, cya: 0 }), -0.35, 0.02);
});

test('computeLSI: CYA correction lowers LSI', () => {
  const withCya = computeLSI({ pH: 7.5, tempC: 28, calciumHardnessPpm: 350, totalAlkalinityPpm: 100, cya: 40 });
  const without = computeLSI({ pH: 7.5, tempC: 28, calciumHardnessPpm: 350, totalAlkalinityPpm: 100, cya: 0 });
  assert.ok(withCya !== null && without !== null);
  near(withCya, 0.06, 0.03);
  assert.ok(withCya < without, 'CYA correction must reduce LSI');
});

test('computeLSI returns null on missing required input', () => {
  assert.strictEqual(computeLSI({ pH: 7.2, tempC: 28, calciumHardnessPpm: 300, totalAlkalinityPpm: NaN, cya: 0 }), null);
  assert.strictEqual(computeLSI({ pH: 7.2, tempC: /** @type {*} */ (null), calciumHardnessPpm: 300, totalAlkalinityPpm: 80, cya: 0 }), null);
});

test('classifyLSI bands at boundaries', () => {
  assert.strictEqual(classifyLSI(-0.51)?.band, 'severe_corrosive');
  assert.strictEqual(classifyLSI(-0.5)?.band, 'corrosive');
  assert.strictEqual(classifyLSI(-0.3)?.band, 'balanced');
  assert.strictEqual(classifyLSI(0.5)?.band, 'balanced');
  assert.strictEqual(classifyLSI(0.51)?.band, 'scaling');
  assert.strictEqual(classifyLSI(1.0)?.band, 'scaling');
  assert.strictEqual(classifyLSI(1.01)?.band, 'severe_scaling');
  assert.strictEqual(classifyLSI(-1)?.severity, 'critical');
  assert.strictEqual(classifyLSI(0)?.direction, 'balanced');
  assert.strictEqual(classifyLSI(null), null);
});
