# M3 Write / Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated write/control of the Violet's safe actuator core (filter pump, light, DMX scenes, PV-surplus) via `setFunctionManually` + BasicAuth, exposed as interlock-gated settable Homey tiles and Flow action cards.

**Architecture:** A new pure module `lib/WriteClient.js` mirrors `lib/VioletClient.js`: a declarative `WRITE_TARGETS` registry is the single source of truth for the allowlist + safe ranges; `buildWriteUrl` validates/encodes (credential-free URL), `parseWriteResponse` reads the `OK/ERROR` body, `basicAuthHeader` builds the header, and a thin `sendWrite` does the one authenticated fetch (host-pinned, sanitized errors). `drivers/pool/device.js` adds interlock-gated dynamic control capabilities + capability listeners; `drivers/pool/driver.js` registers the Flow action run-listeners. Credentials live only in the device store (captured at pairing since M0) and are never placed in a URL or a log.

**Tech Stack:** Homey Apps SDK v3 (Homey Compose), Node ≥ (project runs Node 25 locally), `node:test` unit tests, `npx homey app validate --level=debug` dev gate.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-02-violet-homey-app-m3-write-control-design.md`. **Threat model:** `docs/superpowers/security/2026-06-30-m3-write-control-threat-model.md` (SR-01…SR-10).
- **SR-01** creds only in the `Authorization` header, **never** in the URL/query. **SR-02** creds never logged/persisted (no password / `Authorization` / base64 token to `log`/`error`/`console`). **SR-04** only allowlisted targets sent. **SR-05** all args clamped/rejected to safe ranges (out-of-range/NaN/unknown → reject, nothing sent). **SR-06** typed encoding, never string-concat of untrusted text. **SR-07** device `control_enabled` interlock (default **false**) gates every write. **SR-08** write host pinned to the paired host, redirects rejected. **SR-09** errors are sanitized (status + credential-free URL). **SR-10** executed writes logged with target+args, no creds.
- **Credentials:** `writeUsername` from settings, `writePassword` from the device **store** (`getStoreValue`). If the password is empty → reject (nothing sent).
- **Documentation convention** (`documenting-code` skill, auto-triggers on source edits): every `.js` gets the file header with a spec §-ref + decision-point comments; JSDoc **only** on the pure `lib/WriteClient.js` exports (glue in `device.js`/`driver.js` gets none). Capability/flow/settings JSON are exempt.
- **i18n:** all manifest (capability/flow/settings) UI strings bilingual **en + de**, matching existing cards. Runtime thrown-error strings stay concise English (full i18n is M5), matching the existing `setUnavailable('Violet not reachable')` style.
- **Dev gate:** `npx homey app validate --level=debug` must PASS after every manifest/wiring task. `.homeycompose` changes require `npx homey app build` to regenerate the root `app.json`; both `app.json` files must share the same version before any commit (enforced by the `check-version-sync` hook).
- **No auto-retry** of writes (physical actuation must not be silently repeated).
- **API grammar (manual §26.2–26.3):** `GET /setFunctionManually?{OUTPUT},{STATE},{VAL1},{VAL2}`; PUMP `ON/AUTO/OFF` + seconds(0=perm) + speed 0–3; LIGHT `ON/AUTO/OFF/COLOR`; DMX_SCENE1–12 `ON/AUTO/OFF`+`ALLON/ALLAUTO/ALLOFF`; PVSURPLUS `ON/OFF` + speed 1–3. Response `text/plain`, line 1 `OK`/`ERROR`.

---

### Task 1: `lib/WriteClient.js` — registry + `buildWriteUrl`

**Files:**
- Create: `lib/WriteClient.js`
- Test: `test/WriteClient.test.js`

**Interfaces:**
- Produces: `WRITE_TARGETS` (object); `buildWriteUrl(host, { target, scene?, state, args? }) → string` (throws `RangeError` on unknown target / invalid scene / invalid state / out-of-range/non-finite arg / arg after an omitted trailing arg). `args` is keyed by arg name (`duration`, `speed`). URL shape: `http://<host>/setFunctionManually?TOKEN,STATE[,V1[,V2]]`, no credentials.

- [ ] **Step 1: Write the failing test**

Create `test/WriteClient.test.js`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { WRITE_TARGETS, buildWriteUrl } = require('../lib/WriteClient');

const H = 'violet.local';
const U = (s) => `http://violet.local/setFunctionManually?${s}`;

test('registry exposes exactly the M3 core targets', () => {
  assert.deepStrictEqual(Object.keys(WRITE_TARGETS).sort(), ['DMX_SCENE', 'LIGHT', 'PUMP', 'PVSURPLUS']);
});

test('PUMP encodes mode + duration + speed', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 120, speed: 2 } }), U('PUMP,ON,120,2'));
  assert.strictEqual(buildWriteUrl(H, { target: 'PUMP', state: 'AUTO', args: { duration: 0 } }), U('PUMP,AUTO,0'));
});

test('PUMP omits trailing speed when not given (default = keep configured)', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 600 } }), U('PUMP,ON,600'));
});

test('PUMP rejects out-of-range duration and bad speed and unknown state (SR-05)', () => {
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 999999 } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: -1 } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: NaN } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 60, speed: 9 } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'BOOST', args: { duration: 60 } }), RangeError);
});

