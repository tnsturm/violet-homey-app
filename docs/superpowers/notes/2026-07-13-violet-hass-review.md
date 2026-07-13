# Review: violet-hass (Home-Assistant-Integration) — device.py

- **Date:** 2026-07-13
- **For:** M5.7 (Autoconfig), M5.8 (getReadings-Vervollständigung), M9 (Dosierung/Sollwerte)
- **Provenance:** Code-Review von
  `https://github.com/Xerolux/violet-hass/blob/cc3664416c6fbaf97a18a93f08ecd4e824dd4b2f/custom_components/violet_pool_controller/device.py`
  (eine Datei; API-Client liegt im separaten PyPI-Paket `violet_poolcontroller_api`).
  Schwester-Integration zu unserer Homey-App — gleiches Gerät, gleiche API.
- **Companion:** [2026-07-13-violet-api-analysis-getconfig-dosing.md](2026-07-13-violet-api-analysis-getconfig-dosing.md)
  (dort §6 = die hier extrahierten API-Fakten).

## Gesamturteil

Solide, praxisgehärtete Integration mit durchdachtem Failure-Handling, aber „gewachsen":
dreifach dupliziertes Fehler-Handling, Diagnostik-Ballast, breite `except Exception`-Netze
und mehrere gegen die echte API-Namenswelt geratene Heuristiken. Hauptwert für uns:
unabhängige Bestätigung unserer M5.7-Entscheidungen + vier neue API-Fakten.

## Was sie richtig gut machen (Brainstorming-Input M5.7/M5.8/M9)

1. **getConfig als Zweitquelle pro Poll:** nach jedem getReadings werden ~13 gezielte
   Config-Keys geholt (Sollwerte `HEATER_set_temp`/`DOSAGE_phminus_setpoint`,
   `DOSAGE_*_use`-Flags, `SYSTEM_swversion`/`SYSTEM_updateavailable`) und in die Daten
   gemerged. Validiert unseren M5.7/M9-Ansatz. `get_config()` nimmt eine **Liste von
   Keys/Präfixen** (`"NAMES_"`, `"DOSAGE_"`, …) — falls der Endpoint Mehrfach-Keys/Präfixe
   wirklich kann (live verifizieren!), kann M5.7 gezielt nur benötigte Gruppen anfragen und
   die Secrets-Gruppen (`NET_`, `NOTIFY_`, `USER_`) **gar nicht erst empfangen**.
2. **Sticky-Hardware-Detection + Key-Restauration:** einmal erkannte Module (DOS/EXT1/EXT2/
   DMX) werden in der Session nie de-detected; temporär fehlende Keys werden aus dem
   letzten Poll restauriert, damit Entities nicht auf OFF zurückfallen. = unsere
   Monotonie-Regel, unabhängig erfunden — inkl. desselben Trade-offs (real entferntes
   Modul zeigt eingefrorene Werte).
3. **Setpoint-Cache mit Poll-Invalidierung:** Writes werden optimistisch gecacht und sofort
   angezeigt; sobald der nächste Poll den Key liefert, gewinnt die Live-Antwort. Sauberes
   Muster für unsere Schreibpfade (M9; heute schon interessant für `pvsurplus_control`).
4. **Eskalierendes Failure-Logging:** 1. Fehler = Warnung, danach gedrosselt (max. alle
   5 min), ab 5 Fehlern unavailable + persistentes HA-„Repair Issue" mit Löschung bei
   Recovery; Auth-Fehler laufen separat direkt in den Re-Auth-Flow. Drosselung eleganter
   als unser aktuelles Verhalten.

## Neue API-Fakten (→ Companion-Notiz §6, M5.7/M5.8-Prompts)

- **`getOutputRuntimes`** — weiterer Endpoint (Laufzeiten der Ausgänge separat abfragbar).
- **`SYSTEM_ext1module_alive_count` / `SYSTEM_ext2module_alive_count`** — Heartbeats auch je
  Relais-Erweiterung; deklaratives Präsenz-Signal für die M5.7-Signalmatrix, komplementär
  zu `EXTENSION_n_use`.
- **`ADC3_value` als Flow-Fallback** — dort alternative Durchfluss-Quelle, wenn `IMP2_value`
  fehlt (M5.8-relevant).
- **„Dosing-Standalone"-Modus** — Violet-Produktvariante ohne Basismodul existiert
  (`dosing_standalone`-Flag, synthetisches `HW_STANDALONE_MODE`); M5.7 als Variante notieren.

## Schwächen (nicht übernehmen)

1. **Stale-Daten bei Fehlern 1–4:** Fehlschläge liefern kommentarlos den letzten Datenstand
   als Erfolg zurück — Entities zeigen bis zu 5×Poll-Intervall alte Werte als frisch, ohne
   Unavailable. Unser `measurements_fresh` + Unavailable-nach-3 ist ehrlicher.
2. **Dreifach dupliziertes Fehler-Handling** (Empty-Data / APIError / generisches
   Exception) — je ~40 fast identische Zeilen; der generische Pfad schluckt auch
   Programmierfehler.
3. **Geratene Feldnamen:** Firmware-Kaskade mit 11 Key-Varianten (`FW`, `VERSION`,
   `firmware_version`, … — nur 4 existieren laut unserem Live-Abgleich); Config-Präfixe
   `"AI"`/`"onewire"` matchen im echten getConfig-Namensraum nichts (`ANALOG_adcN_*`,
   `NAMES_onewireN`). Bestätigt unseren Weg, Feldnamen immer live zu belegen.
4. **Pseudo-Diagnostik:** `system_health = 100 − failures·20`; 1000er-Poll-History +
   `POLL_SNAPSHOT_FIELDS`, die in der Datei nie konsumiert werden (Tuple-Positionen nur
   per Konvention gekoppelt).
5. **Config-Update-Lücken:** Passwortänderung in `data` (statt `options`) wird nicht
   erkannt (greift erst nach Neustart); Fehlschlag in `load_hardware_config` setzt
   `_loaded=True` → Namen werden bis zum HA-Neustart nie nachgeladen.
6. **Doppelter Setup-Fetch** (Retry-Schleife + `first_refresh`).
7. **Default-Polling 10 s** — aggressiv, aber der Controller verträgt es offenbar
   (Datenpunkt für unsere Poll-Intervall-Diskussion).
