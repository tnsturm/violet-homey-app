# Device Identity + Error Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stable `data.id` from the controller serial (`HW_SERIAL_CARRIER`) so the same Violet cannot be paired twice, plus localization (en+de) of every user-visible error string.

**Architecture:** A new pure helper `lib/deviceIdentity.js` derives the id from the already-fetched `getReadings` payload (returns `null` when absent — no throw, `/lib` stays Homey-free). `driver.js`/`device.js` localize at the Homey boundary via `this.homey.__(key, tokens)`; `/lib` throw texts stay English (diagnostic detail only). Existing paired devices keep their frozen random-UUID ids — new pairings only.

**Tech Stack:** Homey Apps SDK v3 (JS + checkJs strict), `node:test` + `node:assert`, locales in `locales/en.json` + `locales/de.json` (token syntax `__token__`).

**Spec:** `docs/superpowers/specs/2026-07-13-device-identity-design.md` (approved). File headers / decision comments cite it per the `documenting-code` skill.

## Global Constraints

- **JSON files are edited programmatically only** (`node` + `JSON.parse`/`JSON.stringify`, HOMEY.md JSON-authoring rule; `json-guard` hook enforces) — never hand-type delimiters.
- **Every locale key exists in BOTH `locales/en.json` and `locales/de.json`**, non-empty, identical `__token__` sets.
- **`/lib` stays pure**: no `homey` require, no `this.homey` — localization only in `drivers/`.
- **All gates green after every task:** `npm test` (node --test), `npm run typecheck` (tsc checkJs strict), and for driver/device changes also `npx homey app validate`.
- **`data.id` of existing devices is never touched** (immutable post-pair; spec §Migration).
- Commit after every task; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `lib/deviceIdentity.js` (pure id derivation, TDD)

**Files:**
- Create: `lib/deviceIdentity.js`
- Test: `test/DeviceIdentity.test.js`

**Interfaces:**
- Consumes: the raw `getReadings?ALL` object shape (`RawReadings` typedef from `lib/VioletClient.js`).
- Produces: `deriveDeviceId(raw) → ?string` — trimmed serial string, or `null` when `HW_SERIAL_CARRIER` is absent/blank. Task 3 imports exactly `const { deriveDeviceId } = require('../../lib/deviceIdentity');`.

- [ ] **Step 1: Write the failing test**

Create `test/DeviceIdentity.test.js`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { deriveDeviceId } = require('../lib/deviceIdentity');

test('deriveDeviceId returns the serial string', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '4' }), '4');
});

test('deriveDeviceId trims whitespace', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '  4 ' }), '4');
});

test('deriveDeviceId coerces numeric serials to string', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: 4 }), '4');
});

test('deriveDeviceId returns null when the key is missing', () => {
  assert.strictEqual(deriveDeviceId({}), null);
});

test('deriveDeviceId returns null for empty or blank serials', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '' }), null);
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '   ' }), null);
});

test('deriveDeviceId reads the serial from the full live fixture', () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/getReadings.all.json'), 'utf8'),
  );
  assert.strictEqual(deriveDeviceId(raw), String(raw.HW_SERIAL_CARRIER).trim());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/DeviceIdentity.test.js`
Expected: FAIL — `Cannot find module '../lib/deviceIdentity'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/deviceIdentity.js`:

```js
'use strict';

// Device identity helper — device-identity spec §Decision, §Component design
// (docs/superpowers/specs/2026-07-13-device-identity-design.md).
// Derives the immutable Homey data.id from the controller's serial number
// (HW_SERIAL_CARRIER — manufacturer-confirmed unique per unit, present in
// getReadings?ALL). Pure and Homey-free: returns null instead of throwing so
// the driver owns the localized fail-closed error (spec §Pairing-error).

/**
 * Derive the stable device id from a getReadings payload.
 * Same controller → same serial → same data.id, so Homey itself blocks
 * pairing the same unit twice (spec §Decision).
 * @param {import('./VioletClient').RawReadings} raw Parsed getReadings?ALL payload.
 * @returns {?string} Trimmed serial string, or null when absent/blank (driver fails closed).
 */
