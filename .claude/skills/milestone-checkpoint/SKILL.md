---
name: milestone-checkpoint
description: Between-milestone housekeeping for this project - tightens tool permissions, checks for new automation opportunities, checks/updates the Homey skill sources this project depends on, and runs a workflow retrospective that codifies recurring friction into hooks/docs/memory. Run between milestones per CLAUDE.md §7 point 4 / the dashboard's Mx.0 "Housekeeping Agentic Loop" checkpoint entries.
disable-model-invocation: true
---

# Milestone Checkpoint

Führt die Zwischen-Milestone-Housekeeping aus CLAUDE.md §7 Punkt 4 in einem Rutsch aus, statt
mehrere Skills einzeln aufzurufen.

## Schritt 0: GitHub-MCP-Verbindung prüfen

`claude mcp get github` → „Connected"? Zusätzlich ein echter Lese-Call (z. B. `list_branches`
gegen ein Repo) — Status allein reicht nicht (Stolperfallen: Schritt 3). Kein Server oder
Fehler → Einrichtung läuft über den agentic-loop-framework-Bootstrap (Phase 0), nicht hier.

## Schritte

1. **Branch-/Worktree-Cleanup** (siehe unten).
2. `/fewer-permission-prompts` ausführen.
3. `/claude-automation-recommender` ausführen, Ergebnisse zur Direktumsetzung anbieten (siehe unten).
4. Skill-Quellen prüfen (siehe unten).
5. **Workflow-Retrospektive / Optimizer** ausführen (siehe unten) — wiederkehrende Reibung aus dem
   abgeschlossenen Milestone in eine dauerhafte Absicherung überführen.
6. **Memory-Konsolidierung** (siehe unten) — Memory-Dateien eindampfen, Ergebnis nur als Diff.
7. **Framework-Abgleich** (siehe unten) — 7a: Drift Projekt → Framework;
   7b: Native-Feature-Review (was kann Claude Code inzwischen selbst, das wir noch von Hand machen?).
8. Den aktiven `Mx.0`-Checkpoint-Eintrag in `docs/dashboard/dashboard.html` aktualisieren:
   `status: "done"`, `finishedAt` = heute, alle Steps abgehakt, je ein `log[]`-Eintrag mit
   kurzer Zusammenfassung der Schritte 1–7. Dabei für JEDEN noch offenen Milestone im
   Datenblock `recommendedModel` prüfen/setzen (CLAUDE.md §11) — fehlt es (neuer Eintrag)
   oder ist der verbleibende Scope seit der letzten Bewertung spürbar anders geworden,
   jetzt neu ableiten; sonst unverändert lassen.
9. **Handover** (siehe unten) — den nächsten Milestone als Push aufs Handy übergeben.

## Schritt 1: Branch-/Worktree-Cleanup

Prüfe lokal und auf origin, ob es nicht mehr benötigte Branches und Worktrees gibt
(`git branch -vv`, `git branch -r`, `git worktree list`). Zeige hinter jedem gefundenen
Branch/Worktree eine kurze Erklärung (wozu er gehörte; gemergt, verwaist oder noch aktiv?)
und biete per `AskUserQuestion` (multiSelect) an, welche gelöscht werden sollen. Lösche
danach die angewählten Branches (lokal + origin) und Worktrees (`git worktree remove`
inkl. Verzeichnis auf der Festplatte). Ergebnis im `Mx.0`-`log[]` vermerken.

## Schritt 3: /claude-automation-recommender-Ergebnisse anbieten

Der Recommender ist read-only (er schlägt nur vor). Damit die Vorschläge nicht folgenlos im
Chat verpuffen, direkt danach:

1. Die 1–2 Empfehlungen je Kategorie (MCP-Server, Skill, Hook, Subagent, Plugin) aus dem
   Recommender-Bericht als kurze nummerierte Liste zusammenfassen (Kategorie + Name +
   Ein-Satz-Begründung — kein erneuter Fließtext).
2. Per `AskUserQuestion` (multiSelect) genau diese Liste als Optionen anbieten: „Welche
   Empfehlungen jetzt direkt umsetzen?" — plus die implizite Möglichkeit, keine auszuwählen.
