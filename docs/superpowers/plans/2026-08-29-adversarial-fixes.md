# Adversarial-Review Fix Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task (NOT subagent-driven-development: every task
> edits `drivers/pool/device.js` and/or the one shared test suite, and later tasks
> depend on the M1 mock extension — one shared toolchain state, one error list).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 20 approved findings from the 2026-08-28 adversarial review
(docs/superpowers/reviews/2026-08-28-approved.md), test-first, with the repro
scenario as the first (red) test of each fix.

**Architecture:** Pure logic goes into `/lib` (tested directly); `device.js`/
`driver.js` stay thin glue tested through the recording Homey mock
(`test/mocks/homey.js`). No new dependencies. Every fix follows TDD:
red test → minimal fix → green → commit.

**Tech Stack:** Node.js (CommonJS), `node --test`, Homey Apps SDK v3 (mocked in
tests), Homey Compose manifests.

**Spec:** docs/superpowers/reviews/2026-08-28-adversarial.md (findings + repros)
and docs/superpowers/reviews/2026-08-28-approved.md (triage decisions). Original
behavior specs referenced per finding therein.

## Global Constraints

- `dependencies` stays exactly `{}` (toolchain test enforces this).
- Manifest/locale JSON edits are built programmatically via `node` +
  `JSON.stringify` (HOMEY.md JSON-Authoring-Regel; `json-guard` hook enforces).
- Credentials live in the device store only, never in plain settings, never in
  logs (CLAUDE.md §5, SR-01/02).
- Q12 (parallelizing capability writes) is explicitly OUT of scope this round.
- Every commit message in German, `Co-Authored-By: Claude Fable 5` trailer.
- Run a single test file with `node --test test/<path>`; full suite `npm test`.

---

### Task 1: M1 — Mock capability values + static caps (test infrastructure)

**Files:**
- Modify: `test/mocks/homey.js` (Device class)
- Modify: `test/drivers/pool.device.test.js:64-73` (makeDevice)
- Check/Modify: `test/drivers/pool.device.advisor.test.js`, `pool.device.config.test.js`, `pool.device.notify.test.js` — mirror the static-caps seeding in their makeDevice equivalents IF they construct PoolDevice (read them first; config/notify may not need it).

**Interfaces:**
- Produces: `Device.__test.capabilities` pre-seeded with the 5 static caps;
  `Device.getCapabilityValue(cap)` returning the last set value (or `null`);
  `Device.__test.capabilityValues` (Object<string, *>) for tests to pre-seed
  persisted values. `removeCapability` deletes the stored value (mirrors Homey
  discarding state with the capability). Exported `STATIC_CAPS` array from the
  test file is NOT needed — inline the literal in each makeDevice.

- [ ] **Step 1: Extend the mock** — in `test/mocks/homey.js` `Device`:
  - In the constructor, extend `__test` with `capabilityValues: {}`.
  - `setCapabilityValue`: additionally `this.__test.capabilityValues[cap] = value;`
  - Add:
    ```js
    /** @param {string} cap */
    getCapabilityValue(cap) {
      return Object.prototype.hasOwnProperty.call(this.__test.capabilityValues, cap)
        ? this.__test.capabilityValues[cap] : null;
    }
    ```
  - `removeCapability`: additionally `delete this.__test.capabilityValues[cap];`
- [ ] **Step 2: Seed static caps** — in `pool.device.test.js` `makeDevice`, before `onInit()`:
    ```js
    // Static caps from driver.compose.json — a really paired device always has
    // them; without this seed the hasCapability guard drops every core write
    // and the whole apply path is test-blind (review 2026-08-28, Meta M1).
    device.__test.capabilities = ['measure_temperature', 'measure_ph', 'measure_orp', 'pump_running', 'measurements_fresh'];
    ```
    Read the other three device test files; apply the same seed where they build a PoolDevice and the missing caps would matter (advisor file: yes; notify/config: only if they assert on core-cap writes).
- [ ] **Step 3: Run the whole device suite** — `node --test test/drivers/` — expect all green (the seed must not break churn-free/apply-rule tests; if a test now sees extra setValue entries, adjust ITS expectations, not the seed).
- [ ] **Step 4: Commit** — `test(mock): statische Compose-Caps vorbelegen + Capability-Werte aufzeichnen (Review M1)`

### Task 2: F3 + F1 — Poll-Fehler loggen; Ausfall invalidiert Freshness (inkl. Advisor)

**Files:**
- Modify: `drivers/pool/device.js:385-397` (`_tick` catch)
- Test: `test/drivers/pool.device.test.js`

**Interfaces:**
- Produces: new instance field `_lastPollErrorLogged` (boolean throttle);
  on the 3rd consecutive failure the device writes
  `{measurements_fresh:false, measure_ph:null, measure_orp:null, measure_chlorine:null, measure_lsi:null, alarm_water_balance:false}`
  (hasCapability-guarded) and sets `_lastFresh = false`.

- [ ] **Step 1: Write failing tests** (append to `pool.device.test.js`):
    ```js
    test('poll failure: first error of a streak is logged via this.error (M0 §10)', async () => {
      const device = await makeDevice(FIXTURES['minimal-pool']);
      device._log.errors.length = 0;
      failFetch = true;
      await device._tick();
      assert.ok(device._log.errors.some((e) => e.includes('poll failed')), 'first failure must reach this.error');
    });

    test('outage: 3rd consecutive failure clears freshness and probes (F1)', async () => {
      const device = await makeDevice(FIXTURES['getReadings.all']);
      await device._tick(); // good poll: fresh values on the tiles
      failFetch = true;
      await device._tick();
      await device._tick();
      const before = device._log.setValue.length;
      await device._tick(); // 3rd failure — threshold
      const writes = device._log.setValue.slice(before);
      assert.deepStrictEqual(
        writes.find((w) => w.cap === 'measurements_fresh')?.value, false,
        'measurements_fresh must be published false on outage');
      assert.strictEqual(writes.find((w) => w.cap === 'measure_ph')?.value, null);
      assert.strictEqual(device._lastFresh, false, 'advisor state must degrade to stale');
    });

    test('outage: advisor answers stale, not with day-old numbers (F1/C-1)', async () => {
      const device = await makeDevice(FIXTURES['getReadings.all'], { lsi_enabled: true, chem_calcium_hardness: 250, chem_total_alkalinity: 100, pool_volume_m3: 30 });
      await device._tick();
      failFetch = true;
      await device._tick(); await device._tick(); await device._tick();
      const advice = await device._balanceAdvice();
      assert.match(advice.advice_text, /stale/i, 'advice must name the stale reason, not prescribe doses');
    });
    ```
    Note: getReadings.all has a running, long-warmed-up pump → first tick is fresh.
