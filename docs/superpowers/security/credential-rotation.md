# Credential-Rotation — Violet Write-Passwort

Nachweis der Passwort-Rotation vor dem Store-Publish (release-gate Bedingung (c),
`.claude/hooks/release-gate.js`; Memory `security-rotate-violet-credential`).

## Rotationen

| Datum | Credential | Grund | Aktion |
|---|---|---|---|
| 2026-07-10 | Violet-Controller Write-Passwort (HTTP-BasicAuth für `setFunctionManually`) | Während des M0-Brainstormings wurde der BasicAuth-Header im Klartext in den Chat eingefügt → das Secret liegt in der Konversationshistorie und gilt als exponiert. | Passwort am Violet-Regler geändert (durch den Nutzer bestätigt am 2026-07-10) und in den Homey-Geräteeinstellungen / Device-Store aktualisiert. Das alte, exponierte Passwort ist damit ungültig. |

## Handhabungs-Invariante (weiterhin gültig)

Das Write-Credential lebt **ausschließlich** im Homey-Device-Store (`setStoreValue`) —
nie in Settings, Quellcode, Git oder Logs (SR-01/02, M3-Threat-Model). Der Read-Pfad
(`GET /getReadings?ALL`) braucht kein Credential und bleibt credential-frei.
