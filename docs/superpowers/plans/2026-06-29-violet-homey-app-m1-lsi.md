# M1 LSI Flagship — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live Langelier Saturation Index (LSI) water-balance safety net (optional, fresh-gated, with a warning Flow card) and refactor pump-freshness onto the payload's `PUMP_LAST_ON`.

**Architecture:** New pure `lib/Lsi.js` (Carrier LSI math, pH-dependent CYA correction, unit conversion, ANSI/PHTA/ICC-11 classification) consumed by the thin `device.js` glue. A new `measure_lsi` capability is added/removed dynamically per an opt-in `lsi_enabled` setting; chemistry inputs come from device settings (+ a "Set water chemistry" Flow action); an edge-triggered "LSI warning" Flow trigger fires on band changes. Freshness is derived from `PUMP_LAST_ON` instead of in-memory state.

**Tech Stack:** Homey Apps SDK v3 (Homey Compose), Node.js (`node --test`), no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-29-violet-homey-app-m1-lsi-design.md`

## Global Constraints

- SDK3 app `de.neunbft.violet`, `compatibility >=12.2.0`; copy values verbatim — do not change app id/version except via the finalize task.
- Every **custom capability** sets `"insights": true` + `"insightsTitle"` (spec §6; M0 §5.1).
- All non-trivial logic is **pure** and lives in `/lib`, unit-tested via `node --test`; `device.js`/`driver.js` stay thin glue.
- **Documenting-code convention** (project skill `documenting-code`): every `.js` file starts with a header citing the governing spec section; **pure `/lib` exports get JSDoc**; glue (`device.js`, `driver.js`) gets header + decision-point comments but **no JSDoc**; capability/flow JSON is exempt. Cite `M1 spec §…` (and notes where relevant).
- **Dev gate:** `npx homey app validate --level=debug` must PASS after every task that touches manifest/capability/flow/settings JSON or driver/device code.
- **LSI math (spec §4):** TDS fixed = 1000 ppm (A = 0.2); temperature in Kelvin = °C + 273.15; carbonate alkalinity = total − CYA·0.3877·(1/(1+10^(6.88−pH))); `computeLSI` returns `null` on any missing required input; values rounded to 2 decimals.
- **Bands (spec §5):** balanced −0.3…+0.5 (ANSI/PHTA/ICC-11); corrosive −0.5…<−0.3 (warning), <−0.5 (critical); scaling >+0.5…+1.0 (warning), >+1.0 (critical).
- **LSI gating (spec §6, §7, §9):** computed only when `lsi_enabled === true` AND `measurements_fresh === true`; `measure_lsi` is `null` (GUI "–", Insights gap) when disabled/stale/incomplete; warnings never fire then.
- `lsi_enabled` default **false** (opt-in).
- **Versioning (spec §13, `docs/dashboard/versions.md`):** the first build installed to the Homey is `0.1.1` via `npx homey app version patch` + `.homeychangelog.json` (en/de) + a `versions.md` row.
- Tests run with `node --test`; never use a different test runner.

---

### Task 1: `lib/Lsi.js` — LSI math, CYA correction, units, classification (pure)

**Files:**
- Create: `lib/Lsi.js`
- Test: `test/Lsi.test.js`

**Interfaces:**
- Produces:
  - `toPpmCaCO3(value: number, unit: 'ppm'|'dH'|'fH') -> number|null`
  - `carbonateAlkalinity(totalAlkalinityPpm: number, cya: number, pH: number) -> number`
  - `computeLSI({ pH: number, tempC: number, calciumHardnessPpm: number, totalAlkalinityPpm: number, cya?: number }) -> number|null`
  - `classifyLSI(lsi: number|null) -> { band: string, direction: string, severity: string } | null`
  - `TDS_PPM: number` (=1000)

- [ ] **Step 1: Write the failing test**

Create `test/Lsi.test.js`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { toPpmCaCO3, carbonateAlkalinity, computeLSI, classifyLSI } = require('../lib/Lsi');

const near = (actual, expected, eps = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} ≈ ${expected}`);

test('toPpmCaCO3 converts units', () => {
  assert.strictEqual(toPpmCaCO3(100, 'ppm'), 100);
  near(toPpmCaCO3(10, 'dH'), 178.48);
  assert.strictEqual(toPpmCaCO3(30, 'fH'), 300);
  assert.strictEqual(toPpmCaCO3(NaN, 'ppm'), null);
  assert.strictEqual(toPpmCaCO3(100, 'xx'), null);
});

test('carbonateAlkalinity applies pH-dependent CYA correction', () => {
  // CYA=0 ⇒ unchanged.
  near(carbonateAlkalinity(100, 0, 7.5), 100);
  // At pH 7.6 the factor ≈ 1/3 (industry rule of thumb).
  near(carbonateAlkalinity(100, 60, 7.6), 100 - 60 / 3, 0.5);
  // Floored to >= 1 (never log10(<=0)).
  assert.ok(carbonateAlkalinity(10, 1000, 7.5) >= 1);
});

test('computeLSI: corrosive reference case', () => {
  // pH 7.2, 28 °C, Ca 300 ppm, TA 80 ppm, CYA 0 → ≈ -0.35.
  near(computeLSI({ pH: 7.2, tempC: 28, calciumHardnessPpm: 300, totalAlkalinityPpm: 80, cya: 0 }), -0.35, 0.02);
});

