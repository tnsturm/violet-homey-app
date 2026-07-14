# Violet Homey App — M5.7: Config-basierte Autoconfig (getConfig + CONFIGCHANGEMARKER)

- **Date:** 2026-07-14
- **Milestone:** M5.7
- **Basis:** Analyse-Notiz `docs/superpowers/notes/2026-07-13-violet-api-analysis-getconfig-dosing.md`
  (§3/§4/§6), violet-hass-Review `2026-07-13-violet-hass-review.md`, M2-Spec
  (`2026-07-01-violet-homey-app-m2-full-reads-design.md` §4/§6), Threat-Model-Delta
  `docs/superpowers/security/2026-07-14-m5.7-config-read-threat-model.md` (SR-11…SR-16)
- **Scope:** Feature-Erkennung um `getConfig` als Zweitquelle erweitern (per-Feature-Signalmatrix),
  Cover-False-Positive beheben, Klartext-Labels aus `NAMES_*`, Re-Detection via
  `CONFIGCHANGEMARKER`. **Keine neuen Capabilities** (ADC/Impuls-Werte sind M5.8, Sollwerte M9).

---

## 1. Live-verifizierte API-Fakten (2026-07-14, Referenzgerät FW 1.2.1)

Diese Fakten wurden in dieser Session gegen die echte Violet belegt und ersetzen die
Prompt-Annahme „`?ALL` + Basic Auth":

1. `getConfig` unterstützt **Komma-Multi-Key- und Präfix-Queries**
   (`?COVER_control_use,EXTENSION_1_use` und `?NAMES_adc` funktionieren; Präfix expandiert).
2. Unkritische Key-Gruppen (`COVER_`, `EXTENSION_`, `*_control_use`, `*_pvsurplus_use`,
   `ANALOG_`, `IMPULS_`, `NAMES_`, `SYSTEM_swversion`) sind **ohne Basic Auth** lesbar.
   `SYSTEM_allow_client_ips_without_auth` ist leer → Firmware-Default, keine IP-Freigabe.
3. `getConfig?ALL` → **401** ohne Auth. Secret-Keys einzeln angefragt → Klartext-Antwort
   `Access restricted, no Auth found` (**kein JSON**). Secret-Keys in gemischten Queries werden
   **still gedroppt** (kein Response-Poisoning).
4. Typen sind inkonsistent: `COVER_control_use:"0"` (String) neben `EXTENSION_1_use:0` (Number).
5. `PUMP_control_use` und `LIGHT_control_use` **existieren nicht** (still weggelassen).
6. ADC/Impuls inkl. Einheiten bestätigt: `ANALOG_adc1_use:"1"`, `ANALOG_adc1_units:"Bar"`,
   `IMPULS_input1_units:"cm/s"`, `IMPULS_input2_units:"m³/h"`.
7. `NAMES_onewireN` liefert Nutzer-Labels („Schwimmbad", „Absorbertemperatur", …); leere Kanäle `""`.
8. Cover-False-Positive live bestätigt: `COVER_control_use:"0"`, `EXTENSION_1/2_use:0`, trotzdem
   `COVER_STATE:"OPEN"` in getReadings.
9. `getReadings` kann ebenfalls Multi-Key/Präfix; `SYSTEM_ext1module_alive_count/…ext2…` fehlen auf
   dem Referenzgerät (keine Relais-Erweiterung verbaut) → Absenz ist selbst ein Signal.
10. `CONFIGCHANGEMARKER` inkrementiert real (130 am 2026-07-13 → 148 am 2026-07-14).

**Konsequenz:** Der Default-Pfad ist **credential-frei und secret-frei** — gezielte
Whitelist-Queries statt `?ALL`+Filtern. Credentials (M3-Store) sind nur noch der Fallback für
Firmware/Konfigurationen, die auch gezielte Queries sperren.

## 2. Architektur

```
getReadings?ALL ──(jeder Poll)──► device._tick ──► detectFeatures(raw, configFacts)
                                     │                        ▲
                CONFIGCHANGEMARKER ──┤                        │ (nullable)
                (Änderung erkannt)   ▼                        │
                        ConfigSource.fetchConfigRaw ──► parseConfigFacts ──► Device-Store
                        (gezielte Whitelist-Query,           (Whitelist-Filter,
                         optional Basic-Auth-Fallback)        Typ-Normalisierung)
```