function deriveDeviceId(raw) {
  const serial = String(raw.HW_SERIAL_CARRIER ?? '').trim();
  return serial || null;
}

module.exports = { deriveDeviceId };
```

(Note the `?? ''`: a bare `String(undefined)` would yield the literal string `"undefined"`.)

- [ ] **Step 4: Run tests + typecheck to verify green**

Run: `npm test -- test/DeviceIdentity.test.js` → Expected: 6 pass.
Run: `npm run typecheck` → Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/deviceIdentity.js test/DeviceIdentity.test.js
git commit -m "feat(identity): pure deriveDeviceId from HW_SERIAL_CARRIER

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Locale keys en+de + consistency test (TDD)

**Files:**
- Modify: `locales/en.json`, `locales/de.json` (programmatically!)
- Test: `test/Locales.test.js`

**Interfaces:**
- Produces: the 9 dotted keys below, consumed by Tasks 3–4 via `this.homey.__('<key>')`. Token syntax in JSON values is `__label__` / `__detail__` (Homey i18n replacers).

- [ ] **Step 1: Write the failing test**

Create `test/Locales.test.js`:

```js
'use strict';

// Locale-consistency guard — device-identity spec §Testing, §User-visible
// error localization (docs/superpowers/specs/2026-07-13-device-identity-design.md).
// Every user-visible error key must exist in BOTH languages, non-empty, with
// identical __token__ placeholder sets. fs+JSON.parse (not require) so the
// checkJs typecheck needs no resolveJsonModule.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/en.json'), 'utf8'));
const de = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/de.json'), 'utf8'));

const REQUIRED_KEYS = [
  'pair.error.host_required',
  'pair.error.no_serial',
  'error.write_creds_missing',
  'error.control_disabled',
  'error.controller_rejected',
  'error.write_auth',
  'error.write_failed',
  'error.invalid_value',
  'error.unreachable',
];

