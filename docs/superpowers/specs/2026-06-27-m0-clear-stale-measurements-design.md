# Violet Homey App — Clear Fresh-Gated Measurements on Stale (Design Spec)

- **Date:** 2026-06-27
- **Status:** Approved design (pending written-spec review)
- **Project:** Homey Pro app for the PoolDigital "Violet" pool controller
- **This spec covers:** A focused behavioural fix to the M0 freshness handling (§7 of the
  M0 foundation spec). Not a new milestone.
- **Governing spec:** `docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md`
  (referenced below as **M0 §N**).

---

## 1. Problem

M0 fresh-gates the chemistry probes: `measure_ph`, `measure_orp`, `measure_chlorine` update
**only while `measurements_fresh === true`** (M0 §7). When freshness drops (pump off / within
warmup), the app simply **stops writing** those capabilities, so they **retain their last fresh
value** ("freeze").

The freeze is correct for the device tile in isolation, but it pollutes **Homey Insights**: with
no new data points, Homey **carries the last value forward**, drawing a continuous flat line across
the entire stale window. For analysis ("Auswertung") this is misleading — the statistics imply a
stable chemistry reading when in fact the water was not circulating and nothing was measured.

**Goal:** on transition to stale, make the fresh-gated probes read **empty** so that
(a) the Homey GUI shows "–", and (b) Insights records a **gap** rather than a held flat line.

## 2. Empirical findings (live, 2026-06-27)

Verified against the live M0 install on **Torstens Homey Pro**, device
`de.neunbft.violet:pool` (`5cc4a46a-39b4-4072-9809-0949ca3634e4`), via the Homey CLI. Doc/forum
research was inconclusive; the live data is authoritative.

| # | Finding | Evidence |
|---|---|---|
| F1 | **Stopping writes → flat carry-forward (the bug).** | A real ~15 h overnight stale window (`measurements_fresh=False` 26.06 16:00 → `True` 27.06 07:03) shows `measure_ph` Insights as **180 contiguous 5-min buckets at ~7.46, zero gaps**. Carry-forward also holds at 5-second resolution (720/720 buckets). |
| F2 | **Homey Insights *does* store `null` as a real gap.** | Scan of 60 number-type logs found 2 with null entries: a "Temperature" sensor with **4 nulls interleaved among 168 values** (the exact pattern we want), and a "House load" log with a long all-null run (2016/2016). |
| F3 | **Apps *can* set a number capability to `null`** (no throw). | The "Temperature" log's null entries were written by its owning app — proving `setCapabilityValue(numberCap, null)` is accepted. |
| F4 | **`measure_*` are read-only; only the owning app can write them.** | CLI `set-capability-value measure_orp` returns `"Capability Not Setable"` (`setable: false`). External tools cannot reproduce or test this; the change must live in the app. |

**Reconciliation:** "stop writing" and "write `null`" are *different* code paths. The former triggers
carry-forward (F1); the latter logs a discrete null entry → a true graph gap (F2). Writing `null`
therefore achieves both goals; high confidence on Insights gap (F2) and no-throw (F3), high
confidence on GUI "–" (standard Homey rendering of a null sensor value — to be confirmed on-device).

## 3. Design — "clear-on-stale"

When `fresh === false`, the per-poll update plan **explicitly writes `null`** to the fresh-gated
probes (`measure_ph`, `measure_orp`, `measure_chlorine`) instead of omitting them. When `fresh`
returns true, real values resume (unchanged behaviour).

Capabilities that already update every poll are **unaffected**: `measure_temperature` (+ `.owN`
sub-sensors), `pump_running`, `measurements_fresh`. Temperature is meaningful regardless of
circulation (M0 §7) and must not be cleared by staleness.

### Update-semantics (the key refinement)

The per-poll apply loop gains a precise distinction:

- **`undefined`** = "no opinion this poll" → **skip** (capability keeps its current value).
- **`null`** = "clear to empty" → **write** `null` → tile "–" + Insights gap.

This replaces today's blanket "skip null **and** undefined", which made an intentional clear
impossible.

### Idempotency

Writing `null` on *every* stale poll is intentional and safe: Homey logs Insights entries only on
**change**, so a multi-hour stale window yields a single null entry at the transition, then the gap
holds. No explicit transition-tracking is needed, and the behaviour is correct after an app restart
while already stale (first stale poll clears the probes).

## 4. Code changes

Two surgical edits plus a test update. (Implementation must follow the `documenting-code` skill:
add/keep a `// why + §-ref` decision comment where the new gating lives.)

### 4.1 `lib/Capabilities.js` — `buildCapabilityUpdates` (M0 §5, §7)

Add an `else` branch to the freshness block so stale yields explicit nulls:

```js
if (fresh) {
  updates.measure_ph = parsed.ph;
  updates.measure_orp = parsed.orp;
  if (parsed.chlorine !== null) updates.measure_chlorine = parsed.chlorine;
} else {
  // Stale: clear probes to empty so the GUI shows "–" and Insights gaps
  // instead of carrying the last fresh value forward (this spec §3; M0 §7).
  updates.measure_ph = null;
  updates.measure_orp = null;
  updates.measure_chlorine = null;
}
```

