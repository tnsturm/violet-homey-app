# TypeScript-Migration — Evaluation (Entscheidungsdokument)

**Datum:** 2026-07-08 · **Status:** Evaluation abgeschlossen, keine Migration durchgeführt
**Kontext:** Loop-Engineering-Analyse 2026-07-07 (Memory `loop-dev-roadmap`): ~90 % der Compile-Fehler in LLM-generiertem Code sind Typfehler (arXiv 2504.09246); Plain JS verschenkt dieses Fehlersignal. Trade-off: Fehlersignal-Gewinn vs. Loop-Latenz-Verlust.
**Methode:** Offizielle Doku (WebFetch + context7), Repo-Bestandsaufnahme, Wegwerf-Spike in isoliertem Worktree (`spike/ts-eval`, danach vollständig entfernt). Jede Toolchain-Aussage unten ist quellen- oder messungsbelegt.

---

## TL;DR / Empfehlung

**Pfad A (checkJs: `tsc --noEmit` über den bestehenden JS-Code) jetzt umsetzen — als →Checkpoint-Arbeit zwischen M4 und M5 (eigener Dashboard-Eintrag, CLAUDE.md §7 Punkt 4), Aufwand ~2–4 h.**
**Pfad B (inkrementell .ts) und Pfad C (Voll-Migration) jetzt NICHT** — Re-Evaluation frühestens, wenn Mock-Harness für `device.js` (Roadmap-Idee 6) und GitHub-Actions-CI (Idee 3) existieren.

> **Entscheidung (User, 2026-07-08):** Umsetzung von Pfad A als **eigener Milestone `M4.5` „TypeScript-Typecheck (checkJs)"** (statt Checkpoint-Task) — Dashboard-Eintrag mit vollem Resume-Prompt angelegt, positioniert zwischen M4 und →M5.
>
> **Entscheidung 2 (User, 2026-07-08):** Auch die B/C-Re-Evaluation aus §5 wurde als eigener Milestone eingeplant: **`M5` „TS-Migration device.js — Re-Evaluation (Pfad B/C)"** (mit eigenem →M5-Zwischen-Check), hart ge-gated auf die drei Trigger aus §5 (Mock-Harness, CI, strict-Ratchet). Die bisherigen Milestones M5–M9 wurden dafür zu **M6–M10 umnummeriert** (M6 = Inbound-Alarme, M7 = LabCOM, M8 = Empfehlungs-Modul, M9 = setConfig, M10 = Filterdruck/Auto-Detection-Review). Versions-Hinweis: Die 0.X=Milestone-Zuordnung kann dadurch driften — beim Release zählt `npx homey app version minor` auf die nächste freie 0.X (der Store verlangt monoton steigende Versionen).

Begründung in einem Satz (Simplicity First, CLAUDE.md §2): Der Spike zeigt, dass checkJs **ohne eine einzige `.ts`-Datei** bereits das gesamte kurzfristig erreichbare Fehlersignal liefert — 16 echte Befunde inkl. eines potenziellen Bugs im ungetesteten `driver.js` — bei **null Auswirkung auf die Test-Latenz, null Hook-Änderungen und null Build-Schritt**, während B/C Tage kosten, den Testrunner-Flow umbauen (extensionless `require` bricht, gemessen) und genau dort blind operieren würden, wo keine Tests existieren (`device.js`, Ort des einzigen Produktions-Crashs).

---

## 1. Offizieller Homey-TypeScript-Support (Aufgabe 1)

Quelle: <https://apps.developer.homey.app/guides/tools/typescript> (WebFetch 2026-07-08) + context7 `/websites/apps_developer_homey_app`; Spike-verifizierte Punkte markiert **[Spike]**.

