'use strict';

// First reconcile/apply tests for drivers/pool/device.js via the recording Homey
// mock (M4.7 spec §3, docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md).
// Load order matters (spec §3 D1/D2): install the module-resolution mock and stub
// VioletClient.fetchReadings BEFORE requiring device.js — its top-level destructure
// must pick up the stub. Expectations derive from the SAME pure planners the device
// wires (desiredM2Capabilities), grounded by fixture-specific spot checks.

const { test, after } = require('node:test');
const assert = require('node:assert');

const { installHomeyMock } = require('../mocks/homey');
installHomeyMock();

const VioletClient = require('../../lib/VioletClient');
/** @type {*} */
let currentFixture = null;
let failFetch = false;
VioletClient.fetchReadings = async () => {
  if (failFetch) throw new Error('simulated unreachable');
  return currentFixture;
};

const ConfigSource = require('../../lib/ConfigSource');
// Hermetic tests: never let device.js hit the network for config (M5.7); the
// rejecting stub keeps these tests on the config-less fallback path.
ConfigSource.fetchConfigFacts = async () => { throw new Error('config disabled in test'); };

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
 *   __test: { settings: Object<string, any>, store: Object<string, any>, capabilities: string[],
 *             capabilityValues: Object<string, any> },
 *   _log: { setValue: Array<{cap: string, value: any}>, addCap: string[], removeCap: string[],
 *           setOptions: Array<{cap: string, options: any}>, available: string[],
 *           triggers: Object<string, Array<{tokens: any, state: any}>>, errors: string[],
 *           notifications: Array<{excerpt: string}> },
 * }} TestDevice
 */

// Fresh device wired to a fixture; onInit kicks one async _tick — settle it.
/** @param {*} fixture @param {Object<string, *>} [settings] */
async function makeDevice(fixture, settings = {}) {
  currentFixture = fixture;
  failFetch = false;
  const device = /** @type {TestDevice} */ (/** @type {any} */ (new PoolDevice()));
  device.__test.settings = { ...DEFAULT_SETTINGS, ...settings };
  // Static caps from driver.compose.json — a really paired device always has
  // them; without this seed the hasCapability guard drops every core write
  // and the whole apply path is test-blind (review 2026-08-28, Meta M1).
  device.__test.capabilities = ['measure_temperature', 'measure_ph', 'measure_orp', 'pump_running', 'measurements_fresh'];
  await device.onInit();
  await new Promise((resolve) => setImmediate(resolve)); // settle the fire-and-forget init tick
  openDevices.push(device);
  return device;
}

/** @type {*[]} */
const openDevices = [];

// M6.1 spec §6: onInit() binds the NOTIFY listener, and only onUninit() frees it.
// An undisposed device therefore leaves a live 0.0.0.0:<notifyPort> handle and the
// test process never exits — that hung CI for six runs (2026-07-20). It stayed
// invisible locally because port 22222 is occupied there, so the bind fails and no
// handle is created. Dispose every device, then assert the absence of the handle.
after(async () => {
  for (const device of openDevices) await device.onUninit();
  // A closed server can linger one tick as an unreaped handle, so its mere presence
  // proves nothing — a LEAKED listener is one that still reports a bound address.
  assert.deepStrictEqual(boundHandleAddresses(), [], 'a NOTIFY listener leaked — this test process would hang instead of exiting');
});

