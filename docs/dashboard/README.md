# Violet Homey App — Fortschritts-Dashboard

`dashboard.html` ist ein eigenständiges Artefakt: per Doppelklick im Browser öffnen, kein Server,
kein CDN, keine Build-Schritte. Es zeigt den Stand der Meilensteine **M0–M5** und enthält pro
nicht-abgeschlossenem Meilenstein den vollständigen Start-Prompt (zum Lesen/Kopieren).

## Einzige Quelle der Wahrheit

Der Daten-Block `window.DASHBOARD_STATUS` im `<script id="status-data">` ganz oben in `dashboard.html`.
**Nur dieses Objekt editieren.** Den Renderer darunter (`<script>` mit dem Kommentar „Renderer — nicht
editieren") NICHT anfassen.

## Protokoll für jede Milestone-Session

Wenn du (eine Claude-Code-Session) an Meilenstein `Mx` arbeitest, pflege den Eintrag mit
`milestones[].id === "Mx"` **im selben Lauf**, in dem du arbeitest:

1. **Beim Start**
   - `status: "active"`
   - `startedAt: "<YYYY-MM-DD>"` (heutiges Datum)
   - `log` ergänzen: `{ "at": "<YYYY-MM-DD>", "note": "Brainstorming/Design gestartet" }`
   - oben `updatedAt` auf heute setzen
2. **Während des Laufs**
   - grobe Steps abhaken: im `steps`-Array das passende `"done": true` setzen
     (fester Workflow: **Brainstorming → Spec → Plan → Implementierung (SDD) → Validate + Push**)
   - `currentActivity`: ein kurzer Satz, woran gerade gearbeitet wird (oder `null`)
   - `runtime`: optionale Laufzeit-/Aufwandsnotiz (z. B. `"Tag 1"`, `"9 SDD-Tasks"`)
   - bei groben Etappen `log` ergänzen
3. **Am Ende**
   - `status: "done"`
   - `finishedAt: "<YYYY-MM-DD>"`, `commit: "<short-sha>"`
   - alle `steps[].done = true`, `currentActivity: null`
   - oben `updatedAt` aktualisieren

## Felder pro Meilenstein

| Feld | Bedeutung |
|------|-----------|
| `id` | `"M0"` … `"M5"` |
| `title` | Kurztitel |
| `status` | `"done"` \| `"active"` \| `"todo"` |
| `startedAt` / `finishedAt` | `"YYYY-MM-DD"` oder `null` |
| `commit` | Kurz-SHA des Abschluss-Commits oder `null` |
| `summary` | 1–2 Sätze, was der Meilenstein liefert |
| `steps[]` | `{ label, done }` — die fünf groben Workflow-Schritte |
| `currentActivity` | aktueller Fokus oder `null` |
| `runtime` | freie Laufzeit-/Aufwandsnotiz oder `null` |
| `log[]` | `{ at, note }` — grobe Etappen (im Renderer werden die letzten 4 gezeigt) |
| `prompt` | Start-Prompt der neuen Sitzung (für `done` i. d. R. `null`) |

## Hinweise

- **Edits chirurgisch halten** — nur den Daten-Block, exakt das eine `Mx`-Objekt.
- Die Datei ist **committet**. Änderungen mitcommitten, damit andere Sessions und frische
  git-worktrees (über die „Start Mx …"-Chips) den aktuellen Stand sehen.
- Der Fortschrittsbalken oben rechnet automatisch aus allen `steps[].done` (kein manuelles Pflegen).
- Ansehen: `dashboard.html` im Browser (zeigt **immer** alle Prompts). Im Claude-Chat kann Claude
  das Dashboard auch inline neu rendern.

## Inline-Anzeige im Chat (wichtig)

Inline-Widgets werden pro Session neu erzeugt — sie laden NICHT automatisch diese Datei. Wenn du das
Dashboard im Chat renderst, baue es **1:1 aus dem Daten-Block** `DASHBOARD_STATUS` und übernimm für
**jeden nicht-abgeschlossenen Meilenstein den vollständigen `prompt`** (eingeklappt unter „Start-Prompt
anzeigen"). Prompts niemals kürzen oder weglassen — genau dadurch wirkten sie schon einmal „verloren".
Die verlässliche Vollansicht bleibt die Datei `dashboard.html`.
