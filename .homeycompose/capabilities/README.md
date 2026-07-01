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

`measure_temperature` (primary + `.owN` sub-sensors) is the **standard** Homey
capability, not defined here; it logs to Insights by default (§5.1, §8).

All custom capabilities set `"insights": true` with an `insightsTitle` (§5.1, §12).
