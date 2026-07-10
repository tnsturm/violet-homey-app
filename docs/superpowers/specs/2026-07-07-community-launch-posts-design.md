# Community-Launch: Foren-Posts + GitHub-README (Design)

- **Datum:** 2026-07-07
- **Kontext:** Begleitend zu M4 (Publish-Readiness). Kommunikations-/Feedback-Material, das **erst nach dem Store-Publish** veröffentlicht wird.
- **Art:** Prosa-Deliverables (keine Code-Änderung) — daher kein TDD/Implementierungsplan, nur Design → Entwürfe → Review.

## Ziel

Drei Text-Deliverables:

1. **`README.md`** (Repo-Root, GitHub, Markdown) — ausführlich, Vorbild `andiwirz/com.luxtronik.heatpump`. Voraussetzung, **bevor** das Repo öffentlich verlinkt wird.
2. **`docs/marketing/homey-forum-post.en.md`** — Ankündigung im Homey Community Forum (Apps, EN).
3. **`docs/marketing/poolsteuerung-forum-post.de.md`** — Ankündigung auf poolsteuerung.de (Unterforum „Anbindung an externe Software", f=98, DE).

Die beiden Foren-Posts verlinken sich **gegenseitig** (Platzhalter, da URLs erst nach Veröffentlichung existieren).

## Gemeinsames Grundgerüst beider Posts

1. Titel (Forum-Konvention) · 2. Hook · 3. Kurzkontext (Violet/BADU Blue ↔ Homey) ·
4. Monitoring (auto-erkannte Kachel-Gruppen) · 5. **LSI-Wasserbalance ausführlich, mit Quellen** ·
6. Steuern & Flow (opt-in) · 7. Einrichtung · 8. Hinweise/Requirements + Sicherheits-Hinweis Schreibzugriff ·
9. Feedback-/Tester-CTA (kein Spenden-Link) · 10. **„Wie diese App entstand" (IDE-frei, Claude Code + GitHub) + Tool-/Video-Links** ·
11. Version/Changelog · 12. Cross-Link-Zeile · 13. Platzhalter-Block.

## Entscheidungen (vom Nutzer bestätigt)

| Thema | Entscheidung |
|---|---|
| Claude-Code-Story | Eigener Abschnitt am Ende (Punkt 10), App bleibt Hauptteil |
| Tool-Links in §10 | homey-cli-Skill-Thread (155229), `dvflw/homey-app-skill`, `obra/Superpowers`, wirzfamily.ch |
| Motivations-Videos in §10 | „Why Coding Is Solved…" (`SlGRN8jh2RI&t=802s`), „Reflecting on a year of Claude Code" (`Hth_tLaC2j8`) |
| GitHub-Repo-Link im Post | **Vorerst nein** (Platzhalter) — erst nach ausführlichem README |
| CTA | Nur Feedback/Tester-Aufruf, kein Spenden-Link |
| Deliverable | Zwei fertige Volltext-Entwürfe + README |
| Sprache | Je Forum angepasst (keine wortgleiche Übersetzung) |
| LSI | In **beiden** Posts ausführlich, mit den VioletApp-Quellen (DE/EN) |

## LSI-Quellen (aus M1-Spec §14 — konsistent zitieren)

- **ANSI/PHTA/ICC-11** (ehem. APSP-11), *Water Quality in Public Pools and Spas* — Basis des Band-Schemas (−0,3…+0,5, asymmetrisch). https://www.phta.org/
- **DIN 19643** *Aufbereitung von Schwimm- und Badebeckenwasser* — Basis des Edelstahl-Vorbehalts.
- **W. F. Langelier (1936)** — Originaldefinition.
- **Orenda Technologies**, *Understanding the LSI* — https://blog.orendatech.com/langelier-saturation-index
- **Lovibond**, *Balanced Water (Langelier Index)*.
- **spa&home** (DE), *Langelier-Index und Korrosion von Edelstahl* (2025) — Edelstahl-Nuance.

## Placeholder-Konvention (in beiden Posts identisch)

`[STORE-LINK]` · `[APP-STORE-INSTALL-CARD]` · `[SCREENSHOTS]` · `[REPO-LINK — nach README]` · `[CROSS-LINK-DE]` / `[CROSS-LINK-EN]` · `[VERSION]`

## Nicht-Text-Voraussetzungen (Follow-ups, kein Blocker für die Entwürfe)

- README schreiben (dieses Deliverable) → dann Repo öffentlich → Repo-Link nachtragen.
- Screenshots + App-Store-Install-Card fügt der Nutzer beim Posten ein.
- Reihenfolge Cross-Links: einen Post zuerst, URL in den zweiten, dann beim ersten nachtragen.
- **Schreib-Passwort vor Publish rotieren** (Sicherheits-Follow-up aus Projekt-Memory, unabhängig von den Posts).

## Update 2026-07-10 — Entwicklungs-Story ausgelagert

Der Entwicklungs-Erfahrungsbericht (§10) ist jetzt ein **eigenständiger englischer Artikel**
`docs/marketing/dev-story-homey-forum.en.md` fürs Homey-Forum. In beiden App-Posts ist §10 auf
einen kurzen Teaser + `[DEV-STORY-LINK]` reduziert (Tool-Links, Zeit-Vergleich, Videos leben
jetzt im Artikel).

- **Neuer Inhalt im Artikel** (aus VioletApp-Memory): wie alles begann (LSI-Motivation, C#/.NET,
  IDE-frei) → **Superpowers** als Basis → Next Level: `/claude-automation-recommender` + **Fable 5**
  bauen den **`skill-agentic-loop-framework`** (Loop-Reifegrad 3→4, M4.6–M4.9: Gates/CI, Mock-
  Harness, Live-Smoke, Stop-Verify, Nightly-Triage, Telemetrie-Meta-Loop, `/goal`, Model-Tiering)
  → wie gut es heute läuft (ehrlich: Human-Gates bleiben, NO-GO-TS-Migration als Urteils-Beispiel).
- **Bigger-Picture-Videos** im Artikel: Boris Cherny „Why Coding Is Solved" · „Reflecting on a
  year of Claude Code" · NEU „Live coding session (Cherny & Sumner)" (`DlTCu_pNDHE`) als ultimatives Next Level.
- **Neue Platzhalter/Cross-Links:** Artikel ↔ beide App-Posts (`[DEV-STORY-LINK]`,
  `[APP-THREAD-LINK-EN]`, `[APP-THREAD-LINK-DE]`); `[FRAMEWORK-REPO]` erst verlinken, wenn
  `skill-agentic-loop-framework` public ist.