/** @param {*} obj @param {string} dotted @returns {*} */
function lookup(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** @param {string} s @returns {Array<string>} */
function tokensOf(s) {
  return (s.match(/__[a-z]+__/g) || []).sort();
}

for (const key of REQUIRED_KEYS) {
  test(`locale key ${key} present in en+de with matching tokens`, () => {
    const e = lookup(en, key);
    const d = lookup(de, key);
    assert.ok(typeof e === 'string' && e.trim().length > 0, `en missing/empty: ${key}`);
    assert.ok(typeof d === 'string' && d.trim().length > 0, `de missing/empty: ${key}`);
    assert.deepStrictEqual(tokensOf(d), tokensOf(e), `token mismatch for ${key}`);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/Locales.test.js`
Expected: FAIL — 9 failing tests (`en missing/empty: …`).

- [ ] **Step 3: Add the keys programmatically (json-guard rule — no hand-editing)**

Run with the Bash tool:

```bash
node -e '
const fs = require("fs");
const T = {
  en: {
    pairError: {
      host_required: "Host is required",
      no_serial: "This controller did not report a serial number (HW_SERIAL_CARRIER). Please update the controller firmware and try again.",
    },
    error: {
      write_creds_missing: "Write credentials are not set (device settings).",
      control_disabled: "Control is disabled — enable it in the device settings.",
      controller_rejected: "Controller rejected: __label__",
      write_auth: "Write access denied — check the write username/password in the device settings.",
      write_failed: "Write to the controller failed (__detail__).",
      invalid_value: "Invalid value: __detail__",
      unreachable: "Violet not reachable",
    },
  },
  de: {
    pairError: {
      host_required: "Host ist erforderlich",
      no_serial: "Der Regler hat keine Seriennummer gemeldet (HW_SERIAL_CARRIER). Bitte die Regler-Firmware aktualisieren und erneut versuchen.",
    },
    error: {
      write_creds_missing: "Schreib-Zugangsdaten sind nicht gesetzt (Geräteeinstellungen).",
      control_disabled: "Steuerung ist deaktiviert — in den Geräteeinstellungen aktivieren.",
      controller_rejected: "Regler hat abgelehnt: __label__",
      write_auth: "Schreibzugriff verweigert — Schreib-Benutzer/Passwort in den Geräteeinstellungen prüfen.",
      write_failed: "Schreiben zum Regler fehlgeschlagen (__detail__).",
      invalid_value: "Ungültiger Wert: __detail__",
      unreachable: "Violet nicht erreichbar",
    },
  },
};
for (const lang of ["en", "de"]) {
  const file = `locales/${lang}.json`;
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  j.pair = j.pair || {};
  j.pair.error = T[lang].pairError;
  j.error = T[lang].error;
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log("patched", file);
}
JSON.parse(fs.readFileSync("locales/en.json", "utf8"));
JSON.parse(fs.readFileSync("locales/de.json", "utf8"));
console.log("re-parse OK");
'
```

Expected output: `patched locales/en.json`, `patched locales/de.json`, `re-parse OK`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/Locales.test.js` → Expected: 9 pass.
Run: `npm run typecheck` → Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add locales/en.json locales/de.json test/Locales.test.js
git commit -m "feat(i18n): pairing + runtime error keys (en/de) with consistency test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: driver.js — serial-based `data.id` + localized pairing errors

**Files:**
- Modify: `drivers/pool/driver.js` (requires block, `connect` handler; file header)

**Interfaces:**
- Consumes: `deriveDeviceId` (Task 1), locale keys `pair.error.host_required` / `pair.error.no_serial` (Task 2).
- Produces: pairing behavior only — no exports.

- [ ] **Step 1: Update requires**

In `drivers/pool/driver.js`, replace

```js
const crypto = require('node:crypto');
```

with

```js
const { deriveDeviceId } = require('../../lib/deviceIdentity');
```

(`crypto` has no other use in this file — removing it is cleaning up our own orphan.)

- [ ] **Step 2: Rewrite the `connect` handler**

Replace the current handler body (the `cleanHost`/`fetchReadings`/`pairData` block) with:

```js
    session.setHandler('connect', async (/** @type {{host?: string, username?: string, password?: string}} */ { host, username, password }) => {
      const cleanHost = String(host || '').trim();
      if (!cleanHost) throw new Error(this.homey.__('pair.error.host_required'));
      // Pairing completes only on a valid live response: this throws on any
      // fetch/parse failure, surfacing a clear error to the pairing view (spec §6).
      const raw = await fetchReadings(cleanHost, { timeoutMs: 10000 });
      // data.id = controller serial (HW_SERIAL_CARRIER): stable per unit, so Homey
      // itself blocks adding the same controller twice. Fail-closed when missing —
      // never fall back to a random/weak id (device-identity spec §Decision,
      // §Missing/invalid serial). Existing devices keep their frozen UUIDs.
      const id = deriveDeviceId(raw);
      if (!id) throw new Error(this.homey.__('pair.error.no_serial'));
      pairData = {
        id,
        host: cleanHost,
        writeUsername: String(username || '').trim(),
        writePassword: String(password || ''),
      };
      return true;
    });
```

- [ ] **Step 3: Extend the file header**

Append one line to the header comment block at the top of `drivers/pool/driver.js` (after the existing spec reference lines):

```js
// Device identity + pairing-error i18n: spec 2026-07-13-device-identity-design.md.
```

- [ ] **Step 4: Run all gates**

Run: `npm test` → Expected: all pass (incl. Tasks 1–2 suites).
Run: `npm run typecheck` → Expected: exit 0.
Run: `npx homey app validate` → Expected: validates OK.

- [ ] **Step 5: Commit**

```bash
git add drivers/pool/driver.js
git commit -m "feat(pairing): stable data.id from controller serial, localized errors

Same controller now maps to the same data.id (HW_SERIAL_CARRIER), so Homey
blocks duplicate adds. Fail-closed with a localized message when the serial
is missing. New pairings only; existing devices keep their frozen UUIDs.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: device.js — localized runtime errors at the Homey boundary

**Files:**
- Modify: `drivers/pool/device.js` (`_writeCreds`, `_control`, `_tick` setUnavailable; file header)

**Interfaces:**
- Consumes: locale keys `error.*` (Task 2). `/lib` (`WriteClient.js`, `VioletClient.js`) is **not** modified.
- Produces: runtime behavior only — no exports.

- [ ] **Step 1: Localize `_writeCreds`**

Replace in `drivers/pool/device.js`:

```js
    if (!password) throw new Error('Write credentials are not set (device settings).');
```

with:

```js
    if (!password) throw new Error(this.homey.__('error.write_creds_missing'));
```

- [ ] **Step 2: Localize + boundary-wrap `_control`**

Replace the whole `_control` method body with:

```js
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
```

Keep the existing comment block above the method (`// Gate every write on the interlock (SR-07)…`) and the `@param` JSDoc unchanged.

- [ ] **Step 3: Localize `setUnavailable` in `_tick`**

Replace:

```js
      if (this._failures >= 3) await this.setUnavailable('Violet not reachable').catch(this.error);
```

with:

```js
      if (this._failures >= 3) await this.setUnavailable(this.homey.__('error.unreachable')).catch(this.error);
```

- [ ] **Step 4: Extend the file header**

Append one line to the header comment block at the top of `drivers/pool/device.js`:

```js
// Runtime-error i18n (boundary wrapping): spec 2026-07-13-device-identity-design.md.
```

- [ ] **Step 5: Run all gates**

Run: `npm test` → Expected: all pass.
Run: `npm run typecheck` → Expected: exit 0 (note the `err instanceof Error` narrowing — checkJs strict treats catch vars as unknown).
Run: `npx homey app validate` → Expected: validates OK.

- [ ] **Step 6: Commit**

```bash
git add drivers/pool/device.js
git commit -m "feat(i18n): localize all user-visible runtime errors at Homey boundary

write-creds/control-disabled/controller-rejected/unavailable messages now
resolve via homey.__ (en/de). WriteClient failures are wrapped: 401/403 to
an actionable write_auth message, RangeError to invalid_value, the rest to
write_failed with the English diagnostic as __detail__. /lib stays pure.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Final verification sweep

**Files:** none created — verification only.

- [ ] **Step 1: Full gates**

Run: `npm test` → all pass. `npm run typecheck` → exit 0. `npx homey app validate` → OK.

- [ ] **Step 2: No leftover hardcoded user-visible strings**

Run: `grep -n "randomUUID\|Host is required\|not set (device settings)\|Control is disabled\|Controller rejected\|Violet not reachable" drivers/pool/*.js`
Expected: **no matches** (all replaced; `/lib` intentionally untouched).

Run: `grep -rn "require('node:crypto')" drivers/`
Expected: no matches.

- [ ] **Step 3: Wrap-up per CLAUDE.md §9**

Work complete on `main` → run `/code-review` on the diff vs. the pre-task state, then ask the user how to proceed (this change is a release candidate for a future `0.X.Y` bump via the `homey-release` skill — bump/changelog happen only when actually installing/publishing, not in this plan).

---

## Self-Review (done at authoring time)

- **Spec coverage:** id derivation (§Decision → T1/T3), fail-closed (§Missing serial → T3), pairing i18n (§Pairing-error → T2/T3), full runtime catalogue incl. write_auth/write_failed/invalid_value/unreachable (§User-visible table → T2/T4), migration = do nothing (§Migration → no task, by design), tests incl. fixture regression + locale consistency (§Testing → T1/T2). No gaps.
- **Placeholder scan:** none — every step carries the actual code/commands.
- **Type consistency:** `deriveDeviceId(raw) → ?string` used identically in T1 (`null` cases) and T3 (`if (!id)`); locale keys in T2's script match T3/T4 call-sites and the test's `REQUIRED_KEYS` 1:1.
