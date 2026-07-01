# Violet Homey App — Fortschritts-Dashboard

`dashboard.html` ist ein eigenständiges Artefakt: per Doppelklick im Browser öffnen, kein Server,
kein CDN, keine Build-Schritte. Es zeigt den Stand der Meilensteine **M0–M7** und enthält pro
nicht-abgeschlossenem Meilenstein den vollständigen Start-Prompt (zum Lesen/Kopieren).

## Protokoll & Konventionen

Das generische Dashboard-Protokoll (Datenblock, Start/Während/Ende-Schritte, Feldreferenz,
Inline-Chat-Rendering) steht in [`CLAUDE.md` §7](../../CLAUDE.md). Die Homey-spezifische
Versionierungs-/Release-Mechanik (`homey app version`, Changelog) steht in
[`HOMEY.md`](../../HOMEY.md), das generische Versionsschema in [`CLAUDE.md` §8](../../CLAUDE.md).

Diese Datei enthält nur noch violet-spezifische Hinweise:

- Live-Status: `dashboard.html` in diesem Ordner (immer die vollständige Quelle der Wahrheit).
- Versions-Log dieses Projekts (Version ↔ Commit): [`versions.md`](versions.md).