test('computeLSI: CYA correction lowers LSI', () => {
  const withCya = computeLSI({ pH: 7.5, tempC: 28, calciumHardnessPpm: 350, totalAlkalinityPpm: 100, cya: 40 });
  const without = computeLSI({ pH: 7.5, tempC: 28, calciumHardnessPpm: 350, totalAlkalinityPpm: 100, cya: 0 });
  near(withCya, 0.06, 0.03);
  assert.ok(withCya < without, 'CYA correction must reduce LSI');
});

test('computeLSI returns null on missing required input', () => {
  assert.strictEqual(computeLSI({ pH: 7.2, tempC: 28, calciumHardnessPpm: 300, totalAlkalinityPpm: NaN, cya: 0 }), null);
  assert.strictEqual(computeLSI({ pH: 7.2, tempC: null, calciumHardnessPpm: 300, totalAlkalinityPpm: 80, cya: 0 }), null);
});

test('classifyLSI bands at boundaries', () => {
  assert.strictEqual(classifyLSI(-0.51).band, 'severe_corrosive');
  assert.strictEqual(classifyLSI(-0.5).band, 'corrosive');
  assert.strictEqual(classifyLSI(-0.3).band, 'balanced');
  assert.strictEqual(classifyLSI(0.5).band, 'balanced');
  assert.strictEqual(classifyLSI(0.51).band, 'scaling');
  assert.strictEqual(classifyLSI(1.0).band, 'scaling');
  assert.strictEqual(classifyLSI(1.01).band, 'severe_scaling');
  assert.strictEqual(classifyLSI(-1).severity, 'critical');
  assert.strictEqual(classifyLSI(0).direction, 'balanced');
  assert.strictEqual(classifyLSI(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/Lsi.test.js`
Expected: FAIL — `Cannot find module '../lib/Lsi'`.

- [ ] **Step 3: Write the implementation**

Create `lib/Lsi.js`:

```js
'use strict';

// Langelier Saturation Index (pure) — M1 spec §4, §5
// (docs/superpowers/specs/2026-06-29-violet-homey-app-m1-lsi-design.md).
// Computes the LSI from live pH + temperature and manual chemistry, applies a
// pH-dependent cyanuric-acid (CYA) correction, converts hardness/alkalinity
// units to ppm CaCO3, and classifies the result against ANSI/PHTA/ICC-11 bands.
// All functions are pure and total: invalid/missing input yields null, never throws.

// Fixed TDS assumption (spec §4): LSI is log-insensitive to TDS, so a constant
// 1000 ppm is used (A-factor = (log10(1000)-1)/10 = 0.2).
const TDS_PPM = 1000;

// Cyanurate correction constants (spec §4): 0.3877 = CaCO3 eq-weight (50.04 mg/meq)
// / CYA molar mass (129.08 g/mol); 6.88 = first dissociation pKa of cyanuric acid.
const CYA_CACO3_FACTOR = 0.3877;
const CYA_PKA = 6.88;

// Minimum positive value fed to log10 to avoid log10(<=0) (spec §4, §11).
const LOG_FLOOR = 1;

// Unit → multiplier to ppm CaCO3 (spec §4): °dH = 17.848 mg/L, °f = 10 mg/L.
const UNIT_TO_PPM = { ppm: 1, dH: 17.848, fH: 10 };

/**
 * Convert a hardness/alkalinity value to ppm as CaCO3 (spec §4).
 * @param {number} value Numeric reading in the given unit.
 * @param {string} unit One of "ppm", "dH", "fH".
 * @returns {?number} Value in ppm CaCO3, or null if value/unit invalid.
 */
function toPpmCaCO3(value, unit) {
  const factor = UNIT_TO_PPM[unit];
  if (factor === undefined || !Number.isFinite(value)) return null;
  return value * factor;
}

/**
 * Carbonate alkalinity = total alkalinity minus the pH-dependent cyanurate
 * contribution (spec §4). Floored to a small positive value for log10 safety.
 * @param {number} totalAlkalinityPpm Total alkalinity as ppm CaCO3.
 * @param {number} cya Cyanuric acid in ppm (0 if none).
 * @param {number} pH Current pH.
 * @returns {number} Carbonate alkalinity as ppm CaCO3 (>= LOG_FLOOR).
 */
function carbonateAlkalinity(totalAlkalinityPpm, cya, pH) {
  const ionizedFraction = 1 / (1 + Math.pow(10, CYA_PKA - pH));
  const cyanurate = (Number.isFinite(cya) ? cya : 0) * CYA_CACO3_FACTOR * ionizedFraction;
  return Math.max(LOG_FLOOR, totalAlkalinityPpm - cyanurate);
}

/**
 * Compute the Langelier Saturation Index (Carrier closed form, spec §4).
 * Returns null if any required input (pH, tempC, calcium, alkalinity) is
 * missing or non-finite; CYA missing is treated as 0.
 * @param {object} args
 * @param {number} args.pH
 * @param {number} args.tempC Water temperature in °C.
 * @param {number} args.calciumHardnessPpm Calcium hardness as ppm CaCO3.
 * @param {number} args.totalAlkalinityPpm Total alkalinity as ppm CaCO3.
 * @param {number} [args.cya] Cyanuric acid in ppm.
 * @returns {?number} LSI rounded to 2 decimals, or null.
 */
function computeLSI({ pH, tempC, calciumHardnessPpm, totalAlkalinityPpm, cya }) {
  if (![pH, tempC, calciumHardnessPpm, totalAlkalinityPpm].every(Number.isFinite)) return null;
  const carbonate = carbonateAlkalinity(totalAlkalinityPpm, cya, pH);
  const A = (Math.log10(TDS_PPM) - 1) / 10;
  const B = -13.12 * Math.log10(tempC + 273.15) + 34.55;
  const C = Math.log10(Math.max(LOG_FLOOR, calciumHardnessPpm)) - 0.4;
  const D = Math.log10(carbonate);
  const pHs = (9.3 + A + B) - (C + D);
  return Math.round((pH - pHs) * 100) / 100;
}

/**
 * Classify an LSI value against ANSI/PHTA/ICC-11 bands (spec §5). The critical
 * thresholds (-0.5 / +1.0) are the app's own severity escalation.
 * @param {?number} lsi LSI value, or null.
 * @returns {?{band: string, direction: string, severity: string}} null when lsi is null.
 */
function classifyLSI(lsi) {
  if (!Number.isFinite(lsi)) return null;
  if (lsi < -0.5) return { band: 'severe_corrosive', direction: 'corrosive', severity: 'critical' };
  if (lsi < -0.3) return { band: 'corrosive', direction: 'corrosive', severity: 'warning' };
  if (lsi <= 0.5) return { band: 'balanced', direction: 'balanced', severity: 'ok' };
  if (lsi <= 1.0) return { band: 'scaling', direction: 'scaling', severity: 'warning' };
  return { band: 'severe_scaling', direction: 'scaling', severity: 'critical' };
}

module.exports = { toPpmCaCO3, carbonateAlkalinity, computeLSI, classifyLSI, TDS_PPM };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/Lsi.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/Lsi.js test/Lsi.test.js
git commit -m "feat(lsi): pure LSI math, pH-dependent CYA correction, unit conversion, classification (M1 §4,§5)"
```

---

### Task 2: `lib/VioletClient.js` — expose `pumpLastOn`

**Files:**
- Modify: `lib/VioletClient.js` (`parseReadings`)
- Test: `test/VioletClient.test.js`

**Interfaces:**
- Produces: `parseReadings(raw)` return object gains `pumpLastOn: number|null` (from `PUMP_LAST_ON`, unix seconds).

- [ ] **Step 1: Write the failing test**

Append to `test/VioletClient.test.js`:

```js
test('parseReadings exposes pumpLastOn from PUMP_LAST_ON', () => {
  assert.strictEqual(parseReadings({ PUMP_LAST_ON: '1782331200' }).pumpLastOn, 1782331200);
  assert.strictEqual(parseReadings({}).pumpLastOn, null);
});
```

> If `parseReadings` is not yet imported in this file, add `const { parseReadings } = require('../lib/VioletClient');` near the top (check existing imports first to avoid duplicates).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/VioletClient.test.js`
Expected: FAIL — `pumpLastOn` is `undefined`, not `1782331200`.

- [ ] **Step 3: Write the implementation**

In `lib/VioletClient.js`, inside `parseReadings`'s returned object, add `pumpLastOn` next to `timeUnix`:

```js
  return {
    ph: num(raw.pH_value),
    orp: num(raw.orp_value),
    chlorine: raw.pot_value === undefined ? null : num(raw.pot_value),
    pumpOn: Number(raw.PUMP) === 1,
    tempChannels,
    timeUnix: num(raw.CURRENT_TIME_UNIX),
    pumpLastOn: num(raw.PUMP_LAST_ON),
    raw,
  };
```

Update the JSDoc `@returns` line for `parseReadings` to include `pumpLastOn: ?number` (M1 spec §10; notes/2026-06-26-m1-inputs.md §1).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/VioletClient.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/VioletClient.js test/VioletClient.test.js
git commit -m "feat(client): parse PUMP_LAST_ON into pumpLastOn (M1 §10)"
```

---

### Task 3: `lib/Freshness.js` — derive freshness from `pumpLastOn` + `now`

**Files:**
- Modify: `lib/Freshness.js`
- Test: `test/Freshness.test.js` (rewrite)

**Interfaces:**
- Produces: `isFresh({ pumpOn: boolean, pumpLastOn: number|null, now: number, warmupSeconds: number }) -> boolean`
- Consumes: nothing (pure).

- [ ] **Step 1: Rewrite the test**

Replace the entire body of `test/Freshness.test.js` with:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { isFresh } = require('../lib/Freshness');

test('not fresh while pump is off', () => {
  assert.strictEqual(isFresh({ pumpOn: false, pumpLastOn: 1000, now: 5000, warmupSeconds: 120 }), false);
});

test('not fresh during warmup window', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 1000, now: 1060, warmupSeconds: 120 }), false);
});

test('fresh once warmup elapsed', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 1000, now: 1120, warmupSeconds: 120 }), true);
});

test('fresh immediately for a long-running pump (survives app restart)', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 1000, now: 99999, warmupSeconds: 120 }), true);
});

test('not fresh if pumpLastOn missing despite pumpOn', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: null, now: 5000, warmupSeconds: 120 }), false);
});

test('backward controller-clock step is clamped (not fresh)', () => {
  assert.strictEqual(isFresh({ pumpOn: true, pumpLastOn: 5000, now: 1000, warmupSeconds: 120 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/Freshness.test.js`
Expected: FAIL — current `isFresh` expects `pumpOnSince`, so the long-running/clamp cases fail.

- [ ] **Step 3: Write the implementation**

Replace the function + JSDoc in `lib/Freshness.js` (keep/adjust the file header to reference M1 §10):

```js
/**
 * Decide whether current readings reflect circulating water (M1 spec §10; M0 §7).
 * Derived from the payload's PUMP_LAST_ON so it survives app restarts and a
 * coherent controller clock avoids skew (notes/2026-06-26-m1-inputs.md §1).
 * @param {object}  args
 * @param {boolean} args.pumpOn        Pump currently running (PUMP === 1).
 * @param {?number} args.pumpLastOn    Unix s when the pump last turned on, or null.
 * @param {number}  args.now           Current time in unix seconds (controller clock).
 * @param {number}  args.warmupSeconds Continuous run time required before readings count as fresh.
 * @returns {boolean} True when readings are fresh.
 */
function isFresh({ pumpOn, pumpLastOn, now, warmupSeconds }) {
  if (!pumpOn || pumpLastOn === null || pumpLastOn === undefined) return false;
  return Math.max(0, now - pumpLastOn) >= warmupSeconds;
}
```

Update the file-header comment block to say freshness now derives from `PUMP_LAST_ON` (remove the "M1 will derive…" future-tense note).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/Freshness.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Freshness.js test/Freshness.test.js
git commit -m "refactor(freshness): derive from PUMP_LAST_ON + now, clamp delta (M1 §10)"
```

---

### Task 4: `lib/Capabilities.js` — place `measure_lsi` in the per-poll updates

**Files:**
- Modify: `lib/Capabilities.js` (`buildCapabilityUpdates`)
- Test: `test/Capabilities.test.js`

**Interfaces:**
- Produces: `buildCapabilityUpdates({ parsed, fresh, primaryChannel, lsi })` — return map gains `measure_lsi` (= `lsi ?? null`).
- Consumes: caller passes `lsi: number|null` (device.js computes it).

- [ ] **Step 1: Write the failing test**

Append to `test/Capabilities.test.js` (reuse the file's existing `parsed`-style fixture; a minimal inline one is shown):

```js
test('buildCapabilityUpdates places measure_lsi (fresh-gated)', () => {
  const parsed = { ph: 7.2, orp: 700, chlorine: 0.3, pumpOn: true, tempChannels: [] };
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: 0.12 }).measure_lsi,
    0.12,
  );
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: null }).measure_lsi,
    null,
  );
  // LSI value 0 must be preserved (not coerced to null).
  assert.strictEqual(
    buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 28, lsi: 0 }).measure_lsi,
    0,
  );
});
```

> Ensure `buildCapabilityUpdates` is imported at the top of `test/Capabilities.test.js` (it should already be).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/Capabilities.test.js`
Expected: FAIL — `measure_lsi` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `lib/Capabilities.js` `buildCapabilityUpdates`, add `measure_lsi` to the initial `updates` object and document it:

