'use strict';

// Minimal recording Homey-SDK stub (M4.7 spec §3 D1–D3,
// docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md).
// Provides exactly the Device surface drivers/pool/device.js touches, as
// recording fakes — no scheduling (tests drive _tick() manually), no network,
// no new runtime dependency. installHomeyMock() patches Node's module
// resolution so `require('homey')` (unresolvable locally: the platform ships
// that module on the box, dependencies stays {}) lands here instead.

// `any`-cast: _resolveFilename/__homeyMockInstalled are internal Module APIs
// that @types/node deliberately doesn't declare — the patch point IS internal.
const Module = /** @type {any} */ (require('node:module'));

// Fake Flow trigger card: records trigger calls per card name.
class FakeTriggerCard {
  /** @param {string} name @param {Object<string, Array<*>>} log @param {Object<string, *>} runListeners */
  constructor(name, log, runListeners) {
    this.name = name;
    this._log = log;
    this._runListeners = runListeners;
  }

  /** @param {*} fn */
  registerRunListener(fn) { this.runListener = fn; this._runListeners[this.name] = fn; return this; }

  /** @param {*} device @param {*} tokens @param {*} state */
  trigger(device, tokens, state) {
    (this._log[this.name] = this._log[this.name] || []).push({ tokens, state });
    return Promise.resolve();
  }
}

class Device {
  /** @type {Object<string, FakeTriggerCard>} */
  __cards = {};
  /** @type {Object<string, *>} */
  __listeners = {};

  constructor() {
    /** @type {{settings: Object<string, *>, store: Object<string, *>, capabilities: string[], runListeners: Object<string, *>}} */
    this.__test = { settings: {}, store: {}, capabilities: [], runListeners: {} };
    /** @type {{setValue: Array<*>, addCap: string[], removeCap: string[], setOptions: Array<*>, available: string[], triggers: Object<string, Array<*>>, errors: string[], notifications: Array<*>}} */
    this._log = { setValue: [], addCap: [], removeCap: [], setOptions: [], available: [], triggers: {}, errors: [], notifications: [] };
    this._available = true;
    const triggers = this._log.triggers;
    const runListeners = this.__test.runListeners;
    const notifications = this._log.notifications;
    this.homey = {
      manifest: { capabilities: {} },
      setInterval: () => ({ __fakeInterval: true }), // no real scheduling (spec D3)
      clearInterval: () => {},
      // Minimal i18n stub (device-identity spec, Task 4): tests assert on
      // recorded calls/state, never on exact message text, so returning the
      // key (with tokens appended when present) is enough to keep _control/
      // _tick's `this.homey.__(...)` calls callable under the mock.
      __: (/** @type {string} */ key, /** @type {Object<string, *>} */ tokens) => (tokens ? `${key} ${JSON.stringify(tokens)}` : key),
      // M8.1: the advisor picks its text language here — fixed to 'en' so the
      // wiring tests can assert on stable English fragments (spec §5).
      i18n: { getLanguage: () => 'en' },
      // M8.1: recording stub for the timeline notification (spec §7.3) — the
      // Notifications API's first use in this app.
      notifications: { createNotification: async (/** @type {*} */ notification) => { notifications.push(notification); } },
      flow: {
        getDeviceTriggerCard: (/** @type {string} */ name) => {
          this.__cards[name] = this.__cards[name] || new FakeTriggerCard(name, triggers, runListeners);
          return this.__cards[name];
        },
        // M8.1: action cards reuse the same recording fake — driver.js only ever
        // calls registerRunListener on them, and tests invoke the recorded
        // listener from __test.runListeners like Homey would.
        getActionCard: (/** @type {string} */ name) => {
          this.__cards[name] = this.__cards[name] || new FakeTriggerCard(name, triggers, runListeners);
          return this.__cards[name];
        },
      },
    };
  }

  log() {}

  // M6.1 (Task 4): records `this.error(...)` calls as joined strings so tests
  // can assert a clear error was logged (e.g. EADDRINUSE) without depending on
  // exact call shape (single formatted string vs. multiple args).
  // Arrow field preserves `this` binding when passed as bare callback (e.g. `.catch(this.error)`).
  /** @param {Array<*>} args */
  error = (...args) => { this._log.errors.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')); }

  /** @param {string} key */
  getSetting(key) {
    return Object.prototype.hasOwnProperty.call(this.__test.settings, key) ? this.__test.settings[key] : null;
  }

  /** @param {string} key */
  getStoreValue(key) {
    return Object.prototype.hasOwnProperty.call(this.__test.store, key) ? this.__test.store[key] : null;
  }

  /** @param {string} key @param {*} value */
  async setStoreValue(key, value) { this.__test.store[key] = value; }

  /** @param {string} cap @param {*} fn */
  registerCapabilityListener(cap, fn) {
    this.__listeners[cap] = fn;
  }

  /** @param {string} cap */
  hasCapability(cap) { return this.__test.capabilities.includes(cap); }
  getCapabilities() { return [...this.__test.capabilities]; }

  /** @param {string} cap */
  async addCapability(cap) {
    if (!this.hasCapability(cap)) this.__test.capabilities.push(cap);
    this._log.addCap.push(cap);
  }

  /** @param {string} cap */
  async removeCapability(cap) {
    this.__test.capabilities = this.__test.capabilities.filter((c) => c !== cap);
    this._log.removeCap.push(cap);
  }

  /** @param {string} cap @param {*} value */
  async setCapabilityValue(cap, value) { this._log.setValue.push({ cap, value }); }
  /** @param {string} cap @param {*} options */
  async setCapabilityOptions(cap, options) { this._log.setOptions.push({ cap, options }); }

  getAvailable() { return this._available; }
  async setAvailable() { this._available = true; this._log.available.push('available'); }
  async setUnavailable() { this._available = false; this._log.available.push('unavailable'); }
}

class App {}
// Drivers are constructed directly in the M8.1 action-card test (their `homey` is
// then pointed at a device's stub); onInit only needs log() to exist.
class Driver {
  log() {}
}

// Route `require('homey')` to this file (spec D1). Idempotent.
function installHomeyMock() {
  if (Module.__homeyMockInstalled) return;
  Module.__homeyMockInstalled = true;
  const orig = Module._resolveFilename;
  Module._resolveFilename = function resolveWithHomeyMock(/** @type {string} */ request, /** @type {any[]} */ ...rest) {
    if (request === 'homey') return __filename;
    return orig.call(this, request, ...rest);
  };
}

module.exports = { Device, App, Driver, installHomeyMock };