- [ ] **Step 2: Run** `node --test test/drivers/pool.device.test.js` — expect the three new tests FAIL (no 'poll failed' log; fresh stays true; advice carries doses).
- [ ] **Step 3: Implement** — replace the `_tick` catch block:
    ```js
    } catch (err) {
      // 3 consecutive failures → unavailable; transient errors keep last values (spec §10).
      this._failures += 1;
      // M0 §10 "Errors logged via this.error": first failure of a streak via
      // error() (surfaces in diagnostics), repeats via log() (no spam at 1/min).
      const msg = err instanceof Error ? err.message : String(err);
      if (!this._lastPollErrorLogged) { this.error('poll failed:', msg); this._lastPollErrorLogged = true; }
      else this.log('poll failed:', msg);
      if (this._failures >= 3) {
        await this.setUnavailable(this.homey.__('error.unreachable')).catch(this.error);
        // Review 2026-08-28 F1: values of unknown age must not stay declared
        // fresh — publish the stale shape once at the threshold crossing and
        // degrade the advisor (clear-stale §3 shape; M0 §7).
        if (this._failures === 3) {
          this._lastFresh = false;
          const staleUpdates = { measurements_fresh: false, measure_ph: null, measure_orp: null, measure_chlorine: null, measure_lsi: null, alarm_water_balance: false };
          for (const [cap, value] of Object.entries(staleUpdates)) {
            if (this.hasCapability(cap)) await this.setCapabilityValue(cap, value).catch(this.error);
          }
        }
      }
      return;
    }
    ```
    In the success path (after `this._failures = 0;`) add `this._lastPollErrorLogged = false;`.
    Declare the field next to `_failures`: `/** @type {boolean} */ _lastPollErrorLogged = false;`
- [ ] **Step 4: Run** the file — all green; then `npm test` — green.
- [ ] **Step 5: Commit** — `fix(device): Ausfall loggt Fehler und invalidiert Freshness ab 3-Fehler-Schwelle (F1/F3)`

### Task 3: F5 — measurements_fresh zuletzt publizieren

**Files:**
- Modify: `lib/Capabilities.js:81-109` (buildCapabilityUpdates)
- Modify: `drivers/pool/device.js:523-530` (apply loop)
- Test: `test/Capabilities.test.js`, `test/drivers/pool.device.test.js`

**Interfaces:**
- Produces: `buildCapabilityUpdates` returns `measurements_fresh` as its LAST
  key; the device apply loop guarantees `measurements_fresh` is the last
  `setCapabilityValue` of the merged (core+M2) batch.

- [ ] **Step 1: Failing lib test** (append to `test/Capabilities.test.js`, match its style):
    ```js
    test('buildCapabilityUpdates orders measurements_fresh last (review F5)', () => {
      const updates = buildCapabilityUpdates({ parsed: { pumpOn: true, tempChannels: [], ph: 7.3, orp: 650, chlorine: null }, fresh: true, primaryChannel: null, lsi: null, alarm: false });
      assert.strictEqual(Object.keys(updates).at(-1), 'measurements_fresh');
    });
    ```
- [ ] **Step 2: Failing device test** (append to `pool.device.test.js`):
    ```js
    test('apply order: measurements_fresh is written after the probe values (F5)', async () => {
      const device = await makeDevice(FIXTURES['getReadings.all']);
      await device._tick();
      const caps = device._log.setValue.map((w) => w.cap);
      const freshIdx = caps.lastIndexOf('measurements_fresh');
      assert.ok(freshIdx > caps.lastIndexOf('measure_ph'), 'fresh before ph — Flow gate races the values');
      assert.strictEqual(freshIdx, caps.length - 1, 'measurements_fresh must be the last write of the batch');
    });
    ```
- [ ] **Step 3: Run both files** — new tests FAIL (fresh at index 1).
- [ ] **Step 4: Implement**:
  - `lib/Capabilities.js`: remove `measurements_fresh: fresh,` from the object
    literal; after the fresh/stale if-else, add:
    ```js
    // Publish the freshness flag LAST (review 2026-08-28 F5): a Flow gating on
    // measurements_fresh must never fire before the values it certifies exist.
    updates.measurements_fresh = fresh;
    ```
    Update the function docstring accordingly.
  - `drivers/pool/device.js` apply loop: the M2 merge (`Object.assign(updates, m2)`)
    re-buries the flag, so enforce order at apply time:
    ```js
    // Apply rule (clear-stale §3): undefined = leave as-is; null = clear to "–"
    // (Insights gap); else set. measurements_fresh goes last (review F5): the
    // flag must publish only after the values it certifies are written.
    const freshValue = updates.measurements_fresh;
    delete updates.measurements_fresh;
    for (const [cap, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (this.hasCapability(cap)) await this.setCapabilityValue(cap, value).catch(this.error);
    }
    if (freshValue !== undefined && this.hasCapability('measurements_fresh')) {
      await this.setCapabilityValue('measurements_fresh', freshValue).catch(this.error);
    }
    ```
- [ ] **Step 5: Run both files + `npm test`** — green.
- [ ] **Step 6: Commit** — `fix(capabilities): measurements_fresh als letzten Wert publizieren (F5)`

### Task 4: F2 — Capability-Abbau entprellen

**Files:**
- Modify: `lib/Capabilities.js` (new pure helper + export)
- Modify: `drivers/pool/device.js:674-790` (_reconcileCapabilities) + field decl
- Test: `test/Capabilities.test.js`, `test/drivers/pool.device.test.js`

**Interfaces:**
- Produces (lib): `shouldRemoveAfterAbsence(counts, cap, wanted, threshold = 3)`
  — mutates `counts` (documented), returns `true` only after `threshold`
  consecutive calls with `wanted === false`; any `wanted === true` call resets.
- Produces (device): field `/** @type {Object<string, number>} */ _absenceCounts = {};`
  Rule: **user-driven** removals (override 'hide', lsi off, control off,
  diagnostics off) stay immediate; **payload-driven** removals (detection lost
  the channel/feature) debounce over 3 polls. User- vs payload-driven for M2 is
  decided by re-computing the desired set with all-auto overrides
  (`detectable`): cap ∈ detectable but ∉ desired ⇒ user hid it ⇒ immediate.

