---
name: milestone-checkpoint
description: Between-milestone housekeeping for this project - tightens tool permissions, checks for new automation opportunities, checks/updates the Homey skill sources this project depends on, and runs a workflow retrospective that codifies recurring friction into hooks/docs/memory. Run between milestones per CLAUDE.md §7 point 4 / the dashboard's →Mx checkpoint entries.
disable-model-invocation: true
---

# Milestone Checkpoint

Führt die Zwischen-Milestone-Housekeeping aus CLAUDE.md §7 Punkt 4 in einem Rutsch aus, statt
mehrere Skills einzeln aufzurufen.

## Schritte

1. `/fewer-permission-prompts` ausführen.
2. `/claude-automation-recommender` ausführen.
3. Skill-Quellen prüfen (siehe unten).
4. **Workflow-Retrospektive / Optimizer** ausführen (siehe unten) — wiederkehrende Reibung aus dem
   abgeschlossenen Milestone in eine dauerhafte Absicherung überführen.
5. **Memory-Konsolidierung** (siehe unten) — Memory-Dateien eindampfen, Ergebnis nur als Diff.
6. Den aktiven `→Mx`-Checkpoint-Eintrag in `docs/dashboard/dashboard.html` aktualisieren:
   `status: "done"`, `finishedAt` = heute, alle Steps abgehakt, je ein `log[]`-Eintrag mit
   kurzer Zusammenfassung der Schritte 1–5.
7. **Handover** (siehe unten) — den nächsten Milestone als Push aufs Handy übergeben.

## Schritt 3: Skill-Quellen prüfen

Drei Quellen, drei unterschiedliche Update-Wege — nicht alle sind automatisierbar.

### homey-cli-skill (github.com/timvdhoorn/homey-cli-skill)

```bash
git -C /tmp/homey-cli-skill fetch --quiet
git -C /tmp/homey-cli-skill log HEAD..origin/HEAD --oneline
```

Existiert `/tmp/homey-cli-skill` nicht (z. B. weil `/tmp` zwischenzeitlich geleert wurde), frisch
klonen: `git clone https://github.com/timvdhoorn/homey-cli-skill.git /tmp/homey-cli-skill`.

Ist die Ausgabe **nicht leer** (Update vorhanden), automatisch nachziehen — keine Rückfrage nötig:

```bash
git -C /tmp/homey-cli-skill pull --quiet
rm -rf ~/.claude/skills/homey-cli/*
cp -r /tmp/homey-cli-skill/* ~/.claude/skills/homey-cli/
```

### homey-app-skill (github.com/dvflw/homey-app-skill)

Gleiches Vorgehen, Pfade `/tmp/homey-app-skill` → `~/.claude/skills/homey-app/`:

```bash
git -C /tmp/homey-app-skill fetch --quiet
git -C /tmp/homey-app-skill log HEAD..origin/HEAD --oneline
```

Bei Update:

```bash
git -C /tmp/homey-app-skill pull --quiet
rm -rf ~/.claude/skills/homey-app/*
cp -r /tmp/homey-app-skill/* ~/.claude/skills/homey-app/
```

### Superpowers (claude-plugins-official Marketplace)

**Nicht automatisierbar von hier aus.** Superpowers ist kein Git-Checkout — es kommt über Claude
Codes eigenen Marketplace-Sync (`claude-plugins-official`), unabhängig vom Zustand von
`github.com/obra/Superpowers`. Der einzige Update-Weg ist `claude plugin update superpowers`,
was einen Neustart braucht und nicht aus einer laufenden Session heraus ausgelöst werden kann.

Nur melden: `claude plugin list | grep superpowers` (installierte Version), und den Nutzer bitten,
bei Bedarf selbst `claude plugin update superpowers` in einer interaktiven Session auszuführen.

**Kein Marketplace-Ersatz für homey-cli-skill/homey-app-skill**: `claude plugin marketplace add
<repo>` scheitert an beiden, da keines ein `.claude-plugin/marketplace.json`-Manifest hat (getestet
2026-07-02). Ein Fork nur für dieses Manifest wäre mehr Wartungsaufwand als der jetzige Ansatz.

## Schritt 4: Workflow-Retrospektive (Optimizer)

Wiederkehrende, gleichartige Fehler in dauerhafte Absicherung überführen, damit sie nicht erneut
auftreten. Vollständiges Design: `docs/superpowers/specs/2026-07-05-workflow-retro-optimizer-design.md`.

