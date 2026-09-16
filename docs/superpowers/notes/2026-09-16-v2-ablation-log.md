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
