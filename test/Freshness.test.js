'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { isFresh } = require('../lib/Freshness');

test('not fresh while pump is off', () => {
  assert.strictEqual(isFresh({ pumpOn: false, pumpOnSince: null, now: 1000, warmupSeconds: 120 }), false);
});

test('not fresh during warmup window', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpOnSince: 1000, now: 1060, warmupSeconds: 120 }), false);
});

test('fresh once warmup elapsed', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpOnSince: 1000, now: 1120, warmupSeconds: 120 }), true);
});

test('not fresh if pumpOnSince missing despite pumpOn', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpOnSince: null, now: 5000, warmupSeconds: 120 }), false);
});
