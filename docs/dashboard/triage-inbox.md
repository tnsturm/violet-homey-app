# Triage-Inbox

Nächtliche Befund-Sammlung der `violet-nightly-triage`-Routine (M4.8, Spec §4) —
**jede neue Milestone-Session und der release-readiness-Subagent lesen diese Datei zuerst**
(CLAUDE.md §7). Die Routine pflegt die Abschnitte (Einträge wandern), sie hängt nicht endlos an.

**Stand:** 2026-07-10 (nightly-triage-Lauf)

## Offen

- 2026-07-09 · Follow-up · homeyCommunityTopicId in .homeycompose/app.json füllen, sobald die Forum-Launch-Posts live sind (versions.md). Stand 2026-07-10: weiterhin undefined.
- 2026-07-09 · Follow-up · App-Crash-Trace (M3) nicht reproduzierbar — braucht User-Trace oder Store-Test-Crash-Reports; beobachten.
- 2026-07-09 · Test/todo · alarm_dosing_blocked-False-Positive (M2-Logik) — als todo-Test eingefroren (test/FeatureGroups.test.js), Fix ausstehend. Stand 2026-07-10: npm test zeigt weiterhin todo 1.
- 2026-07-09 · Follow-up · Branch claude/write-path-security-reviewer: merge-vs-drop bei M6 entscheiden.

## Neu (2026-07-10)

- 2026-07-10 · Lauf · Alles grün: npm test 156 Tests / pass 155 / fail 0 / todo 1 · validate --level publish exit 0 · Versions-Sync app.json == .homeycompose/app.json (0.4.4) · letzter CI-Lauf 29076059210 auf main success (26 s).

## Erledigt (2026-07-10)

- Write-Passwort-Rotation vor Live-Publish → **ERLEDIGT**: docs/superpowers/security/credential-rotation.md existiert jetzt mit datiertem Eintrag (2026-07-10, Nutzer-bestätigte Rotation am Violet-Regler + Device-Store aktualisiert). release-gate-Bedingung (c) erfüllt.
- M5-Gate (c): checkJs-strict-Ratchet → **ERLEDIGT 2026-07-10**: tsconfig.checkjs.json läuft mit strict:true fehlerfrei; alle drei M5-Trigger (a+b+c) erfüllt.
- M5 · Pfad-B/C-Re-Evaluation (device.js→.ts) → **ABGESCHLOSSEN 2026-07-10, NO-GO**: Gate (c) hat den Typsicherheits-Nutzen bereits geerntet; .ts addiert null Nutzen + Zwei-Artefakte-Divergenz. 3/4 §6-GO-Kriterien verfehlt. device.js bleibt strict-.js. Nächster Milestone: M6.
