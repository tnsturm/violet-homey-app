---
range: 468959e..4d1aaf3
head: 4d1aaf34838a14b35e074b04df0773724e6d06b5
date: 2026-08-25
lens: adversarial-reviewer
verify: npm test → 17/17 grün (unverändert)
purpose: Kalibrierungslauf der neuen Linse — kein Review eines laufenden Meilensteins
triage: offen (Stand 2026-08-27)
---

# Adversarial Review — M0 Foundation + Clear-on-Stale

> **Einordnung (nachträglich, 2026-08-27).** Dieser Lauf hat die neue Linse
> `adversarial-reviewer` kalibriert, nicht den aktuellen Code geprüft. Er lief gegen den
> M0-Stand `4d1aaf3` von Ende Juni; `main` ist seither rund 300 Commits weiter und
> `drivers/pool/device.js` um etwa 700 Zeilen gewachsen. **Die Zeilenangaben unten zeigen
> deshalb auf Code, der so nicht mehr existiert, und keiner der Funde ist triagiert.**
> Behandle sie als Hypothesen, die am heutigen Code neu zu belegen oder zu verwerfen sind —
> nicht als offene Fehlerliste.
>
> Als Kalibrierungsnachweis ist der Lauf aussagekräftig: null erfundene Criticals trotz
> gegnerischem Framing, beide damals bekannten M1-Befunde eigenständig gefunden,
> Schreibgrenze gehalten. Zwei Funde wurden stichprobenartig am Code bestätigt, die
> widerlegte Fixture-Behauptung in F6 auf die Sekunde nachgerechnet.
>
> Der Lauf lief über `general-purpose`, weil der Agent-Typ am selben Tag entstand und erst
> nach einem Session-Neustart registriert war — er erbte die Aufwandsstufe der Session
> statt `xhigh`. Das Ergebnis ist eher eine Untergrenze.

Geprüft: 31 Commits, 40 Dateien. Angriffsfläche waren `drivers/pool/device.js`,
`lib/*.js`, die Manifeste und die Testsuite. Referenzen: M0-Spec (`M0 §N`),
Clear-Stale-Spec (`clear-stale §N`), `.superpowers/sdd/global-constraints.md`.

**Ergebnis: kein CRITICAL. 2 HIGH, 4 MEDIUM.**

Der zentrale strukturelle Befund hinter F1–F5: `drivers/pool/device.js` hat
**keinerlei Testabdeckung** — weder Unit noch Harness. Jede Zeile dieser Datei
lässt sich beliebig verändern, ohne dass `npm test` rot wird. Der Plan
(`plans/2026-06-27-clear-stale-measurements.md`, Task 2) benennt das explizit
("device.js is runtime glue … verified live, not unit-tested") und macht damit
die Live-Verifikation zum einzigen Gate für genau die Datei, in der die
Zustandsmaschine liegt. Die reine `/lib`-Suite ist solide, aber sie prüft die
Entscheidung *gegeben* `fresh`, nie das Zustandekommen von `fresh` und nie den
Fehlerpfad.

---

### F1 · HIGH · drivers/pool/device.js:47-56

**Ist der Violet nicht erreichbar, behauptet das Gerät weiter `measurements_fresh = true` und friert die Messwerte ein — genau das Verhalten, das dieser Diff abschaffen sollte.**

Der `catch`-Zweig in `_tick()` erhöht nur den Fehlerzähler und macht `return`,
*bevor* irgendein Capability geschrieben wird. Damit behalten alle Capabilities
den Wert des letzten erfolgreichen Polls — inklusive `measurements_fresh`.
Clear-on-Stale greift ausschließlich, wenn ein Payload ankommt und `fresh === false`
ist; der Fall "gar kein Payload" ist im gesamten Diff nicht behandelt.

**Repro**
1. Pumpe läuft, Warmup abgelaufen → ein Poll schreibt `measurements_fresh = true`,
   `measure_ph = 7.30`.
2. Violet vom LAN trennen (oder `host` auf eine nicht geroutete Adresse wie
   `192.0.2.1` setzen).
3. Ab jetzt wirft `fetchReadings` bei jedem Tick, `_tick` kehrt in Zeile 55 zurück.
   Nach 3 Ticks (≥180 s) wird das Gerät `unavailable`.
