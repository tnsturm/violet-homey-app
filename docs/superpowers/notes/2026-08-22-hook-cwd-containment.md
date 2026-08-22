# Edit|Write-Guards: Containment auf das bewachte Repo (2026-08-22)

## Vorfall

Am 2026-08-21 blockierte der PostToolUse-Hook `docs-header-guard` aus einer
VioletApp-Session heraus eine Bearbeitung von

    C:/Users/.../skill-agentic-loop-framework/plugin/skills/agentic-loop-framework/
    templates/.claude/hooks/lib/env-ready.js

mit „env-ready.js is missing the spec-referenced file header". Diese Datei liegt in
einem **anderen** Repository mit eigenen Dokumentationskonventionen (ihre Herkunft
steht im CHANGELOG des Framework-Repos, nicht unter `docs/superpowers/`).

## Ursache

Alle Edit|Write-Guards entscheiden allein anhand des **Pfad-Strings**, ob eine Datei
zu bewachen ist — `docs-header-guard.isGuardedSource()` etwa akzeptiert jeden Pfad mit
einem `lib/`- oder `drivers/`-Segment an beliebiger Stelle. Keiner prueft, ob der
aufgeloeste absolute Pfad ueberhaupt **innerhalb von `input.cwd`** liegt. Jeder
absolute Fremdpfad mit passendem Segment wurde damit als Projekt-Quelldatei behandelt.

Guards setzen die Konventionen **dieses** Projekts durch; sie muessen deshalb auch
innerhalb **dieses** Projektbaums bleiben.

## Fix

Neuer reiner Helper `.claude/hooks/lib/in-repo.js` mit
`isInsideGuardedRepo(cwd, filePath)`. Jeder betroffene Guard ruft ihn direkt nach seiner
Pfadmuster-Pruefung auf und beendet sich mit 0 (fail-open), wenn die Datei ausserhalb
liegt. Drei Entscheidungen darin:

