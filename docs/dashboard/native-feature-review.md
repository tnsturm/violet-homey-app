# Native-Feature-Review

Ledger für `milestone-checkpoint` Schritt 6b: Welche eigenen Artefakte (CLAUDE.md-Regeln, Skills,
Hooks, Agents) sind inzwischen durch native Claude-Code-Funktionen ersetzbar?

Verdikt: **replace** (native deckt es vollständig ab) · **keep + note** (Teilüberlappung, Notiz
sagt was native NICHT kann) · **keep** (kein Äquivalent). Nur Zeilen neu bewerten, deren
`Zuletzt geprüft` älter ist als die aktuellen Release Notes.

| Artefakt | Art | Natives Äquivalent | Verdikt | Zuletzt geprüft | Notiz |
|---|---|---|---|---|---|
| Memory-Dateien + MEMORY.md-Index | Konvention | Auto-Memory (default an, `/memory`) | keep + note | 2026-07-20 | Nativ deckt Erfassung+Injection ab; unsere Index-Disziplin bleibt nötig wegen Startup-Limit (erste 200 Zeilen / 25 KB) und weil Auto-Memory maschinenlokal ist. Dritt-Tools (claude-mem) NICHT nötig — ~185 offene Issues, frische Windows-11-Defekte. |
| §9 Finishing a Branch | Prozessregel | `/code-review` | keep + note | 2026-07-20 | Der Review selbst ist nativ; unsere Regel steuert WANN + die Zwei-Optionen-Frage. Nur der Review-Teil ist ersetzt. |
| §10 Permission Strategy | Prozessregel | `/fewer-permission-prompts`, Auto Mode | keep + note | 2026-07-20 | Nativ liefert Werkzeuge, nicht die 3-Schichten-Doktrin. |
| Gate-/Guard-Hooks (test-gate, typecheck-gate, package-guard, secrets-guard, …) | Hooks | — | keep | 2026-07-20 | Fail-closed mechanische Gates; kein natives Äquivalent, Modell-Sorgfalt ist keins. |
| Dashboard-Protokoll (§7) + `dashboard-sync` | Konvention + Skill | — | keep | 2026-07-20 | Kein natives Milestone-Tracking. |
| `sessionextract-save` | Command | Auto-Compaction, `search_session_transcripts` | keep + note | 2026-07-20 | Nativ komprimiert/durchsucht in-session; unser Command erzeugt eine persistente Markdown-Datei außerhalb der Session. |
| Skill-Quellen-Check (Schritt 3) | Skill-Schritt | — | keep | 2026-07-20 | Kein natives Skill-Vetting; `disableSkillShellExecution` deckt nur die Dynamic-Context-Klasse. |
| `documenting-code`, `homey-release`, Homey-Agents | Skills/Agents | — | keep | 2026-07-20 | Plattform-/projektspezifisch, kein natives Äquivalent. |
