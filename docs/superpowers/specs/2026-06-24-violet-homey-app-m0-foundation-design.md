# Violet Homey App — M0 Foundation & Core Reads (Design Spec)

- **Date:** 2026-06-24
- **Status:** Approved design (pending written-spec review)
- **Project:** Homey Pro app for the PoolDigital "Violet" pool controller
- **This spec covers:** Milestone **M0** only. Later milestones are listed for context but designed separately.

---

## 1. Context & goals

The app connects a Homey Pro to a PoolDigital **"Violet"** pool controller over its local HTTP/JSON API. The long-term goal is a **publishable, general-purpose integration** that exposes both **read** and **write** of the controller's values, adapting to whatever hardware a given pool actually has. The originating motivation is a **water-chemistry safety net** (Langelier Saturation Index / LSI monitoring) to prevent the copper-corrosion problem documented in the project handover.

Because the full scope spans several independent subsystems, the project is decomposed into milestones (§2). **This spec designs M0**, the foundation everything else builds on.

### Confirmed external facts (from the live Violet API)

Read endpoint (no authentication required):

```
GET http://<host>/getReadings?ALL
```

Verified field mapping (sampled from the public demo server `demo.myViolet.de`):

| Meaning | JSON field | Example | Notes |
|---|---|---|---|
| pH (live) | `pH_value` | `7.296` | plain float, **no scaling** |
| Redox / ORP | `orp_value` | `787.2` | mV |
| Free chlorine | `pot_value` | `0.29` | mg/L (ppm), potentiostat sensor — present only on equipped pools |
| Water temperature | `onewire1_value` … `onewire12_value` | `30.2` | **no dedicated field**; one of up to 12 generic 1-wire sensors |
| Temp-sensor health | `onewireN_state` | `"OK"` / `"NO_SENSOR_CONFIGURED"` | used to detect which channels exist |
| Pump running | `PUMP` | `1` | 1 = on, 0 = off |
| Date / time | `date`, `time`, `CURRENT_TIME_UNIX` | `24.06.2026`, unix | freshness |
| Disinfection in use | `DOS_1_CL_USE`, `DOS_2_ELO_USE` | `"1"` | `"1"` = feature active (chlorine dosing / electrolysis) |
| Other features | `LIGHT`, `SOLAR`, `HEATER`, `COVER_STATE`, `PVSURPLUS`, `REFILL`, … | — | basis for feature detection in M2 |

Write endpoint (requires HTTP Basic auth header):

```
GET http://<host>/setFunctionManually?<TARGET>,<ARGS>
Authorization: Basic <base64(user:pass)>
```

Write is **not implemented in M0** (deferred to M3) but credentials are captured during pairing.

---

## 2. Milestone decomposition (context)

| # | Milestone | Delivers | Depends on |
|---|---|---|---|
| **M0** | **Foundation & core reads** *(this spec)* | scaffold, pairing, polling, pump-aware freshness, dynamic-capability architecture, core readings | — |
| M1 | LSI flagship | PoolLab manual values + `measure_lsi` + `classifyLSI` + warning Flow cards | M0 |
| M2 | Full read coverage + feature groups | all remaining readings, grouped & feature-detected | M0 |
| M3 | Full control (write) | `setFunctionManually` → capabilities + Flow actions, BasicAuth, safety guards | M2 |
| M4 | Inbound alarm notifications | embedded HTTP listener + device Flow trigger for the Violet NOTIFY push (`?ERRORCODE&SUBJECT`) | M0 |
| M5 | Publish-readiness | EN/DE i18n, store assets, `homey app validate`, trademark/branding review | M1–M4 |

---

## 3. M0 scope

**In scope**
- SDK3 app scaffold via Homey Compose.
- One **"Pool"** device (single device holds all capabilities; confirmed decision).
- Custom pairing: host + optional write credentials, validated against `getReadings?ALL`.
- Polling loop with configurable interval.
- **Pump-aware freshness** handling (central to M0).
- **Dynamic-capability architecture**: auto-detect + per-group override (mechanism built here; only the core group + chlorine demo wired).
- Core read capabilities: pH, water temperature (with channel picker), ORP, chlorine (if present), pump state, freshness indicator.
- Offline / error handling.
- Unit tests for the pure data/detection modules.

**Out of scope (deferred)**
- All other readings & feature groups (M2).
- Any write/control action (M3).
- i18n beyond English defaults, store assets, branding/trademark (M4).
- LSI computation and chemistry warnings (M1).
- PoolLab values (M1).
- mDNS/auto-discovery (possible later; M0 uses manual host entry).

---

## 4. Architecture

