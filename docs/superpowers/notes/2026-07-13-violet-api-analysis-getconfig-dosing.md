# Violet-API-Analyse: undokumentierte getReadings-Felder, getOverallDosing, getConfig

- **Date:** 2026-07-13
- **For:** M5.7 (Config-basierte Autoconfig), M5.8 (getReadings-Vervollständigung), M9 (Dosierung & Sollwerte)
- **Provenance:** Live-Abgleich `http://violet/getReadings?ALL` (401 Keys) gegen die offizielle
  Feldliste `https://www.myviolet.de/_violet/paperwork/api_description/getReadings.xlsx`
  (Revision 14.07.2024, 137 Einträge), plus Live-Dumps von `getOverallDosing?ALL` und
  `getConfig?ALL` (Basic Auth) sowie Forum-Thread poolsteuerung.de t=2072.
- **Sicherheit:** `getConfig?ALL` liefert Klartext-Secrets (WLAN-Passwort, SMTP-/SMS-Passwörter,
  Push-Token, Weather-API-Key, USERMODE-PIN, HomeKit-Pairing-Code) und PII (`USER_*` inkl.
  Adresse). Dumps nie ungefiltert committen/teilen. Relevante Config-Keys:
  `SYSTEM_allow_client_ips_without_auth` (IP-Freigabe ohne Basic Auth möglich).

---

## 1. Undokumentierte Felder in getReadings?ALL