**Neues pures Modul `lib/ConfigSource.js`:**

- `CONFIG_QUERY` — **die** Whitelist (SR-11): eine Konstante mit exakt den Keys/Präfixen, die die
  Signalmatrix + Labels brauchen (§3). Kein `?ALL` im Modul.
- `buildConfigUrl(host)` — `http://<host>/getConfig?<CONFIG_QUERY.join(',')>`.
- `fetchConfigRaw(host, {credentials?, timeoutMs?})` — ein GET; bei HTTP 401/403 **oder**
  Nicht-JSON-Body (`Access restricted`-Klartext): einmaliger Retry mit `Authorization`-Header aus
  den übergebenen Credentials (falls vorhanden), sonst wirft es `ConfigRestrictedError`/normale
  Fehler. Credentials nie in der URL, nie geloggt (SR-14, SR-01/02).
- `parseConfigFacts(rawConfig)` — Whitelist-Filter + Typ-Normalisierung (`"1"`/`1` → `true`) →
  `ConfigFacts`-Objekt (§3). Unbekannte Keys werden verworfen (SR-12); wirft nie (SR-13).

**`lib/FeatureDetector.js`:** Signatur wird `detectFeatures(raw, configFacts = null)` — Facts sind
optional; ohne Facts gilt exakt die heutige Heuristik (Fallback-Pfad, kein Verhaltensbruch).

**`drivers/pool/device.js`:** hält `configFacts` + `configMarker` im Device-Store
(`setStoreValue('configFacts', …)` — enthält per Konstruktion keine Secrets, SR-12), Refresh
event-getrieben (§4), reicht Facts an `detectFeatures` durch, setzt `NAMES_`-Labels (§5).

**Kein Treiber-/Manifest-Delta:** keine neuen Capabilities, keine neuen Settings, Pairing
unverändert (der erste `onInit`-Tick direkt nach dem Pairing übernimmt den initialen Config-Read —
ein separater Pairing-Schritt wäre redundant).

### Abgewogene Alternativen

- **violet-hass-Stil (Config-Keys bei jedem Poll):** immer frisch, aber verdoppelt dauerhaft den
  HTTP-Traffic für Daten, die sich selten ändern — verworfen; der Marker ist das präzisere Signal.
- **`?ALL` + Basic Auth (Prompt-Annahme):** empfängt Secrets unnötig und erzwingt Credentials —
  durch Live-Befund obsolet, verworfen.
- **Setpoint-Cache mit Poll-Invalidierung (hass-Muster 4):** für die bestehenden
  Write-Capabilities (z. B. `pvsurplus_control`) geprüft und **auf M9 verschoben** — deren Wert
  wird heute schon im nächsten Poll durch `PVSURPLUS` bestätigt; ein Cache brächte nur ~60 s
  kosmetische Latenz-Verbesserung bei echtem Zustandsrisiko.

## 3. ConfigFacts & per-Feature-Signalmatrix

`CONFIG_QUERY` (Whitelist, SR-11):
`COVER_control_use`, `EXTENSION_1_use`, `EXTENSION_2_use`, `SOLAR_control_use`,
`HEATER_control_use`, `HEATER_pvsurplus_use`, `PUMP_pvsurplus_use`, `BACKWASH_control_use`,
`REFILL_control_use`, `ANALOG_adc1..6_use`, `ANALOG_adc1..6_units`, `IMPULS_input1..2_use`,
`IMPULS_input1..2_units`, Präfixe `NAMES_onewire`, `NAMES_adc`.

`ConfigFacts` (normalisiert):

```js
{
  coverControlUse: boolean, extension1Use: boolean, extension2Use: boolean,
  solarControlUse: boolean, heaterControlUse: boolean, heaterPvsurplusUse: boolean,
  pumpPvsurplusUse: boolean, backwashControlUse: boolean, refillControlUse: boolean,
  adcChannels:    [{ id: 1..6, use: boolean, units: string, name: string }],
  impulsChannels: [{ id: 1..2, use: boolean, units: string }],
  onewireNames:   { [id: 1..12]: string },   // nur nicht-leere Namen
}
```

