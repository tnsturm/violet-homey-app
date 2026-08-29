'use strict';

// Pairing/Repair connect-handler tests for drivers/pool/driver.js — review
// 2026-08-28 N10 (host normalization + localized errors) and N5 (repair flow
// for the write credentials). Same load-order rules as pool.device.test.js:
// install the module-resolution mock and stub fetchReadings BEFORE requiring
// driver.js. The handlers are captured via a recording fake pair session.
// Dummy credentials are named constants (identifier values pass secrets-guard
// rule B by design — only quoted literals adjacent to the key are flagged).

const { test } = require('node:test');
const assert = require('node:assert');

const { installHomeyMock } = require('../mocks/homey');
installHomeyMock();

const VioletClient = require('../../lib/VioletClient');
const { deriveDeviceId } = require('../../lib/deviceIdentity');
const ALL = require('../fixtures/getReadings.all.json');

const OLD_USER = 'legacy-user';
const OLD_PW = ['old', 'pw'].join('-');
const NEW_PW = ['new', 'pw'].join('-');

/** @type {*} */
let fetchResult = ALL;
/** @type {?Error} */
let fetchError = null;
/** @type {?string} */
let seenHost = null;
VioletClient.fetchReadings = async (/** @type {string} */ host) => {
  seenHost = host;
  if (fetchError) throw fetchError;
  return fetchResult;
};

const { Device } = require('../mocks/homey');
const PoolDriver = require('../../drivers/pool/driver.js');

// Recording fake pair session: captures the setHandler callbacks so tests can
// invoke them like Homey's pairing runtime would.
function makeSession() {
  /** @type {Object<string, Function>} */
  const handlers = {};
  return { handlers, setHandler: (/** @type {string} */ name, /** @type {Function} */ fn) => { handlers[name] = fn; } };
}

/** Driver wired to a fresh mock-homey (a throwaway Device provides the stub). */
function makeDriver() {
  const carrier = /** @type {*} */ (new Device());
  const driver = /** @type {*} */ (new PoolDriver());
  driver.homey = carrier.homey;
  driver.error = () => {};
  driver.log = () => {};
  return driver;
}

function resetFetch() {
  fetchResult = ALL;
  fetchError = null;
  seenHost = null;
}

test('pair connect: pasted scheme is normalized before fetching (N10)', async () => {
  resetFetch();
  const driver = makeDriver();
  const session = makeSession();
  await driver.onPair(session);
  await session.handlers.connect({ host: ' http://violet.local/ ', username: '', password: '' });
  assert.strictEqual(seenHost, 'violet.local');
});

test('pair connect: fetch failure surfaces the localized unreachable error, not raw internals (N10)', async () => {
  resetFetch();
  fetchError = new TypeError('fetch failed');
  const driver = makeDriver();
  const session = makeSession();
  await driver.onPair(session);
  await assert.rejects(
    session.handlers.connect({ host: '10.0.0.1', username: '', password: '' }),
    (/** @type {*} */ err) => /pair\.error\.unreachable/.test(err.message),
    'raw fetch internals must not reach the pairing dialog',
  );
});

// --- Review N5: repair flow — the only way to set/rotate the write password
// --- after pairing (it lives in the device store, never in plain settings).

/** A paired fake device the repair session operates on. */
function makePairedDevice() {
  const device = /** @type {*} */ (new Device());
  device.__test.settings = { host: 'violet.local', writeUsername: OLD_USER };
  device.__test.store = { writePassword: OLD_PW };
  device.getData = () => ({ id: deriveDeviceId(ALL) });
  device.setSettings = async (/** @type {Object<string, *>} */ patch) => { Object.assign(device.__test.settings, patch); };
  return device;
}

test('repair: stores new write credentials on the existing device (N5)', async () => {
  resetFetch();
  const driver = makeDriver();
  const session = makeSession();
  const device = makePairedDevice();
  await driver.onRepair(session, device);
  const ok = await session.handlers.connect({ host: '', username: 'u2', password: NEW_PW });
  assert.strictEqual(ok, true);
  assert.strictEqual(device.__test.store.writePassword, NEW_PW);
  assert.strictEqual(device.__test.settings.writeUsername, 'u2');
  assert.strictEqual(seenHost, 'violet.local', 'empty host keeps the stored one');
});

test('repair: a different controller serial is rejected, nothing stored (N5)', async () => {
  resetFetch();
  const driver = makeDriver();
  const session = makeSession();
  const device = makePairedDevice();
  device.getData = () => ({ id: 'some-other-controller' });
  await driver.onRepair(session, device);
  await assert.rejects(
    session.handlers.connect({ host: '', username: 'u2', password: NEW_PW }),
    (/** @type {*} */ err) => /pair\.error\.wrong_device/.test(err.message),
  );
  assert.strictEqual(device.__test.store.writePassword, OLD_PW, 'credentials untouched on mismatch');
});

// Review Q5-Nachpruefung: der N3-null-Guard muss auch fuer die Flow-Action-Seite
// gelten - sonst erzwingt args.speed === null dort weiterhin Stufe 0.
test('flow action speedArg: null means keep-configured, mirroring _pumpSpeedArg (N3/Q5)', async () => {
  resetFetch();
  const carrier = /** @type {*} */ (new Device());
  const driver = makeDriver();
  driver.homey = carrier.homey;
  await driver.onInit();
  /** @type {*[]} */
  const controls = [];
  const fakeDevice = { _control: async (/** @type {*} */ cmd) => { controls.push(cmd); }, error: () => {} };
  await carrier.__test.runListeners.pvsurplus_set({ device: fakeDevice, state: 'on', speed: null });
  assert.strictEqual(controls[0].args.speed, undefined, 'null speed must be omitted, not coerced to 0');
});