4. Beobachtbar, beliebig lange danach: die Kachel zeigt weiterhin
   `Messwerte aktuell: Ja` und `pH 7.30`; Insights zeichnet für `measure_ph`
   über die gesamte Ausfalldauer die flache Carry-Forward-Linie, die
   clear-stale §1 als Bug beschreibt. Ein Flow, der laut M0 §7 auf
   `measurements_fresh` gaten soll ("also exposed so user Flows can gate on it"),
   rechnet mit Daten unbekannten Alters weiter — dasselbe gilt für den
   M1-LSI-Gate.

Die Asymmetrie ist der Kern: Pumpe-aus (Werte sind alt, aber real gemessen) →
Werte werden gelöscht. Controller offline (Werte sind alt *und* unbestätigt) →
Werte bleiben stehen und werden zusätzlich als frisch deklariert.

**Warum die Tests es nicht fangen**
Kein Test ruft `_tick()` auf; der Fehlerpfad existiert in keiner Suite.
`Freshness.test.js` prüft `isFresh` nur mit Pumpen-Eingaben und kennt den
Zustand "kein Payload" nicht — `isFresh` wird auf diesem Pfad gar nicht erst
aufgerufen. `Capabilities.test.js` testet den reinen Planer, der hier nie läuft.

**Fix-Ansatz**
Im Fehlerpfad (spätestens ab Erreichen der 3-Fehler-Schwelle aus M0 §10)
`measurements_fresh = false` schreiben und die fresh-gegateten Sonden nach
derselben Regel wie bei Stale auf `null` setzen; alternativ `fresh` zusätzlich
gegen das Alter des letzten erfolgreichen Polls prüfen, sodass "keine Daten"
strukturell nie "frisch" ergeben kann.

Status: offen

---

### F2 · HIGH · drivers/pool/device.js:92-117

**Ein einziger gestörter Poll entfernt Capabilities sofort und dauerhaft — laut SDK-Doku brechen dabei alle Flows, die darauf verweisen. Es gibt keine Hysterese, obwohl M0 §10 für transiente Störungen genau das fordert.**

`_reconcileCapabilities` läuft bei *jedem* erfolgreichen Poll ohne Entprellung:
- Zeile 112-116: jedes `measure_temperature.owN`, dessen Kanal in *diesem*
  Payload nicht `state === "OK"` liefert, wird per `removeCapability` entfernt.
- Zeile 96-100: `measure_chlorine` wird entfernt, sobald ein Payload weder
  `DOS_1_CL_USE === "1"` noch das Feld `pot_value` enthält.

Homey-SDK-Doku zu `removeCapability`: "Any Flow that depends on this capability
will become broken. Note: this is an expensive method so use it only when needed."

**Repro**
Den 1-Wire-Fühler des Wasserkanals abziehen (oder eine Busstörung abwarten —
dass Lesefehler ein regulärer Betriebszustand sind, belegt der Payload selbst:
er führt pro Kanal `onewireN_faultcount` und `onewireN_freezecount`, und
`onewireN_state` ist ein Zustandsfeld mit mindestens `OK` /
`NO_SENSOR_CONFIGURED` — im Fixture stehen die Kanäle 11 und 12 auf
`NO_SENSOR_CONFIGURED`).
1. Poll N: Kanal 1 ist `OK` → Capability `measure_temperature.ow1` existiert,
   ein Flow des Nutzers referenziert die Kachel.
2. Stecker ziehen. Poll N+1 (≤60 s später): `parseReadings` nimmt Kanal 1 nicht
   in `tempChannels` auf → `wanted` enthält ihn nicht → `removeCapability(
   'measure_temperature.ow1')`.
3. Beobachtbar: Die Kachel verschwindet, der Flow ist defekt und muss manuell
   repariert werden. Stecker wieder rein → Poll N+2 legt das Capability neu an,
   der Flow bleibt defekt und die Verlaufsanzeige beginnt bei null.

Verstärker: War der weggefallene Kanal der in `waterTempChannel` ausgewählte,
liefert `choosePrimaryTemperature` im selben Poll `null` — und seit 4d1aaf3
*schreibt* die Apply-Schleife dieses `null`, statt es zu überspringen. Die
Hauptkachel `measure_temperature` wird also im selben Tick zusätzlich auf "–"
geleert.

