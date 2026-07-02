---
name: dashboard-sync
description: Update the active milestone's entry in docs/dashboard/dashboard.html's window.DASHBOARD_STATUS block, per CLAUDE.md §7 Progress Dashboard Protocol. Use whenever milestone work starts, progresses, or finishes.
user-invocable: false
---

# Dashboard Sync

Hält `docs/dashboard/dashboard.html` synchron mit dem tatsächlichen Stand eines Milestones,
gemäß CLAUDE.md §7. Bearbeite **ausschließlich** das `window.DASHBOARD_STATUS`-Datenobjekt
am Anfang der Datei — nie den Renderer darunter.

## Wann anwenden

- Milestone-Start (Brainstorming/Spec beginnt)
- Während der Umsetzung (Steps abhaken, `currentActivity` aktualisieren)
- Milestone-Abschluss (`status: done`)

## Regeln

- Nur das eine betroffene Milestone-Objekt (`Mx`) anfassen, nicht andere Einträge.
- **Am Start**: `status: "active"`, `startedAt` setzen, einen `log[]`-Eintrag anhängen,
  Top-Level `updatedAt` bumpen.
- **Während der Arbeit**: `steps[].done` abhaken (feste Reihenfolge: Brainstorming → Spec →
  Plan → Implementation (TDD/SDD) → Validate + Release), `currentActivity` aktuell halten,
  `log[]` grobkörnig ergänzen; vor jedem deploybaren Release Version bumpen + loggen
  (HOMEY.md / `homey-release`-Skill).
- **Am Ende**: `status: "done"`, `finishedAt`, `commit` (Short-SHA), alle `steps[].done =
  true`, `currentActivity: null`, `updatedAt` bumpen.
- Der Fortschrittsbalken wird aus `steps[].done` abgeleitet — nicht von Hand pflegen.
- `prompt`-Feld nie kürzen/abschneiden; auf `null` setzen sobald `status: "done"`.

## Felder pro Milestone

`id`, `title`, `status` (`done`|`active`|`todo`), `startedAt`/`finishedAt`, `commit`,
`summary`, `steps[]` (`{label, done}`), `currentActivity`, `runtime`, `log[]`
(`{at, note}`), `prompt` (vollständiger Resume-Prompt; `null` sobald `done`).
