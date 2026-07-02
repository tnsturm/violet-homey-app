# Custom capabilities — spec cross-reference

JSON capability definitions can't carry inline comments, so their rationale
lives in the M0 design spec
(`docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md`).

| File | Capability | Spec |
|---|---|---|
| `measure_ph.json` | pH, fresh-gated | §5, §7; Insights §5.1 |
| `measure_orp.json` | Redox / ORP (mV), fresh-gated | §5, §7; Insights §5.1 |
| `measure_chlorine.json` | Free chlorine (ppm), feature-detected + fresh-gated | §5, §7, §9; Insights §5.1 |
| `measure_lsi.json` | LSI (water balance), number + Insights-enabled; added/removed per `lsi_enabled` | M1 §6 |
| `alarm_water_balance.json` | LSI warning alarm (boolean), true when LSI outside the balanced band; per `lsi_enabled` | M1 §7.3 |
| `pump_running.json` | Pump on/off, every poll | §5; Insights §5.1 |
| `measurements_fresh.json` | Freshness indicator, derived | §5, §7; Insights §5.1 |
| `pump_speed_stage.json` | Pump speed stage (0–100), M2 owner-facing | M2 §5 |
| `runtime_pump.json` | Pump runtime today (h), M2 owner-facing | M2 §5 |
| `runtime_heater.json` | Heater runtime today (h), M2 owner-facing | M2 §5 |
| `runtime_solar.json` | Solar runtime today (h), M2 owner-facing | M2 §5 |
| `measure_water_level.json` | Water level (%), M2 owner-facing | M2 §5 |
| `measure_dosing_days_left.json` | Chemical days left (d), M2 owner-facing | M2 §5 |
| `measure_dosing_daily_ml.json` | Dosed today (mL), M2 owner-facing | M2 §5 |
| `eco_active.json` | Eco mode on/off, M2 owner-facing | M2 §5 |
| `heater_active.json` | Heater on/off, M2 owner-facing | M2 §5 |
| `solar_active.json` | Solar on/off, M2 owner-facing | M2 §5 |
| `backwash_active.json` | Backwash running, M2 owner-facing | M2 §5 |
| `light_on.json` | Light on/off, M2 owner-facing | M2 §5 |
| `refill_active.json` | Refill running, M2 owner-facing | M2 §5 |
| `overflow_refill_active.json` | Overflow refill, M2 owner-facing | M2 §5 |
| `pv_surplus_active.json` | PV surplus mode, M2 owner-facing | M2 §5 |
| `dosing_active.json` | Dosing now, M2 owner-facing | M2 §5 |
| `cover_state.json` | Cover state (enum: open/closed/moving/stopped), M2 owner-facing | M2 §5 |

`measure_temperature` (primary + `.owN` sub-sensors) is the **standard** Homey
capability, not defined here; it logs to Insights by default (§5.1, §8).

All custom capabilities set `"insights": true` with an `insightsTitle` (§5.1, §12).