Spannung zur Spec: M0 §10 schreibt fest "transient failures do not clear
last-known capability values" und gewährt dem Fetch-Pfad ausdrücklich 3
Fehlversuche Toleranz. Der Reconcile-Pfad hat keine — er kann "Hardware
dauerhaft entfernt" nicht von "Sensor für einen Poll nicht lesbar"
unterscheiden.

**Warum die Tests es nicht fangen**
`_reconcileCapabilities` ist in keinem Test. Getestet ist nur
`desiredFeatureCapabilities` als reine Funktion (`Capabilities.test.js:29-42`) —
die liefert korrekt `[]`, wenn `features.chlorine === false`; dass ein
transienter Payload dieses `false` erzeugt und das Ergebnis ohne Hysterese
destruktiv angewendet wird, liegt außerhalb ihres Gültigkeitsbereichs.
`FeatureDetector.test.js` speist nur zwei stabile Fixtures ein, nie eine
Sequenz aus zwei aufeinanderfolgenden, unterschiedlichen Payloads.

**Fix-Ansatz**
Entfernen entprellen: einen Kanal/ein Feature erst nach N aufeinanderfolgenden
Polls ohne Nachweis abbauen (analog zur 3-Fehler-Schwelle in §10), Aufbau
weiterhin sofort. Das lässt sich als reine Funktion in `/lib` mit Zählerzustand
testen.

Status: offen

---

### F3 · MEDIUM · drivers/pool/device.js:51-56

**Jeder Fetch- und Parse-Fehler wird vollständig verschluckt: `err` wird gebunden und nie verwendet, obwohl M0 §10 "Errors logged via `this.error`" verlangt.**

```js
} catch (err) {
  this._failures += 1;
  if (this._failures >= 3) await this.setUnavailable('Violet not reachable').catch(this.error);
  return;
}
```

**Repro**
`host` auf `192.0.2.1` (TEST-NET-1, nicht routbar) setzen und `homey app run`
mitlesen. Beobachtbar: Bei Fehler 1 und 2 erscheint im App-Log **keine einzige
Zeile**; ab Fehler 3 nur die generische Gerätemeldung "Violet not reachable".
Dasselbe gilt für einen Controller, der HTTP 500 liefert (`Violet HTTP 500` aus
`VioletClient.js:65`), für ein Timeout (`AbortError`) und für ungültiges JSON
(`res.json()` wirft) — drei Ursachen mit völlig unterschiedlicher Behebung sind
im Log nicht unterscheidbar, weil keine davon je geloggt wird.

**Warum die Tests es nicht fangen**
Kein Test berührt `_tick`. `VioletClient.test.js` testet ausschließlich
`buildReadingsUrl` und `parseReadings`; `fetchReadings` wird nirgends
aufgerufen, also ist auch kein Fehlerpfad des Clients abgedeckt. Ein Linter,
der die ungenutzte Bindung `err` melden würde, ist im Repo nicht konfiguriert.

**Fix-Ansatz**
`this.error('poll failed', err)` in den catch-Block, vor der Zählerlogik.

Status: offen

---

### F4 · MEDIUM · drivers/pool/device.js:66-70

**Nach jedem App-Neustart hält die App die Werte für ~eine Warmup-Periode fälschlich für stale — und seit 4d1aaf3 *löscht* sie sie dabei. Das reißt genau die Insights-Lücke, die dieser Diff als Signal für "nicht gemessen" reserviert.**

