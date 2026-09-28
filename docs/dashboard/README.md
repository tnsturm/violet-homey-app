# Violet Homey App — Fortschritts-Dashboard

`dashboard.html` ist ein eigenständiges Artefakt: per Doppelklick im Browser öffnen, kein Server,
kein CDN, keine Build-Schritte. Es zeigt den Stand aller Meilensteine (M0 bis heute) und enthält pro
nicht-abgeschlossenem Meilenstein den vollständigen Start-Prompt (zum Lesen/Kopieren).

## Protokoll & Konventionen

Seit Framework v2 (2026-09-16) gibt es kein Dashboard-Protokoll und keinen Sync-Skill mehr: die
Milestone-Session editiert **nur den Datenblock** `window.DASHBOARD_STATUS` von Hand (Start:
`status: "active"`, `startedAt`, Log-Zeile; Ende: `status: "done"`, `finishedAt`, `commit`, Steps,
Log-Zeile) und belegt mit `node -e` + `vm`, dass der Block parst. Den Renderer darunter nicht
anfassen. Die Homey-spezifische Versionierungs-/Release-Mechanik (`homey app version`, Changelog)
steht in [`HOMEY.md`](../../HOMEY.md), das Versionsschema in [`CLAUDE.md`](../../CLAUDE.md)
(„Output contracts").

Diese Datei enthält nur noch violet-spezifische Hinweise:

- Live-Status: `dashboard.html` in diesem Ordner (immer die vollständige Quelle der Wahrheit).
- Housekeeping-Milestones (`Mx.0`) stehen als eigene, milestone-förmige Einträge in derselben
  Liste. Ihr Ablauf (fünf Schritte, Retro-Quellen, was gegenüber v1 entfällt) ist in
  [`docs/superpowers/notes/2026-09-28-housekeeping-v2.md`](../superpowers/notes/2026-09-28-housekeeping-v2.md)
  definiert; M10.0 ist der erste Eintrag nach diesem Muster.
- Versions-Log dieses Projekts (Version ↔ Commit): [`versions.md`](versions.md).