```js
  const updates = {
    pump_running: parsed.pumpOn,
    measurements_fresh: fresh,
    measure_temperature: primaryChannel,
    // LSI (M1 §6,§9): number when enabled+fresh+inputs complete, else null
    // (cleared to "–"/Insights gap). Capability may be absent (lsi_enabled off)
    // — device.js skips absent caps. `?? null` keeps a valid 0.
    measure_lsi: lsi ?? null,
  };
```

Update the function signature to destructure `lsi`: `function buildCapabilityUpdates({ parsed, fresh, primaryChannel, lsi }) {` and extend its JSDoc `@param` list with `@param {?number} args.lsi` (M1 §6, §9).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/Capabilities.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Capabilities.js test/Capabilities.test.js
git commit -m "feat(capabilities): place measure_lsi in per-poll updates, fresh-gated (M1 §6,§9)"
```

---

### Task 5: `device.js` — freshness wiring via `PUMP_LAST_ON`

**Files:**
- Modify: `drivers/pool/device.js`

**Interfaces:**
- Consumes: `parsed.pumpLastOn` (Task 2), `isFresh({pumpOn,pumpLastOn,now,warmupSeconds})` (Task 3).

- [ ] **Step 1: Run the full suite (baseline green)**

Run: `node --test`
Expected: PASS (Tasks 1–4 green).

- [ ] **Step 2: Remove in-memory rising-edge tracking**

In `drivers/pool/device.js` `onInit`, delete the line:

```js
    this._pumpOnSince = null;
