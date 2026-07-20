# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-20 (nightly-triage-Lauf)

## Offen

- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten. Stand 2026-07-20: unverändert, keine neuen Traces.
- 2026-07-09 · Follow-up · Branch `claude/write-path-security-reviewer`: merge-vs-drop bei M6 entscheiden. Stand 2026-07-20: unverändert offen — beim nächsten Checkpoint gezielt entscheiden.
- 2026-07-14 · Routine/Design (offen) · Soll die Nightly-Routine ihren Start-Branch fest auf `main` pinnen? Historisch lief sie auf dem jeweils ausgecheckten Feature-Branch (Regel „nicht wechseln"), was die gemeldeten Test-Zahlen verfälschte. Stand 2026-07-20: Lauf fand erneut auf `main` statt (261 Tests, Baseline korrekt) — Symptom trat nicht auf, die Design-Frage bleibt offen, solange die Routine keinen Branch fixiert.
- 2026-07-19 · Hygiene (klein) · `app.json` liegt seit mindestens 2026-07-17 ungesichert im Worktree (Diff nur Zeilenenden-Warnung, kein inhaltlicher Unterschied sichtbar). Von der Routine unangetastet gelassen; bei nächster Session einmal aufräumen (checkout oder committen). Stand 2026-07-20: unverändert vorhanden.
- 2026-07-19 · Routine/Git (auffällig, nicht reproduzierbar) · Der Inbox-Commit der Nightly vom 2026-07-19 landete zunächst auf einem **detached HEAD** (abgekoppelt von `b1bec6b`), obwohl die Routine auf `main` startete; damals repariert (`0f19fea` sitzt korrekt auf `main`). Ursache weiter offen. Stand 2026-07-20: **nicht wiederaufgetreten** — HEAD blieb über den gesamten Lauf auf `main`. Noch eine Nightly beobachten, dann ggf. schließen.

## Neu (2026-07-20)

- 2026-07-20 · Lauf · **Grün** (auf `main`): npm test 261 Tests / pass 261 / fail 0 / todo 0 · validate --level publish exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.6.2) · letzter CI-Lauf 29720050999 (main, schedule) success (29 s).

## Erledigt (2026-07-17)

- alarm_dosing_blocked-False-Positive (M2-Logik), als todo-Test eingefroren (offen seit 2026-07-09) → **ERLEDIGT**: npm test zeigt jetzt `todo 0`; die korrekte Erwartung ist als regulärer, grüner Test verankert (`test/FeatureGroups.test.js:205` — „CL_DOSING_CONTROLLER alone is normal operation, not a block").
- SR-07 CI-Audit-Unterpunkt (M5.9-Koordination, offen seit 2026-07-14) → **ERLEDIGT**: M5.9 abgeschlossen; `npm audit --audit-level=high` nach `npm ci` in CI aktiv, `--ignore-scripts` für Agent-Installs umgesetzt. Koordinationsnotiz damit discharged.

## Erledigt (2026-07-12)

- homeyCommunityTopicId in .homeycompose/app.json füllen (offen seit 2026-07-09) → **ERLEDIGT**: jetzt auf 157109 gesetzt (Support-Thread 157109, Commit b159544).