3. Für jede ausgewählte Empfehlung **in derselben Session direkt umsetzen**, passend zum Typ:
   - **Hook**: gleiches Muster wie Schritt 5 (Hook-Datei + Smoke-Test, in `.claude/settings.json`
     verdrahten, Suite grün verifizieren, eigener Commit); ist die Änderung generisch, greift
     Schritt 7a (Drift) dafür mit.
   - **MCP-Server**: zuerst unterscheiden, WELCHE Registrierung gemeint ist — ein
     `plugin:<kategorie>:<name>`-Eintrag (z. B. `plugin:engineering:github`) ist ein
     rollenbasiertes **Cowork-Plugin-Bundle**, dessen Auth/Aktivierung NUR über die
     Cowork-eigenen Einstellungen läuft (`setup-cowork`/`cowork-plugin-management`-Skills),
     NICHT über `claude plugin`/`claude mcp` aus der Session heraus — das nur dokumentieren
     + den Nutzer dorthin verweisen. Existiert daneben ein **eigenständiges** Plugin mit
     einfachem Namen im `claude-plugins-official`-Marktplatz (z. B. `github`, prüfbar via
     dem lokalen `marketplace.json`-Manifest), das ist unabhängig vom Bundle und direkt
     installierbar: `claude plugin install <name>` (kein OAuth nötig für den Install-Schritt
     selbst; der MCP-Server dahinter kann trotzdem einen separaten Auth-Schritt brauchen —
     `claude mcp list` danach prüfen, Status "Failed to connect"/"Needs authentication"
     dem Nutzer melden statt stillschweigend als erledigt zu verbuchen).
     Zusätzliche Stolperfallen bei einem neu per `claude mcp add` registrierten
     eigenständigen MCP-Server (nicht Cowork-Bundle), Erkenntnisse vom 2026-07-09
     (GitHub-MCP-Server): **(1) Scope-Default**: `claude mcp add` registriert ohne
     `--scope`-Flag standardmäßig `--scope local` (nur im damaligen Projektverzeichnis
     nutzbar) — für projektübergreifende Nutzung `--scope user` angeben. **(2)
     Session-Neustart nötig**: eine bereits laufende Session lädt die Tools eines
     gerade neu verbundenen Servers NICHT nach, selbst wenn `claude mcp get <name>`
     sofort „Connected" zeigt — erst eine neue Session sieht sie über `ToolSearch`.
     **(3) „Connected" ≠ nutzbar**: der Verbindungsstatus prüft nur den Handshake,
     nicht die Token-Rechte. Ein fine-grained PAT ohne Repo-Freigabe liefert 404 auf
     jeden Repo-Call; mit Lesezugriff aber ohne Schreibrechten liefert er 403 bei
     Schreibaktionen (`create_branch`, `push_files`, …) — `get_me` läuft in beiden
     kaputten Zuständen anstandslos durch und ist daher **kein** verlässlicher
     Health-Check. Vor dem Vertrauen auf einen neuen MCP-Server mindestens einen
     echten Schreib-Call smoke-testen (Branch anlegen + Datei pushen + wieder
     löschen), nicht nur Status/`get_me` prüfen. Für den GitHub-MCP-Server konkret:
     Repo-Permissions **Contents (R/W), Pull requests (R/W), Issues (R/W)** setzen
     (Metadata R ist Pflicht-Default).
   - **Skill/Subagent**: Datei unter `.claude/skills/<name>/SKILL.md` bzw.
     `.claude/agents/<name>.md` anlegen, kurz smoke-testen (z. B. Dry-Run-Aufruf).
   - **Plugin**: `claude plugin marketplace add`/`claude plugin install` nur nach ausdrücklicher
     Zustimmung (Marketplace-Änderungen sind kein reiner Lese-Vorgang).
4. Nicht ausgewählte Empfehlungen NICHT stillschweigend fallen lassen — im `Mx.0`-`log[]`
   kurz vermerken, was umgesetzt und was bewusst zurückgestellt wurde.

## Schritt 4: Skill-Quellen prüfen

Drei Quellen, drei unterschiedliche Update-Wege — nicht alle sind automatisierbar.

Jede Quelle hier ist Fremdcode, der in einem vertrauten Kontext landet. Alle drei sind durch
CLAUDE.md §5 „Extension Hygiene" gedeckt: **Review vor Adoption, Review vor Update.**
Außerdem einmal pro Checkpoint prüfen, dass `disableSkillShellExecution` in
`.claude/settings.json` noch `true` ist und keine neu adoptierte Quelle stillschweigend
verlangt hat, ihn abzuschalten.

### Review-Gate für beide Git-Checkout-Quellen (homey-cli-skill, homey-app-skill)

Gilt für beide unten stehenden Quellen — ein Update wird NIE ungelesen nachgezogen, denn
dieser Pfad schreibt Fremdcode nach `~/.claude/skills/`:

