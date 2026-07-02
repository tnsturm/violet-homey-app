---
name: milestone-checkpoint
description: Between-milestone housekeeping for this project - tightens tool permissions, checks for new automation opportunities, and checks/updates the Homey skill sources this project depends on. Run between milestones per CLAUDE.md §7 point 4 / the dashboard's →Mx checkpoint entries.
disable-model-invocation: true
---

# Milestone Checkpoint

Führt die Zwischen-Milestone-Housekeeping aus CLAUDE.md §7 Punkt 4 in einem Rutsch aus, statt
mehrere Skills einzeln aufzurufen.

## Schritte

1. `/fewer-permission-prompts` ausführen.
2. `/claude-automation-recommender` ausführen.
3. Skill-Quellen prüfen (siehe unten).
4. Den aktiven `→Mx`-Checkpoint-Eintrag in `docs/dashboard/dashboard.html` aktualisieren:
   `status: "done"`, `finishedAt` = heute, alle drei Steps abgehakt, je ein `log[]`-Eintrag mit
   kurzer Zusammenfassung der Schritte 1–3.

## Schritt 3: Skill-Quellen prüfen

Drei Quellen, drei unterschiedliche Update-Wege — nicht alle sind automatisierbar.

### homey-cli-skill (github.com/timvdhoorn/homey-cli-skill)

```bash
git -C /tmp/homey-cli-skill fetch --quiet
git -C /tmp/homey-cli-skill log HEAD..origin/HEAD --oneline
```

Existiert `/tmp/homey-cli-skill` nicht (z. B. weil `/tmp` zwischenzeitlich geleert wurde), frisch
klonen: `git clone https://github.com/timvdhoorn/homey-cli-skill.git /tmp/homey-cli-skill`.

Ist die Ausgabe **nicht leer** (Update vorhanden), automatisch nachziehen — keine Rückfrage nötig:

```bash
git -C /tmp/homey-cli-skill pull --quiet
rm -rf ~/.claude/skills/homey-cli/*
cp -r /tmp/homey-cli-skill/* ~/.claude/skills/homey-cli/
```

### homey-app-skill (github.com/dvflw/homey-app-skill)

Gleiches Vorgehen, Pfade `/tmp/homey-app-skill` → `~/.claude/skills/homey-app/`:

```bash
git -C /tmp/homey-app-skill fetch --quiet
git -C /tmp/homey-app-skill log HEAD..origin/HEAD --oneline
```

Bei Update:

```bash
git -C /tmp/homey-app-skill pull --quiet
rm -rf ~/.claude/skills/homey-app/*
cp -r /tmp/homey-app-skill/* ~/.claude/skills/homey-app/
```

### Superpowers (claude-plugins-official Marketplace)

**Nicht automatisierbar von hier aus.** Superpowers ist kein Git-Checkout — es kommt über Claude
Codes eigenen Marketplace-Sync (`claude-plugins-official`), unabhängig vom Zustand von
`github.com/obra/Superpowers`. Der einzige Update-Weg ist `claude plugin update superpowers`,
was einen Neustart braucht und nicht aus einer laufenden Session heraus ausgelöst werden kann.

Nur melden: `claude plugin list | grep superpowers` (installierte Version), und den Nutzer bitten,
bei Bedarf selbst `claude plugin update superpowers` in einer interaktiven Session auszuführen.

**Kein Marketplace-Ersatz für homey-cli-skill/homey-app-skill**: `claude plugin marketplace add
<repo>` scheitert an beiden, da keines ein `.claude-plugin/marketplace.json`-Manifest hat (getestet
2026-07-02). Ein Fork nur für dieses Manifest wäre mehr Wartungsaufwand als der jetzige Ansatz.

## Bericht

Am Ende kurz zusammenfassen: was wurde aktualisiert (homey-cli-skill / homey-app-skill, falls
zutreffend), und die installierte Superpowers-Version (ohne Aussage darüber, ob sie veraltet ist —
das lässt sich von hier aus nicht feststellen).
