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
