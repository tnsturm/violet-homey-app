'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseDurationToHours,
  parseRangeToDays,
  stateIsActive,
  faultQueueActive,
  dosingChannelPrefix,
  diagAnnotatable,
  diagRawValue,
} = require('../lib/FeatureGroups');

test('diagAnnotatable marks state/switch/dosing caps, not measurements', () => {
  assert.strictEqual(diagAnnotatable('cover_state'), true);
  assert.strictEqual(diagAnnotatable('alarm_dosing_blocked.cl'), true);
  assert.strictEqual(diagAnnotatable('measure_dosing_days_left.phm'), true);
  assert.strictEqual(diagAnnotatable('measure_ph'), false);
  assert.strictEqual(diagAnnotatable('measure_temperature.ow1'), false);
});

test('diagRawValue returns the exact source field value as a string', () => {
  const raw = {
    COVER_STATE: 'OPEN', PVSURPLUS: '2', BACKWASH_OMNI_STATE: 'OK',
    DOS_1_CL: '1', DOS_1_CL_STATE: ['CL_DOSING_CONTROLLER'], DOS_1_CL_REMAINING_RANGE: '6d',
    DOS_4_PHM_STATE: [],
  };
  assert.strictEqual(diagRawValue('cover_state', raw), 'OPEN');
  assert.strictEqual(diagRawValue('pv_surplus_active', raw), '2');
  assert.strictEqual(diagRawValue('dosing_active.cl', raw), '1');
  assert.strictEqual(diagRawValue('alarm_dosing_blocked.cl', raw), '[CL_DOSING_CONTROLLER]');
  assert.strictEqual(diagRawValue('alarm_dosing_low.cl', raw), '6d');
  assert.strictEqual(diagRawValue('alarm_dosing_blocked.phm', raw), '[]'); // empty array → []
  assert.strictEqual(diagRawValue('alarm_omni_valve', raw), 'OK');
  assert.strictEqual(diagRawValue('heater_active', raw), null); // HEATER field absent
  assert.strictEqual(diagRawValue('measure_ph', raw), null); // not mapped
});

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

test('buildM2Updates omits all keys when payload is empty', () => {
  const u = buildM2Updates({}, { dosingChannels: [], dosingLowThresholdDays: 7 });
  assert.deepStrictEqual(u, {});
});

test('buildM2Updates omits absent-field keys on minimal fixture', () => {
  const minimal = JSON.parse(
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'fixtures', 'minimal-pool.json'),
      'utf8'
    )
  );
  const u = buildM2Updates(minimal, { dosingChannels: [], dosingLowThresholdDays: 7 });
  // Absent fields should be omitted (only PUMP, PUMP_RPM_*, SOLAR, HEATER, LIGHT, BACKWASH, REFILL_STATE present)
  assert.ok(!('eco_active' in u), 'eco_active should be omitted when ECO is absent');
  assert.ok(!('cover_state' in u), 'cover_state should be omitted when COVER_STATE is absent');
  assert.ok(!('measure_water_level' in u), 'measure_water_level should be omitted when BATHING_AI_LAST_LEVEL is absent');
  assert.ok(!('pv_surplus_active' in u), 'pv_surplus_active should be omitted when PVSURPLUS is absent');
  assert.ok(!('alarm_overflow_dryrun' in u), 'alarm_overflow_dryrun should be omitted when OVERFLOW_DRYRUN_STATE is absent');
  // Present fields should still appear
  assert.strictEqual(u.pump_speed_stage, 1, 'pump_speed_stage should be derived when PUMP_RPM_* fields are present');
  assert.strictEqual(u.heater_active, false, 'heater_active should be false when HEATER=0 is present');
  assert.strictEqual(u.solar_active, false, 'solar_active should be false when SOLAR=0 is present');
  assert.strictEqual(u.light_on, false, 'light_on should be false when LIGHT=0 is present');
});

const { desiredM2Capabilities } = require('../lib/FeatureGroups');

test('desiredM2Capabilities: auto shows detected, hides undetected', () => {
  const features = { pump: true, eco: false, heater: true, solar: false, backwash: false, cover: true, light: false, refill: false, overflow: false, waterLevel: true, pvSurplus: true, diagnostics: true, dosingChannels: ['cl'] };
  const caps = desiredM2Capabilities({ features, overrides: {}, diagnosticsEnabled: false });
  assert.ok(caps.includes('pump_speed_stage'));      // pump force default
  assert.ok(caps.includes('heater_active'));         // detected
  assert.ok(!caps.includes('solar_active'));         // undetected
  assert.ok(caps.includes('cover_state'));
  assert.ok(caps.includes('measure_water_level'));
  assert.ok(caps.includes('measure_dosing_days_left.cl'));
  assert.ok(caps.includes('alarm_dosing_blocked.cl'));
  assert.ok(!caps.some((c) => c.startsWith('measure_system_')));  // diagnostics off
});

test('desiredM2Capabilities: force shows undetected, hide removes detected', () => {
  const features = { pump: true, heater: false, solar: false, dosingChannels: [] };
  assert.ok(desiredM2Capabilities({ features, overrides: { heater: 'force' }, diagnosticsEnabled: false }).includes('heater_active'));
  assert.ok(!desiredM2Capabilities({ features: { ...features, heater: true }, overrides: { heater: 'hide' }, diagnosticsEnabled: false }).includes('heater_active'));
});

test('desiredM2Capabilities: diagnostics gated by diagnosticsEnabled', () => {
  const features = { pump: true, diagnostics: true, dosingChannels: [] };
  assert.ok(desiredM2Capabilities({ features, overrides: {}, diagnosticsEnabled: true }).includes('last_error_id'));
});
