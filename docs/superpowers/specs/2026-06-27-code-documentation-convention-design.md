# Code Documentation & Spec-Linking Convention (Design Spec)

- **Date:** 2026-06-27
- **Status:** Approved design (pending written-spec review)
- **Project:** Homey Pro app for the PoolDigital "Violet" pool controller
- **This spec covers:** a cross-cutting *documentation convention* for the codebase plus a
  custom Superpowers skill that enforces it. It is **not** a feature milestone (M0–M5); it changes
  *how* code is written, not *what* the app does.

---

## 1. Context & problem

The M0 code is clean and minimal but carries almost no explanatory documentation: the `/lib`
modules have no file headers, and there are no references from code back to the rich design
documents under `docs/superpowers/` (spec sections, dated notes, plans). A future maintainer (or a
later milestone session in a fresh git-worktree) reads `lib/Freshness.js` with no pointer to *why*
the freshness gate exists (spec §7) or that M1 will replace its in-memory tracking with
`PUMP_LAST_ON` (`notes/2026-06-26-m1-inputs.md` §1).

**Superpowers has no skill that auto-documents code.** What it provides is the machinery to make
"documented, spec-linked code" a durable convention. The *reference* half is nearly free because
Superpowers specs are already §-numbered and notes are dated, so code can cite them directly
instead of duplicating rationale that would later drift.

