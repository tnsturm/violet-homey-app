# Dashboard Milestone-Checkpoints + Remote-Control Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six "between milestones" checkpoint entries (`→M2`–`→M7`) to the dashboard, and append a `/remote-control <id> — <title>` line to every non-done resume prompt (milestones and checkpoints).

**Architecture:** Pure data + doc edits, no application code. Checkpoints are milestone-shaped objects inserted into the existing `window.DASHBOARD_STATUS.milestones` array in `docs/dashboard/dashboard.html` — the renderer is untouched. Three companion docs (`CLAUDE.md`, `.claude/skills/dashboard-sync/SKILL.md`, `docs/dashboard/README.md`) get small text updates so the convention is durable.

**Tech Stack:** Static HTML/JS (no build step), Markdown.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-dashboard-milestone-checkpoints-design.md` — follow exactly; this plan implements sections 2–4 verbatim.
- Never touch the dashboard renderer (`<script>` block after `</script id="status-data">` in `dashboard.html`) — data-block-only edits (CLAUDE.md §7).
- No `→M1` checkpoint (spec §2.2 — predates the rule, no evidence).
- `→M2` is created already `done` with real evidence (commit `9c10b13` + this session's `/claude-automation-recommender` run) — spec §2.3.
- Every non-done prompt (milestone or checkpoint) ends with `/remote-control <id> — <title>` (spec §3).

---

### Task 1: Insert checkpoint entries and remote-control lines into `dashboard.html`

**Files:**
- Modify: `docs/dashboard/dashboard.html` (data block only, lines ~92–347)

**Interfaces:**
- Consumes: existing `window.DASHBOARD_STATUS.milestones` array shape (`id`, `title`, `status`, `startedAt`, `finishedAt`, `commit`, `summary`, `steps[]`, `currentActivity`, `runtime`, `log[]`, `prompt`) — unchanged, no new fields.
- Produces: 6 new milestone-shaped checkpoint objects (`→M2`…`→M7`) interleaved into the array; 6 existing prompts (M2–M7) gain a trailing `/remote-control` line.

- [ ] **Step 1: Insert the `→M2` checkpoint (done) before the M2 object**

Find the boundary between the M1 object's closing and the M2 object's opening:

```
    {
      id: "M2",
```

Insert immediately before it:

```js
    {
      id: "→M2",
      title: "Zwischen-Check",
      status: "done",
      startedAt: "2026-07-02",
      finishedAt: "2026-07-02",
      commit: "9c10b13",
      summary: "Housekeeping zwischen M1 und M2: Permission-Allowlist verschlankt, Automation-Empfehlungen geprüft (CLAUDE.md §7 Punkt 4).",
      steps: [
        { label: "/fewer-permission-prompts", done: true },
        { label: "/claude-automation-recommender", done: true }
      ],
      currentActivity: null,
      runtime: null,
      log: [
        { at: "2026-07-02", note: "/fewer-permission-prompts: Allowlist für read-only Commands ergänzt (commit 9c10b13)." },
        { at: "2026-07-02", note: "/claude-automation-recommender: Subagent + Hooks + Skills + MCP-Empfehlungen geprüft und umgesetzt (release-readiness, write-path-security-reviewer, homey-release, dashboard-sync, cleanup-worktrees, context7 .mcp.json)." }
      ],
      prompt: null
    },
    {
      id: "M2",
```

- [ ] **Step 2: Insert the `→M3` checkpoint (todo) before the M3 object**

Find:

```
    {
      id: "M3",
```

Insert immediately before it:

```js
    {
      id: "→M3",
      title: "Zwischen-Check",
      status: "todo",
      startedAt: null,
      finishedAt: null,
      commit: null,
      summary: "Housekeeping zwischen M2 und M3: Permission-Allowlist pruefen, Automation-Empfehlungen pruefen (CLAUDE.md §7 Punkt 4).",
      steps: [
        { label: "/fewer-permission-prompts", done: false },
        { label: "/claude-automation-recommender", done: false }
      ],
      currentActivity: null,
      runtime: null,
      log: [],
      prompt: `UMGEBUNG: Repo liegt lokal unter C:/Users/TorstenSturm/source/repos/VioletApp (NICHT mehr in OneDrive). Claude Code in diesem Ordner starten; alle Pfade unten sind repo-relativ.

Zwischen-Check vor M3 (CLAUDE.md §7 Punkt 4). M2 ist abgeschlossen, M3 startet als Naechstes.

Fuehre nacheinander aus:
1. /fewer-permission-prompts
2. /claude-automation-recommender

Aktualisiere danach den →M3-Eintrag in docs/dashboard/dashboard.html: status "done", finishedAt = heute, beide Steps abhaken, je einen log-Eintrag mit kurzer Zusammenfassung. (Dashboard-Protokoll: CLAUDE.md §7, bereits automatisch geladen.)

/remote-control →M3 — Zwischen-Check`
    },
    {
      id: "M3",
```

- [ ] **Step 3: Insert the `→M4` checkpoint (todo) before the M4 object**

Find:

```
    {
      id: "M4",
```

Insert immediately before it:

```js
    {
      id: "→M4",
      title: "Zwischen-Check",
      status: "todo",
      startedAt: null,
      finishedAt: null,
      commit: null,
      summary: "Housekeeping zwischen M3 und M4: Permission-Allowlist pruefen, Automation-Empfehlungen pruefen (CLAUDE.md §7 Punkt 4).",
      steps: [
        { label: "/fewer-permission-prompts", done: false },
        { label: "/claude-automation-recommender", done: false }
      ],
      currentActivity: null,
      runtime: null,
      log: [],
      prompt: `UMGEBUNG: Repo liegt lokal unter C:/Users/TorstenSturm/source/repos/VioletApp (NICHT mehr in OneDrive). Claude Code in diesem Ordner starten; alle Pfade unten sind repo-relativ.

Zwischen-Check vor M4 (CLAUDE.md §7 Punkt 4). M3 ist abgeschlossen, M4 startet als Naechstes.

Fuehre nacheinander aus:
1. /fewer-permission-prompts
2. /claude-automation-recommender

Aktualisiere danach den →M4-Eintrag in docs/dashboard/dashboard.html: status "done", finishedAt = heute, beide Steps abhaken, je einen log-Eintrag mit kurzer Zusammenfassung. (Dashboard-Protokoll: CLAUDE.md §7, bereits automatisch geladen.)

/remote-control →M4 — Zwischen-Check`
    },
    {
      id: "M4",
```

- [ ] **Step 4: Insert the `→M5` checkpoint (todo) before the M5 object**

Find:

```
    {
      id: "M5",
```

Insert immediately before it:

```js
    {
      id: "→M5",
      title: "Zwischen-Check",
      status: "todo",
      startedAt: null,
      finishedAt: null,
      commit: null,
      summary: "Housekeeping zwischen M4 und M5: Permission-Allowlist pruefen, Automation-Empfehlungen pruefen (CLAUDE.md §7 Punkt 4).",
      steps: [
        { label: "/fewer-permission-prompts", done: false },
        { label: "/claude-automation-recommender", done: false }
      ],
      currentActivity: null,
      runtime: null,
      log: [],
      prompt: `UMGEBUNG: Repo liegt lokal unter C:/Users/TorstenSturm/source/repos/VioletApp (NICHT mehr in OneDrive). Claude Code in diesem Ordner starten; alle Pfade unten sind repo-relativ.

Zwischen-Check vor M5 (CLAUDE.md §7 Punkt 4). M4 ist abgeschlossen, M5 startet als Naechstes.

Fuehre nacheinander aus:
1. /fewer-permission-prompts
2. /claude-automation-recommender

Aktualisiere danach den →M5-Eintrag in docs/dashboard/dashboard.html: status "done", finishedAt = heute, beide Steps abhaken, je einen log-Eintrag mit kurzer Zusammenfassung. (Dashboard-Protokoll: CLAUDE.md §7, bereits automatisch geladen.)

/remote-control →M5 — Zwischen-Check`
    },
    {
      id: "M5",
```

- [ ] **Step 5: Insert the `→M6` checkpoint (todo) before the M6 object**

Find:

```
    {
      id: "M6",
```

Insert immediately before it:

```js
    {
      id: "→M6",
      title: "Zwischen-Check",
      status: "todo",
      startedAt: null,
      finishedAt: null,
      commit: null,
      summary: "Housekeeping zwischen M5 und M6: Permission-Allowlist pruefen, Automation-Empfehlungen pruefen (CLAUDE.md §7 Punkt 4).",
      steps: [
        { label: "/fewer-permission-prompts", done: false },
        { label: "/claude-automation-recommender", done: false }
      ],
      currentActivity: null,
      runtime: null,
      log: [],
      prompt: `UMGEBUNG: Repo liegt lokal unter C:/Users/TorstenSturm/source/repos/VioletApp (NICHT mehr in OneDrive). Claude Code in diesem Ordner starten; alle Pfade unten sind repo-relativ.

Zwischen-Check vor M6 (CLAUDE.md §7 Punkt 4). M5 ist abgeschlossen, M6 startet als Naechstes.

Fuehre nacheinander aus:
1. /fewer-permission-prompts
2. /claude-automation-recommender

Aktualisiere danach den →M6-Eintrag in docs/dashboard/dashboard.html: status "done", finishedAt = heute, beide Steps abhaken, je einen log-Eintrag mit kurzer Zusammenfassung. (Dashboard-Protokoll: CLAUDE.md §7, bereits automatisch geladen.)

/remote-control →M6 — Zwischen-Check`
    },
    {
      id: "M6",
```

- [ ] **Step 6: Insert the `→M7` checkpoint (todo) before the M7 object**

Find:

```
    {
      id: "M7",
```

Insert immediately before it:

```js
    {
      id: "→M7",
      title: "Zwischen-Check",
      status: "todo",
      startedAt: null,
      finishedAt: null,
      commit: null,
      summary: "Housekeeping zwischen M6 und M7: Permission-Allowlist pruefen, Automation-Empfehlungen pruefen (CLAUDE.md §7 Punkt 4).",
      steps: [
        { label: "/fewer-permission-prompts", done: false },
        { label: "/claude-automation-recommender", done: false }
      ],
      currentActivity: null,
      runtime: null,
      log: [],
      prompt: `UMGEBUNG: Repo liegt lokal unter C:/Users/TorstenSturm/source/repos/VioletApp (NICHT mehr in OneDrive). Claude Code in diesem Ordner starten; alle Pfade unten sind repo-relativ.

Zwischen-Check vor M7 (CLAUDE.md §7 Punkt 4). M6 ist abgeschlossen, M7 startet als Naechstes.

Fuehre nacheinander aus:
1. /fewer-permission-prompts
2. /claude-automation-recommender

Aktualisiere danach den →M7-Eintrag in docs/dashboard/dashboard.html: status "done", finishedAt = heute, beide Steps abhaken, je einen log-Eintrag mit kurzer Zusammenfassung. (Dashboard-Protokoll: CLAUDE.md §7, bereits automatisch geladen.)

/remote-control →M7 — Zwischen-Check`
    },
    {
      id: "M7",
```

- [ ] **Step 7: Append `/remote-control` to the M2 prompt**

Find (exact, inside the M2 `prompt` template literal):

```
Aufgabe: ALLE Werte aus GET http://<host>/getReadings?ALL (keine Auth) als sinnvolle Feature-Gruppen abbilden (Temperaturen, pH, Redox/ORP, Chlor/Desinfektion, Filter/Pumpe, Dosierung, Salz/Elektrolyse), per FeatureDetector an die installierte Hardware angepasst. Bestehende lib-Module + pump-aware Freshness weiterverwenden.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN.`
```

Replace with:

```
Aufgabe: ALLE Werte aus GET http://<host>/getReadings?ALL (keine Auth) als sinnvolle Feature-Gruppen abbilden (Temperaturen, pH, Redox/ORP, Chlor/Desinfektion, Filter/Pumpe, Dosierung, Salz/Elektrolyse), per FeatureDetector an die installierte Hardware angepasst. Bestehende lib-Module + pump-aware Freshness weiterverwenden.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN.

/remote-control M2 — Volle Reads + Feature-Gruppen`
```

- [ ] **Step 8: Append `/remote-control` to the M3 prompt**

Find (exact, inside the M3 `prompt` template literal):

```
Aufgabe: Schreibende Steuerung ueber setFunctionManually mit BasicAuth (Pumpe, Licht, Dosierung/Sollwerte je nach Hardware), settbare Homey-Capabilities + passende Flow-Action-Karten.

SICHERHEIT: Write-Credentials NUR im Device-Store, niemals in Source/Settings; Violet-Write-Passwort vor Publish rotieren. Wo moeglich gegen Demo demo.myViolet.de testen.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN.`
```

Replace with:

```
Aufgabe: Schreibende Steuerung ueber setFunctionManually mit BasicAuth (Pumpe, Licht, Dosierung/Sollwerte je nach Hardware), settbare Homey-Capabilities + passende Flow-Action-Karten.

SICHERHEIT: Write-Credentials NUR im Device-Store, niemals in Source/Settings; Violet-Write-Passwort vor Publish rotieren. Wo moeglich gegen Demo demo.myViolet.de testen.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN.

/remote-control M3 — Voller Schreib-/Steuerzugriff`
```

- [ ] **Step 9: Append `/remote-control` to the M4 prompt**

Find (exact, inside the M4 `prompt` template literal):

```
Aufgabe (aus der Spec): eingebetteter HTTP-Listener im Pool-Device (neue lib/NotifyServer.js mit reiner, testbarer parseAlarm-Funktion + Singleton-Bind, EADDRINUSE sauber abfangen), Geraete-Flow-Trigger "Alarm empfangen" via getDeviceTriggerCard (Tokens errorcode + subject, optionaler Freitext-Code-Filter per registerRunListener), neue Device-Einstellung notifyPort (Default 22222, konfigurierbar). Vor dem Coden an echter Hardware bestaetigen, dass die Violet die Tokens exakt als ERRORCODE/SUBJECT sendet und ob die Werte URL-codiert ankommen — das praegt nur parseAlarm, nicht die Architektur.

Vorgehen wie M0: superpowers:writing-plans -> subagent-driven-development (frischer Implementer + Review je Task, TDD). Dev-Gate: npx homey app validate --level=debug muss PASSEN. SDK-Spezifika ueber die Skill homey-app, Live-Inspektion via homey-cli gegen "Torstens Homey Pro" / die echte Violet (Host: violet).`
```

Replace with:

```
Aufgabe (aus der Spec): eingebetteter HTTP-Listener im Pool-Device (neue lib/NotifyServer.js mit reiner, testbarer parseAlarm-Funktion + Singleton-Bind, EADDRINUSE sauber abfangen), Geraete-Flow-Trigger "Alarm empfangen" via getDeviceTriggerCard (Tokens errorcode + subject, optionaler Freitext-Code-Filter per registerRunListener), neue Device-Einstellung notifyPort (Default 22222, konfigurierbar). Vor dem Coden an echter Hardware bestaetigen, dass die Violet die Tokens exakt als ERRORCODE/SUBJECT sendet und ob die Werte URL-codiert ankommen — das praegt nur parseAlarm, nicht die Architektur.

Vorgehen wie M0: superpowers:writing-plans -> subagent-driven-development (frischer Implementer + Review je Task, TDD). Dev-Gate: npx homey app validate --level=debug muss PASSEN. SDK-Spezifika ueber die Skill homey-app, Live-Inspektion via homey-cli gegen "Torstens Homey Pro" / die echte Violet (Host: violet).

/remote-control M4 — Inbound-Alarme (HTTP → Flow-Trigger)`
```

- [ ] **Step 10: Append `/remote-control` to the M5 prompt**

Find (exact, inside the M5 `prompt` template literal):

```
Aufgabe: App publish-fertig machen, sodass npx homey app validate --level=publish PASST (aktuell scheitert nur --level=publish an fehlenden drivers.pool.images). To-dos: Store-Assets/Bilder ergaenzen, App-ID de.neunbft.violet final festlegen, Beschreibung/README, Kategorien, Berechtigungen.

SICHERHEIT (Blocker vor Publish): Violet-Write-Passwort rotieren; Credentials nur im Device-Store.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Final-Gate: npx homey app validate --level=publish muss PASSEN.`
```

Replace with:

```
Aufgabe: App publish-fertig machen, sodass npx homey app validate --level=publish PASST (aktuell scheitert nur --level=publish an fehlenden drivers.pool.images). To-dos: Store-Assets/Bilder ergaenzen, App-ID de.neunbft.violet final festlegen, Beschreibung/README, Kategorien, Berechtigungen.

SICHERHEIT (Blocker vor Publish): Violet-Write-Passwort rotieren; Credentials nur im Device-Store.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Final-Gate: npx homey app validate --level=publish muss PASSEN.

/remote-control M5 — Publish-Readiness`
```

- [ ] **Step 11: Append `/remote-control` to the M6 prompt**

Find (exact, inside the M6 `prompt` template literal):

```
Aufgabe: Die in M1 manuell gepflegten Chem-Werte automatisch aus der PoolLab/LabCOM-Cloud beziehen (Auth, Polling/Refresh, Feld-Mapping auf die bestehenden Settings), als zusätzliche, optionale Quelle — manuelle Eingabe + Flow-Action aus M1 bleiben als Fallback. Reine, testbare Mapping-/Client-Logik nach /lib; device.js bleibt dünn.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN. SDK-Spezifika über die Skill homey-app, Live-Inspektion via homey-cli gegen "Torstens Homey Pro" / die echte Violet (Host: \`violet\`).`
```

Replace with:

```
Aufgabe: Die in M1 manuell gepflegten Chem-Werte automatisch aus der PoolLab/LabCOM-Cloud beziehen (Auth, Polling/Refresh, Feld-Mapping auf die bestehenden Settings), als zusätzliche, optionale Quelle — manuelle Eingabe + Flow-Action aus M1 bleiben als Fallback. Reine, testbare Mapping-/Client-Logik nach /lib; device.js bleibt dünn.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN. SDK-Spezifika über die Skill homey-app, Live-Inspektion via homey-cli gegen "Torstens Homey Pro" / die echte Violet (Host: \`violet\`).

/remote-control M6 — LabCOM-Cloud-Import (PoolLab)`
```

- [ ] **Step 12: Append `/remote-control` to the M7 prompt**

Find (exact, inside the M7 `prompt` template literal):

```
Aufgabe (beratend, kein Zwang zum Schreiben auf die Violet): Empfehlungen, mit welchen chemischen Maßnahmen man (a) das initiale Leitungswasser — ausgehend von den veröffentlichten Messwerten der Wasserwerke — in ein günstiges LSI-Band bringt und (b) aus den aktuellen Werten die wirklichen "Treiber" identifiziert, um schnell auf einen günstigen LSI zu kommen (welche Stellgröße bringt am meisten). Wichtig: Hinweis auf CO₂-Ausgasung beim Einlass von frischem Leitungswasser (erhöht den pH-Wert) und die Wechselwirkung mit niedriger Alkalität (starke pH-Schwankungen, schlechte Pufferung). Mögliche Ausgabe: berechnete Mengenempfehlungen + erklärende Hinweise (Flow-Tokens/Notification oder Settings-Hinweis); ggf. Anbindung an M3-Dosierung als Option.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN. SDK-Spezifika über die Skill homey-app, Live-Inspektion via homey-cli gegen "Torstens Homey Pro" / die echte Violet (Host: \`violet\`).`
```

Replace with:

```
Aufgabe (beratend, kein Zwang zum Schreiben auf die Violet): Empfehlungen, mit welchen chemischen Maßnahmen man (a) das initiale Leitungswasser — ausgehend von den veröffentlichten Messwerten der Wasserwerke — in ein günstiges LSI-Band bringt und (b) aus den aktuellen Werten die wirklichen "Treiber" identifiziert, um schnell auf einen günstigen LSI zu kommen (welche Stellgröße bringt am meisten). Wichtig: Hinweis auf CO₂-Ausgasung beim Einlass von frischem Leitungswasser (erhöht den pH-Wert) und die Wechselwirkung mit niedriger Alkalität (starke pH-Schwankungen, schlechte Pufferung). Mögliche Ausgabe: berechnete Mengenempfehlungen + erklärende Hinweise (Flow-Tokens/Notification oder Settings-Hinweis); ggf. Anbindung an M3-Dosierung als Option.

Vorgehen wie M0: superpowers:brainstorming -> writing-plans -> subagent-driven-development. Dev-Gate: npx homey app validate --level=debug muss PASSEN. SDK-Spezifika über die Skill homey-app, Live-Inspektion via homey-cli gegen "Torstens Homey Pro" / die echte Violet (Host: \`violet\`).

/remote-control M7 — Empfehlungs-Modul (Wasserbalance)`
```

- [ ] **Step 13: Bump `updatedAt` and verify syntax**

In the same file, update:

```js
  updatedAt: "2026-07-01",
```

to:

```js
  updatedAt: "2026-07-02",
```

Then verify the data block is still valid JS (no syntax errors from the inserted objects/backticks):

Run: `node -e "const fs=require('fs');const src=fs.readFileSync('docs/dashboard/dashboard.html','utf8');const block=src.match(/<script id=\"status-data\">([\s\S]*?)<\/script>/)[1];eval(block);console.log('milestones:', window.DASHBOARD_STATUS.milestones.length);"`

Expected: prints `milestones: 13` (7 original + 6 new checkpoints) with no thrown error. Note: `window` is undefined in plain Node — if the eval throws `window is not defined`, instead run the equivalent with a shim: `node -e "global.window={};const fs=require('fs');const src=fs.readFileSync('docs/dashboard/dashboard.html','utf8');const block=src.match(/<script id=\"status-data\">([\s\S]*?)<\/script>/)[1];eval(block);console.log('milestones:', window.DASHBOARD_STATUS.milestones.length);"`

- [ ] **Step 14: Visually verify in a browser**

Open `docs/dashboard/dashboard.html` directly in a browser (double-click, or the project's preview tool). Confirm:
- 13 cards render in order: M0, M1, →M2 (done, green), M2, →M3 (todo, grey), M3, →M4, M4, →M5, M5, →M6, M6, →M7, M7.
- `→M2`'s card shows both steps checked and no "Start-Prompt anzeigen" (it's done).
- `→M3`'s card shows an unchecked steps pair and a "Start-Prompt anzeigen" details block; expanding it shows the `/remote-control →M3 — Zwischen-Check` line at the end.
- M2's prompt (expand its details) ends with `/remote-control M2 — Volle Reads + Feature-Gruppen`.
- No console errors.

- [ ] **Step 15: Commit**

```bash
git add docs/dashboard/dashboard.html
git commit -m "feat(dashboard): add M2-M7 between-milestone checkpoints + /remote-control prompts"
```

---

### Task 2: Update CLAUDE.md §7 point 4 and Rules

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: updated protocol text future sessions will read automatically.

- [ ] **Step 1: Update point 4 under "Protocol per milestone session"**

Find (exact):

```
4. **Between milestones:** once a milestone is closed and before starting the next, run `/claude-automation-recommender` once to check whether the codebase now warrants new hooks/subagents/skills.
```

Replace with:

```
4. **Between milestones:** once a milestone is closed and before starting the next, run `/fewer-permission-prompts` and `/claude-automation-recommender` to keep tool permissions tight and check whether the codebase now warrants new hooks/subagents/skills. Track this as its own checkpoint entry in the milestones list (same object shape as a milestone, `id: "→Mx"`), not just prose.
```

- [ ] **Step 2: Add a new bullet under "Rules:"**

Find (exact):

```
**Rules:**
- Keep edits surgical — only the data block, only the one milestone's object.
```

Replace with:

```
**Rules:**
- Every resume prompt (milestone or checkpoint) ends with `/remote-control <id> — <title>` so the spawned session is reachable from the Claude mobile app.
- Keep edits surgical — only the data block, only the one milestone's (or checkpoint's) object.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md §7 - add /fewer-permission-prompts + checkpoint tracking + remote-control rule"
```

---

### Task 3: Update the `dashboard-sync` skill

**Files:**
- Modify: `.claude/skills/dashboard-sync/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: updated skill guidance future dashboard-editing sessions will follow.

- [ ] **Step 1: Add a checkpoint-entries note**

Find (exact):

```
## Regeln
- Nur das eine betroffene Milestone-Objekt (`Mx`) anfassen, nicht andere Einträge.
```

Replace with:

```
## Checkpoint-Einträge (`→Mx`)

Zwischen-Milestone-Checkpoints (`id: "→Mx"`, `title: "Zwischen-Check"`) sind milestone-förmige
Objekte in derselben `milestones[]`-Liste (CLAUDE.md §7 Punkt 4) — gleiche Felder, gleiche
Status-Lifecycle, gleiche Edit-Regeln wie ein echter Milestone. Zwei Steps:
`/fewer-permission-prompts`, `/claude-automation-recommender`.

## Regeln
- Nur das eine betroffene Objekt (`Mx` oder `→Mx`) anfassen, nicht andere Einträge.
- Jeder neue Resume-Prompt (Milestone oder Checkpoint) endet mit `/remote-control <id> — <title>`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/dashboard-sync/SKILL.md
git commit -m "docs(skill): dashboard-sync - document checkpoint entries + remote-control convention"
```

---

### Task 4: Update `docs/dashboard/README.md`

**Files:**
- Modify: `docs/dashboard/README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: one-line mention of the checkpoint convention for anyone reading the dashboard folder's own docs.

- [ ] **Step 1: Add the convention line**

Find (exact):

```
- Live-Status: `dashboard.html` in diesem Ordner (immer die vollständige Quelle der Wahrheit).
- Versions-Log dieses Projekts (Version ↔ Commit): [`versions.md`](versions.md).
```

Replace with:

```
- Live-Status: `dashboard.html` in diesem Ordner (immer die vollständige Quelle der Wahrheit).
- Zwischen-Milestone-Checkpoints (`→M2`…`→M7`, CLAUDE.md §7 Punkt 4) stehen als eigene,
  milestone-förmige Einträge in derselben Liste, direkt vor dem Milestone, den sie gaten.
- Versions-Log dieses Projekts (Version ↔ Commit): [`versions.md`](versions.md).
```

- [ ] **Step 2: Commit**

```bash
git add docs/dashboard/README.md
git commit -m "docs(dashboard): README - mention checkpoint entry convention"
```

---

### Task 5: Final verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Re-render the dashboard and re-check the console**

Open `docs/dashboard/dashboard.html` in a browser (or the project's preview tool) one more time after all commits. Confirm no console errors and that the 13-card order from Task 1 Step 14 still holds.

- [ ] **Step 2: Diff review**

Run: `git log --oneline -6`

Expected: 5 commits from this plan (Tasks 1–4) on top of prior history, each with the exact messages used in the steps above.

- [ ] **Step 3: Run `/code-review` per CLAUDE.md §9**

This is a finished branch/worktree change about to need a git action (push/PR) — CLAUDE.md §9 requires `/code-review` before deciding push-direct-to-main vs. PR, then asking the user which.
