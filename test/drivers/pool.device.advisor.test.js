'use strict';

// Advisor wiring tests for drivers/pool/device.js + drivers/pool/driver.js —
// M8.1 spec §7-§9 (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
// Same load-order rules as pool.device.test.js (M4.7 spec §3 D1/D2): install the
// module-resolution mock and stub fetchReadings/fetchConfigFacts BEFORE requiring
// device.js. The pure advisor/text math is covered by its own unit tests; this file
// asserts only the wiring — token shapes, the incomplete/stale degradation, the
// band-edge timeline notification and the two action-card run listeners.

const { test, after } = require('node:test');
const assert = require('node:assert');

const { installHomeyMock } = require('../mocks/homey');
installHomeyMock();

const VioletClient = require('../../lib/VioletClient');
/** @type {*} */
let currentFixture = null;
VioletClient.fetchReadings = async () => currentFixture;

const ConfigSource = require('../../lib/ConfigSource');
// Hermetic: never let device.js hit the network for config facts (M5.7).
ConfigSource.fetchConfigFacts = async () => { throw new Error('config disabled in test'); };

const PoolDevice = require('../../drivers/pool/device.js');
const PoolDriver = require('../../drivers/pool/driver.js');

const ALL = require('../fixtures/getReadings.all.json');

// Balanced starting point for the getReadings.all fixture: pH 7.301 @ 30.2 °C
// (onewire 1) with CH 250 / TA 100 ppm ⇒ LSI ≈ -0.19 ⇒ band "balanced".
// The fixture's DOS_4_PHM channel makes detectFeatures report pH dosing, which
// is what drives the violetDosesPh annotation (spec §8).
const DEFAULT_SETTINGS = {
  host: 'violet.test',
  pollIntervalSeconds: 60,
  pumpWarmupSeconds: 120,
  dosing_low_threshold_days: 7,
  control_enabled: false,
  show_advanced_diagnostics: false,
  lsi_enabled: true,
  waterTempChannel: '1',
  chem_calcium_hardness: 250,
  chem_calcium_unit: 'ppm',
  chem_total_alkalinity: 100,
  chem_alkalinity_unit: 'ppm',
  chem_cya: 0,
  pool_volume_m3: 50,
  chem_ph_minus_type: 'h2so4_15',
  chem_chlorine_type: 'naocl',
};

// Waterworks sheet used by the fill-water tests (14 °dH, K_S4,3 2.5 mmol/L, pH 7.5).
const FILL_SETTINGS = {
  fill_hardness_dh: 14,
  fill_ks43_mmol: 2.5,
  fill_ca_fraction_pct: 75,
  fill_ph: 7.5,
};

// pH 8.2 pushes the same fixture to LSI ≈ +0.71 ⇒ band "scaling" (severity warning).
const SCALING = { ...ALL, pH_value: 8.2 };
// PUMP off ⇒ isFresh() false ⇒ the advisor may not use the live values (spec §9).
const PUMP_OFF = { ...ALL, PUMP: 0 };

/**
 * The mock (test/mocks/homey.js) augments the SDK Device surface with its
 * recording state — spelled out here so checkJs can follow the tests.
 * @typedef {InstanceType<typeof PoolDevice> & {
 *   __test: { settings: Object<string, any>, store: Object<string, any>,
 *             capabilities: string[], runListeners: Object<string, any>,
 *             capabilityValues: Object<string, any> },
 *   _log: { notifications: Array<{excerpt: string}>, errors: string[] },
 * }} TestDevice
 */

/** @type {*[]} */
const openDevices = [];

