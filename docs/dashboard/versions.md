# Violet Homey App — Versions-Log (App-Version ↔ GitHub-Commit)

Nachvollziehbarkeit: **jede** auf das Homey installierte (`homey app install`) **oder** in den
Store veröffentlichte App-Version trägt eine eindeutige Versionsnummer und ist hier einem exakten
GitHub-Commit zugeordnet. So lässt sich jederzeit feststellen, welcher Code-Stand auf der Hardware
bzw. im Store läuft.

> `homey app run` (flüchtiger Dev-Modus, wird beim Stoppen wieder entfernt) zählt **nicht** als
> Upload und braucht **keinen** Bump/Eintrag. Nur `homey app install` und Store-Publish zählen.

## Versionsschema `0.X.Y`

- **X = Milestone-Nummer** (M0 → 0, M1 → 1, … M5 → 5). Entspricht semver-**minor**.
- **Y = fortlaufende Build-Nummer innerhalb des Milestones**, beginnt pro Milestone neu bei 0.
  Entspricht semver-**patch**.
- Major bleibt **0**, bis die App im Store als 1.0.0 veröffentlicht wird (Entscheidung in M5).

Das Schema deckt sich mit nativem semver-Tooling der Homey-CLI:

| Anlass | Befehl | Effekt |
|---|---|---|
| Neuer Build im **selben** Milestone | `npx homey app version patch` | `0.1.0 → 0.1.1` (Y +1) |
| **Neuer** Milestone (erster Build) | `npx homey app version minor` | `0.1.x → 0.2.0` (X +1, Y **auf 0 zurück**) |

Beide Befehle aktualisieren `.homeycompose/app.json`; das generierte Root-`app.json` wird beim
nächsten `build`/`run`/`validate` mitgezogen (beide müssen vor dem Commit identisch sein).

## Ablauf bei jedem Upload (Homey-Install ODER Store)

1. Änderungen committen (Code-Stand, der hochgeladen wird).
2. Version bumpen: `npx homey app version patch` (bzw. `minor` zum Milestone-Start).
3. `.homeychangelog.json` für die neue Version mit einer klaren, nutzerverständlichen Änderungsnotiz
   füllen (en + de).
4. Generiertes `app.json` prüfen (Version == `.homeycompose/app.json`), Bump + Changelog committen.
5. Hochladen (`npx homey app install` bzw. Store-Publish).
6. **Hier eine Zeile ergänzen** mit Version, Datum, Commit-SHA (der in Schritt 4 committete Stand),
   Ziel und Notiz.

## Log

| Version | Datum | Commit | Ziel | Milestone | Notiz |
|---|---|---|---|---|---|
| `0.1.0` | 2026-06-24 … 06-29 | `4d1aaf3` | Homey-Install | M0 | Scaffold-Default (Homey `app create`), **nie hochgezählt** — alle M0-Installs (`c174267` → clear-on-stale `4d1aaf3`, aktuell live) liefen unter 0.1.0. Grandfathered; Auslöser für diese Konvention. |
| `0.1.1` | 2026-06-30 | `0740c5f` | origin/main (Homey-Install) | M1 | LSI-Flaggschiff (optional via Toggle, Bänder nach ANSI/PHTA/ICC-11, CYA pH-abhängig) + Freshness-Refactor auf PUMP_LAST_ON. 12 SDD-Tasks, alle reviewt; Whole-Branch-Review (opus): „ready to merge". |

**Nächster Upload (erster M2-Build): `0.2.0`** (`npx homey app version minor`).
