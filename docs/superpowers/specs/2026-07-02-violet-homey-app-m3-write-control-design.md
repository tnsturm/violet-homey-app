# Violet Homey App — M3: Write / Control — Design Spec

- **Date:** 2026-07-02
- **Milestone:** M3 — Full control (write) via `setFunctionManually` + BasicAuth
- **Status:** Approved design (brainstorming) → feeds writing-plans
- **Depends on:** M0 (pairing captures write creds; `VioletClient` read path), M2 (feature detection, capability reconcile)
- **References:**
  - Threat model + security requirements: `docs/superpowers/security/2026-06-30-m3-write-control-threat-model.md` (SR-01…SR-10)
  - M0 design spec §1, §6, §13 (`docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md`)
  - **Authoritative write API:** Violet user manual §26.2–26.4 (`https://www.myviolet.de/_violet/paperwork/usermanual/de/manual.pdf`, pp. 145–152), violetOS 1.1.9
  - Live recon: `demo.myViolet.de` (auth behaviour + full actuator inventory, 2026-07-02)

---

## 1. Scope

M3 adds **write/control** for the **safe actuator core** only:

| Control | Violet output | Delivered as |
|---|---|---|
| **Filter pump** | `PUMP` | settable tile `pump_control` + Flow `pump_set_mode` |
| **Light** | `LIGHT` | settable tile `light_control` + Flow `light_set_mode` (incl. `COLOR`) |
| **All lights/scenes** | `LIGHT`+`DMX_SCENE*` | Flow `light_all_scenes` |
| **DMX scene** | `DMX_SCENE1..12` | Flow `dmx_scene` |
| **PV surplus mode** | `PVSURPLUS` | settable tile `pvsurplus_control` + Flow `pvsurplus_set` |

**Explicitly out of scope (moved to a new final milestone, see §13):** dosing (`DOS_*`) and setpoints (target pH / ORP / chlorine). The documented `setFunctionManually` API does **not** expose them — in the manual they are dashboard/config-page operations (a "manuell dosieren" UI button; setpoints are config values written internally via an **undocumented** `/setConfig` POST). They will be evaluated last, reverse-engineered via the `debughttp.htm` debug page (§26.4).

Also **not** in this milestone (documented but deferred, no user demand yet): generic `EXT1_*/EXT2_*` relays and `DIRULE_*` switch-rules. The registry (§4) is structured so they can be added later without rework.

## 2. Authoritative write API (manual §26.2–26.4)

**Endpoint:** `GET http://<host>/setFunctionManually?{OUTPUT},{STATE},{VAL1},{VAL2}`
- Requires HTTP **Basic** auth header. Confirmed live: no auth → `401 "Access restricted, no Auth found"`; wrong creds → `401 "Access restricted, wrong authentication data"`; realm advertised as `violetauth`. A standard `Authorization: Basic <base64(user:pass)>` header is accepted.
- Parameters are **comma-separated**, **case-sensitive**.
- **Response** is `text/plain`, up to 4 lines: **line 1 = `OK` or `ERROR`** (authoritative), line 2 = output, lines 3–4 = info text.

**Per-output grammar (only the M3 core):**

| OUTPUT | STATE | VAL1 | VAL2 | Notes |
|---|---|---|---|---|
| `PUMP` | `ON` `AUTO` `OFF` | runtime seconds, `0`=permanent | speed `0–3` (variable pump) | after VAL1 s, reverts to `AUTO`; example `PUMP,ON,120,2` |
| `LIGHT` | `ON` `AUTO` `OFF` `COLOR` | — | — | no timer; `COLOR` = ~150 ms off/on (LED colour step) |
| `DMX_SCENE1..12` | `ON` `AUTO` `OFF` `ALLON` `ALLAUTO` `ALLOFF` | — | — | `ALL*` on any scene id sets **all** scenes + `LIGHT` at once |
| `PVSURPLUS` | `ON` `OFF` | speed `1–3` (variable pump) | — | 3-param form `PVSURPLUS,ON,2`; status via `getReadings?PVSURPLUS` (0/1/2) |

