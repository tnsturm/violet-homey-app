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
| `0.2.0` | 2026-07-01 | `b4c0d2a` | Homey-Install (→ origin/main) | M2 | Volle Reads + Feature-Gruppen: 27 neue Capabilities (Pumpenstufe, Heizung/Solar, Abdeckung als Enum, Licht, Wasserstand, Rückspülung, Dosier-Verbrauch je Kanal, Diagnose) hardware-adaptiv erkannt + 5 Alarm-Kacheln/Flow-Trigger (Dosierung blockiert/niedrig, Überlauf trocken/über, Ventilfehler). 10 SDD-Tasks + Whole-Branch-Review (opus). Live verifiziert (Detektion adaptiv, `alarm_dosing_low.cl`=true bei 6 d, Diagnose ausgeblendet). |
| `0.3.0` | 2026-07-04 | `727dfc5` | Homey-Install | M3 | Schreib-/Steuerzugriff: Pumpe/Licht/DMX-Szenen/PV-Überschuss via `setFunctionManually`+BasicAuth (Manual §26.2–26.3), als settbare Kacheln + 5 Flow-Aktionen. Interlock `control_enabled` (Default AUS) gated jeden Write; Args gegen `WRITE_TARGETS` geklemmt/abgelehnt; Credentials nur im Device-Store, nie in URL/Log. 9 SDD-Tasks (frischer Implementer+Reviewer je Task) + security-reviewer (SR-01..10 PASS) + Whole-Branch-Review (opus) + SR-10-Audit-Fix. |

| `0.3.1` | 2026-07-05 | `074d486` | Homey-Install | M3 | Diagnose-Hilfe (Live-Fehlersuche): bei aktivierter „Show Advanced diagnostics" hängen Status-/Alarm-/Schalt-Kacheln UND deren Homey-Logbuch-/Verlauf-Einträge hinter einem „:" den exakten getReadings-Rohwert an (z. B. `alarm_dosing_blocked.cl` → `[CL_DOSING_CONTROLLER]`, `cover_state` → `OPEN`). Reine lib-Mapping (`diagAnnotatable`/`diagRawValue`, 2 Unit-Tests, 62/62) + device.js `setCapabilityOptions` nur bei Wertänderung, Revert wenn aus. Live-Messwerte bewusst ausgenommen (Churn). |

| `0.4.0` | 2026-07-07 | `198ac4b` | **Homey App Store (privater Test)** | M4 | **Erster Store-Publish** (privater Test, `homey app publish`). Publish-Readiness: `validate --level=publish` PASS; Store-Name „Violet + BADU Blue Pool Control" (BADU Blue baugleich), Hersteller-Assets (App-Icon font-frei geflattet + zentriert, App-Bilder 250×175/500×350/1000×700, Driver-Bilder 75×75/500×500/1000×1000), Driver-Icon (stilisiertes VIOLET-Modul), explizite `images`-Manifeste, App-ID `de.neunbft.violet` final. mDNS live gedroppt (Violet kündigt keinen SD-Dienst an) → manueller `violet.local`-Fallback, Athom-dokumentiert. 8 SDD-Tasks + release-readiness + /code-review. |
| `0.4.1` | 2026-07-07 | `e0b8dcd` | **Homey App Store (privater Test)** | M4 | Store-Politur nach erstem Test: Titel `&`/`and` → `+` (beide Sprachen), README en+de auf Absätze in Einzelzeilen umgestellt (Store hatte harte Umbrüche gerendert), App-Icon als reines Vektor-SVG neu aufgebaut. **Icon aber weiterhin weißes Quadrat** — Ursache war NICHT `href` (das war ein Nebenaspekt), sondern die Maskierung (siehe 0.4.2). |
| `0.4.2` | 2026-07-07 | `4cd56da` | **Homey App Store (privater Test)** | M4 | **Icon-Fix (Kernursache):** Homey rendert App-/Driver-Icons als **einfarbige Maske** (Farben egal, nur die Form wird weiß gefüllt) → ein vollflächiger Hintergrund wurde zum weißen Vollquadrat (im Store UND auf der Geräte-Kachel). Beide Icons neu als **transparente, einfarbige Strichgrafik**: App = weißes U + Trennlinie + UIOLET; Driver = weißer Modul-Umriss mit Klemmen-Pins, LED-Reihe, Akzentlinie. |

**Nächster Upload: `0.4.3`** (Patch im selben Milestone) **oder** `0.5.0` (Milestone M5). **Vor Live/nächstem Publish offen:** `homeyCommunityTopicId` ins Manifest (Forum-Thread-ID aus den Launch-Posts) + Write-Passwort rotieren.
