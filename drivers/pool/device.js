'use strict';

// Pool device — polling glue — spec §5, §7, §8, §9, §10
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Thin runtime layer: each poll fetches readings, runs the pure lib modules
// (parse / detect / freshness / capability planning) and applies the result to
// Homey. All non-trivial logic lives in /lib; this file just wires it.
// Runtime-error i18n (boundary wrapping): spec 2026-07-13-device-identity-design.md.

const Homey = require('homey');
const { fetchReadings, parseReadings } = require('../../lib/VioletClient');
const { sendWrite } = require('../../lib/WriteClient');
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
  diagAnnotatable,
  diagRawValue,
} = require('../../lib/FeatureGroups');
// Namespace require (not destructured): the device config tests stub
// ConfigSource.fetchConfigFacts at runtime — a top-level destructure would
// bind the pre-stub reference and miss it (M5.7 spec §4).
const ConfigSource = require('../../lib/ConfigSource');

// Per-channel dosing tile labels (shared by capability reconcile and the
// diagnostics title annotation) — the base title a `<base>.<ch>` tile shows.
/** @type {Object<string, {en: string, de: string}>} */
const CH_TITLE = {
  cl: { en: 'Chlorine', de: 'Chlor' },
  elo: { en: 'Electrolysis', de: 'Elektrolyse' },
  elorev: { en: 'Electrolysis (rev.)', de: 'Elektrolyse (rev.)' },
  phm: { en: 'pH-minus', de: 'pH-Minus' },
  php: { en: 'pH-plus', de: 'pH-Plus' },
  floc: { en: 'Flocculant', de: 'Flockung' },
};
/** @type {Object<string, {en: string, de: string}>} */
const DOSING_NOUN = {
  measure_dosing_days_left: { en: 'days left', de: 'Reichweite' },
  measure_dosing_daily_ml: { en: 'dosed today', de: 'dosiert heute' },
  dosing_active: { en: 'dosing', de: 'dosiert' },
  alarm_dosing_blocked: { en: 'blocked', de: 'blockiert' },
  alarm_dosing_low: { en: 'low', de: 'niedrig' },
};

class PoolDevice extends Homey.Device {
  // Instance-state field declarations (checkJs strict, M5 gate c): typed here so
  // reads in _tick/_reconcile aren't seen as possibly-undefined. onInit assigns
  // the real values; these defaults exist only to pin the types.
  /** @type {number} */
  _failures = 0;
  /** @type {Object<string, boolean>} capInstanceId → last boolean (edge detection) */
  _m2AlarmState = {};
  /** @type {Object<string, *>} capId → FlowCardTriggerDevice */
  _m2Triggers = {};
  /** @type {?import('../../lib/ConfigSource').ConfigFacts} */
  _configFacts = null;
  /** @type {number} consecutive failed config fetches (spec §4.3: stop after 3) */
  _configAttempts = 0;
  /** @type {?number} CONFIGCHANGEMARKER seen on the previous poll */
  _lastSeenMarker = null;
  /** @type {ReturnType<typeof ConfigSource.createConfigLogThrottle>} */
  _configThrottle = ConfigSource.createConfigLogThrottle();
  /** @type {Object<string, string>} capId → applied onewire title (churn guard, spec §5) */
  _owTitleState = {};

