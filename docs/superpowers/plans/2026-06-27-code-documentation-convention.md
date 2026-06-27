# Code Documentation & Spec-Linking Convention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calibrated documentation convention (file headers + decision-point comments + spec §-refs everywhere; JSDoc only on pure `/lib` exports), encode it as a `documenting-code` Superpowers skill, and retrofit it onto the existing M0 source — changing only comments, never logic.

**Architecture:** Author the skill first so it is the canonical reference, then apply the convention to the four pure `/lib` modules, then to the `device.js`/`app.js` glue, then add a cross-reference README for the comment-less capability JSON. Each task is additive (comments/JSDoc/docs only) and is gated by `npm test` staying green and a `git diff` that shows no executable-line changes.

**Tech Stack:** Node.js (built-in `node --test`), Homey Apps SDK v3, Homey Compose, Markdown skill files (`.claude/skills/<name>/SKILL.md`).

Spec: `docs/superpowers/specs/2026-06-27-code-documentation-convention-design.md`.

## Global Constraints

- **Comments only.** No executable line may change in any task. The M1 `PUMP_LAST_ON` refactor is *referenced*, never implemented.
- **Altitude = Hybrid.** File header (`//`, 2–5 lines) on every `.js`; decision-point `// why + §-ref` comments only where non-obvious; JSDoc **only** on these 9 pure exports: `buildReadingsUrl`, `parseReadings`, `fetchReadings`, `detectFeatures`, `isFresh`, `channelSubCapId`, `choosePrimaryTemperature`, `desiredFeatureCapabilities`, `buildCapabilityUpdates`.
- **No JSDoc** on `device.js` class methods or internal helpers (`num`, `FEATURE_CAPABILITY`).
- **Reference grammar:** file header names the full spec path once (`docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md §N`); inline comments thereafter use `§N`, `notes/<YYYY-MM-DD>-<topic>.md §N`, `plan task N`. Never duplicate spec prose into code.
- **Respect CLAUDE.md:** Simplicity First, Surgical Changes, comment the *why* not the *what*.
- **JSON exempt:** `.homeycompose/capabilities/*.json` get no inline comments and no `_comment` key (would risk `homey app validate`); documented via spec + a folder README.
- **Do not touch** generated artifacts: `app.json`, anything under `.homeybuild/`.
- **Verify command:** `npm test` (runs `node --test`).

---

### Task 1: Author the `documenting-code` skill

**Files:**
- Create: `.claude/skills/documenting-code/SKILL.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical convention referenced by Tasks 2–4 (no code symbols).

- [ ] **Step 1: Confirm green baseline**

Run: `npm test`
Expected: all tests pass (the suite covers `VioletClient`, `FeatureDetector`, `Freshness`, `Capabilities`). This is the pre-change baseline.

- [ ] **Step 2: Create the skill file**

Create `.claude/skills/documenting-code/SKILL.md` with exactly this content:

````markdown
---
name: documenting-code
description: Use when writing or modifying any source file in this project (Violet Homey app) — add a file header citing the governing spec section, decision-point comments with spec/notes §-refs, and JSDoc on pure /lib module exports. Keeps code linked to the Superpowers design docs without fighting CLAUDE.md's Simplicity rules.
---

# Documenting Code (spec-linked)

Make code self-explaining AND traceable to the design docs under
`docs/superpowers/` — calibrated to respect CLAUDE.md (Simplicity First,
Surgical Changes, comments explain *why* not *what*).

## When this applies

Any time you create or modify a `.js` source file in this repo.

## The three building blocks

### 1. File header — every `.js` file
2–5 `//` lines after `'use strict';`:
- one-line purpose ("(pure)" for side-effect-free modules);
- the governing spec section, with the **full path once**, e.g.
  `spec §7 (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md)`;
- an optional forward-note when a later milestone will change the file.

### 2. Decision-point comments — only where non-obvious
Short `// why + §-ref` at genuine decisions (a gate, a fallback, an add/remove
reconciliation, an error threshold). NOT on trivial helpers. Once the header has
named the path, inline comments use just `§N`.

