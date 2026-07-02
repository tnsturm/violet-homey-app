'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseDurationToHours,
  parseRangeToDays,
  stateIsActive,
  faultQueueActive,
  dosingChannelPrefix,
} = require('../lib/FeatureGroups');

test('parseDurationToHours parses "Hh Mm Ss" to fractional hours', () => {
  assert.strictEqual(parseDurationToHours('00h 00m 00s'), 0);
  assert.strictEqual(parseDurationToHours('05h 27m 40s'), 5.46); // 5 + 27/60 + 40/3600, 2dp
  assert.strictEqual(parseDurationToHours('19h 23m 23s'), 19.39);
});

test('parseDurationToHours returns null on unparseable input', () => {
  assert.strictEqual(parseDurationToHours('NONE'), null);
  assert.strictEqual(parseDurationToHours(undefined), null);
});

test('parseRangeToDays parses day/week/month suffixes', () => {
  assert.strictEqual(parseRangeToDays('37d'), 37);
  assert.strictEqual(parseRangeToDays('6w'), 42);
  assert.strictEqual(parseRangeToDays('2m'), 60);
  assert.strictEqual(parseRangeToDays('0d'), 0);
});

test('parseRangeToDays returns null on unparseable input', () => {
  assert.strictEqual(parseRangeToDays(''), null);
  assert.strictEqual(parseRangeToDays(undefined), null);
});

test('stateIsActive is true only for "ON" (case-insensitive)', () => {
  assert.strictEqual(stateIsActive('ON'), true);
  assert.strictEqual(stateIsActive('on'), true);
  assert.strictEqual(stateIsActive('OFF'), false);
  assert.strictEqual(stateIsActive(undefined), false);
});

test('faultQueueActive is true for a non-empty array only', () => {
  assert.strictEqual(faultQueueActive(['BLOCKED_BY_MAX_AMOUNT']), true);
  assert.strictEqual(faultQueueActive([]), false);
  assert.strictEqual(faultQueueActive('OK'), false);
  assert.strictEqual(faultQueueActive(undefined), false);
});

test('dosingChannelPrefix maps channel keys to Violet field prefixes', () => {
  assert.strictEqual(dosingChannelPrefix('cl'), 'DOS_1_CL');
  assert.strictEqual(dosingChannelPrefix('elorev'), 'DOS_3_ELO_REV');
  assert.strictEqual(dosingChannelPrefix('floc'), 'DOS_6_FLOC');
});