1. **Eingehenden Diff sichten**, bevor er `~/.claude/` erreicht:
   ```bash
   git -C /tmp/<repo> diff HEAD..origin/HEAD
   ```
2. **Mechanischer Vorfilter** gegen die §5-Checkliste — jeder Treffer ist ein STOPP,
   keine Warnung:
   ```bash
   git -C /tmp/<repo> diff HEAD..origin/HEAD | \
     grep -nE '!`|```!|allowed-tools|curl |wget |fetch\(|child_process|eval\(|atob\(|base64 -d|\.ssh|\.aws|gh auth|\.env|postinstall'
   ```
3. **Verdikt:**
   - Sauber (kein Checklisten-Treffer, Diff passt plausibel zu seinen Commit-Messages) →
     nachziehen und kopieren; keine Rückfrage nötig.
   - Jeder Treffer, oder ein Diff zu groß/undurchsichtig zum wirklichen Lesen → NICHT kopieren.
     Die Funde wörtlich zeigen (Datei + Zeile) und den Nutzer fragen. Die alte Version bleibt
     solange liegen — ein veralteter Skill ist strikt sicherer als ein ungeprüfter.
4. Ein frischer Klon (weil `/tmp` geleert wurde) ist eine ERSTADOPTION — dann den ganzen Baum
   sichten, nicht nur einen Diff.
5. Verdikt im `Mx.0`-`log[]` protokollieren (Quelle, Commit-Range, sauber/blockiert) — ein
   nicht protokollierter Review sieht hinterher aus wie gar kein Review.

### homey-cli-skill (github.com/timvdhoorn/homey-cli-skill)

```bash
git -C /tmp/homey-cli-skill fetch --quiet
git -C /tmp/homey-cli-skill log HEAD..origin/HEAD --oneline
```

Existiert `/tmp/homey-cli-skill` nicht (z. B. weil `/tmp` zwischenzeitlich geleert wurde), frisch
klonen: `git clone https://github.com/timvdhoorn/homey-cli-skill.git /tmp/homey-cli-skill`.

Ist die Ausgabe **nicht leer** (Update vorhanden), zuerst das Review-Gate oben durchlaufen.
Erst nach sauberem Verdikt:

```bash
git -C /tmp/homey-cli-skill pull --quiet
rm -rf ~/.claude/skills/homey-cli/*
cp -r /tmp/homey-cli-skill/* ~/.claude/skills/homey-cli/
```

### homey-app-skill (github.com/dvflw/homey-app-skill)

Gleiches Vorgehen, Pfade `/tmp/homey-app-skill` → `~/.claude/skills/homey-app/`:

```bash
git -C /tmp/homey-app-skill fetch --quiet
git -C /tmp/homey-app-skill log HEAD..origin/HEAD --oneline
```

Bei Update — ebenfalls erst nach sauberem Verdikt des Review-Gates oben:

```bash
git -C /tmp/homey-app-skill pull --quiet
rm -rf ~/.claude/skills/homey-app/*
cp -r /tmp/homey-app-skill/* ~/.claude/skills/homey-app/
```

### Superpowers (claude-plugins-official Marketplace)

**Nicht automatisierbar von hier aus.** Superpowers ist kein Git-Checkout — es kommt über Claude
Codes eigenen Marketplace-Sync (`claude-plugins-official`), unabhängig vom Zustand von
`github.com/obra/Superpowers`. Der einzige Update-Weg ist `claude plugin update superpowers`,
was einen Neustart braucht und nicht aus einer laufenden Session heraus ausgelöst werden kann.

Nur melden: `claude plugin list | grep superpowers` (installierte Version), und den Nutzer bitten,
bei Bedarf selbst `claude plugin update superpowers` in einer interaktiven Session auszuführen.

Marketplace ≠ geprüft. Beim Melden dazusagen, dass der Inhalt von hier aus nicht inspiziert wurde;
die §5-Checkliste gilt auch für Plugin-Skills (sie fallen unter `disableSkillShellExecution`).

**Kein Marketplace-Ersatz für homey-cli-skill/homey-app-skill**: `claude plugin marketplace add
<repo>` scheitert an beiden, da keines ein `.claude-plugin/marketplace.json`-Manifest hat (getestet
2026-07-02). Ein Fork nur für dieses Manifest wäre mehr Wartungsaufwand als der jetzige Ansatz.

## Schritt 5: Workflow-Retrospektive (Optimizer)