### 3. JSDoc — only on pure public module exports
`@param`/`@returns` with the spec ref in the description, on the exported
functions of pure `/lib` modules (the tested interfaces). Do NOT put JSDoc on:
- glue / class methods (e.g. `device.js`) — header + decision comments only;
- internal helpers (e.g. `num()`) — at most a one-line `//`.

## Reference grammar
- `spec §N` · `notes/<YYYY-MM-DD>-<topic>.md §N` · `plan task N`
- Reference the rationale; never duplicate spec prose into code (it drifts).

## JSON is exempt
`.homeycompose/.../*.json` can't hold comments, and a `_comment` key risks
`homey app validate`. Document those via the spec and a folder `README.md`.

## Example — good

```js
'use strict';

// Freshness decision (pure) — spec §7
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Probe values are trustworthy only after the pump has circulated water for a
// warmup period; still-water readings must not be treated as live chemistry.
// M0 gates on an in-memory rising edge (pumpOnSince); M1 will derive freshness
// from the payload's PUMP_LAST_ON instead — see notes/2026-06-26-m1-inputs.md §1.

/**
 * Decide whether current readings reflect circulating water (spec §7).
 * @param {object}  args
 * @param {boolean} args.pumpOn        Pump currently running (PUMP === 1).
 * @param {?number} args.pumpOnSince   Unix s of the current pump-on rising edge, or null.
 * @param {number}  args.now           Current time in unix seconds (controller clock).
 * @param {number}  args.warmupSeconds Continuous run time required before fresh.
 * @returns {boolean} True when readings are fresh.
 */
function isFresh({ pumpOn, pumpOnSince, now, warmupSeconds }) {
  if (!pumpOn || pumpOnSince === null || pumpOnSince === undefined) return false;
  return now - pumpOnSince >= warmupSeconds;
}
```

## Red flags
- JSDoc on a 3-line glue method → too heavy; use a one-line `// why` comment.
- A comment restating the code ("increment counter") → delete it; comment the *why*.
- Pasting spec rationale into the code → reference `§N` instead.
````

- [ ] **Step 3: Sanity-check the skill file**

Run: `npm test`
Expected: still all green (no source changed; guards that this task added only the skill file).
Also verify the file has valid frontmatter (`name`, `description` present) and that the description contains the trigger phrase "writing or modifying any source file".

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/documenting-code/SKILL.md
git commit -m "docs(skill): add documenting-code convention skill"
```

---

### Task 2: Retrofit the pure `/lib` modules

**Files:**
- Modify: `lib/VioletClient.js`
- Modify: `lib/FeatureDetector.js`
- Modify: `lib/Freshness.js`
- Modify: `lib/Capabilities.js`

**Interfaces:**
- Consumes: the convention from Task 1.
- Produces: documented public exports (signatures unchanged) consumed by `device.js` in Task 3 — `buildReadingsUrl`, `parseReadings`, `fetchReadings`, `detectFeatures`, `isFresh`, `channelSubCapId`, `choosePrimaryTemperature`, `desiredFeatureCapabilities`, `buildCapabilityUpdates`.

- [ ] **Step 1: Replace `lib/VioletClient.js` with the documented version**

```js
'use strict';

// Violet HTTP read client (pure parse + one fetch) — spec §4, §11
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Builds the read URL, fetches getReadings?ALL, and normalizes the raw payload
// into the shape device.js consumes. The read path is credential-free (§13).

/**
 * Build the credential-free read URL for a host (spec §1, §13).
 * @param {string} host Hostname or IP of the Violet controller.
 * @returns {string} `http://<host>/getReadings?ALL`.
 */
function buildReadingsUrl(host) {
  return `http://${host}/getReadings?ALL`;
}

// Coerce a Violet field (string or number) to a finite number, else null.
function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a raw getReadings payload into the core M0 reading set (spec §5).
 * Only `onewireN` channels reporting state "OK" become temperature channels (§8);
 * `chlorine` is null when the controller omits `pot_value` (§5).
 * @param {object} raw Parsed JSON from getReadings?ALL.
 * @returns {{ph: ?number, orp: ?number, chlorine: ?number, pumpOn: boolean,
 *   tempChannels: Array<{id: number, value: number, state: string}>,
 *   timeUnix: ?number, raw: object}} Normalized readings.
 */
