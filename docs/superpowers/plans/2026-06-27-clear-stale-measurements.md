# Clear Fresh-Gated Measurements on Stale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When readings are stale, write `null` to `measure_ph` / `measure_orp` / `measure_chlorine` so the Homey GUI shows "–" and Insights records a gap instead of carrying the last fresh value forward as a flat line.

**Architecture:** The fresh-gating already lives in the pure `buildCapabilityUpdates` (`lib/Capabilities.js`); add an `else` branch that emits explicit `null`s on stale. The device poll loop (`drivers/pool/device.js`) gains a precise apply rule — `undefined` = skip (leave as-is), `null` = clear to empty — replacing today's blanket skip-on-null.

**Tech Stack:** Node.js (built-in `node --test`), Homey Apps SDK v3, Homey Compose.

**Spec:** `docs/superpowers/specs/2026-06-27-m0-clear-stale-measurements-design.md` (referenced as **clear-stale §N**); foundation spec `…/2026-06-24-violet-homey-app-m0-foundation-design.md` (**M0 §N**).

## Global Constraints

- **Working directory:** `C:\Users\TorstenSturm\source\repos\VioletApp` (the OneDrive-free clone; OneDrive is paused/decommissioned).
- **No new dependencies.** The app has zero runtime/dev deps; tests are `node --test`.
- **Verify command:** `npm test` (runs `node --test`, currently 17 passing).
- **Documenting-code convention applies** (skill `documenting-code`): when logic changes, update the now-stale retrofit comments in the same edit; reference rationale with `§N`, never duplicate spec prose. The files already carry documented headers/JSDoc.
- **Apply-rule semantic (the core invariant):** in the device loop, `undefined` = leave capability as-is; `null` = clear to "–"; any other value = set. `hasCapability` still guards absent capabilities.
- **Surgical:** every changed line traces to this fix; match existing style.
- **Not an Mx milestone:** do **not** update `docs/dashboard/dashboard.html` (clear-stale §8).

---

### Task 1: Clear fresh-gated probes on stale (pure module, TDD)

**Files:**
- Modify: `test/Capabilities.test.js` (the freshness-gating test, ~lines 44–62)
- Modify: `lib/Capabilities.js` (`buildCapabilityUpdates` + its JSDoc, ~lines 55–78)

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildCapabilityUpdates({parsed, fresh, primaryChannel})` now returns `measure_ph === null`, `measure_orp === null`, `measure_chlorine === null` when `fresh === false` (previously those keys were absent). Unchanged: the fresh case (sets real values), and the "fresh **but** `parsed.chlorine === null` → `measure_chlorine` omitted" case.

- [ ] **Step 1: Update the test to assert clear-on-stale**

In `test/Capabilities.test.js`, replace the existing test (the one titled `buildCapabilityUpdates gates probe values on freshness`) with:

```js
test('buildCapabilityUpdates clears probe values to null when stale, sets them when fresh', () => {
  const parsed = {
    ph: 7.3, orp: 750, chlorine: 0.8, pumpOn: true,
    tempChannels: [{ id: 1, value: 26 }, { id: 3, value: 27 }],
  };
  const stale = buildCapabilityUpdates({ parsed, fresh: false, primaryChannel: 27 });
  assert.strictEqual(stale.measurements_fresh, false);
  assert.strictEqual(stale.pump_running, true);
  assert.strictEqual(stale.measure_temperature, 27);
  assert.strictEqual(stale['measure_temperature.ow1'], 26);
  assert.strictEqual(stale.measure_ph, null);
  assert.strictEqual(stale.measure_orp, null);
  assert.strictEqual(stale.measure_chlorine, null);

  const fresh = buildCapabilityUpdates({ parsed, fresh: true, primaryChannel: 27 });
  assert.strictEqual(fresh.measure_ph, 7.3);
  assert.strictEqual(fresh.measure_orp, 750);
  assert.strictEqual(fresh.measure_chlorine, 0.8);
});
```

Leave the other test (`buildCapabilityUpdates omits chlorine when fresh but chlorine is null`) unchanged — it guards the fresh-with-no-chlorine path that must stay `undefined`/omitted.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test`
Expected: FAIL on the new test — `stale.measure_ph` is `undefined` (key absent in current code), so `assert.strictEqual(undefined, null)` throws. The other 16 tests still pass.