- [ ] **Step 1: Failing lib test**:
    ```js
    test('shouldRemoveAfterAbsence: removes only after 3 consecutive absences, presence resets (review F2)', () => {
      const counts = {};
      assert.strictEqual(shouldRemoveAfterAbsence(counts, 'x', false), false);
      assert.strictEqual(shouldRemoveAfterAbsence(counts, 'x', false), false);
      assert.strictEqual(shouldRemoveAfterAbsence(counts, 'x', true), false); // reappeared
      assert.strictEqual(shouldRemoveAfterAbsence(counts, 'x', false), false);
      assert.strictEqual(shouldRemoveAfterAbsence(counts, 'x', false), false);
      assert.strictEqual(shouldRemoveAfterAbsence(counts, 'x', false), true);
    });
    ```
- [ ] **Step 2: Failing device tests**:
    ```js
    test('reconcile debounce: one FAULT poll does not remove the ow sub-capability (F2)', async () => {
      const fixture = FIXTURES['getReadings.all'];
      const device = await makeDevice(fixture);
      await device._tick();
      assert.ok(device.getCapabilities().some((c) => c.startsWith('measure_temperature.ow')));
      currentFixture = { ...fixture, onewire1_state: 'FAULT' };
      await device._tick();
      assert.ok(!device._log.removeCap.some((c) => c.startsWith('measure_temperature.ow')), 'a single deviant poll must not tear down capabilities');
      await device._tick();
      await device._tick(); // 3rd consecutive absence → now it may go
      assert.ok(device._log.removeCap.some((c) => c.startsWith('measure_temperature.ow1')), 'after 3 absences the removal happens');
    });

    test('reconcile debounce: user Hide override removes immediately (F2)', async () => {
      const device = await makeDevice(FIXTURES['chlorine-only']);
      await device._tick();
      assert.ok(device.getCapabilities().includes('measure_chlorine'));
      device.__test.settings.group_chlorine = 'hide';
      await device._tick();
      assert.ok(device._log.removeCap.includes('measure_chlorine'), 'explicit user choice stays immediate');
    });
    ```
- [ ] **Step 3: Run** — both FAIL (first: removal happens on poll 1; second: passes already? group_chlorine hide → verify red by checking the FIRST test fails; if the second is green pre-fix, keep it as a regression guard).
- [ ] **Step 4: Implement lib helper** in `lib/Capabilities.js`:
    ```js
    /**
     * Debounce capability removal (review 2026-08-28 F2): a capability is torn
     * down only after `threshold` CONSECUTIVE polls without evidence — a single
     * deviant payload (1-wire FAULT, missing pot_value, degenerate response)
     * must not break user Flows. Mirrors the 3-failure availability rule (M0 §10).
     * Mutates `counts` (the caller owns the per-device counter object).
     * @param {Object<string, number>} counts capId → consecutive absences.
     * @param {string} cap Capability id.
     * @param {boolean} wanted Present in this poll's desired set.
     * @param {number} [threshold] Consecutive absences before removal (default 3).
     * @returns {boolean} True when the cap should be removed now.
     */
    function shouldRemoveAfterAbsence(counts, cap, wanted, threshold = 3) {
      if (wanted) { delete counts[cap]; return false; }
      counts[cap] = (counts[cap] || 0) + 1;
      return counts[cap] >= threshold;
    }
    ```
    Export it.
- [ ] **Step 5: Wire into `_reconcileCapabilities`** (import `shouldRemoveAfterAbsence`; add `_absenceCounts = {};` field declaration with JSDoc):
  - Chlorine block (~678): 
    ```js
    for (const cap of ['measure_chlorine']) {
      const want = desiredFeatureCaps.includes(cap);
      if (want && !this.hasCapability(cap)) await this.addCapability(cap).catch(this.error);
      if (!want && this.hasCapability(cap)) {
        // Hide = explicit user choice → immediate; lost detection → debounced (F2).
        const userHidden = overrides.chlorine === 'hide';
        if (userHidden || shouldRemoveAfterAbsence(this._absenceCounts, cap, false)) {
          await this.removeCapability(cap).catch(this.error);
          delete this._absenceCounts[cap];
        }
      }
      if (want) delete this._absenceCounts[cap];
    }
    ```
  - ow removal loop (~707): replace body with
    ```js
    for (const cap of [...this.getCapabilities()]) {
      if (!cap.startsWith('measure_temperature.ow')) continue;
      const want = wanted.has(cap);
      if (!want && shouldRemoveAfterAbsence(this._absenceCounts, cap, false)) {
        await this.removeCapability(cap).catch(this.error);
        delete this._absenceCounts[cap];
      } else if (want) delete this._absenceCounts[cap];
    }
    ```
  - M2 removal loop (~768): before it, compute
    ```js
    // User-hidden vs. detection-lost (F2): what all-auto detection would still
    // keep. cap ∈ detectable ∧ ∉ desired ⇒ the user hid it ⇒ immediate removal.
    const detectableM2 = new Set(desiredM2Capabilities({ features, overrides: {}, diagnosticsEnabled: true }));
    ```
    and in the loop:
    ```js
    if (M2_MANAGED_BASES.has(baseOf(cap)) && !desiredM2.has(cap)) {
      const userHidden = detectableM2.has(cap);
      if (userHidden || shouldRemoveAfterAbsence(this._absenceCounts, cap, false)) {
        await this.removeCapability(cap).catch(this.error);
        delete this._inputOptState[cap];
        delete this._absenceCounts[cap];
      }
    } else if (desiredM2.has(cap)) delete this._absenceCounts[cap];
    ```
  - Control block (~785): `!controlOn` ⇒ immediate (user), else debounce:
    ```js
    for (const cap of ['pump_control', 'light_control', 'pvsurplus_control']) {
      const want = desiredControl.has(cap);
      if (want && !this.hasCapability(cap)) await this.addCapability(cap).catch(this.error);
      if (!want && this.hasCapability(cap)) {
        if (!controlOn || shouldRemoveAfterAbsence(this._absenceCounts, cap, false)) {
          await this.removeCapability(cap).catch(this.error);
          delete this._absenceCounts[cap];
        }
      }
      if (want) delete this._absenceCounts[cap];
    }
    ```
  - LSI block stays immediate (user toggle) — unchanged.
- [ ] **Step 6: Run device tests + `npm test`** — green (watch the churn-free test: identical payloads never enter the absence branch).
- [ ] **Step 7: Commit** — `fix(device): Capability-Abbau über 3 Polls entprellt, Nutzer-Hide bleibt sofort (F2)`

