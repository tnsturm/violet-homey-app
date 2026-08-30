---
target: IST-Zustand drivers/pool/** + lib/** (kein Diff-Range — kein aktiver Meilenstein)
head: 556faae6621c700c0a1e36fa9addb2225c9f8af1
date: 2026-08-28
lenses: adversarial-reviewer (mit F1–F6-Hypothesen), runtime-resource-reviewer, api-contract-reviewer, /code-review xhigh (11 Finder-Winkel + 8 Verifier + Sweep)
verify: npm test → 408/408 grün (Baseline, Worktree); Repros je Fund einzeln ausgeführt, s. u.
purpose: Vollständiger §9-Loop auf main; Altfunde des M0-Kalibrierungslaufs (2026-08-25) neu belegen oder verwerfen
triage: erledigt (2026-08-29) — Urteile in 2026-08-28-approved.md: 20 approved (umgesetzt, PR #19 / Squash 82462c6), 1 rejected (P4), 2 deferred (P3, P5 → triage-inbox); Cleanup Q1–Q17 + R2-1..4 in Runde 2 entschieden.
---

# Adversarial Review — main @ 556faae (2026-08-28)

Prüfgegenstand war der heutige Stand von `drivers/pool/**` und `lib/**` (Manifeste und
Specs als Referenz), nicht ein Diff. Der Altreport
`2026-08-25-adversarial-m0-dryrun.md` diente als Hypothesenliste; jeder seiner sechs
Funde wurde am heutigen Code neu belegt oder verworfen. **Alle Urteile und alle
CONFIRMED-Funde tragen ein am 2026-08-28 tatsächlich ausgeführtes Repro oder eine
zitierfähige Belegkette** — die Adversarial-Linse fuhr eigene Node-Harnesse gegen
`test/mocks/homey.js` (mit vorbelegten statischen Capabilities aus
`driver.compose.json`, die die bestehenden Device-Tests nicht vorbelegen — siehe
Meta-Befund M1), die NotifyServer-Repros liefen gegen echte `http.Server`/`net.Socket`.

**Ergebnis: 5 von 6 Altfunden gelten heute noch (F4 ist behoben). Dazu 11 neue
CONFIRMED-Funde, 6 PLAUSIBLE, 17 Cleanup-Funde, 1 Meta-Testlücke; 4 Kandidaten wurden
in der Verifikation REFUTED.**

---

## Teil 1 — Altfund-Urteile

### F1 · **GILT HEUTE** (verschärft) · [device.js:392-397](../../../drivers/pool/device.js)

Der `catch`-Zweig in `_tick()` erhöht nur den Fehlerzähler und kehrt zurück, bevor
irgendein Capability geschrieben wird. Repro ausgeführt: guter Poll →
`measurements_fresh = true`, `measure_ph = 7.301`; drei Fehl-Polls → Gerät
`unavailable`, **0 Capability-Writes**, `fresh` bleibt `true`, `ph` bleibt `7.301`.

**Verschärfung seit M0:** M8.1 hat `_lastParsed`/`_lastFresh` (Z. 420–422) angelegt,
die im Fehlerpfad ebenfalls nie invalidiert werden. Nach 10 Fehl-Polls antwortet die
Flow-Action `get_balance_advice` weiterhin mit einer konkreten Dosierempfehlung
("LSI +0.71 … lower pH from 8.2 to 7.84") aus Messwerten beliebigen Alters, ohne
jeden Hinweis auf den Ausfall (unabhängig vom Cross-File-Tracer als eigener Fund
gemeldet und von der Adversarial-Linse per Repro bestätigt — hier zusammengeführt).
M0 §10 deckt nur das *Halten* der Werte („transient failures do not clear
last-known capability values"), nicht die *Frisch-Deklaration*.

Warum die Tests es nicht fangen: `pool.device.test.js:146-153` prüft nur
`available`; wegen Meta-Befund M1 wird `measurements_fresh` in keinem Device-Test je
geschrieben.

Fix-Ansatz: ab der 3-Fehler-Schwelle `measurements_fresh = false`, fresh-gegatete
Sonden nach der Stale-Regel räumen, `_lastFresh = false` (Advisor degradiert auf
„stale").

### F2 · **GILT HEUTE** · [device.js:707-711](../../../drivers/pool/device.js) (ow), :678-682 (Chlor), :768-773 (M2)

Kein Entprellen beim Capability-Abbau. Repro ausgeführt, drei Stufen:
1. Ein Poll mit `onewire1_state: 'FAULT'` → `removeCapability('measure_temperature.ow1')`
   sofort; Rückkehr auf `OK` legt sie neu an (Nutzer-Flow bleibt kaputt, Insights bei null).
2. Ein Payload ohne `pot_value` + `DOS_1_CL_USE='0'` → 6 Caps in einem Poll entfernt.
3. Ein *valider, aber degenerierter* Payload (`{date, time, CURRENT_TIME_UNIX}`) →
   **46 Caps → 7, 39 `removeCapability` in einem Poll**, `_failures = 0`, Gerät `available`.

Die Monotonie aus M2 §4 („capabilities are never auto-removed") ist eine Eigenschaft
der Payload-Historienfelder, nicht des Codes; der onewire-Pfad war nie monoton.
1-Wire-Anomalien sind realer Betrieb (Fixture: `onewire{1,6,7,10}_freezecount > 0`).
Tests prüfen Churn-Freiheit nur bei identischem Payload (`pool.device.test.js:125-133`).

Fix-Ansatz: Abbau erst nach N aufeinanderfolgenden Polls ohne Nachweis (Aufbau
weiterhin sofort), als pure Funktion mit Zählerzustand in `/lib`.

### F3 · **GILT HEUTE** · [device.js:392-397](../../../drivers/pool/device.js)

`catch (err)` — `err` wird gebunden und nie benutzt. Repro ausgeführt: `_log.errors`
nach 3 Fehl-Polls leer. Timeout, HTTP 500, DNS- und JSON-Fehler sind im App-Log
ununterscheidbar. Direkte Verletzung von M0 §10 („Errors logged via `this.error`"),
unverändert seit `7b59d55`. Kontrast: `_maybeRefreshConfig` (Z. 217–226) loggt
sanitisiert. Fix: Einzeiler im catch (ggf. mit Throttle-Muster aus
`ConfigSource.js:218`).

### F4 · **IST BEHOBEN** · [lib/Freshness.js:21-23](../../../lib/Freshness.js) + device.js:411-416 + VioletClient.js:69

`_pumpOnSince` existiert nicht mehr; Freshness leitet sich pro Poll aus
`PUMP_LAST_ON` + `CURRENT_TIME_UNIX` ab. Commits `dcea5ac` (Freshness-Refactor,
M1 §10) und `ed14ae2` (drop `_pumpOnSince`). Beide Hälften des Altfunds geschlossen:
Neustart-Repro schreibt sofort `fresh = true` bei lange laufender Pumpe
(`Freshness.test.js:18`); Rückwärtsuhr geklammert via `Math.max(0, …)`
(`Freshness.test.js:27` friert das ein). Randnotiz für die Triage: im
Rücksprung-Fenster erzeugt der Guard eine Insights-Lücke, die „nicht gemessen"
behauptet — spezifiziertes Verhalten (M1 §10), kein Fund.

### F5 · **GILT HEUTE** · [lib/Capabilities.js:84](../../../lib/Capabilities.js) + device.js:525-530

Repro ausgeführt: Key-Reihenfolge von `buildCapabilityUpdates` setzt
`measurements_fresh` an Index 1, `measure_ph` an Index 13 — bei einer echten
Stale→Fresh-Flanke liegen **11 einzeln geawaitete Capability-Writes** zwischen der
Veröffentlichung von `fresh = true` und dem pH-Wert, der zu diesem Zeitpunkt noch auf
dem `null` des Clear-Vorgangs steht. Ein Flow nach dem M0-§7-Muster rennt in dieses
Fenster. Garantiert ist die Reihenfolge, nicht das Rennen. Tests sind
reihenfolgeblind (`Capabilities.test.js:89-107` nur Key-Zugriffe; Device-Tests siehe
M1). Fix: `fresh` zuletzt einfügen/schreiben. **Querbezug Q12:** die dort
vorgeschlagene Parallelisierung der Writes muss mit diesem Fix zusammen entschieden
werden (Parallelisierung eliminiert jede Reihenfolge).

### F6 · **GILT HEUTE** · [docs/superpowers/notes/2026-06-26-m1-inputs.md:15-25](../notes/2026-06-26-m1-inputs.md)

Datei unverändert; die Behauptung „CONFIRMED in BOTH the real Violet payload and the
committed demo fixture" steht wörtlich noch da. Nachgerechnet (2026-08-28):
`CURRENT_TIME_UNIX − PUMP_LAST_ON = 14 166,15 s` vs. `PUMP_RUNTIME = 69 803 s` —
Abweichung 15,45 h. Die zitierten Zahlen sind ein in sich konsistenter echter
Live-Capture (6 858,75 s ≈ „01h 54m 18s"), nur eben nicht das Fixture. Die M1-Spec
(Z. 31) referenziert die Notiz. Kein Codefehler (die implementierte Formel hängt
nicht an der Identität); `PUMP_RUNTIME` ist erkennbar kumulativ. Fix: Notiz auf die
tatsächliche Quelle zurückführen, `PUMP_RUNTIME` als kumulativ kennzeichnen.

---

## Teil 2 — Neue Funde (CONFIRMED)

### N1 · MEDIUM · [device.js:471-488, 494-498](../../../drivers/pool/device.js) — Phantom-Flanke nach jedem App-Neustart

`_m2AlarmState`/`_lastLsiBand` leben nur im Speicher, der Capability-Wert wird von
Homey persistiert. Repro ausgeführt: zweite Device-Instanz (= App-/FW-Update),
identischer Payload → `dosing_low`-Trigger und **M8.1-Timeline-Notification feuern
erneut**, ohne Zustandswechsel. Der Trigger-Refire ist spezifiziert (M2 §7; Kommentar
Z. 470 „may re-fire once after restart") — die Timeline-Notification nicht (§7.3
listet den Neustartfall nicht unter den Unterdrückungsregeln), und sie ist
unmittelbar nutzersichtbar. Fix: Flankenzustand beim ersten Tick aus
`getCapabilityValue` vorbelegen bzw. `_lastLsiBand` in den Store.

### N2 · HIGH · [device.js:374-383](../../../drivers/pool/device.js) — fehlendes `onDeleted`: Timer + NOTIFY-Listener überleben das Geräte-Löschen

`onDeleted` existiert repo-weit nicht (grep: 0 Treffer); Poll-Interval und
`NotifyServer`-Handle werden nur in `onUninit` geräumt. SDK-Doku und die
Referenz des `homey-app`-Skills zeigen kanonisch **beide** Hooks für dasselbe
Interval (`onDeleted` = Nutzer löscht Gerät bei laufender App, `onUninit` =
App-Teardown; `@types/homey/lib/Device.d.ts:280-296`). Löscht der Nutzer das Gerät
(z. B. für Re-Pairing), feuert der Interval alle 60 s weiter gegen die gelöschte
Instanz (Fehler verschwinden in `.catch(this.error)`), die `onAlarm`-Closure bleibt
im Registry-Set (`NotifyServer.js:64`), der Port bleibt bis zum App-Neustart
gebunden — die 2026-07-Inzidenzklasse, produktionsseitig. Fix:
`async onDeleted() { await this.onUninit(); }` (idempotent). Test:
Gegenstück zu `pool.device.notify.test.js:121`.

### N3 · HIGH · [device.js:264-267](../../../drivers/pool/device.js) — `_pumpSpeedArg()` erzwingt Stufe 0 statt „Keep configured"

`getSetting()` liefert für einen nie gesetzten Key `null` (SDK-Typdoku
`Device.d.ts:73-77`: „or null when unknown"), geprüft wird aber nur
`s === undefined || s === 'default'` → `Number(null) = 0`, und `0` ist im
PUMP-Enum `[0,1,2,3]` (`WriteClient.js:19`) **gültig** → der Schreibbefehl sendet
`speed=0` mit, statt `speed` wegzulassen — die Pumpe wird explizit auf Stufe 0
gezwungen, entgegen dem dokumentierten Verhalten („'Keep configured' leaves the
controller's own program untouched", `driver.settings.compose.json:302`).
Vorbedingung real: `control_pump_speed` kam mit M3 (`97691de`) nach dem M0-Pairing
(`c281adc`); Compose-Defaults seeden nur beim Pairen, Backfill-Code existiert nicht.
Interner Beleg für Versehen: Schwester-Read Z. 147 guardet mit `?? 60`,
`_pumpSpeedArg` nicht; der pvsurplus-Pfad (Z. 153–158) maskiert denselben Defekt
zufällig. Kein Test deckt `_pumpSpeedArg` ab.

### N4 · MEDIUM · [device.js:589-590, 616-621](../../../drivers/pool/device.js) — Advisor vor dem ersten Tick: irreführende „missing"-Liste

Repro ausgeführt (fetchReadings-Stub, `_balanceAdvice()` direkt nach `onInit`):
`"No recommendation possible yet — missing: pH, water temperature, calcium
hardness, total alkalinity."`, obwohl alle `chem_*`-Settings gesetzt sind — nur der
erste Poll (Fenster bis 10 s nach onInit, `_tick` ist fire-and-forget) ist noch
nicht durch. Ursache: `_lastParsed === null` → `(parsed && !this._lastFresh)`
short-circuitet zu falsy → `reason = null` statt `'stale'` → `_adviseNow`
überschreibt `missing` nicht. Widerspricht dem eigenen Kommentar Z. 613–615
(„reports ONLY that reason", Spec §9).

### N5 · MEDIUM · [driver.js:116](../../../drivers/pool/driver.js) + device.js:177-182 + driver.settings.compose.json — Schreib-Passwort nach dem Pairing nicht setzbar

Das Pairing-Formular markiert Username/Passwort als optional (`connect.html:23-24`);
`writePassword` landet nur einmalig zur Pairing-Zeit im Store. Die Settings bieten
`writeUsername` (editierbar), aber **kein Passwort-Feld**; `onRepair` existiert
nicht, `onSettings` hat keinen Passwort-Zweig. Wer ohne Passwort gepairt hat (oder
es am Controller rotiert) und später `control_enabled` aktiviert, bekommt dauerhaft
`error.write_creds_missing` (`_writeCreds`, Z. 180) — einziger Ausweg ist
Löschen + Neu-Pairen, was alle gebundenen Flows bricht.

### N6 · MEDIUM · [device.js:190-227](../../../drivers/pool/device.js) — Config-Facts-Refresh nach 3 Fehlversuchen dauerhaft blockiert

`needFirstFacts` verlangt `_configAttempts < 3 || markerMovedBetweenPolls`
(Z. 194–195). Ist getConfig bei den ersten 3 Polls nicht erreichbar (Controller
bootet noch, Netz-Hänger) und der `CONFIGCHANGEMARKER` bleibt konstant (Normalfall),
kehrt Z. 197 ab dann auf jedem Tick sofort zurück — `_configFacts` bleibt für die
gesamte App-Laufzeit `null`, Feature-Detection fällt dauerhaft auf die
History-Heuristik zurück, auch wenn getConfig Minuten später wieder erreichbar ist.
Ausweg nur App-Neustart oder echte Config-Änderung am Controller.

### N7 · MEDIUM · [lib/NotifyServer.js:115-125](../../../lib/NotifyServer.js) — Body: Chunk-weise UTF-8-Dekodierung + Cap in UTF-16-Einheiten

Zwei Defekte, ein Fix. Repros ausgeführt gegen echten Server: (a) kein
`setEncoding` — `body += chunk` dekodiert jeden Buffer einzeln; „Schön" mit
Chunk-Grenze nach `0xC3` kommt als `"Sch��n"` im `onAlarm`-Subject an.
(b) `body.length >= bodyBytes` zählt UTF-16-Code-Units: Body aus 1521 × `€`
(4 521 Bytes UTF-8) passierte den 4096-Byte-Cap (SR-M6-02,
Threat-Model Z. 19/59) mit `200 OK` + gefeuertem Alarm; Worst Case ~3×. Fix:
Chunks als Buffer sammeln, Byte-Summe zählen, einmal
`Buffer.concat(...).toString('utf8')` in `'end'`.

### N8 · LOW · [lib/NotifyServer.js:54-58](../../../lib/NotifyServer.js) — SUBJECT-Slice zerschneidet Surrogate-Paare

Repro ausgeführt: 199 × `x` + Emoji → Subject endet auf lone High-Surrogate
`0xD83D`; Re-Encoding (Log Z. 356–357, Flow-Token) macht daraus U+FFFD. Das
Schwester-Helper `clip()` (`WaterBalanceText.js:309-315`) behandelt exakt diesen
Fall. Wirkung: Anzeige-Glitch, kein Crash.

### N9 · LOW · [lib/NotifyServer.js:94-98, 108](../../../lib/NotifyServer.js) — zweiter Port-Attacher verliert `log`/`error`/`limits`

Der `existing`-Zweig übernimmt nur `onAlarm`; `entry.error` und die
Handler-Closure bleiben für die Entry-Lebensdauer an den **ersten** Aufrufer
gebunden, `close()` bereinigt sie nicht. Rate-Limit-Warnungen und Serverfehler
eines geteilten Ports laufen dauerhaft über Gerät 1 — auch nachdem es gelöscht
wurde. Die dokumentierte Single-Violet-Limitation (Spec 2026-06-26, Z. 59) deckt
nur das Trigger-Fan-out; Spec §7 (Z. 98) behauptet sogar „listener errors routed
to `this.error`" — der Code widerspricht der eigenen Spec ab Aufrufer 2.

### N10 · MEDIUM · [driver.js:76-95](../../../drivers/pool/driver.js) + connect.html:19 — Pairing zeigt rohe technische Fehlertexte

Repros ausgeführt: (a) Host mit Schema eingefügt → `buildReadingsUrl` baut
`http://http://…` → Dialog zeigt „Failed: fetch failed" (ENOTFOUND `http`);
(b) fremdes Gerät liefert 200+HTML → `SyntaxError: Unexpected token '<' …` roh im
Dialog; (c) Timeout → „This operation was aborted". Nur `host_required`/`no_serial`
sind lokalisiert; `fetchReadings` (Z. 81) läuft ohne try/catch. Fix: Host um
`^https?://` + trailing `/` bereinigen, Fehler auf lokalisierte
`pair.error.unreachable`-Meldung mappen (Detail ins Log).

### N11 · LOW · [lib/Lsi.js:68](../../../lib/Lsi.js) + Capabilities.js:89 — `NaN` in `measure_lsi` bei extremer Fixtemperatur

`chem_fixed_temperature` hat als einziges Chemie-Setting kein `min`/`max`
(`driver.settings.compose.json:139-144`). Repro ausgeführt: `tempC = -300` →
`Math.log10(tempC + 273.15)` = `NaN`; der Docstring-Vertrag „invalid/missing input
yields null, never throws" bricht (Guard prüft nur Rohargumente).
`classifyLSI(NaN)` fängt korrekt ab (kein falscher Alarm), aber
`measure_lsi: lsi ?? null` lässt `NaN` durch (`??` ersetzt kein NaN) — die Kachel
bekommt `NaN` statt „–". Fix: `min`/`max` im Compose + `Number.isFinite`-Guard aufs
Ergebnis.

---

## Teil 3 — PLAUSIBLE (Mechanismus belegt, Auslöser/Wirkung offen)

- **P1 · device.js:407 + Freshness.js:21-24 — Controller-Uhr = 0 → fälschlich frisch.**
  Mechanismus ausgeführt: `num(0) = 0` → `timeUnix || …` fällt auf Homey-Echtzeit
  zurück, `pumpLastOn = 0` überlebt (Guard prüft nur null/undefined) →
  `isFresh = true` trotz gerade angelaufener Pumpe. Unbelegt: ob Violet-Firmware
  nach Stromausfall wirklich `CURRENT_TIME_UNIX = 0` sendet (kein Fixture/Note).
  Billiger Defensiv-Fix unabhängig von der Vorbedingung möglich (`timeUnix`-Guard
  auf Plausibilität statt Truthiness).
- **P2 · connect.html:11-20 + driver.js:73-95 — Pairing-Doppelklick.** Kein
  Button-Disable, `pairData` session-gescopte `let` — real. Der behauptete
  Daten-Mismatch hängt aber am Re-Fetch-Verhalten der Homey-Pairing-Runtime
  (SDK-intern, lokal nicht prüfbar). Button-Disable wäre ein Einzeiler.
- **P3 · WaterBalanceText.js:376-388 — `renderExcerpt` ohne fine_tuning-Check.**
  Defekt der puren Funktion per Repro belegt (Excerpt „Größter Hebel: pH auf 7,58
  senken" bei ausdrücklich balanciertem Wasser), aber am einzigen Produktions-
  Callsite (device.js:471, `severity !== 'ok'`) konstruktiv unerreichbar — inert
  bis zu einem künftigen Callsite.
- **P4 · VioletClient.js:66 — `Number(raw.PUMP) === 1` vs. Speed-Stufen.** Falls
  Firmware bei erzwungenem Speed-Lauf `PUMP=2/3` meldet, wäre das Gerät dauerhaft
  stale. Fixture zeigt `PUMP` strikt 0/1 (Stufen separat in `PUMP_RPM_*`); reine
  Live-Verifikationsfrage, kein belegter Defekt. (Nach §9-Regel ohne Repro
  abzulehnen oder als Live-Prüfauftrag zu deferren.)
- **P5 · device.js:362-372 — reentrante `_tick`-Läufe.** Ein Multi-Key-Settings-Save
  startet 2–3 parallele Ticks (kein Mutex; Kontrast: `_notifyOp` Z. 99–105 wurde für
  genau diese Klasse gebaut). Verifiziert: **kein falscher Endzustand** konstruierbar
  (gleiche Wunschmenge, Konvergenz) und **kein Doppel-Trigger** (Flankenblöcke
  synchron; Adversarial-Gegenprobe). Bleibt: 2–3 redundante `fetchReadings` + teure
  `add/removeCapability`-Dubletten pro Save. Einstufung Robustheit/Effizienz.
- **P6 · device.js:504 vs. 768-773 — `_m2AlarmState` überlebt Hide/Unhide.** Beim
  Cap-Removal wird nur `_inputOptState` geräumt; Szenario „Alarm true → hide →
  false → true → unhide: Flanke unterdrückt" ist kohärent, wurde aber nicht per
  Harness ausgeführt (die Adversarial-Gegenprobe lief nur fürs Schwesterfeld
  `_diagState`). Fix wäre mit N1 (Vorbelegung aus `getCapabilityValue`) miterledigt.

---

## Teil 4 — Cleanup (alle mechanisch verifiziert)

**Dopplungen (Divergenz-Gefahr):**
- **Q1** device.js:493 `CH_LABEL` dupliziert `CH_TITLE` (51–58) en-only, pro Tick
  neu allokiert; Flow-Tokens `dosing_blocked`/`dosing_low` (Z. 511/513) zeigen
  deutschen Nutzern englische Kanalnamen, während Kacheln lokalisiert sind
  (`_advisorLang()`-Muster Z. 539–542 wäre anwendbar).
- **Q2** FeatureDetector.js:60 lokale DOSING-Map = `DOSING_PREFIX`
  (FeatureGroups.js:10-13); Import-Pfad existiert schon (Z. 12).
- **Q3** device.js:273-286 (`_diagBaseTitle`) vs. 726-733: Dosier-Titelbau doppelt.
- **Q4** device.js:548-558 vs. 428-432: `choosePrimaryTemperature` 2×/Tick mit
  identischen Argumenten (Kommentar verlangt selbst „nie divergieren").
- **Q5** driver.js:41 vs. device.js:264-267: Speed-Arg-Normalisierung doppelt
  (Fix gehört zu N3: gemeinsames `normalizeSpeedArg` neben `WRITE_TARGETS`).
- **Q6** FeatureGroups.js:89-92 `num()` Byte-Kopie von VioletClient.js:41-44
  (Kommentar markiert das Risiko; `num` ist nicht exportiert).
- **Q7** Fetch-Timeout-Idiom 3× (VioletClient:82-92, ConfigSource:161-186,
  WriteClient:134-149); `redirect:'error'` fehlt nur in `fetchReadings` — dort
  credential-frei (§13), also kein Leak-Risiko, aber unkommentierte Divergenz.

**Flughöhe (Hand-Listen-Klasse, Präzedenz: `M2_MANAGED_BASES`-Kommentar Z. 758-760):**
- **Q8** device.js:678 hardcodiert `['measure_chlorine']` statt Iteration über
  `FEATURE_CAPABILITY` (Capabilities.js:10-12, nicht importiert) — Kosten heute 0,
  bricht still beim zweiten Feature-Cap.
- **Q9** device.js:508-519 Alarm→Trigger-if/else-Kette; neue Alarm-Cap ohne Zweig =
  Cap gesetzt, kein Flow feuert, still.
- **Q10** capId-Split 6× unabhängig (device.js:274, 505/506, 726, 767;
  FeatureGroups.js:295, 310), `ch`-Default uneinheitlich → `splitCapId()` in lib.
- **Q11** M3-Control-Zuordnung 3× verdrahtet (device.js:146-158, 778-789;
  driver.js:43-65) ohne Registry analog `M2_GROUPS`.

**Effizienz (Homey-Pro-Hot-Path, 1 Poll/60 s):**
- **Q12** device.js:525-530 ~40–50 Capability-Writes seriell geawaitet (je eigenes
  `.catch`) — **nur zusammen mit F5 entscheiden** (Parallelisierung eliminiert
  Reihenfolge; F5-Fix „fresh zuletzt" muss die Lösung überleben).
- **Q13** device.js:299-307 serielle `setCapabilityOptions` in `_applyDiagTitles`
  („heavy API" laut eigenem Kommentar).
- **Q14** device.js:715-718 exakt 13 `getSetting`-Reads + komplette
  `desiredM2Capabilities`-Neuberechnung jeden Tick im Steady State.
- **Q15** 11 `hasCapability`-Callsites, mehrere in Schleifen (>100 Aufrufe/Tick bei
  voller Bestückung plausibel, O(n)-Annahme nur mock-belegt); `getCapabilities` 2×
  kopiert (707, 768) → einmal pro Tick ein Set bilden.

**Konventionen/Doku:**
- **Q16** connect.html:1 — einzige Scope-Quelldatei ohne
  `/documenting-code`-Datei-Header (beginnt mit `<script>`).
- **Q17** `.homeychangelog.json` 0.1.2 verspricht „cleaner Insights chart axis
  labels" — die zugehörigen `min`/`max` wurden in 0.1.3 zu Recht als wirkungslos
  entfernt (siehe R3), die Changelog-Behauptung wurde nie korrigiert.

---

## Teil 5 — Meta-Testlücke

**M1 · test/mocks/homey.js:42 + alle drei Device-Test-Dateien:** Der Mock startet
mit `capabilities: []`, und kein Device-Test belegt die fünf statischen Capabilities
aus `driver.compose.json` vor. Der `hasCapability`-Guard der Apply-Schleife
(device.js:527) verwirft deshalb **in jedem vorhandenen Device-Test** die Writes von
`measurements_fresh`, `measure_ph`, `measure_orp`, `pump_running`,
`measure_temperature` — Fehlerpfad-Semantik (F1), Schreibreihenfolge (F5) und jede
Änderung dieser fünf Werte sind testblind. Ein Einzeiler in `makeDevice`
(`device.__test.capabilities = [...STATIC_CAPS]`) schafft die Voraussetzung für
F1-/F5-Regressionstests.

---

## Teil 6 — In der Verifikation verworfen (REFUTED)

- **R1** „Chlor bleibt bei fresh+null stehen" (Capabilities.js:100): dokumentiertes
  Design (Docstring Z. 96–97; clear-stale-Spec Z. 86 + 126–127 „Keep unchanged";
  Test Capabilities.test.js:109-117). Deckt sich mit Altreport „hält" #5.
- **R2** „FeatureDetector `=== '1'` bricht bei numerischer Firmware": der
  Mischtypen-Kommentar gehört zum getConfig-Endpunkt (`CONFIG_QUERY` ohne
  `DOS_*_USE`); M5.7-Spec spezifiziert für getReadings strikt `'1'`; alle 5
  Fixtures liefern Strings.
- **R3** „measure_lsi min/max-Entfernung = Insights-Regression": `min`/`max` wirkt
  laut SDK-Doku nur auf Slider/setable-Caps, nicht auf die Insights-Achse;
  `measure_ph`/`measure_orp` hatten nie min/max; die Entfernung in `0ac021f`
  („drop dead …") war korrekt. Rest siehe Q17.
- **R4** „Reentrante Ticks feuern Trigger doppelt": Flankenblöcke laufen synchron
  von Prüfung bis Zuweisung — nicht konstruierbar (Adversarial-Gegenprobe; Rest
  siehe P5).

## Angegriffen, hält (Auszug der stärksten Gegenproben)

`parseAlarm` gegen 16 feindliche Eingaben; NOTIFY-Lebenszyklus (Registry-Race,
Bind-Fehlerpfad, Refcount, Slowloris-Guards, Rate-Limit, `_notifyOp`-Serialisierung
inkl. onInit-Fehlerpfad); Schreibpfad-Grenzen deckungsgleich mit `WRITE_TARGETS`,
Credentials nur im Authorization-Header + `redirect:'error'` + credential-freie
Fehlermeldungen (getestet); alle 15 Flow-Karten mit `driver_id=pool`-Filter;
Rückwärtsuhr spezifiziert geklammert; Parser-Totalität (`num`,
`parseDurationToHours`, `parseRangeToDays`, …); Aktor-Monotonie über `*_LAST_ON`
fixture-belegt; Config-Lebenszyklus M5.7/M5.8 (Budget, Marker, Schema-Invalidierung,
SR-16); Abort-Timer überall im `finally` geräumt; Lsi-/WaterBalance-Formeln
nachgerechnet; kein O(n²) über das 399-Feld-Payload; `onInit` nicht blockierend.
Notiert ohne Fund: HTTP-200 mit Body `null` würde `parseReadings` außerhalb des
try treffen (kein realistischer Weg konstruiert); `_diagState`-Invalidierung und
`setCapabilityOptions`-Merge-Semantik hängen an Homey-Runtime-Verhalten (billige
Live-Prüfung möglich).

---

## Verifikationsnachweis

**Was ausgeführt und verifiziert wurde:** `npm ci` + `npm test` 408/408 grün im
Worktree (Kommando + Output im Session-Transkript); je Fund die oben zitierten
Node-/HTTP-Repros (Adversarial-Harness mit vorbelegten statischen Caps;
NotifyServer gegen echten `http.Server`/`net.Socket`; `buildReadingsUrl`-, Advisor-,
`computeLSI`-, Freshness-Repros einzeln); F6-Arithmetik in Node nachgerechnet;
alle Cleanup-Zeilenangaben mechanisch gegengeprüft. Der heute rote
`typecheck-gate`-Test war ein Umgebungseffekt (fehlendes `node_modules` im
Haupt-Checkout → Hook designgemäß fail-open), kein Hook-Defekt; nach
`npm ci --ignore-scripts` dort 6/6 grün — Details im Session-Verlauf.

**Was angenommen wurde (nicht geprüft):** Homeys Laufzeitverhalten bei
`removeCapability` (Verwerfen von `capabilitiesOptions`) und die Merge-Semantik von
`setCapabilityOptions`; ob `getSetting` innerhalb `onSettings` schon den neuen Wert
liefert (offen seit dem Altlauf); reale Violet-Firmware-Payloads jenseits der
committeten Fixtures (betrifft P1/P4); die O(n)-Kostenannahme für `hasCapability`
(nur mock-belegt); das Re-Fetch-Verhalten der Homey-Pairing-Runtime (P2).
