# Device Identity: stable `data.id` from the controller serial

**Date:** 2026-07-13
**Status:** Approved (brainstorming) — ready for plan
**Amends:** M0 foundation design (`2026-06-24-…-m0-foundation-design.md`) §6 (pairing).
Supersedes the random-UUID `data.id` decision recorded there.

## Problem

`drivers/pool/driver.js` currently mints the device id with `crypto.randomUUID()` at
pair time. Homey keys duplicate-prevention off `data.id`: a `list_devices` entry whose
`data.id` already belongs to a paired device is blocked as "already added". A random
UUID defeats this — the **same physical controller** pairs to a **new** id every time,
so a user can add one controller twice (two Homey devices fighting over the same host),
and a remove-then-re-add produces an unrelated device.

Homey's pairing docs recommend anchoring `data.id` to a hardware-stable value (e.g. MAC).

## Decision

Derive `data.id` from **`HW_SERIAL_CARRIER`**, the Violet controller's serial number.

- **Authoritative source:** confirmed by the manufacturer — `HW_SERIAL_CARRIER` (present
  in `getReadings?ALL`, undocumented in the public field spreadsheet) is the controller
  serial. It is hardware-stable and unique per unit.
- **No extra request.** The `connect` handler already calls `fetchReadings(cleanHost)`
  to validate the host and currently discards the response. We capture that response and
  read `HW_SERIAL_CARRIER` from it. Zero added network cost, no new endpoint, no new
  credential handling.
- **Duplicate-prevention comes for free.** Same controller → same serial → same
  `data.id` → Homey blocks the second add itself. No custom logic needed.

### ID format

`data.id = String(HW_SERIAL_CARRIER).trim()` — the bare serial string.

Uniqueness only needs to hold **within the `pool` driver's id space**, which the serial
already satisfies, so no namespacing prefix is added (CLAUDE.md §2 Simplicity). Existing
random-UUID ids (36-char) and serial ids never collide.

### Missing / invalid serial → fail-closed (Option A)

If `HW_SERIAL_CARRIER` is absent or empty after trimming, **abort pairing** with a clear,
actionable, **localized** error rather than falling back to a weaker id:

> en: "This controller did not report a serial number (HW_SERIAL_CARRIER). Please update
> the controller firmware and try again."
> de: "Der Regler hat keine Seriennummer gemeldet (HW_SERIAL_CARRIER). Bitte die
> Regler-Firmware aktualisieren und erneut versuchen."

Rationale: the manufacturer says the field is always present; a missing value signals a
real problem worth surfacing, not something to paper over with a host-hash or a random
UUID (which would re-introduce the very bug we are fixing). Validity rule: **non-empty
after `String(...).trim()`**. (`"0"` is treated the same as any other non-empty serial;
we do not invent extra placeholder rules the manufacturer has not confirmed.)

### User-visible error localization (pulled into scope — ALL of them)

The i18n plumbing already exists end-to-end: `locales/en.json` + `locales/de.json` carry
`pair.connect.*` keys, and `pair/connect.html` resolves view-side strings via its
`t(key, fallback)` helper over `Homey.__`. Server-side throws travel to the UI as
`err.message` (pairing view, capability-tile toasts, Flow error logs), so they are
localized **at the Homey boundary** (driver.js / device.js) via `this.homey.__(key,
tokens)` — token syntax `__token__` in the JSON (verified against the i18n docs).

**Layering rule:** `/lib` stays pure and English (diagnostic messages, no Homey handle).
`device.js`/`driver.js` catch at the boundary and rethrow localized, logging the original
error for diagnostics (never credentials, SR-02/09).

Full catalogue of user-visible strings (audited 2026-07-13 — every `throw`/
`setUnavailable`/`setWarning` in `drivers/` + `lib/`):

| Site | Current string | Key (en + de) |
|---|---|---|
| driver.js `connect` | `'Host is required'` | `pair.error.host_required` |
| driver.js `connect` (new) | fail-closed serial message | `pair.error.no_serial` |
| device.js `_writeCreds` | `'Write credentials are not set (device settings).'` | `error.write_creds_missing` |
| device.js `_control` gate | `'Control is disabled — enable it in the device settings.'` | `error.control_disabled` |
| device.js `_control` non-OK | `` `Controller rejected: ${label}` `` | `error.controller_rejected` (`__label__`) |
| device.js `_control` wrap (new) | WriteClient HTTP 401/403 (wrong write password — the likely user error) | `error.write_auth` |
| device.js `_control` wrap (new) | other WriteClient/network failures | `error.write_failed` (`__detail__`) |
| device.js `_control` wrap (new) | `RangeError` from `buildWriteUrl` (reachable via bad Flow input, e.g. negative duration) | `error.invalid_value` (`__detail__`) |
| device.js `_tick` | `setUnavailable('Violet not reachable')` | `error.unreachable` |