- [ ] **Step 3: Implement the `else` branch and update the JSDoc**

In `lib/Capabilities.js`, replace the `buildCapabilityUpdates` JSDoc + function with:

```js
/**
 * Build the per-poll capability→value map (spec M0 §5, §7; clear-on-stale:
 * 2026-06-27-m0-clear-stale-measurements-design.md §3).
 * pump_running, measurements_fresh and temperature update every poll. ph/orp/
 * chlorine carry their fresh value while `fresh`; while stale they are set to
 * `null` so the GUI shows "–" and Insights records a gap instead of holding the
 * last fresh value as a flat line (§3).
 * @param {{parsed: object, fresh: boolean, primaryChannel: ?number}} args
 * @returns {Object<string, *>} Capability id → value. Apply rule (in device.js):
 *   `undefined` = leave as-is, `null` = clear to empty, else set.
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
  } else {
    // Stale: clear probes so the GUI shows "–" and Insights gaps instead of
    // carrying the last fresh value forward (clear-stale §3; M0 §7).
    updates.measure_ph = null;
    updates.measure_orp = null;
    updates.measure_chlorine = null;
  }
  return updates;
}
```

- [ ] **Step 4: Run the tests and confirm all pass**

Run: `npm test`
Expected: PASS — all 17 tests green (the updated test now sees `null`).

- [ ] **Step 5: Verify the diff is surgical**

Run: `git -C "C:\Users\TorstenSturm\source\repos\VioletApp" diff --stat lib/Capabilities.js test/Capabilities.test.js`
Expected: two files changed; in `lib/Capabilities.js` the only logic change is the added `else { … }` block (plus the JSDoc comment refresh).

- [ ] **Step 6: Commit**

```bash
git add lib/Capabilities.js test/Capabilities.test.js
git commit -m "feat(device): clear ph/orp/chlorine to null when stale (clear-stale §3)"
```

---

### Task 2: Apply `null` as a clear in the device poll loop

**Files:**
- Modify: `drivers/pool/device.js` (the apply loop + its comment, ~lines 81–88)

**Interfaces:**
- Consumes: `buildCapabilityUpdates` from Task 1 (now emits `null` for stale probes, and may emit `null` for `measure_temperature` when no channel is selected).
- Produces: no new symbols. The loop now writes `null` (clearing to "–") instead of skipping it; still skips `undefined`; `hasCapability` guard unchanged.

> Note: `device.js` is Homey runtime glue with no unit harness, so this task is gated by (a) `npm test` staying green — the change must not regress the pure suite — and (b) the live verification in Task 3. There is no new unit test.

- [ ] **Step 1: Change the apply-loop guard and refresh its comment**

In `drivers/pool/device.js`, replace this block:

```js
    const updates = buildCapabilityUpdates({ parsed, fresh, primaryChannel });
    // Skip null/undefined: "no fresh value yet" must not overwrite the last good one (spec §7).
    for (const [cap, value] of Object.entries(updates)) {
      if (value === null || value === undefined) continue;
      if (this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, value).catch(this.error);
      }
    }
```

with:

```js
    const updates = buildCapabilityUpdates({ parsed, fresh, primaryChannel });
    // Apply rule (clear-stale §3): undefined = leave as-is; null = clear to "–"
    // (Insights gap); else set. What is fresh-gated/cleared is decided in /lib (§7).
    for (const [cap, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, value).catch(this.error);
      }
    }
```

- [ ] **Step 2: Run the tests (regression guard)**