// Fresh device wired to a fixture; onInit kicks one async _tick — settle it.
/** @param {*} fixture @param {Object<string, *>} [settings] */
async function makeDevice(fixture, settings = {}) {
  currentFixture = fixture;
  const device = /** @type {TestDevice} */ (/** @type {any} */ (new PoolDevice()));
  device.__test.settings = { ...DEFAULT_SETTINGS, ...settings };
  // Static caps from driver.compose.json (review 2026-08-28, Meta M1) — see
  // pool.device.test.js makeDevice for the rationale.
  device.__test.capabilities = ['measure_temperature', 'measure_ph', 'measure_orp', 'pump_running', 'measurements_fresh'];
  await device.onInit();
  await new Promise((resolve) => setImmediate(resolve)); // settle the fire-and-forget init tick
  openDevices.push(device);
  return device;
}

// Release every device: onInit() binds the NOTIFY listener and only onUninit()
// frees it — an undisposed device hangs the test process (pool.device.test.js,
// CI lesson 2026-07-20).
after(async () => {
  for (const device of openDevices) await device.onUninit();
});

test('balance advice tokens: complete inputs yield text, a finite LSI and a lever name', async () => {
  const device = await makeDevice(ALL);
  await device._tick();

  const tokens = await device._balanceAdvice();
  assert.ok(tokens.advice_text.length > 0, 'advice_text must not be empty');
  assert.ok(tokens.advice_text.includes('LSI'), 'advice_text states the current LSI');
  assert.ok(Number.isFinite(tokens.lsi_now) && tokens.lsi_now !== 0, 'lsi_now is the live LSI');
  assert.ok(Number.isFinite(tokens.lsi_predicted), 'lsi_predicted is finite');
  assert.strictEqual(typeof tokens.top_driver, 'string');
  assert.ok(tokens.top_driver.length > 0, 'top_driver is never empty (Flow token contract)');
});

test('balance advice: LSI switched off degrades to explanatory text with 0-fallbacks', async () => {
  const device = await makeDevice(ALL, { lsi_enabled: false });
  await device._tick();

  const tokens = await device._balanceAdvice();
  assert.match(tokens.advice_text, /switched off/, 'text names the disabled LSI calculation');
  assert.strictEqual(tokens.lsi_now, 0, 'Flow tokens cannot be null — 0 fallback (spec §7.1)');
  assert.strictEqual(tokens.lsi_predicted, 0);
  assert.strictEqual(tokens.top_driver, '-', 'top_driver falls back to "-" without a lever');
});

test('balance advice: stale readings degrade to the staleness explanation, never throw', async () => {
  const device = await makeDevice(PUMP_OFF);
  await device._tick();

  const tokens = await device._balanceAdvice();
  assert.match(tokens.advice_text, /not fresh/, 'text explains the stale measurements');
  assert.strictEqual(tokens.lsi_now, 0);
  assert.strictEqual(tokens.lsi_predicted, 0);
  assert.strictEqual(tokens.top_driver, '-');
});

test('balance advice: detected pH dosing annotates the pH lever as Violet-managed', async () => {
  const device = await makeDevice(SCALING);
  await device._tick();

  const tokens = await device._balanceAdvice();
  assert.strictEqual(tokens.top_driver, 'pH', 'pH is the top lever in this scaling case');
  assert.match(tokens.advice_text, /Violet/, 'DOS_4_PHM ⇒ violet_doses_ph note (spec §8)');
});

test('timeline: exactly one notification on the edge into a warning band, none on recovery', async () => {
  const device = await makeDevice(ALL);
  await device._tick(); // balanced — no edge
  assert.strictEqual(device._log.notifications.length, 0);

  currentFixture = SCALING;
  await device._tick(); // balanced → scaling
  assert.strictEqual(device._log.notifications.length, 1, 'one notification on the band edge');
  const { excerpt } = device._log.notifications[0];
  assert.ok(excerpt.length > 0 && excerpt.length <= 200, 'excerpt is non-empty and <= 200 chars');
  assert.ok(excerpt.includes('LSI'), 'excerpt carries band + top lever');

  await device._tick(); // same band — no new edge
  assert.strictEqual(device._log.notifications.length, 1);

  currentFixture = ALL;
  await device._tick(); // recovery to balanced — never notifies (spec §7.3)
  assert.strictEqual(device._log.notifications.length, 1);
});