```

In `_tick`, delete the rising-edge block:

```js
    if (parsed.pumpOn) {
      if (this._pumpOnSince === null) this._pumpOnSince = now;
    } else {
      this._pumpOnSince = null;
    }
```

- [ ] **Step 3: Switch `isFresh` to the payload-derived signature**

Replace the `const fresh = isFresh({...})` call with:

```js
    // Freshness from the payload's PUMP_LAST_ON (M1 §10; notes 2026-06-26 §1):
    // survives restarts, single coherent controller clock.
    const fresh = isFresh({
      pumpOn: parsed.pumpOn,
      pumpLastOn: parsed.pumpLastOn,
      now,
      warmupSeconds: this.getSetting('pumpWarmupSeconds') ?? 120,
    });
```

Update the nearby comment that references `_pumpOnSince`/in-memory tracking to reflect the new approach.

- [ ] **Step 4: Validate**

Run: `npx homey app validate --level=debug`
Expected: PASS (`✓ App validated successfully against level \`debug\``).
Also run `node --test` — expected PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add drivers/pool/device.js
git commit -m "refactor(device): freshness from PUMP_LAST_ON, drop in-memory _pumpOnSince (M1 §10)"
```

---

### Task 6: `measure_lsi` custom capability

**Files:**
- Create: `.homeycompose/capabilities/measure_lsi.json`
- Modify: `.homeycompose/capabilities/README.md` (add the new capability row/entry)

- [ ] **Step 1: Create the capability**

Create `.homeycompose/capabilities/measure_lsi.json`:

```json
{
  "type": "number",
  "title": { "en": "LSI", "de": "LSI" },
  "uiComponent": "sensor",
  "getable": true,
  "setable": false,
  "insights": true,
  "insightsTitle": { "en": "LSI (water balance)", "de": "LSI (Wasserbalance)" },
  "decimals": 2
}
```

- [ ] **Step 2: Document it**

In `.homeycompose/capabilities/README.md`, add `measure_lsi` to the list of custom capabilities (number, Insights-enabled, added/removed dynamically per `lsi_enabled` — M1 §6).

- [ ] **Step 3: Validate**

Run: `npx homey app validate --level=debug`
Expected: PASS (capability schema accepted; `app.json` regenerated).

- [ ] **Step 4: Commit**

```bash
git add .homeycompose/capabilities/measure_lsi.json .homeycompose/capabilities/README.md app.json
git commit -m "feat(capability): add measure_lsi (number, insights) (M1 §6)"
```

---

### Task 7: Device settings — LSI toggle, chemistry inputs, units, fixed temperature, info label

**Files:**
- Modify: `drivers/pool/driver.settings.compose.json`

- [ ] **Step 1: Append the "Water chemistry (LSI)" group**

Add this object as a new element at the end of the top-level array in `drivers/pool/driver.settings.compose.json`:

```json
{
  "type": "group",
  "label": { "en": "Water chemistry (LSI)", "de": "Wasserchemie (LSI)" },
  "children": [
    {
      "id": "lsi_enabled",
      "type": "checkbox",
      "label": { "en": "Compute LSI (Langelier index)", "de": "LSI (Langelier-Index) berechnen" },
      "value": false,
      "hint": { "en": "Off by default. Enable to show the LSI and water-balance warnings (needs the values below).", "de": "Standardmäßig aus. Aktivieren, um LSI und Wasserbalance-Warnungen anzuzeigen (benötigt die Werte unten)." }
    },
    {
      "id": "chem_info",
      "type": "label",
      "label": { "en": "About the LSI", "de": "Über den LSI" },
      "value": { "en": "Balanced is -0.3 to +0.5 (0 ideal), per ANSI/PHTA/ICC-11 — deliberately asymmetric: a slightly positive value is safer because a thin scale layer protects surfaces, whereas corrosive water (copper/heater!) causes permanent damage. Note: per DIN 19643 the index is NOT a valid indicator for stainless-steel corrosion.", "de": "Ausgeglichen ist -0,3 bis +0,5 (0 ideal), nach ANSI/PHTA/ICC-11 — bewusst asymmetrisch: ein leicht positiver Wert ist sicherer, weil eine dünne Kalkschicht schützt, während korrosives Wasser (Kupfer/Heizung!) bleibende Schäden verursacht. Hinweis: Laut DIN 19643 ist der Index NICHT als Indikator für Edelstahl-Korrosion geeignet." }
    },
    {
      "id": "chem_calcium_hardness",
      "type": "number",
      "label": { "en": "Calcium hardness", "de": "Calciumhärte" },
      "hint": { "en": "From your PoolLab/test. Required for the LSI.", "de": "Aus deinem PoolLab/Test. Für den LSI erforderlich." }
    },
    {
      "id": "chem_calcium_unit",
      "type": "dropdown",
      "label": { "en": "Calcium hardness unit", "de": "Einheit Calciumhärte" },
      "value": "ppm",
      "values": [
        { "id": "ppm", "label": { "en": "ppm (mg/L CaCO₃)", "de": "ppm (mg/L CaCO₃)" } },
        { "id": "dH", "label": { "en": "°dH", "de": "°dH" } },
        { "id": "fH", "label": { "en": "°f", "de": "°f" } }
      ]
    },
    {
      "id": "chem_total_alkalinity",
      "type": "number",
      "label": { "en": "Total alkalinity", "de": "Gesamtalkalität" },
      "hint": { "en": "From your PoolLab/test. Required for the LSI.", "de": "Aus deinem PoolLab/Test. Für den LSI erforderlich." }
    },
    {
      "id": "chem_alkalinity_unit",
      "type": "dropdown",
      "label": { "en": "Total alkalinity unit", "de": "Einheit Gesamtalkalität" },
      "value": "ppm",
      "values": [
        { "id": "ppm", "label": { "en": "ppm (mg/L CaCO₃)", "de": "ppm (mg/L CaCO₃)" } },
        { "id": "dH", "label": { "en": "°dH", "de": "°dH" } },
        { "id": "fH", "label": { "en": "°f", "de": "°f" } }
      ]
    },
    {
      "id": "chem_cya",
      "type": "number",
      "label": { "en": "Cyanuric acid (CYA, ppm)", "de": "Cyanursäure (CYA, ppm)" },
      "value": 0,
      "hint": { "en": "0 if unstabilised. Used for the pH-dependent alkalinity correction.", "de": "0 wenn unstabilisiert. Für die pH-abhängige Alkalitäts-Korrektur." }
    },
    {
      "id": "chem_fixed_temperature",
      "type": "number",
      "label": { "en": "Fixed temperature for LSI (°C)", "de": "Feste Temperatur für LSI (°C)" },
      "hint": { "en": "Only used if no water-temperature sensor is available/selected. Keep it representative.", "de": "Nur genutzt, wenn kein Wassertemperatur-Sensor verfügbar/gewählt ist. Repräsentativ halten." }
    }
  ]
}
```

> **SDK note:** if `npx homey app validate` rejects the `label`/`group` schema, adjust per the **homey-app** skill (`references/`), keeping the same ids/types — validation is the gate. Number settings intentionally have no `value` (start empty) except `chem_cya` (0).

- [ ] **Step 2: Validate**

Run: `npx homey app validate --level=debug`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add drivers/pool/driver.settings.compose.json app.json
git commit -m "feat(settings): LSI toggle + chemistry inputs (unit dropdowns), fixed-temp fallback, info label (M1 §8)"
```

