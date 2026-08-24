---
name: milestone-checkpoint
description: Between-milestone housekeeping for this project - cleans up branches/worktrees, runs the native /doctor health check, checks for new automation opportunities, reviews/updates the third-party skill sources this project depends on, and runs a workflow retrospective that codifies recurring friction into hooks/docs/memory. Run between milestones per CLAUDE.md §7 / the dashboard's Mx.0 "Housekeeping Agentic Loop" checkpoint entries.
disable-model-invocation: true
---

# Milestone Checkpoint

Zwischen-Milestone-Housekeeping (CLAUDE.md §7). Jeder Schritt protokolliert sein Ergebnis im
`Mx.0`-`log[]` — ein nicht protokollierter Schritt sieht hinterher aus wie ein übersprungener.
Detailfakten stehen in `reference.md`, gelesen beim jeweiligen Schritt — darunter der Umgang mit vom Classifier blockierter Aufräumarbeit ausserhalb des Repos (sammeln und als Kommandoliste übergeben, nicht dagegen anarbeiten).

## Schritt 0: GitHub-MCP prüfen

`claude mcp get github` → „Connected"? Dazu ein echter Lese-Call (`list_branches`) — „Connected" prüft nur den Handshake, nicht die Rechte. Kein Server → Bootstrap Phase 0, nicht hier.

## Schritt 1: Branch-/Worktree-Cleanup

`git branch -vv`, `git branch -r`, `git worktree list`. Hinter jedem Fund eine kurze Erklärung (wozu
gehörte er; gemergt, verwaist oder aktiv?), dann per `AskUserQuestion` (multiSelect) anbieten, welche
gelöscht werden; danach Branches (lokal + origin) und Worktrees (`git worktree remove` inkl.
Verzeichnis) löschen. Keine Kandidaten ist ein gültiges Ergebnis — vermerken statt leer zu fragen.

## Schritt 2: /doctor-Lauf

`/doctor` (Alias `/checkup`) deckt Installations-Gesundheit, ungenutzte Skills/MCP/Plugins vs.
Kontext-Kosten, CLAUDE.md-Dedup/-Kürzung, langsame Hooks, Versions-Aktualität und zwei
Permission-Vorschläge ab.

- Der Command ist `disableModelInvocation` — die Session kann ihn NICHT selbst starten. Per
  `AskUserQuestion` den Nutzer bitten, `/doctor` einzutippen. Unbeaufsichtigte Session → überspringen,
  im `log[]` vermerken, im Handover (Schritt 9) als offenen Punkt nennen.
- „Auto Mode als Default" wird **angenommen**, nicht abgelehnt (CLAUDE.md §10: Auto Mode ist seit
  M9.0 der Normalfall). Der denial-basierte Vorschlag ersetzt die frühere
  `/fewer-permission-prompts`-Kuratierung — `permissions.allow` wird nicht mehr gepflegt, sondern
  dokumentiert Read-Only-Alltagsbefehle. Angewendetes + Abgelehntes ins `log[]`.

## Schritt 3: /claude-automation-recommender

Read-only — damit die Vorschläge nicht folgenlos verpuffen:
1. Die 1–2 Empfehlungen je Kategorie (MCP, Skill, Hook, Subagent, Plugin) als nummerierte Liste
   zusammenfassen (Kategorie + Name + ein Satz), per `AskUserQuestion` (multiSelect) anbieten,
   ausgewählte **in derselben Session** umsetzen.
2. Typ-spezifisch: **Hook** → Datei + Smoke-Test, in `.claude/settings.json` verdrahten mit einem
   `if`-Filter, der eine echte **Obermenge** des Hook-Prädikats ist, Suite grün, eigener Commit;
   generisch → 7a. **Skill/Subagent** → Datei anlegen, Tier per Frontmatter
   (`docs/superpowers/notes/2026-08-24-model-tiering.md`), smoke-testen. **Plugin/Marketplace** →
   `claude plugin marketplace add`/`install` nur nach ausdrücklicher Zustimmung (kein Lese-Vorgang).
   **MCP-Server** → `reference.md` § „Zu Schritt 3" (Cowork-Bundle vs. eigenständiges
   Marktplatz-Plugin; Scope-, Reload- und PAT-Fallen).
3. Nicht ausgewählte Empfehlungen NICHT stillschweigend fallen lassen — im `log[]` vermerken, was
   umgesetzt und was bewusst zurückgestellt wurde.

## Schritt 4: Skill-Quellen prüfen (Extension Hygiene)

