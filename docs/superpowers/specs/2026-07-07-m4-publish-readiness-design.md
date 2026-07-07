# M4 — Publish-Readiness / Store-Ready (Design)

**Datum:** 2026-07-07
**Milestone:** M4 (Publish-Readiness, Homey App Store)
**Status:** Design freigegeben (User-Approval 2026-07-07)
**Vorgänger:** M0–M3 fertig, M3 auf origin/main `a054e55` (v0.3.1 live).

## Ziel / Final-Gate

`npx homey app validate --level=publish` muss **PASSEN**. Heute scheitert nur
`--level=publish` an `drivers.pool.images` (App- **und** Driver-Bilder fehlen; nur
`assets/icon.svg` existiert). Darüber hinaus soll die App die Athom-**Zertifizierung**
überstehen (nicht nur den Validator) — deshalb ist mDNS-Discovery mit im Scope.

Die App deckt zwei **Produktmarken derselben Hardware** ab: **PoolDigital Violet** und
**BADU Blue** (Speck Pumpen) sind dieselbe Box, nur umgelabelt — identische HTTP-API
(`getReadings?ALL`, `setFunctionManually`). Daher rein Namens-/Store-Text-Arbeit, **kein
neuer Geräte-Code** für BADU Blue.

## Scope-Entscheidungen (alle mit User bestätigt 2026-07-07)

- **mDNS-Discovery: IN M4** (mit manueller Eingabe als Fallback), inkl. Live-Verifikation.
- **Store-Name:** en „Violet and BADU Blue Pool Control", de „Violet & BADU Blue Poolsteuerung".
  Lokaler Gerätename „Pool" bleibt unverändert.
- **BADU Blue = dieselbe Hardware, andere Marke** → nur Naming/Store-Text.
- **Logo/Bilder:** der **Hersteller liefert die offiziellen Assets demnächst**; bis dahin
  **Platzhalter** in korrekten Maßen, damit validate jetzt grün wird. Realer Store-Publish
  erst nach Tausch.
- **App-ID:** `de.neunbft.violet` **behalten** (nach Publish unveränderlich; kein
  Migrationsrisiko am bereits installierten Gerät).
- **Kategorie:** `["appliances"]` behalten.
- **Version:** jetzt `npx homey app version minor` → **0.4.0** als M4-Marker + Changelog;
  der echte Upload wird dann 0.4.1 (nach Hersteller-Assets + Passwort-Rotation).

## Komponenten

### 1. Store-Metadaten (`.homeycompose/app.json`)

| Feld | Wert nach M4 |
|---|---|
| `name` | `{ "en": "Violet and BADU Blue Pool Control", "de": "Violet & BADU Blue Poolsteuerung" }` |
| `id` | `de.neunbft.violet` (unverändert) |
| `version` | `0.4.0` (via `homey app version minor`) |
| `category` | `["appliances"]` (unverändert) |
| `brandColor` | `#6A4C93` (unverändert) |
| `description` | en+de neu: nennt **beide Marken**, „überwachen **und steuern**", optionaler LSI-Sicherheitsnetz-Hinweis |
| `permissions` | `[]` (unverändert — kein `api.js`, nur ausgehendes HTTP) |
| `author` | Torsten Sturm (unverändert) |

**description-Entwurf** (final beim Implementieren, hier Richtung):
- en: „Monitor and control a PoolDigital Violet / BADU Blue pool controller over its local
  network — pH, ORP, chlorine, temperatures, pump, dosing and more, with an optional live
  Langelier (LSI) water-balance safety net (ANSI/PHTA/ICC-11)."
- de: „Überwacht und steuert einen PoolDigital-Violet- / BADU-Blue-Poolregler im lokalen
  Netz — pH, Redox, Chlor, Temperaturen, Pumpe, Dosierung u. v. m., mit optionalem
  Live-Langelier-Index (LSI) als Wasserbalance-Sicherheitsnetz (ANSI/PHTA/ICC-11)."

