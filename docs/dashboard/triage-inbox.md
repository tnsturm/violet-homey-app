# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-14 (nightly-triage-Lauf)

## Offen

- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten.
- 2026-07-09 · Test/todo · alarm_dosing_blocked-False-Positive (M2-Logik) — als todo-Test eingefroren (test/FeatureGroups.test.js), Fix ausstehend. Stand 2026-07-14: npm test zeigt weiterhin todo 1.
- 2026-07-09 · Follow-up · Branch claude/write-path-security-reviewer: merge-vs-drop bei M6 entscheiden. Stand 2026-07-14: lokal + origin weiterhin vorhanden.
- 2026-07-14 · M5.9-Koordination · SR-07 (CI-Audit-Teil) ist bereits umgesetzt in PR #5 (chore(ci): Dependabot + npm audit): CI führt jetzt `npm audit --audit-level=high` nach `npm ci`. M5.9-Session: den SR-07-CI-Audit-Unterpunkt als erledigt markieren, NICHT erneut hinzufügen — offen bleibt nur `--ignore-scripts` für Agent-Installs. `.github/dependabot.yml` (Freshness-Update-PRs) ist komplementär, kein Overlap mit dem geplanten Package-Guard-Hook. → In M5.9-Plan Task 8 eingearbeitet (2026-07-14, diese Session).
- 2026-07-14 · Routine/Anomalie · Nightly-Lauf lief auf Branch `m5.9-package-guard-slopsquatting` statt `main` (Routine-Regel „nicht wechseln" befolgt, kein Checkout). Folge: npm-Test-Zahlen (171) stammen vom Feature-Branch, nicht von main (Baseline 156). Beim M5.9-Merge prüfen, ob main-Baseline-Zahlen wieder greifen; ggf. Routine-Startbranch klären.

## Neu (2026-07-14)

- 2026-07-14 · Lauf · Grün (auf Branch m5.9-package-guard-slopsquatting, s. Anomalie unter Offen): npm test 171 Tests / pass 170 / fail 0 / todo 1 · validate --level publish exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.4.7) · letzter CI-Lauf 29307799952 auf main success (27 s, schedule).

## Erledigt (2026-07-12)

- homeyCommunityTopicId in .homeycompose/app.json füllen (offen seit 2026-07-09) → **ERLEDIGT**: jetzt auf 157109 gesetzt (Support-Thread 157109, Commit b159544).