Fremdcode in vertrautem Kontext — CLAUDE.md §5 verlangt **Review vor Adoption UND vor jedem Update**;
dieser Schritt ist die Durchsetzung. Einmal pro Checkpoint prüfen, dass `disableSkillShellExecution`
noch `true` ist und keine neue Quelle stillschweigend verlangt hat, ihn abzuschalten.
**Review-Gate für jede Git-Checkout-Quelle** — ein Update wird NIE ungelesen nachgezogen. Diff
sichten, bevor er `~/.claude/` erreicht, und den mechanischen Vorfilter laufen lassen (Kommando +
§5-Checkliste: `reference.md` § „Review-Gate"). **Jeder Treffer ist ein STOPP, keine Warnung.**
**Verdikt:** sauber (kein Treffer, Diff passt plausibel zu seinen Commit-Messages) → nachziehen, keine
Rückfrage. Jeder Treffer oder ein Diff zu groß zum wirklichen Lesen → NICHT kopieren, Funde wörtlich
zeigen (Datei + Zeile), Nutzer fragen; die alte Version bleibt liegen — ein veralteter Skill ist
strikt sicherer als ein ungeprüfter. Frischer Klon (`/tmp` geleert) = **Erstadoption**, dann den
ganzen Baum sichten. Verdikt im `log[]` protokollieren (Quelle, Commit-Range, Ergebnis).

**Quellen und Kommandos:** `reference.md` § „Zu Schritt 4" — die zwei Git-Checkout-Skills (homey-cli,
homey-app) mit Fetch-/Kopier-Ablauf, plus die Plugin-Update-Regel (`<name>@<marketplace>`; der bloße
Name schlägt fehl, Update greift erst nach Neustart). Marketplace ≠ geprüft: beim Melden dazusagen,
dass der Inhalt von hier aus nicht inspiziert wurde.

## Schritt 5: Workflow-Retrospektive (Optimizer)