**Goal:** every source file links to the design decision that governs it, and explains its
non-obvious choices in place — **calibrated** so it does not fight the project's own CLAUDE.md
rules (*Simplicity First*, *Surgical Changes*, "code reads like the surrounding code", "comments
explain *why*, not *what*").

---

## 2. The convention (Hybrid format)

Three building blocks, deliberately scaled so the glue layer stays light and only true module
interfaces carry formal docs.

### 2.1 File header — every `.js` source file

A short block of `//` lines (2–5 lines, **not** JSDoc) at the top of the file (after `'use strict';`):

- one-line purpose; pure modules say "(pure)";
- the governing spec section, given **once with its full path** (e.g.
  `docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md §7`);
- an optional forward-looking note when a later milestone changes the file.

### 2.2 Decision-point comments — only where a choice is non-obvious

Short `// why + §-ref` comments at genuine decision points. **Not** on trivial helpers
(`num()`, `buildReadingsUrl()`). In `device.js` the qualifying points are:

- pump rising-edge / warmup tracking (§7);
- the freshness gate and the fresh-only writes of `measure_ph` / `measure_orp` / `measure_chlorine` (§7);
- chlorine capability add/remove via auto-detect + override (§9);
- temperature sub-sensor lifecycle per OK channel (§8);
- 3-consecutive-failures → `setUnavailable` (§10).

### 2.3 JSDoc — only on pure public `/lib` exports

`@param`/`@returns` with the spec reference in the description line, on exactly these 9 exported
functions:

| File | Exports getting JSDoc |
|---|---|
| `lib/VioletClient.js` | `buildReadingsUrl`, `parseReadings`, `fetchReadings` |
| `lib/FeatureDetector.js` | `detectFeatures` |
| `lib/Freshness.js` | `isFresh` |
| `lib/Capabilities.js` | `channelSubCapId`, `choosePrimaryTemperature`, `desiredFeatureCapabilities`, `buildCapabilityUpdates` |

**No JSDoc** on: `device.js` class methods (internal glue), internal helpers (`num`), or the
`FEATURE_CAPABILITY` constant. Those get a file header and — where non-obvious — a one-line `//`
comment only.

### 2.4 Capability JSON — exempt from inline comments

`.homeycompose/capabilities/*.json` cannot carry comments, and an injected `_comment` key risks
`homey app validate`. These stay documented via spec §5/§12, **plus** a short
`.homeycompose/capabilities/README.md`: one line per capability pointing at the governing spec
section (e.g. `measure_ph → §5`, Insights requirement → §5.1).

---

## 3. Reference grammar (the cross-link scheme)

- File header: the **full** spec path once (see 2.1).
- Inline thereafter: `spec §N`; notes as `notes/<YYYY-MM-DD>-<topic>.md §N`; plans as
  `plan task N` when relevant.
- Rationale lives in the referenced document, **not** duplicated in code (avoids drift). The
  comment states the minimum *why* and points to the §-ref for the full reasoning.

### Worked example — `lib/Freshness.js`

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

---

## 4. The custom Superpowers skill

- **Name:** `documenting-code` (gerund convention, like `writing-plans`).
- **Trigger** (frontmatter `description`): "Use when writing or modifying any source file in this
  project — add a file header citing the governing spec §, decision-point comments with §-refs, and
  JSDoc on pure /lib module exports."
- **Body:** the §2 rules, the §3 reference grammar, the calibration note (respect CLAUDE.md
  Simplicity — *why* not *what*, no JSDoc on glue, no comments on trivial helpers, JSON exempt),
  and a good/bad example (the §3 Freshness before/after).
- **Placement (user's "both" choice):** authored **now** as project-local
  `.claude/skills/documenting-code/SKILL.md` and committed, so it travels with the repo and every
  fresh git-worktree ("Start Mx" chips). Promotion of a copy to `~/.claude/skills/` is a **deferred
  follow-up**, only once it has proven itself — not part of this work, to avoid two drifting copies.
- **Authoring method:** via the `writing-skills` skill (correct SKILL.md format/frontmatter).

---

## 5. M0 retrofit (additive comments only — zero logic change)

Apply the §2 convention to the existing M0 surface. **No executable line changes**; the
M1 `PUMP_LAST_ON` refactor is only *referenced*, never implemented here.

| File | What is added |
|---|---|
| `lib/VioletClient.js` | header + JSDoc on `buildReadingsUrl`, `parseReadings`, `fetchReadings`; one-line `//` on `num` |
| `lib/FeatureDetector.js` | header + JSDoc on `detectFeatures` |
| `lib/Freshness.js` | header (incl. M1 forward-note) + JSDoc on `isFresh` |
| `lib/Capabilities.js` | header + JSDoc on the 4 exported functions |
| `drivers/pool/device.js` | header + decision-point comments (§2.2 list); **no** JSDoc |
| `app.js` | one-line header |
| `.homeycompose/capabilities/README.md` | **new** — one line per capability → spec § (§2.4) |

---

## 6. Verification

- `npm test` stays green — proves only comments changed (no executable code touched).
- `homey app validate` stays green — the new README is not schema-validated; no JSON was edited.
- `git diff` review: every changed line is a comment / JSDoc / the new README.
- No new lint or doc-generation tooling (YAGNI).

---

## 7. Sequence (after spec approval)

1. `writing-plans` → implementation plan.
2. Author `documenting-code` skill via `writing-skills`; commit.
3. M0 retrofit per §5.
4. Verify per §6; commit.

---

## 8. Out of scope

- The M1 `PUMP_LAST_ON` freshness refactor (that is M1 work; only referenced here).
- Promoting the skill to `~/.claude/skills/` (deferred follow-up).
- Any documentation-generation/site tooling, JSDoc linting, or CI checks.
- Editing capability JSON contents (only a sibling README is added).
- Dashboard updates — this is not an Mx milestone.

---

## 9. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Doc altitude | **Hybrid**: header + §-refs + decision comments everywhere; JSDoc only on pure `/lib` exports | documents interfaces, keeps glue light; best fit with CLAUDE.md Simplicity |
| Text vs reference | **Both**, with division of labour | thin inline *why* + §-ref to the doc for full rationale; no duplication/drift |
| Enforcement | **Custom Superpowers skill** (`documenting-code`) | methodology-native, reusable across projects |
| Skill placement | **Project-local + committed now**, global promotion deferred | worktree milestone sessions need it in-repo; avoid drifting copies |
| Existing code | **Retrofit M0 now** + skill carries M1+ | fixes the reported gap immediately; tiny surface; serves as the skill's reference example |
| Capability JSON | **Exempt inline; add folder README** | JSON can't hold comments / `_comment` risks validate |
