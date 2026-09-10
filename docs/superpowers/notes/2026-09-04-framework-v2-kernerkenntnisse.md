# Framework v2 — Kernerkenntnisse und erste Ideen

Datum: 2026-09-04 · Status: Diskussionsgrundlage, nichts davon ist beschlossen.

Quellen innen: `skill-agentic-loop-framework` (CHANGELOG 0.1.0–0.1.37, SKILL.md, Templates), VioletApp (347 Commits, 13 FRICTION-Einträge, 10 Checkpoint-Retros, 2.121 Hook-Telemetrie-Records, 4 Review-Dokumente, Tiering-Notiz).
Quellen außen: Boris Cherny (Thread 2026-01-02, Ein-Jahres-Thread 2026-06-08, Startup School 2026-07), Anthropic-Prompt-Ablation für Opus 5/Fable 5 (Thariq Shihipar, 80 % gestrichen), Anthropic „Harness design for long-running apps", Anthropic Code Review (März 2026) und Bugcrawl (in Test), `defending-code-reference-harness` (Disprover-Agent), Property-based-Testing-Studie, Bun-Rewrite Zig→Rust (Jarred Sumner, Mai 2026) und dessen Nachanalyse.

---

## Teil 1 — Zehn Kernerkenntnisse über agentisches Coden

### 1. Der Loop hat das Produkt aufgefressen
226 von 347 Violet-Commits (65 %) berühren ausschließlich Framework-Artefakte, 94 (27 %) ausschließlich App-Code. Ganze Milestones (M4.5–M4.9, M5.9, M9.0, M9.0b) sind reine Loop-Pflege. Das Gate-Netz aus 17 Hooks hat über seine gesamte Lebensdauer rund **24 echte Blocks** erzeugt, bei ~2.000 Durchläufen. Der Nutzen ist real, aber er steht in keinem Verhältnis zu Bau- und Wartungskosten. Das Gefühl „kleinteilig und fragil" ist messbar.

### 2. Verifikation ist die einzige Konstante
Boris Cherny hat zwischen Januar und Juni 2026 fast alles revidiert (Plan-Mode, Kontext-Engineering, Stilregeln). Ein Satz blieb: „Give Claude a way to verify its own work" — 2-3x Qualität. Im eigenen Framework ist das die einzige Regel, die nie zurückgenommen wurde: *Verifiziert heißt: Befehl UND Ausgabe stehen im Transkript.* Alles andere im Framework ist Gerüst um diesen Kern, und Gerüst für ein schwächeres Modell.

### 3. Ein stilles Gate ist schlimmer als kein Gate
Fünf Vorfälle derselben Klasse: PowerShell-Matcher-Lücke (Commit trotz rotem tsc), `typecheck-gate` mit exit 0, 211 Hook-Fehlstarts an fünf Tagen (komplettes Netz gleichzeitig aus), zwei Sessions im leeren Worktree, ein Guard ohne jeden Ledger-Eintrag. Jede mechanische Schicht brauchte eine weitere Schicht, die sie überwacht (`selftest-guards`, `hook-command-paths`-Test, `in-repo`-Containment, `env-ready`). Das ist die Komplexitätsspirale: Gates erzeugen Vertrauen, das sie bei Ausfall nicht zurücknehmen. Mechanik lohnt nur, wo sie wenige, fail-closed und hörbar ist.

### 4. Der Fixer ist der schlechteste Prüfer, der Gegner der beste Bug-Finder
Belege aus drei Quellen decken sich: Der `adversarial-reviewer` fand Zustands- und Zeitfehler (Offline-Gerät, Advisor dosiert aus alten Werten; 39 removeCapability in einem Poll), `/code-review medium` fand 0. Der Pflicht-Nachreview fand 4 reale Defekte in 20 frischen Fixes und am Folgetag einen im eigenen Fix von Stunden zuvor. Bun setzte pro Implementer zwei adversariale Reviewer, die nur den Diff sahen, mit der Anweisung „assume the code is wrong". Anthropics Harness-Blog nennt Selbstkritik „confident praising"; ein unabhängiger Disprover-Agent halbierte die Falsch-Positiv-Rate. Unabhängigkeit muss **strukturell** erzwungen werden (eigener Kontext, nur Diff, Repro-Pflicht), nicht per Prosa-Bitte um Sorgfalt.

