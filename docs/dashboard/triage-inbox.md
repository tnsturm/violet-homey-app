# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-21 (nightly-triage-Lauf)

## Offen

- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten. Stand 2026-07-21: unverändert, keine neuen Traces.
- 2026-07-09 · Follow-up · Branch `claude/write-path-security-reviewer`: merge-vs-drop bei M6 entscheiden. Stand 2026-07-21: unverändert offen — beim M7.0-Checkpoint gezielt entscheiden.
- 2026-07-14 · Routine/Design (offen) · Soll die Nightly-Routine ihren Start-Branch fest auf `main` pinnen? Historisch lief sie auf dem jeweils ausgecheckten Feature-Branch (Regel „nicht wechseln"), was die gemeldeten Test-Zahlen verfälschte. Stand 2026-07-21: Lauf fand erneut auf `main` statt (311 Tests, Baseline korrekt) — Symptom trat nicht auf, die Design-Frage bleibt offen, solange die Routine keinen Branch fixiert.

## Neu (2026-07-21)

- 2026-07-21 · Lauf · **Lokal grün, CI rot** (auf `main`): npm test 311 Tests / pass 311 / fail 0 / todo 0 (9,8 s) · `homey app validate --level publish` exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.7.3) · CI-Lauf 29804169882 (main, schedule) hing in `npm test` → als eigener Befund aufgenommen und noch am selben Tag behoben (siehe „Erledigt").

## Erledigt (2026-07-21)

- CI-Hang seit 2026-07-20 14:34 (sechs Läufe je 6 h `cancelled`, ~36 h Runner-Zeit) → **BEHOBEN** in `d46367e`, verifiziert durch Lauf 29839226188 (`eb798832`, success in 19 s — erster grüner Lauf seit 29720050999). Ursache war **nicht** die vermutete M6.1-Testdatei: seit M6.1 bindet `onInit()` den NOTIFY-Listener (`drivers/pool/device.js:149`), freigegeben nur von `onUninit()`. Die älteren Dateien `test/drivers/pool.device.test.js` und `pool.device.config.test.js` gaben ihre Devices nie frei → Listener auf `0.0.0.0:22222` blieb offen → der Testprozess endete nie. Lokal unsichtbar, weil Port 22222 auf der Dev-Maschine belegt ist: der Bind scheitert, der Fehler wird per Design geschluckt (SR-M6-07), es entsteht kein Handle. Fix: `after()`-Hook gibt alle Devices frei und prüft, dass kein gebundener Handle übrig bleibt (Gegenprobe rot verifiziert). Zusätzlich `timeout-minutes: 10` in `.github/workflows/ci.yml`, damit ein künftiger Hang binnen Minuten statt nach 6 h auffällt. Reproduziert wurde er in Docker (linux/node22, 4 Kerne) — die Suite ist auf Linux und Windows grün.
- `app.json` dauerhaft ungesichert im Worktree (offen seit 2026-07-19, real seit 2026-07-17) → **ERLEDIGT** in `57e0b4e`. Es war nie ein Überbleibsel, sondern ein Karussell: die Root-`app.json` ist generiert, Homey Compose schreibt sie bei jedem `build`/`run`/`validate` mit LF neu, während git sie unter `core.autocrlf=true` als CRLF erwartet — inhaltlich identisch (gleicher Blob-SHA), nur 2355 fehlende `\r`, eines pro Zeile. Die Nightly führt selbst `validate` aus und erzeugte den Zustand damit jede Nacht neu; ein `git checkout` hätte genau bis zum nächsten Lauf gehalten. Fix: `.gitattributes` mit `app.json text eol=lf` plus einmaligem `git add --renormalize` (kein Inhaltsdiff). Verifiziert: zwei aufeinanderfolgende `validate`-Läufe lassen den Worktree sauber. Hinweis: bestehende Zweit-Checkouts/Worktrees brauchen dort einmalig dasselbe `git add --renormalize app.json`; frische Clones sind ab sofort korrekt.
- Lokales `main` 3 Commits vor `origin/main` (aufgenommen 2026-07-21) → **ERLEDIGT**: mit `eb79883` gepusht; `origin/main` == lokales `main`.
- Detached-HEAD-Verdacht der Nightly (offen seit 2026-07-19) → **GESCHLOSSEN (nicht reproduzierbar)**: zweite Nightly in Folge blieb über den gesamten Lauf auf `main` (`git branch --show-current` = main vor und nach dem Inbox-Commit). Beobachtungsauflage aus dem 2026-07-20-Eintrag damit erfüllt.

## Erledigt (2026-07-17)

- alarm_dosing_blocked-False-Positive (M2-Logik), als todo-Test eingefroren (offen seit 2026-07-09) → **ERLEDIGT**: npm test zeigt jetzt `todo 0`; die korrekte Erwartung ist als regulärer, grüner Test verankert (`test/FeatureGroups.test.js:205` — „CL_DOSING_CONTROLLER alone is normal operation, not a block").
- SR-07 CI-Audit-Unterpunkt (M5.9-Koordination, offen seit 2026-07-14) → **ERLEDIGT**: M5.9 abgeschlossen; `npm audit --audit-level=high` nach `npm ci` in CI aktiv, `--ignore-scripts` für Agent-Installs umgesetzt. Koordinationsnotiz damit discharged.

## Erledigt (2026-07-12)

- homeyCommunityTopicId in .homeycompose/app.json füllen (offen seit 2026-07-09) → **ERLEDIGT**: jetzt auf 157109 gesetzt (Support-Thread 157109, Commit b159544).
