# M5.8 — getReadings-Vervollständigung: Design-Spec

- **Date:** 2026-07-15
- **Milestone:** M5.8 (ehem. M10-Aufgabe A + Rest-Kandidaten aus der API-Analyse)
- **Status:** Vom User abgestimmt (2026-07-15): Ansatz A, keine Alarme (vertagt), Diagnose-Annotation mitnehmen.
- **Grundlagen:** docs/superpowers/notes/2026-07-13-violet-api-analysis-getconfig-dosing.md (§1/§6),
  docs/superpowers/notes/2026-07-13-violet-hass-review.md,
  docs/superpowers/notes/2026-07-01-m2-field-classification.md (Skip-Liste, Alarm-Deferrals),
  M2-Spec (2026-07-01), M5.7-Spec (2026-07-14, ConfigFacts/Whitelist),
  5 Violet-GUI-Screenshots des Users (2026-07-15).

---

## §1 Live-Verifikation (Beleg-Basis; violet-hass-Lehre: nie raten)

Alle Feld-Übernahmen sind gegen die echte Violet belegt (2026-07-14 23:30 Pumpe AUS,
2026-07-15 09:52 Pumpe AN, ungeregelte Pumpe; plus Real-Fixture `test/fixtures/getReadings.all.json`):

| Feld | Pumpe AUS | Pumpe AN | getConfig / GUI |
|---|---|---|---|
| `ADC1_value` | −0.11 | **0.31** | use=1, units **Bar**, Name **Filterdruck**, decimal=2, range 0–1.6 Bar (GUI: „Filterdrucksensor (ADC1)", Messwert 0.31 Bar = identisch) |
| `IMP1_value` | 0 | **16.3** | use=1, units **cm/s**, Name **Anströmung** (GUI: „Impulseingang 1 (Messwasserüberwachung)", Hallgeber) |
| `IMP2_value` | 0 | **0** | use=0, units m³/h, Name Förderleistung (GUI: „Nicht verwenden") — **liefert trotz Pumpe an keine Werte**; Fixture-Wert 8.87 war historisch |
| `ADC2..5_value` | Müll (−45.8 …) | Müll | use=0 (GUI: alle „Nicht verwenden") → use=1-Gating ist Pflicht |
| `DOS_1_CL_REMAINING_RANGE` | `"33h"` | `"33h"` | **h-Suffix live**; `parseRangeToDays` liefert heute `null` → CL-Restreichweite-Kachel ist aktuell stale (Bug) |
| `DOS_6_FLOC_REMAINING_RANGE` | `">99d"` | `">99d"` | `>`-Präfix live (Kanal use=0, Parser muss es trotzdem können) |
| `SOLARSTATE` | `"0\|BLOCKED_BY_SENSOR_FAULT"` | dito | **Pipe-String-Format live**, gleichzeitig `PUMPSTATE=[]`/`HEATERSTATE=[]` (Array) — beide Formate koexistieren |
| `last_error_id` | 898 | 900 | inkrementiert laufend (894→900 in 2 Tagen) → reiner Diagnose-Wert, bleibt wie er ist |
| `onewireN_freezecount` | ow1: 3→6 seit 13.07. | — | inkrementiert mitten im Juli → Delta-Alarm wäre False-Positive-Falle |
| `getOutputRuntimes` | — | — | Endpoint existiert, liefert exakt dieselben `*_RUNTIME` wie getReadings (nur Wanduhr-Timestamps) → kein Mehrwert |
| `NAMES_impulscount1/2` | — | — | **So heißen die NAMES-Keys der Impulseingänge** (nicht `NAMES_imp*`) |
| `ANALOG_adcN_decimal` | — | — | Nachkommastellen als Config-Key (GUI „Nachkommastellen: 2"); dazu `_offset`, `_range_min/max`, `_signal_min/max` |

GUI-Screenshots bestätigen zusätzlich: Filtersteuerung „Ungeregelt" (Ein/Aus-Pumpe),
Absorber/Rückspülautomatik/Licht/Cover/Überlauf/Elektrolyse/pH+/Flockmittel „Nicht verwenden",
Chlor flüssig + pH− + Chlormessung + Niveausteuerung „Verwenden" — deckungsgleich mit
Feature-Detection und ConfigFacts.

## §2 Scope und Non-Goals

**In M5.8 (Ansatz A — config-gesteuerte generische Kanal-Capabilities):**

1. Neue Feature-Gruppe **Messeingänge** (`inputs`): Sub-Capabilities `measure_adc.<n>` (n=1..6)
   und `measure_impulse.<n>` (n=1..2) für Kanäle mit `use=1`; Titel/Einheit/Nachkommastellen
   aus getConfig. Auf der Referenz-Hardware: genau 2 neue Kacheln (Filterdruck Bar, Anströmung cm/s).
2. **Parser-Fix `parseRangeToDays`**: `h`-Suffix (÷24) und `>`-Präfix (">99d" → 99) — behebt die
   stale CL-Kachel.
3. **Gemeinsamer STATE-Parser** für Array- UND Pipe-String-Format; Block-Klassifikation nur für
   `BLOCKED_BY_*` — löst den eingefrorenen todo-Test `alarm_dosing_blocked`
   (`CL_DOSING_CONTROLLER` = Normalbetrieb).
4. **Diagnose-Annotation erweitert**: Blockier-/Fehlgrund (z. B. `BLOCKED_BY_SENSOR_FAULT`) an den
   Kacheln pump_running/heater_active/solar_active im Diagnostics-Modus.
5. **ConfigFacts/Whitelist-Delta** (§4).

**Non-Goals (begründete Skips, M2-Skip-Liste respektiert):**

- **Keine Alarme** (`alarm_backwash_needed`, `alarm_no_flow`): User-Entscheidung 2026-07-15 —
  vertagt auf den Trigger-/Notification-Milestone. Dort ist zu entscheiden, ob Alarme in der
  Violet definiert und von der App nur angenommen/abgebildet werden, oder ob eigene
  Homey-Logik entsteht; Sicherheitsmaßnahmen (z. B. Pumpenabschaltung bei fehlendem
  Filterdruck) wären dann als Homey-Flows zu bauen. Die neuen Zahlen-Capabilities liefern
  ab sofort die Datenbasis (Insights + Flow-Bedingungen auf Zahlenwerte gehen schon heute).
- **PUMPSTATE/SOLARSTATE/HEATERSTATE als Alarm-Caps**: SOLARSTATE steht auf der Referenz
  dauerhaft auf `BLOCKED_BY_SENSOR_FAULT` (Absorbersteuerung „Nicht verwenden") → Dauer-Alarm-Noise.
  Nur Diagnose-Annotation (Punkt 4).
- **OMNI_DC0..5**: DC0 dauerhaft an (Ventil-Versorgung), Rest 0 — kein Owner-Nutzen (M2 Gruppe 17).
- **onewireN_freezecount/faultcount-Alarme**: False-Positive-Beleg §1; weiter beobachten (M2-Deferral bleibt).
- **SYSTEM_*_alive_faultcount**: live 0; erst mit Notifications (M6) sinnvoll.
- **getOutputRuntimes**: kein Mehrwert (§1).
- **last_error_id**: bleibt Diagnose-Cap wie seit M2; Code-Tabelle weiter unbekannt.

## §3 Capabilities und Gating (Ansatz A)

- **Basis-Capabilities** (`.homeycompose/capabilities/`): `measure_adc.json`, `measure_impulse.json` —
  `type: number`, `getable: true`, `setable: false`, `uiComponent: sensor`, `insights: true`.
  Default-Titel „Analogeingang"/„Impulseingang" (en: „Analog input"/„Pulse input").
- **Instanzen** `measure_adc.<id>` / `measure_impulse.<id>` analog zum `measure_temperature.owN`-Muster:
  pro Instanz `setCapabilityOptions` mit `title` = NAMES-Label (Fallback „Analogeingang N"),
  `units` = `*_units`-String verbatim, `decimals` = `ANALOG_adcN_decimal` (Fallback 2; Impulseingänge
  haben keinen decimal-Key → Fallback 1).
- **Gating** (Signalmatrix-konform, M5.7): Kanal erscheint iff ConfigFacts ihn mit `use=true` melden.
  Config ist hier in BEIDE Richtungen autoritativ (wie Cover, M5.7 §6): schaltet der User einen
  Eingang in der Violet-GUI ab, verschwindet die Kachel beim nächsten Config-Read
  (CONFIGCHANGEMARKER-Trigger existiert seit M5.7). Ohne ConfigFacts (getConfig nie erfolgreich):
  keine Eingangs-Kacheln — bewusst konservativ, denn rohe `ADCn_value` ohne use-Flag sind Müll (§1).
- **Gruppen-Override** `inputs` (Settings-Radio wie andere Gruppen): `auto` (Default) = use=1-Kanäle;
  `hide` = keine; `force` = alle von der Config gemeldeten Kanäle (auch use=0 — bewusste
  User-Entscheidung, dann inkl. Müllwerten).
- **Werte pro Poll** (`buildM2Updates`): `measure_adc.<id>` = `num(raw['ADC<id>_value'])`,
  `measure_impulse.<id>` = `num(raw['IMP<id>_value'])`; nicht fresh-gated (wie übrige M2-Status-Caps);
  fehlende Felder lassen die Capability unangetastet.

## §4 ConfigFacts/Whitelist-Delta (SR-11-konform, keine Secrets)

`CONFIG_QUERY` +3 Einträge, alle live belegt (§1):

- `NAMES_impulscount` (Präfix → `NAMES_impulscount1/2`) — Labels der Impulseingänge.
- `ANALOG_adc1_decimal` … `ANALOG_adc6_decimal` (explizit, 6 Keys) — Nachkommastellen.

`parseConfigFacts`: `impulsChannels[]` bekommt `name` (aus `NAMES_impulscountN`, Label-Regeln wie adc),
`adcChannels[]` bekommt `decimals` (Number, Fallback null). `factsEmpty` unverändert (die neuen
Felder hängen an bestehenden Kanal-Einträgen).

## §5 Parser

**`parseRangeToDays`** (lib/FeatureGroups.js): akzeptiert optionales `>`-Präfix und `h`-Einheit.
`"33h"` → 33/24 = 1.38 (h-Ergebnisse werden neu auf 2 Nachkommastellen gerundet; d/w/m-Werte
bleiben wie bisher ungerundet); `">99d"` → 99; bestehende d/w/m-Semantik unverändert;
unparsebar → weiterhin `null`.

**Neuer STATE-Parser** (lib/FeatureGroups.js, pure):

- `stateReasons(v) → string[]`: Array → Elemente als Strings; String mit `|` → alle Segmente
  nach dem ersten (`"0|BLOCKED_BY_SENSOR_FAULT"` → `["BLOCKED_BY_SENSOR_FAULT"]`); sonstige
  Strings/Zahlen/undefined → `[]`.
- `stateBlocked(v) → boolean`: `stateReasons(v).some(r => r.startsWith('BLOCKED_BY_'))`.
  Konservativ nur das live/forum-belegte Blocker-Vokabular; `CL_DOSING_CONTROLLER`,
  `MANUAL_*`, `TRESHOLDS_REACHED*` gelten als Normalbetrieb (Notiz §2-Vokabular).
- `alarm_dosing_blocked.<ch>` nutzt `stateBlocked` statt `faultQueueActive` → der
  `{ todo: true }`-Test wird entfroren (Flag weg) und muss grün sein. `faultQueueActive`
  entfällt, wenn danach referenzlos (Orphan-Regel CLAUDE.md §3).

## §6 Diagnose-Annotation (STATE-Gründe)

`DIAG_SIMPLE` wird um die STATE-Quelle erweitert: `pump_running` → `PUMP` + `PUMPSTATE`,
`heater_active` → `HEATER` + `HEATERSTATE`, `solar_active` → `SOLAR` + `SOLARSTATE`.
`diagRawValue` zeigt bei nicht-leeren `stateReasons` den Grund an, z. B. `2 | BLOCKED_BY_SENSOR_FAULT`
(Wert + Gründe), sonst wie bisher nur den Rohwert. Mechanik (nur im
`show_advanced_diagnostics`-Modus, Titel-Annotation) bleibt unverändert.

## §7 Fehlerpfade

- getConfig weiterhin fail-soft (M5.7 SR-13/SR-16): keine Facts → keine Eingangs-Kacheln, nie
  Availability-Auswirkung.
- Kanal in Config gemeldet, aber `ADCn_value`/`IMPn_value` fehlt in getReadings: Kachel bleibt,
  Wert unangetastet (Standard-Semantik von `buildM2Updates`).
- Mischtypen: `num()`-Koersion wie überall; nicht-numerisch → Key ausgelassen.

## §8 Tests (TDD; Fixtures = echte Live-Werte aus §1)

1. `parseRangeToDays`: `"33h"`→1.38, `">99d"`→99, `"37d"`/`"6w"`/`"2m"` unverändert, `"kaputt"`→null.
2. `stateReasons`/`stateBlocked`: `[]`→[]/false; `["CL_DOSING_CONTROLLER"]`→false (todo-Test entfroren);
   `["BLOCKED_BY_MAX_AMOUNT"]`→true; `"0|BLOCKED_BY_SENSOR_FAULT"`→true; `"0"`→false; `0`→false.
3. `parseConfigFacts`: `NAMES_impulscount1` → impulsChannels[0].name="Anströmung";
   `ANALOG_adc1_decimal:"2"` → decimals=2; fehlende Keys → Fallbacks.
4. `desiredM2Capabilities`: use=1-Gating (Referenz-Config → genau `measure_adc.1` + `measure_impulse.1`);
   `force` → auch use=0-Kanäle; `hide` → keine; ohne Facts → keine.
5. `buildM2Updates`: Pumpe-AN-Fixture → `measure_adc.1`=0.31, `measure_impulse.1`=16.3;
   Pumpe-AUS → −0.11/0; fehlendes Feld → Key fehlt.
6. `diagRawValue`: `solar_active` mit SOLARSTATE-Pipe-String → `"0 | BLOCKED_BY_SENSOR_FAULT"`;
   ohne Gründe → nur Rohwert.
7. `CONFIG_QUERY`-Snapshot: neue Einträge vorhanden, keine Secret-Gruppen.

## §9 Sicherheit

Kein neuer Attack-Surface: Read-only, dieselben Endpoints, Whitelist wächst nur um
Namens-/Dezimal-Keys (keine Secrets, SR-11/SR-12-konform). Threat-Model-Skip nach
CLAUDE.md §5 (reine Reads); /security-review auf dem Diff läuft trotzdem vor Merge.

## §10 Release

Version nach HOMEY.md (neuer Milestone → `npx homey app version minor`, wie M5.7 → 0.5.0):
erster deploybarer M5.8-Build = **0.6.0**; Changelog en+de
mit User-Freigabe (Store-Changelog-Regel); versions.md-Zeile pro Install. Dev-Gate
`npx homey app validate --level=debug`, Done-Gates: npm test fail 0, validate publish PASS,
release-readiness PASS vor Install.

## Beobachtung (außerhalb M5.8-Scope, notiert)

`pump_speed_stage` zeigt aktuell Stufe 2, obwohl die Pumpe „Ungeregelt" ist (GUI-Beleg) —
das one-hot `PUMP_RPM_N` ist bei ungeregelten Pumpen offenbar ein interner Default. Kandidat
für einen späteren Review der Pump-Gruppe (Kachel bei ungeregelter Pumpe ggf. sinnfrei);
kein Handlungsbedarf in M5.8.
