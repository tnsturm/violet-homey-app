# Housekeeping-Milestone unter Framework v2 (Mx.0)

Datum: 2026-09-28 · Milestone M9.9 · Gilt für M10.0 und jeden späteren `Mx.0`-Eintrag im Dashboard.
Ersetzt den neunstufigen v1-Checkpoint (`milestone-checkpoint`-Skill, entfernt 2026-09-16).

Ausgangspunkt ist nicht die v1-Liste, sondern was der erste echte v2-Lauf (M9.2 Teil 1,
2026-09-16 bis 2026-09-28) tatsächlich von Hand brauchte. Ein Schritt kommt nur zurück, wenn
dieser Lauf den Bedarf gezeigt hat — nicht, weil v1 ihn hatte (M10.6-Lehre).

## Die fünf Schritte

| # | Schritt | Bedarf im ersten Lauf | Was konkret passiert |
|---|---|---|---|
| 1 | **Branch-/Worktree-Cleanup** | Ja: nach dem Squash-Merge von PR #22 war der Worktree-Ordner weg, der Branch blieb; den Remote-Branch löschte GitHub selbst. | `git fetch --prune`, `git worktree list`, `git branch -a`; Kandidaten mit Grund listen (gemergt / archiviert als Tag / Prämisse entfallen), der Mensch wählt, dann löschen (lokal + origin + Ordner). Dashboard-Einträge, deren Prämisse mit v1 entfallen ist, gehören in dieselbe Liste (Mensch entscheidet: obsolet markieren oder behalten). |
| 2 | **Plugin-Inventar + Quellen gelesen** | Ja: das V2-Plugin ist selbst geschrieben, aber jede Version wird vor dem Update gelesen (CLAUDE.md Must-never). Das Inventar am 2026-09-28 zeigte zwei Altlasten (siehe unten). | `claude plugin list`; für jedes Plugin, das seit dem letzten Mx.0 eine neue Version hat: Quelle lesen (Diff zur installierten Version), dann updaten. Doppelte Registrierungen (user- und project-scope) und stillgelegte v1-Plugins auflösen. Drift-Abgleich entfällt: die Hooks liegen nur im Plugin-Cache, im Repo existiert keine Kopie (`.claude/` enthält settings + `homey-release`). |
| 3 | **Memory-Konsolidierung** | Ja: MEMORY.md und zehn der 16 Memory-Dateien beschrieben am 2026-09-28 noch v1 (dashboard-sync, Hook-Namen, commit-msg-guard, M9.4-Stand). | Jede Memory-Datei gegen den heutigen Stand lesen: falsch → löschen, überholt → „Historisch"-Präfix, gültig → unverändert. MEMORY.md-Index nachziehen (eine Zeile je Datei, kein Inhalt). Erledigt für den Stand 2026-09-28 in M9.9. |
| 4 | **Retro + Ablation-Entscheidung** | Ja: die Quellen sind seit M9.2 real (unten). | Drei Quellen lesen, je Quelle eine Entscheidung oder ein protokolliertes „nichts zu tun". Reihenfolge der Konsequenz: Test → Satz im Adversary-Suchraum → CLAUDE.md-Zeile; ein Hook nur für ein Must-never. Prüfen, ob der letzte Implementierungs-Milestone seine Ablation-Entscheidung im Log eingetragen hat; wenn nicht, hier nachholen. Ergebnis: Ergänzung (nie Umschreiben) im Ablation-Log, ggf. `last ablation: YYYY-MM` im CLAUDE.md-Kopf. |
| 5 | **Handover-Notiz** | Ja: am Ende der M9.2-Session gab es keinen; die Wiederaufnahme nach 12 Tagen lief nur über den Chat-Verlauf. | Eine kurze Datei `docs/superpowers/notes/<datum>-handover.md`: Stand, offene Entscheidungen, nächster Milestone, ungeprüfte Annahmen. Kein Skill, kein Hook — eine Datei, die die nächste Session zuerst liest. |

Danach: den `Mx.0`-Eintrag im Dashboard-Datenblock von Hand auf `done` setzen (Steps, Log, Commit),
`node -e` mit `vm` als Parse-Nachweis. Kein `/ship` — Housekeeping erzeugt keinen Code; vor dem
Push `/code-review medium` auf den Diff, dann die Push-/PR-Frage an den Menschen.

## Quellen der Retro (Schritt 4)