### Task 5: N1 + P6 — Flankenzustand neustart- und hide-fest

**Files:**
- Modify: `drivers/pool/device.js` (onInit, _tick edge block, M2 removal site)
- Test: `test/drivers/pool.device.test.js` (or advisor test file for the timeline part — wherever the notification harness lives)

**Interfaces:**
- Produces: `_m2AlarmState` seeded once per app start from persisted capability
  values (`getCapabilityValue`); `_lastLsiBand` persisted in the store under
  `'lsiBand'`; removal of a managed alarm cap deletes its `_m2AlarmState` entry.
  New field `/** @type {boolean} */ _edgeStateSeeded = false;`

- [ ] **Step 1: Failing tests** (uses the Task-1 mock extension; build an alarm-active fixture by patching getReadings.all — at execution, grep `alarm_dosing_low` token building in FeatureGroups to patch the right raw fields, e.g. `DOS_1_CL_REMAINING_RANGE: '2d'` with dosing feature active as in the adversarial repro):
    ```js
    test('restart: persisted alarm state does not re-fire trigger or timeline (N1)', async () => {
      const fixture = { ...FIXTURES['salt-electrolysis'], DOS_2_ELO_REMAINING_RANGE: '2d' };
      const first = await makeDevice(fixture, { dosing_low_threshold_days: 7 });
      await first._tick();
      const fired = (first._log.triggers.dosing_low || []).length;
      assert.strictEqual(fired, 1, 'precondition: edge fires once on the first instance');
      // Simulate app restart: new instance, same persisted device state.
      const second = await makeDevice(fixture, { dosing_low_threshold_days: 7 });
      second.__test.capabilities = [...first.__test.capabilities];
      second.__test.capabilityValues = { ...first.__test.capabilityValues };
      second.__test.store = { ...first.__test.store };
      await second._tick();
      assert.strictEqual((second._log.triggers.dosing_low || []).length, 0, 'restart with unchanged state must not re-fire (N1)');
    });

    test('hide/unhide: alarm edge fires again after the capability returns (P6)', async () => {
      const fixture = { ...FIXTURES['salt-electrolysis'], DOS_2_ELO_STATE: '4' }; // blocked-alarm raw shape — verify exact field against FeatureGroups at execution
      const device = await makeDevice(fixture);
      await device._tick();
      const firedBefore = (device._log.triggers.dosing_blocked || []).length;
      device.__test.settings.group_dosing = 'hide';
      await device._tick(); // cap removed (user-driven, immediate)
      device.__test.settings.group_dosing = 'auto';
      await device._tick(); // cap re-added, alarm still active
      assert.strictEqual((device._log.triggers.dosing_blocked || []).length, firedBefore + 1, 'unhide must re-announce the still-active alarm');
    });
    ```
    NOTE for execution: the restart test needs makeDevice to allow seeding state BEFORE onInit — restructure makeDevice with an optional `seed` callback or inline-construct the second device without the helper (constructor → seed → onInit → settle). The advisor timeline dupe (lsi band) is covered by asserting `_log.notifications` stays empty on the second instance in an lsi-enabled variant — add it to the restart test with `lsi_enabled: true` + chem settings if the fixture yields a warning band; otherwise a separate minimal test with a scaling pH patch (`pH_value: '8.2'`).
