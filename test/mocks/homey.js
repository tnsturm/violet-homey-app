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
  /** @param {string} name @param {Object<string, Array<*>>} log */
  constructor(name, log) {
    this.name = name;
    this._log = log;
  }

  /** @param {*} fn */
  registerRunListener(fn) { this.runListener = fn; return this; }

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
    /** @type {{settings: Object<string, *>, store: Object<string, *>, capabilities: string[]}} */
    this.__test = { settings: {}, store: {}, capabilities: [] };
    /** @type {{setValue: Array<*>, addCap: string[], removeCap: string[], setOptions: Array<*>, available: string[], triggers: Object<string, Array<*>>}} */
    this._log = { setValue: [], addCap: [], removeCap: [], setOptions: [], available: [], triggers: {} };
    this._available = true;
    const triggers = this._log.triggers;
    this.homey = {
      manifest: { capabilities: {} },
      setInterval: () => ({ __fakeInterval: true }), // no real scheduling (spec D3)
      clearInterval: () => {},
      flow: {
        getDeviceTriggerCard: (/** @type {string} */ name) => {
          this.__cards[name] = this.__cards[name] || new FakeTriggerCard(name, triggers);
          return this.__cards[name];
        },
      },
    };
  }

  log() {}
  error() {}

  /** @param {string} key */
  getSetting(key) {
    return Object.prototype.hasOwnProperty.call(this.__test.settings, key) ? this.__test.settings[key] : null;
  }

  /** @param {string} key */
  getStoreValue(key) {
    return Object.prototype.hasOwnProperty.call(this.__test.store, key) ? this.__test.store[key] : null;
  }

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
class Driver {}

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
