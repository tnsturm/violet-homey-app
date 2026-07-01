# M2 field classification — getReadings?ALL → capabilities (spec raw material)

- **Date:** 2026-07-01
- **For:** Milestone M2 (full reads + feature groups)
- **Provenance:** produced by a 7-agent classification workflow (6 parallel bucket classifiers + 1 synthesis/completeness-critic), grounded against `lib/FeatureDetector.js` + `lib/Capabilities.js`. Seeds `docs/superpowers/specs/2026-07-01-violet-homey-app-m2-full-reads-design.md`.
- **Scope decision (user, 2026-07-01):** "curated parity" — surface what a pool owner monitors; diagnostics/aux hidden by default; skip pure noise. Polled alarms **in** M2. Optional data families **in**: dosing consumption, equipment runtimes, system-diagnostics group (hidden). Aux relays/inputs **out** of M2.

---

# M2 Design-Spec Seed: Full-Reads Field → Capability Map

**M0/M1 baseline (verified):** already delivered = `measure_temperature` (+ `.owN`), `measure_ph`, `measure_orp`, `measure_chlorine`, `pump_running`, `measurements_fresh`, `measure_lsi`, `alarm_water_balance`. `FeatureDetector.detectFeatures` already emits `{chlorine, electrolysis, heater, solar, light, cover, refill, pvSurplus, okTempChannels}` — M2 reuses those flags. `FEATURE_CAPABILITY` in `Capabilities.js` currently maps only `chlorine → measure_chlorine`; M2 extends that table + the auto/force/hide override plumbing (`desiredFeatureCapabilities` already supports it).

## 1. Proposed feature groups

Default modes: **auto** = show iff detected; **force** = always; **hide** = opt-in only. Diagnostic/aux groups default **hide**.

| # | Group | Contributes (capability ids) | Detection | Default | M0/M1? |
|---|---|---|---|---|---|
| 1 | Core Water Chemistry | measure_ph, measure_orp, measure_chlorine, measure_lsi, alarm_water_balance | detectFeatures().chlorine | force | ✅ |
| 2 | Temperature | measure_temperature (+ .owN) | okTempChannels.length>0 | auto | ✅ |
| 3 | Pump & Circulation | pump_running ✅, **measure_pump_speed_stage** (enum 0–3), **alarm_pump_fault** (PUMPSTATE), **eco_active** | 'PUMP' in raw | force/auto | partial |
| 4 | Heating (Solar) | **solar_active**, alarm_solar_fault | detectFeatures().solar | auto | new |
| 5 | Heating (Heater) | **heater_active**, alarm_heater_fault | detectFeatures().heater | auto | new |
| 6 | Backwash | **backwash_active**, backwash_step, backwash_schedule, **alarm_omni_valve** (BACKWASH_OMNI_STATE) | 'BACKWASH' in raw | auto | new |
| 7 | Cover | **cover_state** (enum OPEN/CLOSED/MOVING/STOPPED) | detectFeatures().cover | auto | new |
| 8 | Lighting | **light_on** (LIGHT>0), optional light_scene | detectFeatures().light | auto | new |
| 9 | Water Refill | **refill_active** (REFILL_STATE) | detectFeatures().refill | auto | new |
| 10 | Overflow Tank | **alarm_overflow_dryrun**, **alarm_overflow_overfill**, overflow_refill_active | any OVERFLOW_* non-default | auto (gated) | new |
| 11 | BathingAI (Water Level) | **measure_water_level** (%), bathing_pump_active, bathing_surveillance | BATHING_AI_SYSTEM_BOOT===1 | auto | new |
| 12 | Energy / PV | **pv_surplus_active** | detectFeatures().pvSurplus | auto | new |
| 13 | Dosing (per ch CL/ELO/ELO_REV/PHM/PHP/FLOC) | **measure_dosing_days_left.<ch>**, **measure_dosing_daily_ml.<ch>**, **alarm_dosing_blocked.<ch>**, dosing_active.<ch> | DOS_n_<ch>_USE==='1' | auto per channel | new |
| 14 | Runtime Counters *(diag)* | runtime_pump/heater/solar/eco (string or parsed) | any *_RUNTIME | **hide** | new |
| 15 | Analog Inputs *(diag)* | measure_generic.adcN (non-zero only) | ADCn_value !== 0 | **hide** | new |
| 16 | Flow/Impulse *(diag)* | measure_generic.impN | typeof IMPn_value==='number' | **hide** | new |
| 17 | Aux Outputs OMNI/EXT *(diag)* | onoff.omni_dcN / onoff.extB_N (ever-active only) | channel ever ===1 | **hide** | new |
| 18 | Digital Inputs *(diag)* | booleans, owner-labelled | opt-in only | **hide** | new |
| 19 | Controller Diagnostics/System *(diag)* | measure_temperature.cpu/.cpu_carrier, mem_pct, load, cpu_uptime, config_change_marker, alarm_controller_fault (M4) | SYSTEM_* present | **hide** | new |
| 20 | Device Info *(settings)* | firmware SW_VERSION/SW_VERSION_CARRIER/HW_VERSION_CARRIER/HW_SERIAL_CARRIER | present | settings-only | new |