function parseReadings(raw) {
  const tempChannels = [];
  for (let id = 1; id <= 12; id += 1) {
    const state = raw[`onewire${id}_state`];
    const value = num(raw[`onewire${id}_value`]);
    if (state === 'OK' && value !== null) {
      tempChannels.push({ id, value, state });
    }
  }
  return {
    ph: num(raw.pH_value),
    orp: num(raw.orp_value),
    chlorine: raw.pot_value === undefined ? null : num(raw.pot_value),
    pumpOn: Number(raw.PUMP) === 1,
    tempChannels,
    timeUnix: num(raw.CURRENT_TIME_UNIX),
    raw,
  };
}

/**
 * Fetch and JSON-parse getReadings?ALL with a hard timeout (spec §10).
 * Aborts after `timeoutMs` and throws on non-OK HTTP, so the caller's failure
 * counter can drive setUnavailable after 3 consecutive failures (§10).
 * @param {string} host Hostname or IP of the Violet controller.
 * @param {{timeoutMs?: number}} [opts] Options; `timeoutMs` default 10000.
 * @returns {Promise<object>} Parsed JSON payload.
 */
async function fetchReadings(host, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildReadingsUrl(host), { signal: controller.signal });
    if (!res.ok) throw new Error(`Violet HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { buildReadingsUrl, parseReadings, fetchReadings };
```

- [ ] **Step 2: Replace `lib/FeatureDetector.js` with the documented version**

```js
'use strict';

// Feature detection (pure) — spec §9
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Derives which optional features a pool exposes from the payload so device.js
// can reconcile capabilities (auto-detect + override). M0 wires only chlorine +
// OK temp channels; M2 consumes the rest (§9).

/**
 * Derive the set of present features from a raw payload (spec §9).
 * Chlorine counts as present when dosing is active (`DOS_1_CL_USE === '1'`) or a
 * potentiostat value is exposed (`pot_value`) (§5).
 * @param {object} raw Parsed JSON from getReadings?ALL.
 * @returns {{chlorine: boolean, electrolysis: boolean, heater: boolean,
 *   solar: boolean, light: boolean, cover: boolean, refill: boolean,
 *   pvSurplus: boolean, okTempChannels: number[]}} Feature presence map.
 */
function detectFeatures(raw) {
  const okTempChannels = [];
  for (let id = 1; id <= 12; id += 1) {
    if (raw[`onewire${id}_state`] === 'OK') okTempChannels.push(id);
  }
  const has = (key) => Object.prototype.hasOwnProperty.call(raw, key);
  return {
    chlorine: raw.DOS_1_CL_USE === '1' || has('pot_value'),
    electrolysis: raw.DOS_2_ELO_USE === '1',
    heater: has('HEATER'),
    solar: has('SOLAR'),
    light: has('LIGHT'),
    cover: has('COVER_STATE'),
    refill: has('REFILL'),
    pvSurplus: has('PVSURPLUS'),
    okTempChannels,
  };
}

module.exports = { detectFeatures };
```

- [ ] **Step 3: Replace `lib/Freshness.js` with the documented version**

```js
'use strict';

// Freshness decision (pure) — spec §7
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Probe values are trustworthy only after the pump has circulated water for a
// warmup period; still-water readings must not be treated as live chemistry.
// M0 gates on an in-memory rising edge (pumpOnSince); M1 will derive freshness
// from the payload's PUMP_LAST_ON instead — see notes/2026-06-26-m1-inputs.md §1.

/**
 * Decide whether current readings reflect circulating water (spec §7).
 * @param {object}  args
 * @param {boolean} args.pumpOn        Pump currently running (PUMP === 1).
 * @param {?number} args.pumpOnSince   Unix s of the current pump-on rising edge, or null.
 * @param {number}  args.now           Current time in unix seconds (controller clock).
 * @param {number}  args.warmupSeconds Continuous run time required before readings count as fresh.
 * @returns {boolean} True when readings are fresh.
 */
function isFresh({ pumpOn, pumpOnSince, now, warmupSeconds }) {
  if (!pumpOn || pumpOnSince === null || pumpOnSince === undefined) return false;
  return now - pumpOnSince >= warmupSeconds;
}

module.exports = { isFresh };
```

- [ ] **Step 4: Replace `lib/Capabilities.js` with the documented version**

```js
'use strict';

// Capability mapping & per-poll update planning (pure) — spec §5, §7, §8, §9
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Translates normalized readings + detected features into the capability set the
// Pool device should expose and the values to write each poll. Fresh-gating of
// ph/orp/chlorine lives here (§7); device.js just applies the result.

// Feature key → custom capability id. M0 wires only chlorine; M2 extends this (§9).
const FEATURE_CAPABILITY = {
  chlorine: 'measure_chlorine',
};

/**
 * Sub-capability id for a temperature channel (spec §8).
 * @param {number} id 1-wire channel number.
 * @returns {string} e.g. `measure_temperature.ow3`.
 */
function channelSubCapId(id) {
  return `measure_temperature.ow${id}`;
}

/**
 * Pick the value for the primary water-temperature capability (spec §8).
 * With "auto"/unset, auto-selects iff exactly one OK channel exists; otherwise
 * matches the user-selected channel id. Returns null when undecidable.
 * @param {Array<{id: number, value: number}>} tempChannels OK channels.
 * @param {string|number|null} selectedChannel Setting value or "auto".
 * @returns {?number} Chosen temperature, or null.
 */
function choosePrimaryTemperature(tempChannels, selectedChannel) {
  if (selectedChannel === 'auto' || selectedChannel === null || selectedChannel === undefined) {
    return tempChannels.length === 1 ? tempChannels[0].value : null;
  }
  const match = tempChannels.find((c) => c.id === Number(selectedChannel));
  return match ? match.value : null;
}

/**
 * Resolve which feature capabilities should be present (spec §9).
 * Per feature: "force" always shows, "auto" shows iff detected, else hidden.
 * @param {{features: object, overrides: object}} args Detected features + per-group mode.
 * @returns {string[]} Capability ids that should be present.
 */
function desiredFeatureCapabilities({ features, overrides }) {
  const caps = [];
  for (const [feature, capId] of Object.entries(FEATURE_CAPABILITY)) {
    const mode = (overrides && overrides[feature]) || 'auto';
    const present = mode === 'force' || (mode === 'auto' && !!(features && features[feature]));
    if (present) caps.push(capId);
  }
  return caps;
}

/**
 * Build the per-poll capability→value map (spec §5, §7).
 * pump_running, measurements_fresh and temperature update every poll; ph/orp/
 * chlorine are included only when `fresh`, so still-water noise never overwrites
 * the last fresh value (§7).
 * @param {{parsed: object, fresh: boolean, primaryChannel: ?number}} args
 * @returns {Object<string, *>} Capability id → value (skip null/undefined when applying).
 */
function buildCapabilityUpdates({ parsed, fresh, primaryChannel }) {
  const updates = {
    pump_running: parsed.pumpOn,
    measurements_fresh: fresh,
    measure_temperature: primaryChannel,
  };
  for (const ch of parsed.tempChannels) {
    updates[channelSubCapId(ch.id)] = ch.value;
  }
  if (fresh) {
    updates.measure_ph = parsed.ph;
    updates.measure_orp = parsed.orp;
    if (parsed.chlorine !== null) updates.measure_chlorine = parsed.chlorine;
  }
  return updates;
}

module.exports = {
  FEATURE_CAPABILITY,
  channelSubCapId,
  choosePrimaryTemperature,
  desiredFeatureCapabilities,
  buildCapabilityUpdates,
};
```

- [ ] **Step 5: Verify tests still pass**

Run: `npm test`
Expected: all tests pass — proves only comments/JSDoc were added, exports unchanged.

- [ ] **Step 6: Verify no executable lines changed**

Run: `git diff --stat lib/`
Expected: four files changed, insertions only (added comment/JSDoc lines). Skim `git diff lib/` and confirm every removed line is an old comment being replaced and every added line is a comment/JSDoc — no logic lines altered.

- [ ] **Step 7: Commit**

```bash
git add lib/VioletClient.js lib/FeatureDetector.js lib/Freshness.js lib/Capabilities.js
git commit -m "docs(lib): add headers + spec-linked JSDoc to pure modules"
```

---

### Task 3: Retrofit the `device.js` / `app.js` glue

**Files:**
- Modify: `drivers/pool/device.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: the documented `/lib` exports from Task 2 (signatures unchanged).
- Produces: no new symbols — header + decision-point comments only, no JSDoc.

- [ ] **Step 1: Replace `drivers/pool/device.js` with the documented version**

```js
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
```

- [ ] **Step 2: Replace `app.js` with the documented version**

```js
'use strict';

// Violet app entry point — spec §4. Thin shell; all device logic lives in
// drivers/pool/device.js.

const Homey = require('homey');

class VioletApp extends Homey.App {
  async onInit() {
    this.log('Violet app initialized');
  }
}

module.exports = VioletApp;
```

- [ ] **Step 3: Verify tests still pass**

Run: `npm test`
Expected: all tests pass (the lib suite is unaffected; this guards that the glue still loads/parses).

- [ ] **Step 4: Verify no executable lines changed**

Run: `git diff drivers/pool/device.js app.js`
Expected: every added line is a comment; the only removed lines are the three old bare comments in `device.js` (`// Track pump on/off transition for warmup`, `// 1) feature-group capabilities (M0: chlorine only)`, `// 2) temperature sub-sensors for each OK channel`) being replaced by their §-referenced versions. No logic line altered.

- [ ] **Step 5: Commit**

```bash
git add drivers/pool/device.js app.js
git commit -m "docs(device): add header + spec-linked decision-point comments"
```

---

### Task 4: Capability JSON cross-reference README

**Files:**
- Create: `.homeycompose/capabilities/README.md`

**Interfaces:**
- Consumes: the convention from Task 1 (JSON-exempt rule).
- Produces: a static doc; no code symbols.

- [ ] **Step 1: Create the README**

Create `.homeycompose/capabilities/README.md` with exactly this content:

```markdown
# Custom capabilities — spec cross-reference

JSON capability definitions can't carry inline comments, so their rationale
lives in the M0 design spec
(`docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md`).

| File | Capability | Spec |
|---|---|---|
| `measure_ph.json` | pH, fresh-gated | §5, §7; Insights §5.1 |
| `measure_orp.json` | Redox / ORP (mV), fresh-gated | §5, §7; Insights §5.1 |
| `measure_chlorine.json` | Free chlorine (ppm), feature-detected + fresh-gated | §5, §7, §9; Insights §5.1 |
| `pump_running.json` | Pump on/off, every poll | §5; Insights §5.1 |
| `measurements_fresh.json` | Freshness indicator, derived | §5, §7; Insights §5.1 |

`measure_temperature` (primary + `.owN` sub-sensors) is the **standard** Homey
capability, not defined here; it logs to Insights by default (§5.1, §8).

All custom capabilities set `"insights": true` with an `insightsTitle` (§5.1, §12).
```

- [ ] **Step 2: Verify the app still validates**

Run: `npm test`
Expected: all green (no source touched). The new README is documentation only and is not schema-validated; no capability JSON was edited.

- [ ] **Step 3: Commit**

```bash
git add .homeycompose/capabilities/README.md
git commit -m "docs(capabilities): cross-reference custom caps to spec sections"
```

---

## Notes

- **Deferred follow-up (not in this plan):** promote a copy of `documenting-code` to `~/.claude/skills/` once it has proven itself, per spec §4 / §8.
- **Not an Mx milestone:** do not update `docs/dashboard/dashboard.html`.
- If `homey` CLI is available in the environment, `homey app validate` may be run as an extra guard after Task 3, but `npm test` is the authoritative gate for this comments-only change.