1. **Grenze ist das Repository um `cwd`, nicht `cwd` selbst.** Ein reiner
   cwd-Vergleich haette die Guards still abgeschaltet, sobald eine Session in einem
   **Unterverzeichnis** startet (`cwd = <repo>/drivers/pool`, Datei `<repo>/lib/*.js`).
   Genau diesen Fall dokumentiert `compose-guard.js` bereits als real („Claude Code
   passes an absolute file_path while cwd is the session dir"). Der Helper sucht darum
   den naechsten Vorfahren mit `.git`-Eintrag und nimmt den als Grenze; findet er
   keinen, faellt er auf `cwd` zurueck (altes Verhalten). Ein Worktree traegt `.git` als
   **Datei** — Existenz genuegt, und dadurch begrenzt sich ein Worktree selbst statt
   seines umgebenden Checkouts.
2. **Beide Seiten werden kanonisiert** (`fs.realpathSync.native`, mit Rueckfall auf den
   laengsten existierenden Vorfahren, damit ein `Write` auf eine noch nicht existente
   Datei funktioniert). Ohne das haetten 8.3-Kurznamen (`TORSTE~1` vs. `TorstenSturm`)
   oder Junctions dieselbe Stelle unterschiedlich buchstabiert — und der Guard haette
   eine echte Verletzung still uebersprungen, also genau die Fehlerklasse reproduziert,
   die hier beseitigt wird. Gross-/Kleinschreibung und Separator-Stil deckt
   `path.win32.relative` bereits selbst ab (nachgemessen).
3. **Relative Pfade** loesen weiterhin gegen `cwd` auf (so meint es das Tool-Input) und
   sind per Konstruktion innerhalb.

## Audit aller Edit|Write-Guards

| Guard | Pfad-Entscheidung | Defekt | Massnahme |
|---|---|---|---|
| `docs-header-guard` | `lib/` oder `drivers/` irgendwo im Pfad | ja (Repro oben) | Containment |
| `control-bytes-guard` | jede `.js/.json/.md/.html/.txt` ueberall | ja | Containment |
| `json-guard` | `.homeycompose/`, `drivers/`, `locales/`, Basename `app.json`/`package.json`/`.homeychangelog.json` | ja (jedes fremde `package.json`) | Containment |
| `dashboard-guard` | Pfad endet auf `docs/dashboard/dashboard.html` | ja (das Framework-Repo spiegelt genau diesen Pfad als Template) | Containment |
| `changelog-lang-guard` | Basename `.homeychangelog.json` | ja, und schlimmer: vergleicht gegen die Version aus **`cwd`/.homeycompose/app.json**, also die des falschen Repos | Containment |
| `compose-guard` | **kein** Pfadmuster — prueft strukturell, ob ein `.homeycompose/` **neben** der Datei liegt | nein | unveraendert, siehe unten |
| `secrets-guard` | `lib/`, `drivers/`, `.homeycompose/`, committete `*.json` | ja, aber bewusst belassen | unveraendert, siehe unten |

### `compose-guard` bleibt unveraendert

Er raet nicht anhand des Pfads, sondern verifiziert die **Signatur eines generierten
Manifests**: Basename `app.json` **und** ein `.homeycompose/` im selben Verzeichnis. Das
ist eine plattformweite Wahrheit (Homey Compose ueberschreibt die Datei beim naechsten
Build), kein Projekt-Stilentscheid — in einem fremden Homey-Repo zu blocken ist richtig.
Sein Header begruendet die Verankerung am Verzeichnis der Datei ausdruecklich damit,
dass Sessions aus Unterverzeichnissen sonst die echte Root-`app.json` verfehlen; ein
cwd-Containment wuerde genau diesen Fall wieder kaputt machen.

### `secrets-guard` bleibt unveraendert

Fail-closed vor Bequemlichkeit (CLAUDE.md §5). Regel C matcht das echte Violet-Write-
Passwort — dieses in *irgendeine* Datei in *irgendeinem* Repo zu schreiben ist ein Leak,
den der Guard weiter fangen soll. Die Regeln A/B (hardcodiertes `Basic <base64>`,
String-Literal-Credential) sind zwar Projekt-Heuristiken und koennen ausserhalb
fehlalarmieren; sie sind aber sowohl selten als auch konservativ in die sichere
Richtung. Ein Security-Guard wird nicht wegen Ergonomie geschwaecht.

## `.claude/worktrees/`-Ausnahme entfaellt

`docs-header-guard` schloss bisher jeden Pfad mit `.claude/worktrees/` aus — die enge
Auspraegung derselben Ursache. Nebenwirkung: Worktrees liegen unter
`<repo>/.claude/worktrees/<name>`, und laut CLAUDE.md §9 findet **die gesamte
Milestone-Arbeit** dort statt. Der Guard war damit in genau den Sessions still
abgeschaltet, fuer die er gedacht war. Containment loest das sauber: eine
Worktree-Session hat den Worktree als `cwd`, ihre Dateien liegen darin und werden
normal bewacht.

Bekannte Folge: `.claude/hooks/lib/changelog.js` und `.claude/hooks/lib/env-ready.js`
tragen keinen spec-referenzierten Header. Bearbeitungen dieser beiden Dateien blocken
ab jetzt auch in Worktree-Sessions. Bewusst nicht mitgefixt (CLAUDE.md §3) — hier nur
vermerkt.

## Nebenbefund: toter Ausschluss in `control-bytes-guard`

`isGuardedText()` schloss `hook-log.jsonl` explizit aus — unerreichbar, weil
`GUARDED_EXT` mit `$` verankert ist und `.jsonl` deshalb nie matcht. Der Ausschluss ist
entfernt; was die Telemetrie-Datei tatsaechlich heraushaelt (die Endungsliste), steht
jetzt als Kommentar dort und ist in `test/hooks/control-bytes-guard.test.js` festgenagelt,
statt sich auf toten Code zu verlassen.
