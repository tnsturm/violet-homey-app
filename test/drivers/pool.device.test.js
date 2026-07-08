'use strict';

// First reconcile/apply tests for drivers/pool/device.js via the recording Homey
// mock (M4.7 spec §3, docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md).
// Load order matters (spec §3 D1/D2): install the module-resolution mock and stub
// VioletClient.fetchReadings BEFORE requiring device.js — its top-level destructure
// must pick up the stub. Expectations derive from the SAME pure planners the device
// wires (desiredM2Capabilities), grounded by fixture-specific spot checks.

const { test } = require('node:test');
const assert = require('node:assert');

const { installHomeyMock } = require('../mocks/homey');
installHomeyMock();

const VioletClient = require('../../lib/VioletClient');
let currentFixture = null;
let failFetch = false;
VioletClient.fetchReadings = async () => {
  if (failFetch) throw new Error('simulated unreachable');
  return currentFixture;
};

const { detectFeatures } = require('../../lib/FeatureDetector');
const { desiredM2Capabilities } = require('../../lib/FeatureGroups');
const PoolDevice = require('../../drivers/pool/device.js');

const FIXTURES = {
  'minimal-pool': require('../fixtures/minimal-pool.json'),
  'chlorine-only': require('../fixtures/chlorine-only.json'),
  'salt-electrolysis': require('../fixtures/salt-electrolysis.json'),
  'getReadings.all': require('../fixtures/getReadings.all.json'),
};

const DEFAULT_SETTINGS = {
  host: 'violet.test',
  pollIntervalSeconds: 60,
  pumpWarmupSeconds: 120,
  dosing_low_threshold_days: 7,
  lsi_enabled: false,
  control_enabled: false,
  show_advanced_diagnostics: false,
};

/**
 * The mock (test/mocks/homey.js) augments the SDK Device surface with its
 * recording state — spelled out here so checkJs can follow the tests.
 * @typedef {InstanceType<typeof PoolDevice> & {
 *   __test: { settings: Object<string, any>, store: Object<string, any>, capabilities: string[] },
 *   _log: { setValue: Array<{cap: string, value: any}>, addCap: string[], removeCap: string[],
 *           setOptions: Array<{cap: string, options: any}>, available: string[],
 *           triggers: Object<string, Array<{tokens: any, state: any}>> },
 * }} TestDevice
 */

// Fresh device wired to a fixture; onInit kicks one async _tick — settle it.
async function makeDevice(fixture, settings = {}) {
  currentFixture = fixture;
  failFetch = false;
  const device = /** @type {TestDevice} */ (/** @type {any} */ (new PoolDevice()));
  device.__test.settings = { ...DEFAULT_SETTINGS, ...settings };
  await device.onInit();
  await new Promise((resolve) => setImmediate(resolve)); // settle the fire-and-forget init tick
  return device;
}

for (const [name, fixture] of Object.entries(FIXTURES)) {
  test(`device reconcile (${name}): tick applies the registry-planned capability set`, async () => {
    const device = await makeDevice(fixture);
    await device._tick();
    const caps = new Set(device.getCapabilities());
    const desired = desiredM2Capabilities({
      features: detectFeatures(fixture),
      overrides: {},
      diagnosticsEnabled: false,
    });
    for (const cap of desired) {
      assert.ok(caps.has(cap), `${name}: expected ${cap} to be added`);
    }
    assert.strictEqual(device._log.available.at(-1) !== 'unavailable', true);
  });
}

test('device reconcile (chlorine-only): measure_chlorine present, none on minimal-pool', async () => {
  const withCl = await makeDevice(FIXTURES['chlorine-only']);
  await withCl._tick();
  assert.ok(withCl.getCapabilities().includes('measure_chlorine'));

  const bare = await makeDevice(FIXTURES['minimal-pool']);
  await bare._tick();
  assert.ok(!bare.getCapabilities().includes('measure_chlorine'));
});

test('device reconcile: second tick with the same fixture is churn-free', async () => {
  const device = await makeDevice(FIXTURES['getReadings.all']);
  await device._tick();
  const adds = device._log.addCap.length;
  const removes = device._log.removeCap.length;
  await device._tick();
  assert.strictEqual(device._log.addCap.length, adds, 'no new addCapability on identical readings');
  assert.strictEqual(device._log.removeCap.length, removes, 'no new removeCapability on identical readings');
});

test('device apply rule: values only land on present capabilities, undefined is skipped', async () => {
  const device = await makeDevice(FIXTURES['salt-electrolysis']);
  await device._tick();
  const caps = new Set(device.getCapabilities());
  assert.ok(device._log.setValue.length > 0, 'tick writes values');
  for (const { cap, value } of device._log.setValue) {
    assert.ok(caps.has(cap), `setCapabilityValue on absent cap ${cap}`);
    assert.notStrictEqual(value, undefined, `undefined must be skipped (${cap})`);
  }
});

test('device availability: 3 consecutive fetch failures → setUnavailable', async () => {
  const device = await makeDevice(FIXTURES['minimal-pool']);
  failFetch = true;
  await device._tick();
  await device._tick();
  await device._tick();
  assert.strictEqual(device._log.available.at(-1), 'unavailable');
});