Groups 3–13 = curated owner-facing (M2 core). 14–20 = diagnostics/aux, hidden by default. **Per-install detection gating (`_USE==='1'` / `_state==='OK'` / non-zero-ever) is the single most important tile-explosion control** — without it a fully-wired controller balloons to 100+ dead tiles.

## 2. Skip list (tier-4 noise)

- **Duplicate aliases** (map canonical, drop alias): `CPU_TEMP`=SYSTEM_cpu_temperature, `CPU_TEMP_CARRIER`=SYSTEM_carrier_cpu_temperature, `SYSTEM_MEMORY`=SYSTEM_memoryusage, `fw`=SW_VERSION.
- **Placeholder/dead:** `onewireNromcode` ("000000000000"), `PUMP_RPM_0..3_LAST_ON/OFF` (all 00:00:00, wall-clock).
- **Raw actuator timestamps** (`*_LAST_ON/_LAST_OFF` unix, no tile value): all except pump's LAST_ON (freshness).
- **Config/setpoints:** `HEATER_POSTRUN_TIME`, `MAX_REFILL_TIME`, `BATHING_AI_START_LEVEL`, `DMX_SCENE1..12`, `DOS_n_*_TYPE`.
- **Transient sequencing flags:** `BACKWASH_DELAY_RUNNING`, `BACKWASH_DELAY_TIMESTAMP`, `BACKWASH_OMNI_MOVING`, `LAST_MOVING_DIRECTION`.
- **Installer diagnostics/limit switches:** `OPEN/STOP/CLOSE_CONTACT`, `pump_rs485_pwr`, `DOS_2_CURRENT_POLARITY`.
- **Unlabelled generic inputs / rule internals:** `INPUT1..12`, `INPUT_CE1..4`, `INPUTz1z2`, `DIGITALINPUTRULE_STATE_*`, `DIGITALINPUTRULE_*_STOPWATCH*` (negative epoch garbage).
- **Trend extrema** (redundant with Insights): `pH/orp/pot/onewireN _value_min/max`.
- **Redundant clock:** `date`, `time` (use CURRENT_TIME_UNIX).

## 3. Alarm candidates

| Source | Capability | Semantics | Tier | Confidence |
|---|---|---|---|---|
| DOS_n_<ch>_STATE array | alarm_dosing_blocked.<ch> | true when length>0 (BLOCKED_BY_MAX_AMOUNT ⇒ dosing halted, chemistry drifts); surface raw reason string | 1 | High |
| DOS_n_<ch>_REMAINING_RANGE | alarm_dosing_low.<ch> (or Flow trigger on days_left) | true when days ≤ threshold (default ~7d); prefer configurable Flow trigger | 1 | High |
| OVERFLOW_DRYRUN_STATE | alarm_overflow_dryrun | true when ON — pump/refill dry = equipment risk | 1 | High |
| OVERFLOW_OVERFILL_STATE | alarm_overflow_overfill | true when ON — flood risk | 2 | High |
| BACKWASH_OMNI_STATE | alarm_omni_valve | true when !=='OK' — stuck multiport valve (non-OK vocab ⚠) | 2 | Med |
| PUMPSTATE/SOLARSTATE/HEATERSTATE arrays | alarm_pump/solar/heater_fault OR one shared alarm_controller_fault | any queue length>0 (content strings ⚠, empty in fixture) | 2–3 | Med |
| last_error_id | alarm_controller_fault (**defer M4**) | derive from configurable "healthy" value (likely 0); do NOT treat every nonzero as critical | 3 | Low |
| onewireN_freezecount (delta) | alarm_frost (**defer M4**) | delta>0 = frost-protection trip (meaning ⚠) | 3 | Low |
| onewireN_faultcount (delta) | alarm_temp_sensor_fault (**defer M4**) | delta>0 = degraded sensor/bus | 3 | Med |

**Recommendation:** M2 ships the *confirmed, per-install-gated* alarms (dosing blocked, dosing low, overflow dry-run/overfill, OMNI valve). The *shared controller-fault*, `last_error_id`, `freezecount`/`faultcount`-derived alarms defer to **M4** pending the Violet error-code table + STATE-string vocabulary from real hardware.