---

### Task 8: `device.js` — LSI computation, temperature fallback, dynamic capability

**Files:**
- Modify: `drivers/pool/device.js`

**Interfaces:**
- Consumes: `computeLSI`, `toPpmCaCO3` (Task 1); `buildCapabilityUpdates({...,lsi})` (Task 4); `measure_lsi` capability (Task 6); chem settings (Task 7).

- [ ] **Step 1: Import the LSI helpers**

In `drivers/pool/device.js`, add to the `lib/Lsi` require (create the import line near the other `require`s):

```js
const { computeLSI, toPpmCaCO3 } = require('../../lib/Lsi');
```

- [ ] **Step 2: Compute the LSI (enabled + fresh gated) and pass it to the updates**

In `_tick`, after `const primaryChannel = choosePrimaryTemperature(...)` and before `buildCapabilityUpdates(...)`, insert:

```js
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
```

Change the updates call to pass `lsi`:

```js
    const updates = buildCapabilityUpdates({ parsed, fresh, primaryChannel, lsi });
```

- [ ] **Step 3: Add/remove `measure_lsi` per `lsi_enabled`**

In `_reconcileCapabilities`, add (near the chlorine feature-group reconcile):

```js
    // measure_lsi present iff LSI is enabled (M1 §6). Disabling removes it
    // (can break user Flows — accepted, it is the user's explicit choice).
    const wantLsi = this.getSetting('lsi_enabled') === true;
    if (wantLsi && !this.hasCapability('measure_lsi')) await this.addCapability('measure_lsi').catch(this.error);
    if (!wantLsi && this.hasCapability('measure_lsi')) await this.removeCapability('measure_lsi').catch(this.error);
```

