'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  channelSubCapId,
  choosePrimaryTemperature,
  desiredFeatureCapabilities,
  buildCapabilityUpdates,
} = require('../lib/Capabilities');

test('channelSubCapId builds a sub-capability id', () => {
  assert.strictEqual(channelSubCapId(3), 'measure_temperature.ow3');
});

test('choosePrimaryTemperature picks the selected channel', () => {
  const chans = [{ id: 1, value: 20 }, { id: 3, value: 27.5 }];
  assert.strictEqual(choosePrimaryTemperature(chans, 3), 27.5);
});

test('choosePrimaryTemperature auto-selects when exactly one channel', () => {
  assert.strictEqual(choosePrimaryTemperature([{ id: 5, value: 26 }], 'auto'), 26);
});

test('choosePrimaryTemperature returns null when auto with multiple channels', () => {
  assert.strictEqual(choosePrimaryTemperature([{ id: 1, value: 20 }, { id: 2, value: 21 }], 'auto'), null);
});

// M5.7 (0.5.1): with config names, "auto" picks the pool-named channel among
// several (spec addendum). Manual selection and the single-channel fallback
// keep their prior behaviour when names are absent or don't resolve.
test('choosePrimaryTemperature auto picks the pool-named channel from config names', () => {
  const chans = [{ id: 1, value: 30.1 }, { id: 2, value: 27.8 }, { id: 8, value: 30.3 }];
  const names = { 1: 'Schwimmbad', 2: 'Außentemperatur', 8: 'Messzelle' };
  assert.strictEqual(choosePrimaryTemperature(chans, 'auto', names), 30.1);
});

test('choosePrimaryTemperature auto matches pool-name variants (case-insensitive)', () => {
  const variants = ['Pool', 'pool water', 'Schwimmbecken', 'Beckenwasser', 'WASSER'];
  for (const name of variants) {
    const chans = [{ id: 1, value: 25 }, { id: 2, value: 18 }];
    assert.strictEqual(
      choosePrimaryTemperature(chans, 'auto', { 1: name, 2: 'Außentemperatur' }), 25,
      `expected ${name} to match as pool`,
    );
  }
});

test('choosePrimaryTemperature auto stays null when config names are ambiguous', () => {
  // Two pool-named OK channels → undecidable; falls back to the multi-channel rule.
  const chans = [{ id: 1, value: 30 }, { id: 2, value: 29 }];
  assert.strictEqual(choosePrimaryTemperature(chans, 'auto', { 1: 'Pool oben', 2: 'Pool unten' }), null);
});

test('choosePrimaryTemperature auto falls back when no config name matches', () => {
  const chans = [{ id: 1, value: 30 }, { id: 2, value: 29 }];
  // No pool-ish name + multiple channels → null (today's rule).
  assert.strictEqual(choosePrimaryTemperature(chans, 'auto', { 1: 'Solar', 2: 'Außentemperatur' }), null);
  // Single channel + non-matching name → still the single channel.
  assert.strictEqual(choosePrimaryTemperature([{ id: 4, value: 22 }], 'auto', { 4: 'Solar' }), 22);
});

test('choosePrimaryTemperature: a manual channel id wins over config names', () => {
  const chans = [{ id: 1, value: 30.1 }, { id: 2, value: 27.8 }];
  assert.strictEqual(choosePrimaryTemperature(chans, 2, { 1: 'Schwimmbad', 2: 'Außentemperatur' }), 27.8);
});

test('choosePrimaryTemperature: only OK channels count for the name match', () => {
  // The pool-named channel is not among the OK channels → no phantom pick.
  const chans = [{ id: 2, value: 27.8 }, { id: 8, value: 30.3 }];
  assert.strictEqual(choosePrimaryTemperature(chans, 'auto', { 1: 'Schwimmbad', 2: 'Außentemperatur', 8: 'Messzelle' }), null);
});

test('desiredFeatureCapabilities respects detection and overrides', () => {
  assert.deepStrictEqual(
    desiredFeatureCapabilities({ features: { chlorine: true }, overrides: { chlorine: 'auto' } }),
    ['measure_chlorine'],
  );
  assert.deepStrictEqual(
    desiredFeatureCapabilities({ features: { chlorine: true }, overrides: { chlorine: 'hide' } }),
    [],
  );
  assert.deepStrictEqual(
    desiredFeatureCapabilities({ features: { chlorine: false }, overrides: { chlorine: 'force' } }),
    ['measure_chlorine'],
  );
});

test('buildCapabilityUpdates clears probe values to null when stale, sets them when fresh', () => {
  const parsed = {
    ph: 7.3, orp: 750, chlorine: 0.8, pumpOn: true,
    tempChannels: [{ id: 1, value: 26 }, { id: 3, value: 27 }],
  };
  const stale = buildCapabilityUpdates({ parsed, fresh: false, primaryChannel: 27 });
  assert.strictEqual(stale.measurements_fresh, false);
  assert.strictEqual(stale.pump_running, true);
  assert.strictEqual(stale.measure_temperature, 27);
  assert.strictEqual(stale['measure_temperature.ow1'], 26);
  assert.strictEqual(stale.measure_ph, null);
  assert.strictEqual(stale.measure_orp, null);
  assert.strictEqual(stale.measure_chlorine, null);

  const fresh = buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 27 });
  assert.strictEqual(fresh.measure_ph, 7.3);
  assert.strictEqual(fresh.measure_orp, 750);
  assert.strictEqual(fresh.measure_chlorine, 0.8);
});

test('buildCapabilityUpdates omits chlorine when fresh but chlorine is null', () => {
  const parsed = {
    ph: 7.3, orp: 750, chlorine: null, pumpOn: true,
    tempChannels: [{ id: 1, value: 26 }],
  };
  const updates = buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 26 });
  assert.strictEqual(updates.measure_ph, 7.3);
  assert.ok(!('measure_chlorine' in updates));
});

test('buildCapabilityUpdates places measure_lsi (fresh-gated)', () => {
  const parsed = { ph: 7.2, orp: 700, chlorine: 0.3, pumpOn: true, tempChannels: [] };
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: 0.12 }).measure_lsi,
    0.12,
  );
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: null }).measure_lsi,
    null,
  );
  // LSI value 0 must be preserved (not coerced to null).
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: 0 }).measure_lsi,
    0,
  );
});

test('buildCapabilityUpdates places alarm_water_balance (LSI warning state)', () => {
  const parsed = { ph: 7.2, orp: 700, chlorine: 0.3, pumpOn: true, tempChannels: [] };
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: -0.6, alarm: true }).alarm_water_balance,
    true,
  );
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: 0.1, alarm: false }).alarm_water_balance,
    false,
  );
  // alarm omitted → defaults to false (a boolean alarm is never undefined/null).
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: 0.1 }).alarm_water_balance,
    false,
  );
});