```
/app.json                     ← generated from .homeycompose (do not hand-edit)
/.homeycompose/
   app.json                   ← app meta
   capabilities/*.json        ← custom capabilities (measure_ph, measure_orp, measure_chlorine, pump_running, measurements_fresh)
   drivers/...                ← (compose driver fragments if used)
/lib/
   VioletClient.js            ← PURE: build URLs, fetch getReadings?ALL, parse/normalize payload
   FeatureDetector.js         ← PURE: payload → { features present, ok temp channels }
   Freshness.js               ← PURE: decide whether current readings are "fresh" given pump state/runtime
/drivers/pool/
   driver.compose.json
   driver.js
   device.js                  ← polling, capability reconciliation, freshness, availability
   pair/
      start.html              ← custom pairing view (host + credentials + connection test)
/test/
   fixtures/getReadings.all.json  ← captured real payload
   VioletClient.test.js
   FeatureDetector.test.js
   Freshness.test.js
```

**Design principle:** all logic that can be pure (URL building, JSON parsing/normalization, feature detection, freshness decision) lives in `/lib` as side-effect-free functions, unit-tested against the captured fixture. `device.js` is the thin glue that calls them and talks to the Homey runtime.

---

## 5. The "Pool" device & core capabilities (M0)

Single device. M0 wires only universally-present readings plus the chlorine feature-detection demonstrator:

| Capability | Type | Source | Behaviour |
|---|---|---|---|
| `measure_ph` | custom number (decimals 2) | `pH_value` | updated **only when readings are fresh** (§7) |
| `measure_temperature` | standard | selected `onewireN_value` | mirrors the chosen water channel; updates every poll |
| `measure_temperature.owN` | standard (sub-capabilities) | each OK `onewireN_value` | read-only "Sensor N" tiles so the user can identify the water channel (§8) |
| `measure_orp` | custom number, mV (decimals 0) | `orp_value` | fresh-gated |
| `measure_chlorine` | custom number, ppm (decimals 2) | `pot_value` | present only if detected (`DOS_1_CL_USE="1"` or pot sensor active); fresh-gated |
| `pump_running` | custom boolean, read-only | `PUMP` | updates every poll; becomes controllable `onoff` in M3 |
| `measurements_fresh` | custom boolean, read-only | derived | true when probe values reflect circulating water (§7) |

Capability titles default to English (i18n is M4).

### 5.1 Insights / statistics (logging)

**Requirement:** every capability the app exposes must be available in Homey **Insights** (statistics/graphs). This is *not* automatic for custom capabilities:

- Standard `measure_temperature` (primary + `.owN`) logs to Insights by default.
- All **custom** capabilities (`measure_ph`, `measure_orp`, `measure_chlorine`, `pump_running`, `measurements_fresh`) must set **`"insights": true`** in their capability definition, with an `insightsTitle`. Numeric ones produce graphs; boolean ones (`pump_running`, `measurements_fresh`) produce a state timeline.
- This rule applies to **all** capabilities added in later milestones too (M2/M3): any new capability ships with Insights enabled unless there's a concrete reason not to.

---

## 6. Pairing & connection

Custom pairing view collects:
- **Host** — text, default `violet.local`; helper note recommends a static IP (per PoolDigital guidance, browsers/mDNS may be unreliable for integrations).
- **Write username** and **write password** — optional, used from M3 onward.

Pairing performs a live `GET http://<host>/getReadings?ALL` and only completes on a valid JSON response (surfacing a clear error otherwise).

**Storage:**
- Host → device setting (editable later).
- Write password → device **store** (`setStoreValue`, not shown in UI). Username may live in settings; password never in plain settings.
- Polling interval, water-temp channel, and feature-group overrides → device settings.

---

## 7. Polling, pump-awareness & freshness *(central to M0)*

The pump typically runs only a few hours per day, so **the stale case is the normal case**. The app must never treat still-water probe values as live chemistry.

- **Poll:** `setInterval`, default **300 s**, configurable **60–900 s** in settings.
- **Freshness decision (`Freshness.js`, pure):** readings are **fresh** when `PUMP === 1` **and** the pump has been continuously on for at least `pumpWarmupSeconds` (default **120 s**, configurable) — giving circulation time to deliver representative water to the probes.
- **On each poll:**
  - `measure_temperature` (water + sub-sensors) and `pump_running` **always update** (temperature is meaningful regardless of circulation).
  - `measure_ph`, `measure_orp`, `measure_chlorine` update **only when fresh**; otherwise they **retain their last fresh value** (no overwrite with still-water noise).
  - `measurements_fresh` is set accordingly, and `lastFreshReadingAt` is recorded.
- **Consequence for later milestones:** M1 LSI is computed only from fresh probe values, and chemistry warnings are suppressed (or deferred) while `measurements_fresh = false`. M0 establishes the freshness signal that M1 consumes. `measurements_fresh` is also exposed so user Flows can gate on it.
- This freshness signal underpins the **winter-risk** concern: prolonged absence of fresh readings (no circulation) is detectable.

