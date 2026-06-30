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
