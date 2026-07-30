# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-30 (nightly-triage-Lauf)

## Offen

- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten. Stand 2026-07-30: unverändert, keine neuen Traces.
- 2026-07-14 · Routine/Design (offen) · Soll die Nightly-Routine ihren Start-Branch fest auf `main` pinnen? Historisch lief sie auf dem jeweils ausgecheckten Feature-Branch (Regel „nicht wechseln"), was die gemeldeten Test-Zahlen verfälschte. Stand 2026-07-30: vierter Lauf in Folge auf `main` (366 Tests, Baseline korrekt) — Symptom trat nicht auf, die Design-Frage bleibt offen, solange die Routine keinen Branch fixiert.

## Neu (2026-07-30)

- 2026-07-30 · Lauf · **ALLES GRÜN** (auf `main`): npm test 366 Tests / pass 366 / fail 0 / todo 0 (6,8 s — Sprung von 311 auf 366 erklärt durch M8.1/Release 0.8.0) · `homey app validate --level publish` exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.8.0) · CI-Lauf 30516260816 (main, schedule) completed/success (30 s) · Worktree nach `validate` sauber (fünfte Bestätigung des `.gitattributes`-Fixes aus `57e0b4e`).

## Erledigt (2026-07-30)

- Routine/Lücke „sechs Nächte ohne `chore(triage)`-Commit" (offen seit 2026-07-28) → **GESCHLOSSEN (Beobachtungsauflage erfüllt, Ursache nicht rückwirkend belegbar)**: die Kette ist mit 07-28, 07-29 und 07-30 drei Nächte in Folge intakt (`git log --grep="chore(triage)"`), der Commit-Schritt der Routine funktioniert also. Eine Lauf-Historie liefert die Scheduler-API nicht, daher bleibt Scheduler-/Rechner-Ausfall die plausibelste, aber unbelegbare Ursache der Lücke 07-23…07-27. Bricht die Kette erneut, neu aufnehmen.
- Nightly-Lauf 2026-07-29 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

## Erledigt (2026-07-29)

- Nightly-Lauf 2026-07-28 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

## Erledigt (2026-07-28)

- Nightly-Lauf 2026-07-22 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

## Erledigt (2026-07-22)

- Branch `claude/write-path-security-reviewer` merge-vs-drop-Entscheidung (offen seit 2026-07-09) → **GESCHLOSSEN**: Branch existiert weder lokal noch auf `origin` (`git branch --list`/`-r` leer), also beim M7.0-Housekeeping-Checkpoint (2026-07-21) aufgelöst. Follow-up damit erledigt.

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
