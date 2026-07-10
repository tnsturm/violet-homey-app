# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-09 (manueller Erstlauf, M4.8-Session)

## Offen

- 2026-07-09 · Follow-up · Write-Passwort-Rotation vor Live-Publish (release-gate blockt publish, bis docs/superpowers/security/credential-rotation.md mit Datum existiert) — Memory security-rotate-violet-credential.
- 2026-07-09 · Follow-up · homeyCommunityTopicId in .homeycompose/app.json füllen, sobald die Forum-Launch-Posts live sind (versions.md).
- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten.
- 2026-07-09 · Test/todo · alarm_dosing_blocked-False-Positive (M2-Logik) — als todo-Test eingefroren (test/FeatureGroups.test.js), Fix ausstehend.
- ~~2026-07-09 · Follow-up · M5-Gate (c): checkJs-strict-Ratchet ausreizen~~ → **ERLEDIGT 2026-07-10**: tsconfig.checkjs.json läuft mit strict:true fehlerfrei (RawReadings/ParsedReadings/Features-Typedefs + Index-Signatur-Casts + Null-Sicherheit, typing-only). Alle drei M5-Trigger (a+b+c) jetzt erfüllt — M5-Re-Evaluation kann starten.
- ~~2026-07-10 · M5 · Pfad-B/C-Re-Evaluation (device.js→.ts)~~ → **ABGESCHLOSSEN 2026-07-10, Ergebnis NO-GO**: Spike gegen aktuelle Toolchain (Node 25.9/TS 6.0.3) — Gate (c) hat den Typsicherheits-Nutzen bereits geerntet (checkJs = identischer strict-tsc, device.js fehlerfrei); .ts addiert null Typprüfung + Zwei-Artefakte-Divergenz. 3/4 §6-GO-Kriterien verfehlt. **Pfad B/C endgültig abgeschlossen, nicht vertagt.** device.js bleibt strict-.js. Nachtrag im Entscheidungsdokument (2026-07-08-…-evaluation.md §Nachtrag-2026-07-10). Nächster Milestone: M6.
- 2026-07-09 · Follow-up · Branch claude/write-path-security-reviewer: merge-vs-drop bei M6 entscheiden.

## Neu (2026-07-09)

- 2026-07-09 · Lauf · Alles grün: npm test 145 Tests / fail 0 / todo 1 · validate --level publish exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.4.2) · letzter CI-Lauf 28983092430 auf main success (26 s).

## Erledigt (2026-07-09)

- (noch keine — Erstlauf)
