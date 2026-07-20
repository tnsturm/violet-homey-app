'use strict';

// Device wiring tests for the M6.1 NOTIFY listener via the recording Homey mock
// (pattern: pool.device.test.js). Real sockets on free 127.0.0.1 ports; hermetic
// otherwise (fetchReadings + ConfigSource stubbed before requiring device.js).

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');

const { installHomeyMock } = require('../mocks/homey');
installHomeyMock();

const VioletClient = require('../../lib/VioletClient');
VioletClient.fetchReadings = async () => require('../fixtures/minimal-pool.json');
const ConfigSource = require('../../lib/ConfigSource');
ConfigSource.fetchConfigFacts = async () => { throw new Error('config disabled in test'); };

const PoolDevice = require('../../drivers/pool/device.js');

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address());
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

/** @param {number} port @param {string} path @returns {Promise<{status: number}>} */
function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode || 0 }));
    }).on('error', reject);
  });
}

/** @param {Object<string, *>} settings */
async function makeDevice(settings) {
  const device = /** @type {*} */ (new PoolDevice());
  device.__test.settings = {
    host: 'violet.test', pollIntervalSeconds: 60, pumpWarmupSeconds: 120,
    dosing_low_threshold_days: 7, lsi_enabled: false, control_enabled: false,
    show_advanced_diagnostics: false, ...settings,
  };
  await device.onInit();
  await new Promise((resolve) => setImmediate(resolve));
  return device;
}

test('onInit binds the listener; a real NOTIFY request fires alarm_received with tokens', async () => {
  const port = await freePort();
  const device = await makeDevice({ notifyPort: port });
  try {
    const res = await get(port, '/violetmessage?ERRORCODE=1234&SUBJECT=Hello%20World');
    assert.strictEqual(res.status, 200);
    const fired = device._log.triggers.alarm_received || [];
    assert.strictEqual(fired.length, 1);
    assert.deepStrictEqual(fired[0].tokens, { errorcode: '1234', subject: 'Hello World' });
    assert.deepStrictEqual(fired[0].state, { errorcode: '1234' });
  } finally { await device.onUninit(); }
});

test('malformed request → 400 and NO trigger (spec §7)', async () => {
  const port = await freePort();
  const device = await makeDevice({ notifyPort: port });
  try {
    const res = await get(port, '/violetmessage?SUBJECT=NoCode');
    assert.strictEqual(res.status, 400);
    assert.strictEqual((device._log.triggers.alarm_received || []).length, 0);
  } finally { await device.onUninit(); }
});

test('run listener: empty filter matches all, non-empty needs exact code match (spec §5)', async () => {
  const port = await freePort();
  const device = await makeDevice({ notifyPort: port });
  try {
    const runListener = device.__test.runListeners.alarm_received;
    assert.ok(runListener, 'run listener registered');
    assert.strictEqual(await runListener({ errorcode: '' }, { errorcode: '1234' }), true);
    assert.strictEqual(await runListener({ errorcode: '  ' }, { errorcode: '1234' }), true);
    assert.strictEqual(await runListener({ errorcode: '1234' }, { errorcode: '1234' }), true);
    assert.strictEqual(await runListener({ errorcode: '0020' }, { errorcode: '1234' }), false);
  } finally { await device.onUninit(); }
});

test('EADDRINUSE: device init survives, this.error called, polling untouched (SR-M6-07)', async () => {
  const port = await freePort();
  const squatter = http.createServer(() => {});
  await new Promise((resolve) => squatter.listen(port, '0.0.0.0', () => resolve(undefined)));
  try {
    const device = await makeDevice({ notifyPort: port });
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the bind rejection land
    assert.ok(device._log.errors.some((/** @type {string} */ m) => /EADDRINUSE|in use/i.test(m)), 'clear error logged');
    assert.ok(device._poll, 'polling still running');
    await device.onUninit();
  } finally { await new Promise((resolve) => squatter.close(() => resolve(undefined))); }
});

test('notifyPort settings change rebinds to the new port (spec §6)', async () => {
  const portA = await freePort();
  const portB = await freePort();
  const device = await makeDevice({ notifyPort: portA });
  try {
    device.__test.settings.notifyPort = portB;
    await device.onSettings({ changedKeys: ['notifyPort'] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const res = await get(portB, '/x?ERRORCODE=7&SUBJECT=moved');
    assert.strictEqual(res.status, 200);
    assert.strictEqual((device._log.triggers.alarm_received || []).length, 1);
    await assert.rejects(get(portA, '/x?ERRORCODE=8&SUBJECT=old')); // old port released
  } finally { await device.onUninit(); }
});

test('onUninit frees the port (SR-M6-07)', async () => {
  const port = await freePort();
  const device = await makeDevice({ notifyPort: port });
  await device.onUninit();
  const reclaim = net.createServer();
  await new Promise((resolve, reject) => {
    reclaim.listen(port, '127.0.0.1', () => reclaim.close(() => resolve(undefined)));
    reclaim.on('error', reject);
  });
});

test('trigger-only data path: an alarm changes no capability and no setting (SR-M6-04)', async () => {
  const port = await freePort();
  const device = await makeDevice({ notifyPort: port });
  try {
    const setValuesBefore = device._log.setValue.length;
    const settingsBefore = JSON.stringify(device.__test.settings);
    await get(port, '/x?ERRORCODE=9999&SUBJECT=evil');
    assert.strictEqual(device._log.setValue.length, setValuesBefore);
    assert.strictEqual(JSON.stringify(device.__test.settings), settingsBefore);
  } finally { await device.onUninit(); }
});

test('rapid unawaited rebinds leave exactly one live listener — no orphan (SR-M6-07)', async () => {
  const portA = await freePort();
  const portB = await freePort();
  const device = await makeDevice({ notifyPort: portA });
  try {
    device.__test.settings.notifyPort = portB;
    // Two overlapping lifecycle transitions, deliberately not awaited in between.
    const p1 = device._startNotifyServer();
    const p2 = device._startNotifyServer();
    await Promise.all([p1, p2]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const res = await get(portB, '/x?ERRORCODE=5&SUBJECT=new');
    assert.strictEqual(res.status, 200);
    await assert.rejects(get(portA, '/x?ERRORCODE=6&SUBJECT=old'));
    assert.strictEqual((device._log.triggers.alarm_received || []).length, 1);
  } finally { await device.onUninit(); }
});