Alle JSON-Edits an der **Compose-Quelle** (`.homeycompose/app.json`), nie am generierten
Root-`app.json` (erzwingt der `compose-guard`-Hook). Manifeste programmatisch bauen /
`JSON.parse`-prüfen (siehe json-authoring-quotes-Regel).

### 2. README (Store-Langtext)

- `README.txt` (en) neu schreiben + **`README.de.txt`** ergänzen.
- **Plain-Text**, keine URLs/Markdown/Changelog/Feature-Listen/Contributor-Credits (Guideline
  `references/publishing.md`). Kurz + beschreibend: Violet **& BADU Blue**, Monitoring +
  Steuerung + optionaler LSI. Entwürfe werden vor dem Schreiben im Plan/PR gezeigt.

### 3. Assets — Platzhalter jetzt, Hersteller-Assets später tauschen

Benötigt (Maße aus `references/publishing.md`, harte Prüfung macht der Validator):
- **App:** `assets/icon.svg` (neu) + `assets/images/small.png` (250×175), `large.png`
  (500×350), `xlarge.png` (1000×700).
- **Driver:** `drivers/pool/assets/icon.svg` (neu) + `drivers/pool/assets/images/{small,large,
  xlarge}.png` (gleiche Maße). ← löst den aktuellen Validator-Blocker.

**Platzhalter-Ansatz:**
- `icon.svg`: schlichtes, markenneutrales Pool/Wasser-Motiv in Brand-Violett `#6A4C93`,
  sichtbar auf dem brandColor-Hintergrund.
- PNGs **programmatisch in exakten Maßen** erzeugen (kleines Node-Skript im Scratchpad; kein
  neues Repo-Dependency). Motiv: Brand-Violett-Fläche + Icon/Text-Andeutung. Jede Datei ist
  ein **gültiges PNG** in exakter Größe (was der Validator prüft).
- Alle Platzhalter als solche kenntlich (z. B. Kommentar im SVG / Notiz im Versions-Log).
  **Release-Schritt „Assets tauschen"** wird explizit dokumentiert; der echte Publish (0.4.1)
  passiert erst danach.

### 4. mDNS-Discovery (Code + Live-Verify)

- Neue `.homeycompose/discovery/violet.json` (`type: "mdns-sd"`) + `"discovery": "violet"` im
  `drivers/pool/driver.compose.json`.
- `device.js`: `onDiscoveryResult` (matcht `discoveryResult.id === this.getData().id`),
  `onDiscoveryAvailable` (Host aus `discoveryResult.address` übernehmen + verbinden),
  `onDiscoveryAddressChanged` (Host aktualisieren, reconnecten). Verträglich mit dem
  bestehenden Poll-Lifecycle.
- **Manuelle Host-Eingabe (`pair/connect.html`) bleibt als garantierter Fallback** → keine
  Regression für Bestandsnutzer.

**Bekanntes Risiko / Live-Unbekannte (ERSTER Implementierungs-Schritt, mit echter Violet):**
1. Dass `violet.local` auflöst, belegt nur mDNS-**Hostname** (A-Record). Homey-Discovery
   nutzt mDNS-**Service-Discovery** (PTR/SRV/TXT, z. B. `_http._tcp`). **Ob die Violet einen
   auffindbaren Dienst annonciert, ist offen und muss live geprüft werden** (z. B. via
   `homey app run` + Discovery-Ergebnis, oder ein mDNS-Browse im Netz).
2. Der Discovery-`id`-Template braucht eine **stabile eindeutige ID** (Serien-/MAC in TXT).
   Ist keine vorhanden, ist `mdns-sd` als Strategie nicht sauber nutzbar.
3. Das **bereits installierte Gerät** hat eine zufällige UUID als `data.id` (M0 Task-7) —
   es wird per Discovery-`id` NICHT matchen und läuft weiter über den gespeicherten Host;
   Discovery greift für **neue** Pairings.

