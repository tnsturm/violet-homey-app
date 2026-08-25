# Triage-Inbox

Nächtliche Befund-Sammlung der Triage-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

Seit 2026-08-24 (Checkpoint M9.0, Vorschlag A5) gibt es **zwei** Routinen: den Cloud-Teil
`violet-nightly-triage-cloud` (Claude-Routine `trig_01B8QrhLtN8zvdfWuF5iAmNP`, täglich 02:47 UTC
= 04:47 Berlin, Sonnet, eigener Cloud-Checkout, committet **und pusht** die Inbox auf `main`;
Einträge tragen `[Cloud]`) und den lokalen Task `violet-nightly-triage` (Live-Smoke,
`homey app validate`, alles was den Pool-Controller braucht).

**Stand:** 2026-08-25 (Cloud-Triage-Lauf + Verifikationslauf nach GitHub-Zugriffsfix)

## Offen

- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten. Stand 2026-08-17: unverändert, keine neuen Traces.
- 2026-07-14 · Routine/Design (offen) · Soll die Nightly-Routine ihren Start-Branch fest auf `main` pinnen? Historisch lief sie auf dem jeweils ausgecheckten Feature-Branch (Regel „nicht wechseln"), was die gemeldeten Test-Zahlen verfälschte. Stand 2026-08-17: zehnter Lauf in Folge auf `main` (366 Tests, Baseline korrekt) — Symptom trat nicht auf, die Design-Frage bleibt offen, solange die Routine keinen Branch fixiert.
- 2026-08-24 · Routine/Beobachtung (offen) · **Parallelbetrieb Cloud vs. lokal beobachten.** Der Cloud-Teil ist angelegt (siehe Kopf). Der Plan sah „erst eine Woche parallel zum lokalen Task, dann den lokalen abschalten" vor — **das ist gegenstandslos, weil der lokale Task bereits deaktiviert ist** (siehe den Lücken-Eintrag darunter). Stattdessen gilt: **7 Cloud-Läufe in Folge mit `chore(triage): nightly cloud`-Commit auf `main` abwarten** (Prüfung: `git log --grep="chore(triage): nightly cloud" --oneline` bzw. die Lauf-Historie unter https://claude.ai/code/routines/trig_01B8QrhLtN8zvdfWuF5iAmNP). Stand 2026-08-25: **erster tatsächliche Commit dieser Reihe** — `git log --grep="chore(triage): nightly cloud"` war vor diesem Lauf leer, „lief erstmals am 2026-08-24" bezog sich offenbar nur auf die Einrichtung, nicht auf einen abgeschlossenen Lauf mit Commit. Zählung ab heute: 1/7. Erst nach 7 Läufen entscheiden, ob der lokale Task für den Live-Smoke-Teil wieder aktiviert wird oder ganz entfällt.
- 2026-08-25 · Routine/Befund (NEU, offen) · `npx homey app validate --level publish` kam in der Cloud-VM nicht zur Ausführung — der `package-guard`-PreToolUse-Hook blockiert den Aufruf, bevor die Frage „Homey-Login nötig?" überhaupt relevant wird: „package-guard: blocking 'homey' (rule: verify-unavailable) — the npm registry could not be reached to verify the package (fail closed, SR-04). If intentional, install it manually in your own terminal." Ursache vermutlich fehlender Netzwerkzugriff auf die npm-Registry aus der Cloud-Session heraus (Guard verhält sich SR-04-konform: fail closed). Validate muss daher bis auf Weiteres lokal laufen; die ursprüngliche Frage vom 2026-08-24-Eintrag bleibt unbeantwortet.
- 2026-08-17 · Routine/Lücke (WIEDERAUFGENOMMEN; **Ursache am 2026-08-24 gefunden**) · Nachtrag Checkpoint M9.0: `mcp__scheduled-tasks__list_scheduled_tasks` zeigt den Task `violet-nightly-triage` mit **`enabled: false`** und `lastRunAt: 2026-08-17T09:53:42Z`. Der Task ist also schlicht **deaktiviert** — nicht „Rechner aus/Standby", wie zweimal vermutet. Damit erklärt sich auch die zweite, bis dahin unbemerkte Lücke **2026-08-18 bis 2026-08-24 (sieben weitere Nächte ohne Lauf)**. Wann und wodurch er deaktiviert wurde, ist nicht rekonstruierbar (die Task-API führt keine Änderungshistorie) — genau diese Blindheit behebt der Umzug in die Cloud-Routine, deren Läufe eine Historie haben. Der ursprüngliche Handlungsvorschlag „Lücken-Selbsttest einbauen" ist damit **hinfällig**; der Eintrag bleibt offen, bis die 7 Cloud-Läufe der Beobachtung darüber durch sind.
- 2026-08-17 · Routine/Lücke (historischer Befund) · **Zwölf Nächte ohne `chore(triage)`-Commit: 2026-08-05 bis 2026-08-16.** Letzter Lauf davor `ae56f8e` (2026-08-04), nächster dieser hier (2026-08-17). Das ist der zweite Ausfall dieser Art — die erste Lücke (07-23…07-27, fünf Nächte) wurde am 2026-07-30 mit der Auflage „bricht die Kette erneut, neu aufnehmen" geschlossen; diese Auflage greift jetzt. Befundlage identisch zum ersten Mal: der Commit-Schritt der Routine funktioniert (dieser Lauf committet normal), und die Scheduler-API liefert keine Lauf-Historie, mit der sich „gar nicht gestartet" von „gestartet und abgebrochen" unterscheiden ließe. Zwei Lücken in vier Wochen sprechen aber gegen einmaligen Zufall (Rechner aus/Standby bleibt die plausibelste Ursache, unbelegt). **Handlungsvorschlag für die nächste Milestone-/Checkpoint-Session:** die Routine so ergänzen, dass sie die Lücke selbst erkennt und meldet (z. B. Vergleich `Stand:`-Datum gegen heute beim Start), damit ein Ausfall nicht erst beim manuellen Nachlesen auffällt; alternativ Scheduler-Konfiguration auf Catch-up-Verhalten prüfen.

## Neu (2026-08-25)

- 2026-08-25 · Lauf [Cloud] · npm ci sauber (5 packages) · npm test 408 Tests / pass 406 / fail 0 / skipped 2 / todo 0 (5,7 s) · Versions-Sync app.json == .homeycompose/app.json OK (0.8.0) · letzter CI-Lauf 32724656737 (main, Run #136) completed/success (2026-08-24T11:59:02Z).
- 2026-08-25 · Befund [Cloud] · `npx homey app validate --level publish` durch `package-guard`-Hook blockiert (fail closed, npm-Registry aus der Cloud-VM nicht erreichbar) — Details siehe „Offen".
- 2026-08-25 · Verifikationslauf [Cloud, auf Nutzeranfrage nach GitHub-Zugriffsfix] · npm ci sauber · npm test 408 Tests / pass 406 / fail 0 / skipped 2 / todo 0 (6,2 s) · Versions-Sync OK (0.8.0) · CI-Lauf 32841741411 (main, Run #138) completed/success (2026-08-25T11:19:46Z, vermutlich durch den nachgeholten Push von `d09965b` ausgelöst) · `homey app validate` weiterhin durch `package-guard` blockiert (unverändert, unabhängig vom GitHub-Fix) · **Push funktioniert wieder** — siehe Erledigt-Eintrag unten.

## Erledigt (2026-08-25)

- **GitHub-Push-Zugriff (403 "Resource not accessible by integration") → BEHOBEN.** Der reguläre Cloud-Lauf von heute früh konnte den Inbox-Commit `d09965b` weder per `git push` noch per GitHub-MCP-API auf `main` schreiben — die Claude-GitHub-App hatte keinen Zugriff mehr auf `tnsturm/violet-homey-app`. Nutzer hat die App-Installation über https://github.com/apps/claude/installations/select_target erneuert. Verifiziert in zwei Schritten: (1) `git push origin HEAD:main` lief danach sauber durch (`774d440..d09965b`), (2) dieser Verifikationslauf bestätigt es zusätzlich end-to-end (frischer `npm ci`/`npm test`/CI-Check, neuer CI-Lauf #138 grün). Kein weiterer Handlungsbedarf — der ursprüngliche Not-Weg über die GitHub-MCP-API (`create_or_update_file`) war nur ein Fallback-Versuch und bleibt nicht nötig, solange die App-Berechtigung besteht.
- Nightly-Lauf 2026-08-17 (ALLES GRÜN inkl. `homey app validate` exit 0, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.
- Routine/Lücke „Zwölf Nächte ohne Lauf (08-05…08-16)" (aus „Neu" 2026-08-17) → Ursache seither identifiziert und in „Offen" (2026-08-17-Eintrag „WIEDERAUFGENOMMEN") weitergeführt; hier nur als Verweis entfernt, kein separater Abschluss.

## Erledigt (2026-08-17)

- Nightly-Lauf 2026-08-04 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

## Erledigt (2026-08-03)

- Nightly-Lauf 2026-08-02 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

## Erledigt (2026-08-02)

- Nightly-Lauf 2026-08-01 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

## Erledigt (2026-08-01)

- Nightly-Lauf 2026-07-31 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

## Erledigt (2026-07-31)

- Nightly-Lauf 2026-07-30 (ALLES GRÜN, ohne Handlungsbedarf) → aus „Neu" entfernt, kein Follow-up.

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