Wiederkehrende, gleichartige Fehler in dauerhafte Absicherung überführen, damit sie nicht erneut
auftreten. Vollständiges Design: `docs/superpowers/specs/2026-07-05-workflow-retro-optimizer-design.md`.

1. **Signal sammeln** für den abgeschlossenen Milestone: `feedback`-Memories (Memory-Ordner),
   `FRICTION:`-Einträge in den Dashboard-`log[]`, und der Git-Verlauf (wiederholte `fix:`/`revert:`-
   Commits, Commit der einen direkt vorigen korrigiert, ≥2 gleichartige Fix-Commits an derselben Datei).
   Zusätzlich `.claude/hooks/hook-log.jsonl` auslesen (Block-Zählungen je Hook seit dem letzten
   Checkpoint statt Erinnerung — M4.8; viele Blocks desselben Hooks = wiederkehrende Reibungsklasse).
2. **Clustern** zu eigenständigen Problemen; Häufigkeit zählen. **In Scope nur: ≥2× gesehen ODER vom
   Nutzer markiert** („nochmal", „zum dritten Mal"). Einzelfälle überspringen (YAGNI).
3. **Root-Cause** je Problem (dreimal „warum": passiert · wiederholt · vor dem Commit nicht gefangen).
4. **Codifizierungs-Ebene wählen** — verlässlichste zuerst; ein Problem darf mehrere bekommen:
   **a. Hook** (mechanisch prüfbar → automatischer Guard; unvergesslich) ·
   **b. HOMEY.md / CLAUDE.md** (Prozess-/Konventionsregel) ·
   **c. `feedback`-Memory** (sitzungsübergreifende Guidance) ·
   **d. Skill-Edit** (ein Skill-Schritt ist selbst falsch).
   Höchste Ebene bevorzugen, die das Problem *vollständig* abdeckt. Jeder neue Hook bringt einen
   Smoke-Test mit (wie `secrets-guard` / `json-guard`) und wird in `.claude/settings.json` verdrahtet.
5. **Anwenden + verifizieren** (Hook-Smoke-Test grün; Regel/Memory landet). Kleine, reversible
   Änderung, eigener Commit.
6. **Protokollieren** im `Mx.0`-`log[]`: `Problem → Root-Cause → Ebene → Änderung → verifiziert`.

Ist das Signal leer (nichts wiederholte sich), ist dieser Schritt ein No-op — nur kurz vermerken.

## Schritt 6: Memory-Konsolidierung (Dreaming-Muster, M4.8)

Sessions seit dem letzten Checkpoint sichten (`search_session_transcripts`, falls verfügbar —
sonst Dashboard-`log[]` und `git log` als Quellen), dann die Dateien im Memory-Ordner
(`MEMORY.md` + Einzeldateien) konsolidieren:

- **Deduplizieren/kürzen**: Erledigtes eindampfen (z. B. trägt `project-status` volle
  Detailhistorien abgeschlossener Milestones, die eine Zeile + Verweis sein können).
- **Widersprüche auflösen**: veraltete Aussagen korrigieren (z. B. "ab nächster Session aktiv",
  wenn es längst live ist).
- **HARTE REGELN**: das Ergebnis IMMER als Diff zum Review präsentieren, NIE direkt anwenden;
  offene Follow-ups und Security-Notizen NIE löschen; im Zweifel behalten.

## Schritt 7: Framework-Abgleich

Zwei Richtungen. 7a fragt „hat dieses Projekt etwas gelernt, das jedes Projekt braucht?",
7b fragt „hat die Plattform etwas gelernt, das unsere eigene Mechanik überflüssig macht?".

### 7a: Drift Projekt → Framework (M4.9)

`git log --since=<letzter Checkpoint> --oneline -- .claude/hooks .claude/skills CLAUDE.md`
im Projekt sichten: Ist eine der Änderungen GENERISCH (in jedem Projekt sinnvoll)? Dann in
`C:/Users/TorstenSturm/source/repos/skill-agentic-loop-framework` die entsprechende Vorlage
(`templates/` bzw. `homey/`) nachziehen + CHANGELOG-Eintrag; Commit dort nach §9-Freigabe.
Kein Drift → kurz vermerken.

### 7b: Native-Feature-Review (Framework → Plattform)

Das Framework wächst nur, wenn nie jemand fragt, was es abwerfen kann. Claude Code entwickelt
sich schnell; jede explizite Anweisung, jeder Skill, Hook und Agent, den wir von Hand pflegen,
ist ein Kandidat für Ersetzung durch eine native Funktion — und ein dupliziertes Feature ist
schlimmer als keins, weil es stillschweigend vom echten Verhalten wegdriftet.

Ledger: `docs/dashboard/native-feature-review.md` (eine Zeile je Artefakt, trägt das letzte
Verdikt + Datum). NICHT jedes Mal alle Zeilen neu aufrollen — nur Zeilen, deren
`Zuletzt geprüft` älter ist als die aktuellen Release Notes, brauchen einen frischen Blick.

1. **Plattform-Delta holen** seit den `Zuletzt geprüft`-Daten des Ledgers: Claude-Code-Release-Notes
   / `CHANGELOG`, `code.claude.com/docs` (Memory, Skills, Hooks, Subagents, Settings,
   Slash-Commands) und die installierte Version (`claude --version`). Claude Desktop
   mitdenken — Features können dort zuerst landen.
2. **Eigene Artefakte inventarisieren**: `CLAUDE.md`-Abschnitte, `.claude/skills/`,
   `.claude/hooks/`, `.claude/agents/`, dazu die stehenden Regeln dieses Skills. Neue Artefakte
   seit dem letzten Checkpoint bekommen eine frische Ledger-Zeile.
3. **Verdikt je Kandidat**, und die Latte hoch hängen:
   - **replace** — die native Funktion deckt das Artefakt *vollständig* ab UND ist per Default an
     oder hier explizit aktiviert. Unseres entfernen, einen Einzeiler als Zeiger auf die native
     Funktion stehen lassen, damit die nächste Session es nicht „hilfsbereit" wieder einführt.
   - **keep + note** — Teilüberlappung (native deckt den Normalfall, unseres einen
     projektspezifischen Rand; oder unseres ist ein fail-closed Guard und das native nur
     beratend). Notieren, was die native Funktion NICHT abdeckt — diese Notiz ist der Grund,
     warum das Artefakt noch existiert, und das Erste, was beim nächsten Mal zu prüfen ist.
   - **keep** — kein natives Äquivalent.
   Im Zweifel **keep** für alles mechanisch Erzwingende (Hooks, Gates): Ein Hook, der blockt,
   ist nicht dasselbe wie ein Modell, dem man Vorsicht sagt. Im Zweifel **replace** für
   Prosa-Regeln, die nur beschreiben, was Claude ohnehin per Default tut.
4. **Anwenden**: `replace`-Verdikte als eine kleine, reversible Änderung mit eigenem Commit;
   generische fließen über 7a ins Framework + CHANGELOG. Bei JEDER angefassten Zeile das
   `Zuletzt geprüft`-Datum aktualisieren — auch bei denen, die geblieben sind.
5. **Protokollieren** im `Mx.0`-`log[]`: `<n> Zeilen geprüft → <n> ersetzt / <n> behalten`,
   mit Namen der Ersetzungen. Nichts geändert → in einer Zeile vermerken; das ist ein
   gültiges und häufiges Ergebnis.

## Schritt 9: Handover (M4.8)

1. Aus dem `DASHBOARD_STATUS`-Block den NÄCHSTEN Milestone mit `status: "todo"` (erster in
   Listenreihenfolge) lesen. Hat er kein `recommendedModel` (siehe Schritt 8), jetzt
   nachtragen, bevor die Push-Benachrichtigung rausgeht — der Handover ist der Moment, in
   dem jemand entscheidet, mit welchem Modell die nächste Session startet.
2. Push-Benachrichtigung aufs Handy senden (PushNotification): Titel `Nächster Milestone: <id>
   — <title>`, Text = Kurzfassung (erste Prompt-Zeilen) + Hinweis `Start per /remote-control
   <id>` (der volle Prompt steht im Dashboard; Push hat Längenlimits). Kein Push-Kanal
   verfügbar → Prompt-Kopf im Chat zeigen und das im Log vermerken.
3. Fragen, ob der Milestone direkt in dieser Session gestartet werden soll.

## Bericht

Am Ende kurz zusammenfassen: was wurde aktualisiert (homey-cli-skill / homey-app-skill, falls
zutreffend), die installierte Superpowers-Version (ohne Aussage darüber, ob sie veraltet ist —
das lässt sich von hier aus nicht feststellen), welche Recommender-Empfehlungen umgesetzt bzw.
zurückgestellt wurden, das Ergebnis der Workflow-Retrospektive (welche wiederkehrenden
Probleme in welche Ebene codifiziert wurden, oder „keine neue Reibung") und das Ergebnis des
Native-Feature-Reviews (welche Artefakte zugunsten einer nativen Funktion abgeschafft wurden,
oder „keine Plattform-Überlappung diesmal").
