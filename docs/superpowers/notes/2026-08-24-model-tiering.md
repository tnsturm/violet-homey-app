# Model Tiering — Subagents, Milestones, Flagship Orchestration

Ausgelagert aus CLAUDE.md §11 am 2026-08-24 (M9.0 Block b / Vorschlagsplan A3): die Regeln sind
Prozedur, nicht Projektfakt, und wurden bis dahin in jeder Session mitgeladen. CLAUDE.md §11
trägt seither nur noch die Paletten-Zeile und den Verweis hierher.

**Leitsatz:** Nicht Flagship-Preise für mechanische Arbeit zahlen — und niemals am Prüfer oder an
risikoreichen Urteilen sparen.

## Palette

*workhorse* = Claude Sonnet 5 · *implementer* = Claude Opus 5 · *flagship* = Claude Fable 5.
Die Regeln unten referenzieren diese **Rollen**, nicht Modellnamen — ändert sich die Palette, wird
nur die Zeile in CLAUDE.md §11 editiert. Milestone-Sessions kennen weiterhin nur zwei Stufen
(workhorse/flagship); der implementer existiert als Delegationsziel innerhalb von
Flagship-Sessions. Innerhalb einer Stufe zuerst `effort` drehen, dann erst das Modell — der
Modellwechsel passiert nur an der Urteilsgrenze.

## Subagents

Subagents erben per Default das Session-Modell. Stufen explizit im Frontmatter von
`.claude/agents/*.md` setzen (`model:` + `effort:`):

- **Mechanisch / Checkliste / Extraktion** (Kommandos ausführen, Ausgaben vergleichen, grep &
  melden — z. B. `release-readiness`): workhorse, `effort: low`/`medium`.
- **Review / Judge / Security** (z. B. `security-reviewer`, die drei Linsen-Agents): `model:
  inherit` + `effort: high` — Feedback-Qualität ist der Flaschenhals des Loops (CLAUDE.md §4), und
  ein schwacher Verifizierer hebt die Maker/Checker-Trennung auf. In einer Flagship-Session erbt
  der Prüfer das Flagship: das ist der Zweck, kein Kostenfehler.
- In Multi-Agent-Workflows `effort` pro Stufe setzen: low für Finder/Collector, high nur für
  Verify/Judge.
- Session-weiter Override, falls je nötig: `CLAUDE_CODE_SUBAGENT_MODEL`.

### Implementer = `general-purpose`, nie `fork`

Seit W27/W33 laufen Subagents background-by-default und der **`fork`-Typ (Elternkontext geerbt)
ist der Default** des Agent-Tools. `superpowers:subagent-driven-development` lebt aber genau vom
*frischen* Kontext pro Implementer („They should never inherit your session's context or history")
— der Skill benennt in 6.3.0 keinen `subagent_type`, die Annahme steht also nur implizit da.
Deshalb hier als stehende Regel: **SDD-Implementer werden explizit mit
`subagent_type: general-purpose` dispatcht.** Für Review-Agents ist `fork` dagegen erwünscht — sie
sollen den Task-Kontext kennen und das Modell erben.

Verwandt: `TodoWrite`/`TaskCreate` sind auf Opus 4.8, Sonnet 5 und Fable 5 abgeschaltet, während
`superpowers:using-superpowers` weiterhin „create a todo per item" verlangt (auch in 6.3.0 noch,
geprüft 2026-08-24). `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` bewusst **nicht** setzen — Checklisten
leben in Plan-Dateien und im Dashboard, das Tool war der redundante Weg.

## Milestones (Main-Loop-Sessions)

Jeder offene Milestone im Dashboard trägt ein `recommendedModel: { model, effort, why }` — ein
Vorschlag für die Main-Loop-Session *dieses* Milestones (verschieden von den Subagents, die sie
intern startet). Beim Anlegen des Eintrags setzen (Checkpoint- oder Planungs-Session) und neu
ableiten, wenn sich der Scope spürbar ändert.

Nach der Natur der verbleibenden Arbeit urteilen, nicht nach Projektphase oder Milestone-Nummer:

- **Mechanisch/Checkliste** (Checkpoints, eng gefasste Read-Milestones mit fertigem
  Brainstorming/Spec): workhorse, `effort: low`/`medium`.
- **Offenes Design/Brainstorming, Recherche zu externer Integration, mittlere Ambiguität**:
  workhorse, `effort: medium`/`high`.
- **Risikoreiche Urteile** (GO/NO-GO gegen messbare Kriterien, der eine ungetestete oder
  crash-anfällige Produktionspfad, korrektheitskritische Domänenlogik hinter
  Nutzer-Entscheidungen, oder jeder Milestone mit eigenem Threat-Model/Security-Review):
  flagship, `effort: high`/`xhigh` — Urteilsqualität schlägt hier Tempo und Kosten (`max` nur für
  einzelne korrektheitskritische Entscheidungen, bei denen Kosten egal sind).
- Das einzeilige `why` sagt immer, *was an der verbleibenden Arbeit dieses Milestones* die Stufe
  treibt — und was innerhalb der Stufe das Effort-Level treibt.

**Security-Milestones auf dem Flagship:** Safety-Klassifizierer lehnen gutartige adversariale
Arbeit teils ab (STRIDE-Modellierung, exploit-förmige Testfälle, Credential-Pfad-Review). Jede
Ablehnung als `FRICTION:`-Eintrag loggen (CLAUDE.md §7), Richtung defensiver Absicht umformulieren,
und erst bei Persistenz den betroffenen Teilschritt auf den workhorse fallen lassen — der
Milestone selbst bleibt auf dem Flagship.

**Autonome Loops default workhorse:** geplante Routinen und lange unbeaufsichtigte Loops (Nightly
Triage, `/goal`-Sessions) laufen auf dem workhorse, außer der Kern des Loops ist ein Urteil —
Flagship-Turns können viele Minuten zu Flagship-Raten laufen, und beides kumuliert unbeaufsichtigt.
Ein Flagship-Autoloop ist eine bewusste Einzelfallentscheidung, festgehalten im `why` des
Milestones.

Das ist eine **Empfehlung** an den, der die Session startet (Mensch oder Automation), kein
erzwungenes Gate.

## Flagship-Orchestrierung

In einer Flagship-Milestone-Session ist der Main-Loop **Orchestrator** — das ist
`superpowers:subagent-driven-development` (frischer Implementer pro Task, Task-Review nach jedem,
Whole-Branch-Review am Ende); dem Skill folgen, nicht einer Paraphrase davon, und
`superpowers:dispatching-parallel-agents` für den Fan-out nutzen, wenn 2+ Tasks wirklich
unabhängig sind. Was die Flagship-Stufe hinzufügt, ist die **Modellwahl je Subagent**: *implementer*
(über den `model`-Parameter des Agent-Tools oder das Agent-Frontmatter) für komplexe oder
mehrdeutige Implementierungsarbeit, *workhorse* für Mechanisches; Review-Subagents bleiben
`model: inherit` und erben damit das Flagship. **Delegation ist der Default, kein Zwang:** triviale
Edits und kurze Verifikationskommandos macht der Orchestrator selbst — für einen Einzeiler kostet
die Kontextübergabe mehr Flagship-Tokens als der Fix. Das Muster gilt nur für Flagship-Sessions;
workhorse-Sessions implementieren direkt.
