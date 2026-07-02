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
  assert.strictEqual(parseDurationToHours('abc 5h 5m 5s def'), null);
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

const fs2 = require('node:fs');
const path2 = require('node:path');
const { buildM2Updates } = require('../lib/FeatureGroups');
const full = JSON.parse(fs2.readFileSync(path2.join(__dirname, 'fixtures', 'getReadings.all.json'), 'utf8'));

test('buildM2Updates derives actuator + status caps from the full fixture', () => {
  const u = buildM2Updates(full, { dosingChannels: ['cl', 'phm', 'floc'], dosingLowThresholdDays: 7 });
  assert.strictEqual(u.pump_speed_stage, 1);            // PUMP_RPM_1 === 1
  assert.strictEqual(u.eco_active, true);               // ECO === 1
  assert.strictEqual(u.heater_active, false);           // HEATER === 0
  assert.strictEqual(u.cover_state, 'open');            // COVER_STATE "OPEN"
  assert.strictEqual(u.light_on, true);                 // LIGHT 4 > 0
  assert.strictEqual(u.runtime_pump, 19.39);            // PUMP_RUNTIME
  assert.strictEqual(u.alarm_overflow_dryrun, false);
  assert.strictEqual(u.alarm_omni_valve, false);        // BACKWASH_OMNI_STATE "OK"
});

test('buildM2Updates expands per-channel dosing caps + alarms', () => {
  const u = buildM2Updates(full, { dosingChannels: ['cl', 'phm', 'floc'], dosingLowThresholdDays: 40 });
  assert.strictEqual(u['measure_dosing_days_left.cl'], 37);       // "37d"
  assert.strictEqual(u['measure_dosing_daily_ml.phm'], 1001);
  assert.strictEqual(u['alarm_dosing_blocked.phm'], true);        // ["BLOCKED_BY_MAX_AMOUNT"]
  assert.strictEqual(u['alarm_dosing_blocked.cl'], false);        // []
  assert.strictEqual(u['alarm_dosing_low.cl'], true);             // 37 <= 40
});

test('buildM2Updates derives diagnostics values', () => {
  const u = buildM2Updates(full, { dosingChannels: [], dosingLowThresholdDays: 7 });
  assert.strictEqual(u.measure_system_cpu_temperature, 48.2);
  assert.strictEqual(u.measure_system_memory, 41.2);
  assert.strictEqual(u.last_error_id, 66);
  assert.strictEqual(typeof u.system_uptime, 'string');
  assert.ok(u.controller_firmware.includes('1.2.1'));
});
