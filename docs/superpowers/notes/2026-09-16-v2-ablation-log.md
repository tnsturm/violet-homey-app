# Ablation-Log · skill-agentic-loop-framework-V2

Erster echter Lauf: Milestone M9.2 (In-App Quick-Start-Guide), Worktree `worktree-m9.2-quickstart`
auf `worktree-v2-bootstrap`. Eine Zeile pro Lücke: Datum · was vom alten Framework fehlte ·
was es gekostet hat. Kein Fix während des Laufs; entschieden wird am Ende des Milestones
(Test → Satz im Adversary-Suchraum → Zeile im CLAUDE.md, in dieser Reihenfolge).

| Datum | Was fehlte | Was es gekostet hat |
|---|---|---|
| 2026-09-16 | v2-Defekt, keine v1-Lücke: `ship.js` dispatcht `agentType: 'adversary'`/`'disprover'`, das Plugin registriert `skill-agentic-loop-framework-V2:adversary`/`:disprover` — beide Adversaries starben, der Smoke-Test prüft die Agent-Auflösung nicht | Ein Fehlschlag nach 7 min Implementer-Lauf, Fix nur in der run-lokalen Skriptkopie, Resume aus dem Cache; Plugin unverändert (Fix gehört ins V2-Repo) |
| 2026-09-16 | Keine Session-Isolation gegenüber v1: Hooks des `main`-Checkouts (`handoff-notice`, `dashboard-guard`) feuern im v2-Worktree weiter, weil sie beim Sessionstart geladen wurden | Nur Rauschen (3× Stop-Hook-Text), kein Fehlverhalten; verschwindet, sobald der Bootstrap auf `main` liegt |
| 2026-09-16 | Kein Spec/Plan-Dokument vor `/ship`: die Aufgabenbeschreibung musste den ganzen Vertrag (SDK-Fakten, Inhalt, Tests, Done) selbst tragen | ~60 Zeilen Task-Text im Chat statt einer Datei im Repo; Implementer kam damit ohne Rückfrage durch — bisher kein Verlust |
| 2026-09-16 | Kein Faktencheck der Textquelle: Implementer übernahm einen falschen Satz aus `quickstart-guide.en.md` (Dosierung habe „Immer anzeigen") und erfand einen („eigenes Konto mit wenig Rechten") | Adversary fand A1 (Klasse Eingabe), A2 fiel nur dem Orchestrator auf; eine Fix-Runde |
| 2026-09-16 | v2-Quirk: der Haiku-Prüfagent (`verifyCommit`) lieferte das JSON verschachtelt (`head={"head":…}`) und `clean:false` bei sauberem Tree | Ein Fehlschlag nach dem Fix-Implementer; Prompt in der Skriptkopie auf „one flat JSON object" geändert, Resume |
| 2026-09-16 | Kein Fakten-Sweep vor dem ersten Fix: jede der drei Fix-Runden fand die nächste Kopie *derselben* Tatsache (Locales → Compose-Hints → READMEs/Guides → Fehlertexte) — der Adversary sieht nur den Diff, nicht die übrigen Textquellen | Zwei Fix-Runden (~30 min Agentenzeit, ~750k Tokens) für Textstellen, die ein `grep` über alle Prosa-Quellen in Runde 1 gezeigt hätte. Kandidat: Testmuster „jede Aussage über ein Setting hat genau eine Quelle" (Prosa-Quellen-Liste im Test) + ein Satz im Adversary-Suchraum („bei einem falschen Faktum alle Kopien in allen Textquellen nennen") |
| 2026-09-28 | Kein Fakten-Sweep — Fortsetzung: auch Runde 3 und 4 fanden je die nächste Kopie (Fehler-Toasts, README-Bullet mit U+2011, `.homeychangelog.json`, Kachel-OFF); insgesamt 16 Kopien dreier Tatsachen in fünf Runden | Zwei weitere Fix-Runden; Sweep als Testmuster gebaut (`test/helpers/prose.js`) |
| 2026-09-28 | Keine Persistenz der Worktree-Session: nach Session-Ende war der Worktree-Ordner entfernt, der Branch blieb; kein Handover-Hinweis, wo die Arbeit steht | Worktree neu angelegt, `npm ci`, Baseline — ~2 min; hätte ohne Chat-Verlauf länger gedauert |

## Entscheidung 2026-09-28 (nach Teil 1 von M9.2, PR #22 gemergt)

Zurückgeholt, in der Reihenfolge Test → Adversary-Satz → CLAUDE.md:

- **Test:** Fakten-Sweep als Muster in VioletApp (`test/helpers/prose.js`, `test/SettingsSchemaHints.test.js`): jede Aussage über ein Setting aus dem Compose-Schema abgeleitet, über alle Prosa-Quellen geprüft. Offen: D3 (breitere Verbotsmuster).
- **Adversary-Satz:** `agents/adversary.md` im Plugin — eine falsche Tatsachenbehauptung in Prosa wird mit allen Kopien über alle Textquellen gemeldet (Plugin 0.1.1).
- **Plugin-Fixes** (keine v1-Lücken, v2-Defekte): qualifizierte `agentType`-Namen in `ship.js`, flacher `verifyCommit`-Prompt, Smoke-Test pinnt beides (Plugin 0.1.1, `3dac9c7`).
- **Nicht zurückgeholt:** Dashboard-Protokoll (der Eintrag wird am Milestone-Ende von Hand nachgetragen — reicht), Spec/Plan-Dokument (Task-Vertrag im `/ship`-Aufruf hat gereicht), Checkpoint-Skill, FRICTION-Log (dieses Log ersetzt es), Worktree-Handover (Session-Mechanik, kein Framework-Thema).