  async onInit() {
    this._failures = 0;
    /** @type {?string} */
    this._lastLsiBand = null;
    /** @type {*} Homey FlowCardTriggerDevice (SDK type is loose here). */
    this._lsiWarning = this.homey.flow.getDeviceTriggerCard('lsi_warning');
    this._lsiWarning.registerRunListener((/** @type {*} */ args, /** @type {*} */ state) => {
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
    this._m2AlarmState = {};

    // M3 control tiles (spec §5/§8). Registered by id regardless of current
    // presence; taps route here once the cap is added. Each gates on the interlock.
    this.registerCapabilityListener('pump_control', async (/** @type {string} */ value) => {
      const durationSecs = value === 'auto' ? 0 : (this.getSetting('control_default_duration_min') ?? 60) * 60;
      await this._control({ target: 'PUMP', state: value.toUpperCase(), args: { duration: durationSecs, speed: this._pumpSpeedArg() } }, 'pump_control');
    });
    this.registerCapabilityListener('light_control', async (/** @type {string} */ value) => {
      await this._control({ target: 'LIGHT', state: value.toUpperCase() }, 'light_control');
    });
    this.registerCapabilityListener('pvsurplus_control', async (/** @type {*} */ value) => {
      const speed = this._pumpSpeedArg();
      await this._control(value
        ? { target: 'PVSURPLUS', state: 'ON', args: { speed: speed === 0 ? undefined : speed } }
        : { target: 'PVSURPLUS', state: 'OFF' }, 'pvsurplus_control');
    });

    // M5.7 (spec §4.1): config facts persist in the device store (whitelisted
    // by construction, SR-12); the init tick refreshes them if needed.
    this._configFacts = this.getStoreValue('configFacts') || null;

    this._startPolling();
    this.log('Pool device initialized');
  }

  // Read write credentials at send time: username from settings, password from the
  // device store — hidden from the settings UI, not encrypted at rest (threat model,
  // corrected 2026-07-13) (SR-01/02). Throws (nothing sent) if the password is unset.
  _writeCreds() {
    const username = this.getSetting('writeUsername') || '';
    const password = this.getStoreValue('writePassword') || '';
    if (!password) throw new Error(this.homey.__('error.write_creds_missing'));
    return { username, password };
  }

  // M5.7 config lifecycle (spec §4): fetch facts (a) until first success, max 3
  // consecutive attempts, (b) whenever CONFIGCHANGEMARKER moves vs the stored
  // fetch-time marker (config changed — incl. offline changes), or (c) after the
  // attempt budget, when the marker moves between polls. Errors never touch
  // availability (SR-16); credentials only as restricted-fallback (SR-14).
  /** @param {?number} marker CONFIGCHANGEMARKER from this poll, or null. */
  async _maybeRefreshConfig(marker) {
    const storedMarker = /** @type {?number} */ (this.getStoreValue('configMarker'));
    const markerMoved = marker !== null && storedMarker !== null && marker !== storedMarker;
    const markerMovedBetweenPolls = marker !== null && this._lastSeenMarker !== null && marker !== this._lastSeenMarker;
    const needFirstFacts = this._configFacts === null
      && (this._configAttempts < 3 || markerMovedBetweenPolls);
    this._lastSeenMarker = marker;
    if (!needFirstFacts && !markerMoved) return;

    // Write creds double as the restricted-fallback for the config read (SR-14);
    // absent creds keep the default credential-free path.
    const password = this.getStoreValue('writePassword') || '';
    const credentials = password ? { username: this.getSetting('writeUsername') || '', password } : null;
    try {
      const facts = await ConfigSource.fetchConfigFacts(this.getSetting('host'), { credentials });
      this._configFacts = facts;
      this._configAttempts = 0;
      await this.setStoreValue('configFacts', facts).catch(this.error);
      if (marker !== null) await this.setStoreValue('configMarker', marker).catch(this.error);
      if (this._configThrottle.success(Date.now()) === 'recovered') this.log('config source recovered');
      if (markerMoved) this.log('config change detected (marker', storedMarker, '→', marker, ') — re-detected features');
    } catch (err) {
      this._configAttempts += 1;
      const gate = this._configThrottle.failure(Date.now());
      // Sanitized: message only — never the response body, never credentials (SR-12/SR-02).
      if (gate) this.log('config source unavailable (falling back to history heuristic):', err instanceof Error ? err.message : String(err));
    }
  }

  // Gate every write on the interlock (SR-07), then log the attempt before sending
  // so failed/blocked writes are still audited (SR-10). Logs only target + args,
  // never credentials (SR-02). `label` is a short op name.
  /**
   * @param {{target:string, scene?:number, state:string, args?:Object<string, *>}} cmd
   * @param {string} label Short op name for the audit log.
   */
  async _control(cmd, label) {
    if (this.getSetting('control_enabled') !== true) {
      throw new Error(this.homey.__('error.control_disabled'));
    }
    this.log('control', label, cmd.target, cmd.state, JSON.stringify(cmd.args || {}));
    // Creds resolve BEFORE the try: their localized error must not be re-wrapped
    // as write_failed below (device-identity spec §User-visible localization).
    const creds = this._writeCreds();
    let res;
    try {
      res = await sendWrite(this.getSetting('host'), creds, cmd);
    } catch (err) {
      // Localize at the Homey boundary; /lib throws stay pure English and are
      // logged as diagnostic detail (credential-free by SR-09). 401/403 = the
      // likely user error (wrong write password) → dedicated actionable message;
      // RangeError = registry validation (reachable via bad Flow args, e.g.
      // negative duration) → invalid_value.
      const msg = err instanceof Error ? err.message : String(err);
      this.error('control', label, 'failed:', msg);
      if (err instanceof RangeError) throw new Error(this.homey.__('error.invalid_value', { detail: msg }));
      if (/HTTP (401|403)\b/.test(msg)) throw new Error(this.homey.__('error.write_auth'));
      throw new Error(this.homey.__('error.write_failed', { detail: msg }));
    }
    if (!res.ok) throw new Error(this.homey.__('error.controller_rejected', { label }));
    return res;
  }

  // Tile pump speed from settings: 'default' ⇒ omit (keep configured), else 0-3.
  _pumpSpeedArg() {
    const s = this.getSetting('control_pump_speed');
    return s === undefined || s === 'default' ? undefined : Number(s);
  }

  // Base (un-annotated) title a tile should show, reconstructed deterministically
  // (restart-safe — never read from a possibly-annotated live title). Dosing
  // sub-caps use the channel label + noun; other caps use the manifest title.
  /** @param {string} capId @returns {{en: string, de: string}} */
  _diagBaseTitle(capId) {
    const dot = capId.indexOf('.');
    if (dot > 0) {
      const base = capId.slice(0, dot);
      const ch = capId.slice(dot + 1);
      const noun = DOSING_NOUN[base];
      const cht = CH_TITLE[ch];
      if (noun && cht) return { en: `${cht.en} ${noun.en}`, de: `${cht.de} ${noun.de}` };
    }
    const defs = /** @type {Object<string, *>} */ ((this.homey.manifest && this.homey.manifest.capabilities) || {});
    const t = defs[capId] && defs[capId].title;
    if (t) return typeof t === 'string' ? { en: t, de: t } : t;
    return { en: capId, de: capId };
  }

  // Diagnostics (2026-07-05): when "Show Advanced diagnostics" is on, append the
  // exact raw getReadings value to each opaque tile's title (e.g. "Chlorine
  // blocked: [CL_DOSING_CONTROLLER]"); revert to the clean title when off. Only
  // mapped state/switch/alarm caps are touched, and setCapabilityOptions runs only
  // when the shown value changes (bounded churn on this heavy API). A one-time pass
  // per app start (_diagInit) corrects any stale title left by an abnormal exit.
  /** @param {import('../../lib/VioletClient').RawReadings} raw */
  async _applyDiagTitles(raw) {
    const on = this.getSetting('show_advanced_diagnostics') === true;
    if (!this._diagState) this._diagState = /** @type {Object<string, ?string>} */ ({});
    const first = !this._diagInit;
    for (const cap of this.getCapabilities()) {
      if (!diagAnnotatable(cap)) continue;
      const suffix = on ? diagRawValue(cap, raw) : null;
      if (!first && (this._diagState[cap] ?? null) === suffix) continue;
      const base = this._diagBaseTitle(cap);
      const title = suffix !== null
        ? { en: `${base.en}: ${suffix}`, de: `${base.de}: ${suffix}` }
        : base;
      await this.setCapabilityOptions(cap, { title }).catch(this.error);
      this._diagState[cap] = suffix;
    }
    this._diagInit = true;
  }

  _startPolling() {
    if (this._poll) this.homey.clearInterval(this._poll);
    // Poll interval from settings; 60s fallback (lowered in M0 — notes/2026-06-26-m1-inputs.md §3).
    const seconds = this.getSetting('pollIntervalSeconds') || 60;
    this._poll = this.homey.setInterval(() => this._tick().catch(this.error), seconds * 1000);
    this._tick().catch(this.error);
  }

  /** @param {{changedKeys: string[]}} event */
  async onSettings({ changedKeys }) {
    if (changedKeys.includes('pollIntervalSeconds')) this._startPolling();
    // LSI toggle / chemistry edits take effect on the next poll — re-tick promptly.
    if (changedKeys.some((k) => k === 'lsi_enabled' || k.startsWith('chem_'))) {
      this._tick().catch(this.error);
    }
    // Toggling control adds/removes the control capabilities — reconcile promptly.
    if (changedKeys.includes('control_enabled') || changedKeys.includes('show_advanced_diagnostics')) this._tick().catch(this.error);
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
      if (this._failures >= 3) await this.setUnavailable(this.homey.__('error.unreachable')).catch(this.error);
      return;
    }

    const parsed = parseReadings(raw);

    // M5.7 (spec §4.2): compare the always-polled CONFIGCHANGEMARKER, refresh
    // facts when needed, and let THIS tick's reconcile see the new detection.
    const rawMarker = Number(raw.CONFIGCHANGEMARKER);
    await this._maybeRefreshConfig(Number.isFinite(rawMarker) ? rawMarker : null);
    const features = detectFeatures(raw, this._configFacts);
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
      // computeLSI returns null for any non-finite input; `?? NaN` maps a null
      // reading/conversion to a non-finite number so its own gate handles it
      // (checkJs strict, M5 gate c — behaviour-identical to passing null).
      lsi = computeLSI({
        pH: parsed.ph ?? NaN,
        tempC,
        calciumHardnessPpm: toPpmCaCO3(this.getSetting('chem_calcium_hardness'), this.getSetting('chem_calcium_unit') || 'ppm') ?? NaN,
        totalAlkalinityPpm: toPpmCaCO3(this.getSetting('chem_total_alkalinity'), this.getSetting('chem_alkalinity_unit') || 'ppm') ?? NaN,
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
    /** @type {Object<string, string>} */
    const CH_LABEL = { cl: 'Chlorine', elo: 'Electrolysis', elorev: 'Electrolysis (rev.)', phm: 'pH-minus', php: 'pH-plus', floc: 'Flocculant' };
    const fireEdge = (/** @type {string} */ capInstance, /** @type {*} */ isOn, /** @type {*} */ card, /** @type {Object<string, *>} */ tokens) => {
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
      const ch = dot > 0 ? cap.slice(dot + 1) : ''; // dosing alarms are always dotted
      if (base === 'alarm_dosing_blocked') {
        const stateVal = raw[`${dosingChannelPrefix(ch)}_STATE`];
        const reason = Array.isArray(stateVal) ? stateVal.join(', ') : '';
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

    // Diagnostics tile-title annotation (gated by show_advanced_diagnostics).
    await this._applyDiagTitles(raw).catch(this.error);
  }

  /**
   * @param {import('../../lib/VioletClient').ParsedReadings} parsed
   * @param {import('../../lib/FeatureDetector').Features} features
   */
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

    // 2) One read-only sub-sensor per OK temperature channel (M0 spec §8);
    //    titles prefer the user's NAMES_onewireN label (M5.7 spec §5), falling
    //    back to "Sensor <id>". setCapabilityOptions only on actual change
    //    (churn rule, mirrors the diagnostics-title guard).
    const wanted = new Set(parsed.tempChannels.map((c) => channelSubCapId(c.id)));
    for (const ch of parsed.tempChannels) {
      const cap = channelSubCapId(ch.id);
      const name = (this._configFacts && this._configFacts.onewireNames[String(ch.id)]) || `Sensor ${ch.id}`;
      const isNew = !this.hasCapability(cap);
      if (isNew) await this.addCapability(cap).catch(this.error);
      if (isNew || this._owTitleState[cap] !== name) {
        await this.setCapabilityOptions(cap, { title: { en: name, de: name } }).catch(this.error);
        this._owTitleState[cap] = name;
      }
    }
    for (const cap of [...this.getCapabilities()]) {
      if (cap.startsWith('measure_temperature.ow') && !wanted.has(cap)) {
        await this.removeCapability(cap).catch(this.error);
      }
    }

    // 3) M2 feature-group capabilities (spec M2 §4,§6). Overrides come from the
    //    per-group settings (group_<id>); diagnostics gated by a toggle.
    const m2Overrides = /** @type {Object<string, *>} */ ({});
    for (const g of Object.keys(M2_GROUPS)) m2Overrides[g] = this.getSetting(`group_${g}`) || undefined;
    m2Overrides.dosing = this.getSetting('group_dosing') || undefined;
    const diagnosticsEnabled = this.getSetting('show_advanced_diagnostics') === true;
    const desiredM2 = new Set(desiredM2Capabilities({ features, overrides: m2Overrides, diagnosticsEnabled }));

    // Add desired-but-absent; give dosing sub-instances a channel title.
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
    const baseOf = (/** @type {string} */ cap) => (cap.includes('.') ? cap.slice(0, cap.indexOf('.')) : cap);
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