1. **Freigabedateien** `docs/superpowers/reviews/<datum>-approved.md` seit dem letzten Mx.0: das
   Klassifikationswort je bestätigtem Fund (Zustand, Reihenfolge, Eingabe, Fehlerpfad, Plattform,
   testblind). Regel (Plugin-README, Entscheidung 7): eine Klasse mit drei Treffern im Monat wird zu
   genau einer Sache — ein Satz im Adversary-Suchraum oder ein Testmuster. Nie eine CLAUDE.md-Regel.
   Winkel, die der Disprover regelmäßig widerlegt, fliegen aus dem Prompt.
2. **Ablation-Log** `docs/superpowers/notes/2026-09-16-v2-ablation-log.md`: neue Zeilen seit dem
   letzten Mx.0 und ob der Entscheidungsabschnitt des letzten Milestones existiert.
3. **`docs/dashboard/versions.md`**: die Zeilen seit dem letzten Mx.0 auf wiederkehrende
   Beobachtungen (z. B. „× Missing File" beim ersten `homey app install` in zwei von drei Installs).

Die Triage-Inbox (`docs/dashboard/triage-inbox.md`) ist keine Retro-Quelle, sondern Pflichtlektüre
jeder Session; offene Einträge, die eine menschliche Entscheidung brauchen, werden im Mx.0 dem
Menschen vorgelegt, nicht von der Session entschieden.

### Stand der Quellen am 2026-09-28 (Baseline für M10.0)

- Freigabedatei 2026-09-16: **Eingabe 10**, **testblind 6**, Vereinfachung 2 (letztere kommt aus
  `/code-review`, nicht aus dem Sechs-Wort-Schema). Eingabe ist bereits umgesetzt (Fakten-Sweep als
  Testmuster `test/helpers/prose.js` + ein Satz in `agents/adversary.md`, Plugin 0.1.1). testblind
  ist durch den vorhandenen Suchraum-Satz („welche Zeile kann ich brechen, ohne dass ein Test rot
  wird") und „tests that only assert does not throw" bereits abgedeckt — die sechs Funde sind
  Produkte dieses Winkels, kein neuer. Für M10.0 bleibt hier voraussichtlich „nichts zu tun",
  sofern bis dahin keine neue Freigabedatei dazukommt.
- Ablation-Log: 8 Zeilen + Entscheidung 2026-09-28 vorhanden. Offen aus der Entscheidung: D3
  (breitere Verbotsmuster im Sweep) — ein Testthema für den nächsten `/ship`, kein Housekeeping.
- versions.md: „× Missing File" beim ersten `homey app install` in zwei von drei Installs (0.9.0 und
  0.9.2 ja, 0.9.1 nein), Ursache ungeklärt. Kein Test möglich (Homey-CLI-Verhalten);
  Kandidat für die Triage-Inbox als offener Beobachtungseintrag, nicht für eine Regel.

## Was bewusst entfällt — geprüft, nicht übernommen

| v1-Schritt | Befund | Entscheidung |
|---|---|---|
| `/fewer-permission-prompts` (Allowlist-Scan) | Der erste Lauf lief im Auto-Modus ohne einen Permission-Stopp; die Ask-Liste (Push, Publish, Install) kommt aus dem Plugin-Template und ist absichtlich kurz. | Entfällt. Bei Bedarf ad hoc, kein Schritt. |
| `/doctor` | v1 nutzte es für Allowlist, CLAUDE.md-Pflege und Versionscheck. Der erste Lauf brauchte nichts davon; die Versionsfrage ist in Schritt 2 (Plugin-Inventar) enthalten. | Entfällt als Schritt; bleibt als natives Werkzeug verfügbar, wenn die Triage-Inbox (News-Review) einen konkreten Anlass nennt. |
| `/claude-automation-recommender` | Empfiehlt Hooks, Subagenten, Skills. Plugin-Entscheidung 5 (nur drei Must-never-Hooks, alles andere Done-Bedingung oder CI) macht das strukturell gegenstandslos — genau die Spirale, die M10.6 abgebrochen hat. | Entfällt. |
| Framework-Drift-Abgleich (7a) | Verifiziert: `.claude/` im Repo enthält keine Hook-Kopie mehr; die Hooks laufen aus dem Plugin-Cache. Drift zwischen Repo und Plugin ist damit per Konstruktion null. Was driften kann, ist die installierte Plugin-Version gegen die Quelle (am 2026-09-28: user-scope 0.1.1, project-scope 0.1.0) — das deckt Schritt 2 ab. | Entfällt als Datei-Diff; die Versionsprüfung lebt in Schritt 2. |
| Native-Feature-Review (7b, Ledger `docs/dashboard/native-feature-review.md`) | Der erste Lauf zeigte keinen Bedarf; das Plugin hat kaum noch eigene Artefakte, die nativ ersetzbar wären. | Entfällt als stehender Schritt. Der Ledger bleibt als historisches Dokument. Native Neuerungen kommen über die News-Review-Einträge der Triage-Inbox herein. |
| Dashboard-Protokoll (`dashboard-sync`, `dashboard-guard`) | Ablation-Entscheidung 2026-09-28: der Eintrag wird am Milestone-Ende von Hand nachgetragen — hat gereicht. | Entfällt; Parse-Nachweis per `node -e` + `vm` ersetzt den Hook. |
| FRICTION-Log + Hook-Telemetrie als Retro-Quelle | Ersetzt durch Ablation-Log + Klassifikationswörter + versions.md (alle drei real seit M9.2). Die V2-Hooks schreiben nur dann ein `hook-log.jsonl`, wenn `.claude/hooks/` im Repo existiert — hier nicht mehr. | Entfällt. |
| `/insights`-Reibungsanalyse | Keine Reibung im ersten Lauf, die nicht schon im Ablation-Log stand. | Entfällt als Schritt. |

## Beobachtungen aus dem Inventar 2026-09-28 (Input für M10.0, nicht in M9.9 geändert)

- `claude plugin list`: das v1-Plugin `agentic-loop-framework@skill-agentic-loop-framework` ist noch
  aktiv (user-scope 0.1.36, project-scope 0.1.34, `~/.claude/settings.json` `enabledPlugins: true`).
  Es liefert keine Hooks (kein `hooks.json` im Cache), aber den Skill
  `agentic-loop-framework:agentic-loop-framework`, der in jeder Session geladen wird. Kandidat:
  deinstallieren / in `~/.claude/settings.json` auf `false`.
- Das V2-Plugin ist doppelt registriert: user-scope 0.1.1 und project-scope 0.1.0. Ursache ist der
  `enabledPlugins`-Marker in `.claude/settings.json` (dieselbe Leckage, die M9.4 am 2026-09-03
  beschrieb). Welche Kopie die Hooks stellt, ist ungeklärt — vor der nächsten Plugin-Version klären
  (`claude plugin uninstall … --scope project`, dann Hooks-Feuern in einer frischen Session prüfen).
- Branches: `worktree-v2-bootstrap` (ad73f5e, per Squash in PR #22 enthalten),
  `worktree-framework-v2-ablation` (70fbec1, archiviert als Tag `archive/framework-v2-ablation-2026-09-10`),
  `worktree-m9.4-hooks-plugin` (lokal + origin, bb5d3ca, Prämisse durch V2 entfallen; laut
  Memory-Stand 2026-09-03 liegt im Framework-v1-Repo dazu `.worktrees/m9.4` — nicht neu geprüft). `worktree-m9.2-quickstart` ist bereits weg.
- Dashboard-Einträge mit v1-Prämisse (nicht `Mx.0`, deshalb in M9.9 nicht umgeschrieben): M9.4
  (Hooks als Plugin — durch V2 erledigt), M10.3 (Templates im v1-Framework-Repo, Verweis auf den
  `dashboard-sync`-Skill). Entscheidung „obsolet markieren oder umwidmen" gehört zu Schritt 1 in M10.0.

## Vorlage für spätere Mx.0-Einträge

Steps (fünf, in dieser Reihenfolge): Branch-/Worktree-Cleanup · Plugin-Inventar + Quellen gelesen ·
Memory-Konsolidierung · Retro + Ablation-Entscheidung · Handover-Notiz. Summary: „Housekeeping
zwischen <letzter> und <nächster>: fünf Schritte nach docs/superpowers/notes/2026-09-28-housekeeping-v2.md."
Prompt: den M10.0-Prompt kopieren, Milestone-Namen, Datum des letzten Mx.0 und die Liste der
seitdem entstandenen Freigabedateien anpassen. Modell: Sonnet, Aufwand medium — Schritte 1–3 und 5
sind Mechanik, Schritt 4 verlangt ein Urteil, das der Mensch am Ende sowieso triagiert.
