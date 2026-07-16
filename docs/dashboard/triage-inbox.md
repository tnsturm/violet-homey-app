# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-16 (nightly-triage-Lauf)

## Offen

- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten.
- 2026-07-09 · Test/todo · alarm_dosing_blocked-False-Positive (M2-Logik) — war als todo-Test eingefroren (test/FeatureGroups.test.js). Stand 2026-07-16: auf Branch m6.1 zeigt npm test todo 0; der frühere todo-Test ist jetzt eine reguläre grüne Assertion (test/FeatureGroups.test.js:205 „CL_DOSING_CONTROLLER alone is normal operation, not a block") — offenbar gefixt. Beim Merge auf main bestätigen, dann nach Erledigt verschieben.
- 2026-07-09 · Follow-up · Branch claude/write-path-security-reviewer: merge-vs-drop bei M6 entscheiden. Stand 2026-07-16: lokal + origin weiterhin vorhanden; M6.0-Housekeeping hat den write-path-security-reviewer-Subagenten reaktiviert (commit 8149947), daher überlebte der Branch die Cleanup-Runde — Entscheidung weiterhin offen.
- 2026-07-14 · M5.9-Koordination · SR-07 (CI-Audit-Teil) ist bereits umgesetzt in PR #5 (chore(ci): Dependabot + npm audit): CI führt jetzt `npm audit --audit-level=high` nach `npm ci`. M5.9-Session: den SR-07-CI-Audit-Unterpunkt als erledigt markieren, NICHT erneut hinzufügen — offen bleibt nur `--ignore-scripts` für Agent-Installs. `.github/dependabot.yml` (Freshness-Update-PRs) ist komplementär, kein Overlap mit dem geplanten Package-Guard-Hook. → In M5.9-Plan Task 8 eingearbeitet (2026-07-14).
- 2026-07-14 · Routine/Anomalie (wiederkehrend) · Nightly-Lauf läuft weiterhin auf dem jeweils ausgecheckten Feature-Branch statt `main` (Routine-Regel „nicht wechseln" befolgt, kein Checkout). Historie: 2026-07-14 `m5.9-package-guard-slopsquatting` (171 Tests); 2026-07-15 `m5.8-getreadings-completion` (239 Tests); 2026-07-16 `claude/violet-http-notifications-m6-1-1976f1` (261 Tests). Baseline main = 156. Zusätzlich am 2026-07-16: Worktree hatte vorbestehende ungesicherte Änderungen (app.json, docs/dashboard/dashboard.html) — unangetastet gelassen. Folge: gemeldete Test-Zahlen stammen vom Feature-Branch, nicht von main. Beim nächsten Merge prüfen, ob main-Baseline wieder greift; grundsätzlich klären, ob die Routine den Startbranch fixieren soll.

## Neu (2026-07-16)

- 2026-07-16 · Lauf · Grün (auf Branch claude/violet-http-notifications-m6-1-1976f1, s. Anomalie unter Offen): npm test 261 Tests / pass 261 / fail 0 / todo 0 · validate --level publish exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.6.2) · letzter CI-Lauf 29473635842 (main, schedule) success (23 s). Reconcile: credential-rotation.md vorhanden, homeyCommunityTopicId=157109 gesetzt (beide erledigt); todo alarm_dosing_blocked auf diesem Branch verschwunden (s. Offen).

## Erledigt (2026-07-12)

- homeyCommunityTopicId in .homeycompose/app.json füllen (offen seit 2026-07-09) → **ERLEDIGT**: jetzt auf 157109 gesetzt (Support-Thread 157109, Commit b159544).
