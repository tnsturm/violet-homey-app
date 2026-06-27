'use strict';

// Pool device — polling glue — spec §5, §7, §8, §9, §10
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Thin runtime layer: each poll fetches readings, runs the pure lib modules
// (parse / detect / freshness / capability planning) and applies the result to
// Homey. All non-trivial logic lives in /lib; this file just wires it.

const Homey = require('homey');
const { fetchReadings, parseReadings } = require('../../lib/VioletClient');
const { detectFeatures } = require('../../lib/FeatureDetector');
const { isFresh } = require('../../lib/Freshness');
const {
  channelSubCapId,
  choosePrimaryTemperature,
  desiredFeatureCapabilities,
  buildCapabilityUpdates,
} = require('../../lib/Capabilities');

class PoolDevice extends Homey.Device {
  async onInit() {
    this._pumpOnSince = null;
    this._failures = 0;
    this._startPolling();
    this.log('Pool device initialized');
  }

  _startPolling() {
    if (this._poll) this.homey.clearInterval(this._poll);
    // Poll interval from settings; 60s fallback (lowered in M0 — notes/2026-06-26-m1-inputs.md §3).
    const seconds = this.getSetting('pollIntervalSeconds') || 60;
    this._poll = this.homey.setInterval(() => this._tick().catch(this.error), seconds * 1000);
    this._tick().catch(this.error);
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('pollIntervalSeconds')) this._startPolling();
  }

  async onUninit() {
    if (this._poll) this.homey.clearInterval(this._poll);
  }

  async _tick() {
    const host = this.getSetting('host');
    let raw;
    try {
      raw = await fetchReadings(host, { timeoutMs: 10000 });
      this._failures = 0;
      if (!this.getAvailable()) await this.setAvailable().catch(this.error);
    } catch (err) {
      // 3 consecutive failures → unavailable; transient errors keep last values (spec §10).
      this._failures += 1;
      if (this._failures >= 3) await this.setUnavailable('Violet not reachable').catch(this.error);
      return;
    }

    const parsed = parseReadings(raw);
    const features = detectFeatures(raw);
    // Prefer the controller clock for warmup math; fall back to local time if absent.
    const now = parsed.timeUnix || Math.floor(Date.now() / 1000);

    // Rising-edge warmup tracking (spec §7): remember when the pump last turned on
    // so isFresh() can require continuous circulation. In-memory by design in M0;
    // M1 replaces this with PUMP_LAST_ON (notes/2026-06-26-m1-inputs.md §1).
    if (parsed.pumpOn) {
      if (this._pumpOnSince === null) this._pumpOnSince = now;
    } else {
      this._pumpOnSince = null;
    }
    const fresh = isFresh({
      pumpOn: parsed.pumpOn,
      pumpOnSince: this._pumpOnSince,
      now,
      warmupSeconds: this.getSetting('pumpWarmupSeconds') ?? 120,
    });

    await this._reconcileCapabilities(parsed, features);

    const primaryChannel = choosePrimaryTemperature(parsed.tempChannels, this.getSetting('waterTempChannel'));
    const updates = buildCapabilityUpdates({ parsed, fresh, primaryChannel });
    // Skip null/undefined: "no fresh value yet" must not overwrite the last good one (spec §7).
    for (const [cap, value] of Object.entries(updates)) {
      if (value === null || value === undefined) continue;
      if (this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, value).catch(this.error);
      }
    }
  }

  async _reconcileCapabilities(parsed, features) {
    // 1) Feature-group capabilities via auto-detect + override (spec §9; M0: chlorine only).
    const overrides = { chlorine: this.getSetting('group_chlorine') || 'auto' };
    const desiredFeatureCaps = desiredFeatureCapabilities({ features, overrides });
    for (const cap of ['measure_chlorine']) {
      const want = desiredFeatureCaps.includes(cap);
      if (want && !this.hasCapability(cap)) await this.addCapability(cap).catch(this.error);
      if (!want && this.hasCapability(cap)) await this.removeCapability(cap).catch(this.error);
    }

    // 2) One read-only sub-sensor per OK temperature channel so the user can
    //    identify the water channel (spec §8); drop sub-sensors that vanished.
    const wanted = new Set(parsed.tempChannels.map((c) => channelSubCapId(c.id)));
    for (const ch of parsed.tempChannels) {
      const cap = channelSubCapId(ch.id);
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch(this.error);
        await this.setCapabilityOptions(cap, { title: { en: `Sensor ${ch.id}`, de: `Sensor ${ch.id}` } }).catch(this.error);
      }
    }
    for (const cap of [...this.getCapabilities()]) {
      if (cap.startsWith('measure_temperature.ow') && !wanted.has(cap)) {
        await this.removeCapability(cap).catch(this.error);
      }
    }
  }
}

module.exports = PoolDevice;