test('LIGHT pads 0,0 and allows COLOR', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'LIGHT', state: 'ON' }), U('LIGHT,ON,0,0'));
  assert.strictEqual(buildWriteUrl(H, { target: 'LIGHT', state: 'COLOR' }), U('LIGHT,COLOR,0,0'));
});

test('DMX_SCENE builds token from scene and supports ALL* states', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'DMX_SCENE', scene: 3, state: 'ON' }), U('DMX_SCENE3,ON,0,0'));
  assert.strictEqual(buildWriteUrl(H, { target: 'DMX_SCENE', scene: 1, state: 'ALLAUTO' }), U('DMX_SCENE1,ALLAUTO,0,0'));
  assert.throws(() => buildWriteUrl(H, { target: 'DMX_SCENE', scene: 13, state: 'ON' }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'DMX_SCENE', scene: 0, state: 'ON' }), RangeError);
});

test('PVSURPLUS is 2 or 3 fields; speed clamped to 1..3', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'PVSURPLUS', state: 'ON', args: { speed: 2 } }), U('PVSURPLUS,ON,2'));
  assert.strictEqual(buildWriteUrl(H, { target: 'PVSURPLUS', state: 'OFF' }), U('PVSURPLUS,OFF'));
  assert.throws(() => buildWriteUrl(H, { target: 'PVSURPLUS', state: 'ON', args: { speed: 0 } }), RangeError);
});

test('unknown target throws (SR-04)', () => {
  assert.throws(() => buildWriteUrl(H, { target: 'DOS_1_CL', state: 'ON' }), RangeError);
});

test('no credentials ever appear in the built URL (SR-01)', () => {
  const url = buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 60, speed: 1 } });
  assert.ok(!/Basic|:@|password|Authorization/i.test(url));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/WriteClient.test.js`
Expected: FAIL — `Cannot find module '../lib/WriteClient'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/WriteClient.js` (registry + encoder only; parser/sender added in later tasks):

```js
'use strict';

// Violet HTTP write client (pure builder/parser + one authenticated fetch) —
// M3 spec §4 (docs/superpowers/specs/2026-07-02-violet-homey-app-m3-write-control-design.md).
// Mirrors VioletClient's read path but adds BasicAuth. Credentials are NEVER put
// in the URL (SR-01) and NEVER logged (SR-02); every command is validated against
// WRITE_TARGETS before it can leave Homey (SR-04/05/06).

// SR-04/05/06: single source of truth for the write allowlist + safe ranges.
// argSpecs are positional; a trailing `optional` arg may be omitted (shorter URL).
const WRITE_TARGETS = {
  PUMP: {
    token: 'PUMP',
    states: ['AUTO', 'ON', 'OFF'],
    argSpecs: [
      { name: 'duration', kind: 'seconds', min: 0, max: 86400, default: 0 },
      { name: 'speed', kind: 'enum', set: [0, 1, 2, 3], optional: true },
    ],
  },
  LIGHT: {
    token: 'LIGHT',
    states: ['AUTO', 'ON', 'OFF', 'COLOR'],
    argSpecs: [ { kind: 'fixed', value: '0' }, { kind: 'fixed', value: '0' } ],
  },
  DMX_SCENE: {
    sceneRange: [1, 12],
    states: ['ON', 'AUTO', 'OFF', 'ALLON', 'ALLAUTO', 'ALLOFF'],
    argSpecs: [ { kind: 'fixed', value: '0' }, { kind: 'fixed', value: '0' } ],
  },
  PVSURPLUS: {
    token: 'PVSURPLUS',
    states: ['ON', 'OFF'],
    argSpecs: [ { name: 'speed', kind: 'enum', set: [1, 2, 3], optional: true } ],
  },
};

