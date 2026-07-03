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
const {
  desiredM2Capabilities,
  buildM2Updates,
  M2_GROUPS,
  DOSING_SUBCAPS,
  DIAGNOSTIC_CAPS,
  dosingChannelPrefix,
} = require('../../lib/FeatureGroups');

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
    // M2 polled-alarm device triggers (spec §7). No filter args → no run listener.
    this._m2Triggers = {
      dosing_blocked: this.homey.flow.getDeviceTriggerCard('dosing_blocked'),
      dosing_low: this.homey.flow.getDeviceTriggerCard('dosing_low'),
      overflow_dryrun: this.homey.flow.getDeviceTriggerCard('overflow_dryrun'),
      overflow_overfill: this.homey.flow.getDeviceTriggerCard('overflow_overfill'),
      backwash_valve_fault: this.homey.flow.getDeviceTriggerCard('backwash_valve_fault'),
    };
    this._m2AlarmState = {}; // capInstanceId -> last boolean (edge detection)
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
    // Toggling control adds/removes the control capabilities — reconcile promptly.
    if (changedKeys.includes('control_enabled')) this._tick().catch(this.error);
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

    // M2 feature-group values (spec §5,§6): status/actuator/consumable caps,
    // updated every poll (not fresh-gated). Merged with the core updates.
    const m2 = buildM2Updates(raw, {
      dosingChannels: features.dosingChannels,
      dosingLowThresholdDays: this.getSetting('dosing_low_threshold_days') ?? 7,
    });
    Object.assign(updates, m2);

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

    // Edge-trigger M2 alarms on false→true only (spec §7). Channel-scoped alarms
    // key their state per instance; tokens carry the channel/reason.
    const CH_LABEL = { cl: 'Chlorine', elo: 'Electrolysis', elorev: 'Electrolysis (rev.)', phm: 'pH-minus', php: 'pH-plus', floc: 'Flocculant' };
    const fireEdge = (capInstance, isOn, card, tokens) => {
      const prev = this._m2AlarmState[capInstance] === true;
      if (isOn && !prev) card.trigger(this, tokens, {}).catch(this.error);
      this._m2AlarmState[capInstance] = isOn === true;
    };
    for (const [cap, val] of Object.entries(m2)) {
      if (typeof val !== 'boolean' || !cap.startsWith('alarm_')) continue;
      // Skip alarms whose capability isn't present (Hidden group / undetected
      // actuator): _reconcileCapabilities already ran this tick, so hasCapability
      // reflects detection ∧ override for this exact instance (spec §7).
      if (!this.hasCapability(cap)) continue;
      const dot = cap.indexOf('.');
      const base = dot > 0 ? cap.slice(0, dot) : cap;
      const ch = dot > 0 ? cap.slice(dot + 1) : null;
      if (base === 'alarm_dosing_blocked') {
        const reason = (raw[`${dosingChannelPrefix(ch)}_STATE`] || []).join(', ');
        fireEdge(cap, val, this._m2Triggers.dosing_blocked, { channel: CH_LABEL[ch] || ch, reason });
      } else if (base === 'alarm_dosing_low') {
        fireEdge(cap, val, this._m2Triggers.dosing_low, { channel: CH_LABEL[ch] || ch, days_left: m2[`measure_dosing_days_left.${ch}`] ?? 0 });
      } else if (base === 'alarm_overflow_dryrun') {
        fireEdge(cap, val, this._m2Triggers.overflow_dryrun, {});
      } else if (base === 'alarm_overflow_overfill') {
        fireEdge(cap, val, this._m2Triggers.overflow_overfill, {});
      } else if (base === 'alarm_omni_valve') {
        fireEdge(cap, val, this._m2Triggers.backwash_valve_fault, { state: String(raw.BACKWASH_OMNI_STATE ?? '') });
      }
    }

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

    // 3) M2 feature-group capabilities (spec M2 §4,§6). Overrides come from the
    //    per-group settings (group_<id>); diagnostics gated by a toggle.
    const m2Overrides = {};
    for (const g of Object.keys(M2_GROUPS)) m2Overrides[g] = this.getSetting(`group_${g}`) || undefined;
    m2Overrides.dosing = this.getSetting('group_dosing') || undefined;
    const diagnosticsEnabled = this.getSetting('show_advanced_diagnostics') === true;
    const desiredM2 = new Set(desiredM2Capabilities({ features, overrides: m2Overrides, diagnosticsEnabled }));

    // Add desired-but-absent; give dosing sub-instances a channel title.
    const CH_TITLE = {
      cl: { en: 'Chlorine', de: 'Chlor' },
      elo: { en: 'Electrolysis', de: 'Elektrolyse' },
      elorev: { en: 'Electrolysis (rev.)', de: 'Elektrolyse (rev.)' },
      phm: { en: 'pH-minus', de: 'pH-Minus' },
      php: { en: 'pH-plus', de: 'pH-Plus' },
      floc: { en: 'Flocculant', de: 'Flockung' },
    };
    const DOSING_NOUN = {
      measure_dosing_days_left: { en: 'days left', de: 'Reichweite' },
      measure_dosing_daily_ml: { en: 'dosed today', de: 'dosiert heute' },
      dosing_active: { en: 'dosing', de: 'dosiert' },
      alarm_dosing_blocked: { en: 'blocked', de: 'blockiert' },
      alarm_dosing_low: { en: 'low', de: 'niedrig' },
    };
    for (const cap of desiredM2) {
      if (this.hasCapability(cap)) continue;
      await this.addCapability(cap).catch(this.error);
      const dot = cap.indexOf('.');
      if (dot > 0) {
        const base = cap.slice(0, dot);
        const ch = cap.slice(dot + 1);
        const noun = DOSING_NOUN[base];
        if (CH_TITLE[ch] && noun) {
          await this.setCapabilityOptions(cap, { title: { en: `${CH_TITLE[ch].en} ${noun.en}`, de: `${CH_TITLE[ch].de} ${noun.de}` } }).catch(this.error);
        }
      }
    }
    // Remove M2 caps no longer desired (Hide override / channel gone). The managed
    // set is derived from the registry so it can never drift or miss an alarm cap
    // (a hand-listed prefix list omitted alarm_overflow_* in an earlier draft).
    const M2_MANAGED_BASES = new Set([
      ...Object.values(M2_GROUPS).flatMap((g) => g.capIds),
      ...DOSING_SUBCAPS,
      ...DIAGNOSTIC_CAPS,
    ]);
    const baseOf = (cap) => (cap.includes('.') ? cap.slice(0, cap.indexOf('.')) : cap);
    for (const cap of [...this.getCapabilities()]) {
      if (M2_MANAGED_BASES.has(baseOf(cap)) && !desiredM2.has(cap)) {
        await this.removeCapability(cap).catch(this.error);
      }
    }

    // 4) M3 control capabilities — present only while control is enabled (SR-07)
    //    AND the hardware is detected (mirrors which read tiles are shown). Default
    //    off ⇒ no control tiles at all (zero accidental-tap surface).
    const controlOn = this.getSetting('control_enabled') === true;
    const desiredControl = new Set();
    if (controlOn) {
      if (features.pump) desiredControl.add('pump_control');
      if (features.light) desiredControl.add('light_control');
      if (features.pvSurplus) desiredControl.add('pvsurplus_control');
    }
    for (const cap of ['pump_control', 'light_control', 'pvsurplus_control']) {
      const want = desiredControl.has(cap);
      if (want && !this.hasCapability(cap)) await this.addCapability(cap).catch(this.error);
      if (!want && this.hasCapability(cap)) await this.removeCapability(cap).catch(this.error);
    }
  }
}

module.exports = PoolDevice;