1. **Signal sammeln** für den abgeschlossenen Milestone: `feedback`-Memories (Memory-Ordner),
   `FRICTION:`-Einträge in den Dashboard-`log[]`, und der Git-Verlauf (wiederholte `fix:`/`revert:`-
   Commits, Commit der einen direkt vorigen korrigiert, ≥2 gleichartige Fix-Commits an derselben Datei).
   Zusätzlich `.claude/hooks/hook-log.jsonl` auslesen (Block-Zählungen je Hook seit dem letzten
   Checkpoint statt Erinnerung — M4.8; viele Blocks desselben Hooks = wiederkehrende Reibungsklasse).
2. **Clustern** zu eigenständigen Problemen; Häufigkeit zählen. **In Scope nur: ≥2× gesehen ODER vom
   Nutzer markiert** („nochmal", „zum dritten Mal"). Einzelfälle überspringen (YAGNI).
3. **Root-Cause** je Problem (dreimal „warum": passiert · wiederholt · vor dem Commit nicht gefangen).
4. **Codifizierungs-Ebene wählen** — verlässlichste zuerst; ein Problem darf mehrere bekommen:
   **a. Hook** (mechanisch prüfbar → automatischer Guard; unvergesslich) ·
   **b. HOMEY.md / CLAUDE.md** (Prozess-/Konventionsregel) ·
   **c. `feedback`-Memory** (sitzungsübergreifende Guidance) ·
   **d. Skill-Edit** (ein Skill-Schritt ist selbst falsch).
   Höchste Ebene bevorzugen, die das Problem *vollständig* abdeckt. Jeder neue Hook bringt einen
   Smoke-Test mit (wie `secrets-guard` / `json-guard`) und wird in `.claude/settings.json` verdrahtet.
5. **Anwenden + verifizieren** (Hook-Smoke-Test grün; Regel/Memory landet). Kleine, reversible
   Änderung, eigener Commit.
6. **Protokollieren** im `→Mx`-`log[]`: `Problem → Root-Cause → Ebene → Änderung → verifiziert`.

Ist das Signal leer (nichts wiederholte sich), ist dieser Schritt ein No-op — nur kurz vermerken.

## Schritt 5: Memory-Konsolidierung (Dreaming-Muster, M4.8)

Sessions seit dem letzten Checkpoint sichten (`search_session_transcripts`, falls verfügbar —
sonst Dashboard-`log[]` und `git log` als Quellen), dann die Dateien im Memory-Ordner
(`MEMORY.md` + Einzeldateien) konsolidieren:

- **Deduplizieren/kürzen**: Erledigtes eindampfen (z. B. trägt `project-status` volle
  Detailhistorien abgeschlossener Milestones, die eine Zeile + Verweis sein können).
- **Widersprüche auflösen**: veraltete Aussagen korrigieren (z. B. "ab nächster Session aktiv",
  wenn es längst live ist).
- **HARTE REGELN**: das Ergebnis IMMER als Diff zum Review präsentieren, NIE direkt anwenden;
  offene Follow-ups und Security-Notizen NIE löschen; im Zweifel behalten.

## Schritt 7: Handover (M4.8)

1. Aus dem `DASHBOARD_STATUS`-Block den NÄCHSTEN Milestone mit `status: "todo"` (erster in
   Listenreihenfolge) lesen.
2. Push-Benachrichtigung aufs Handy senden (PushNotification): Titel `Nächster Milestone: <id>
   — <title>`, Text = Kurzfassung (erste Prompt-Zeilen) + Hinweis `Start per /remote-control
   <id>` (der volle Prompt steht im Dashboard; Push hat Längenlimits). Kein Push-Kanal
   verfügbar → Prompt-Kopf im Chat zeigen und das im Log vermerken.
3. Fragen, ob der Milestone direkt in dieser Session gestartet werden soll.

## Bericht

Am Ende kurz zusammenfassen: was wurde aktualisiert (homey-cli-skill / homey-app-skill, falls
zutreffend), die installierte Superpowers-Version (ohne Aussage darüber, ob sie veraltet ist —
das lässt sich von hier aus nicht feststellen), und das Ergebnis der Workflow-Retrospektive
(welche wiederkehrenden Probleme in welche Ebene codifiziert wurden, oder „keine neue Reibung").
