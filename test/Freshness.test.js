'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { isFresh } = require('../lib/Freshness');

test('not fresh while pump is off', () => {
  assert.strictEqual(isFresh({ pumpOn: false, pumpLastOn: 1000, now: 5000, warmupSeconds: 120 }), false);
});

test('not fresh during warmup window', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 1000, now: 1060, warmupSeconds: 120 }), false);
});

test('fresh once warmup elapsed', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 1000, now: 1120, warmupSeconds: 120 }), true);
});

test('fresh immediately for a long-running pump (survives app restart)', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 1000, now: 99999, warmupSeconds: 120 }), true);
});

test('not fresh if pumpLastOn missing despite pumpOn', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: null, now: 5000, warmupSeconds: 120 }), false);
});

test('backward controller-clock step is clamped (not fresh)', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 5000, now: 1000, warmupSeconds: 120 }), false);
});