**Signalmatrix** (`detectFeatures(raw, facts)`); „Historie" = heutiges `ran()`
(aktiv ∨ Runtime > 0 ∨ LAST_ON > 0):

| Feature | mit `facts` | ohne `facts` (Fallback = heute) |
|---|---|---|
| **cover** | `coverControlUse ∧ (extension1Use ∨ extension2Use)` — **autoritativ in beide Richtungen** (einziger Monotonie-Bruch, §6) | `has(COVER_STATE) ∧ ≠''` |
| solar | `solarControlUse ∨ ran('SOLAR')` (kein `SOLAR_pvsurplus_*`-Key existiert; PV-Zwangsbetrieb erzeugt Laufzeit → Historie fängt ihn) | `ran('SOLAR')` |
| heater | `heaterControlUse ∨ heaterPvsurplusUse ∨ ran('HEATER')` | `ran('HEATER')` |
| backwash | `backwashControlUse ∨ ran('BACKWASH')` (nur positiv-additiv) | `ran('BACKWASH')` |
| refill | `refillControlUse ∨ heutige Regel` | `ran('REFILL') ∨ REFILL_STATE='ON'` |
| pump, light, eco, overflow, waterLevel, pv, chlorine, dosing, okTempChannels, diagnostics | unverändert (kein Config-Key vorhanden bzw. getReadings bereits deklarativ) | unverändert |
| **adcChannels/impulsChannels** (neu, informativ) | aus Facts durchgereicht — **M5.8 konsumiert** sie (Detection + `_units` + Namen); M5.7 legt keine Capabilities dafür an | `[]` |

Nur `_use ∨ _pvsurplus ∨ Historie` — nie `¬control_use ⇒ weg` (außer Cover): „Regelung aus" ≠
„ungenutzt" (Solar-Fall der Analyse-Notiz, live bestätigt: `SOLAR_control_use="0"` bei real
genutzter PV-Zwangseinschaltung).

**Produktvariante „Dosing-Standalone"** (Violet ohne Basismodul): kein Codepfad bricht — `pump`
hängt an `has('PUMP')` (fehlt dort), Dosierung an `DOS_n_*_USE` (vorhanden). Die Pump-Gruppe hat
`defaultMode:'force'` (M2) — Standalone-Nutzer verstecken sie per Override; kein M5.7-Umbau.
`SYSTEM_ext1/2module_alive_count` (getReadings) wird **nicht** zusätzlich verdrahtet: auf Geräten
ohne Erweiterung fehlen die Keys schlicht (live belegt), und `EXTENSION_n_use` aus der Config ist
das deklarative, hinreichende Signal — ein zweites Readings-Signal brächte nur Redundanz.

## 4. Config-Lebenszyklus (wann wird gelesen?)

1. **onInit:** Facts + Marker aus dem Store laden (Restart-sicher); danach asynchron einen
   Refresh anstoßen (nicht blockierend).
2. **Jeder Poll:** `CONFIGCHANGEMARKER` aus dem ohnehin gepollten getReadings mit dem gespeicherten
   Marker vergleichen. **Bei Abweichung:** Config neu lesen → Facts + Marker im Store
   aktualisieren → im selben Tick re-reconcilen. **Aktion auf Änderung = stiller Re-Read +
   Re-Reconcile + eine Log-Zeile.** Keine Timeline-Notification, keine Flow-Card: der Marker
   inkrementiert bei *jeder* GUI-Änderung (auch irrelevanten) — Notifications wären Spam; neue
   Tiles zeigt Homey ohnehin. (Entscheidung der offenen Brainstorming-Frage.)
3. **Retry-Politik:** solange noch nie Facts geladen wurden, pro Poll erneut versuchen, aber
   höchstens 3 Fehlversuche in Folge; danach nur noch, wenn sich der `CONFIGCHANGEMARKER`
   zwischen zwei Polls ändert (Vergleich gegen den zuletzt im Poll **gesehenen** Wert, nicht den
   Store-Stand — alte Firmware ohne `getConfig`/Marker bleibt so dauerhaft auf der Heuristik,
   ohne HTTP-Spam).
