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

## Checkpoint-Einträge (`Mx.0`)

Zwischen-Milestone-Checkpoints (`id: "Mx.0"`, `title: "Housekeeping Agentic Loop"`) sind
milestone-förmige Objekte in derselben `milestones[]`-Liste (CLAUDE.md §7 Punkt 4) — gleiche
Felder, gleiche Status-Lifecycle, gleiche Edit-Regeln wie ein echter Milestone. Der
Implementierungs-Milestone, den ein Checkpoint gatet, trägt die Nummer `Mx.1`. Neun Steps:
`Branch-/Worktree-Cleanup` (Schritt 1 des Skills), dann die acht weiteren des
`milestone-checkpoint`-Skills: `/doctor-Lauf`, `/claude-automation-recommender`,
`Skill-Quellen geprüft`, `Workflow-Retrospektive`, `Memory-Konsolidierung`,
`Framework-Abgleich (Drift + Native-Features)` (M4.9), `Dashboard aktualisieren`,
`Handover` (M4.8).

## Resume-Prompt: Pflichtfelder

Ein Resume-Prompt beschreibt **Ziel und Grenzen, nie eine Prozedur** (CLAUDE.md §7). Vier Felder
sind Pflicht — die letzten beiden seit M9.0, weil ein Prompt ohne sie beeindruckende Lösungen für
das falsche Problem einlädt:

1. **`/goal`-Zeile** mit transcript-verifizierbarer Done-Bedingung.
2. **`/remote-control <id> — <title>`** als letzte Zeile (Start vom Handy).
3. **`SCOPE-NEGATIV:`** — was sich ausdrücklich **nicht** ändern darf (Dateien, Ebenen, Nachbar-
   Milestones). Beispiel aus M9.0: „Hook-PrüfLOGIK nicht verändern (nur Start-Bedingungen +
   Telemetrie); Renderer in dashboard.html unberührt; kein Version-Bump."
4. **`NO-ACTION:`** — wann das System **unverändert** bleibt statt zu improvisieren. Beispiel:
   „Ist ein Block durch veränderte Produktlage obsolet, Block als FRICTION loggen und die übrigen
   fertigstellen." Ohne dieses Feld ist die einzige Lesart „irgendetwas tun".

## Regeln

- Nur das eine betroffene Objekt (`Mx` oder `Mx.0`) anfassen, nicht andere Einträge.
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
(`{at, note}`), `prompt` (vollständiger Resume-Prompt; `null` sobald `done`),
`recommendedModel` (`{model, effort, why}` — CLAUDE.md §11; für jeden offenen Milestone
gesetzt, entfällt sobald `status: done`).