Root Cause ist bekannt und bewusst nach M1 verschoben (`notes/2026-06-26-m1-inputs.md`
§1: "M0 ships the in-memory version; this is an intentional M1 improvement, not
an M0 bug"). Gemeldet wird nicht die Ursache, sondern dass **dieser Diff die
Schadenswirkung geändert hat**: Zum Zeitpunkt der Verschiebeentscheidung war ein
falsches Stale-Fenster folgenlos (Werte froren ein). Seit 4d1aaf3 schreibt
dasselbe Fenster `null` in `measure_ph`/`measure_orp`/`measure_chlorine`.

`_pumpOnSince` lebt nur im Speicher (Zeile 22) und wird bei laufender Pumpe auf
den *ersten beobachteten* Poll gesetzt (Zeile 66-67) — nicht auf den echten
Einschaltzeitpunkt.

**Repro**
1. Pumpe läuft seit Stunden, `measurements_fresh = true`, `measure_ph = 7.30`.
2. App neu installieren oder Homey neu starten (`homey app install`, Firmware-Update,
   App-Update). Der Live-Effekt auf die Freshness ist in den Notes bereits
   beobachtet: "observed live: reinstalling M0 reset `measurements_fresh` to
   false for ~one warmup window".
3. Erster Tick: `_pumpOnSince === null` → wird auf `now` gesetzt → `isFresh`
   liefert `false`, obwohl das Wasser die ganze Zeit zirkuliert hat.
4. Neu seit 4d1aaf3 und deterministisch: `buildCapabilityUpdates` liefert
   `measure_ph: null`, die Apply-Schleife schreibt es. Beobachtbar: die Kacheln
   zeigen 2 Minuten "–", und Insights bekommt einen Null-Eintrag, der eine
   Messpause behauptet, die es nicht gab. Bei einem Poll-Intervall von 60 s und
   Warmup 120 s betrifft das 2 Polls pro Neustart.

Derselbe Mechanismus ohne Neustart: `now` stammt aus `CURRENT_TIME_UNIX` des
Controllers (Zeile 61), und es gibt keinerlei Absicherung gegen einen
Rückwärtssprung dieser Uhr — `_pumpOnSince` wird nur bei *Pumpe aus*
zurückgesetzt (Zeile 69), also bleibt `now - pumpOnSince` nach einem Rücksprung
für dessen gesamte Dauer negativ. Randnotiz zur Uhr, die beim M1-Refactor zählt:
im Fixture entspricht `CURRENT_TIME_UNIX` (1782345366.151) als UTC gerendert
exakt dem Feld `time` des Controllers (23:56:06) — das Feld trägt also
Wanduhrzeit, nicht UTC. Damit sind der Primärwert und der Fallback
`Math.floor(Date.now()/1000)` in Zeile 61 zwei verschiedene Zeitbasen (in
Deutschland 1–2 h auseinander), und ein DST-Rücksprung wirkt direkt auf die
Warmup-Arithmetik.

**Warum die Tests es nicht fangen**
`Freshness.test.js` hat vier Fälle, in allen gilt `pumpOnSince <= now`; ein Fall
`now < pumpOnSince` existiert nicht, und `isFresh` hat keine Klammerung dafür
(`Freshness.js:21`). Die Rising-Edge-Verfolgung selbst (device.js:66-70) ist
ungetestet, ebenso der Neustartpfad — `onInit` wird von keinem Test aufgerufen.

**Fix-Ansatz**
Kurzfristig: `_pumpOnSince` klammern (`if (this._pumpOnSince === null || now < this._pumpOnSince)`)
und beim Neustart nicht künstlich stale werden — z. B. `_pumpOnSince` aus
`PUMP_LAST_ON` initialisieren, das bereits im Payload steht. Das ist die in
Notes §1 für M1 vorgesehene Umstellung; nach diesem Diff ist sie nicht mehr nur
eine Härtung, sondern verhindert falsche Insights-Lücken.

Status: offen

---

### F5 · MEDIUM · lib/Capabilities.js:66-71 / drivers/pool/device.js:84-89

**Die App veröffentlicht `measurements_fresh = true`, bevor sie die Werte schreibt, die dadurch als frisch zertifiziert werden. Seit 4d1aaf3 stehen die Sonden in diesem Moment auf `null` statt auf dem letzten realen Messwert.**

`buildCapabilityUpdates` legt die Keys in dieser Reihenfolge an: `pump_running`,
`measurements_fresh`, `measure_temperature`, die `.owN`-Kanäle, danach erst
`measure_ph`/`measure_orp`/`measure_chlorine`. `Object.entries` erhält für
String-Keys die Einfügereihenfolge (ES-Spezifikation), und die Apply-Schleife
awaitet jeden Schreibvorgang einzeln. Der Übergang von `measurements_fresh` wird
also garantiert an den Homey-Core übergeben, *bevor* `measure_ph` überhaupt
gesendet wird.

**Repro**
1. Pumpe war über Nacht aus → Clear-on-Stale hat `measure_ph = null` gesetzt
   (die Kachel zeigt "–").
2. Pumpe startet; nach Ablauf des Warmups läuft der erste frische Poll.
3. Die Schleife schreibt der Reihe nach: `pump_running = true`,
   **`measurements_fresh = true`** (Homey feuert hier den Capability-Change-Trigger),
   Temperaturen, und **erst danach** `measure_ph = 7.30`.
4. Deterministisch beobachtbar ist der Zustand zwischen den beiden Writes:
   `measurements_fresh === true` bei `measure_ph === null`. Ein Flow nach dem in
   M0 §7 vorgesehenen Muster ("Wenn Messwerte aktuell → …") wird in diesem
   Fenster ausgelöst und rennt gegen den pH-Write; liest er den Tag zu früh,
   bekommt er einen leeren Wert. Vor diesem Diff war der schlimmste Fall dort
   ein etwas veralteter, aber plausibler Messwert — jetzt ist es `null`.

Garantiert ist die Reihenfolge (Trigger vor Wert); ob ein konkreter Flow den
leeren Wert sieht, ist ein Rennen von wenigen Millisekunden. Der Fund ist die
Reihenfolge, nicht das Rennen.

**Warum die Tests es nicht fangen**
`Capabilities.test.js:44-62` prüft die Map ausschließlich per Key-Zugriff
(`stale.measure_ph`, …) — die Reihenfolge der Keys ist in keiner Assertion
enthalten (kein `deepStrictEqual` auf das ganze Objekt, kein
`Object.keys(...)`-Vergleich). Die Apply-Schleife ist ohnehin ungetestet. Man
kann die Reihenfolge in `buildCapabilityUpdates` beliebig umstellen, ohne dass
ein Test reagiert.

**Fix-Ansatz**
`measurements_fresh` als letzten Key einfügen (bzw. in der Apply-Schleife
zuletzt schreiben), damit der Freshness-Flankenwechsel erst veröffentlicht wird,
wenn die zugehörigen Werte gesetzt sind.

Status: offen

---

### F6 · MEDIUM · docs/superpowers/notes/2026-06-26-m1-inputs.md:15-24

**Die Notiz behauptet, die Identität `CURRENT_TIME_UNIX − PUMP_LAST_ON == PUMP_RUNTIME` sei "CONFIRMED … in the committed demo fixture" — im committeten Fixture ist sie um 15,5 Stunden falsch, und die zitierten Zahlen stehen dort überhaupt nicht.**

Die Notiz ist die Beweisgrundlage für den geplanten M1-Freshness-Refactor.

**Repro** (gegen `test/fixtures/getReadings.all.json`, HEAD):
```
CURRENT_TIME_UNIX = 1782345366.151
PUMP_LAST_ON      = 1782331200
→ Differenz        = 14166 s  (3h56m06s)
PUMP_RUNTIME      = "19h 23m 23s"  = 69803 s
→ Abweichung       = 55637 s
```
Die in der Notiz zitierten Werte (`PUMP_LAST_ON = 1782464400`,
`CURRENT_TIME_UNIX = 1782471258.752`, `PUMP_RUNTIME "01h 54m 18s"`) kommen im
gesamten Repo nur in der Notiz selbst vor — `grep -rn "1782464400"` findet
keinen Fixture-Treffer. Im committeten Fixture ist `PUMP_RUNTIME` erkennbar ein
kumulativer Zähler (19 h, bei einer Pumpe, die vor knapp 4 h angelaufen ist:
`PUMP_LAST_OFF` = 1782330660 liegt 9 Minuten vor `PUMP_LAST_ON`), kein
Sitzungslaufzeitwert.

Auswirkung: Wer M1 nach dieser Notiz umsetzt, hält die Identität für am
Projekt-Fixture verifiziert. Die empfohlene Formel selbst
(`now − PUMP_LAST_ON >= warmupSeconds`) bleibt davon unberührt und plausibel —
falsch ist die Belegkette. Ein M1-Test, der die Identität wie zitiert gegen das
committete Fixture prüft, schlägt sofort fehl.

**Warum die Tests es nicht fangen**
Keine Testdatei liest `PUMP_LAST_ON` oder `PUMP_RUNTIME`; `parseReadings`
extrahiert beide Felder gar nicht. Doc-Behauptungen über Fixtures sind in diesem
Repo generell ungeprüft.

**Fix-Ansatz**
Die Zeilen 15-24 auf die tatsächliche Quelle zurückführen (Live-Capture, nicht
das committete Fixture) und `PUMP_RUNTIME` dort als kumulativ kennzeichnen; oder
ein zweites Fixture mit dem zitierten Capture committen, gegen das die
Behauptung tatsächlich hält.

Status: offen

---

## Angegriffen, hält

Annahmen, an denen ich gezielt gerüttelt habe und die standhalten — damit die
Triage weiß, was bereits abgeräumt ist:

1. **Generiertes `app.json` gegen `.homeycompose`.** Programmatisch verglichen:
   App-Meta, alle fünf Custom-Capabilities, Driver-Fragment und Settings sind im
   generierten Manifest byte-identisch enthalten. Kein Stale-Build, insbesondere
   sind die in 807c4de nachgezogenen `de`-Strings vollständig drin. Alle fünf
   Custom-Capabilities tragen `insights: true` + `insightsTitle` (Global
   Constraint / M0 §5.1).
2. **`Number(raw.PUMP) === 1` gegen Pumpen mit Drehzahlstufen.** Im 399-Feld-Fixture
   ist `PUMP` ein reines 0/1; die Stufen liegen separat in `PUMP_RPM_0..3`
   (`PUMP_RPM_1 = 1`). Eine drehzahlgeregelte Pumpe kann das Freshness-Gate also
   nicht dauerhaft blockieren.
3. **`num()` gegen Müllwerte.** Nicht-endliche Eingaben (fehlend, `""`, `[]` —
   das Fixture liefert für `PUMPSTATE`/`DOS_1_CL_STATE` tatsächlich `[]`)
   liefern `null`, nie `NaN`. Ein `NaN` kann also nicht in einen
   Capability-Write geraten.
4. **Kanalfilter.** `parseReadings` verlangt `state === 'OK'` **und** einen
   numerischen Wert; die `NO_SENSOR_CONFIGURED`-Kanäle 11/12 (Wert `0`) können
   sich nicht als 0 °C-Messung tarnen.
5. **`undefined` vs. `null` im Clear-Pfad.** Die Unterscheidung ist konsistent:
   fresh + `chlorine === null` bleibt `undefined` (Test deckt es ab), und ein
   stale `measure_chlorine: null` wird durch den `hasCapability`-Guard nie auf
   ein Gerät ohne Chlor-Capability geschrieben.
6. **Settings-Wirksamkeit ohne Neustart.** `host`, `pumpWarmupSeconds`,
   `waterTempChannel` und `group_chlorine` werden pro Tick frisch gelesen; eine
   Änderung greift beim nächsten Poll. (Ausnahme `pollIntervalSeconds`, siehe
   unten.)
7. **Pairing-Identität.** Die UUID entsteht einmal pro `connect`-Aufruf und
   landet unverändert in `list_devices`; `data` enthält keinen Host (Global
   Constraint). Das Passwort geht ausschließlich in den `store`.
8. **Timer.** Poll-Timer laufen über `this.homey.setInterval/clearInterval` und
   werden in `onUninit` abgeräumt. Der einzige globale `setTimeout` steckt im
   Abort-Pfad von `fetchReadings` und wird im `finally` immer geräumt.

## Nicht gemeldet, weil nicht belegbar

- **`pollIntervalSeconds` in `onSettings`** (`device.js:36-38`): `_startPolling()`
  liest den Wert über `this.getSetting(...)` *innerhalb* des Handlers. Ob Homey
  Device-Settings vor oder nach dem Auflösen von `onSettings` persistiert, ließ
  sich nicht klären — die SDK-Doku sagt es nicht explizit (die Formulierung
  "…asked to change their settings in order to store them" deutet auf
  "nachher"), und das npm-Paket `homey` ist nur ein Runtime-Stub ohne Quelltext.
  Persistiert Homey nachher, greift ein geändertes Poll-Intervall erst nach
  einem Neustart. **Eine Live-Prüfung entscheidet es:** Intervall von 60 auf 900
  stellen und den Abstand der nächsten Polls messen. Bis dahin kein Fund.
- **Reentrancy zweier `_tick`-Läufe**: konstruierbar nur, wenn eine
  Settings-Änderung exakt in ein laufendes Fetch (≤10 s) innerhalb eines ≥60-s-
  Intervalls fällt. Ich konnte daraus kein beobachtbar falsches Ergebnis
  ableiten — kein Fund.
- **Chlor-Erkennung über `has('pot_value')`** statt "pot sensor active" (M0 §5):
  Ob Firmware das Feld auch auf Pools *ohne* Potentiostat mitsendet (was zu
  einer dauerhaften "0,00 mg/L"-Anzeige führen würde), lässt sich aus den
  vorhandenen Payloads nicht belegen — kein Fund.
