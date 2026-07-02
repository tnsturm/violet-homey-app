# HOMEY.md

Homey-app-specific development conventions. Reusable across Homey app projects as-is — pairs with `CLAUDE.md` (general engineering guidelines; §6–8 define the platform-file mechanism and the generic dashboard/versioning protocol this file plugs into).

## SDK-Doku nachschlagen

Der `homey-app`-Skill deckt die Homey Apps SDK v3 Grundlagen ab (Compose, Kernklassen, CLI). Bei Details, die dort fehlen oder veraltet sein könnten (neue SDK-Version, Edge-Case-API, Compose-Merge-Verhalten), den `context7`-MCP-Server (siehe `.mcp.json`) für einen Live-Doku-Lookup nutzen statt zu raten.

## Versioning commands

| Anlass | Befehl | Effekt |
|---|---|---|
| Neuer Build im selben Milestone | `npx homey app version patch` | `0.1.0 → 0.1.1` (Y +1) |
| Neuer Milestone (erster Build) | `npx homey app version minor` | `0.1.x → 0.2.0` (X +1, Y auf 0 zurück) |

Beide Befehle aktualisieren `.homeycompose/app.json`; das generierte Root-`app.json` wird beim nächsten `build`/`run`/`validate` mitgezogen — beide müssen vor dem Commit identisch sein.

`homey app run` (flüchtiger Dev-Modus, wird beim Stoppen wieder entfernt) zählt **nicht** als Release und braucht keinen Bump/Log-Eintrag. Nur `homey app install` und Store-Publish zählen als Release im Sinne von CLAUDE.md §8.

## Changelog

`.homeychangelog.json` für jede neue Version mit einer klaren, nutzerverständlichen Änderungsnotiz füllen — **en + de**.

## Release-Checkliste (Umsetzung von CLAUDE.md §8 für Homey)

1. Code-Stand committen.
2. Bumpen: `npx homey app version patch` (neuer Build im selben Milestone) bzw. `npx homey app version minor` zum Milestone-Start.
3. `.homeychangelog.json` für die neue Version füllen (en + de).
4. Generiertes `app.json` prüfen (Version == `.homeycompose/app.json`); Bump + Changelog zusammen committen.
5. Hochladen (`npx homey app install` bzw. Store-Publish).
6. Zeile im Projekt-Versions-Log ergänzen (Version, Datum, Commit, Ziel, Notiz) — siehe z. B. `docs/dashboard/versions.md`.