// Validate + encode one positional arg to its string form, or null to omit it.
function encodeArg(spec, value) {
  if (spec.kind === 'fixed') return spec.value;
  if (value === undefined || value === null) {
    if (spec.optional) return null;
    if (spec.default !== undefined) return String(spec.default);
    throw new RangeError(`Missing required arg ${spec.name}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RangeError(`Non-finite ${spec.name}: ${value}`);
  if (spec.kind === 'seconds') {
    if (n < spec.min || n > spec.max) throw new RangeError(`${spec.name} out of range [${spec.min},${spec.max}]: ${n}`);
    return String(Math.trunc(n));
  }
  if (spec.kind === 'enum') {
    if (!spec.set.includes(n)) throw new RangeError(`${spec.name} not in {${spec.set.join(',')}}: ${n}`);
    return String(n);
  }
  throw new RangeError(`Unknown arg kind ${spec.kind}`);
}

/**
 * Build the credential-free write URL for a validated command (spec §4; SR-01/04/05/06).
 * @param {string} host Hostname or IP of the paired Violet controller.
 * @param {{target:string, scene?:number, state:string, args?:object}} cmd Command;
 *   `args` keyed by arg name (`duration`, `speed`).
 * @returns {string} `http://<host>/setFunctionManually?TOKEN,STATE[,V1[,V2]]`.
 * @throws {RangeError} on unknown target, invalid scene/state, or out-of-range/non-finite arg.
 */
function buildWriteUrl(host, { target, scene, state, args = {} } = {}) {
  const spec = WRITE_TARGETS[target];
  if (!spec) throw new RangeError(`Unknown write target: ${target}`);
  let token;
  if (spec.sceneRange) {
    const n = Number(scene);
    if (!Number.isInteger(n) || n < spec.sceneRange[0] || n > spec.sceneRange[1]) {
      throw new RangeError(`Scene out of range: ${scene}`);
    }
    token = `DMX_SCENE${n}`;
  } else {
    token = spec.token;
  }
  if (!spec.states.includes(state)) throw new RangeError(`Invalid state ${state} for ${target}`);
  const parts = [token, state];
  let omitted = false;
  for (const argSpec of spec.argSpecs) {
    const encoded = encodeArg(argSpec, argSpec.name ? args[argSpec.name] : undefined);
    if (encoded === null) { omitted = true; continue; }
    if (omitted) throw new RangeError('Cannot provide an arg after an omitted trailing arg');
    parts.push(encoded);
  }
  return `http://${host}/setFunctionManually?${parts.join(',')}`;
}

module.exports = { WRITE_TARGETS, buildWriteUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/WriteClient.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/WriteClient.js test/WriteClient.test.js
git commit -m "feat(m3): WriteClient registry + buildWriteUrl (allowlist+clamp, SR-01/04/05/06)"
```

---

### Task 2: `parseWriteResponse` + `basicAuthHeader`

**Files:**
- Modify: `lib/WriteClient.js`
- Test: `test/WriteClient.test.js` (append)

**Interfaces:**
- Consumes: Task 1 module.
- Produces: `parseWriteResponse(text) → { ok:boolean, output:string|null, info:string[] }` (`ok` iff line 1 trimmed, upper-cased === `'OK'`); `basicAuthHeader(username, password) → 'Basic <base64(user:pass)>'`.

- [ ] **Step 1: Write the failing test** (append to `test/WriteClient.test.js`)

```js
const { parseWriteResponse, basicAuthHeader } = require('../lib/WriteClient');

test('parseWriteResponse reads OK / ERROR from line 1', () => {
  assert.deepStrictEqual(parseWriteResponse('OK\nPUMP\nswitched on\n'), { ok: true, output: 'PUMP', info: ['switched on'] });
  assert.strictEqual(parseWriteResponse('ERROR\nPUMP\nnot allowed').ok, false);
  assert.strictEqual(parseWriteResponse('').ok, false);
  assert.strictEqual(parseWriteResponse('OK\r\nLIGHT').ok, true); // CRLF tolerated
});

test('basicAuthHeader is a base64 Basic token of user:pass', () => {
  assert.strictEqual(basicAuthHeader('user', 'pass'), 'Basic ' + Buffer.from('user:pass').toString('base64'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/WriteClient.test.js`
Expected: FAIL — `parseWriteResponse is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `lib/WriteClient.js` before `module.exports`, and extend the exports:

```js
/**
 * Parse a setFunctionManually text/plain response (spec §2/§4). Line 1 is the
 * authoritative OK/ERROR flag; line 2 the output; the rest are info lines.
 * @param {string} text Raw response body.
 * @returns {{ok:boolean, output:string|null, info:string[]}}
 */
function parseWriteResponse(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  return {
    ok: (lines[0] || '').toUpperCase() === 'OK',
    output: lines[1] || null,
    info: lines.slice(2).filter(Boolean),
  };
}

/**
 * Build an HTTP Basic auth header value (SR-01). Pure; the caller must never log
 * the return value (SR-02).
 * @param {string} username Controller write username.
 * @param {string} password Controller write password (from the device store).
 * @returns {string} `Basic <base64(username:password)>`.
 */
function basicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}
```

Update the export line to:

```js
module.exports = { WRITE_TARGETS, buildWriteUrl, parseWriteResponse, basicAuthHeader };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/WriteClient.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/WriteClient.js test/WriteClient.test.js
git commit -m "feat(m3): WriteClient parseWriteResponse + basicAuthHeader"
```

---

### Task 3: `sendWrite` — authenticated fetch (host-pinned, sanitized, no-leak)

**Files:**
- Modify: `lib/WriteClient.js`
- Test: `test/WriteClient.test.js` (append)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `async sendWrite(host, { username, password }, cmd, { timeoutMs=10000 }={}) → { ok, output, info, status }`. Builds the URL (may throw before any network I/O), sends GET with the `Authorization` header, `redirect:'error'` (SR-08), throws a sanitized `Error` (`Violet write failed: HTTP <status> at <credential-free url>`) on non-2xx (SR-09); credentials never logged (SR-02).

- [ ] **Step 1: Write the failing test** (append). Uses a `fetch` stub via dependency-free global override.

```js
test('sendWrite sends the auth header + redirect:error, returns parsed OK (SR-08)', async () => {
  const { sendWrite } = require('../lib/WriteClient');
  const calls = [];
  const orig = global.fetch;
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, text: async () => 'OK\nPUMP\non' }; };
  try {
    const res = await sendWrite('violet.local', { username: 'u', password: 'sekret' },
      { target: 'PUMP', state: 'ON', args: { duration: 60, speed: 1 } });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls[0].url, 'http://violet.local/setFunctionManually?PUMP,ON,60,1');
    assert.strictEqual(calls[0].opts.headers.Authorization, 'Basic ' + Buffer.from('u:sekret').toString('base64'));
    assert.strictEqual(calls[0].opts.redirect, 'error');
    assert.ok(!/sekret/.test(calls[0].url)); // SR-01: no creds in URL
  } finally { global.fetch = orig; }
});

test('sendWrite throws a sanitized error on HTTP failure — no creds in message (SR-02/09)', async () => {
  const { sendWrite } = require('../lib/WriteClient');
  const orig = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'Access restricted' });
  try {
    await assert.rejects(
      () => sendWrite('violet.local', { username: 'u', password: 'sekret' }, { target: 'LIGHT', state: 'ON' }),
      (err) => {
        assert.ok(/HTTP 401/.test(err.message));
        assert.ok(!/sekret/.test(err.message) && !/Basic /.test(err.message));
        return true;
      },
    );
  } finally { global.fetch = orig; }
});

test('sendWrite validates before any network I/O (SR-04)', async () => {
  const { sendWrite } = require('../lib/WriteClient');
  const orig = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true, status: 200, text: async () => 'OK' }; };
  try {
    await assert.rejects(() => sendWrite('violet.local', { username: 'u', password: 'p' }, { target: 'DOS_1_CL', state: 'ON' }), RangeError);
    assert.strictEqual(called, false);
  } finally { global.fetch = orig; }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/WriteClient.test.js`
Expected: FAIL — `sendWrite is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `lib/WriteClient.js`:

```js
/**
 * Send one authenticated setFunctionManually command (spec §4). Single attempt —
 * no auto-retry (physical actuation must not be silently repeated). Host-pinned
 * with redirect:'error' so the auth header can never follow a redirect to a rogue
 * host (SR-08). Credentials arrive as args and are never logged (SR-02); failures
 * surface a sanitized message with the credential-free URL only (SR-09).
 * @param {string} host Paired controller host.
 * @param {{username:string, password:string}} creds Write credentials (from store).
 * @param {{target:string, scene?:number, state:string, args?:object}} cmd Command.
 * @param {{timeoutMs?:number}} [opts] `timeoutMs` default 10000.
 * @returns {Promise<{ok:boolean, output:string|null, info:string[], status:number}>}
 */
async function sendWrite(host, creds, cmd, { timeoutMs = 10000 } = {}) {
  const url = buildWriteUrl(host, cmd); // validates first — throws before any I/O (SR-04/05/06)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: basicAuthHeader(creds.username, creds.password) },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Violet write failed: HTTP ${res.status} at ${url}`);
    return { ...parseWriteResponse(await res.text()), status: res.status };
  } finally {
    clearTimeout(timer);
  }
}
```

Update the export line to:

```js
module.exports = { WRITE_TARGETS, buildWriteUrl, parseWriteResponse, basicAuthHeader, sendWrite };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/WriteClient.test.js`
Expected: PASS (all WriteClient tests).

- [ ] **Step 5: Run the full suite + commit**

Run: `node --test` (all existing suites still green).

```bash
git add lib/WriteClient.js test/WriteClient.test.js
git commit -m "feat(m3): WriteClient sendWrite (host-pinned auth fetch, sanitized errors, SR-02/08/09)"
```

---

### Task 4: Control capability manifests

**Files:**
- Create: `.homeycompose/capabilities/pump_control.json`
- Create: `.homeycompose/capabilities/light_control.json`
- Create: `.homeycompose/capabilities/pvsurplus_control.json`

**Interfaces:**
- Produces: settable capabilities `pump_control` (enum auto/on/off), `light_control` (enum auto/on/off), `pvsurplus_control` (boolean) — consumed by device.js reconcile + listeners (Tasks 7–8).

- [ ] **Step 1: Create `pump_control.json`**

```json
{
  "type": "enum",
  "title": { "en": "Pump control", "de": "Pumpensteuerung" },
  "uiComponent": "picker",
  "getable": true,
  "setable": true,
  "values": [
    { "id": "auto", "title": { "en": "Auto", "de": "Auto" } },
    { "id": "on", "title": { "en": "On", "de": "An" } },
    { "id": "off", "title": { "en": "Off", "de": "Aus" } }
  ]
}
```

- [ ] **Step 2: Create `light_control.json`**

```json
{
  "type": "enum",
  "title": { "en": "Light control", "de": "Lichtsteuerung" },
  "uiComponent": "picker",
  "getable": true,
  "setable": true,
  "values": [
    { "id": "auto", "title": { "en": "Auto", "de": "Auto" } },
    { "id": "on", "title": { "en": "On", "de": "An" } },
    { "id": "off", "title": { "en": "Off", "de": "Aus" } }
  ]
}
```

- [ ] **Step 3: Create `pvsurplus_control.json`**

```json
{
  "type": "boolean",
  "title": { "en": "PV surplus control", "de": "PV-Überschuss-Steuerung" },
  "uiComponent": "toggle",
  "getable": true,
  "setable": true
}
```

- [ ] **Step 4: Build + validate**

Run: `npx homey app build && npx homey app validate --level=debug`
Expected: PASS (`✓ App validated successfully against level 'debug'`).

- [ ] **Step 5: Commit**

```bash
git add .homeycompose/capabilities/pump_control.json .homeycompose/capabilities/light_control.json .homeycompose/capabilities/pvsurplus_control.json app.json
git commit -m "feat(m3): settable control capabilities (pump/light/pvsurplus)"
```

---

### Task 5: Control settings group (interlock + defaults)

**Files:**
- Modify: `drivers/pool/driver.settings.compose.json` (append one group before the closing `]`)

**Interfaces:**
- Produces: settings `control_enabled` (checkbox, default false), `control_default_duration_min` (number 0–1440, default 60), `control_pump_speed` (dropdown default/0/1/2/3) — consumed by device.js (Tasks 7–8).

- [ ] **Step 1: Append the control group**

Insert this object as the last element of the top-level array in `drivers/pool/driver.settings.compose.json` (add a comma after the current last group):

```json
  {
    "type": "group",
    "label": { "en": "Control (write access)", "de": "Steuerung (Schreibzugriff)" },
    "children": [
      {
        "id": "control_enabled",
        "type": "checkbox",
        "label": { "en": "Enable control (write)", "de": "Steuerung aktivieren (Schreibzugriff)" },
        "value": false,
        "hint": { "en": "Off by default. When on, control tiles appear and Flow actions can command the controller. Writes use the write username/password. Plain HTTP on the LAN transmits credentials in cleartext — use a least-privilege controller account and a trusted/segmented network, and rotate the write password before sharing.", "de": "Standardmäßig aus. Wenn an, erscheinen Steuerungs-Kacheln und Flow-Aktionen können den Regler schalten. Schreibzugriffe nutzen Schreib-Benutzer/Passwort. Klartext-HTTP im LAN überträgt Zugangsdaten unverschlüsselt — ein Konto mit minimalen Rechten und ein vertrauenswürdiges/segmentiertes Netz verwenden und das Schreib-Passwort vor Weitergabe rotieren." }
      },
      {
        "id": "control_default_duration_min",
        "type": "number",
        "label": { "en": "Default override duration (minutes)", "de": "Standard-Übersteuerungsdauer (Minuten)" },
        "value": 60,
        "min": 0,
        "max": 1440,
        "hint": { "en": "Tile pump ON/OFF auto-reverts to Auto after this time (0 = permanent — advanced). Flow actions set their own duration.", "de": "Kachel Pumpe AN/AUS fällt nach dieser Zeit auf Auto zurück (0 = dauerhaft — für Fortgeschrittene). Flow-Aktionen setzen ihre eigene Dauer." }
      },
      {
        "id": "control_pump_speed",
        "type": "dropdown",
        "label": { "en": "Pump speed for tile ON", "de": "Pumpendrehzahl für Kachel-AN" },
        "value": "default",
        "values": [
          { "id": "default", "label": { "en": "Keep configured", "de": "Konfigurierte behalten" } },
          { "id": "0", "label": { "en": "Stage 0", "de": "Stufe 0" } },
          { "id": "1", "label": { "en": "Stage 1", "de": "Stufe 1" } },
          { "id": "2", "label": { "en": "Stage 2", "de": "Stufe 2" } },
          { "id": "3", "label": { "en": "Stage 3", "de": "Stufe 3" } }
        ]
      }
    ]
  }
```

- [ ] **Step 2: Build + validate**

Run: `npx homey app build && npx homey app validate --level=debug`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add drivers/pool/driver.settings.compose.json app.json
git commit -m "feat(m3): control settings group (interlock + duration/speed defaults, SR-07)"
```

---

### Task 6: Flow action card manifests

**Files:**
- Create: `.homeycompose/flow/actions/pump_set_mode.json`
- Create: `.homeycompose/flow/actions/light_set_mode.json`
- Create: `.homeycompose/flow/actions/light_all_scenes.json`
- Create: `.homeycompose/flow/actions/dmx_scene.json`
- Create: `.homeycompose/flow/actions/pvsurplus_set.json`

**Interfaces:**
- Produces: five action cards whose run-listeners are registered in Task 8. Each has a `device` arg (`filter: driver_id=pool`).

- [ ] **Step 1: Create `pump_set_mode.json`**

```json
{
  "id": "pump_set_mode",
  "title": { "en": "Set pump mode", "de": "Pumpenmodus setzen" },
  "titleFormatted": { "en": "Set pump to [[mode]] for [[duration_min]] min at speed [[speed]]", "de": "Pumpe auf [[mode]] für [[duration_min]] Min mit Drehzahl [[speed]]" },
  "hint": { "en": "Requires control to be enabled in the device settings.", "de": "Erfordert aktivierte Steuerung in den Geräteeinstellungen." },
  "args": [
    { "type": "device", "name": "device", "filter": "driver_id=pool" },
    { "type": "dropdown", "name": "mode", "title": { "en": "Mode", "de": "Modus" }, "values": [
      { "id": "auto", "label": { "en": "Auto", "de": "Auto" } },
      { "id": "on", "label": { "en": "On", "de": "An" } },
      { "id": "off", "label": { "en": "Off", "de": "Aus" } }
    ] },
    { "type": "number", "name": "duration_min", "title": { "en": "Duration (min, 0 = permanent)", "de": "Dauer (Min, 0 = dauerhaft)" }, "min": 0, "max": 1440, "value": 60 },
    { "type": "dropdown", "name": "speed", "title": { "en": "Speed", "de": "Drehzahl" }, "values": [
      { "id": "default", "label": { "en": "Keep configured", "de": "Konfigurierte behalten" } },
      { "id": "0", "label": { "en": "Stage 0", "de": "Stufe 0" } },
      { "id": "1", "label": { "en": "Stage 1", "de": "Stufe 1" } },
      { "id": "2", "label": { "en": "Stage 2", "de": "Stufe 2" } },
      { "id": "3", "label": { "en": "Stage 3", "de": "Stufe 3" } }
    ] }
  ]
}
```

- [ ] **Step 2: Create `light_set_mode.json`**

```json
{
  "id": "light_set_mode",
  "title": { "en": "Set light mode", "de": "Lichtmodus setzen" },
  "titleFormatted": { "en": "Set light to [[mode]]", "de": "Licht auf [[mode]]" },
  "hint": { "en": "Requires control to be enabled. Color briefly blinks simple LED lights.", "de": "Erfordert aktivierte Steuerung. Farbe lässt einfache LED-Leuchten kurz blinken." },
  "args": [
    { "type": "device", "name": "device", "filter": "driver_id=pool" },
    { "type": "dropdown", "name": "mode", "title": { "en": "Mode", "de": "Modus" }, "values": [
      { "id": "auto", "label": { "en": "Auto", "de": "Auto" } },
      { "id": "on", "label": { "en": "On", "de": "An" } },
      { "id": "off", "label": { "en": "Off", "de": "Aus" } },
      { "id": "color", "label": { "en": "Color step", "de": "Farbwechsel" } }
    ] }
  ]
}
```

- [ ] **Step 3: Create `light_all_scenes.json`**

```json
{
  "id": "light_all_scenes",
  "title": { "en": "Set all lights & DMX scenes", "de": "Alle Lichter & DMX-Szenen setzen" },
  "titleFormatted": { "en": "Set all lights & scenes to [[mode]]", "de": "Alle Lichter & Szenen auf [[mode]]" },
  "hint": { "en": "Requires control to be enabled. Applies to LIGHT and every DMX scene at once.", "de": "Erfordert aktivierte Steuerung. Gilt gleichzeitig für LIGHT und alle DMX-Szenen." },
  "args": [
    { "type": "device", "name": "device", "filter": "driver_id=pool" },
    { "type": "dropdown", "name": "mode", "title": { "en": "Mode", "de": "Modus" }, "values": [
      { "id": "allon", "label": { "en": "All on", "de": "Alle an" } },
      { "id": "allauto", "label": { "en": "All auto", "de": "Alle auto" } },
      { "id": "alloff", "label": { "en": "All off", "de": "Alle aus" } }
    ] }
  ]
}
```

- [ ] **Step 4: Create `dmx_scene.json`**

```json
{
  "id": "dmx_scene",
  "title": { "en": "Set DMX scene", "de": "DMX-Szene setzen" },
  "titleFormatted": { "en": "Set DMX scene [[scene]] to [[mode]]", "de": "DMX-Szene [[scene]] auf [[mode]]" },
  "hint": { "en": "Requires control to be enabled.", "de": "Erfordert aktivierte Steuerung." },
  "args": [
    { "type": "device", "name": "device", "filter": "driver_id=pool" },
    { "type": "number", "name": "scene", "title": { "en": "Scene (1-12)", "de": "Szene (1-12)" }, "min": 1, "max": 12, "step": 1, "value": 1 },
    { "type": "dropdown", "name": "mode", "title": { "en": "Mode", "de": "Modus" }, "values": [
      { "id": "on", "label": { "en": "On", "de": "An" } },
      { "id": "auto", "label": { "en": "Auto", "de": "Auto" } },
      { "id": "off", "label": { "en": "Off", "de": "Aus" } }
    ] }
  ]
}
```

- [ ] **Step 5: Create `pvsurplus_set.json`**

```json
{
  "id": "pvsurplus_set",
  "title": { "en": "Set PV surplus mode", "de": "PV-Überschuss-Modus setzen" },
  "titleFormatted": { "en": "Set PV surplus [[state]] at speed [[speed]]", "de": "PV-Überschuss [[state]] mit Drehzahl [[speed]]" },
  "hint": { "en": "Requires control to be enabled.", "de": "Erfordert aktivierte Steuerung." },
  "args": [
    { "type": "device", "name": "device", "filter": "driver_id=pool" },
    { "type": "dropdown", "name": "state", "title": { "en": "State", "de": "Zustand" }, "values": [
      { "id": "on", "label": { "en": "On", "de": "An" } },
      { "id": "off", "label": { "en": "Off", "de": "Aus" } }
    ] },
    { "type": "dropdown", "name": "speed", "title": { "en": "Speed", "de": "Drehzahl" }, "values": [
      { "id": "default", "label": { "en": "Keep configured", "de": "Konfigurierte behalten" } },
      { "id": "1", "label": { "en": "Stage 1", "de": "Stufe 1" } },
      { "id": "2", "label": { "en": "Stage 2", "de": "Stufe 2" } },
      { "id": "3", "label": { "en": "Stage 3", "de": "Stufe 3" } }
    ] }
  ]
}
```

- [ ] **Step 6: Build + validate + commit**

Run: `npx homey app build && npx homey app validate --level=debug`
Expected: PASS.

```bash
git add .homeycompose/flow/actions/ app.json
git commit -m "feat(m3): five write-control Flow action cards"
```

---

### Task 7: device.js — control-cap reconciliation + settings re-tick

**Files:**
- Modify: `drivers/pool/device.js` (`onSettings`, `_reconcileCapabilities`)

**Interfaces:**
- Consumes: capabilities from Task 4, settings from Task 5, `detectFeatures` (`features.pump/light/pvSurplus`).
- Produces: control caps added/removed by `control_enabled` ∧ detection; a `control_enabled` change re-ticks.

- [ ] **Step 1: Re-tick on `control_enabled` change**

In `onSettings`, add a branch (after the existing `lsi_enabled`/`chem_` branch):

```js
    // Toggling control adds/removes the control capabilities — reconcile promptly.
    if (changedKeys.includes('control_enabled')) this._tick().catch(this.error);
```

- [ ] **Step 2: Add control-cap reconciliation**

In `_reconcileCapabilities`, append after the M2 block (section 3), before the method closes:

```js
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
```

- [ ] **Step 3: Build + validate**

Run: `npx homey app build && npx homey app validate --level=debug`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add drivers/pool/device.js
git commit -m "feat(m3): reconcile control capabilities behind the control_enabled interlock"
```

---

### Task 8: Capability listeners + Flow run-listeners (write execution)

**Files:**
- Modify: `drivers/pool/device.js` (`onInit`, add helpers)
- Modify: `drivers/pool/driver.js` (`onInit` — register Flow action run-listeners)

**Interfaces:**
- Consumes: `WriteClient.sendWrite`, control caps, control settings, credentials (settings + store).
- Produces: tile taps and Flow actions build a registry-validated command, gate on `control_enabled`, send with store creds, log target+args (no creds, SR-10), and surface sanitized failures.

- [ ] **Step 1: Add the WriteClient import + helpers to device.js**

Add to the imports at the top of `drivers/pool/device.js`:

```js
const { sendWrite } = require('../../lib/WriteClient');
```

Add these methods to the `PoolDevice` class:

```js
  // Read write credentials at send time: username from settings, password from the
  // encrypted store (SR-01/02). Throws (nothing sent) if the password is unset.
  _writeCreds() {
    const username = this.getSetting('writeUsername') || '';
    const password = this.getStoreValue('writePassword') || '';
    if (!password) throw new Error('Write credentials are not set (device settings).');
    return { username, password };
  }

  // Gate every write on the interlock (SR-07), send, and surface OK/ERROR. Logs
  // only target + args, never credentials (SR-10). `label` is a short op name.
  async _control(cmd, label) {
    if (this.getSetting('control_enabled') !== true) {
      throw new Error('Control is disabled — enable it in the device settings.');
    }
    const res = await sendWrite(this.getSetting('host'), this._writeCreds(), cmd);
    this.log('control', label, cmd.target, cmd.state, JSON.stringify(cmd.args || {}));
    if (!res.ok) throw new Error(`Controller rejected: ${label}`);
    return res;
  }

  // Tile pump speed from settings: 'default' ⇒ omit (keep configured), else 0-3.
  _pumpSpeedArg() {
    const s = this.getSetting('control_pump_speed');
    return s === undefined || s === 'default' ? undefined : Number(s);
  }
```

- [ ] **Step 2: Register the capability listeners in `onInit`**

Add near the end of `onInit` (before `this._startPolling()`):

```js
    // M3 control tiles (spec §5/§8). Registered by id regardless of current
    // presence; taps route here once the cap is added. Each gates on the interlock.
    this.registerCapabilityListener('pump_control', async (value) => {
      const durationSecs = value === 'auto' ? 0 : (this.getSetting('control_default_duration_min') ?? 60) * 60;
      await this._control({ target: 'PUMP', state: value.toUpperCase(), args: { duration: durationSecs, speed: this._pumpSpeedArg() } }, 'pump_control');
    });
    this.registerCapabilityListener('light_control', async (value) => {
      await this._control({ target: 'LIGHT', state: value.toUpperCase() }, 'light_control');
    });
    this.registerCapabilityListener('pvsurplus_control', async (value) => {
      const speed = this._pumpSpeedArg();
      await this._control(value
        ? { target: 'PVSURPLUS', state: 'ON', args: { speed: speed === 0 ? undefined : speed } }
        : { target: 'PVSURPLUS', state: 'OFF' }, 'pvsurplus_control');
    });
```

- [ ] **Step 3: Register the Flow action run-listeners in driver.js**

In `drivers/pool/driver.js` `onInit`, after the existing `set_water_chemistry` registration, add:

```js
    // M3 write-control Flow actions (spec §7). Each delegates to device._control,
    // which enforces the interlock + registry validation + sanitized errors.
    const speedArg = (v) => (v === undefined || v === 'default' ? undefined : Number(v));

    this.homey.flow.getActionCard('pump_set_mode').registerRunListener(async (args) => {
      await args.device._control({ target: 'PUMP', state: String(args.mode).toUpperCase(), args: { duration: Math.round((args.duration_min ?? 0) * 60), speed: speedArg(args.speed) } }, 'pump_set_mode');
      return true;
    });
    this.homey.flow.getActionCard('light_set_mode').registerRunListener(async (args) => {
      await args.device._control({ target: 'LIGHT', state: String(args.mode).toUpperCase() }, 'light_set_mode');
      return true;
    });
    this.homey.flow.getActionCard('light_all_scenes').registerRunListener(async (args) => {
      await args.device._control({ target: 'DMX_SCENE', scene: 1, state: String(args.mode).toUpperCase() }, 'light_all_scenes');
      return true;
    });
    this.homey.flow.getActionCard('dmx_scene').registerRunListener(async (args) => {
      await args.device._control({ target: 'DMX_SCENE', scene: Number(args.scene), state: String(args.mode).toUpperCase() }, 'dmx_scene');
      return true;
    });
    this.homey.flow.getActionCard('pvsurplus_set').registerRunListener(async (args) => {
      const speed = speedArg(args.speed);
      await args.device._control(String(args.state) === 'on'
        ? { target: 'PVSURPLUS', state: 'ON', args: { speed } }
        : { target: 'PVSURPLUS', state: 'OFF' }, 'pvsurplus_set');
      return true;
    });
```

- [ ] **Step 4: Build + validate**

Run: `npx homey app build && npx homey app validate --level=debug`
Expected: PASS.

- [ ] **Step 5: Security review of the write wiring**

Dispatch the `security-reviewer` subagent on the diff (SR-01…SR-10 focus: creds only in store/header, no creds in logs, interlock gates every path, registry validates every command). Address any High/Critical finding before committing.

- [ ] **Step 6: Commit**

```bash
git add drivers/pool/device.js drivers/pool/driver.js
git commit -m "feat(m3): wire control tiles + Flow actions to WriteClient (interlock, no-cred logging, SR-02/07/10)"
```

---

### Task 9: Whole-branch verification (dev gate)

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `node --test`
Expected: PASS — all suites (existing 46 + new WriteClient cases).

- [ ] **Step 2: Dev-gate validate**

Run: `npx homey app validate --level=debug`
Expected: PASS.

- [ ] **Step 3: `/security-review` on the branch diff**

Run `/security-review` against `origin/main`. Confirm SR-01…SR-10 hold on the whole diff; no credential reaches a URL or a log; the interlock gates every write path. Fix any finding, re-validate.

- [ ] **Step 4: Whole-branch review (opus)**

Request a whole-branch code review (as M0–M2 did). Address blocking findings.

---

### Task 10: Live smoke test + release (v0.3.0)

**Files:**
- Modify: `.homeycompose/app.json` (version, via CLI), `app.json` (generated), `.homeychangelog.json`, `docs/dashboard/versions.md`, `docs/dashboard/dashboard.html`

**Interfaces:** none (release mechanics per HOMEY.md + CLAUDE.md §8).

- [ ] **Step 1: Live smoke test (`homey app run`)**

Run: `npx homey app run`
- Pair/point at `demo.myViolet.de`: with `control_enabled` on but no valid creds, every tile/Flow → sanitized failure; **nothing actuates** (401). Confirm no credential appears in the run log (SR-02).
- Against the real `violet` host (enter write creds live in device settings; never commit them): open `http://violet/debughttp.htm`, trigger each control, and confirm the exact `setFunctionManually?…` request arrives correctly formatted. Verify a pump `ON` with a short duration **auto-reverts to AUTO**; confirm `OK` parsing updates the tile.
- **Resolve §12 unknowns:** PUMP `VAL2` speed-`0` semantics and PVSURPLUS 2- vs 3-field arity. If a target needs the 4th field padded, adjust `WRITE_TARGETS` + a unit test and re-run Tasks 1/9.

- [ ] **Step 2: Version bump (new milestone → minor)**

Run: `npx homey app version minor`
Expected: `.homeycompose/app.json` version `0.2.0 → 0.3.0`.

- [ ] **Step 3: Changelog (en + de)**

Add a `0.3.0` entry to `.homeychangelog.json`, e.g. `{ "en": "Control your pool: pump, light, DMX scenes and PV-surplus mode via tiles and Flow actions (off by default — enable in settings).", "de": "Pool steuern: Pumpe, Licht, DMX-Szenen und PV-Überschuss-Modus per Kachel und Flow-Aktion (standardmäßig aus — in den Einstellungen aktivieren)." }`.

- [ ] **Step 4: Build + verify version sync + validate**

Run: `npx homey app build && npx homey app validate --level=debug`
Expected: PASS; `app.json` version == `.homeycompose/app.json` version == `0.3.0`.

- [ ] **Step 5: Commit the bump + changelog**

```bash
git add .homeycompose/app.json app.json .homeychangelog.json
git commit -m "chore(m3): bump to 0.3.0 + changelog"
```

- [ ] **Step 6: Install + log the release**

Run: `npx homey app install` (retry once on a transient "Missing File"). Then append a `0.3.0` row to `docs/dashboard/versions.md` (version, date, commit `git log -1 --format=%h`, target Homey-Install, milestone M3, note).

- [ ] **Step 7: Dashboard done**

Update the M3 entry in `docs/dashboard/dashboard.html`: `status:"done"`, `finishedAt`, `commit`, all `steps[].done=true`, `currentActivity:null`, bump `updatedAt`, `prompt:null`. Commit.

- [ ] **Step 8: Finish the branch (CLAUDE.md §9)**

Run `/code-review` on the finished branch, then ask the user whether to push directly to `origin/main` (trivial, no criticals) or open a PR. Wait for explicit approval before pushing/merging.

---

## Self-Review

**Spec coverage:** §1 scope → Tasks 4–8; §2 API grammar → Task 1 registry; §3 SR-01…10 → Global Constraints + Tasks 1–3 (URL/parse/send), 5 (interlock), 7 (interlock reconcile), 8 (no-cred logging + gating), 9 (review); §4 WriteClient → Tasks 1–3; §5 control caps → Tasks 4, 7, 8; §6 settings → Task 5; §7 Flow cards → Tasks 6, 8; §8 device wiring → Tasks 7–8; §11 testing → Tasks 1–3 + 9; §11 live/§12 unknowns → Task 10; §13 M8 → already on the dashboard. No gaps.

**Placeholders:** none — every code/step is concrete.

**Type consistency:** `buildWriteUrl(host,{target,scene,state,args})`, `sendWrite(host,creds,cmd,opts)`, `parseWriteResponse(text)→{ok,output,info}`, `basicAuthHeader(u,p)`, device `_control(cmd,label)`/`_writeCreds()`/`_pumpSpeedArg()` are used identically across Tasks 1–8. Command shape `{target,scene?,state,args?}` is consistent everywhere.