Deliberate boundary (documented, not localized): raw technical *detail* fragments
inside `__detail__` (e.g. `HTTP 404`, lib range text) stay English — they are diagnostic
codes, and the surrounding sentence is localized. `/lib` throw texts are unchanged.

## Migration / backward compatibility

- The app is already certified/submitted at **v0.4.5**; devices paired on ≤0.4.5 carry a
  random UUID **frozen** in `data.id`. `data.id` is immutable post-pair — changing it
  would orphan the device's Flows/Insights. **We do not touch existing devices.**
- The serial scheme applies to **new pairings only**. Bestandsgeräte run unchanged.
- Known residual edge (accepted, documented, no action): a user who already paired a
  controller on ≤0.4.5 (random UUID) and then pairs it again on the new version gets a
  second device — Homey cannot recognise the old UUID device as "the same" controller.
  This only affects pre-existing installs re-pairing; fresh installs are fully protected.

## Component design

Add one pure, testable helper rather than inlining logic in the driver:

**`lib/deviceIdentity.js`** — single export:

```
deriveDeviceId(raw: RawReadings): ?string
```

- Reads `raw.HW_SERIAL_CARRIER`, coerces with `String(...).trim()`.
- Returns the serial string when non-empty, **`null`** when absent/empty.
- Stays **pure** (no Homey handle in `/lib`); the localized fail-closed throw lives in
  the driver, which is the layer that owns `this.homey.__`.

`drivers/pool/driver.js` `connect` handler changes:

```
const cleanHost = String(host || '').trim();
if (!cleanHost) throw new Error(this.homey.__('pair.error.host_required'));
const raw = await fetchReadings(cleanHost, { timeoutMs: 10000 }); // was: discarded
const id = deriveDeviceId(raw);
if (!id) throw new Error(this.homey.__('pair.error.no_serial')); // fail-closed
pairData = {
  id,                        // was: crypto.randomUUID()
  host: cleanHost,
  writeUsername: …,
  writePassword: …,
};
```

Remove the now-unused `crypto` require (CLAUDE.md §3 — clean up only our own orphan).
`list_devices` is unchanged: it already returns `data: { id: pairData.id }`.

## Error handling

- Empty/absent serial → `deriveDeviceId` returns `null` → driver throws the localized
  `pair.error.no_serial` message → the `connect` handler's promise rejects → the pairing
  view shows it (same path as today's host-validation failure).
- `fetchReadings` failure (host unreachable / bad JSON) already throws before we reach the
  serial step — unchanged behaviour.

## Security

No new attack surface: the serial is read from the **already-fetched, credential-free**
`getReadings` response — no new endpoint, no write path, no credential handling. A
hostile host could report a colliding serial to block an add, but the user chose that
host for their own controller; not a meaningful threat. No threat-model update required
(pure read, CLAUDE.md §5).

## Testing (TDD)

Unit tests for `lib/deviceIdentity.js` (pure, no I/O — fits the existing `lib` test
pattern):

1. `HW_SERIAL_CARRIER: "4"` → returns `"4"`.
2. `HW_SERIAL_CARRIER: "  4 "` → returns `"4"` (trimmed).
3. numeric `HW_SERIAL_CARRIER: 4` → returns `"4"` (coerced).
4. missing key → returns `null`.
5. `HW_SERIAL_CARRIER: ""` / `"   "` → returns `null`.
6. Regression against the full fixture `test/fixtures/getReadings.all.json` → returns its
   `HW_SERIAL_CARRIER` value.

Plus a locale-consistency test: every key in the catalogue above (`pair.error.*` and
`error.*`) exists in `locales/en.json` **and** `locales/de.json`, non-empty, and both
languages reference the same `__token__` placeholders. (`device.js` boundary wrapping has
no unit harness — existing tests cover `/lib` only; it is exercised by the live smoke.)

Homey's own duplicate-block on matching `data.id` is platform behaviour, not unit-testable
here; covered by manual/live-smoke pairing check.

## Out of scope

- Retro-fixing already-paired (random-UUID) devices — impossible without orphaning them.
- Localizing `/lib`-internal diagnostic strings (kept pure English; wrapped at boundary).
- Any other undocumented `getReadings` fields the manufacturer mentioned.
