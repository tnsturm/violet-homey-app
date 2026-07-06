# M4-Vorbereitung: compose-guard-Hook + release-readiness Store-Asset-Checks

**Datum:** 2026-07-06
**Kontext:** Zwei Automations-Empfehlungen aus dem `→M4`-Zwischen-Check (CLAUDE.md §7 Punkt 4),
umgesetzt vor dem Start von M4 (Publish-Readiness / Store-Ready). Beides sind Tooling-Guards,
kein App-Code — sie senken die Reibung der M4-Arbeit am Manifest.

## Problem

M4 finalisiert die Store-Metadaten und -Assets. Dabei wird viel am Manifest gearbeitet:

1. **Generiertes `app.json` wird versehentlich direkt editiert.** In einem Homey-Compose-Projekt
   ist die Root-`app.json` ein Build-Artefakt (zusammengebaut aus `.homeycompose/**` +
   `drivers/**/driver.compose.json` durch `homey app build|run|validate|version`). Ein Hand-Edit
   daran wird beim nächsten Build stillschweigend überschrieben — verlorene Arbeit. Der bestehende
   `check-version-sync`-Hook fängt die daraus entstehende Divergenz erst **beim Commit**.
2. **Store-Reife ist schwer im Blick zu behalten.** Der `release-readiness`-Agent prüft bereits
   `validate --level publish`, aber ein roher Validator-Dump ist für einen Menschen mühsam. Es
   fehlt eine lesbare Vorabprüfung „welche Store-Assets/Metadaten fehlen noch?".

## Lösung

### 1. Hook `compose-guard` (PreToolUse, Matcher `Edit|Write`)

Blockt (exit 2) einen Edit/Write, dessen aufgelöster `file_path` eine Datei namens `app.json`
ist, **neben der** ein `.homeycompose/`-Verzeichnis liegt (die Signatur des generierten
Manifests). Alle Compose-Quellen (`​.homeycompose/app.json`, `drivers/**/driver.compose.json`, …)
und jede andere Datei passieren ungehindert.

**Warum das korrekt ist:**
- `homey app build|version|validate` regenerieren `app.json` per **Bash** — der `Edit|Write`-
  Matcher greift dort nicht, legitime Builds/Bumps bleiben unberührt.
- **Verankerung am Ziel, nicht an `cwd`:** `target = path.resolve(cwd, file_path)`, dann
  `path.basename(target).toLowerCase() === 'app.json'` **und** `.homeycompose/` im Verzeichnis
  `path.dirname(target)`. Bewusst NICHT `path.resolve(cwd, 'app.json')` — Claude Code übergibt
  einen absoluten `file_path`, während `cwd` das (evtl. Unterordner-/Eltern-)Session-Verzeichnis
  ist; eine cwd-verankerte Prüfung verfehlt die echte Root-`app.json` aus jeder Nicht-Root-Session
  (Bypass, im Review 2026-07-06 gefunden und gefixt). `path.basename` case-insensitiv (Windows).
- `.homeycompose/`-Signatur neben der Datei → in einem Nicht-Compose-Repo ist `app.json` die echte
  Quelle und wird nicht blockiert (der Hook ist dann wiederverwendbar/portabel).
- Fail-open bei eigenen Fehlern (unparsebarer Stdin), wie die anderen drei Hooks.
- Ergänzt `check-version-sync` (Commit-Zeit) durch einen Guard **zur Edit-Zeit**.

**Verifikation:** Smoke-Test `test/hooks/compose-guard.test.js` (15 Fälle: Block bei
relativem/absolutem/Backslash-Pfad auf `app.json`, **cwd = Unterordner/Eltern/fehlend mit
absolutem Pfad** (Bypass-Regression), Groß-/Kleinschreibung; Pass bei `.homeycompose/app.json`,
`driver.compose.json`, `lib/**`, `app.json` ohne `.homeycompose/`-Nachbar, Nicht-Compose-Projekt,
fehlendem `file_path`, kaputtem Stdin; Meldung steuert auf die Compose-Quelle um). Verdrahtet in
`.claude/settings.json` neben `secrets-guard` in der `Edit|Write`-Gruppe.

### 2. Agent `release-readiness` — Store-Asset- + Metadaten-Checks

Zwei neue Prüfblöcke, dimensions-agnostisch aufgebaut: die **maßgebliche** Größen-/Format-Prüfung
bleibt `npx homey app validate --level publish` (bereits Schritt 3 des Agents). Die neuen Checks
liefern die lesbare Vorabsicht, *welche Dateien/Felder fehlen*:

- **Store-Assets:** Existieren die App-Images (`assets/images/small.png`, `large.png`, `xlarge.png`)
  und je Driver die Driver-Images (`drivers/<id>/assets/images/small.png`, `large.png`,
  `xlarge.png`)? Fehlende Dateien explizit auflisten. Die Zielmaße werden als Referenz genannt;
  die harte Prüfung macht der Validator.
- **Store-Metadaten:** Sind die Publish-relevanten Felder in `.homeycompose/app.json` gefüllt —
  `description` (en+de), `category`, `brandColor`, `author.name`?

Der Agent bleibt read-only (nur Bericht, PASS/FAIL je Punkt) und ändert nichts an seiner
bestehenden Struktur außer den zwei zusätzlichen Blöcken.

## Nicht im Scope (YAGNI)

- Kein Escape-Hatch/Env-Override für `compose-guard` — bei echtem Bedarf editiert man die Compose-
  Quelle; die Meldung sagt wie. Ein Override wäre spekulative Flexibilität (CLAUDE.md §2).
- Der Guard hart-codiert keine Pixelmaße; der Agent auch nicht — der Validator ist die einzige
  Quelle der Wahrheit für Maße/Formate, damit nichts veraltet.
- Keine tatsächliche Erzeugung der Store-Assets — das ist M4-Arbeit, nicht diese Tooling-Vorbereitung.

## Sicherheit

Kein neuer Angriffsvektor: `compose-guard` liest nur `file_path` + prüft `.homeycompose/`-Existenz,
schreibt/sendet nichts, gibt keine Datei-Inhalte aus. Der Agent ist read-only. Kein STRIDE-Modell
nötig (CLAUDE.md §5: reine Tooling-/Read-Änderung ohne neue Write-/Netz-/Credential-Fläche).
