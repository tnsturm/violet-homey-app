# Violet Homey App — M1 LSI Flagship (Design Spec)

- **Date:** 2026-06-29
- **Status:** Approved design (pending written-spec review)
- **Project:** Homey Pro app for the PoolDigital "Violet" pool controller
- **This spec covers:** Milestone **M1** only. Builds on M0 (foundation, live on the user's Homey, `origin/main`). Later milestones are referenced for context but designed separately.
- **Predecessor spec:** `docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md`
- **Inputs folded in:** `docs/superpowers/notes/2026-06-26-m1-inputs.md` (M0 live-test findings).

---

## 1. Context & goals

M1 delivers the project's **flagship feature**: a live **Langelier Saturation Index (LSI)** water-balance safety net. The originating motivation is **copper-corrosion prevention** in the pool's heat exchanger / metal components, documented in the project handover. The app continuously recomputes the LSI from **live** pH + water temperature (from `getReadings`, verified in M0) combined with **slow-changing** chemistry values (calcium hardness, total alkalinity, cyanuric acid), classifies the result against an industry-standard band scheme, and raises a Homey Flow warning when the water turns corrosive or scale-forming.

**Value over a one-shot PoolLab measurement:** the LSI is recomputed every poll as live pH/temperature move, so the user sees the *current* balance and gets alerted to drift, not just a snapshot at test time.

M1 also performs a small, high-value **freshness refactor** flagged during M0 live testing (§10): derive pump warmup from the payload's `PUMP_LAST_ON` instead of in-memory state, which fixes both a clock-skew and an app-restart-reset weakness in one change.

### Confirmed inputs (from M0 + live testing)

| LSI input | Source | Status |
|---|---|---|
| pH | `pH_value` (live) | verified live in M0 |
| Water temperature (°C) | selected `onewireN_value` (live) | verified live in M0 (channel picker) |
| Calcium hardness | **manual device setting** (unit-selectable) | new in M1 |
| Total alkalinity | **manual device setting** (unit-selectable) | new in M1 |
| Cyanuric acid (CYA) | **manual device setting** (ppm) | new in M1 |
| TDS | **fixed constant 1000 ppm** (no field) | new in M1 |

`PUMP_LAST_ON` and `CURRENT_TIME_UNIX` are present in both the real Violet payload and the committed fixture (`test/fixtures/getReadings.all.json`), confirmed in the M1 inputs note.

---

## 2. Scope

**In scope**
- New pure module `lib/Lsi.js`: LSI computation (Carrier closed form), pH-dependent CYA correction, unit conversion to ppm CaCO₃, and classification.
- New custom capability `measure_lsi` (number, Insights-enabled), always present on the Pool device.
- New device settings: calcium hardness, total alkalinity (each with a unit dropdown), cyanuric acid, plus an informational LSI label (source + asymmetry + caveat).
- New Flow cards (the app's first): one device **trigger** "LSI warning" (edge-triggered, filterable, with tokens) and one **action** "Set water chemistry".
- Freshness refactor to `PUMP_LAST_ON` (`lib/VioletClient.js`, `lib/Freshness.js`, `drivers/pool/device.js`, tests).
- LSI fresh-gating: computed only while `measurements_fresh === true`; warnings suppressed while stale (M0 spec §7).
- Store description + in-app reference to the band source (per user requirement).
- Unit tests for all pure logic (TDD).

**Out of scope (deferred)**
- **LabCOM/PoolLab cloud auto-import → M6** (new milestone, added 2026-06-29). M1's manual settings + "Set water chemistry" action are the seam M6 plugs into.
- Configurable LSI thresholds, a "returned to balanced" recovery trigger, persisting the last band across restarts — only if requested later.
- Dosing / setpoint recommendations, any write to the controller (M3).
- Full store assets / long store description / branding (M5).

---

## 3. Architecture

Follows the M0 principle: all non-trivial logic is pure and lives in `/lib` (unit-tested against fixtures); `device.js` is thin glue.

```
/lib/
   Lsi.js              ← NEW, PURE: computeLSI, classifyLSI, toPpmCaCO3, carbonateAlkalinity
   VioletClient.js     ← MODIFY: parseReadings also returns pumpLastOn
   Freshness.js        ← MODIFY: isFresh derives from pumpLastOn + now (was pumpOnSince)
   Capabilities.js     ← MODIFY: buildCapabilityUpdates places measure_lsi (fresh-gated)
/drivers/pool/
   device.js           ← MODIFY: freshness refactor, read chem settings, compute+classify LSI,
                          edge-trigger the warning, register Flow cards & action listener
   driver.compose.json        ← MODIFY: add measure_lsi to capabilities + capabilitiesOptions
   driver.settings.compose.json ← MODIFY: chem settings + unit dropdowns + info label
/.homeycompose/
   app.json                         ← MODIFY: description mentions LSI + standard
   capabilities/measure_lsi.json    ← NEW
   flow/triggers/lsi_warning.json   ← NEW
   flow/actions/set_water_chemistry.json ← NEW
/test/
   Lsi.test.js         ← NEW
   Freshness.test.js   ← MODIFY (pumpLastOn + now; clamp test)
   VioletClient.test.js← MODIFY (pumpLastOn parsed)
   Capabilities.test.js← MODIFY (measure_lsi fresh-gated/null)
```

SDK specifics (Flow card registration, settings `label` type, device trigger/action patterns) are governed by the **homey-app** skill; live inspection via **homey-cli** against "Torstens Homey Pro" / the real Violet (host `violet`).

---

## 4. LSI computation (`lib/Lsi.js`, pure)

**Carrier closed-form** (more accurate and testable than pool lookup tables):

```
LSI = pH − pHs
pHs = (9.3 + A + B) − (C + D)

A = (log10(TDS) − 1) / 10                       TDS = 1000 (fixed) ⇒ A = 0.2
B = −13.12 × log10(tempC + 273.15) + 34.55      (absolute temperature, Kelvin)
C = log10(calciumHardness_ppm) − 0.4            (calcium hardness as CaCO₃)
D = log10(carbonateAlkalinity_ppm)              (carbonate alkalinity as CaCO₃)
```

**Carbonate alkalinity (pH-dependent CYA correction):** only carbonate alkalinity drives scaling/corrosion; cyanurate ions do not. Subtract the cyanurate contribution from total alkalinity:

```
carbonateAlkalinity = totalAlkalinity − CYA × 0.3877 × ionizedFraction
ionizedFraction     = 1 / (1 + 10^(6.88 − pH))
```

- `0.3877 = 50.04 / 129.08` — CaCO₃ equivalent weight (mg/meq) over CYA molar mass (g/mol), converting CYA ppm to CaCO₃-equivalent alkalinity.
- `6.88` — first dissociation pKa of cyanuric acid (cyanurate ⇌ cyanuric acid).
- Sanity check: at pH 7.6, `ionizedFraction ≈ 0.840`, so the factor ≈ `0.326` → ≈ ⅓ × CYA, matching the pool-industry "subtract ⅓ of CYA" rule of thumb — but pH-correct, hence closer to PoolLab's six-variable LSI.
- `carbonateAlkalinity` is clamped to a small positive floor (e.g. ≥ 1 ppm) before `log10` to avoid `log10(≤0)` when CYA is high relative to alkalinity.

**Unit conversion to ppm CaCO₃** (`toPpmCaCO3(value, unit)`), since calcium hardness and alkalinity are entered in a user-selectable unit:

| unit | factor to ppm CaCO₃ |
|---|---|
| `ppm` (mg/L as CaCO₃) | × 1 |
| `dH` (German degree) | × 17.848 |
| `fH` (French degree) | × 10 |

**`computeLSI({ pH, tempC, calciumHardnessPpm, totalAlkalinityPpm, cya })` → number | null**
Returns `null` if any **required** input (pH, tempC, calciumHardnessPpm, totalAlkalinityPpm) is missing or non-finite. CYA missing → treated as 0 (no correction). Callers pass already-ppm values (device.js converts via `toPpmCaCO3`).

---

## 5. Classification bands + sourcing

Per user decision: **official ANSI/PHTA/ICC-11** band scheme (formerly APSP-11). The balanced range is **asymmetric** (−0.3 … +0.5): a slightly positive LSI is considered safer because a thin scale layer protects surfaces, whereas corrosive water causes permanent damage.

**`classifyLSI(lsi)` → `{ band, direction, severity }`** (or `null` when `lsi` is `null`):

| LSI | band | direction | severity |
|---|---|---|---|
| `lsi < −0.5` | `severe_corrosive` | `corrosive` | `critical` |
| `−0.5 ≤ lsi < −0.3` | `corrosive` | `corrosive` | `warning` |
| `−0.3 ≤ lsi ≤ +0.5` | `balanced` | `balanced` | `ok` |
| `+0.5 < lsi ≤ +1.0` | `scaling` | `scaling` | `warning` |
| `lsi > +1.0` | `severe_scaling` | `scaling` | `critical` |

- Acceptable range −0.3…+0.5 is the ANSI/PHTA/ICC-11 standard. The `±` critical thresholds (−0.5 / +1.0) are the app's own severity escalation, derived from the classic Langelier interpretation (magnitude indicates aggressiveness) — documented as such, not attributed to the standard.

### 5.1 Material-effect rationale (for store text + UI)

- **Low / corrosive LSI** (water under-saturated with CaCO₃): dissolves calcium from cement-based finishes (plaster/grout) and corrodes metals — **copper**, iron, heaters and heat exchangers. The lower the LSI, the more aggressive. This is the project's primary risk.
- **High / scaling LSI** (over-saturated): precipitates CaCO₃ → scale on tile, plumbing and heater elements, clogged pipes, reduced heater efficiency.
- **Honesty caveat (DIN 19643):** the Langelier index describes the CaCO₃/CO₂ equilibrium and corrosion risk for cement-based materials and metals such as copper/iron; it is **not** a valid predictor of **stainless-steel** corrosion (which depends on alloy, chloride, pH, temperature). This caveat must appear where the LSI is explained.

### 5.2 Where the source is referenced (user requirement)

1. **Store description** (`.homeycompose/app.json` `description`): one concise sentence — live LSI safety net, classification per **ANSI/PHTA/ICC-11**. (The full long-form store text with source links is an M5 store-assets task.)
2. **App UI** — an informational `label` setting in the "Water chemistry (LSI)" settings group, bilingual, containing: the asymmetry explanation, the standard reference (ANSI/PHTA/ICC-11), and the DIN 19643 stainless-steel caveat. Exact text in §8.1.
3. **Spec** — see §14 References.

---

## 6. Capability `measure_lsi`

New custom capability, modeled on `measure_ph`:

```json
{
  "type": "number",
  "title": { "en": "LSI", "de": "LSI" },
  "uiComponent": "sensor",
  "getable": true,
  "setable": false,
  "insights": true,
  "insightsTitle": { "en": "LSI (water balance)", "de": "LSI (Wasserbalance)" },
  "decimals": 2
}
```

- Added **statically** to `drivers/pool/driver.compose.json` `capabilities` (flagship — always visible, not feature-gated).
- `setable: false` → only the app writes it (consistent with M0 `measure_*`).
- Value is `null` (GUI "–", Insights gap) when stale or inputs incomplete (§9), reusing the M0 clear-on-stale apply rule.

---

## 7. Flow cards (first in the app)

### 7.1 Trigger — "LSI warning" (device trigger card)

- **Edge-triggered:** fires only when the LSI band **changes into** a non-balanced band, never every poll. Implemented with a device trigger card (`getDeviceTriggerCard`, the M4-confirmed pattern).
- **Tokens:** `lsi` (number), `classification` (localized text, e.g. "corrosive"), `direction` (`corrosive`/`scaling`), `severity` (`warning`/`critical`).
- **Filter argument** (dropdown): `all` (any warning) · `corrosive` · `scaling` · `critical`. A `registerRunListener` returns true only when the fired event matches the selected filter.
- **Stale/incomplete suppression:** `lsi === null` ⇒ no band ⇒ never fires (M0 spec §7).

### 7.2 Action — "Set water chemistry"

- Writes calcium hardness, total alkalinity and CYA into the device settings (in each setting's currently-configured unit), via `device.setSettings(...)`.
- One card with three number arguments. This is the seam for automations and the future **M6 LabCOM** bridge to push values without a cloud client in M1.
- App/driver-level action card with a `device` selector (filter `driver_id=pool`); `registerRunListener` resolves `args.device` and applies the values, then they feed the next LSI computation.

Flow card titles/args/tokens are bilingual (en/de) inline in the compose JSON.

---

## 8. Device settings

Add a settings group **"Water chemistry (LSI)" / „Wasserchemie (LSI)"** to `drivers/pool/driver.settings.compose.json`:

| id | type | default | notes |
|---|---|---|---|
| `chem_info` | `label` | — | informational text (§8.1) |
| `chem_calcium_hardness` | number | (empty) | required for LSI |
| `chem_calcium_unit` | dropdown `ppm`/`dH`/`fH` | `ppm` | converts via `toPpmCaCO3` |
| `chem_total_alkalinity` | number | (empty) | required for LSI |
| `chem_alkalinity_unit` | dropdown `ppm`/`dH`/`fH` | `ppm` | converts via `toPpmCaCO3` |
| `chem_cya` | number (ppm) | `0` | pH-dependent correction; 0 ⇒ no correction |

Existing M0 settings (`host`, `pollIntervalSeconds`, `pumpWarmupSeconds`, `waterTempChannel`, `group_chlorine`, `writeUsername`) are unchanged. No TDS field (fixed 1000).

> The `label` settings type and whether it renders links must be confirmed via the homey-app skill during implementation; if links are not clickable in settings, the URL is shown as plain text and the clickable link lives in the store description.

### 8.1 Informational label text (bilingual)

> **de:** „Der LSI (Langelier-Sättigungsindex) bewertet die Kalk-/Korrosions-Balance des Wassers. Ausgeglichen ist −0,3 bis +0,5 (0 ideal) — der Bereich ist bewusst asymmetrisch: Ein leicht positiver Wert ist sicherer, weil eine dünne Kalkschicht schützt, während korrosives Wasser (Kupfer/Heizung!) bleibende Schäden verursacht. Einstufung nach ANSI/PHTA/ICC-11. Hinweis: Der Index gilt für das Kalk-Kohlensäure-Gleichgewicht und Metalle wie Kupfer/Eisen sowie zementgebundene Werkstoffe; für Edelstahl ist er laut DIN 19643 NICHT als Korrosions-Indikator geeignet."
>
> **en:** "The LSI (Langelier Saturation Index) rates the water's scaling/corrosion balance. Balanced is −0.3 to +0.5 (0 ideal) — deliberately asymmetric: a slightly positive value is safer because a thin scale layer protects surfaces, whereas corrosive water (copper/heater!) causes permanent damage. Classification per ANSI/PHTA/ICC-11. Note: the index applies to the calcium-carbonate/CO₂ equilibrium and metals such as copper/iron and cement-based materials; per DIN 19643 it is NOT a valid indicator for stainless-steel corrosion."

---

## 9. `device.js` wiring & edge-trigger

Per poll, after parse/detect/freshness:

1. Read chem settings; convert calcium & alkalinity to ppm via `toPpmCaCO3`.
2. `const lsi = fresh ? computeLSI({ pH, tempC: primaryChannel, calciumHardnessPpm, totalAlkalinityPpm, cya }) : null;`
   (`computeLSI` returns `null` if required inputs are missing — so incomplete chemistry ⇒ `measure_lsi` null.)
3. `buildCapabilityUpdates` places `measure_lsi: lsi` (cleared to null when stale/incomplete, per the M0 apply rule: `undefined`=skip, `null`=clear, else set).
4. Classify: `const next = classifyLSI(lsi);` Compare `next.band` to the in-memory `this._lastLsiBand`. If `next` is a non-balanced band **and** `next.band !== this._lastLsiBand`, fire the trigger with tokens. Update `this._lastLsiBand = next ? next.band : null`.

- `this._lastLsiBand` is in-memory and resets on app restart → a still-active warning may re-fire once after a restart. Accepted (a re-warning is harmless); persisting it is deferred.
- Transitions involving `null` (stale/incomplete) set `_lastLsiBand = null` and never fire — so recovery from stale does not spuriously trigger; a genuine corrosive reading after stale will fire on the next change.

Register the trigger card and the action card's run listener in `onInit` (or driver), following the homey-app patterns.

---

## 10. Freshness refactor (`PUMP_LAST_ON`)

Fixes two M0 final-review findings (clock-skew via in-memory rising edge; warmup wrongly re-imposed after restart) in one change. From `notes/2026-06-26-m1-inputs.md §1`.

- **`lib/VioletClient.js`** `parseReadings`: add `pumpLastOn: num(raw.PUMP_LAST_ON)` (alongside existing `timeUnix`, `pumpOn`).
- **`lib/Freshness.js`** `isFresh`: new signature
  ```js
  isFresh({ pumpOn, pumpLastOn, now, warmupSeconds })
  // false if !pumpOn or pumpLastOn == null; else Math.max(0, now − pumpLastOn) >= warmupSeconds
  ```
  Delta clamped to ≥ 0 (guards a backward controller-clock step).
- **`drivers/pool/device.js`**: remove `this._pumpOnSince` and the rising-edge block; keep `now = parsed.timeUnix || Math.floor(Date.now()/1000)`; call `isFresh` with `pumpLastOn: parsed.pumpLastOn`.
- **Fallback:** if `PUMP_LAST_ON` is absent (older firmware), `pumpLastOn == null` ⇒ not fresh (conservative). The real Violet and the fixture both expose the field.

---

## 11. Error handling & missing inputs

- Missing/invalid chemistry → `computeLSI` returns `null` → `measure_lsi` shows "–", no warning fires. The existing `measurements_fresh` capability already distinguishes the stale case; the user knows when they have not yet entered chemistry.
- All `lib/Lsi.js` functions are pure and total (no throws on bad input — return `null`/sane defaults), so the poll handler never throws (M0 spec §10 preserved).
- `log10` guarded against ≤ 0 inputs (calcium/alkalinity floored to a small positive before log).

---

## 12. Testing approach (TDD)

- **`test/Lsi.test.js`** (new):
  - LSI reference cases cross-checked against an independent calculator (tolerance ±0.05 for constant/temperature differences).
  - CYA correction: pH-dependence (e.g. pH 7.6 ≈ ⅓×CYA), CYA = 0 ⇒ no change, high CYA floor guard.
  - Unit conversion ppm/°dH/°f.
  - Band boundaries exactly at −0.5, −0.3, +0.5, +1.0.
  - `null` when required inputs missing.
- **`test/Freshness.test.js`**: rewritten for `pumpLastOn` + `now`; add a clamp test (`now < pumpLastOn` ⇒ not fresh) and a "fresh immediately after restart when pump long-running" case.
- **`test/VioletClient.test.js`**: assert `pumpLastOn` parsed from the fixture.
- **`test/Capabilities.test.js`**: `measure_lsi` carries the value when fresh, `null` when stale/incomplete.
- **Dev gate:** `npx homey app validate --level=debug` must PASS. Live smoke test via homey-cli against the real Violet.

---

## 13. Versioning & dashboard

- Per the versioning convention (`docs/dashboard/versions.md`): the first M1 build installed to the Homey is **0.1.1** via `npx homey app version patch`; update `.homeychangelog.json` (en/de) and append a `versions.md` row (version, date, commit, target, note). This is an explicit plan step before the final validate + push.
- The dashboard `M1` entry is maintained during the run (steps, currentActivity, log); at completion: `status:"done"`, `finishedAt`, `commit`, all steps done.

---

## 14. References (sources for the band scheme & LSI explanation)

- **ANSI/PHTA/ICC-11** (formerly APSP-11), *American National Standard for Water Quality in Public Pools and Spas* — acceptable LSI range −0.3 to +0.5; basis for the band scheme (§5). Pool & Hot Tub Alliance fact sheets: https://www.phta.org/
- **DIN 19643** *Aufbereitung von Schwimm- und Badebeckenwasser* — uses the saturation index; basis for the stainless-steel caveat (§5.1).
- **W. F. Langelier (1936)** — original LSI definition.
- Pool-context explainer (material effects, low vs high LSI): Orenda Technologies, *Understanding LSI* — https://blog.orendatech.com/langelier-saturation-index ; Lovibond, *Balanced Water (Langelier Index)*.
- German-market reference incl. stainless-steel nuance: spa&home, *Langelier-Index und Korrosion von Edelstahl* (2025).

---

## 15. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Chem inputs | **Manual device settings + "Set water chemistry" Flow action** | slow-changing values, no cloud dependency in the flagship; action is the seam for M6/automations |
| LabCOM cloud import | **New milestone M6** | bigger, optional; keeps M1 focused |
| CYA correction | **Apply, pH-dependent** (factor 0.3877 × ionized fraction, pKa 6.88) | most accurate; matches PoolLab's 6-variable LSI; reduces to ⅓ rule at pH 7.6 |
| Warning direction | **Both** (corrosive + scaling), with severity | complete safety net; scaling harms heater/solar too |
| Flow card shape | **One edge-triggered trigger + filter + tokens**, plus the action | compact, flexible; avoids poll-spam |
| Band scheme | **ANSI/PHTA/ICC-11** (−0.3…+0.5, asymmetric) | strongest single standard citation; user choice |
| Source visibility | **Store description + in-UI label**, incl. asymmetry + DIN stainless caveat | user requirement; honest about applicability |
| Calcium/alkalinity units | **Per-value dropdown** (ppm/°dH/°f) | matches whatever PoolLab displays |
| TDS | **Fixed 1000 ppm, no field** | LSI is log-insensitive to TDS; simplest |
| `measure_lsi` | **Always present** (static capability) | flagship value; "–" when inputs incomplete |
| Freshness | **Derive from `PUMP_LAST_ON`**, drop in-memory `_pumpOnSince` | fixes clock-skew + restart-reset in one change |

---

## 16. Later milestones (context)

- **M2** full read coverage + feature groups · **M3** full write/control · **M4** inbound alarm notifications (specced, paused) · **M5** publish-readiness · **M6** LabCOM/PoolLab cloud import (auto-pull the chemistry values M1 collects manually).
