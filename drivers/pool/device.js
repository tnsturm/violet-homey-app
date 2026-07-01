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
const { computeLSI, classifyLSI, toPpmCaCO3 } = require('../../lib/Lsi');

class PoolDevice extends Homey.Device {
  async onInit() {
    this._failures = 0;
    this._lastLsiBand = null;
    this._lsiWarning = this.homey.flow.getDeviceTriggerCard('lsi_warning');
    this._lsiWarning.registerRunListener((args, state) => {
      if (args.filter === 'all') return true;
      if (args.filter === 'critical') return state.severity === 'critical';
      return state.direction === args.filter; // 'corrosive' | 'scaling'
    });
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
    // LSI toggle / chemistry edits take effect on the next poll — re-tick promptly.
    if (changedKeys.some((k) => k === 'lsi_enabled' || k.startsWith('chem_'))) {
      this._tick().catch(this.error);
    }
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

    // Freshness from the payload's PUMP_LAST_ON (M1 §10; notes 2026-06-26 §1):
    // survives restarts, single coherent controller clock.
    const fresh = isFresh({
      pumpOn: parsed.pumpOn,
      pumpLastOn: parsed.pumpLastOn,
      now,
      warmupSeconds: this.getSetting('pumpWarmupSeconds') ?? 120,
    });

    await this._reconcileCapabilities(parsed, features);

    const primaryChannel = choosePrimaryTemperature(parsed.tempChannels, this.getSetting('waterTempChannel'));

    // LSI (M1 §6,§9): only when enabled AND fresh; temperature falls back to the
    // fixed setting when no water-temp sensor is available/selected.
    let lsi = null;
    if (this.getSetting('lsi_enabled') === true && fresh) {
      const tempC = primaryChannel != null ? primaryChannel : (this.getSetting('chem_fixed_temperature') ?? null);
      lsi = computeLSI({
        pH: parsed.ph,
        tempC,
        calciumHardnessPpm: toPpmCaCO3(this.getSetting('chem_calcium_hardness'), this.getSetting('chem_calcium_unit') || 'ppm'),
        totalAlkalinityPpm: toPpmCaCO3(this.getSetting('chem_total_alkalinity'), this.getSetting('chem_alkalinity_unit') || 'ppm'),
        cya: this.getSetting('chem_cya') ?? 0,
      });
    }

    // Classify once: drives both the tile alarm capability and the edge-trigger.
    const cls = classifyLSI(lsi);
    // Water-balance alarm (M1 §7.3): true whenever the LSI is outside the
    // balanced band (warning or critical); false when balanced/stale/disabled.
    const alarm = !!cls && cls.severity !== 'ok';

    const updates = buildCapabilityUpdates({ parsed, fresh, primaryChannel, lsi, alarm });

    // Edge-trigger the warning only when the band CHANGES into a non-balanced
    // state (M1 §7,§9). null (disabled/stale/incomplete) clears the tracked band
    // and never fires; _lastLsiBand is in-memory (may re-fire once after restart).
    const band = cls ? cls.band : null;
    if (cls && cls.severity !== 'ok' && band !== this._lastLsiBand) {
      this._lsiWarning
        .trigger(this, { lsi, classification: cls.band, direction: cls.direction, severity: cls.severity }, { direction: cls.direction, severity: cls.severity })
        .catch(this.error);
    }
    this._lastLsiBand = band;

    // Apply rule (clear-stale §3): undefined = leave as-is; null = clear to "–"
    // (Insights gap); else set. What is fresh-gated/cleared is decided in /lib (§7).
    for (const [cap, value] of Object.entries(updates)) {
      if (value === undefined) continue;
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

    // measure_lsi + alarm_water_balance present iff LSI is enabled (M1 §6,§7.3).
    // Disabling removes them (can break user Flows — accepted, user's choice).
    const wantLsi = this.getSetting('lsi_enabled') === true;
    for (const cap of ['measure_lsi', 'alarm_water_balance']) {
      if (wantLsi && !this.hasCapability(cap)) await this.addCapability(cap).catch(this.error);
      if (!wantLsi && this.hasCapability(cap)) await this.removeCapability(cap).catch(this.error);
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