**Safety semantics (critical — manual §26.2):**
1. A manual `ON`/`OFF` **persists indefinitely** unless a non-zero VAL1 duration is supplied, after which the output **auto-reverts to `AUTO`**. Duration-limited overrides are therefore the primary safety mechanism, and `AUTO` = "hand control back to the controller".
2. Manual commands are prioritised like a manual switch: **manual `OFF` stays `OFF`**; manual `ON` is only overridden by hardware safety functions (dry-run / pressure). A manual pump `OFF` is thus a **persistent, high-risk** action (stops circulation — the very thing this app exists to protect). It stays available (user decision) but is treated with the duration/interlock safeguards below.

**Debug aid (§26.4):** `http://<host>/debughttp.htm` echoes incoming `setFunctionManually`/`getReadings`/`setConfig` requests on-the-fly (not stored). Used in the live smoke test (§11) to confirm our exact request formatting and to reverse-engineer the future dosing/setpoint milestone.

## 3. Security requirements → design (SR-01…SR-10)

The threat model is the source of truth; this maps each requirement to its concrete M3 realisation and where it is verified.

| SR | Requirement | Realisation | Verified by |
|---|---|---|---|
| SR-01 | Creds only in `Authorization` header, never URL/query | `buildWriteUrl` produces a credential-free URL; header added only in `sendWrite` | unit test (URL has no creds) |
| SR-02 | Creds never logged/persisted | password/header/token never passed to `log`/`error`/`console`; failures log status + credential-free URL only | unit test (no-leak grep) + `secrets-guard` hook + `security-reviewer` |
| SR-03 | Plain-HTTP cleartext exposure = documented accepted risk | stated in store/readme; least-privilege account + rotate-before-publish guidance | doc review |
| SR-04 | Only allowlisted TARGETs sent | `WRITE_TARGETS` registry; unknown target → throw, nothing sent | unit test |
| SR-05 | All ARGS clamped to safe ranges / rejected | per-target typed arg-spec; out-of-range/NaN/unknown state → **reject** (no send) | unit test |
| SR-06 | Typed encoding, never concat of untrusted text | request built only from registry-validated tokens + numeric args | unit test + `security-reviewer` |
| SR-07 | Device "write enabled" interlock, default off, gates every write | `control_enabled` setting: hides control caps when off **and** runtime-checked on every tile + Flow write | unit/integration + live |
| SR-08 | Write host pinned; redirects/unexpected responses rejected | host taken from device settings only; `fetch(..., {redirect:'error'})`; non-2xx → error | unit test (redirect) + live |
| SR-09 | Errors surface sanitized, non-sensitive messages | `sendWrite` throws `Violet write failed: HTTP <status>` (+ credential-free URL), never body creds | unit test |
| SR-10 | Write actions logged (target + clamped args, no creds) | `device.log` one line per executed write: target/state/val1/val2, never creds | code review + live |

## 4. Module: `lib/WriteClient.js` (pure + one thin sender)

Mirrors `VioletClient.js`: pure, unit-testable core; a single impure fetch.

**Pure exports (no network, no creds):**
- **`WRITE_TARGETS`** — the declarative registry, single source of truth (SR-04/05/06). Per entry: `token` (or `tokenPattern` for DMX scenes), `states: string[]`, `val1`/`val2` arg-specs (`{kind, min, max, set, optional}` or `null`), and the **arity** to emit. Core entries:
  - `PUMP`: states `AUTO|ON|OFF`; `val1={kind:'seconds',min:0,max:86400}`; `val2={kind:'enum',set:[0,1,2,3],optional:true}`; arity 4.
  - `LIGHT`: states `AUTO|ON|OFF|COLOR`; no args; arity 4 (pad `,0,0`).
  - `DMX_SCENE` (`tokenPattern`, n∈1..12): states `ON|AUTO|OFF|ALLON|ALLAUTO|ALLOFF`; no args; arity 4.
  - `PVSURPLUS`: states `ON|OFF`; `val1={kind:'enum',set:[1,2,3],optional:true}`; arity 3.
- **`buildWriteUrl(host, {target, scene?, state, val1?, val2?})`** → validates target∈registry, state∈allowed, args within spec (finite + in range/set); **throws `RangeError`/`TypeError` on any violation (write not sent)**; returns `http://<host>/setFunctionManually?TOKEN,STATE[,V1[,V2]]`. No creds (SR-01).
- **`parseWriteResponse(text)`** → `{ ok: boolean, output: string|null, info: string[] }` from line 1 = `OK`/`ERROR` (SR-09 helper).
- **`basicAuthHeader(username, password)`** → `'Basic ' + base64(user:':'+pass)`; pure; caller never logs it.

