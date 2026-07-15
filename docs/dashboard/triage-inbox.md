# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-15 (nightly-triage-Lauf)

## Offen

- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten.
- 2026-07-09 · Test/todo · alarm_dosing_blocked-False-Positive (M2-Logik) — als todo-Test eingefroren (test/FeatureGroups.test.js), Fix ausstehend. Stand 2026-07-15: npm test zeigt weiterhin todo 1.
- 2026-07-09 · Follow-up · Branch claude/write-path-security-reviewer: merge-vs-drop bei M6 entscheiden. Stand 2026-07-15: lokal + origin weiterhin vorhanden.
- 2026-07-14 · M5.9-Koordination · SR-07 (CI-Audit-Teil) ist bereits umgesetzt in PR #5 (chore(ci): Dependabot + npm audit): CI führt jetzt `npm audit --audit-level=high` nach `npm ci`. M5.9-Session: den SR-07-CI-Audit-Unterpunkt als erledigt markieren, NICHT erneut hinzufügen — offen bleibt nur `--ignore-scripts` für Agent-Installs. `.github/dependabot.yml` (Freshness-Update-PRs) ist komplementär, kein Overlap mit dem geplanten Package-Guard-Hook. → In M5.9-Plan Task 8 eingearbeitet (2026-07-14).
- 2026-07-14 · Routine/Anomalie (wiederkehrend) · Nightly-Lauf läuft weiterhin auf dem jeweils ausgecheckten Feature-Branch statt `main` (Routine-Regel „nicht wechseln" befolgt, kein Checkout). 2026-07-14 war es `m5.9-package-guard-slopsquatting` (171 Tests); 2026-07-15 `m5.8-getreadings-completion` (239 Tests). Baseline main = 156. Folge: gemeldete Test-Zahlen stammen vom Feature-Branch, nicht von main. Beim nächsten Merge prüfen, ob main-Baseline wieder greift; grundsätzlich klären, ob die Routine den Startbranch fixieren soll.

## Neu (2026-07-15)

- 2026-07-15 · Lauf · Grün (auf Branch m5.8-getreadings-completion, s. Anomalie unter Offen): npm test 239 Tests / pass 239 / fail 0 / todo 1 · validate --level publish exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.5.1) · letzter CI-Lauf 29390759217 (main, schedule) success (23 s).

## Erledigt (2026-07-12)

- homeyCommunityTopicId in .homeycompose/app.json füllen (offen seit 2026-07-09) → **ERLEDIGT**: jetzt auf 157109 gesetzt (Support-Thread 157109, Commit b159544).
