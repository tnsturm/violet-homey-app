---
name: homey-release
description: Run the Homey app release checklist end-to-end (version bump, changelog, validate, install/publish, versions.md) per HOMEY.md's Release-Checkliste. User-invoked only.
disable-model-invocation: true
---

# Homey Release

Führt die Release-Checkliste aus HOMEY.md end-to-end aus. Bei offenen, uncommitteten
Änderungen erst nachfragen, bevor weitergemacht wird. Vor Store-Publish immer explizit
beim Nutzer nachfragen — das ist ein sichtbarer, kaum reversibler Schritt.

## Schritte

1. **Code-Stand committen** — falls noch offene Änderungen vorhanden sind, dazu Rückfrage
   stellen statt selbst zu entscheiden.
2. **Bumpen**:
   - Neuer Build im selben Milestone → `npx homey app version patch`
   - Neuer Milestone (erster Build) → `npx homey app version minor`

   Aktualisiert `.homeycompose/app.json`; das generierte Root-`app.json` zieht beim
   nächsten `build`/`run`/`validate` nach.
3. **Changelog**: `.homeychangelog.json` für die neue Version füllen — klar,
   nutzerverständlich, **en + de**.
4. **Sync prüfen**: Version im generierten `app.json` == `.homeycompose/app.json`?
   Bump + Changelog zusammen committen.
5. **Ausliefern**: `npx homey app install` (Testinstallation) oder Store-Publish.
   Store-Publish nur nach expliziter Bestätigung durch den Nutzer.
6. **Versions-Log**: Zeile in `docs/dashboard/versions.md` ergänzen (Version, Datum,
   Commit, Ziel, Notiz).

## Nicht vergessen

- `homey app run` (flüchtiger Dev-Modus, wird beim Stoppen entfernt) zählt **nicht** als
  Release — kein Bump/Log-Eintrag nötig.
- Das Dashboard (`docs/dashboard/dashboard.html`) für das aktive Milestone separat aktuell
  halten — siehe den `dashboard-sync`-Skill.
