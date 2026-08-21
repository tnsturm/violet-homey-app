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

**JSON-Authoring-Regel:** Manifest-/Changelog-JSON **programmatisch bauen** (`node` + `JSON.stringify`; deutsche Innen-Anführungszeichen als `„…"` = U+201E/U+201C) — Hand-getippte Delimiter geraten zu Smart Quotes, die `homey app validate` durchlässt. Der `json-guard`-PostToolUse-Hook (`.claude/hooks/json-guard.js`) erzwingt das mechanisch.

## App-Store-Readme & Community-Kurzanleitung

`README.txt` / `README.de.txt` sind das, was Athom im Store-Review sieht und was auf der
Store-Seite erscheint (nicht `README.md` — das ist reine GitHub-Doku). Laut Store Guidelines
(§1.3 readme, <https://apps.developer.homey.app/app-store/guidelines#1-3-readme>): **1–2
Absätze**, reiner Fließtext, **keine URLs**, keine Feature-Tabellen/Changelogs. Technisches
Setup-Detail (z. B. die NOTIFY-Port-Einrichtung) gehört NICHT ins Readme, sondern:

- als **Hint-Text** direkt am betreffenden Geräte-Setting (siehe
  `drivers/pool/driver.settings.compose.json`), und
- in die **Community-Kurzanleitung**.

Die ausführliche, nicht-technische Anleitung für alle Funktionen lebt im
Homey-Community-Thema (`homeyCommunityTopicId` im Manifest, aktuell `157109`), nicht im
Readme. Quelltext dafür liegt versioniert in `docs/community/quickstart-guide.en.md` /
`quickstart-guide.de.md` — bei inhaltlichen Änderungen zuerst dort editieren, dann den
Forenbeitrag von Hand nachziehen (kein API-/MCP-Zugriff auf die Homey Community vorhanden,
daher kein automatisierter Post).

**Bei jedem Milestone, das nutzerseitig sichtbares Verhalten ändert** (neue Fähigkeiten,
geänderte Settings, neue Flow-Karten, geänderter Setup-Ablauf): während Brainstorming/Spec
("Concept Writing") prüfen, ob die Kurzanleitung einen Update braucht, geplante Änderungen
im Design-Doc vermerken, und nach dem Release Datei + Forenbeitrag aktualisieren. Rein
interne Milestones (Refactoring, Tests, Housekeeping) sind ausgenommen.

## Release-Checkliste (Umsetzung von CLAUDE.md §8 für Homey)

1. Code-Stand committen.
2. Bumpen: `npx homey app version patch` (neuer Build im selben Milestone) bzw. `npx homey app version minor` zum Milestone-Start.
3. `.homeychangelog.json` für die neue Version füllen (en + de).
4. Generiertes `app.json` prüfen (Version == `.homeycompose/app.json`); Bump + Changelog zusammen committen.
5. Generierte/geänderte Bild-Assets (App-Icon, Store-Images) **in Zielgröße rendern und ansehen**,
   bevor sie committet werden — Icon und Store-Image mussten 2026-07 je einmal nach dem Commit
   nachgebessert werden, weil der Defekt erst in der Store-Vorschau sichtbar wurde.
6. Hochladen (`npx homey app install` bzw. Store-Publish).
7. Zeile im Projekt-Versions-Log ergänzen (Version, Datum, Commit, Ziel, Notiz) — siehe z. B. `docs/dashboard/versions.md`.
