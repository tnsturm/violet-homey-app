'use strict';

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
      this._failures += 1;
      if (this._failures >= 3) await this.setUnavailable('Violet not reachable').catch(this.error);
      return;
    }

    const parsed = parseReadings(raw);
    const features = detectFeatures(raw);
    const now = parsed.timeUnix || Math.floor(Date.now() / 1000);

    // Track pump on/off transition for warmup
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
    for (const [cap, value] of Object.entries(updates)) {
      if (value === null || value === undefined) continue;
      if (this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, value).catch(this.error);
      }
    }
  }

  async _reconcileCapabilities(parsed, features) {
    // 1) feature-group capabilities (M0: chlorine only)
    const overrides = { chlorine: this.getSetting('group_chlorine') || 'auto' };
    const desiredFeatureCaps = desiredFeatureCapabilities({ features, overrides });
    for (const cap of ['measure_chlorine']) {
      const want = desiredFeatureCaps.includes(cap);
      if (want && !this.hasCapability(cap)) await this.addCapability(cap).catch(this.error);
      if (!want && this.hasCapability(cap)) await this.removeCapability(cap).catch(this.error);
    }

    // 2) temperature sub-sensors for each OK channel
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