### 5. Tests sind ein Boden, kein Beweis — und Tests müssen selbst geprüft werden
Bun: 1,38 Millionen Assertions, adversariale Reviews, 165.000 $ — und 19 Regressionen, alle in Verhalten, das niemand assertiert hatte. Violet: ein FlowCards-Test kodierte nur bekannte IDs hart (Defekt trat 7× auf), der Kern-Apply-Pfad war testblind, zwei Adversarial-Funde vom 2026-09-03 waren Löcher im Test („`compose.repair || []` — ohne Block schweigt er"). Property-based Tests und Replay-/Differential-Tests finden, was Beispieltests nicht sehen. Die Frage „kann dieser Test überhaupt rot werden?" gehört in den Loop.

### 6. Die teuerste Reibung fühlt sich nicht wie Reibung an
Zweimal derselbe Delta-Befund: alle drei `/insights`-Kategorien fehlten im FRICTION-Log; die Klasse „ungeprüfte Umgebungsannahmen" (4 Vorfälle) fehlte vollständig. Zwei Checkouts kosteten drei Tage, weil Memory unter dem falschen cwd-Schlüssel lag — „ununterscheidbar von: es gibt keine Memories". Und die Telemetrie log: 434 von 449 Blocks waren Testfixtures. Selbstbericht des Agenten ist als Datenquelle systematisch unzuverlässig. Beobachtbarkeit muss aus den Transkripten kommen, nicht aus dem Agenten.

### 7. Prosa-Regeln verfallen — und zu viele machen das Modell schlechter
Anthropic strich 80 % des Claude-Code-System-Prompts für Opus 5 / Fable 5 ohne messbaren Verlust: „The instructions you added to make Claude more reliable are the reason it's less reliable." Gestrichen: redundante Checks, starre Schrittfolgen, Narration, Workarounds für Schwächen, die es nicht mehr gibt. Plan-Mode war ab Opus 4.6 Overhead. Das eigene CLAUDE.md steht (Template) bei 334 Zeilen, nachdem M9.0 es schon einmal von 257 auf 119 gekürzt hatte — und es enthält den Satz „over-prescriptive prompts measurably reduce flagship output quality" selbst. Jede Regel dort ist ein Pflaster für eine Schwäche von Opus 4.7. Halbwertszeit von Praktiken: Monate.

### 8. Repariere den Prozess, nicht das Ergebnis — in beide Richtungen
Bun: als Claude Funktionen stubbte, änderte Sumner die Workflow-Anweisung statt Instanzen zu fixen. Das Framework kennt dieses Prinzip (FRICTION → Hook > Regel > Memory > Skill), aber die Leiter wurde nur nach **oben** geklettert. Der CHANGELOG ab 0.1.28 besteht fast nur aus Reaktionen auf Vorfälle; ein Abwurf-Schritt existiert erst seit 7b, und der hat noch nichts abgeworfen. Zitat aus dem eigenen Skill: „Das Framework wächst nur, wenn nie jemand fragt, was es abwerfen kann."

### 9. Der Mensch ist der Engpass — und gehört an genau zwei Stellen
Boris: die Review-Kapazität des Menschen ist die bindende Grenze, nicht Tokens; „when you accept 99 % of requests, your eyes glaze over" — Auto Mode ist sicherer als jeden Prompt zu lesen. Bun-Nachanalyse: „Keep a human on the hook for the merge." Im Framework hat sich genau das bewährt: die **Triage** der Review-Funde (Relevanz entscheidet der Mensch, darum dürfen die Linsen paranoid sein) und die **Push/Publish-Freigabe**. Alles andere — Dashboard-Datenblock, Changelog-Sprache, Versions-Sync, Permission-Prompts — sollte kein Mensch mehr anfassen.

### 10. Isolation durch Struktur schlägt Disziplin durch Regel
Ein Worktree pro Session hat sich bewährt (nach dem Vorfall, bei dem ein Push fremde Commits mitnahm); Boris fährt 5 Worktrees parallel, Bun 4 × 16 Instanzen. Getrennte Kontexte für Implementer und Reviewer, ein Ordner pro Session, Dateien statt Gespräch als Übergabe — überall dort, wo Struktur die Regel ersetzt hat, verschwand die Regel aus dem FRICTION-Log. Dazu die Tiering-Regel, die bleibt: nie am Prüfer sparen.

---

## Teil 2 — Wie Boris es heute neu bauen würde

Leitsatz aus seinem Startup-School-Auftritt: „Write loops, not prompts" — und nach jedem Modell-Release den Prompt löschen und Zeile für Zeile zurückholen, nur was Evidenz verlangt. Übersetzt auf dieses Framework:

### A. Subtraktion ist die erste Handlung, nicht die letzte
Ablations-Protokoll statt Rewrite auf Vertrauen: Baseline einfrieren, 5–8 repräsentative Violet-Aufgaben aus der Historie wählen (die 20 Fixes vom 2026-08-28 mit ihren 4 bekannten Defekten sind ein fertiges Eval-Set), Metriken vorab festlegen (akzeptierter Output, Tests grün, Korrekturen durch den Menschen, Tokens, Zeit), dann mit minimalem Gerüst laufen lassen und **einzeln** zurückholen, was nachweislich fehlt. Jede zurückgeholte Regel trägt `since: fable-5.1` und wird beim nächsten Release erneut abladiert.

### B. CLAUDE.md ≤ 60 Zeilen, nur fünf Kategorien
Genau das, was Anthropic behielt: Projektfakten (Build-, Test-, Validate-Kommandos), Output-Verträge (Changelog en+de, Versionsschema), Akzeptanzkriterien (was „fertig" heißt), Grenzen für folgenreiche Aktionen (push, publish, Credentials), Sicherheits-Verbote. Keine Prozeduren, keine Skill-Aufrufreihenfolge, keine Vorfallsgeschichten — die wandern in ein `docs/incidents.md`, das kein Agent per Default liest.

### C. Ein Loop, drei Rollen — als Workflow-Skript, nicht als Prosa-§9
```
implement(task)                       Opus 5, sieht Spec + Code
  → 2× adversary(diff)                Fable 5.1, sieht NUR den Diff, „assume it's wrong",
                                      jeder Fund braucht ein Repro-Szenario
  → disprover(findings)               unabhängiger Kontext, versucht jeden Fund zu widerlegen
  → fix(confirmed)                    Repro wird zuerst als Test geschrieben
  → adversary(fix-diff)               der Nachreview aus §9 Schritt 3, jetzt mechanisch
  → human triage + merge              die zwei Stellen aus Erkenntnis 9
```
Das ist wörtlich Bun's `while (task = todo.pop()) { review, review, apply }` plus Anthropics Disprover. Es ersetzt §9 (vier Schritte Prosa), `subagent-driven-development`, den halben `milestone-checkpoint` und drei der fünf Review-Linsen. Runtime-, API- und Cross-Platform-Linse werden Prompts innerhalb des Adversary, keine eigenen Agenten.

### D. Hooks: von 17 auf 3, alle fail-closed, alle hörbar
Behalten, was tatsächlich geblockt hat und wo ein Fehler irreversibel wäre: `secrets-guard` (4 echte Blocks), `package-guard` (Supply-Chain, fail-closed bleibt Bann), `release-gate`/publish-ask (3 Blocks, Athom-Ablehnung ist teuer). Alles andere wird eine Verifier-Aufgabe im Workflow oder ein CI-Job: Typecheck und Testlauf sind Done-Bedingung (`/goal`: „tests grün, tsc sauber, 0 CONFIRMED nach Adversary-Runde"), nicht PreToolUse-Gate. JSON-/Compose-/Changelog-Guards verschwinden, weil der Workflow diese Dateien programmatisch erzeugt und validiert. Damit entfallen auch `selftest-guards`, `hook-command-paths`, `in-repo`, `env-ready` — die Wächter der Wächter.

### E. Tests adversarial behandeln
Ein Workflow-Schritt „Kann dieser Test rot werden?" (Mutation des Codes, Test muss fallen). Property-based Tests für `/lib` (reine Funktionen, das ist der Anthropic-Befund: 56 % valide Bugs bei Python-Paketen). Replay-Fixtures aus echten Violet-`getConfig`-Antworten als Differential-Test gegen jeden Parser-Change. Nächtlicher Bugcrawl-Lauf über das ganze Repo (die Cloud-Routine gibt es schon; sie bekommt ein besseres Ziel als Triage-Prosa).

### F. Beobachtbarkeit statt Selbstbericht
FRICTION-Log und Hand-Telemetrie fallen weg. Eine nächtliche Routine liest die Session-Transkripte (`/insights`-Mechanik) und schreibt Reibungs-Kandidaten in eine Inbox; der Mensch nimmt sich beim Checkpoint 15 Minuten dafür. Dashboard wird aus Git, PRs und dem Workflow-Ledger **generiert**, nicht per Hand im Datenblock gepflegt — `dashboard-guard` und `dashboard-sync` entfallen.

### G. Checkpoint = Ablation + Abwurf
`milestone-checkpoint` mit zehn Schritten wird ein Schritt: Was hat seit dem letzten Checkpoint tatsächlich geblockt, gefunden oder verhindert? Was nicht, fliegt raus. Modell-Release ⇒ Ablation (A) wiederholen. Extension-Hygiene (Quelle lesen vor Adoption) bleibt als einzige Prosa-Regel, weil sie einen Bann formuliert.

### H. Was bleibt, weil es sich bewiesen hat
Worktree pro Session. Zwei Schlusszeilen „verifiziert / angenommen" — bis der Disprover das übernimmt. Modell-Tiering mit dem Satz „nie am Prüfer sparen". Human-Triage mit Repro-Pflicht. Fail-closed Security-Banns. Versionsschema 0.X.Y.

### Erwartete Wirkung
| | heute | v2 (Ziel) |
|---|---|---|
| Hooks / Hook-Tests | 17 / 16 | 3 / 3 |
| CLAUDE.md (Template) | 334 Zeilen | ≤ 60 |
| Review-Agents | 5 + /code-review | 2 Rollen (Adversary, Disprover) |
| Checkpoint | 10 Schritte | 1 (Ablation + Abwurf) |
| Framework-Anteil an Commits | 65 % | < 25 % |
| Review-Tiefe | 1× pro Branch, Nachreview per Prosa | pro Diff, mechanisch, mit Disprover |
| Mensch | ~alle Permission-Prompts + Dashboard-Pflege | Triage + Merge |

### Offene Risiken
- **Tokenkosten**: Adversary + Disprover pro Diff ist teurer als ein Review pro Branch (Anthropic Code Review: 15–25 $ pro PR; Bugcrawl warnt vor hohem Verbrauch). Gegenrechnung: 65 % der Commits waren Loop-Pflege durch ein Flagship-Modell.
- **Die 24 echten Blocks**: welche davon hätte der Workflow-Verifier statt des Hooks gefangen? Vor dem Abwurf pro Hook prüfen, nicht pauschal.
- **Migration**: Violet läuft produktiv. Die Ablation muss in einem Worktree gegen das Eval-Set laufen, bevor irgendein Hook aus `main` verschwindet.

### Nächster Schritt (Vorschlag)
Das Eval-Set aus A zusammenstellen (Kommits `556faae`, `3e87bed`, die vier Nachreview-Defekte) und den Workflow aus C einmal gegen den Stand vor den Fixes laufen lassen. Wenn er die vier Defekte findet, trägt das Design; wenn nicht, ist die Ablation billig gescheitert und das heutige Framework bleibt.

---

## Teil 3 — Startpunkt und Entwicklungsprozess (Nachtrag)

Grundentscheidung: nicht neu schreiben, sondern freilegen. v2 ist das, was die Ablation übrig lässt. Startpunkt ist ein Eval-Set, kein Repo.

1. **Eval-Set einfrieren** (1 Tag): 6–8 historische Violet-Aufgaben, je Start-Commit + Aufgabentext + Orakel + Budget. Kandidaten: die 4 Nachreview-Defekte vom 2026-08-28, der Repair-Ordner-Bug (0.9.1), der secrets-guard-Selbstscope-Defekt, ein M8.1-Feature mit Tests als Orakel, eine Aufgabe mit falscher Umgebungsannahme. Committen, danach unantastbar.
2. **Minimale Baseline** (½ Tag): Worktree mit CLAUDE.md v2 (~45 Zeilen), 3 Hooks (secrets-guard, package-guard, release-gate), 2 Agenten (adversary: nur Diff, Repro-Pflicht; disprover: eigener Kontext, CONFIRMED/REFUTED), `/build`-Skill, der das Workflow-Skript aufruft. Vorfallsregeln nach `docs/incidents.md`.
3. **Eval fahren**: jede Aufgabe mit heutigem Framework und mit Baseline. Metriken vorab: gefundene Defekte, Tests grün, Korrekturen durch den Menschen, Tokens, Wanduhrzeit.
4. **Einzeln zurückholen**: nur wo die Baseline verliert, die kleinste Regel, die den Fall fixt; jede Zeile mit Modell-Datum und Eval-Nummer.
5. **Ein echtes Milestone** (M10.x) im v2-Worktree, Mensch nur bei Triage und Merge. Kennzahl: Framework-Anteil an Commits.
6. **Extrahieren** ins Framework-Repo als v2, v1 getaggt. Phase 3–4 wiederholen sich bei jedem Modell-Release als neuer Checkpoint.

CLAUDE.md v2 behält fünf Blöcke: Project (Fakten, Kommandos), Done means (Tests/tsc/validate mit Ausgabe im Transkript, Test-first bei Bugfix, 0 CONFIRMED nach Adversary, verifiziert/angenommen-Zeilen), Workflow (Worktree pro Session, /build, STRIDE-Notiz bei neuer Angriffsfläche, „fix the process": Test > Workflow-Regel > CLAUDE.md-Zeile, Hook nur für must-never), Must never (Secrets, ungeprüfte Dependencies, publish/force-push ohne Ja, fremde Skills ohne Quell-Lesung), Output contracts (0.X.Y, Changelog en+de, JSON generiert, Readme-Regel) und Environment facts (CRLF/Write-Tool/`git commit -F`, `${CLAUDE_PROJECT_DIR}`, `npm ci` im Worktree, Tiering in einer Zeile).

Entfällt: §0 Skill-Pflicht, §1–§3 Denk-/Stilregeln, §4-Details, §7 Dashboard-Protokoll (generiert), §9 Review-Prosa (ist das Skript), §10 Permissions-Prosa (settings.json), §11 Tiering-Dokument.
