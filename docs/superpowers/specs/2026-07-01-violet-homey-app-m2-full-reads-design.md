# Violet Homey App — M2 Full Reads & Feature Groups (Design Spec)

- **Date:** 2026-07-01
- **Status:** Approved design (pending written-spec review)
- **Project:** Homey Pro app for the PoolDigital "Violet" pool controller
- **This spec covers:** Milestone **M2** only. Builds on M0 (foundation) and M1 (LSI).
- **Field raw material:** `docs/superpowers/notes/2026-07-01-m2-field-classification.md` (exhaustive per-field classification of `getReadings?ALL`, produced by a 7-agent classification pass). This spec cites it rather than repeating all ~130 rows.

---

## 1. Context & goals

M0 delivered the foundation (pairing, polling, pump-aware freshness, dynamic-capability architecture) wiring only the *core* readings (pH, ORP, chlorine, temperature, pump, freshness). M1 added the LSI safety net. **M2 completes read coverage**: it maps the remaining *sensible* values from

```
GET http://<host>/getReadings?ALL      (no authentication)
```

into hardware-detected **feature groups**, reusing the existing pure `/lib` modules and the pump-aware freshness signal. M2 is **read-only**; write/control is M3, and inbound push alarms are M4.

**Scope decision (user, 2026-07-01): "curated parity".** Surface what a pool owner actually monitors; put diagnostics/aux behind opt-in groups hidden by default; skip pure-noise fields. The explicit target is **value parity with the manual Virtual Device** the user feeds via Advanced Flows today, so that device + its flows can be retired.

**Selected optional data families (user):** dosing consumption, equipment runtimes, a hidden system-diagnostics group. **Excluded from M2:** generic aux relays / digital inputs (EXT/OMNI/INPUT) — deferred, not surfaced.