## 4. String / enum-state handling

Homey has no native enum-*sensor* tile, but supports custom `enum`/`string`/`boolean` capabilities.

| Field | Approach |
|---|---|
| COVER_STATE | custom `enum` cover_state (OPEN/CLOSED/MOVING/STOPPED) — confirm full set on HW |
| REFILL_STATE, OVERFLOW_REFILL_STATE, BATHING_AI_*_STATE | map to boolean (ON→true) |
| OVERFLOW_DRYRUN_STATE, OVERFLOW_OVERFILL_STATE | map to alarm boolean (ON→alarm) |
| BACKWASH_OMNI_STATE | map to alarm boolean (!=='OK'→alarm) |
| PUMPSTATE / SOLARSTATE / HEATERSTATE (**arrays**) | alarm boolean (length>0); optional companion string of joined messages |
| DOS_n_<ch>_STATE (**array**) | alarm boolean (length>0) + raw reason string |
| BACKWASH_STATE (status string) | string cap verbatim OR parse `NEXT_BW_IN N` → days_until_backwash |
| PUMP_RPM_0..3 (one-hot) | collapse to one enum/measure pump_speed_stage (0–3) |
| LIGHT (numeric scene idx) | boolean light_on (>0) + optional enum light_scene — NOT "brightness" |
| CPU_UPTIME / *_RUNTIME (duration str) | string cap verbatim, or parse to seconds/hours |
| SW_VERSION*, HW_* | device-settings metadata, not capabilities |

**Parser rule:** branch on `Array.isArray()` before interpreting any `*STATE` field — arrays are fault queues (→alarm), strings are on/off/status (→boolean/string).

## 5. Open questions (confirm against real hardware during SDD live-test)

1. **LIGHT=4** — scene index vs channel selector (10h runtime rules out brightness). → M2 exposes `light_on` (>0) only; scene enum deferred.
2. **PUMP_RPM_0..3** — Off+3 speeds or 4 speeds? labels? → expose stage index (generic labels), refine later.
3. **ADC1..6 / IMP1..2** — meaning + unit (flow m³/h?). → hidden diagnostics, unitless.
4. **BATHING_AI_LAST_LEVEL** absolute %; SURVEILLANCE_STATE meaning.
5. **BACKWASH_OMNI_STATE** non-OK vocabulary.
6. ***STATE array content strings** (empty in fixture) — shared vs per-actuator alarm.
7. **last_error_id** code table + healthy sentinel → alarm deferred to M4.
8. **onewireN_freezecount** meaning → alarm deferred to M4.
9. **DOS_n_<ch>_TOTAL_CAN_AMOUNT_ML** used-vs-remaining → canister-ml tile deferred; REMAINING_RANGE covers owner need.
10. **DOS_n_<ch> level 2 vs 1** → dosing_active = >0.
11. **EXT1/EXT2 mixed type** (string "1" vs number 0) → normalize `String(v)==='1'` (resolved).
12. **DOS_n_<ch>_LAST_CAN_RESET is ms** (÷1000) unlike LAST_ON/OFF (resolved).
13. **REMAINING_RANGE suffix** — always `Nd`? handle `Nw`/`Nm`.
14. **Runtime reset semantics** (daily vs since-boot vs lifetime) — affects graphability of parsed runtimes.
15. **MEMORY_USED / LOAD_AVG / SYSTEM_memoryusage units**.

## 6. Capability-count estimate (representative install: ~2 temp channels, dosing CL/PHM/FLOC, solar+heater+cover+refill+light+overflow+bathing present)

| | Tier 1 | Tier 1+2 | Tier 1+2+3 |
|---|---|---|---|
| Owner-facing tiles shown | ~21 | **~40** | ~43 shown + ~15 hidden-diag |

- Tier 1 (~21) = clean core dashboard. **Tier 1+2 (~40) = the natural M2 target, provided per-install gating works.** Tier-3 diagnostics stay hidden (opt-in). Ship groups 1–13 (tier 1+2) with strict gating; defer derived/controller-fault alarms to M4.

## 7. Cross-classifier consistency flags

- **REFILL vs REFILL_STATE** — same signal, two encodings; use REFILL_STATE only (avoids mixed-type trap), one tile.
- ***STATE overloaded** — arrays (fault queues) vs status strings; parser branches on Array.isArray().
- **SYSTEM_* vs CPU_TEMP*/SYSTEM_MEMORY/fw duplicates** — one measure + one skip; SYSTEM_* canonical, alias fallback, never a second capability.
- **onewireN_faultcount/freezecount** — raw is cumulative (not a live tile); the derived *delta* is the alarm artifact.
- No hard contradictions found across the 6 classifiers.