Wiederkehrende Fehler in dauerhafte Absicherung überführen (Design:
`docs/superpowers/specs/2026-07-05-workflow-retro-optimizer-design.md`).
1. **Zwei Signalquellen — zusammengeführt, nicht getrennt analysiert.** **Lokal:**
   `FRICTION:`-Einträge in den Dashboard-`log[]`, `feedback`-Memories, Git-Verlauf (≥2 gleichartige
   `fix:`/`revert:`-Commits an derselben Datei) und `.claude/hooks/hook-log.jsonl` — den Ledger
   deterministisch auszählen statt überfliegen (Kommando für Blocks + `durationMs`-Median je Hook,
   Ledger-Vorgeschichte und Fake-Record-Falle: `reference.md` § „Zu Schritt 5"); viele Blocks
   desselben Hooks = wiederkehrende Reibungsklasse, ein auffällig teurer Hook ist selbst ein Befund.
   **`/insights`:** wie `/doctor` ein Command, den nur der Nutzer starten kann — zu **Beginn** der
   Retro per `AskUserQuestion` darum bitten; unbeaufsichtigt → überspringen, im `log[]` vermerken, im
   Handover nennen. Seine Befunde werden **mit dem lokalen Signal zusammengeführt** und laufen durch
   dieselbe Gewichtung und Auswahl (Punkt 3) — kein eigener Analyse-Schritt, keine zweite Liste.
   **Delta beachten:** was `/insights` zeigt und das FRICTION-Log nicht, ist selbst ein Befund — eine
   Reibungsklasse, die niemand geloggt hat, obwohl §7 das im Moment des Auftretens verlangt.
   Delta-Liste ins `log[]`.
2. **Clustern** zu eigenständigen Problemen, Häufigkeit zählen, **Root-Cause** je Problem (dreimal
   „warum": passiert · wiederholt · vor dem Commit nicht gefangen). **In Scope nur: ≥2× gesehen ODER
   vom Nutzer markiert** („nochmal", „zum dritten Mal"). Einzelfälle überspringen (YAGNI).
3. **Impact gewichten und auswählen** — EINE gemeinsame Liste über beide Quellen, nach Häufigkeit ×
   Kosten sortiert, per `AskUserQuestion` (multiSelect) zur Umsetzung angeboten.
4. **Codifizierungs-Ebene** — verlässlichste zuerst, ein Problem darf mehrere bekommen: **a. Hook**
   (mechanisch prüfbar → automatischer Guard) · **b. HOMEY.md / CLAUDE.md** (Prozessregel) ·
   **c. `feedback`-Memory** · **d. Skill-Edit**. Höchste Ebene bevorzugen, die das Problem
   *vollständig* abdeckt; jeder neue Hook bringt einen Smoke-Test mit.
5. **Anwenden + verifizieren**, kleine reversible Änderung, eigener Commit, dann protokollieren:
   `Problem → Root-Cause → Ebene → Änderung → verifiziert`. Leeres Signal = No-op, kurz vermerken.

## Schritt 6: Memory-Konsolidierung

`consolidate-memory`-Skill ausführen (Dreaming-Muster, M4.8): Sessions seit dem letzten Checkpoint
sichten, `MEMORY.md` + Einzeldateien eindampfen. Nur der Memory-Ordner — die CLAUDE.md-Seite deckt
`/doctor` ab. **HARTE REGELN:** Ergebnis IMMER als Diff vorlegen, NIE direkt anwenden; offene
Follow-ups und Security-Notizen NIE löschen.

## Schritt 7: Framework-Abgleich

**7a — Drift Projekt → Framework (M4.9).** `git log --since=<letzter Checkpoint> --oneline --
.claude/hooks .claude/skills .claude/agents CLAUDE.md` sichten: Ist eine Änderung GENERISCH? Dann in
`C:/Users/TorstenSturm/source/repos/skill-agentic-loop-framework` die Vorlage (`templates/` bzw.
`homey/`) nachziehen + CHANGELOG; Commit dort nach §9-Freigabe. **Vor dem Editieren eine Tabelle
zeigen, nicht aus dem Gedächtnis spiegeln** — zweimal ging genau hier ein Teil verloren: erst jede
betroffene Datei über alle Repos hinweg auflisten (`Repo | Pfad | Ist | Soll`, im Framework fehlende
als eigene Zeile „fehlt dort"), dann editieren, dann die Tabelle erneut zeigen als Nachweis. Ohne die
zweite Tabelle ist die Spiegelung eine Behauptung. EOL-normalisiert vergleichen
(`git diff --no-index --ignore-cr-at-eol`), sonst zählen CRLF/LF-Unterschiede als Drift.

**7b — Native-Feature-Review (Framework → Plattform).** Das Framework wächst nur, wenn nie jemand
fragt, was es abwerfen kann — ein dupliziertes Feature ist schlimmer als keins, weil es still vom
echten Verhalten wegdriftet. Ledger `docs/dashboard/native-feature-review.md`: eine Zeile je Artefakt
mit letztem Verdikt + Datum, und NICHT alle neu aufrollen — nur die, deren `Zuletzt geprüft` älter
ist als die aktuellen Release Notes.
Ablauf: **Plattform-Delta** holen (Release Notes, `code.claude.com/docs`; Claude Desktop mitdenken —
Versions-Aktualität prüft `/doctor`, hier nicht doppeln) · **eigene Artefakte inventarisieren**
(`CLAUDE.md`-Abschnitte, `.claude/skills|hooks|agents/`), Neues bekommt eine frische Ledger-Zeile ·
**Verdikt je Kandidat** (`replace` / `keep + note` / `keep` — Definitionen und Zweifelsregeln in
`reference.md` § „Zu Schritt 7b", die Latte hoch hängen) · **anwenden**: `replace` als kleine
reversible Änderung mit eigenem Commit, generische über 7a ins Framework, und bei JEDER angefassten
Zeile das `Zuletzt geprüft`-Datum aktualisieren. Protokollieren: `<n> geprüft → <n> ersetzt / <n>
behalten`, mit Namen.

## Schritt 8: Dashboard aktualisieren

Den aktiven `Mx.0`-Eintrag über `dashboard-sync` schließen: `status: "done"`, `finishedAt` = heute,
alle Steps abgehakt, je ein `log[]`-Eintrag pro Schritt 1–7. Dabei für JEDEN offenen Milestone
`recommendedModel` prüfen (`docs/superpowers/notes/2026-08-24-model-tiering.md`) — fehlt es oder ist
der Scope spürbar anders geworden, neu ableiten; sonst unverändert lassen.

## Schritt 9: Handover

Den nächsten `status: "todo"`-Milestone (erster in Listenreihenfolge) lesen; fehlt sein
`recommendedModel`, jetzt nachtragen — der Handover ist der Moment, in dem jemand entscheidet, mit
welchem Modell die nächste Session startet. Dann PushNotification aufs Handy: Titel `Nächster
Milestone: <id> — <title>`, Text = Kurzfassung + `Start per /remote-control <id>` (der volle Prompt
steht im Dashboard, Push hat Längenlimits); kein Push-Kanal → Prompt-Kopf im Chat zeigen und das
loggen. Zuletzt fragen, ob der Milestone direkt in dieser Session starten soll.

## Bericht

Kurz zusammenfassen: aktualisierte Skill-Quellen, installierte Plugin-Versionen (ohne Aussage über
ihre Aktualität — die lässt sich von hier aus nicht feststellen), umgesetzte bzw. zurückgestellte
Recommender-Empfehlungen, Ergebnis der Retro (welche Probleme in welche Ebene codifiziert wurden,
plus die `/insights`-Delta-Liste, oder „keine neue Reibung") und Ergebnis des Native-Feature-Reviews.
Der Bericht endet mit zwei Zeilen (CLAUDE.md §7): **verifiziert** — was tatsächlich ausgeführt wurde,
mit Kommando/Ergebnis — und **angenommen** — was ungeprüft übernommen wurde. Ein übersprungener
Schritt (z. B. `/doctor`, `/insights`) gehört in die zweite Zeile, nicht still in die erste.