**Polled alarms are in scope (user):** fault/consumable states derived from `getReadings` become `alarm_*` tiles + edge-triggered Flow triggers (following M1's `alarm_water_balance` pattern). The *inbound push* NOTIFY listener remains M4 — a different mechanism.

### Baseline reused from M0/M1 (verified)

Already delivered: `measure_temperature` (+ `.owN` sub-sensors + picker), `measure_ph`, `measure_orp`, `measure_chlorine`, `pump_running`, `measurements_fresh`, `measure_lsi`, `alarm_water_balance`. `FeatureDetector.detectFeatures` already returns `{chlorine, electrolysis, heater, solar, light, cover, refill, pvSurplus, okTempChannels}`. `Capabilities.desiredFeatureCapabilities` already implements the auto/force/hide override; `FEATURE_CAPABILITY` currently maps only `chlorine → measure_chlorine`. **M2 extends these; it does not rebuild them.**

---

## 2. Scope

**In scope**
- New feature groups (§4) for: Pump & circulation details, Heater, Solar, Backwash, Cover, Lighting, Water refill, Overflow tank, Water level (BathingAI), Energy/PV, Dosing (per active channel), and a hidden System-diagnostics group.
- New custom capabilities (§5) — read-only, `insights: true`.
- Hardware-adaptive detection + auto/force/hide override per group (§6), churn-free.
- Polled `alarm_*` capabilities + edge-triggered Flow triggers (§7).
- Settings additions: per-group overrides, canister-low threshold, advanced-diagnostics enable (§8).
- Pure parsers (duration→hours, range→days, `*STATE` array/string branch) in `/lib`, TDD-tested (§10).

**Out of scope (deferred)**
- Any write/control (M3) — actuator capabilities ship **read-only**; M3 layers setters on top with no rework.
- Inbound push NOTIFY listener (M4).
- Controller-error alarm from `last_error_id`, `*STATE`-array shared controller-fault alarm, and `freezecount`/`faultcount`-derived alarms — **deferred to M4** pending the Violet error-code table + STATE-string vocabulary (see §7, §11). `last_error_id` is still exposed as a plain diagnostic value in M2.
- Generic aux I/O (EXT/OMNI/INPUT/ADC/IMP), DMX scenes, digital-input rules — excluded from M2 (user choice); noise per §2 of the notes.
- Light *scene* semantics — M2 ships `light_on` only (LIGHT=4 meaning unconfirmed, §11).

---

## 3. Architecture

Preserve the M0 principle: **all non-trivial logic is pure `/lib`; `device.js` stays a thin runtime glue.**

```
/lib/
  VioletClient.js     ← EXTEND parseReadings: normalize the curated M2 fields
  FeatureDetector.js  ← EXTEND detectFeatures: add group flags (history-based, §6)
  FeatureGroups.js    ← NEW (pure): the declarative group→capability registry (§4,§5)
                        + pure parsers parseDurationToHours / parseRangeToDays
                        + parseStateField (Array.isArray branch, §9)
  Capabilities.js     ← EXTEND FEATURE_CAPABILITY + buildCapabilityUpdates to
                        consume the registry
/.homeycompose/capabilities/*.json  ← NEW custom capability definitions (§5)
/.homeycompose/flow/triggers/*.json ← NEW edge-triggered alarm Flow cards (§7)
/drivers/pool/
  device.js           ← reconcile + apply, driven by the registry (thin)
  driver.settings.compose.json ← NEW per-group overrides + thresholds (§8)
/test/
  fixtures/           ← ADD a salt/electrolysis fixture + a minimal-pool fixture
  FeatureGroups.test.js, FeatureDetector.test.js (extend), Capabilities.test.js (extend)
```

**Declarative group registry (`lib/FeatureGroups.js`).** One data structure is the single source of truth for detection, reconciliation, and per-poll value-building:

```
GROUP = {
  id,                       // e.g. 'heater', 'dosing'
  detect(raw) -> boolean,   // hardware-adaptive presence (§6)
  defaultMode,              // 'auto' | 'force' | 'hide'
  capabilities: [           // each capability this group contributes
    { capId, field|derive, type, parse?, freshGated?, subKeys? }
  ],
}
```

`device.js` iterates the registry each poll: for each group, resolve mode (override ?? default) ∧ detection → desired capability set → `addCapability`/`removeCapability` reconcile (as M0 already does for chlorine + temp sub-sensors) → then `buildCapabilityUpdates` writes values. This keeps `device.js`'s new code minimal and every mapping unit-testable against fixtures.

**No new attack surface (CLAUDE.md §5).** M2 is pure reads over the existing credential-free `getReadings?ALL` path — no writes, no network listener, no new credential handling, no new untrusted input beyond payload fields already fetched. No STRIDE threat model required; the read path stays credential-free.

---

## 4. Feature groups & detection

Owner-facing groups (Tier 1+2) default **auto/force**; diagnostics group defaults **hide**. Full field-level detail: notes §1–§2.

| # | Group | Capabilities (see §5) | Detection rule | Default |
|---|---|---|---|---|
| 3 | Pump & circulation | `pump_speed_stage`, `eco_active` | `PUMP` present (always) → force; eco auto | force/auto |
| 4 | Solar | `solar_active` | history: `SOLAR===1 ∨ hoursOf(SOLAR_RUNTIME)>0 ∨ SOLAR_LAST_ON>0` | auto |
| 5 | Heater | `heater_active` | history: `HEATER===1 ∨ hoursOf(HEATER_RUNTIME)>0 ∨ HEATER_LAST_ON>0` | auto |
| 6 | Backwash | `backwash_active`, `alarm_omni_valve` | history: `BACKWASH_LAST_ON>0 ∨ hoursOf(BACKWASH_RUNTIME)>0` | auto |
| 7 | Cover | `cover_state` (enum) | `COVER_STATE` present & non-empty | auto |
| 8 | Lighting | `light_on` | history: `LIGHT>0 ∨ LIGHT_LAST_ON>0 ∨ hoursOf(LIGHT_RUNTIME)>0` | auto |
| 9 | Water refill | `refill_active` | history: `REFILL_LAST_ON>0 ∨ hoursOf(REFILL_RUNTIME)>0 ∨ REFILL_STATE==='ON'` | auto |
| 10 | Overflow tank | `alarm_overflow_dryrun`, `alarm_overflow_overfill`, `overflow_refill_active` | any `OVERFLOW_*_STATE` present | auto |
| 11 | Water level (BathingAI) | `measure_water_level` | `BATHING_AI_SYSTEM_BOOT===1` | auto |
| 12 | Energy / PV | `pv_surplus_active` | `PVSURPLUS` present | auto |
| 13 | Dosing (per channel) | `measure_dosing_days_left.<ch>`, `measure_dosing_daily_ml.<ch>`, `alarm_dosing_blocked.<ch>`, `alarm_dosing_low.<ch>` | per channel `DOS_n_<ch>_USE==='1'` | auto per channel |
| — | Equipment runtimes | `runtime_pump`, `runtime_heater`, `runtime_solar` | parent group detected | (part of parent) |
| 19 | System diagnostics *(hidden)* | `measure_system_cpu_temperature`, `measure_system_memory`, `system_uptime`, `last_error_id`, `controller_firmware` | `SYSTEM_*` present | **hide** |

(`hoursOf(x)` above is the pure `parseDurationToHours(x)` parser of §5/§10; `>0` means the actuator has non-zero cumulative runtime.)

**Channel keys** (`<ch>`): `cl` (chlorine), `elo` (electrolysis/salt), `elorev` (electrolysis reverse), `phm` (pH-minus), `php` (pH-plus), `floc` (flocculant). Detected independently via `DOS_n_<ch>_USE`.

**Detection philosophy.** For features with a config flag (`DOS_*_USE`), that flag is authoritative. For actuators without one, detection is **history-based** (currently active OR ever-ran). History is **monotonic** — once `*_LAST_ON>0`/`*_RUNTIME≠0`, it stays — so detection only flips false→true, which means **capabilities are never auto-removed after being added** (avoids the documented "removeCapability breaks user Flows" hazard). The only removals happen when the user sets a group to **Hide**. The "installed but never ran this season" edge case is handled by the **Force** override.

---

## 5. Capability inventory (new custom capabilities)

All are custom, `getable:true`, `setable:false`, `uiComponent:"sensor"`, `insights:true` with `insightsTitle`, bilingual `title` (en/de). Numbers carry `units`/`decimals`. Read-only in M2; M3 adds control.

**Numbers (`measure`/number):**
| capId | unit | dec | source / derivation |
|---|---|---|---|
| `pump_speed_stage` | — | 0 | index 0–3 from one-hot `PUMP_RPM_0..3` (0=off) |
| `measure_water_level` | % | 0 | `BATHING_AI_LAST_LEVEL` |
| `measure_dosing_days_left` (sub `.<ch>`) | d | 0 | `parseRangeToDays(DOS_n_<ch>_REMAINING_RANGE)` ("37d"→37) |
| `measure_dosing_daily_ml` (sub `.<ch>`) | mL | 0 | `Number(DOS_n_<ch>_DAILY_DOSING_AMOUNT_ML)` |
| `runtime_pump` / `runtime_heater` / `runtime_solar` | h | 1 | `parseDurationToHours(*_RUNTIME)` |
| `measure_system_cpu_temperature` *(diag)* | °C | 1 | `SYSTEM_cpu_temperature` (canonical; `CPU_TEMP` alias fallback) |
| `measure_system_memory` *(diag)* | % | 0 | `Number(MEMORY_USED)` |
| `last_error_id` *(diag)* | — | 0 | `last_error_id` (value only; alarm deferred to M4) |

**Booleans (sensor):** `eco_active`, `solar_active`, `heater_active`, `backwash_active`, `light_on` (LIGHT>0), `refill_active` (REFILL_STATE==='ON'), `overflow_refill_active`, `pv_surplus_active`, `dosing_active` (sub `.<ch>`, optional/Tier-2).

**Enum:** `cover_state` — values `{open, closed, moving, stopped}` (from `COVER_STATE`; unknown values pass through as a best-effort mapping, confirmed on HW §11).

**Strings (no insights):** `system_uptime` *(diag)* (`CPU_UPTIME` verbatim), `controller_firmware` *(diag)* (`SW_VERSION` [+ carrier]).

**Alarms (boolean `alarm_*`, insights + edge trigger §7):** `alarm_dosing_blocked` (sub `.<ch>`), `alarm_dosing_low` (sub `.<ch>`), `alarm_overflow_dryrun`, `alarm_overflow_overfill`, `alarm_omni_valve`.

**Sub-capabilities.** Per-channel dosing caps and per-sensor items use Homey instance dot-notation (`measure_dosing_days_left.cl`), added at runtime with a per-instance title (mirroring M0's `measure_temperature.owN`). Custom-capability sub-instances are validated during SDD (`homey app validate`); if unsupported, fall back to flat per-channel capability ids.

Each new capability JSON is registered in `.homeycompose/capabilities/README.md` with its M2 spec §-ref.

---

## 6. Detection, reconciliation & override

- **Override model** (as M0): each owner-facing group has a device setting with **Auto / Force / Hide**. `desired = (mode==='force') ∨ (mode==='auto' ∧ detect(raw))`, `hide` ⇒ never. Reused verbatim from `desiredFeatureCapabilities`, extended to all groups.
- **Reconcile each poll** (as M0): iterate the registry; `addCapability` when desired & absent, `removeCapability` only when a **Hide** override (or channel `_USE` flips to `0`) makes it undesired. History-based detection guarantees no churn from transient value blips (§4).
- **Diagnostics group** is gated behind a single **"Show advanced diagnostics"** toggle (default off) → its capabilities are only added when enabled (default Hide).
- **Fresh-gating:** the new values are **status/actuator** readings (pump speed, actuator on/off, water level, runtimes, canister days) — these are meaningful regardless of circulation, so they **update every poll** (like `measure_temperature`/`pump_running`), *not* fresh-gated. Only probe chemistry stays fresh-gated (unchanged M0/M1 behaviour).

---

## 7. Alarms & Flow triggers

Following M1's `alarm_water_balance`: each alarm is a read-only boolean capability (`insights:true`) plus **one edge-triggered device Flow trigger** that fires only on the false→true transition (in-memory last-state per alarm, mirroring `_lastLsiBand`).

| Alarm capability | True when | Flow trigger |
|---|---|---|
| `alarm_dosing_blocked.<ch>` | `DOS_n_<ch>_STATE` array length > 0 (e.g. `BLOCKED_BY_MAX_AMOUNT`) | "Dosing blocked" (token: channel, reason string) |
| `alarm_dosing_low.<ch>` | `parseRangeToDays(REMAINING_RANGE) ≤ threshold` (setting, default 7 d) | "Dosing chemical low" (token: channel, days left) |
| `alarm_overflow_dryrun` | `OVERFLOW_DRYRUN_STATE==='ON'` | "Overflow dry-run" |
| `alarm_overflow_overfill` | `OVERFLOW_OVERFILL_STATE==='ON'` | "Overflow overfill" |
| `alarm_omni_valve` | `BACKWASH_OMNI_STATE!=='OK'` | "Backwash valve fault" (token: state) |

Alarms are **per-install gated** (only present when their group/channel is detected). Alarm capabilities are **not fresh-gated** (a blocked doser / dry-run is true regardless of circulation).

**Deferred to M4** (needs hardware confirmation): `alarm_controller_fault` from `last_error_id`, the shared `*STATE`-array controller-fault alarm, and `freezecount`/`faultcount`-delta alarms. See §11.

---

## 8. Settings additions (`driver.settings.compose.json`)

Nested under a settings `group` (as M1's `group_lsi`), added to the existing settings:
- **Per-group override** — one control each for: pump/eco, solar, heater, backwash, cover, lighting, refill, overflow, water level, PV. Values Auto / Force / Hide. **Piloted as `type:"radio"`** (not `dropdown`) so the selection renders inline on the Homey iOS app (resolves the open iOS-dropdown follow-up #1); verified on-device during SDD, fall back to `dropdown` if `radio` misbehaves.
- **`dosing_low_threshold_days`** (number, default 7, range 1–60) — canister-low alarm threshold.
- **`show_advanced_diagnostics`** (checkbox, default false) — gates the System-diagnostics group (§6).

Existing settings (`host`, `writeUsername`, `pollIntervalSeconds`, `pumpWarmupSeconds`, `waterTempChannel`, `group_chlorine`, `group_lsi`/chem) are unchanged. (`group_chlorine` may be migrated into the new per-group block for consistency, keeping its id.)

---

## 9. State-string / enum handling

The pure `parseStateField(value)` branches on `Array.isArray(value)`:
- **Array** (`PUMPSTATE`, `SOLARSTATE`, `HEATERSTATE`, `DOS_*_STATE`) = a **fault queue** → `length>0` drives a boolean/alarm; raw contents surfaced as a reason token where used.
- **String** (`REFILL_STATE`, `OVERFLOW_*_STATE`, `BATHING_AI_*_STATE`, `BACKWASH_OMNI_STATE`, `COVER_STATE`) = on/off/status → boolean (`==='ON'`), alarm (`==='ON'` / `!=='OK'`), or enum (`cover_state`).

`REFILL` (numeric) and `REFILL_STATE` (string) are the **same signal**; only `REFILL_STATE` is mapped (one tile), avoiding the mixed-type trap. Duplicate system aliases (`CPU_TEMP`, `SYSTEM_MEMORY`, `fw`) map to nothing — the `SYSTEM_*` key is canonical with the alias as a fallback.

---

## 10. Testing (TDD)

Pure-module unit tests via `node --test` (as M0/M1), added before implementation:
- **Parsers:** `parseDurationToHours` ("19h 23m 23s"→19.39; "00h 00m 00s"→0), `parseRangeToDays` ("37d"→37; tolerant of `Nw`/`Nm`), `parseStateField` (array vs string branch).
- **`detectFeatures` (extended):** per group, from the full fixture and the new fixtures — heater/solar/cover/light/refill history detection, dosing per-channel `_USE`, BathingAI, PV.
- **`FeatureGroups` registry:** `desiredCapabilities({features, overrides})` for auto/force/hide across all groups; per-channel dosing expansion.
- **`buildCapabilityUpdates` (extended):** correct values for the new caps; alarms derive correctly; status caps update every poll (not fresh-gated); probes still fresh-gated.
- **Fixtures:** existing `getReadings.all.json` (full-featured); **new** `salt-electrolysis.json` (DOS_2_ELO_USE=1, no liquid CL) and `minimal-pool.json` (pump + one temp only) to prove gating.

**Dev-gate:** `npx homey app validate --level=debug` must PASS. **Live smoke-test** during SDD against the real `violet` host + `demo.myViolet.de`, confirming the §11 open questions on hardware (as M0/M1 did).

---

## 11. Open questions — confirm on hardware during SDD

These do **not** block the design; M2 is built defensively and confirmed during the live smoke-test (notes §5 has the full list). The ones that shape user-facing output:
1. **LIGHT=4** — scene/channel index, not brightness → M2 ships `light_on` (>0) only; scene enum deferred.
2. **PUMP_RPM stage mapping** — expose raw stage index 0–3 (generic), confirm Off/speed labels later.
3. **COVER_STATE full enum** — confirm the value set (OPEN/CLOSED/MOVING/STOPPED?) before finalizing `cover_state` values.
4. **BACKWASH_OMNI_STATE non-OK vocabulary** — confirm before titling `alarm_omni_valve`.
5. **REMAINING_RANGE suffix** — confirm `Nd` only vs `Nw`/`Nm`; parser tolerates all.
6. **Runtime reset semantics** — daily vs since-boot vs lifetime; affects how `runtime_*` graphs read (label accordingly).
7. **last_error_id table & healthy sentinel**, ***STATE array strings**, **freezecount/faultcount** — all only needed for the **M4-deferred** alarms; `last_error_id` shipped as a value only.

---

## 12. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Scope | **Curated parity** | surface owner-relevant values; diagnostics/aux opt-in; retire the manual Virtual Device |
| Aux I/O (EXT/OMNI/INPUT/ADC/IMP) | **Excluded from M2** | unlabelled, device-specific; noise for a curated app (user choice) |
| Detection for actuators | **History-based (monotonic) + override** | hardware-adaptive AND churn-free (never auto-removes → won't break Flows) |
| Capability model | **Custom read-only (`setable:false`)**, M3 adds control | consistent with M0 `pump_running`; no rework when control lands |
| Group architecture | **Declarative registry in `lib/FeatureGroups.js`** | one testable source of truth; keeps `device.js` thin (CLAUDE.md §2) |
| Polled alarms | **In M2** as `alarm_*` + edge Flow triggers | pure `getReadings` derivations; M1 `alarm_water_balance` precedent |
| Controller-error alarm | **Deferred to M4** (value exposed now) | error-code table + healthy sentinel unknown; can't alarm reliably (user-approved) |
| Enum/string states | **`Array.isArray` branch** (queue→alarm, string→boolean/enum) | the `*STATE` name is overloaded across two encodings |
| Fresh-gating | **Status/actuator caps update every poll**; only probes fresh-gated | actuator/consumable state is meaningful without circulation |
| iOS dropdown follow-up | **Pilot `radio` for group overrides** | may fix the iOS "-" rendering; verify on-device (fallback dropdown) |
| Insights | **all new caps `insights:true`** | user requirement (every value in Homey statistics) |

---

## 13. Deferred to later milestones (from M2 analysis)

- **M3 (write):** actuator control (pump/heater/solar/light/cover/dosing setpoints) layered onto the M2 read capabilities.
- **M4 (alarms):** `last_error_id` controller-fault alarm, `*STATE`-array shared fault alarm, `freezecount`/`faultcount`-delta alarms, "controller rebooted" (uptime reset) trigger — all pending the Violet error-code table + STATE vocabulary.
- **Later/optional:** light scene enum, per-stage pump runtimes, canister used-vs-remaining mL, generic aux I/O group, backwash schedule parsing (`NEXT_BW_IN N` → days-until-backwash).