- [ ] **Step 4: Re-tick on LSI/chemistry settings changes**

Replace `onSettings` with:

```js
  async onSettings({ changedKeys }) {
    if (changedKeys.includes('pollIntervalSeconds')) this._startPolling();
    // LSI toggle / chemistry edits take effect on the next poll — re-tick promptly.
    if (changedKeys.some((k) => k === 'lsi_enabled' || k.startsWith('chem_'))) {
      this._tick().catch(this.error);
    }
  }
```

- [ ] **Step 5: Validate + tests**

Run: `npx homey app validate --level=debug`
Expected: PASS.
Run: `node --test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add drivers/pool/device.js
git commit -m "feat(device): compute LSI (enabled+fresh), temp fallback, dynamic measure_lsi (M1 §6,§8,§9)"
```

---

### Task 9: "LSI warning" Flow trigger (edge-triggered)

**Files:**
- Create: `.homeycompose/flow/triggers/lsi_warning.json`
- Modify: `drivers/pool/device.js`

**Interfaces:**
- Consumes: `classifyLSI` (Task 1), the per-tick `lsi` (Task 8).

- [ ] **Step 1: Create the trigger card**

Create `.homeycompose/flow/triggers/lsi_warning.json`:

```json
{
  "id": "lsi_warning",
  "title": { "en": "LSI warning", "de": "LSI-Warnung" },
  "titleFormatted": { "en": "LSI warning ([[filter]])", "de": "LSI-Warnung ([[filter]])" },
  "hint": { "en": "Fires when the water balance enters a corrosive or scale-forming band.", "de": "Wird ausgelöst, wenn die Wasserbalance in ein korrosives oder kalkbildendes Band wechselt." },
  "args": [
    {
      "type": "dropdown",
      "name": "filter",
      "title": { "en": "When", "de": "Wann" },
      "values": [
        { "id": "all", "title": { "en": "Any warning", "de": "Jede Warnung" } },
        { "id": "corrosive", "title": { "en": "Corrosive only", "de": "Nur korrosiv" } },
        { "id": "scaling", "title": { "en": "Scaling only", "de": "Nur kalkbildend" } },
        { "id": "critical", "title": { "en": "Critical only", "de": "Nur kritisch" } }
      ]
    }
  ],
  "tokens": [
    { "name": "lsi", "type": "number", "title": { "en": "LSI", "de": "LSI" }, "example": -0.45 },
    { "name": "classification", "type": "string", "title": { "en": "Classification", "de": "Einstufung" }, "example": "corrosive" },
    { "name": "direction", "type": "string", "title": { "en": "Direction", "de": "Richtung" }, "example": "corrosive" },
    { "name": "severity", "type": "string", "title": { "en": "Severity", "de": "Schweregrad" }, "example": "warning" }
  ]
}
```