/** Addresses of every still-bound handle (stdio pipes report no port). @returns {*[]} */
function boundHandleAddresses() {
  return /** @type {*} */ (process)._getActiveHandles()
    .filter((/** @type {*} */ h) => typeof h.address === 'function')
    .map((/** @type {*} */ h) => h.address())
    .filter((/** @type {*} */ a) => a && a.port);
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

test('apply order: measurements_fresh is written after the probe values (F5)', async () => {
  const device = await makeDevice(FIXTURES['getReadings.all']);
  await device._tick();
  const caps = device._log.setValue.map((w) => w.cap);
  const freshIdx = caps.lastIndexOf('measurements_fresh');
  assert.ok(freshIdx > caps.lastIndexOf('measure_ph'), 'fresh before ph — a Flow gate would race the values');
  assert.strictEqual(freshIdx, caps.length - 1, 'measurements_fresh must be the last write of the batch');
});

// Review 2026-08-28 P1 (defensive): a present-but-implausible controller clock
// (RTC reset after power loss → epoch ~0) must invalidate PUMP_LAST_ON from the
// same clock — mixing local `now` with a broken timestamp fakes a huge warmup.
test('controller clock at 0 (RTC reset) must not count as fresh (P1)', async () => {
  const fixture = { ...FIXTURES['getReadings.all'], CURRENT_TIME_UNIX: 0, PUMP_LAST_ON: 0, PUMP: '1' };
  const device = await makeDevice(fixture);
  device._log.setValue.length = 0;
  await device._tick();
  const freshWrite = device._log.setValue.find((w) => w.cap === 'measurements_fresh');
  assert.strictEqual(freshWrite?.value, false, 'broken controller clock ⇒ warmup unprovable ⇒ stale');
});

// Review 2026-08-28 N4: before the first successful poll _lastParsed is null —
// the advisor must report the stale reason, not a missing-list that blames
// chem settings the user did enter (contradicts the _adviseNow comment, spec §9).
test('advisor before first successful poll reports stale, not a fake missing list (N4)', async () => {
  // Inline construction (makeDevice resets failFetch): the onInit tick fails,
  // so no poll has ever succeeded when the Flow action asks for advice.
  const device = /** @type {TestDevice} */ (/** @type {any} */ (new PoolDevice()));
  device.__test.settings = {
    ...DEFAULT_SETTINGS, lsi_enabled: true, chem_calcium_hardness: 250, chem_total_alkalinity: 100, pool_volume_m3: 30,
  };
  device.__test.capabilities = ['measure_temperature', 'measure_ph', 'measure_orp', 'pump_running', 'measurements_fresh'];
  failFetch = true;
  await device.onInit();
  await new Promise((resolve) => setImmediate(resolve));
  openDevices.push(device);
  const advice = await device._balanceAdvice();
  assert.match(advice.advice_text, /not fresh/i, 'the stale reason must be named');
  assert.doesNotMatch(advice.advice_text, /calcium|alkalinity/i, 'must not claim entered settings are missing');
});

// Review 2026-08-28 N3: getSetting returns null for a never-set key (pre-M3
// paired devices never get the compose default backfilled) — Number(null)=0 is
// a VALID pump speed and would force stage 0 instead of keep-configured.
test('_pumpSpeedArg: never-set setting (null) means keep-configured, not speed 0 (N3)', async () => {
  const device = await makeDevice(FIXTURES['minimal-pool']); // control_pump_speed absent → getSetting → null
  assert.strictEqual(device._pumpSpeedArg(), undefined);
  device.__test.settings.control_pump_speed = 'default';
  assert.strictEqual(device._pumpSpeedArg(), undefined);
  device.__test.settings.control_pump_speed = '2';
  assert.strictEqual(device._pumpSpeedArg(), 2);
});

// --- Review 2026-08-28, N1/P6: alarm edge state must survive an app restart
// --- (no phantom edge) and a Hide/Unhide cycle (re-announce, no swallowed edge).

const DOSING_LOW_FIXTURE = { ...FIXTURES['salt-electrolysis'], DOS_2_ELO_REMAINING_RANGE: '2d' };

test('restart: persisted alarm state does not re-fire the trigger (N1)', async () => {
  const first = await makeDevice(DOSING_LOW_FIXTURE);
  await first._tick();
  // Both fixture channels (elo patched to 2d, phm at 5d) are below the 7d
  // threshold — the count only matters relatively: >0 before, 0 after restart.
  assert.ok((first._log.triggers.dosing_low || []).length > 0, 'precondition: edge fires on the first instance');

  // Simulate an app restart: fresh instance, Homey-persisted device state copied.
  const second = /** @type {TestDevice} */ (/** @type {any} */ (new PoolDevice()));
  second.__test.settings = { ...first.__test.settings };
  second.__test.capabilities = [...first.__test.capabilities];
  second.__test.capabilityValues = { ...first.__test.capabilityValues };
  second.__test.store = { ...first.__test.store };
  await second.onInit();
  await new Promise((resolve) => setImmediate(resolve));
  openDevices.push(second);
  await second._tick();
  assert.strictEqual((second._log.triggers.dosing_low || []).length, 0, 'restart with unchanged state must not re-fire (N1)');
});

test('hide/unhide: alarm edge fires again after the capability returns (P6)', async () => {
  const blocked = { ...FIXTURES['salt-electrolysis'], DOS_2_ELO_STATE: '0|BLOCKED_BY_SENSOR_FAULT' };
  const device = await makeDevice(blocked);
  await device._tick();
  const firedBefore = (device._log.triggers.dosing_blocked || []).length;
  assert.ok(firedBefore > 0, 'precondition: blocked edge fires');
  device.__test.settings.group_dosing = 'hide';
  await device._tick(); // user-driven removal — immediate (F2)
  assert.ok(!device.getCapabilities().includes('alarm_dosing_blocked.elo'), 'precondition: cap removed while hidden');
  device.__test.settings.group_dosing = 'auto';
  await device._tick(); // caps re-added, alarms still active — every one re-announces
  assert.strictEqual((device._log.triggers.dosing_blocked || []).length, firedBefore * 2, 'unhide must re-announce the still-active alarms');
});

// --- Review 2026-08-28, F2: capability teardown is debounced over 3 polls;
// --- explicit user choices (Hide override) stay immediate.

test('reconcile debounce: one FAULT poll does not remove the ow sub-capability (F2)', async () => {
  const fixture = FIXTURES['getReadings.all'];
  const device = await makeDevice(fixture);
  await device._tick();
  assert.ok(device.getCapabilities().some((c) => c.startsWith('measure_temperature.ow')), 'precondition: ow caps exist');
  currentFixture = { ...fixture, onewire1_state: 'FAULT' };
  await device._tick();
  assert.ok(
    !device._log.removeCap.some((c) => c === 'measure_temperature.ow1'),
    'a single deviant poll must not tear down capabilities',
  );
  await device._tick();
  await device._tick(); // 3rd consecutive absence — now it may go
  assert.ok(
    device._log.removeCap.includes('measure_temperature.ow1'),
    'after 3 consecutive absences the removal happens',
  );
});

test('reconcile debounce: user Hide override removes immediately (F2)', async () => {
  const device = await makeDevice(FIXTURES['chlorine-only']);
  await device._tick();
  assert.ok(device.getCapabilities().includes('measure_chlorine'), 'precondition: chlorine detected');
  device.__test.settings.group_chlorine = 'hide';
  await device._tick();
  assert.ok(device._log.removeCap.includes('measure_chlorine'), 'explicit user choice stays immediate');
});

// --- Review 2026-08-28, F1/F3: the failure path must log and must not keep
// --- declaring day-old values fresh (repro executed in the review).

test('poll failure: first error of a streak is logged via this.error (F3, M0 §10)', async () => {
  const device = await makeDevice(FIXTURES['minimal-pool']);
  device._log.errors.length = 0;
  failFetch = true;
  await device._tick();
  assert.ok(device._log.errors.some((e) => e.includes('poll failed')), 'first failure must reach this.error');
});

test('outage: 3rd consecutive failure clears freshness and probes (F1)', async () => {
  const device = await makeDevice(FIXTURES['getReadings.all']);
  await device._tick(); // good poll: fresh values on the tiles
  failFetch = true;
  await device._tick();
  await device._tick();
  const before = device._log.setValue.length;
  await device._tick(); // 3rd failure — threshold
  const writes = device._log.setValue.slice(before);
  assert.strictEqual(
    writes.find((w) => w.cap === 'measurements_fresh')?.value, false,
    'measurements_fresh must be published false on outage',
  );
  assert.strictEqual(writes.find((w) => w.cap === 'measure_ph')?.value, null, 'probes clear to the stale shape');
  assert.strictEqual(device._lastFresh, false, 'advisor state must degrade to stale');
});

test('outage: advisor answers stale, not with day-old numbers (F1/C-1)', async () => {
  const device = await makeDevice(FIXTURES['getReadings.all'], {
    lsi_enabled: true, chem_calcium_hardness: 250, chem_total_alkalinity: 100, pool_volume_m3: 30,
  });
  await device._tick();
  failFetch = true;
  await device._tick();
  await device._tick();
  await device._tick();
  const advice = await device._balanceAdvice();
  assert.match(advice.advice_text, /not fresh/i, 'advice must name the stale reason, not prescribe doses');
});