**Impure export:**
- **`sendWrite(host, { username, password }, cmd, { timeoutMs=10000 })`** — `buildWriteUrl` → `fetch(url, { headers:{ Authorization: basicAuthHeader(...) }, redirect:'error', signal })` (SR-08) → on non-2xx throw sanitized `Error` with status + credential-free URL (SR-09) → `parseWriteResponse(await res.text())`; returns `{ ok, output, info, status }`. **Single attempt** — no auto-retry (avoids double-actuation of non-idempotent commands like `COLOR`/scene toggles); the caller/Flow decides on failure. Credentials arrive as args from the device store; never logged (SR-02).

## 5. Control capabilities (new, settable) — gated & dynamic

New custom capabilities in `.homeycompose/capabilities/`, all `setable:true, getable:true`, distinct from the M2 read sensors (no churn of existing tiles/Flows):

| Capability | Type | uiComponent | Command built |
|---|---|---|---|
| `pump_control` | `enum` `auto`/`on`/`off` | picker | `PUMP,<STATE>,<defaultDurationSecs>,<defaultSpeed?>` |
| `light_control` | `enum` `auto`/`on`/`off` | picker | `LIGHT,<STATE>,0,0` |
| `pvsurplus_control` | `boolean` | toggle | `PVSURPLUS,ON,<defaultSpeed?>` / `PVSURPLUS,OFF` |