> **SDK note:** this is a **device** trigger card — obtained via `getDeviceTriggerCard('lsi_warning')`. Do not add a manual `device` arg (the SDK adds the device selector). Verify the compose path/shape via the **homey-app** skill; validate is the gate.

- [ ] **Step 2: Register the card + edge-detection in `device.js`**

In `onInit`, add (before `this._startPolling()`):

```js
    this._lastLsiBand = null;
    this._lsiWarning = this.homey.flow.getDeviceTriggerCard('lsi_warning');
    this._lsiWarning.registerRunListener((args, state) => {
      if (args.filter === 'all') return true;
      if (args.filter === 'critical') return state.severity === 'critical';
      return state.direction === args.filter; // 'corrosive' | 'scaling'
    });
```

Add `classifyLSI` to the `lib/Lsi` import:

```js
const { computeLSI, classifyLSI, toPpmCaCO3 } = require('../../lib/Lsi');
```

In `_tick`, after `const updates = buildCapabilityUpdates({ parsed, fresh, primaryChannel, lsi });` (and before/after applying updates), add the edge-trigger:

```js
    // Edge-trigger the warning only when the band CHANGES into a non-balanced
    // state (M1 §7,§9). null (disabled/stale/incomplete) clears the tracked band
    // and never fires; _lastLsiBand is in-memory (may re-fire once after restart).
    const cls = classifyLSI(lsi);
    const band = cls ? cls.band : null;
    if (cls && cls.severity !== 'ok' && band !== this._lastLsiBand) {
      this._lsiWarning
        .trigger(this, { lsi, classification: cls.band, direction: cls.direction, severity: cls.severity }, { direction: cls.direction, severity: cls.severity })
        .catch(this.error);
    }
    this._lastLsiBand = band;
```

- [ ] **Step 3: Validate**

Run: `npx homey app validate --level=debug`
Expected: PASS (flow trigger registered; `app.json` regenerated).
Run: `node --test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .homeycompose/flow/triggers/lsi_warning.json drivers/pool/device.js app.json
git commit -m "feat(flow): edge-triggered 'LSI warning' trigger with filter + tokens (M1 §7)"
```

---

### Task 10: "Set water chemistry" Flow action

**Files:**
- Create: `.homeycompose/flow/actions/set_water_chemistry.json`
- Modify: `drivers/pool/driver.js`

**Interfaces:**
- Consumes: the `chem_*` device settings (Task 7).

- [ ] **Step 1: Create the action card**

Create `.homeycompose/flow/actions/set_water_chemistry.json`:

```json
{
  "id": "set_water_chemistry",
  "title": { "en": "Set water chemistry", "de": "Wasserchemie setzen" },
  "titleFormatted": { "en": "Set calcium [[calcium]], alkalinity [[alkalinity]], CYA [[cya]]", "de": "Calcium [[calcium]], Alkalität [[alkalinity]], CYA [[cya]] setzen" },
  "hint": { "en": "Writes the slow-changing LSI chemistry values into this device's settings (in their configured units).", "de": "Schreibt die langsam veränderlichen LSI-Chemiewerte in die Einstellungen dieses Geräts (in den konfigurierten Einheiten)." },
  "args": [
    { "type": "device", "name": "device", "filter": "driver_id=pool" },
    { "type": "number", "name": "calcium", "title": { "en": "Calcium hardness", "de": "Calciumhärte" }, "min": 0 },
    { "type": "number", "name": "alkalinity", "title": { "en": "Total alkalinity", "de": "Gesamtalkalität" }, "min": 0 },
    { "type": "number", "name": "cya", "title": { "en": "Cyanuric acid (ppm)", "de": "Cyanursäure (ppm)" }, "min": 0 }
  ]
}
```

- [ ] **Step 2: Register the run listener in `driver.js`**

In `drivers/pool/driver.js` `onInit`, add:

```js
    // "Set water chemistry" Flow action (M1 §7): writes the slow LSI inputs into
    // the target device's settings; the next poll recomputes the LSI. This is the
    // seam the M6 LabCOM bridge / automations push values through.
    this.homey.flow.getActionCard('set_water_chemistry').registerRunListener(async (args) => {
      await args.device.setSettings({
        chem_calcium_hardness: args.calcium,
        chem_total_alkalinity: args.alkalinity,
        chem_cya: args.cya,
      });
      await args.device._tick().catch(args.device.error);
      return true;
    });
```

- [ ] **Step 3: Validate**

Run: `npx homey app validate --level=debug`
Expected: PASS.
Run: `node --test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .homeycompose/flow/actions/set_water_chemistry.json drivers/pool/driver.js app.json
git commit -m "feat(flow): 'Set water chemistry' action writes LSI inputs to settings (M1 §7)"
```