// Review 2026-08-28 N1: an app restart inside an unchanged warning band must
// not repeat the timeline notification — the band is persisted in the store.
test('timeline: restart inside the same warning band does not re-notify (N1)', async () => {
  const first = await makeDevice(ALL);
  await first._tick(); // balanced
  currentFixture = SCALING;
  await first._tick(); // edge → 1 notification
  assert.strictEqual(first._log.notifications.length, 1);

  const second = /** @type {TestDevice} */ (/** @type {any} */ (new PoolDevice()));
  second.__test.settings = { ...first.__test.settings };
  second.__test.capabilities = [...(/** @type {*} */ (first).__test.capabilities)];
  second.__test.capabilityValues = { ...(/** @type {*} */ (first).__test.capabilityValues) };
  second.__test.store = { ...first.__test.store };
  await second.onInit();
  await new Promise((resolve) => setImmediate(resolve));
  openDevices.push(second);
  await second._tick(); // still scaling — same band as before the restart
  assert.strictEqual(second._log.notifications.length, 0, 'restart must not repeat the band notification (N1)');
});

test('timeline: advisor_timeline off suppresses the notification for the same transition', async () => {
  const device = await makeDevice(ALL, { advisor_timeline: false });
  await device._tick();
  currentFixture = SCALING;
  await device._tick();
  assert.strictEqual(device._log.notifications.length, 0);
});

// Stale readings suppress the LSI itself, so no band edge is reached at all —
// the timeline inherits the lsi_warning suppression rules 1:1 (spec §7.3).
test('timeline: stale readings never notify, even when the values would change the band', async () => {
  const device = await makeDevice(ALL);
  await device._tick(); // balanced
  currentFixture = { ...SCALING, PUMP: 0 };
  await device._tick(); // band would change, but the values are stale
  assert.strictEqual(device._log.notifications.length, 0);
});

test('fill-water tokens: waterworks settings yield a finite LSI, equilibrium pH and a plan', async () => {
  const device = await makeDevice(ALL, FILL_SETTINGS);
  await device._tick();

  const tokens = await device._fillWaterAdvice();
  assert.ok(Number.isFinite(tokens.fill_lsi) && tokens.fill_lsi !== 0, 'fill_lsi is computed');
  assert.ok(tokens.equilibrium_ph > 7, 'equilibrium pH after outgassing is above the tap pH');
  assert.ok(tokens.fill_advice_text.length > 0);
  assert.match(tokens.fill_advice_text, /1\./, 'the startup plan is numbered');
});

test('fill-water tokens: missing waterworks settings yield explanatory text with 0-fallbacks', async () => {
  const device = await makeDevice(ALL);
  await device._tick();

  const tokens = await device._fillWaterAdvice();
  assert.strictEqual(tokens.fill_lsi, 0);
  assert.strictEqual(tokens.equilibrium_ph, 0);
  assert.match(tokens.fill_advice_text, /not possible/, 'text names the missing sheet values');
});

test('driver: both advisor action cards are registered and resolve their tokens', async () => {
  const device = await makeDevice(ALL, FILL_SETTINGS);
  await device._tick();

  // The driver shares the device's recording homey stub, so its registered run
  // listeners land in __test.runListeners and can be invoked like Homey would.
  const driver = /** @type {*} */ (new PoolDriver());
  driver.homey = device.homey;
  await driver.onInit();

  const balance = await device.__test.runListeners.get_balance_advice({ device });
  assert.deepStrictEqual(Object.keys(balance).sort(), ['advice_text', 'lsi_now', 'lsi_predicted', 'top_driver']);
  assert.ok(balance.advice_text.length > 0);

  const fill = await device.__test.runListeners.analyze_fill_water({ device });
  assert.deepStrictEqual(Object.keys(fill).sort(), ['equilibrium_ph', 'fill_advice_text', 'fill_lsi']);
  assert.ok(fill.fill_advice_text.length > 0);
});
