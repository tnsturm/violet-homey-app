# Native-Feature-Review

Ledger für `milestone-checkpoint` Schritt 7b: Welche eigenen Artefakte (CLAUDE.md-Regeln, Skills,
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
| `homey-cli` Skill (Drittanbieter, `~/.claude/skills/homey-cli`) | Skill (fremd) | Homey-MCP-Connector "HomeyPro2026" (claude.ai, account-weit, `mcp.athom.com`) | keep + note | 2026-07-21 | Neu entdeckt beim M7.0-Checkpoint (`claude mcp list` zeigt ihn "Connected"). Deckt per ToolSearch Device/Flow/Zone/Mood/Insights ab (list_devices, list_flows, get/update_advanced_flow, set_devices_capabilities_values, …) — große Überlappung mit homey-cli. Volle Bewertung (deckt die MCP auch rohe `homey api <manager> <op>`-Calls + HomeyScript-Fallback ab?) noch NICHT gemacht — nächster Blick beim nächsten Checkpoint, bevor homey-cli als „replace" eingestuft wird. |
| Checkpoint-Schritte 2/6/7b (Allowlist, CLAUDE.md-Pflege, Versionscheck) | Skill-Schritte | `/doctor` (Alias `/checkup`, nativ seit ~2.1.2xx; Checks 0–9) | keep + note | 2026-07-27 | /doctor deckt jetzt ab: CLAUDE.md-Dedup/-Kürzung/-Lazy-Migration (Checks 2–4 → Checkpoint-Schritt 6 auf Memory-Ordner verengt), Versions-Aktualität (Check 7 → aus 7b entfernt), langsame Hooks, Unused-Extensions. NICHT ersetzt: Memory-Ordner-Konsolidierung, projekt-scope Allowlist (`/fewer-permission-prompts`; /doctor Check 9 schreibt nur local), Native-Feature-Review, Retro. Check 8 (Auto-Default) kollidiert mit §10 → am Gate ablehnen. `disableModelInvocation` → Nutzer muss /doctor selbst tippen (neuer Schritt 2b). |