**Fallback-Regel:** Liefert die Live-Prüfung keinen nutzbaren mDNS-SD-Dienst, wird Discovery
**nicht** erzwungen; stattdessen die Manuell-Eingabe beibehalten und die Begründung
dokumentieren (Athom akzeptiert manuelle Eingabe, *wenn Discovery technisch nicht möglich*
ist). M4 bleibt auch dann publish-fähig (Validator verlangt Discovery nicht).

### 5. Sicherheit

- **Write-Passwort rotieren:** rein **operativ** (User rotiert am Gerät + trägt es in den
  App-Settings neu ein) — **Pre-Publish-Gate**, kein Code. Grund: das Passwort wurde in einer
  früheren Session laut ausgesprochen. **Kein Klartext-Credential im Repo/History** (geprüft
  2026-07-07: nur benigne `getElementById('password')`-Formularzugriffe). Creds liegen weiter
  nur im Device-Store (M3-Threat-Model SR-01..10 PASS).
- **STRIDE (neue Fläche = Discovery):** Discovery ist eine reine **Netz-Lese**-Fläche
  (Homey hört mDNS-Announcements passiv; die App verbindet sich zum entdeckten Host wie
  vorher zum manuellen Host). Kein neuer Write-/Credential-Pfad. Kurzer Check + `/security-
  review` auf den M4-Diff vor Merge (CLAUDE.md §5/§9). Kein separates Threat-Model-Dokument
  nötig (analog M4-Tooling-Spec-Begründung), außer die Live-Prüfung deckt Unerwartetes auf.

### 6. Version & Changelog

- `npx homey app version minor` → **0.4.0** (X=4, Y=0). Aktualisiert `.homeycompose/app.json`;
  generiertes `app.json` beim nächsten build/validate mitziehen; beide vor Commit identisch.
- `.homeychangelog.json` **0.4.0** (en+de), programmatisch gebaut (`node`/`JSON.stringify`,
  deutsche Innen-Anführungszeichen `„…"`), vor Commit `JSON.parse`-geprüft (json-guard-Hook).
  Inhalt: „Store-Vorbereitung / jetzt auch für BADU Blue; automatische Geräteerkennung im
  Netz (mit manueller Eingabe als Alternative)."
- Versions-Log-Zeile (`docs/dashboard/versions.md`) erst beim tatsächlichen Deploy/Upload
  (0.4.1) — ein reiner Bump ohne Upload ist kein Release i. S. v. CLAUDE.md §8. Der 0.4.0-Bump
  wird committet als Milestone-Marker.

## Nicht im Scope (YAGNI)

- Inbound-Alarme (jetzt M5).
- Echte Hersteller-Assets (späterer 1:1-Tausch; eigener kurzer Release-Schritt → 0.4.1).
- Der finale `homey app publish` / Store-Live-Schalten (nach Assets + Rotation + Live-Verify).
- Neuer Geräte-Code für BADU Blue (identische Hardware/API).

## Verifikation (Erfolgskriterien)

1. `npx homey app validate --level=publish` → **PASS** (kein `images`-Fehler mehr).
2. `node --test` weiter grün (keine Regression; Discovery-Handler ggf. mit Unit-Tests für die
   pure Matching-Logik, sofern sinnvoll herauslösbar).
3. `.homeycompose/app.json` und generiertes `app.json` **versions-synchron**; `.homeychangelog.
   json` valides JSON mit 0.4.0-Eintrag (en+de).
4. Alle geforderten Asset-Dateien vorhanden, korrekte Maße (Validator + `release-readiness`-
   Agent-Vorabsicht).
5. mDNS-Discovery live geprüft **ODER** dokumentierte Fallback-Begründung, warum Manuell bleibt.
6. `/security-review` auf den M4-Diff ohne Critical Issues.
7. Dashboard-M4-Eintrag finalisiert (status „done", commit, alle Steps).