Run: `npm test`
Expected: PASS — all 17 tests still green (the pure suite is unaffected; this guards that `device.js` still loads/parses).

- [ ] **Step 3: Verify the diff is surgical**

Run: `git -C "C:\Users\TorstenSturm\source\repos\VioletApp" diff drivers/pool/device.js`
Expected: only the one guard line changed (`value === null || value === undefined` → `value === undefined`) and the two-line comment above it replaced. No other logic altered.

- [ ] **Step 4: Commit**

```bash
git add drivers/pool/device.js
git commit -m "feat(device): apply null as a clear in the poll loop (clear-stale §3)"
```

---

### Task 3: Validate, deploy, and verify live

**Files:** none (build/runtime validation + live check on Torstens Homey Pro).

**Interfaces:**
- Consumes: the committed changes from Tasks 1–2.
- Produces: a confirmed-on-hardware result (tiles "–" + Insights gap during a stale window), per clear-stale §6.

- [ ] **Step 1: Validate the app builds**

Run: `homey app validate` (in the repo root)
Expected: validation passes (level `debug`/`publish` as configured). If the Homey CLI is unavailable in the environment, note it and rely on `npm test` as the authoritative gate.

- [ ] **Step 2: Push the branch**

```bash
git push origin main
```
Expected: fast-forward push; `origin/main` now contains both commits.

- [ ] **Step 3: Deploy to the live Homey** *(Medium/High — replaces the running app; get the user's go-ahead first)*

Run: `homey app install`
Expected: the updated app installs onto Torstens Homey Pro (device `de.neunbft.violet:pool`, id `5cc4a46a-39b4-4072-9809-0949ca3634e4`).

- [ ] **Step 4: Confirm the GUI clears on stale**

When the pump is off / within warmup (`measurements_fresh = false`), check the device tiles in the Homey app.
Expected: `measure_ph`, `measure_orp` (and `measure_chlorine` if present) show **"–"**, not a stale number. `measure_temperature` and `pump_running` continue to show live values.

- [ ] **Step 5: Confirm the Insights gap**

After the next stale window, inspect Insights for `measure_ph` / `measure_orp` (Homey app graph, or CLI):

```bash
homey api insights get-log-entries \
  --uri "homey:device:5cc4a46a-39b4-4072-9809-0949ca3634e4" \
  --id  "homey:device:5cc4a46a-39b4-4072-9809-0949ca3634e4:measure_orp" \
  --resolution last24Hours --json
```
Expected: a `null`/gap entry at the fresh→stale transition (not a continued flat carry). This confirms clear-stale §2 F2 for our own capabilities. If, contrary to F2, the graph still carries: the GUI "–" benefit stands; decide whether to keep clear-on-stale and rely on the `measurements_fresh` timeline for analysis, or revert.

---

## Self-Review

**Spec coverage (clear-stale §):**
- §3 clear-on-stale → Task 1 (`else` branch) + Task 2 (loop applies `null`). ✓
- §4.1 Capabilities change → Task 1. ✓
- §4.2 device.js loop semantic → Task 2. ✓
- §4.3 test update → Task 1 Step 1. ✓
- §5 Option A (temperature "–" when no channel) → emerges from Task 2 (loop now writes the `null` that `choosePrimaryTemperature` already returns); covered by the existing `choosePrimaryTemperature returns null when auto with multiple channels` test + live Step 4. ✓
- §6 verification → Task 3. ✓
- §8 doc-comment sync → Task 1 (JSDoc) + Task 2 (loop comment). ✓
- §8 no dashboard update → Global Constraints. ✓

**Placeholder scan:** none — every code/command step is concrete.

**Type/name consistency:** `buildCapabilityUpdates` signature unchanged; the loop reads the same `updates` map; capability ids (`measure_ph`/`measure_orp`/`measure_chlorine`/`measure_temperature`) match the spec and the capability JSON. ✓
