# Violet Homey App — Versions-Log (App-Version ↔ GitHub-Commit)

Nachvollziehbarkeit: **jede** auf das Homey installierte (`homey app install`) **oder** in den
Store veröffentlichte App-Version trägt eine eindeutige Versionsnummer und ist hier einem exakten
GitHub-Commit zugeordnet. So lässt sich jederzeit feststellen, welcher Code-Stand auf der Hardware
bzw. im Store läuft.

Versionsschema, Release-Ablauf und die Homey-CLI-Befehle stehen in
[`CLAUDE.md` §8](../../CLAUDE.md) (generisch) und [`HOMEY.md`](../../HOMEY.md) (Homey-spezifisch).
Diese Datei ist die reine Log-Tabelle für dieses Projekt.

## Log

| Version | Datum | Commit | Ziel | Milestone | Notiz |
|---|---|---|---|---|---|
| `0.1.0` | 2026-06-24 … 06-29 | `4d1aaf3` | Homey-Install | M0 | Scaffold-Default (Homey `app create`), **nie hochgezählt** — alle M0-Installs (`c174267` → clear-on-stale `4d1aaf3`, aktuell live) liefen unter 0.1.0. Grandfathered; Auslöser für diese Konvention. |
| `0.1.1` | 2026-06-30 | `0740c5f` | origin/main (Homey-Install) | M1 | LSI-Flaggschiff (optional via Toggle, Bänder nach ANSI/PHTA/ICC-11, CYA pH-abhängig) + Freshness-Refactor auf PUMP_LAST_ON. 12 SDD-Tasks, alle reviewt; Whole-Branch-Review (opus): „ready to merge". |
| `0.1.2` | 2026-07-01 | `67812c6` | origin/main + Homey-Install | M1 | Kosmetik-Patch: feste LSI-Insights-Skala (`measure_lsi` min/max −3..+3, Achsen-Experiment gegen milli-Beschriftung) + iOS-Dropdown-Hinweis im LSI-Info-Label. |
| `0.1.3` | 2026-07-01 | `0ac021f` | origin/main + Homey-Install | M1 | Neu: `alarm_water_balance` (Kachel-Alarm, true wenn LSI außerhalb −0,3…+0,5; Option A) — sichtbar auf der Kachel wie ein Bewegungsalarm. Totes `measure_lsi` min/max entfernt (Homey nutzt es nicht für die Insights-Achse). |

**Nächster Upload (erster M2-Build): `0.2.0`** (`npx homey app version minor`).