4. **On-demand:** kein eigener „Refresh"-Button (YAGNI) — Marker-Vergleich + Settings-Re-Tick
   decken alle realen Fälle ab.

**Fehlerpfade (SR-16):** Config-Fetch-Fehler machen das Gerät **nie** unavailable (Availability
gehört dem getReadings-Pfad). Logging eskalierend gedrosselt (hass-Muster 3, minimal): 1. Fehler
`warn`, Wiederholungen ≤ 1 Log/5 min, bei Recovery eine Info-Zeile. Bei Fehlern bleibt der letzte
gute Facts-Stand aktiv (SR-13).

## 5. NAMES_-Labels

- **onewire-Sub-Sensoren:** Titel = Nutzer-Label, falls nicht leer, sonst wie heute
  `Sensor <id>` (z. B. „Schwimmbad" statt „Sensor 1"). Gesetzt beim `addCapability` und bei
  Label-Änderung nach Config-Refresh; `setCapabilityOptions` nur bei tatsächlicher Änderung
  (Churn-Regel wie Diagnose-Titel).
- **ADC-Namen/Einheiten:** in `ConfigFacts.adcChannels` mitgeführt, aber erst von M5.8 konsumiert
  (dort entstehen die Filterdruck-/Durchfluss-Capabilities).
- Dosierkanal-Labels bleiben die festen CH_TITLE-Übersetzungen (keine belegten `NAMES_`-Keys dafür).

## 6. Monotonie-Entscheidung & Migration (Design-Entscheidung)