---

### Task 11: App description references the LSI standard (store)

**Files:**
- Modify: `.homeycompose/app.json` (`description`)

- [ ] **Step 1: Update the description**

In `.homeycompose/app.json`, replace the `description` value with:

```json
  "description": { "en": "Monitor a PoolDigital Violet pool controller, with an optional live Langelier (LSI) water-balance safety net — classification per ANSI/PHTA/ICC-11.", "de": "Überwacht einen PoolDigital-Violet-Poolregler, mit optionalem Live-Langelier-Index (LSI) als Wasserbalance-Sicherheitsnetz — Einstufung nach ANSI/PHTA/ICC-11." },
```

> The full long-form store description (with source links and the DIN 19643 stainless-steel caveat) is an M5 store-assets task; the in-app caveat already lives in the settings info label (Task 7).

- [ ] **Step 2: Validate**

Run: `npx homey app validate --level=debug`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add .homeycompose/app.json app.json
git commit -m "docs(store): mention optional LSI + ANSI/PHTA/ICC-11 in app description (M1 §5.2)"
```

---

### Task 12: Finalize — live smoke test, version bump, changelog, dashboard, push

**Files:**
- Modify: `.homeycompose/app.json` + `app.json` (version, via CLI), `.homeychangelog.json`, `docs/dashboard/versions.md`, `docs/dashboard/dashboard.html`

- [ ] **Step 1: Full validation + tests**

Run: `node --test`
Expected: PASS (all suites).
Run: `npx homey app validate --level=debug`
Expected: PASS.

- [ ] **Step 2: Live smoke test on hardware (homey-cli)**

Install to the user's Homey and verify against the real Violet (host `violet`):

```bash
npx homey app install
```

Then with the **homey-cli** skill, confirm on "Torstens Homey Pro": with `lsi_enabled` on and chemistry entered, `measure_lsi` populates while fresh and clears to "–" while stale; toggling `lsi_enabled` adds/removes the LSI tile; freshness still gates pH/ORP/chlorine. (`homey app run` is for transient dev; the install above is the first real upload → triggers the version bump in Step 3.)

- [ ] **Step 3: Bump the version + changelog (first M1 upload = 0.1.1)**

```bash
npx homey app version patch
```

Expected: `.homeycompose/app.json` and `app.json` version → `0.1.1`.

Add a `0.1.1` entry to `.homeychangelog.json` (keep existing `0.1.0`):

```json
  "0.1.1": {
    "en": "New: optional live Langelier (LSI) water-balance safety net with a configurable warning Flow card; classification per ANSI/PHTA/ICC-11. Enter calcium hardness, alkalinity and cyanuric acid in settings (or via the 'Set water chemistry' Flow action). More reliable pump-warmup detection.",
    "de": "Neu: optionaler Live-Langelier-Index (LSI) als Wasserbalance-Sicherheitsnetz mit konfigurierbarer Warn-Flow-Karte; Einstufung nach ANSI/PHTA/ICC-11. Calciumhärte, Alkalität und Cyanursäure in den Einstellungen eingeben (oder per Flow-Aktion „Wasserchemie setzen"). Zuverlässigere Pumpen-Vorlauf-Erkennung."
  }
```

Append a row to the `## Log` table in `docs/dashboard/versions.md`:

```
| `0.1.1` | 2026-06-29 | `<commit-sha>` | Homey-Install | M1 | LSI flagship + PUMP_LAST_ON freshness refactor. |
```

(Fill `<commit-sha>` with the short SHA of the bump commit from Step 4.)

- [ ] **Step 4: Update the dashboard (M1 done) and commit the release**

In `docs/dashboard/dashboard.html`, in the `M1` object: set all `steps[].done = true`, `status: "done"`, `currentActivity: null`, `finishedAt: "2026-06-29"`, `commit: "<short-sha>"`, append a `log` entry `{ at: "2026-06-29", note: "M1 LSI implementiert, validiert, installiert (0.1.1) und gepusht" }`, and set the top-level `updatedAt: "2026-06-29"`.

```bash
git add .homeycompose/app.json app.json .homeychangelog.json docs/dashboard/versions.md docs/dashboard/dashboard.html
git commit -m "chore(release): M1 LSI v0.1.1 — changelog, version log, dashboard done"
```

Then set the `commit`/`<commit-sha>` placeholders to this commit's short SHA (amend or a tiny follow-up commit) so `versions.md`/dashboard point at the real build.

- [ ] **Step 5: Integrate to `origin/main`**

Use **superpowers:finishing-a-development-branch** to merge `claude/nifty-rhodes-e77ae0` into `main` and push to `origin/main` (same as M0). Confirm `git log origin/main` shows the M1 commits.

---

## Notes for the executor
- After each task, the pure-module tests (`node --test`) and/or `npx homey app validate --level=debug` are the ground truth. Do not mark a task done on a red gate.
- SDK specifics (settings `label`/`group` schema, `getDeviceTriggerCard`, action `device` arg) are governed by the **homey-app** skill; live inspection via **homey-cli** against "Torstens Homey Pro" / the real Violet (host `violet`).
- Keep `device.js`/`driver.js` thin — all math stays in `lib/Lsi.js`.