Implizit dokumentiert (nicht gelistet, aber aus Excel-Mustern ableitbar): Sub-Felder der
Dosierkanäle DOS_2/4/5/6 („see above" auf DOS_1_CL), `EXT2_*` (analog EXT1).

**Echt undokumentiert:**

| Feld | Live-Wert (2026-07-13) | Bedeutung (erschlossen) |
|---|---|---|
| `CURRENT_TIME_UNIX` | 1783945599.015 | Systemzeit als Epoch — bessere Quelle als `date`/`time` |
| `fw` | "1.2.1" | Duplikat von `SW_VERSION` |
| `SYSTEM_cpu_temperature`, `SYSTEM_carrier_cpu_temperature` | 65.0 / 55.4 | Duplikate von `CPU_TEMP` / `CPU_TEMP_CARRIER` |
| `LOAD_AVG`, `MEMORY_USED`, `CPU_GOV` | 3.8 / 35.66 / ONDEMAND | Load Average, RAM %, CPU-Fan-Governor |
| `HW_VERSION_CARRIER`, `HW_SERIAL_CARRIER` | 1.0.0 / 202409050 | Carrier-Board HW-Version/Seriennummer |
| `SYSTEM_carrier_alive_count`/`_faultcount`, `SYSTEM_dosagemodule_alive_count`/`_faultcount` | ~85,8 Mio / 0 | Heartbeat-Zähler der Boards; faultcount = verpasste Heartbeats (Watchdog) |
| `CONFIGCHANGEMARKER` | 130 | **Zähler, inkrementiert bei jeder Config-Änderung** → Trigger für getConfig-Re-Read (M5.7) |
| `last_error_id` | 894 | letzter Systemfehler; Code-Tabelle weiter unbekannt (M2-Frage #7 offen) |
| `pump_rs485_pwr` | "0" | Leistungswert RS485-Pumpe (BADU Prime Neo VS) |
| `onewireNromcode` (1–12) | "000000000000" | zweites ROM-Code-Feld neben dokumentiertem `onewireN_rcode`; Platzhalter |
| `onewireN_faultcount` / `_freezecount` | ow1=3, ow2=2, ow8=5 (freeze) | kumulierte Sensorfehler / Frost-Trips |
| `PUMPSTATE`, `HEATERSTATE`, `SOLARSTATE` | [] / [] / **"0\|BLOCKED_BY_SENSOR_FAULT"** | Blockier-/Fehlerzustand. **Format-Fund: nicht immer Array — auch Pipe-String `<wert>\|<grund>`** (klärt M2-Frage #6; `Array.isArray()`-Branch in FeatureGroups reicht nicht) |
| `REFILL_STATE` | "OFF" | String-Pendant zu `REFILL` (bereits in M2 genutzt) |
| `LAST_MOVING_DIRECTION` | "OPEN" | letzte Cover-Fahrtrichtung — **Default-Wert auch bei deaktivierter Coversteuerung!** |
| `OMNI_DC0..5` + `_LAST_ON/_LAST_OFF/_RUNTIME` | DC0=1, 12h26m | DC-Ausgänge des OMNI-Ventils |
| `INPUTz1z2` | 0 | Zusatz-Digitaleingang Z1/Z2 |
| `MAX_REFILL_TIME` | 0 | Rest-/Maximalzeit Nachfüllung |
| `BATHING_AI_SYSTEM_BOOT` | 0 | BathingAI-Modul gebootet (bereits als Detection-Gate in M2 genutzt) |
| `DOS_n_<ch>_REMAINING_RANGE` | CL="33h", PHM="26d", FLOC=">99d" | Kanister-Restreichweite. **Auch `h`-Suffix (Stunden)** — klärt M2-Frage #13; `parseRangeToDays` in FeatureGroups.js kennt bislang nur d/w/m → Parser erweitern (M5.8) |
| `DOS_3_ELO_REV` (+ `_LAST_ON/_OFF/_RUNTIME`) | 0 | kompletter 7. Dosierkanal (Elektrolyse-Umpolung), fehlt in der Excel |
| `DOS_2_CURRENT_POLARITY` | 0 | aktuelle Elektrolyse-Polarität |

Gegenrichtung (Excel dokumentiert, live fehlend): nichts — alle 137 Einträge matchen.

## 2. getOverallDosing?ALL — Struktur (komplett undokumentiert)

Detail-Innenansicht des Dosier-Controllers. Abfrage: `?ALL`, `?DOS_4_PHM` (ein Kanal) oder
Präfix `?DOS_` (Forum-bestätigt). Ein Objekt je Kanal (`DOS_1_CL`, `DOS_2_ELO`,
`DOS_3_ELO_REV`, `DOS_4_PHM`, `DOS_5_PHP`, `DOS_6_FLOC`) plus `READINGS`
(orp/pot/pH-Snapshot der Regler-Eingänge) und `CONFIGURATION` (FLOC-Parameter).

Felder je Kanal:

| Gruppe | Felder |
|---|---|
| Aktueller Zyklus | `LAST_START_TIME_UNIX` (s), `CURRENT_RUNTIME_MS`, `CURRENT_DOSING_AMOUNT_ML`, `NEXT_DOSING_CYCLE` (s bis nächster Zyklus), `TIMER_AT_TASK_START`, `READING_AT_START_ORP/_CL/_PH` |
| Tages-/Kanisterstand | `DAILY_DOSING_AMOUNT_ML`, `TOTAL_CAN_AMOUNT_ML` (hochpräzise), `REMAINING_CAN_RANGE` ("33h"/"26d"/">99d"), `TOTAL_AMOUNT_TO_LOG`, `LAST_CAN_RESET` (ms) |
| Warnungen/Status | **`CAN_LOW_WARNING`**, **`CAN_EMPTY_WARNING`**, **`CAN_EMPTY_SWITCH_WARNING`** (0/1 — fertig berechnet, statt eigener Schwellwert-Logik), `STATE` (Blockier-Array, z. B. `["BLOCKED_BY_ESC"]`) |
| Lebensdauer | `OVERALL_WORKING_HOURS` (Einheit: Sekunden!), `OVERALL_SWITCHING_COUNTER`, jeweils `_LASTRESET` (ms) |
| Nur DOS_2 (ELO) | `CURRENT_POLARITY`, `CURRENT_POLARITY_REMAINING_SEC` |

STATE-Vokabular (Forum, ~110–115 interne Zustände, Auszug): `BLOCKED_BY_PUMP_OFF`,
`BLOCKED_BY_ESC`, `BLOCKED_BY_START_DELAY`, `BLOCKED_BY_MISSING_FLOW`, `BLOCKED_BY_BACKWASH`,
`BLOCKED_BY_MAX_AMOUNT`, `BLOCKED_BY_TRESHOLDS`, `BLOCKED_BY_CL_TRESHOLDS`,
`TRESHOLDS_REACHED`, `TRESHOLDS_REACHED_CL`, `MANUAL_DOSING`, `MANUAL_SWITCHING`,
`MANUAL_TEST`, `OVERFLOW_REFILL_RULE`.

**Relevanz für M9:** liefert die komplette Ist-Sicht der Dosierung (inkl. fertiger
Kanister-Warn-Bits und `NEXT_DOSING_CYCLE`) — das Brainstorming zu manueller Dosierung +
Sollwerten muss diese Quelle einbeziehen (Read-Seite ggf. hierüber statt getReadings-Ableitungen).

## 3. getConfig?ALL — Strukturüberblick (Basic Auth nötig)

1582 Keys, flaches Key-Value-JSON = komplette Gerätekonfiguration. Gruppen (Auszug, volle
Liste im Analyse-Chat): `DOSAGE_*` (112: Sollwerte/Grenzen/Flussraten je Chemie, z. B.
`DOSAGE_chlorine_setpoint_orp=790`), `PUMP_*` (105: `PUMP_RS485_model`,
`PUMP_RS485_prog1..3_value` = echte Drehzahlen 1800/2200/2850), Regel-Engines
`ANALOGRULE/SWITCHINGRULE/TEMPRULE/TIMERRULE_prog N` (540), `LIGHT_*` (161), `HEATER_*`/`SOLAR_*`,
`COVER_*`, `BACKWASH_*`/`OVERFLOW_*`/`REFILL_*`, `ANALOG_adcN_*` (+`_use`,`_units`!),
`IMPULS_inputN_*`, `CALIBRATION_*`, `NAMES_*` (85: Nutzer-Klartextnamen aller Ein-/Ausgänge),
`NOTIFY_*` (57: E-Mail/Push/SMS/Telegram/**HTTP** — M6-relevant), `POOL_*`, `USER_*` (PII),
`NET_*`/`SERVICES_*`/`BACKUP_*`/`AUTH_*` (Secrets!), `WEATHER_*`, `SYSTEM_*`, `GUI_*`, `TIME_*`,
`USERMODE_*`, `EXTENSION_1/2_use`.

Gezielter Read möglich: `getConfig?<KEY>` (Forum: `getConfig?DOSAGE_phminus_setpoint`).

## 4. Erkenntnisse zur Feature-Autodetection (Basis für M5.7)

**Cover-False-Positive (real, auf Referenz-Hardware):** Coversteuerung in GUI „Nicht
verwenden" (`COVER_control_use="0"`, `EXTENSION_1/2_use=0` — ohne Relaiserweiterung geht
Cover gar nicht), trotzdem liefert getReadings `COVER_STATE="OPEN"` +
`LAST_MOVING_DIRECTION="OPEN"` als Default. `detectFeatures` (has COVER_STATE) zeigt daher
einen bedeutungslosen cover_state-Tile. `POOL_cover="3"` ist nur Pool-Steckbrief, keine
Steuerungsaktivierung. Der M2-Live-Test hatte das fälschlich als Bestätigung gewertet.

**Solar = dritter Signaltyp:** `SOLAR_control_use="0"` (Temperaturregelung aus,
`SOLARSTATE="0|BLOCKED_BY_SENSOR_FAULT"` dauerhaft), aber Hardware real und bewusst genutzt —
ausschließlich via PV-Überschuss-Zwangseinschaltung. Die hängt in der Config an
`PUMP_pvsurplus_use="1"` (rpm 2) und `HEATER_pvsurplus_use="1"` (Soll 32.0); einen
`SOLAR_pvsurplus_*`-Key gibt es nicht. Roher `SOLAR`-Wert ist 2 (Enum, kein Boolean) —
`ran()`s `Number>0` wertet das als „läuft".

**Konsequenz — per-Feature-Signalmatrix statt Pauschal-Union:**

| Feature | bestes Signal |
|---|---|
| Cover | `COVER_control_use` + `EXTENSION_*_use` (Config, **negativ autoritativ** — getReadings sendet Geisterwerte) |
| Dosierung | `DOS_n_*_USE` (heute schon, deklarativ in getReadings) |
| Solar/Heizung/Pumpe | `*_control_use` ODER `*_pvsurplus_use` ODER Historie („Regelung aus" ≠ „ungenutzt") |
| ADC/Impuls | `ANALOG_adcN_use`, `IMPULS_inputN_use` + `_units` (liefert zugleich Einheit) |
| Sensoren/Labels | `NAMES_onewireN`, `NAMES_adcN`, … (Klartextnamen für Sub-Sensoren) |

Config-Autorität bricht bewusst die M2-Monotonie-Regel („Capabilities nie automatisch
entfernen") — Design-Entscheidung fürs M5.7-Brainstorming, inkl. Verhalten für Geräte ohne
hinterlegte Credentials (getConfig braucht Basic Auth; Fallback = heutige Heuristik).

**Re-Detection-Trigger:** `CONFIGCHANGEMARKER` aus getReadings (wird ohnehin gepollt) mit dem
letzten Wert vergleichen → getConfig nur bei Änderung neu lesen. Welche Aktion auf eine
erkannte Änderung folgt (nur Re-Read? Re-Reconcile? Nutzer-Notification?), ist im
M5.7-Brainstorming zu klären.

## 5. Bereits erledigt / kein neuer Milestone nötig

- **PVSURPLUS per API setzen existiert seit M3 vollständig:** Flow-Action-Card
  `pvsurplus_set` (ON+speed/OFF), Capability `pvsurplus_control`, Read `pv_surplus_active`.
  Nutzung = Homey-Flow von der PV-Quelle des Nutzers (keine eingebaute „Energy-Integration");
  Voraussetzung `control_enabled` + Write-Credentials.
- Basic-Auth-Passwort des Read-Users wurde während der Analyse im Klartext übertragen/geloggt
  → Rotation bei Gelegenheit empfohlen (analog credential-rotation.md vom 2026-07-10).