The existing "fresh **but** chlorine has no reading → omit `measure_chlorine`" rule is preserved
(that stays `undefined` → skip, distinct from the stale `null` → clear).

### 4.2 `drivers/pool/device.js` — apply loop (M0 §7)

Change the guard so `null` is applied while `undefined` is still skipped:

```js
for (const [cap, value] of Object.entries(updates)) {
  if (value === undefined) continue;        // undefined = no update this poll
  if (this.hasCapability(cap)) {
    await this.setCapabilityValue(cap, value).catch(this.error); // null clears to "–"
  }
}
```

`hasCapability` still guards absent capabilities (e.g. `measure_chlorine` on pools without it), so a
stale `null` for a non-existent capability is never written.

### 4.3 Tests — `test/Capabilities.test.js`

Update the stale-case assertions (currently asserting the keys are **absent**) to assert they are
**present and `null`**:

```js
assert.strictEqual(stale.measure_ph, null);
assert.strictEqual(stale.measure_orp, null);
assert.strictEqual(stale.measure_chlorine, null);
```

Keep unchanged: the fresh-case assertions, and the "fresh but `chlorine === null` → `measure_chlorine`
omitted" test (that path stays `undefined`). `device.js` is runtime glue and is verified live (§6),
not unit-tested.

## 5. Decided edge case — Option A (approved)

The new "`null` = clear" semantic also reaches `measure_temperature` when **no water-temp channel is
selected** (`primaryChannel === null`, i.e. "auto" with ≠1 OK channel). **Option A (approved):** let
it clear to "–", consistent with M0 §8 ("primary `measure_temperature` shows no value until chosen")
and simpler than special-casing. This is a minor, spec-aligned consequence beyond the literal
chemistry-on-stale request. Once a channel is chosen (or exactly one OK channel auto-selects), it
shows a real value as before.

## 6. Verification plan

1. **Unit:** `npm test` green with the updated `Capabilities.test.js` (asserts stale ⇒ `null`).
2. **Validate:** `homey app validate` passes.
3. **Live (closes the loop on F2 for our own capabilities):** deploy to Torstens Homey Pro, wait for
   the next pump-off stale window, and confirm on-device:
   - `measure_ph` / `measure_orp` (and `measure_chlorine` if present) tiles show **"–"**;
   - their Insights graphs show a **gap** over the stale window (not a flat carry).
   If, contrary to F2, the live graph still carries: the GUI "–" benefit remains; decide then whether
   to keep clear-on-stale and rely on the `measurements_fresh` timeline for analysis, or revert.

## 7. Scope & non-goals

- **In scope:** clearing `measure_ph` / `measure_orp` / `measure_chlorine` on stale; the
  `undefined`/`null` apply-loop semantic; the temperature edge (Option A); the test update.
- **Out of scope:** the freshness *decision* itself (unchanged); any other capability; i18n; new
  settings; M1 chemistry/LSI work.

## 8. Interactions

- **M1 `PUMP_LAST_ON` freshness refactor** (`notes/2026-06-26-m1-inputs.md §1`): orthogonal. That
  changes *how `fresh` is decided*; this changes *what is written given `fresh`*. The clear-on-stale
  logic sits downstream of `fresh` and does not conflict.
- **Code-documentation convention** (spec `…/specs/2026-06-27-code-documentation-convention-design.md`;
  plan `…/plans/2026-06-27-code-documentation-convention.md`): **already committed and executed**
  (`9c7ef17`, `e28d378`, `9364eae`, `d951bbf`, `155554d`). `lib/Capabilities.js` and
  `drivers/pool/device.js` therefore already carry documented headers + JSDoc. Consequence for this
  fix: it builds *on top of* the documented files, and per the `documenting-code` skill it must also
  **update the now-stale retrofit comments** that still describe the old behaviour — specifically the
  `buildCapabilityUpdates` JSDoc note "(skip null/undefined when applying)" and the `device.js`
  apply-loop comment "Skip null/undefined…" — so they match the new `undefined`=skip / `null`=clear
  semantic. (Earlier confusion: the conversation-start worktree was mid-OneDrive-sync and showed
  pre-retrofit copies; ground truth at `7fb8dc5` is post-retrofit.)
- **Dashboard:** this is **not** an Mx milestone; following the doc-convention plan's precedent,
  `docs/dashboard/dashboard.html` is **not** updated.

## 9. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Clear mechanism | Write `null` to fresh-gated probes on stale | F2/F3: `null` logs a real Insights gap and the GUI shows "–"; matches the goal |
| Apply-loop semantic | `undefined` = skip, `null` = clear | Enables an intentional clear while still protecting "no fresh value yet" |
| Write cadence | `null` every stale poll (idempotent) | Homey logs on change → one gap entry per stale window; survives restarts; no transition state |
| Temperature with no channel | Option A — clear to "–" | Spec-aligned (M0 §8), simpler code |
| Where the change lives | `lib/Capabilities.js` + `device.js` | F4: `measure_*` are read-only; only the owning app can write them |
| Dashboard update | None | Not an Mx milestone (doc-convention precedent) |