- **Dynamic, interlock-gated:** the control capabilities exist **only while `control_enabled` is true** (reusing the M1 `lsi_enabled → measure_lsi` add/remove pattern). Default off ⇒ **no control tiles at all** — zero accidental-tap surface (SR-07).
- **Presence-gated by hardware:** `pump_control` when `pump` detected (always on a Violet), `light_control` when `light` detected, `pvsurplus_control` when `pvSurplus` detected — mirroring which M2 read tiles are shown, via `FeatureDetector.detectFeatures`.
- **Tile → auto-revert:** tile commands use `control_default_duration_min` (converted to seconds); with the default (60 min) a tap auto-reverts to `AUTO` and can never leave the pump forced on/off forever. Setting it to `0` makes tile commands permanent — an explicit advanced opt-in; the Flow `pump_set_mode` also exposes a per-action duration (including `0`) regardless of the tile default.
- `light_control`/`pvsurplus_control` carry no timer in the API, so they set state directly; returning to `auto` (light) is an explicit picker choice.
- The value shown reflects the **last commanded** state (readings expose `PUMP`=1/0 running, not AUTO/MAN mode, so exact mode can't be reconciled from polling — documented limitation). Read truth stays in the untouched M2 sensors (`pump_running`, `pump_speed_stage`, `light_on`, `pv_surplus_active`).

## 6. Interlock & settings

New settings group **"Steuerung (Schreibzugriff)" / "Control (write access)"** in `driver.settings.compose.json`:

| id | type | default | bounds | purpose |
|---|---|---|---|---|
| `control_enabled` | checkbox | `false` | — | **master interlock** (SR-07); toggles control caps + runtime gate |
| `control_default_duration_min` | number | `60` | 0–1440 | auto-revert duration for **tile** commands (0 = permanent) |
| `control_pump_speed` | dropdown | `default` | `default`/`0`/`1`/`2`/`3` | speed for tile pump `ON` (`default` ⇒ omit VAL2) |

Credentials unchanged and already captured at pairing: `writeUsername` in settings, `writePassword` in device **store** (hidden from the settings UI; *correction 2026-07-13:* not encrypted at rest — Homey documents no such guarantee). A settings `label` states the SR-03 accepted risk (plain-HTTP LAN; use a least-privilege controller account; rotate the write password before publishing) and reminds that control is off by default.

## 7. Flow action cards (`.homeycompose/flow/actions/`)

All are device-scoped (`args:[{type:'device'}]`), all re-check `control_enabled` (SR-07), all build via the registry:

1. `pump_set_mode` — `mode` (auto/on/off dropdown), `duration_min` (number, 0=permanent), `speed` (dropdown default/0–3).
2. `light_set_mode` — `mode` (auto/on/off/**color** dropdown).
3. `light_all_scenes` — `mode` (allon/allauto/alloff) → emits `DMX_SCENE1,ALL*,0,0`.
4. `dmx_scene` — `scene` (1–12), `mode` (on/auto/off).
5. `pvsurplus_set` — `state` (on/off), `speed` (dropdown default/1–3).

Bilingual (en+de) titles/args, consistent with existing M1/M2 Flow cards.

## 8. `drivers/pool/device.js` wiring

- **Reconcile:** in the existing capability-reconcile step, when `control_enabled` add the presence-gated control caps; when disabled remove them (never touches M0/M1/M2 caps).
- **Listeners:** `registerCapabilityListener` for each control cap → guard `control_enabled` (throw a clear bilingual error if off) → build `cmd` from the registry + settings → read `{username, password}` (settings + store) → `WriteClient.sendWrite` → on `!ok`/throw, surface a sanitized error to the UI and **do not** update the cap; on `ok`, `log` the executed write (target/state/args, no creds — SR-10) and set the cap value.
- **Flow run-listeners** registered in `driver.js` (like `set_water_chemistry`): same guard → build → send → return; throw on failure so the Flow card shows an error.
- **Credentials never logged** anywhere in these paths (SR-02); the `secrets-guard` hook backstops accidental literals in source.

## 9. Error handling & retry policy

- `buildWriteUrl` throws on invalid input → caller returns a user-facing "invalid value" error, nothing sent.
- `sendWrite` maps transport/HTTP/`ERROR`-body failures to a single sanitized `Error` (status + credential-free URL).
- **No silent auto-retry** (deliberate, §2/§4): physical actuation must not be repeated implicitly. The manual's retry advice is surfaced to the user instead (they can re-run the Flow/tile). This is documented as an accepted trade-off.

## 10. Credential handling

- Read at send time: `username = this.getSetting('writeUsername')`, `password = this.getStoreValue('writePassword')`.
- If password missing/empty → reject with "write credentials not configured" (nothing sent), no leak.
- Header built inside `sendWrite`; never returned, stored, or logged (SR-01/02).

## 11. Testing

**Pure unit tests (`node --test`, `test/WriteClient.test.js`):**
- allowlist: unknown target/scene/state → throws, no URL.
- clamp/reject: duration <0 / >max / NaN → throws; speed outside set → throws; valid → correct URL string.
- URL never contains `username`/`password`/`Basic` (SR-01).
- `parseWriteResponse`: `OK`/`ERROR`/malformed.
- no-leak: a spy `log` is never called with the password or `Basic …` across a simulated failed send (SR-02).
- host pinning: a `fetch` stub asserting `redirect:'error'` and that host = provided host (SR-08).

**Live smoke test (`homey app run`):**
- Against `demo.myViolet.de` (no valid creds): every command → sanitized 401 error path exercised; **nothing actuates**.
- Against the real `violet` host (user creds, entered live only): open `debughttp.htm`, confirm each command arrives correctly formatted; verify pump `ON,<dur>` auto-reverts to `AUTO`; confirm `OK` parsing. Resolve the VAL2 speed-`0` semantics here (§12).
- `security-reviewer` subagent runs on the diff in parallel during implementation.
- **Dev gate:** `npx homey app validate --level=debug` must PASS.

## 12. Open items to verify live
- **PUMP VAL2 speed:** whether `0` is stage-0 or "keep configured". Until confirmed via `debughttp.htm`, `control_pump_speed=default` **omits** VAL2 (safest); explicit 0–3 only when the user opts in.
- **PVSURPLUS arity:** confirm the 3-param form is accepted (manual example) vs. 4-param padding.

## 13. Out of scope → new final milestone

**M8 — Dosing & setpoints (via `setConfig`)** *(new, added 2026-07-02 at the end of the roadmap):* evaluate and possibly implement manual dosing and target-value (setpoint) control through the **undocumented** `/setConfig` endpoint, reverse-engineered via `debughttp.htm` on real hardware. Higher risk (touches water chemistry directly; may break on firmware changes) — deliberately last, its own threat model + spec.

## 14. Traceability

Every M3 write path traces to a threat-model requirement (§3). No new attack surface beyond the write channel already modelled on 2026-06-30. `/security-review` + the `security-reviewer` subagent re-run on the M3 diff before merge (CLAUDE.md §5/§9).