- [ ] **Step 2: Run** — restart test FAILS (fires again), hide/unhide FAILS (suppressed).
- [ ] **Step 3: Implement**:
  - Field: `/** @type {boolean} */ _edgeStateSeeded = false;`
  - In `_tick`, immediately before the `fireEdge` loop:
    ```js
    // Seed edge state once per app start from the persisted capability values
    // (review N1): true-before-restart / true-after-restart is not an edge —
    // prevents duplicate triggers AND duplicate timeline notifications.
    if (!this._edgeStateSeeded) {
      for (const cap of this.getCapabilities()) {
        if (cap.startsWith('alarm_') && !(cap in this._m2AlarmState)) {
          this._m2AlarmState[cap] = this.getCapabilityValue(cap) === true;
        }
      }
      this._edgeStateSeeded = true;
    }
    ```
    IMPORTANT ordering: `_reconcileCapabilities` and the value APPLY loop run
    before/after this — the seed must run BEFORE this tick's alarm values are
    applied. The apply loop (Task 3) runs AFTER the fireEdge loop already
    (verify at execution: in current _tick, fireEdge loop (499-521) precedes the
    apply loop (525) — so seeding just before the fireEdge loop reads the
    PREVIOUS persisted values. Correct.)
  - In `onInit`: `this._lastLsiBand = this.getStoreValue('lsiBand') ?? null;`
    (replaces `= null`).
  - After the LSI edge block's `this._lastLsiBand = band;` add:
    ```js
    if (this.getStoreValue('lsiBand') !== band) await this.setStoreValue('lsiBand', band).catch(this.error);
    ```
  - At the M2 removal site (Task 4's block) add `delete this._m2AlarmState[cap];`
    next to `delete this._inputOptState[cap];` (P6: re-add must re-announce).
- [ ] **Step 4: Run + `npm test`** — green.
- [ ] **Step 5: Commit** — `fix(device): Alarm-Flanken überleben Neustart und Hide/Unhide korrekt (N1/P6)`

### Task 6: N2 — onDeleted räumt auf

**Files:**
- Modify: `drivers/pool/device.js` (after onUninit)
- Test: `test/drivers/pool.device.notify.test.js` (mirror its port-free test — read the file first, reuse its harness/port scheme)

- [ ] **Step 1: Failing test** — clone the existing "onUninit frees the port" test as `onDeleted frees the port and stops polling (N2)`: create device on a free test port, then call `device.onDeleted()` instead of `onUninit()`, assert the port is bindable again (same helper the file already uses) — plus interval cleanup: override `device.homey.clearInterval` with a recorder before the call and assert it was called with the poll handle.
- [ ] **Step 2: Run** — FAILS (`onDeleted` is not a function / TypeError).
- [ ] **Step 3: Implement** in `device.js`:
    ```js
    // User deleted the device while the app keeps running — a distinct SDK
    // teardown event from onUninit (app destroyed). Same cleanup, or the poll
    // interval and the NOTIFY port outlive the device until app restart
    // (review 2026-08-28 N2; SDK Device.d.ts onDeleted/onUninit).
    async onDeleted() {
      await this.onUninit();
    }
    ```
- [ ] **Step 4: Run file + `npm test`** — green.
- [ ] **Step 5: Commit** — `fix(device): onDeleted räumt Poll-Timer und NOTIFY-Listener ab (N2)`

### Task 7: N3 — _pumpSpeedArg null-fest

**Files:**
- Modify: `drivers/pool/device.js:264-267`
- Test: `test/drivers/pool.device.test.js`

- [ ] **Step 1: Failing test**:
    ```js
    test('_pumpSpeedArg: never-set setting (null) means keep-configured, not speed 0 (N3)', async () => {
      const device = await makeDevice(FIXTURES['minimal-pool']); // control_pump_speed absent → getSetting → null
      assert.strictEqual(device._pumpSpeedArg(), undefined);
      device.__test.settings.control_pump_speed = 'default';
      assert.strictEqual(device._pumpSpeedArg(), undefined);
      device.__test.settings.control_pump_speed = '2';
      assert.strictEqual(device._pumpSpeedArg(), 2);
    });
    ```
- [ ] **Step 2: Run** — FAILS (`0 !== undefined`).
- [ ] **Step 3: Implement**:
    ```js
    // Tile pump speed from settings: unset (null — pre-M3 paired devices never
    // got the compose default backfilled, review N3) or 'default' ⇒ omit
    // (keep configured), else 0-3.
    _pumpSpeedArg() {
      const s = this.getSetting('control_pump_speed');
      return s === undefined || s === null || s === 'default' ? undefined : Number(s);
    }
    ```
- [ ] **Step 4: Run + commit** — `fix(device): nie gesetzte Pumpenstufe erzwingt nicht mehr Stufe 0 (N3)`

### Task 8: N4 — Advisor-Grund vor dem ersten Poll

**Files:**
- Modify: `drivers/pool/device.js:587-591` (_advisorInputs)
- Test: `test/drivers/pool.device.advisor.test.js` (its harness already invokes the advisor — read first, reuse makeDevice there)

- [ ] **Step 1: Failing test** (advisor test file):
    ```js
    test('advisor before first successful poll reports stale, not a fake missing list (N4)', async () => {
      const device = await makeDeviceWithoutTick(); // at execution: construct device, do NOT settle a successful tick (stub fetch to reject, or call _balanceAdvice before any tick) — with lsi_enabled + all chem settings set
      const advice = await device._balanceAdvice();
      assert.match(advice.advice_text, /stale/i);
      assert.doesNotMatch(advice.advice_text, /calcium|alkalinity/i, 'must not claim entered settings are missing');
    });
    ```
- [ ] **Step 2: Run** — FAILS (missing list appears).
- [ ] **Step 3: Implement** — `_advisorInputs` reason line:
    ```js
    const reason = this.getSetting('lsi_enabled') !== true ? 'lsi_disabled'
      // No successful poll yet counts as stale too (review N4): the generic
      // missing-list would blame settings the user did enter (spec §9).
      : (!parsed || !this._lastFresh) ? 'stale' : null;
    ```
- [ ] **Step 4: Run + `npm test` + commit** — `fix(device): Advisor meldet vor dem ersten Poll stale statt falscher Missing-Liste (N4)`

### Task 9: P1 — implausible Controller-Uhr ⇒ nicht frisch

**Files:**
- Modify: `drivers/pool/device.js:406-416` (_tick clock/freshness block)
- Test: `test/drivers/pool.device.test.js`

- [ ] **Step 1: Failing test**:
    ```js
    test('controller clock at 0 (RTC reset) must not count as fresh (P1)', async () => {
      const fixture = { ...FIXTURES['getReadings.all'], CURRENT_TIME_UNIX: 0, PUMP_LAST_ON: 0, PUMP: '1' };
      const device = await makeDevice(fixture);
      device._log.setValue.length = 0;
      await device._tick();
      const freshWrite = device._log.setValue.find((w) => w.cap === 'measurements_fresh');
      assert.strictEqual(freshWrite?.value, false, 'broken controller clock ⇒ warmup unprovable ⇒ stale');
    });
    ```
- [ ] **Step 2: Run** — FAILS (fresh true via local-time fallback vs pumpLastOn 0).
- [ ] **Step 3: Implement** in `_tick`:
    ```js
    // Prefer the controller clock for warmup math; fall back to local time if absent.
    // Defensive (review P1): a present-but-implausible controller clock (RTC
    // reset → epoch ~0) invalidates PUMP_LAST_ON from the same clock — mixing
    // local `now` with a broken controller timestamp would fake a huge warmup.
    const CLOCK_SANE_MIN = 1e9; // 2001-09 — any real controller clock is beyond this
    const clockBroken = parsed.timeUnix !== null && parsed.timeUnix < CLOCK_SANE_MIN;
    const now = parsed.timeUnix || Math.floor(Date.now() / 1000);
    const fresh = isFresh({
      pumpOn: parsed.pumpOn,
      pumpLastOn: clockBroken ? null : parsed.pumpLastOn,
      now,
      warmupSeconds: this.getSetting('pumpWarmupSeconds') ?? 120,
    });
    ```
- [ ] **Step 4: Run + `npm test` + commit** — `fix(device): implausible Controller-Uhr macht Messwerte nicht mehr fälschlich frisch (P1)`

### Task 10: N6 — Config-Retry mit Backoff

**Files:**
- Modify: `drivers/pool/device.js:184-197` (_maybeRefreshConfig) + field decls
- Test: `test/drivers/pool.device.config.test.js` (read first; it stubs `ConfigSource.fetchConfigFacts` — count invocations)

**Interfaces:**
- Produces: fields `/** @type {number} */ _ticksSinceConfigAttempt = 0;`
  retry cadence constant `CONFIG_RETRY_TICKS = 60` (≈1 h at 60 s polls).

- [ ] **Step 1: Failing test** (config test file, using its stub-counting pattern):
    ```js
    test('config facts: after the 3-attempt budget a periodic retry still happens (N6)', async () => {
      // stub fetchConfigFacts to always reject, count calls
      const device = await makeDevice(FIXTURES['getReadings.all']); // fixture must carry CONFIGCHANGEMARKER (verify; else patch it in)
      for (let i = 0; i < 3; i += 1) await device._tick(); // burns the 3-attempt budget (init tick counts — adjust count at execution)
      const callsAfterBudget = fetchCalls.length;
      for (let i = 0; i < 59; i += 1) await device._tick();
      assert.strictEqual(fetchCalls.length, callsAfterBudget, 'no hammering inside the backoff window');
      await device._tick(); // 60th tick since last attempt
      assert.strictEqual(fetchCalls.length, callsAfterBudget + 1, 'the periodic retry must fire (N6)');
    });
    ```
- [ ] **Step 2: Run** — FAILS (no further call, ever).
- [ ] **Step 3: Implement** — in `_maybeRefreshConfig`:
    ```js
    // Review N6: the 3-attempt budget must not become a permanent stop — a
    // controller that boots slower than 3 polls would otherwise leave
    // _configFacts null until app restart. Retry once per ~hour of ticks.
    this._ticksSinceConfigAttempt += 1;
    const retryDue = this._ticksSinceConfigAttempt >= 60;
    const needFirstFacts = this._configFacts === null
      && (this._configAttempts < 3 || markerMovedBetweenPolls || retryDue);
    ```
    and inside BOTH the try (before fetch, or right at entry past the early
    return) set `this._ticksSinceConfigAttempt = 0;` — precisely: after the
    `if (!needFirstFacts && !markerMoved) return;` line, reset the counter (an
    attempt is being made now).
- [ ] **Step 4: Run + `npm test` + commit** — `fix(device): Config-Facts-Abruf wagt nach dem 3er-Budget stündliche Retries (N6)`

### Task 11: N7 — NOTIFY-Body: Bytes sammeln, einmal dekodieren

**Files:**
- Modify: `lib/NotifyServer.js:115-131`
- Test: `test/NotifyServer.server.test.js` (read first, reuse its real-server harness)

- [ ] **Step 1: Failing tests** (server harness with raw `net.Socket` writes):
    ```js
    test('POST body split mid-UTF-8-character decodes intact (N7a)', ...);
    // send SUBJECT=Sch\xc3\xb6n in two socket writes split after \xc3 → assert onAlarm subject === 'Schön'
    test('body cap counts BYTES, not UTF-16 units (N7b)', ...);
    // send >4096 BYTES of 3-byte chars (~1400 '€') → assert 400 and no alarm
    ```
- [ ] **Step 2: Run** — N7a FAILS (U+FFFD), N7b FAILS (200 + alarm).
- [ ] **Step 3: Implement** — replace the body collection:
    ```js
    /** @type {Buffer[]} */
    const chunks = [];
    let received = 0;
    let overflow = false;
    req.on('data', (chunk) => {
      if (overflow) return;
      // SR-M6-02 (review N7): count BYTES and decode ONCE on 'end' — per-chunk
      // string concat both under-counted multibyte bodies (~3x cap bypass) and
      // corrupted characters split across TCP chunks.
      received += chunk.length;
      if (received >= entry.limits.bodyBytes) {
        overflow = true;
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request');
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    ```
    and in `req.on('end', ...)` first line: `const body = Buffer.concat(chunks).toString('utf8');`
    (remove the outer `let body = ''` accumulation).
- [ ] **Step 4: Run file + `npm test` + commit** — `fix(notify): Body byteweise gedeckelt und einmalig UTF-8-dekodiert (N7)`

### Task 12: N8 — Surrogate-sicherer SUBJECT-Schnitt

**Files:**
- Modify: `lib/NotifyServer.js:54-58` (parseAlarm)
- Test: `test/NotifyServer.test.js` (the pure parseAlarm suite — read first)

- [ ] **Step 1: Failing test**:
    ```js
    test('parseAlarm: 200-unit cut never leaves a dangling high surrogate (N8)', () => {
      const subject = 'x'.repeat(199) + '\u{1F600}';
      const alarm = parseAlarm('GET', `/?ERRORCODE=E1&SUBJECT=${encodeURIComponent(subject)}`);
      const last = alarm.subject.charCodeAt(alarm.subject.length - 1);
      assert.ok(!(last >= 0xD800 && last <= 0xDBFF), 'must not end on a lone high surrogate');
      assert.strictEqual(alarm.subject.length, 199);
    });
    ```
- [ ] **Step 2: Run** — FAILS (ends on 0xD83D).
- [ ] **Step 3: Implement**:
    ```js
    let subject = rawSubject
      .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
      .trim()
      .slice(0, LIMITS.subjectLength);
    // A cut mid-surrogate-pair leaves a lone high surrogate that re-encodes as
    // U+FFFD in logs/Flow tokens (review N8) — same guard as WaterBalanceText.clip.
    const last = subject.charCodeAt(subject.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) subject = subject.slice(0, -1);
    ```
- [ ] **Step 4: Run + commit** — `fix(notify): SUBJECT-Kappung zerschneidet keine Surrogate-Paare mehr (N8)`

### Task 13: N9 — log/error je Listener

**Files:**
- Modify: `lib/NotifyServer.js` (registry entry shape, dispatch, close)
- Test: `test/NotifyServer.server.test.js`

**Interfaces:**
- Produces: registry entry `listeners` becomes
  `Map<onAlarm, {log: Function, error: Function}>`; internal
  `broadcastError(entry, msg)` calls every attached error callback (each
  try/catch-wrapped). Alarm dispatch iterates `entry.listeners.keys()`.
  Public API (`createNotifyServer`, handle `close()`) unchanged.

- [ ] **Step 1: Failing test** — two `createNotifyServer` on one port with
  separate recording `error` callbacks; force a rate-limit warning (11 rapid
  valid GETs); assert BOTH error recorders received the warning; then `close()`
  the FIRST handle, force another rate-limit window, assert the SECOND recorder
  still receives it.
- [ ] **Step 2: Run** — FAILS (second recorder empty).
- [ ] **Step 3: Implement**:
  - Entry: `listeners: new Map([[onAlarm, { log, error }]])`; existing-branch:
    `existing.listeners.set(onAlarm, { log, error });`
  - Add near the registry:
    ```js
    /** Route a server-side message to every attached device (review N9) — the
     * spec (§7) promises "listener errors routed to this.error" for EACH
     * attacher, and the first device may be long deleted. @param {*} entry @param {string} msg */
    function broadcastError(entry, msg) {
      for (const cbs of entry.listeners.values()) {
        try { cbs.error(msg); } catch { /* logger threw — nothing safe left */ }
      }
    }
    ```
  - Replace every `entry.error(...)` / closure `error(...)` inside the server
    handler and post-bind `server.on('error', ...)` with `broadcastError(entry, ...)`;
    drop the now-unused `error` field from the entry object. The pre-bind
    reject path and the bind-success `log(...)` stay on the creating caller
    (bind happens once, before any second attacher can observe it).
  - Dispatch loop: `for (const listener of entry.listeners.keys()) listener(payload);`
  - `makeHandle.close`: `entry.listeners.delete(onAlarm)` (Map.delete — same call).
- [ ] **Step 4: Run + `npm test` + commit** — `fix(notify): Server-Fehler und Rate-Limit-Warnungen erreichen jedes angehängte Gerät (N9)`

### Task 14: N10 + P2 — Pairing: Host normalisieren, Fehler lokalisieren, Doppelklick sperren

**Files:**
- Modify: `lib/VioletClient.js` (normalizeHost + export)
- Modify: `drivers/pool/driver.js:76-95` (connect handler)
- Modify: `drivers/pool/pair/connect.html` (button disable + file header, s. Q16 note)
- Modify: `locales/en.json`, `locales/de.json` (via node script)
- Test: `test/VioletClient.test.js`, new `test/drivers/pool.driver.pair.test.js`

**Interfaces:**
- Produces: `normalizeHost(input: *) → string` — trims, strips a leading
  `http://`/`https://` (case-insensitive), strips trailing slashes; empty
  input → `''`. New locale keys `pair.error.unreachable` (en+de).

- [ ] **Step 1: Failing lib test** (`test/VioletClient.test.js`):
    ```js
    test('normalizeHost strips pasted scheme and trailing slash (N10)', () => {
      assert.strictEqual(normalizeHost(' http://192.168.178.30/ '), '192.168.178.30');
      assert.strictEqual(normalizeHost('HTTPS://violet.local'), 'violet.local');
      assert.strictEqual(normalizeHost('violet.local'), 'violet.local');
      assert.strictEqual(normalizeHost(null), '');
    });
    ```
- [ ] **Step 2: Failing driver test** (new file, pattern from the advisor test's
  driver-construction: `new PoolDriver()`, point `driver.homey` at a device
  stub's homey, call `await driver.onPair(session)` with a fake session that
  records `setHandler` callbacks, then invoke the `connect` handler):
    ```js
    test('pair connect: fetch failure surfaces the localized unreachable error, not raw internals (N10)', async () => {
      // fetchReadings stubbed to reject with TypeError('fetch failed')
      await assert.rejects(connectHandler({ host: 'http://10.0.0.1/' }), (err) => /pair\.error\.unreachable/.test(err.message));
    });
    test('pair connect: pasted scheme is normalized before fetching (N10)', async () => {
      // fetchReadings stub records the host argument; resolve with getReadings.all
      await connectHandler({ host: ' http://violet.local/ ' });
      assert.strictEqual(seenHost, 'violet.local');
    });
    ```
- [ ] **Step 3: Run** — both FAIL.
- [ ] **Step 4: Implement**:
  - `lib/VioletClient.js`:
    ```js
    /**
     * Normalize a user-entered host (pair/repair views, review N10): users paste
     * URLs — strip scheme + trailing slashes so buildReadingsUrl never yields
     * `http://http://…`.
     * @param {*} input Raw user input.
     * @returns {string} Bare host/IP ('' when empty).
     */
    function normalizeHost(input) {
      return String(input || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }
    ```
    Export it.
  - `driver.js` connect handler:
    ```js
    const cleanHost = normalizeHost(host);
    if (!cleanHost) throw new Error(this.homey.__('pair.error.host_required'));
    let raw;
    try {
      raw = await fetchReadings(cleanHost, { timeoutMs: 10000 });
    } catch (err) {
      // Raw fetch/JSON/abort internals are useless in the pairing dialog
      // (review N10) — log the detail, show one actionable localized message.
      this.error('pairing connect failed:', err instanceof Error ? err.message : String(err));
      throw new Error(this.homey.__('pair.error.unreachable'));
    }
    ```
  - Locales via node one-liner script (scratchpad), adding under `pair.error`:
    en: `"unreachable": "Could not reach a Violet controller at this address. Check the host/IP (no http://) and that the controller is online."`
    de: `"unreachable": "Unter dieser Adresse ist kein Violet-Controller erreichbar. Host/IP prüfen (ohne http://) und ob der Controller online ist."`
  - `connect.html` (P2 + Q16 header): add a 3-line HTML comment header at the
    top citing the M0 spec §6 path; in `onConnect()`:
    ```js
    var btn = document.getElementById('btn-connect');
    btn.disabled = true;
    Homey.emit('connect', { host, username, password })
      .then(function () { Homey.showView('list_devices'); })
      .catch(function (err) { btn.disabled = false; status.textContent = ...; });
    ```
    (No automated test — plain pairing HTML; verified by inspection, noted in
    the final report's assumed-line.)
- [ ] **Step 5: Run new tests + `npm test`** — green.
- [ ] **Step 6: Commit** — `fix(pairing): Host normalisiert, Fehler lokalisiert, Doppelklick gesperrt (N10/P2)`

### Task 15: N5 — Repair-Flow für Schreib-Credentials

**Files:**
- Modify: `drivers/pool/driver.compose.json` (add `"repair"` view list — via node script)
- Create: `drivers/pool/pair/repair.html`
- Modify: `drivers/pool/driver.js` (onRepair)
- Modify: `locales/en.json` / `de.json` (repair strings, wrong-device error — node script)
- Test: `test/drivers/pool.driver.pair.test.js`

**Interfaces:**
- Consumes: `normalizeHost` (Task 14), `deriveDeviceId` (existing), mock
  `Device.setStoreValue`/`__test.store`.
- Produces: `PoolDriver.onRepair(session, device)` with a `connect` handler that
  validates the (optionally updated) host live, verifies the controller serial
  matches `device.getData().id` (localized `pair.error.wrong_device` otherwise),
  then persists `writeUsername` (setSettings), `writePassword` (setStoreValue)
  and — when changed — `host` (setSettings).

- [ ] **Step 1: Failing driver tests**:
    ```js
    test('repair: stores new write credentials on the existing device (N5)', async () => {
      // fake device: mock Device instance + getData = () => ({ id: <deriveDeviceId(fixture)> })
      // session records handlers; call connect handler with { host: '', username: 'u2', password: 'pw2' }
      // fetch stub returns the SAME fixture (serial matches); empty host keeps device.getSetting('host')
      assert.strictEqual(fakeDevice.__test.store.writePassword, 'pw2');
      assert.strictEqual(fakeDevice.__test.settings.writeUsername, 'u2');
    });
    test('repair: a different controller serial is rejected (N5)', async () => {
      // getData id ≠ deriveDeviceId(fixture) → assert.rejects(/pair\.error\.wrong_device/)
      // and store.writePassword unchanged
    });
    ```
    (Mock `Device` needs `setSettings`: check `test/mocks/homey.js` — if absent, add `async setSettings(patch) { Object.assign(this.__test.settings, patch); }` as part of this task.)
- [ ] **Step 2: Run** — FAILS (`onRepair` undefined).
- [ ] **Step 3: Implement** `onRepair` in `driver.js`:
    ```js
    // Repair flow (review N5): the ONLY way to set/rotate the write password
    // after pairing — it lives in the device store (SR-01/02), which plain
    // settings must never expose. Host may be updated too (device moved IP);
    // the serial check prevents silently rebinding to a different controller.
    /** @param {*} session @param {*} device */
    async onRepair(session, device) {
      session.setHandler('connect', async (/** @type {{host?: string, username?: string, password?: string}} */ { host, username, password }) => {
        const cleanHost = normalizeHost(host) || device.getSetting('host');
        let raw;
        try {
          raw = await fetchReadings(cleanHost, { timeoutMs: 10000 });
        } catch (err) {
          this.error('repair connect failed:', err instanceof Error ? err.message : String(err));
          throw new Error(this.homey.__('pair.error.unreachable'));
        }
        const id = deriveDeviceId(raw);
        if (!id) throw new Error(this.homey.__('pair.error.no_serial'));
        if (id !== device.getData().id) throw new Error(this.homey.__('pair.error.wrong_device'));
        await device.setStoreValue('writePassword', String(password || ''));
        await device.setSettings({ writeUsername: String(username || '').trim(), host: cleanHost });
        return true;
      });
    }
    ```
- [ ] **Step 4: Manifest + view**:
  - node script adds to `driver.compose.json`: `"repair": [ { "id": "repair" } ]`.
  - `drivers/pool/pair/repair.html`: copy of connect.html structure (with file
    header), host field pre-labeled "leave empty to keep", success path calls
    `Homey.done()` instead of `showView`, button-disable included; i18n keys
    `repair.*` added to both locales via node script (title/labels/done).
- [ ] **Step 5: Run tests + `npm test`** — green. Also `npx homey app validate --level=debug` here (first manifest-shape change of the round) — expect exit 0.
- [ ] **Step 6: Commit** — `feat(driver): Repair-Flow zum Setzen/Rotieren der Schreib-Credentials (N5)`

### Task 16: N11 — computeLSI total; Fixtemperatur begrenzt

**Files:**
- Modify: `lib/Lsi.js:64-73`
- Modify: `drivers/pool/driver.settings.compose.json` (min/max — node script)
- Test: `test/Lsi.test.js`

- [ ] **Step 1: Failing test**:
    ```js
    test('computeLSI: physically impossible temperature yields null, never NaN (N11)', () => {
      assert.strictEqual(computeLSI({ pH: 7.4, tempC: -300, calciumHardnessPpm: 250, totalAlkalinityPpm: 100, cya: 0 }), null);
    });
    ```
- [ ] **Step 2: Run** — FAILS (NaN).
- [ ] **Step 3: Implement** — end of `computeLSI`:
    ```js
    const lsi = Math.round((pH - pHs) * 100) / 100;
    // tempC <= -273.15 turns log10 negative-domain → NaN; honor the docstring
    // contract "invalid input yields null" for intermediates too (review N11).
    return Number.isFinite(lsi) ? lsi : null;
    ```
- [ ] **Step 4: Compose** — node script adds `"min": 0, "max": 60` to the
  `chem_fixed_temperature` setting (only chemistry setting without bounds).
- [ ] **Step 5: Run + `npm test` + commit** — `fix(lsi): NaN-Ergebnis wird null; Fixtemperatur-Setting begrenzt (N11)`

### Task 17: F6 — M1-Notiz korrigieren

**Files:**
- Modify: `docs/superpowers/notes/2026-06-26-m1-inputs.md:15-25`

- [ ] **Step 1:** Read the note's lines 1-40; rewrite the claim: the identity
  `CURRENT_TIME_UNIX − PUMP_LAST_ON == session runtime` is confirmed **in the
  2026-06-26 live capture only** (quote its numbers as live capture); state
  explicitly that in the committed fixture `test/fixtures/getReadings.all.json`
  `PUMP_RUNTIME` (69 803 s) is a **cumulative counter** (pump last started
  14 166 s before CURRENT_TIME_UNIX) and the identity does NOT hold there; add
  a dated correction line `(korrigiert 2026-08-29, Review F6)`.
- [ ] **Step 2:** No test (doc). `npm test` still green.
- [ ] **Step 3: Commit** — `docs(notes): M1-Zeitquellen-Beleg auf Live-Capture korrigiert, PUMP_RUNTIME als kumulativ markiert (F6)`

### Task 18: Abschluss — Verifikation, Q-Nachprüfung, Inbox

**Files:**
- Modify: `docs/dashboard/triage-inbox.md` (P3/P5 deferred entries)
- No code changes.

- [ ] **Step 1:** `npm test` (full) — expect green, count reported.
- [ ] **Step 2:** `npx homey app validate --level=debug` — expect exit 0.
- [ ] **Step 3:** Re-check Q1–Q17 against the now-current code (lines shifted;
  Q5 partially touched by N3, Q16 done via Task 14 header, Q17 unchanged):
  produce the second-round triage list for the user (artifact update).
- [ ] **Step 4:** Append P3/P5 to `docs/dashboard/triage-inbox.md` under "Offen"
  with date 2026-08-29 and pointer to the approved doc.
- [ ] **Step 5:** Commit docs; report to user; ask push-to-main vs. PR (§9.3).

## Self-Review (done at write time)

- Spec coverage: all 20 approved IDs map to tasks (M1→1, F3/F1→2, F5→3, F2→4,
  N1/P6→5, N2→6, N3→7, N4→8, P1→9, N6→10, N7→11, N8→12, N9→13, N10/P2→14,
  N5→15, N11→16, F6→17). Deferred/rejected handled in 18.
- Placeholders: test snippets marked "at execution: verify field/harness" are
  deliberate read-before-write points on files not yet loaded (advisor/config/
  notify test files, FeatureGroups alarm fields) — the executor reads those
  files in the same task before writing; no TBD remains in implementation code.
- Type consistency: `shouldRemoveAfterAbsence` name used consistently (Tasks 4);
  `normalizeHost` (14, 15); mock `getCapabilityValue`/`capabilityValues` (1, 5).
