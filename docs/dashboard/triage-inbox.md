# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-21 (nightly-triage-Lauf)

## Offen

- 2026-07-21 · CI (ROT, blockierend) · **Jeder CI-Lauf seit 2026-07-20 14:34 hängt in `npm test` und wird nach dem 6-h-Timeout `cancelled`.** Betroffen: 29751228472 (PR `claude/violet-http-notifications-m6-1-1976f1`), 29753271932, 29753858261, 29754191106, 29775639961, 29777775033 — alle 6h0m; der heutige Schedule-Lauf 29804169882 stand nach 36 min immer noch in `npm test`. Letzter grüner Lauf: 29720050999 (2026-07-20 05:50, 29 s). Bracket = die M6.1-Serie (Inbound-NOTIFY-Listener). Lokal ist die Suite grün in ~10 s (311/311), d. h. der Hang ist CI-spezifisch — Verdacht: offener Handle/Port aus dem echten HTTP-Listener in `test/NotifyServer.server.test.js` bzw. `test/drivers/pool.device.notify.test.js` (`lib/NotifyServer.js`), der den Node-Test-Runner auf ubuntu-latest nicht beenden lässt. Nächste Session: reproduzieren (z. B. `node --test` mit Handle-Dump), Listener in den Tests sicher schließen, und im Workflow ein `timeout-minutes` setzen, damit ein Hang nicht 6 h Runner-Zeit verbrennt.
- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten. Stand 2026-07-21: unverändert, keine neuen Traces.
- 2026-07-09 · Follow-up · Branch `claude/write-path-security-reviewer`: merge-vs-drop bei M6 entscheiden. Stand 2026-07-21: unverändert offen — beim M7.0-Checkpoint gezielt entscheiden.
- 2026-07-14 · Routine/Design (offen) · Soll die Nightly-Routine ihren Start-Branch fest auf `main` pinnen? Historisch lief sie auf dem jeweils ausgecheckten Feature-Branch (Regel „nicht wechseln"), was die gemeldeten Test-Zahlen verfälschte. Stand 2026-07-21: Lauf fand erneut auf `main` statt (311 Tests, Baseline korrekt) — Symptom trat nicht auf, die Design-Frage bleibt offen, solange die Routine keinen Branch fixiert.
- 2026-07-19 · Hygiene (klein) · `app.json` liegt seit mindestens 2026-07-17 ungesichert im Worktree (Diff nur Zeilenenden-Warnung, kein inhaltlicher Unterschied sichtbar). Von der Routine unangetastet gelassen; bei nächster Session einmal aufräumen (checkout oder committen). Stand 2026-07-21: unverändert vorhanden.
- 2026-07-21 · Hygiene (klein) · Lokales `main` ist **3 Commits vor `origin/main`** (`cdeae28`, `650be2c`, `e27ca49` — Checkpoint-/Retro-/Hook-Arbeit). Von der Routine nicht gepusht (Regel: nichts pushen); bei nächster Session pushen oder bewusst verwerfen. Hinweis: der Push löst CI aus, die derzeit hängt (siehe CI-Befund oben).

## Neu (2026-07-21)

- 2026-07-21 · Lauf · **Lokal grün, CI rot** (auf `main`): npm test 311 Tests / pass 311 / fail 0 / todo 0 (9,8 s) · `homey app validate --level publish` exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.7.3) · CI-Lauf 29804169882 (main, schedule) seit 36 min `in_progress`, hängt in `npm test` → eigener Befund unter „Offen".

## Erledigt (2026-07-21)

- Detached-HEAD-Verdacht der Nightly (offen seit 2026-07-19) → **GESCHLOSSEN (nicht reproduzierbar)**: zweite Nightly in Folge blieb über den gesamten Lauf auf `main` (`git branch --show-current` = main vor und nach dem Inbox-Commit). Beobachtungsauflage aus dem 2026-07-20-Eintrag damit erfüllt.

## Erledigt (2026-07-17)

- alarm_dosing_blocked-False-Positive (M2-Logik), als todo-Test eingefroren (offen seit 2026-07-09) → **ERLEDIGT**: npm test zeigt jetzt `todo 0`; die korrekte Erwartung ist als regulärer, grüner Test verankert (`test/FeatureGroups.test.js:205` — „CL_DOSING_CONTROLLER alone is normal operation, not a block").
- SR-07 CI-Audit-Unterpunkt (M5.9-Koordination, offen seit 2026-07-14) → **ERLEDIGT**: M5.9 abgeschlossen; `npm audit --audit-level=high` nach `npm ci` in CI aktiv, `--ignore-scripts` für Agent-Installs umgesetzt. Koordinationsnotiz damit discharged.

## Erledigt (2026-07-12)

- homeyCommunityTopicId in .homeycompose/app.json füllen (offen seit 2026-07-09) → **ERLEDIGT**: jetzt auf 157109 gesetzt (Support-Thread 157109, Commit b159544).