| Frage | Antwort | Beleg |
|---|---|---|
| Was liefert Athom? | `homey app add-types` installiert die nötigen Pakete; Typdefinitionen kommen aus `homey-apps-sdk-v3-types` (offiziell, athombv), installierbar als Alias `npm i -D @types/homey@npm:homey-apps-sdk-v3-types` | TS-Guide; npm/GitHub `athombv/node-homey-apps-sdk-v3-types` |
| tsconfig-Vorgabe | `extends: "@tsconfig/node12/tsconfig.json"`, `outDir: ".homeybuild/"` (Pflicht), `sourceMap: true` (dringend empfohlen) | TS-Guide |
| Build-Integration | Bei vorhandener `tsconfig.json` ruft die CLI **`npm run build`** auf (Script `"build": "tsc"` nötig) — vor `run`, `install`, `publish` **und `validate`**. Kompilat landet in `.homeybuild/`; das ist, was auf dem Gerät läuft bzw. in den Store geht | TS-Guide; **[Spike]** `validate` schlug mit `tsconfig.json` ohne build-Script fehl („Typescript compilation failed", exit 1) und lief mit Script durch (exit 0) |
| Datei-für-Datei möglich? | Ja, explizit: Konversion „even on a file-by-file basis"; `allowJs` kompiliert/kopiert restliche `.js` mit | TS-Guide (changes/1149); **[Spike]** `.homeybuild/lib/` enthielt Kompilat der `.ts` + alle `.js` |
| tsconfig.json-Präsenz ist der Schalter | Existiert `tsconfig.json` im Root → CLI im TS-Modus (auch `driver create`); umbenennen/löschen → JS-Modus | TS-Guide. **Konsequenz für Pfad A: Checker-Config NICHT `tsconfig.json` nennen** |
| Node auf der Homey-Runtime | Homey Pro (Early 2023): **Node v18.20.8** (Forum-Stand; kann mit Firmware driften — bei Umsetzung kurz gegenprüfen). Die `@tsconfig/node12`-Basis ist konservativer als die reale Runtime | Community-Forum „Node.js packages on Homey Pro (Early 2023)"; GitHub `homey-apps-sdk-issues` #405 |

**[Spike]-Gotcha zusätzlich:** Mit TypeScript 6.0.3 wurden installierte `@types/*` **nicht** automatisch eingebunden (`error TS2591: Cannot find name 'module'`); erst explizites `"types": ["node", "homey"]` in der tsconfig behob es. Das minimale tsconfig aus dem Guide reicht mit aktuellem TS also nicht 1:1.

## 2. Bestandsaufnahme (Aufgabe 2)

**LOC (gezählt 2026-07-08):** `lib/` 777 (7 Module: Freshness 26, FeatureDetector 60, VioletClient 73, Lsi 89, Capabilities 102, WriteClient 147, FeatureGroups 280) · `drivers/pool/` 491 (device.js 388 **ungetestet**, driver.js 103 **ungetestet**) + `app.js` 14 · `test/` 807 (7 lib-Tests + 3 Hook-Tests + 4 JSON-Fixtures, größte ~10 KB) · `.claude/hooks/` 283 (5 Hooks).

**Dynamische Muster / TS-Reibung:** überschaubar. Die hardware-adaptive Detektion arbeitet mit string-keyed Maps und Template-Capability-IDs (`` `${base}.${ch}` `` in `FeatureGroups.desiredM2Capabilities`/`buildM2Updates`) — in TS schlicht `string[]`/`Record<string, unknown>`, kein Typsystem-Kampf nötig. Die eine echte Reibungsquelle ist der **untypisierte `raw`-Payload** (`@param {object}`): er verursacht im strict-Modus ~100 von 121 Fehlern (TS2339/TS7053). Ein einziges Typedef (Index-Signatur) löst das. JSON-Fixtures werden nur von `.js`-Tests per `require` geladen — keine Reibung, solange Tests `.js` bleiben.

**Startvorteil:** Dank `documenting-code`-Skill tragen alle pure-lib-Exports bereits JSDoc mit `@param`/`@returns`-Typen — checkJs kann sie sofort prüfen. Genau dadurch fand der Spike 2 Fälle, wo die JSDoc-Signatur nicht zum Code passt (s. u.).

**Testrunner-Optionen nach Migration (B/C):** gemessen auf Node v25.9.0 (Dev-Maschine; nirgends gepinnt):
- `node --test` mit extensionless `require('../lib/Freshness')` auf eine `.ts`: **MODULE_NOT_FOUND** — der CJS-Loader probiert `.ts` nicht. 85/86 anstatt 91 Tests, exit 1.
- Mit explizitem `require('../lib/Freshness.ts')`: **91/91, exit 0, 5,2 s** (natives Type-Stripping, keine Warnung auf v25.9). Laut Node-Doku default ab 23.6 (Backport in 22.18 LTS) — bei Umsetzung von B/C müsste ein `engines`-Feld das pinnen.
- Alternativen (tsx als Runner, Tests gegen `.homeybuild`-Kompilat): neue Dependency bzw. Build-Kopplung — für dieses Repo unnötig komplex, nicht weiterverfolgt.

**Hook-Analyse (alle 5):** Nur `run-matching-test.js:22` ist extension-gebunden (`/(?:^|\/)lib\/(\w+)\.js$/` → bei `.ts` **stiller Ausfall**, exit 0, kein Test läuft). `json-guard` (nur `*.json`), `secrets-guard` (inhaltsbasiert), `compose-guard` (nur `app.json`), `check-version-sync` (nur `git commit`, liest Manifeste) sind von allen Pfaden unberührt. Für B/C wäre die Regex-Erweiterung auf `\.(js|ts)$` Pflicht — **per TDD mit neuem Smoke-Test in `test/hooks/`**, da dieser Hook selbst ungetestet ist.

## 3. Gemessene Zahlen (Baseline + Spike, 2026-07-08)

Maschine: Windows 11, Node v25.9.0, TypeScript 6.0.3, npm 11.12.1. Alle Zeiten Wandzeit.

| Messung | Wert |
|---|---|
| **Baseline** `npm test` (Haupt-Repo, 3 Läufe) | 5,9–6,2 s (npm-Wrapper-Overhead dominiert) |
| **Baseline** `node --test` direkt (3 Läufe) | 4,6–4,7 s; testinterne `duration_ms` 3,1–3,5 s |
| **Baseline** `npx homey app validate --level publish` | 7,6 s, exit 0 |
| **Baseline** `npx homey app build` | 9,2 s, exit 0 |
| `npm i -D typescript @tsconfig/node12 @types/homey@npm:homey-apps-sdk-v3-types @types/node@18` | 5,7 s |
| checkJs `lib/` **strict** | **121 Fehler** (TS2339 ×67, TS7053 ×35, TS7006 ×11, Rest 8) — ~100 davon = ein Root-Cause (untypisierter `raw`-Payload); FeatureGroups 72, Capabilities 15, FeatureDetector 13, VioletClient 10, Lsi 6, WriteClient 5 |
| checkJs `lib/` **lenient** (`strict: false`) | **2 Fehler**, beide echt: JSDoc verlangt Pflicht-Props, Code default `{}` (`FeatureGroups.buildM2Updates`, `WriteClient`) |
| checkJs **ganze App** lenient (lib+drivers+app+test) | **16 Fehler**, 7,0 s — `device.js` (388 LOC, ungetestet): **0 Fehler** gegen SDK-Typen; `driver.js`: 1 × TS2416 (`onPair`-Signatur ≠ SDK-Basistyp — potenziell echter Befund!); lib: 2 (s. o.); Tests: 13 (fetch-Stub-Typen, `err.message` auf `unknown`) |
| `tsc`-Kompilierung (1 `.ts` + allowJs, Pfad B/C) | 3,7 s |
| `validate --level publish` **mit** TS-Setup | 12,6 s, exit 0 (**+5 s**: tsc-Schritt inklusive) |
| `node --test` mit `.ts` (explizites Extension-Require) | 5,2 s, 91/91, exit 0 (**+~0,5 s** ≈ +11 % zur Baseline 4,7 s) |
| `tsc --noEmit` mit `--incremental`, 2. Lauf | 6,6 s (kein Gewinn — Prozess-Startup dominiert) → **als PostToolUse-Hook ungeeignet** |

Hinweis Baseline-Drift: Der Brief nannte ~2,4 s; heute gemessen sind 4,7 s (`node --test`) bzw. 3,1–3,5 s intern. Deshalb sind alle Kriterien unten **relativ** formuliert und am Umsetzungstag auf derselben Maschine neu zu messen.

Spike-Anomalie (nicht TS-bedingt): `npx homey app build` schlug im Temp-Worktree mit ENOENT fehl — **auch ohne tsconfig.json**, im Haupt-Repo exit 0. Umgebungsartefakt (Temp-Pfad/Worktree), keine Aussagekraft für TS.

## 4. Die drei Pfade (Aufgabe 3)

### Pfad A — checkJs: `tsc --noEmit` über bestehendes JS ⭐ EMPFOHLEN

Code bleibt zu 100 % `.js`; eine Checker-Config (`tsconfig.checkjs.json` — **bewusst nicht** `tsconfig.json`, sonst kippt die Homey-CLI in den TS-Modus, §1) + `// @ts-check`-freies projektweites `checkJs` + npm-Script `"typecheck"`.

- **Aufwand: ~2–4 h.** Config + devDeps (~½ h), 16 lenient-Fehler fixen (~1–2 h; darunter der `driver.js`-`onPair`-Befund → klären, ob Bug oder Typen-Strenge), Commit-Gate/CI-Verankerung (~½–1 h).
- **Loop-Impact: null im inneren Loop.** `npm test` unverändert; kein Build-Schritt; `run-matching-test` läuft unverändert weiter (Dateien bleiben `.js`).
- **Typecheck-Ort (3b):** ① PostToolUse je Edit: **verworfen** — gemessen +6,6 s pro Edit, auch inkrementell; das Testsignal kommt heute in ~2–5 s. ② **Commit-Gate (empfohlen):** PreToolUse-Bash-Hook nach Muster `check-version-sync.js`, ideal kombiniert mit Roadmap-Idee 2 (`test-gate.js`): roter `tsc --noEmit` ODER roter Test blockt `git commit` (+~7 s pro Commit — akzeptabel). ③ **CI (Roadmap-Idee 3, empfohlen als Netz):** `tsc --noEmit` als Job neben `npm test` + `validate --level publish`. Signal kommt später, kostet aber lokal nichts. ②+③ zusammen = frühes Signal ohne Edit-Latenz.
- **Hooks:** keine Änderung. **documenting-code:** unverändert — JSDoc wird jetzt sogar maschinell geprüft (Typo in `@param` = Fehler statt stiller Doku-Drift; die 2 lib-Funde beweisen den Wert).
- **app.json/.homeycompose:** unberührt (verifiziert: ohne Root-`tsconfig.json` bleibt die CLI im JS-Modus; validate im Haupt-Repo unverändert exit 0/7,6 s). **Release-Checkliste (§8/HOMEY.md):** unverändert.
- **devDependencies (3a):** `typescript` (^6), `@types/homey` (Alias `homey-apps-sdk-v3-types`), `@types/node@^18` (= Runtime-Major der Homey Pro 2023). **`package-lock.json`: committen** — Empfehlung ja: ohne Lockfile ist die Checker-Version nicht reproduzierbar (TS-Minor-Updates ändern Fehlerlisten); die Datei existiert bereits untracked, `npm ci` in der künftigen CI braucht sie. Die bewusste Null-Dependency-Politik bleibt für **Runtime**-Dependencies intakt (`dependencies: {}` unverändert; auf dem Gerät ändert sich nichts).
- **Risiko: minimal.** Lenient checkt weniger als strict (bewusst); Ausbaupfad: ein `raw`-Payload-Typedef eliminiert ~100 der 121 strict-Fehler, danach ist `strict: true` in weiteren ~2–4 h erreichbar („Ratchet", optional, nicht Teil der Checkpoint-Task).
- **Fehlersignal-Ausbeute:** lib + drivers + app.js + Tests werden geprüft — **inkl. des ungetesteten Glue-Codes**, den eine lib-first-Migration (B) gerade nicht abdecken würde. Geschätzt ~80–90 % dessen, was Voll-TS kurzfristig brächte, zu ~10 % der Kosten.

### Pfad B — inkrementell: `allowJs`, lib/ zuerst nach .ts

- **Aufwand: ~1–2 Tage.** Echtes `tsconfig.json` + `"build": "tsc"` + `types`-Gotcha (§1); 7 lib-Module (777 LOC) nach `.ts`; **alle 7 Test-Dateien** auf explizite `.ts`-Requires umstellen (extensionless bricht, gemessen); `run-matching-test`-Regex + neuer Hook-Test (TDD); `engines`-Feld pinnen (Node ≥ 22.18/23.6); documenting-code-Skill anpassen (JSDoc-Typen → TS-Signaturen).
- **Loop-Impact:** `node --test` +~0,5 s (+11 %) — im Budget; `validate` +~5 s (tsc integriert); `homey app build` kompiliert nach `.homeybuild/` (gitignored, keine Manifest-Änderung).
- **Risiko: die Zwei-Artefakte-Divergenz.** Dev-Loop lädt `.ts` per Type-Stripping (Node 25), das Gerät läuft das `tsc`-Kompilat (target es2019) aus `.homeybuild/` — zwei verschiedene Transformationen desselben Codes. Dazu Mixed-Mode (CJS-`require` zwischen `.js`-drivers und `.ts`-lib) und die Kopplung des Dev-Loops an die lokale Node-Version. Und: **B prüft ausgerechnet den getesteten Teil** (lib/ hat 91 Tests) und lässt den ungetesteten (drivers/) als `.js` zurück — das Fehlersignal-Argument läuft ins Leere; checkJs deckt drivers/ sofort mit ab.

### Pfad C — Voll-Migration (offizieller Guide, alles .ts)

- **Aufwand: ~3–5 Tage.** 1 282 LOC Produktcode + 807 LOC Tests + alles aus B, plus `device.js`/`driver.js`/`app.js` gegen die SDK-Typen (der `onPair`-Konflikt ist ein Vorbote), plus Release: Version-Bump + Store-Test-Publish zur Runtime-Verifikation — dessen Gates (homeyCommunityTopicId, Passwort-Rotation) sind noch offen.
- **Loop-Impact:** wie B; zusätzlich hängt jeder Geräte-Deploy am tsc-Schritt (CLI-integriert, ~+4 s).
- **Risiko: das höchste.** Größter Einzel-Diff seit Projektstart; berührt den einzigen Produktions-Crash-Bereich (`device.js`) **ohne Tests und ohne Mock-Harness** (Roadmap-Idee 6 unerledigt) — Verhaltensäquivalenz wäre nicht verifizierbar, nur hoffbar. Verstößt gegen Simplicity First, solange A 80–90 % des Nutzens liefert. Alle 16 lenient-Befunde und der `onPair`-Fund kamen ohne eine einzige `.ts`-Datei.

## 5. Empfehlung im Detail

1. **Jetzt (→Checkpoint zwischen M4 und M5, eigener Dashboard-Eintrag `id: "→M5"` -Zusatz oder eigene Checkpoint-Task):** Pfad A umsetzen (~2–4 h) — Checker-Config, devDeps + Lockfile committen, 16 Fehler fixen (den `driver.js`-`onPair`-Befund als Erstes klären), `tsc --noEmit` ins Commit-Gate (mit Roadmap-Idee 2) und in die künftige CI (Idee 3) hängen.
2. **Nicht jetzt:** B und C. **Re-Evaluations-Trigger:** Wenn (a) Mock-Harness `test/mocks/homey.js` existiert (Idee 6) UND (b) CI läuft (Idee 3) UND (c) checkJs-strict-Ratchet ausgereizt ist, kann eine `.ts`-Migration von `device.js` (nicht lib-first!) als eigener Milestone neu bewertet werden — dann mit verifizierbarer Verhaltensäquivalenz.
3. **Gar nicht:** tsx/ts-node-Runner, tsconfig.json im Root für Pfad A, PostToolUse-Typecheck.

## 6. Erfolgs-/Abbruchkriterien (CLAUDE.md §4 — maschinell, relativ zur Baseline)

Baseline am Umsetzungstag auf derselben Maschine neu messen (3 Läufe, Median): `node --test`-Wandzeit **B_test**, `validate --level publish`-Wandzeit **B_val**.

**Erfolg der Checkpoint-Task Pfad A (alle müssen gelten):**
1. `npx tsc -p tsconfig.checkjs.json` → **exit 0** (lenient-Config, include: lib/, drivers/, app.js, test/)
2. `node --test` → **`fail 0`** und `pass ≥ 91` (nicht „91 grün" — die Zahl driftet nach oben)
3. `npm test`-Wandzeit ≤ **2 × B_test** (erwartet: unverändert, da kein Build-Schritt)
4. `npx homey app validate --level publish` → **exit 0** und Wandzeit ≤ 2 × B_val (erwartet: unverändert)
5. Nach `npx tsc` + `npx homey app build`: `git status` zeigt **keine Änderung** an `app.json`/`.homeycompose/app.json`
6. **Kein `tsconfig.json`** im Root (nur `tsconfig.checkjs.json`); `npx homey app build` → exit 0 ohne TS-Schritt
7. Hook-Verhalten unverändert: Edit an `lib/Lsi.js` triggert `test/Lsi.test.js` (manueller Smoke)
8. `git diff` zeigt: `dependencies` in package.json weiterhin `{}` (nur devDependencies neu)

**Abbruch:** Kriterium 1 nur durch Aufweichen unterhalb von `strict: false` erreichbar (z. B. `checkJs` partiell abschalten), oder Kriterium 3/4 verfehlt → Task stoppen, Befund hier nachtragen, Status quo behalten.

**Für eine spätere B/C-Session zusätzlich:** `run-matching-test`-Regex `.ts`-fähig **mit** neuem Test in `test/hooks/`; `engines`-Feld gepinnt; `device.js` strict-clean; Store-Test-Publish verifiziert Runtime-Äquivalenz.

## 7. Spike-Protokoll (Leitplanken eingehalten)

- Worktree `spike/ts-eval` im Session-Scratchpad; **kein** `homey app run/install/publish`, nur `build` + `validate` (lokal); nichts committet/gemergt; Worktree per `git worktree remove --force` entfernt, Branch gelöscht (verifiziert: `git worktree list` = nur Haupt-Repo, `git status` unverändert).
- Einzige Schreibaktion im Haupt-Worktree: dieses Dokument.

## Quellen

- Offizieller TS-Guide: <https://apps.developer.homey.app/guides/tools/typescript> (+ context7 `/websites/apps_developer_homey_app`)
- Typdefinitionen: <https://github.com/athombv/node-homey-apps-sdk-v3-types> / npm `homey-apps-sdk-v3-types`
- Homey-CLI (`add-types`): <https://apps.developer.homey.app/the-basics/getting-started/homey-cli>
- Node-Version Homey Pro 2023 (v18.20.8): <https://community.homey.app/t/node-js-packages-on-homey-pro-early-2023/79755> · <https://github.com/athombv/homey-apps-sdk-issues/issues/405>
- Typfehler-Empirie: arXiv 2504.09246 (via Loop-Engineering-Analyse, Memory `loop-dev-roadmap`)
- Alle Messwerte: eigener Spike 2026-07-08 (siehe §3)