**Entscheidung:** Die M2-Monotonie-Regel („Capabilities nie automatisch entfernen") bekommt genau
**eine** Ausnahme: die Cover-Gruppe, wenn `ConfigFacts` vorhanden sind und
`coverControlUse ∧ (ext1 ∨ ext2)` falsch ist. Begründung: getReadings sendet für Cover
nachweislich **Geisterwerte** (Default `"OPEN"` trotz „Nicht verwenden") — der heutige Tile ist
auf betroffenen Geräten aktiv irreführend (zeigt „offen" für ein nicht existentes Cover), das ist
schlechter als ein entfernter Tile. Alle anderen Gruppen bleiben strikt monoton (Config nur
positiv-additiv), weil dort kein Geisterwert-Problem belegt ist.

- **Override gewinnt:** `group_cover: force` erzwingt den Tile weiterhin (SR-15) — das ist
  zugleich das Sicherheitsventil gegen gespoofte Config-Antworten und der Opt-out für
  Nutzer, deren Flows am Cover-Tile hängen.
- **Migration Bestandsgeräte:** kein separater Migrationscode. Der erste erfolgreiche Config-Read
  nach dem App-Update re-reconciled und entfernt den Geister-Cover-Tile automatisch (der
  bestehende `M2_MANAGED_BASES`-Remove-Pfad in `_reconcileCapabilities` tut das bereits, sobald
  die Detection `false` liefert). Flows, die auf `cover_state` zeigen, werden dabei ungültig —
  bewusst akzeptiert (der Wert war bedeutungslos); im Changelog en+de dokumentieren.
- Geräte **ohne** erreichbare Config behalten exakt das heutige Verhalten (inkl. False Positive).

## 7. Sicherheit (Delta-Threat-Model, SR-11…SR-16)

Umsetzungspflichten aus `2026-07-14-m5.7-config-read-threat-model.md`:
Whitelist-Konstante als einzige Query-Quelle, kein `?ALL` (SR-11); Response-Body nie
loggen/persistieren, nur whitelisted Keys in den Store (SR-12); Parser fail-soft inkl.
`Access restricted`-Klartext und Mischtypen (SR-13); Credentials nur im Header, nur nach
Restricted-Signal, nie in URL/Logs (SR-14, erbt SR-01/02); config-getriebene Entfernung nur Cover,
Force gewinnt (SR-15); Verfügbarkeit unberührt + gedrosseltes Logging (SR-16). Host-Pinning wie
gehabt (SR-08): Config wird ausschließlich vom gepairten `host`-Setting gelesen.

## 8. Tests (TDD-Fälle)

- **ConfigSource:** URL-Builder = exakt die Whitelist (SR-11); Parser: Referenz-Fixture →
  korrekte Facts; Mischtypen `"0"`/`0`; leeres Envelope `{date,time}` → Facts ohne Flags;
  `Access restricted`-Klartext → restricted-Signal, keine Exception; Secret-Key im Response →
  verworfen (SR-12); Credentials nie in URL (SR-14).
- **FeatureDetector:** Cover-Matrix (4 Quadranten: control_use × extension; plus `facts=null` →
  heutige Heuristik); Solar-PV-Fall (control_use=0, Laufzeit > 0 → true); Heater via
  `heaterPvsurplusUse`; backwash/refill positiv-additiv; adc/impuls-Kanäle durchgereicht;
  bestehende Tests unverändert grün (Fallback-Pfad).
- **FeatureGroups/Reconcile-Ebene:** `desiredM2Capabilities` entfernt Cover bei negativer
  Config-Detection nur im auto-Modus, nicht bei `force` (SR-15).
- **Throttle-Helfer:** Erst-Fehler/Drosselung/Recovery-Sequenz.
- Fixtures: `test/fixtures/getconfig-reference.json` (aus den live verifizierten, unkritischen
  Keys — keine Secrets enthalten).

## 9. Abgrenzung

- **M5.8:** konsumiert `adcChannels`/`impulsChannels` (+ Einheiten/Namen) für echte Capabilities;
  `parseRangeToDays`-h-Suffix; `getOutputRuntimes`.
- **M9:** Sollwerte/Dosierung (getOverallDosing), Setpoint-Cache-Muster.
- **M6:** Notifications (`NOTIFY_*` bleibt bewusst außerhalb der Whitelist).

## Addendum (2026-07-14, Final-Review)

Drei Abweichungen vom obigen Entwurf, die im Final-Review sichtbar wurden — Implementierung
ist bewusst wie folgt, dieser Absatz dokumentiert nur die Abweichung:

1. **API-Form (§2):** Implementiert ist `fetchConfigFacts(host, opts)` — liefert bereits
   geparste `ConfigFacts` und wirft bei Restricted/Fehlern einen generischen `Error`, statt
   der in §2 skizzierten `fetchConfigRaw` + `ConfigRestrictedError`-Zweiteilung. Bewusste
   Plan-Vereinfachung: `device.js` behandelt einen Restricted-Fehlschlag ohnehin genau wie
   jeden anderen Fetch-Fehler (§4 Fehlerpfade) — ein eigener Error-Typ hätte keinen
   Verzweigungspunkt gehabt, der ihn ausgewertet hätte.
2. **Cover-Quadrant 4 (§3):** Wenn die Extension-Flags **unbekannt** sind (Keys fehlen,
   `extension1Use`/`extension2Use` = `null`), ist die Formel `ext1 ∨ ext2` **permissiv**:
   `coverControlUse === true` allein erkennt das Cover (siehe `lib/FeatureDetector.js`,
   `extKnownOff` ist nur dann wahr, wenn beide Flags bekannt und explizit `false` sind). Die
   in §3 notierte Formel `coverControlUse ∧ (extension1Use ∨ extension2Use)` gilt somit nur,
   wenn die Extension-Keys tatsächlich bekannt sind — nicht als Blocker bei fehlenden Keys.
3. **Empty-Facts-Guard (SR-13):** Ergänzt um `ConfigSource.factsEmpty(facts)` — eine
   200-Antwort mit gültigem JSON, aber ohne jedes whitelisted Signal (bloßes
   `{date,time}`-Envelope: alle Flags `null`, alle Kanal-/Namenslisten leer), wird in
   `device.js#_maybeRefreshConfig` wie ein Fetch-Fehlschlag behandelt — kein Overwrite
   persistierter guter Facts/Marker, Zählung als Fehlversuch, gedrosseltes Log (T-M57-T1).