---

## 8. Water-temperature channel selection

There is no labeled water-temp field, so the user identifies the pool channel:

- Every `onewireN` channel whose state is `OK` is exposed as a **read-only sub-sensor** `measure_temperature.owN` ("Sensor N"), so the user can see all live temperatures in the device UI.
- A **dropdown device setting "Water temperature sensor"** selects which channel drives the primary `measure_temperature` (and feeds the LSI in M1).
- Default: if exactly one channel is `OK`, auto-select it; otherwise require the user to choose (primary `measure_temperature` shows no value until chosen).

---

## 9. Dynamic capability / feature model

**Auto-detect + override** (confirmed decision):

- On each successful poll, `FeatureDetector.js` (pure) derives the set of present features from the payload (e.g. `DOS_1_CL_USE`, `DOS_2_ELO_USE`, presence/state of `LIGHT`, `SOLAR`, `HEATER`, `COVER_STATE`, `PVSURPLUS`, `REFILL`, OK `onewire` channels).
- Each feature **group** has a per-device setting with three modes: **Auto** (default — capability present iff detected), **Force-show**, **Hide**.
- `device.js` reconciles actual capabilities each poll via `addCapability` / `removeCapability` to match (detection ∧ override).
- **M0 builds this mechanism but only wires:** the core group (pH/temp/ORP/pump/freshness) and the **chlorine** capability as the first auto-detected example. M2 populates all remaining groups using the same mechanism.

---

## 10. Error handling & offline

- All fetches: ~10 s timeout, wrapped in try/catch; parse failures never throw out of the poll handler.
- **3 consecutive failures** → `setUnavailable("Violet not reachable")`; first success → `setAvailable()`.
- Errors logged via `this.error`; transient failures do not clear last-known capability values.

---

## 11. Testing approach

- **TDD** on the pure modules:
  - `VioletClient` parse/normalize — against `/test/fixtures/getReadings.all.json` (captured real payload).
  - `FeatureDetector` — asserts correct feature set from representative payloads (chlorine-only, salt, multi-sensor, missing sensors).
  - `Freshness` — pump on/off, warmup boundary, retain-last-value behaviour.
- **Live smoke test** via `homey app run` against `demo.myViolet.de` (no auth) and the user's `violet` host.

---

## 12. M0 concrete inventory

**Custom capabilities to define:** `measure_ph`, `measure_orp`, `measure_chlorine`, `pump_running`, `measurements_fresh` — each with **`insights: true`** + `insightsTitle`. (`measure_temperature` is standard, used as primary + `.owN` sub-instances; logs to Insights by default.)

**Device settings (M0):**
- `host` (text)
- `writeUsername` (text, optional)
- `pollIntervalSeconds` (number, default 300, range 60–900)
- `pumpWarmupSeconds` (number, default 120)
- `waterTempChannel` (dropdown, OK channels + "auto")
- feature-group override(s) — at least `group_chlorine` (Auto/Force/Hide) as the M0 example; full set in M2

**Device store:** `writePassword` (encrypted, hidden).

---

## 13. Security notes

- The write BasicAuth credential is the controller's user/password; it lives only in the encrypted device store, never in source or plain settings.
- The credential shared during brainstorming was transmitted in cleartext; the user should rotate the Violet write-password before publication.
- Read path needs no credentials — keep it credential-free.

---

## 14. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| App scope | Full read + write, publishable (built in milestones) | user intent: official publication |
| Device model | **One "Pool" device** | simplest mental model; user choice |
| First milestone | **M0 foundation** | unblocks all others; forces correct dynamic-capability design |
| Feature model | **Auto-detect + override** | best out-of-box UX, still controllable |
| Water-temp UX | **Visible sub-sensors + picker** | user can identify the right channel from live values |
| Freshness | **Pump-on + warmup gate** | pump runs only hours/day; still-water probe values must not be trusted |
| Write in M0 | **Deferred to M3** | safety + faster path to monitoring value |
| Credentials | device **store**, encrypted | secrets must not be in plain settings/source |
| Insights | **all** capabilities logged (`insights: true` on customs) | user requirement: every value visible in Homey statistics |

---

## 15. Open items for later milestones (not blocking M0)

- Confirm `pot_value` definitively = free chlorine (ppm) against the official `getReadings.xlsx` parameter list.
- Stabilized vs. unstabilized chlorination (CYA correction on/off) — affects M1 LSI.
- PoolLab values manual vs. LabCOM cloud — M1 starts manual.
- Trademark/branding for the "Violet"/PoolDigital name — M4.
