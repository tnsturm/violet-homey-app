# Insights-Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Warum `executing-plans` und nicht `subagent-driven-development`** (CLAUDE.md §0): alle Tasks
> teilen denselben Toolchain-State (eine `npm test`-Suite, ein gemeinsamer Fehler-Stream, dieselben
> `.claude/hooks/`-Konventionen). Frische Subagent-Kontexte müssten pro Task dieselben fünf
> Hook-Dateien neu lesen; der Kontexttransfer kostet mehr als er einspart.

**Goal:** Die im `/insights`-Report vom 2026-08-21 belegten Reibungsklassen mechanisch abstellen
(drei Hook-Änderungen), die Prozessregeln nachziehen (CLAUDE.md/HOMEY.md/Checkpoint-Skill), drei
spezialisierte Review-Agents ergänzen und die generischen Anteile ins Framework-Repo spiegeln.

**Architecture:** Vier Ebenen, absteigend nach Verlässlichkeit (CLAUDE.md §10 Layer 1 → 2):
mechanische Guards (Hooks + Tests) vor Prosa-Regeln vor Agent-Definitionen. Kein bestehendes Gate
wird geschwächt — die eine Gate-Änderung trennt „Umgebung nicht bereit" (kann nicht prüfen) von
„Prüfung wirklich rot" (echter Fund), was `test-gate.js` für den Spawn-Fehlerfall (`status === null`)
bereits tut und hier nur konsequent zu Ende führt.

**Tech Stack:** Node.js (CommonJS, keine Runtime-Deps), `node:test` als Suite, Claude-Code-Hooks
(PreToolUse/PostToolUse/Stop, exit 2 = block), Git.

## Global Constraints

- **Keine neuen Dependencies** — weder Runtime noch Dev. `test/toolchain.test.js` erzwingt
  `dependencies === {}`; jeder neue Hook nutzt ausschließlich Node-Builtins.
- **Hooks sind fail-open auf eigene Fehler** — unparsebares stdin, fehlendes Git, fehlende
  `package.json` → `exit 0`. `exit 2` nur bei einem echten Fund. Muster: `check-version-sync.js`.
- **Telemetrie darf einen Hook nie brechen** — `logHook` ist strikt fail-silent (`lib/log.js`).
- **Jeder neue Hook bringt einen Smoke-Test mit** (CLAUDE.md §0/Checkpoint Schritt 5 Punkt 4) und
  wird in `.claude/settings.json` verdrahtet.
- **Kommentar-Header nach `/documenting-code`**: Datei-Header nennt Hook-Typ, Matcher, Zweck und die
  Herkunft der Regel (hier: `/insights`-Report 2026-08-21) mit §-Bezug.
- **Suite muss nach jedem Task grün sein** — Baseline dieses Worktrees: 366 Tests, 0 Failures.
- **Sprache**: Code-Kommentare und Skill-/Doku-Texte folgen der jeweiligen Datei (Hooks: Englisch,
  CLAUDE.md: Deutsch/Englisch gemischt wie vorhanden, `milestone-checkpoint/SKILL.md`: Deutsch).

## File Structure

| Datei | Verantwortung | Task |
|---|---|---|
| `.claude/hooks/lib/log.js` | Telemetrie no-op unter node:test-Markern (strukturelle Pollution-Sperre) | 1 |
| `test/hooks/hook-log.test.js` | Regressionstest für ebendiese Sperre | 1 |
| `.claude/hooks/hook-log.jsonl` | Live-Ledger, auf saubere Daten gekürzt (lokal, gitignored) | 1 |
| `.claude/skills/milestone-checkpoint/SKILL.md` | Schritt 5 Signalregel + Schritt 7a Spiegel-Tabelle | 1, 5 |
| `.claude/hooks/lib/env-ready.js` | Neuer reiner Helper: „ist die Toolchain installiert?" | 2 |
| `.claude/hooks/test-gate.js` | Nutzt `env-ready`: skip statt block bei fehlenden `node_modules` | 2 |
| `.claude/hooks/stop-verify.js` | Dito für den Stop-Pfad | 2 |
| `.claude/hooks/commit-msg-guard.js` | Neuer PreToolUse-Guard gegen Heredoc-/Here-String-Reste | 3 |
| `.claude/hooks/handoff-notice.js` | Neuer Stop-Hook: ungepushte Commits einmal pro HEAD melden | 4 |
| `CLAUDE.md`, `HOMEY.md` | Tier-2-Prozessregeln | 5 |
| `.claude/agents/{runtime-resource,api-contract,cross-platform}-reviewer.md` | Tier-3-Review-Linsen | 6 |
| `skill-agentic-loop-framework/**` | Spiegelung der generischen Anteile + CHANGELOG | 7 |

---

### Task 1: hook-log-Signal reparieren (Aufgabe 1)

Das `hook-log.jsonl` dieses Repos enthält 449 `block`-Records, davon 434 aus dem 14./15.07. als
Nebenprodukt von `package-guard.test.js` (Root-Cause 2026-07-15 in `bf60614` behoben). Schritt 5 des
`milestone-checkpoint`-Skills benutzt genau diese Zählungen als Reibungssignal und würde daraus
„`package-guard` ist unsere häufigste Reibungsklasse" ableiten — falsch.

Zwei Halbfixes: (a) die Altdaten aus dem Live-Ledger nehmen (archiviert, nichts geht verloren),
(b) eine strukturelle Sperre, damit kein aus einem Test gespawnter Hook je wieder schreiben kann —
unabhängig davon, ob der Test einen Fixture-`cwd` mitgibt.

`HOOK_LOG_DISABLE` (M6.0) deckt nur Tests ab, die daran denken, es zu setzen: 4 von 14
`test/hooks/*.test.js` tun das. Der node:test-Marker `NODE_TEST_CONTEXT` ist dagegen in **jedem**
aus der Suite gespawnten Hook-Prozess gesetzt (er wird nur von `lib/spawn-env.js` gezielt gestrippt,
wenn ein Hook selbst eine verschachtelte Suite startet) — also die verlässlichere Sperre.

**Files:**
- Modify: `.claude/hooks/lib/log.js:41` (Guard-Zeile + JSDoc)
- Modify: `test/hooks/hook-log.test.js:18-30` (Positivtest muss den Marker temporär entfernen)
- Test: `test/hooks/hook-log.test.js` (neuer Regressionstest)
- Modify: `.claude/skills/milestone-checkpoint/SKILL.md` (Schritt 5, Punkt 1)
- Data: `.claude/hooks/hook-log.jsonl` (kürzen), `.claude/hooks/hook-log.pre-2026-07-15.jsonl.bak` (neu)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `logHook(hook, decision, cwd)` bleibt signaturgleich; `decision` erhält zusätzlich den
  Wert `'skip'` (von Task 2 genutzt).

- [ ] **Step 1: Failing test schreiben** — an `test/hooks/hook-log.test.js` anhängen:

```js
test('logHook: no-op under node:test markers — a test-spawned hook can never pollute (2026-08-21)', () => {
  // HOOK_LOG_DISABLE (M6.0) deckt nur Tests ab, die daran denken, es zu setzen — 4 von 14
  // test/hooks/*.test.js tun das. NODE_TEST_CONTEXT ist dagegen in JEDEM aus der Suite
  // gespawnten Hook-Prozess gesetzt. Damit ist die Pollution-Klasse strukturell zu, statt
  // per Konvention. /insights-Report 2026-08-21: 434 von 449 Blocks waren solche Fake-Records.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
  fs.mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true });
  const prev = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = 'child-v8';
  try {
    logHook('package-guard', 'block', dir);
  } finally {
    if (prev === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = prev;
  }
  assert.strictEqual(fs.existsSync(path.join(dir, '.claude', 'hooks', 'hook-log.jsonl')), false);
});
```

- [ ] **Step 2: Test laufen lassen, Rot verifizieren**

Run: `npx node --test test/hooks/hook-log.test.js`
Expected: FAIL — `Expected values to be strictly equal: true !== false` (die Datei wird noch geschrieben).

- [ ] **Step 3: Positivtest gegen den neuen Guard immunisieren**

`test/hooks/hook-log.test.js:18-30` — der erste Test ruft `logHook` **in-process** auf und erwartet
einen Schreibvorgang; unter `node --test` ist `NODE_TEST_CONTEXT` gesetzt, er würde also mit dem
neuen Guard fehlschlagen. Body von `test('logHook: appends a parseable JSONL line when .claude/hooks exists', ...)`
ersetzen durch:

```js
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
  fs.mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true });
  // In-process-Aufruf: der Runner selbst trägt NODE_TEST_CONTEXT, den der Guard sperrt.
  // Für den Positivpfad kurz entfernen — gespawnte Hooks bleiben davon unberührt.
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    logHook('test-gate', 'block', dir);
    logHook('test-gate', 'pass', dir);
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
  const lines = fs.readFileSync(path.join(dir, '.claude', 'hooks', 'hook-log.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].hook, 'test-gate');
  assert.strictEqual(lines[0].decision, 'block');
  assert.strictEqual(lines[1].decision, 'pass');
  assert.match(lines[0].ts, /^\d{4}-\d{2}-\d{2}T/);
```

- [ ] **Step 4: Minimalimplementierung in `lib/log.js`**

Die Guard-Zeile (aktuell `if (!cwd || process.env.HOOK_LOG_DISABLE) return;`) ersetzen durch:

```js
function logHook(hook, decision, cwd) {
  // fixture safety (D2) + M6.0 retro (HOOK_LOG_DISABLE) + 2026-08-21: NODE_TEST_CONTEXT/
  // NODE_TEST_WORKER_ID sind in jedem aus `node --test` gespawnten Hook-Prozess gesetzt
  // (lib/spawn-env.js strippt sie nur für absichtlich verschachtelte Suiten). Damit kann
  // ein Test-Spawn strukturell nicht mehr in den echten Ledger schreiben, statt nur dann,
  // wenn der Test daran denkt HOOK_LOG_DISABLE zu setzen (4 von 14 tun das).
  if (!cwd || process.env.HOOK_LOG_DISABLE) return;
  if (process.env.NODE_TEST_CONTEXT || process.env.NODE_TEST_WORKER_ID) return;
```

Im JSDoc über der Funktion den `decision`-Parameter auf den erweiterten Wertebereich ziehen:

```js
 * @param {'block'|'pass'|'skip'} decision Outcome at a real decision point (D3); `skip` = the
 *   check could not run at all (e.g. toolchain not installed) and nothing was verified.
```

- [ ] **Step 5: Tests laufen lassen, Grün verifizieren**

Run: `npx node --test test/hooks/hook-log.test.js`
Expected: PASS (6 Tests).

- [ ] **Step 6: Live-Ledger archivieren und kürzen**

Beide Dateien sind gitignored (Step 7 ergänzt das `.bak`). Ausführen im **primären Checkout**
`C:/Users/TorstenSturm/source/repos/VioletApp` (dort liegt der echte Ledger, nicht im Worktree):

```bash
node -e "const fs=require('fs');const p='.claude/hooks/hook-log.jsonl';const CUT='2026-07-15T13:28:29';fs.copyFileSync(p,'.claude/hooks/hook-log.pre-2026-07-15.jsonl.bak');const all=fs.readFileSync(p,'utf8').trim().split('\n');const keep=all.filter(l=>{try{return JSON.parse(l).ts>=CUT}catch{return false}});fs.writeFileSync(p,keep.join('\n')+'\n');console.log('archived',all.length,'-> kept',keep.length);"
```

`CUT` ist der Commit-Zeitpunkt von `bf60614` (`2026-07-15T15:28:29+02:00` = `13:28:29Z`), also der
Moment, ab dem die Root-Cause behoben war. Erwartete Ausgabe: `archived 1468 -> kept <n>` mit
`<n>` ≈ 1000 und **0** verbleibenden Blocks vor dem Stichtag.

- [ ] **Step 7: `.gitignore` ergänzen**

Unter dem bestehenden Block `# Hook telemetry (local only — M4.8)` die Zeile
`.claude/hooks/hook-log.jsonl` ergänzen um:

```
.claude/hooks/hook-log.pre-*.jsonl.bak
.claude/hooks/.handoff-notice-state.json
```

(Die zweite Zeile gehört zu Task 4 und wird hier gleich mit erledigt, damit `.gitignore` nur einmal
angefasst wird.)

- [ ] **Step 8: Schritt 5 des Checkpoint-Skills präzisieren**

In `.claude/skills/milestone-checkpoint/SKILL.md`, Schritt 5, Punkt 1 — den Satz
„Zusätzlich `.claude/hooks/hook-log.jsonl` auslesen (Block-Zählungen je Hook seit dem letzten
Checkpoint statt Erinnerung — M4.8; viele Blocks desselben Hooks = wiederkehrende Reibungsklasse)."
ersetzen durch:

```markdown
   Zusätzlich `.claude/hooks/hook-log.jsonl` auslesen (Block-Zählungen je Hook seit dem letzten
   Checkpoint statt Erinnerung — M4.8; viele Blocks desselben Hooks = wiederkehrende Reibungsklasse).
   Deterministisch zählen statt überfliegen:

   ```bash
   node -e "const fs=require('fs');const SINCE='<letzter-checkpoint-YYYY-MM-DD>';const a={};for(const l of fs.readFileSync('.claude/hooks/hook-log.jsonl','utf8').trim().split('\n')){try{const o=JSON.parse(l);if(o.decision==='block'&&o.ts>=SINCE)a[o.hook]=(a[o.hook]||0)+1}catch{}}console.log(a)"
   ```

   **Der Ledger beginnt am 2026-07-15T13:28:29Z** (Commit `bf60614`): davor liegende Einträge waren
   zu 434/449 Fake-Records aus `package-guard.test.js` und wurden nach
   `hook-log.pre-2026-07-15.jsonl.bak` archiviert (2026-08-21, ausgelöst durch den `/insights`-Report).
   Steht dort wieder eine auffällige Blockspitze eines einzelnen Hooks, **zuerst prüfen, ob sie aus
   einem Testlauf stammt** (Zeitstempel-Cluster innerhalb weniger Minuten, Hook = der gerade
   getestete), bevor daraus eine Reibungsklasse abgeleitet wird — seit 2026-08-21 sperrt
   `lib/log.js` das strukturell über die node:test-Marker, ein Cluster wäre also ein neuer Befund.
```

- [ ] **Step 9: Volle Suite + Commit**

Run: `npm test`
Expected: 367 Tests, 0 Failures.

```bash
git add .claude/hooks/lib/log.js test/hooks/hook-log.test.js .claude/skills/milestone-checkpoint/SKILL.md .gitignore
git commit -F .git/COMMIT_MSG.tmp
```

Commit-Message (vorher via `node`/Heredoc-freiem Weg nach `.git/COMMIT_MSG.tmp` schreiben):
`fix(hooks): hook-log strukturell gegen Test-Pollution sperren + Schritt-5-Signal präzisieren`

---

### Task 2: Gates trennen „Umgebung nicht bereit" von „Prüfung rot" (Tier 1 #1)

`test-gate.js:47` startet die Suite und macht aus **jedem** Nicht-Null-Exit ein `exit 2`. In einem
frischen Worktree ohne `node_modules` ist das ein `MODULE_NOT_FOUND` — kein roter Test, sondern eine
nicht durchgeführte Prüfung. Belegter Effekt (`/insights` 2026-08-21): eine komplette Session lang
war jeder `git commit` blockiert und alle Git-Operationen mussten von Hand laufen; ein Release-Commit
unterblieb dabei still.

Das ist **keine** Abschwächung des Gates: `test-gate.js:53` behandelt den Spawn-Fehler
(`status === null`) bereits als „nichts wurde geprüft → fail open". Diese Unterscheidung wird hier
nur auf den zweiten Fall ausgedehnt, in dem nichts geprüft werden konnte. `typecheck-gate.js`
braucht die Änderung nicht — es fällt bei nicht auflösbarem `typescript` schon offen aus
(Test: „typecheck-gate: typescript not resolvable → PASS (fail-open)").

**Files:**
- Create: `.claude/hooks/lib/env-ready.js`
- Create: `test/hooks/env-ready.test.js`
- Modify: `.claude/hooks/test-gate.js` (nach dem `testScript`-Block, vor dem `spawnSync`)
- Modify: `.claude/hooks/stop-verify.js` (vor dem `if (testScript)`-Block)
- Modify: `test/hooks/test-gate.test.js` (neuer Fall)

**Interfaces:**
- Produces: `toolchainMissing(cwd) => string|null` — gibt einen menschenlesbaren Grund zurück, wenn
  die Toolchain nachweislich nicht installiert ist, sonst `null`. Von Task 2 in `test-gate.js` und
  `stop-verify.js` konsumiert.

- [ ] **Step 1: Failing test schreiben** — `test/hooks/env-ready.test.js` anlegen:

```js
'use strict';

// Smoke test for .claude/hooks/lib/env-ready.js — the helper answers "is the guarded repo's
// toolchain actually installed?", so gates can tell "could not check" apart from "check failed"
// (/insights report 2026-08-21: a worktree without node_modules blocked every git commit for a
// whole session because a red suite and an uninstalled suite looked identical to test-gate).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { toolchainMissing } = require('../../.claude/hooks/lib/env-ready');

/** @param {object} pkg @param {boolean} withModules */
function makeRepo(pkg, withModules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-ready-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  if (withModules) fs.mkdirSync(path.join(dir, 'node_modules'));
  return dir;
}

test('toolchainMissing: declared deps but no node_modules → reason string', () => {
  const dir = makeRepo({ name: 'f', devDependencies: { typescript: '5' } }, false);
  const reason = toolchainMissing(dir);
  assert.strictEqual(typeof reason, 'string');
  assert.match(reason, /node_modules/);
  assert.match(reason, /npm ci/);
});

test('toolchainMissing: declared deps and node_modules present → null', () => {
  const dir = makeRepo({ name: 'f', devDependencies: { typescript: '5' } }, true);
  assert.strictEqual(toolchainMissing(dir), null);
});

test('toolchainMissing: no declared deps at all → null (nothing to install)', () => {
  const dir = makeRepo({ name: 'f' }, false);
  assert.strictEqual(toolchainMissing(dir), null);
});

test('toolchainMissing: empty dependency objects → null (nothing to install)', () => {
  const dir = makeRepo({ name: 'f', dependencies: {}, devDependencies: {} }, false);
  assert.strictEqual(toolchainMissing(dir), null);
});

test('toolchainMissing: unreadable package.json → null (fail open, not ours to judge)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-ready-'));
  assert.strictEqual(toolchainMissing(dir), null);
});
```

- [ ] **Step 2: Test laufen lassen, Rot verifizieren**

Run: `npx node --test test/hooks/env-ready.test.js`
Expected: FAIL — `Cannot find module '.../.claude/hooks/lib/env-ready'`.

- [ ] **Step 3: `.claude/hooks/lib/env-ready.js` implementieren**

```js
'use strict';

// Toolchain-readiness probe (pure helper) — /insights report 2026-08-21.
// A gate that runs the project's own suite must tell two things apart:
//   "the check ran and failed"  -> a real finding, block (exit 2)
//   "the check could not run"   -> nothing was verified, don't block
// test-gate.js already did this for a failed spawn (status === null); a fresh worktree whose
// node_modules were never installed is the same category but exits non-zero with
// MODULE_NOT_FOUND, so it used to read as "tests red" and blocked EVERY commit for a whole
// session (memory: worktree-npm-ci-required). This helper is the shared probe.
// Deliberately narrow: it only reports the one condition it can prove from the filesystem.

const fs = require('fs');
const path = require('path');

/**
 * Reason the guarded repo's toolchain is provably not installed, or null when it is
 * installed / nothing is declared / we cannot tell. Never throws.
 * @param {string} cwd Guarded repo root.
 * @returns {string|null} Human-readable reason for a gate to print, or null to proceed.
 */
function toolchainMissing(cwd) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null; // no readable manifest -> not ours to judge (fail open)
  }
  const declared = Object.keys(pkg.dependencies || {}).length
    + Object.keys(pkg.devDependencies || {}).length;
  if (declared === 0) return null; // nothing to install -> a red suite is a real finding
  if (fs.existsSync(path.join(cwd, 'node_modules'))) return null;
  return `${declared} dependencies are declared but node_modules is missing — run "npm ci" first`;
}

module.exports = { toolchainMissing };
```

- [ ] **Step 4: Test laufen lassen, Grün verifizieren**

Run: `npx node --test test/hooks/env-ready.test.js`
Expected: PASS (5 Tests).

- [ ] **Step 5: Failing test für `test-gate.js` schreiben** — an `test/hooks/test-gate.test.js` anhängen:

```js
test('test-gate: declared deps but no node_modules → SKIP, not block (/insights 2026-08-21)', () => {
  // A worktree that was never `npm ci`-ed makes the suite exit non-zero for an environment
  // reason. Blocking there gives zero protection (nothing was checked) and cost a whole
  // session of manual git operations. Must pass, and must say why.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gate-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture', version: '0.0.0', scripts: { test: 'node --test' },
    devDependencies: { typescript: '5' },
  }));
  const { code, err } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 0, err);
  assert.match(err, /npm ci/);
});
```

- [ ] **Step 6: Test laufen lassen, Rot verifizieren**

Run: `npx node --test test/hooks/test-gate.test.js`
Expected: FAIL — `Expected values to be strictly equal: 2 !== 0`.

- [ ] **Step 7: `test-gate.js` anpassen**

Import ergänzen (neben den bestehenden `require`s am Dateikopf):

```js
const { toolchainMissing } = require('./lib/env-ready');
```

Direkt nach dem `if (!testScript) { process.exit(0); }`-Block einfügen:

```js
  // "could not check" != "check failed" (/insights 2026-08-21): a repo whose declared
  // dependencies were never installed makes the suite exit non-zero for an environment
  // reason. Blocking there protects nothing and blocks everything.
  const notReady = toolchainMissing(cwd);
  if (notReady) {
    logHook('test-gate', 'skip', cwd);
    console.error(`test-gate: skipped — ${notReady}. Nothing was verified; the suite did not run.`);
    process.exit(0);
  }
```

- [ ] **Step 8: Test laufen lassen, Grün verifizieren**

Run: `npx node --test test/hooks/test-gate.test.js`
Expected: PASS (alle Fälle inkl. der bestehenden Rot-/Grün-Fälle).

- [ ] **Step 9: `stop-verify.js` gleichziehen**

Import ergänzen:

```js
const { toolchainMissing } = require('./lib/env-ready');
```

Den Block `if (testScript) { ... }` ersetzen durch:

```js
  const notReady = toolchainMissing(cwd);
  if (testScript && !notReady) {
    // spawnEnv strips the node:test child markers (lib/spawn-env.js — M4.6/M4.7 lesson).
    const r = spawnSync(testScript, { cwd, shell: true, encoding: 'utf8', env: spawnEnv() });
    if (r.status !== 0 && r.status !== null) {
      problems.push(`test suite ("${testScript}") failed:\n${[r.stdout, r.stderr].filter(Boolean).join('\n').trim()}`);
    }
  } else if (notReady) {
    // Same rule as test-gate.js: an uninstalled toolchain is "nothing was verified",
    // not "verification is red" (/insights 2026-08-21).
    problems.push(`test suite not run — ${notReady}`);
  }
```

Hinweis: hier landet der Grund bewusst **in `problems`**, nicht in einem stillen Skip — der Stop-Hook
soll den Turn nicht mit unverifizierten Quelländerungen beenden; er sagt dem Modell aber jetzt den
echten Grund („npm ci fehlt") statt eines irreführenden roten Testausgabe-Blocks.

- [ ] **Step 10: Volle Suite + Commit**

Run: `npm test`
Expected: 373 Tests, 0 Failures.

```bash
git add .claude/hooks/lib/env-ready.js .claude/hooks/test-gate.js .claude/hooks/stop-verify.js test/hooks/env-ready.test.js test/hooks/test-gate.test.js
git commit -F .git/COMMIT_MSG.tmp
```

Message: `fix(hooks): Gates unterscheiden nicht-installierte Toolchain von roter Prüfung`

---

### Task 3: commit-msg-guard gegen Heredoc-/Here-String-Reste (Tier 1 #2)

Zweimal belegt (`/insights` 2026-08-21): ein PowerShell-Here-String hinterließ ein `@` in der
Commit-Message (zwei Amends nötig), ein Heredoc später ein `EOF`. Heute fängt das **nichts**:
`control-bytes-guard.js` ist PostToolUse auf `Edit|Write` und sieht ein `git commit -m` nie,
`release-gate.js` matcht nur `homey app install|publish`.

Der Guard blockt genau die Delimiter-Reste, nicht `@` oder `EOF` allgemein — ein Commit-Text darf
`eslint@9` oder „EOF-Marker" enthalten. Getroffen wird nur eine Zeile, die **ausschließlich** aus
einem Delimiter besteht, plus die Heredoc-Einleitungen.

**Files:**
- Create: `.claude/hooks/commit-msg-guard.js`
- Create: `test/hooks/commit-msg-guard.test.js`
- Modify: `.claude/settings.json` (PreToolUse `Bash|PowerShell`)

**Interfaces:**
- Consumes: `logHook` aus `./lib/log` (Task 1).

- [ ] **Step 1: Failing test schreiben** — `test/hooks/commit-msg-guard.test.js` anlegen:

```js
'use strict';

// Smoke test for .claude/hooks/commit-msg-guard.js (PreToolUse Bash|PowerShell) — blocks
// `git commit -m` whose message carries a heredoc / PowerShell here-string delimiter, and
// points at `git commit -F <file>` instead. Two live incidents (/insights report 2026-08-21):
// a stray "@" and a stray "EOF" landed inside commit messages. Must not fire on legitimate
// text that merely contains "@" or the word EOF.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'commit-msg-guard.js');

/** @param {string} command @param {string} [raw] */
function runHook(command, raw) {
  const payload = raw !== undefined
    ? raw
    : JSON.stringify({ tool_name: 'Bash', cwd: process.cwd(), tool_input: { command } });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

test('commit-msg-guard: PowerShell here-string residue → BLOCK naming git commit -F', () => {
  const { code, err } = runHook('git commit -m "feat: thing\n@"');
  assert.strictEqual(code, 2);
  assert.match(err, /commit-msg-guard/);
  assert.match(err, /git commit -F/);
});

test('commit-msg-guard: lone @ line → BLOCK', () => {
  const { code } = runHook('git commit -m "feat: thing\n@\n"');
  assert.strictEqual(code, 2);
});

test('commit-msg-guard: heredoc EOF residue → BLOCK', () => {
  const { code } = runHook('git commit -m "fix: thing\nEOF"');
  assert.strictEqual(code, 2);
});

test('commit-msg-guard: heredoc introducer → BLOCK', () => {
  const { code } = runHook("git commit -m \"$(cat <<'EOF'\nfix: thing\nEOF\n)\"");
  assert.strictEqual(code, 2);
});

test('commit-msg-guard: @ inside legitimate text → PASS', () => {
  const { code, err } = runHook('git commit -m "chore: bump eslint@9 and node@22"');
  assert.strictEqual(code, 0, err);
});

test('commit-msg-guard: the word EOF inside legitimate text → PASS', () => {
  const { code, err } = runHook('git commit -m "fix(parser): handle EOF without trailing newline"');
  assert.strictEqual(code, 0, err);
});

test('commit-msg-guard: git commit -F → PASS (the recommended path)', () => {
  const { code, err } = runHook('git commit -F .git/COMMIT_MSG.tmp');
  assert.strictEqual(code, 0, err);
});

test('commit-msg-guard: non-commit command → PASS', () => {
  const { code } = runHook('echo "@" && cat <<EOF\nx\nEOF');
  assert.strictEqual(code, 0);
});

test('commit-msg-guard: malformed stdin → PASS (fail open)', () => {
  const { code } = runHook('', 'not json');
  assert.strictEqual(code, 0);
});
```

- [ ] **Step 2: Test laufen lassen, Rot verifizieren**

Run: `npx node --test test/hooks/commit-msg-guard.test.js`
Expected: FAIL — `Cannot find module '.../commit-msg-guard.js'`.

- [ ] **Step 3: `.claude/hooks/commit-msg-guard.js` implementieren**

```js
'use strict';

// PreToolUse hook (matcher: Bash|PowerShell) — blocks a `git commit` whose message was built
// with a heredoc or a PowerShell here-string, because twice the delimiter itself leaked into
// the message (/insights report 2026-08-21: a stray "@" forced two amends, a later stray "EOF"
// needed a force-push to fix). The reliable path on this Windows host is writing the message
// to a file and using `git commit -F <file>`.
//
// Deliberately narrow to keep false positives at zero: only a line consisting SOLELY of a
// delimiter counts, plus the heredoc introducers. "eslint@9" or the word EOF inside prose
// pass untouched. Pattern mirrors check-version-sync.js: fail open on our own errors,
// exit 2 only on a real finding.

const { logHook } = require('./lib/log');

// A line that is nothing but a delimiter: PowerShell here-string terminators/openers
// (@' '@ @" "@ and the bare @ that leaked in the live incident) or a heredoc EOF marker.
const DELIMITER_LINE = /^(?:@|@'|'@|@"|"@|EOF)$/;
// Heredoc introducers, quoted or not, with or without the dash form.
const HEREDOC_INTRO = /<<-?\s*(['"]?)EOF\1/;

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0); // can't parse -> fail open, don't block on our own error
  }

  const command = (input.tool_input && input.tool_input.command) || '';
  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0); // only care about commits
  }
  if (!/\s-m\b|\s-m["']|\s-am\b/.test(command)) {
    process.exit(0); // -F / interactive / amend-without-message -> nothing to inspect
  }

  const offenders = command.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => DELIMITER_LINE.test(line));
  if (HEREDOC_INTRO.test(command)) offenders.push('<<EOF');

  if (offenders.length === 0) {
    process.exit(0);
  }

  logHook('commit-msg-guard', 'block', input.cwd);
  console.error(
    'commit-msg-guard: this commit message is being built with a heredoc / PowerShell '
    + `here-string (found: ${[...new Set(offenders)].join(', ')}). Twice the delimiter itself `
    + 'leaked into the message on this host. Write the message to a file and commit with:\n'
    + '  git commit -F <file>\n'
    + '(build the file with Write or node -e, then delete it afterwards)'
  );
  process.exit(2);
});
```

- [ ] **Step 4: Test laufen lassen, Grün verifizieren**

Run: `npx node --test test/hooks/commit-msg-guard.test.js`
Expected: PASS (9 Tests).

- [ ] **Step 5: In `.claude/settings.json` verdrahten**

Im `PreToolUse`-Eintrag mit `"matcher": "Bash|PowerShell"` als weiteren Hook ergänzen (nach
`package-guard.js`):

```json
{ "type": "command", "command": "node .claude/hooks/commit-msg-guard.js" }
```

- [ ] **Step 6: Volle Suite + Commit**

Run: `npm test`
Expected: 382 Tests, 0 Failures.

```bash
git add .claude/hooks/commit-msg-guard.js test/hooks/commit-msg-guard.test.js .claude/settings.json
git commit -F .git/COMMIT_MSG.tmp
```

Message: `feat(hooks): commit-msg-guard gegen Heredoc-/Here-String-Reste in Commit-Messages`

---

### Task 4: handoff-notice — ungepushte Commits sichtbar machen (Tier 1 #3)

Belegt (`/insights` 2026-08-21): mehrere Sessions endeten mit ungepushten Branches, die der Nutzer
hinterherjagen musste; einmal unterblieb ein Release-Commit still. `stop-verify.js` prüft heute
Tests/validate, nicht den Push-Zustand.

Der Hook **pusht nicht** — CLAUDE.md §9 verlangt ein explizites Ja des Nutzers vor jedem Push. Er
macht den Zustand nur sichtbar. Ein Stop-Hook erreicht das Modell nur über `exit 2`; damit das nicht
bei jedem Turn-Ende feuert, merkt sich ein State-File die zuletzt gemeldete HEAD-SHA: gemeldet wird
einmal pro **neuem** Commit.

**Files:**
- Create: `.claude/hooks/handoff-notice.js`
- Create: `test/hooks/handoff-notice.test.js`
- Modify: `.claude/settings.json` (`Stop`)
- (`.gitignore` wurde bereits in Task 1 Step 7 vorbereitet)

- [ ] **Step 1: Failing test schreiben** — `test/hooks/handoff-notice.test.js` anlegen:

```js
'use strict';

// Smoke test for .claude/hooks/handoff-notice.js (Stop) — makes commits that exist only
// locally visible at turn end (/insights report 2026-08-21: several sessions ended with
// unpushed branches; one release commit was silently never made). It never pushes (CLAUDE.md
// §9 requires an explicit yes) and it reports once per new HEAD, not once per turn.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'handoff-notice.js');

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

/** A repo with one commit and no remote at all -> that commit is unpushed. */
function makeRepoWithLocalCommit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
  fs.mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'first']);
  return dir;
}

/** @param {string} cwd @param {boolean} [active] */
function runHook(cwd, active) {
  const payload = JSON.stringify({ cwd, stop_hook_active: active === true });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

test('handoff-notice: unpushed commit → BLOCK once, naming the count', () => {
  const dir = makeRepoWithLocalCommit();
  const { code, err } = runHook(dir);
  assert.strictEqual(code, 2);
  assert.match(err, /handoff-notice/);
  assert.match(err, /1 commit/);
});

test('handoff-notice: same HEAD a second time → PASS (reported once per new commit)', () => {
  const dir = makeRepoWithLocalCommit();
  assert.strictEqual(runHook(dir).code, 2);
  assert.strictEqual(runHook(dir).code, 0);
});

test('handoff-notice: a NEW commit after a report → BLOCK again', () => {
  const dir = makeRepoWithLocalCommit();
  assert.strictEqual(runHook(dir).code, 2);
  assert.strictEqual(runHook(dir).code, 0);
  fs.writeFileSync(path.join(dir, 'b.txt'), 'y');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'second']);
  assert.strictEqual(runHook(dir).code, 2);
});

test('handoff-notice: stop_hook_active → PASS (never loop)', () => {
  const dir = makeRepoWithLocalCommit();
  assert.strictEqual(runHook(dir, true).code, 0);
});

test('handoff-notice: not a git repo → PASS (fail open)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
  assert.strictEqual(runHook(dir).code, 0);
});

test('handoff-notice: malformed stdin → PASS (fail open)', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});
```

- [ ] **Step 2: Test laufen lassen, Rot verifizieren**

Run: `npx node --test test/hooks/handoff-notice.test.js`
Expected: FAIL — `Cannot find module '.../handoff-notice.js'`.

- [ ] **Step 3: `.claude/hooks/handoff-notice.js` implementieren**

```js
'use strict';

// Stop hook — makes commits that exist only locally visible before the turn ends
// (/insights report 2026-08-21: several sessions ended with unpushed branches the user had to
// chase, and one release commit was silently never made). A Stop hook can only reach the model
// via exit 2, so this blocks the turn end ONCE per new HEAD; a state file remembers the SHA it
// already reported, so a branch that stays unpushed does not re-fire every single turn.
//
// It never pushes: CLAUDE.md §9 requires an explicit yes from the user before any push. The
// hook's whole job is that the state cannot stay invisible. `git log HEAD --not --remotes`
// covers both cases at once — a branch with no upstream at all, and one that is merely ahead.
// Fail-open on our own errors, like the other gates.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { logHook } = require('./lib/log');

const STATE_FILE = ['.claude', 'hooks', '.handoff-notice-state.json'];

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0); // can't parse -> fail open
  }
  if (input.stop_hook_active === true) {
    process.exit(0); // already continuing because of a stop hook -> never loop
  }

  const cwd = input.cwd || process.cwd();
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (head.status !== 0 || typeof head.stdout !== 'string') {
    process.exit(0); // not a git repo / no commits yet -> nothing to report
  }
  const sha = head.stdout.trim();

  // Commits reachable from HEAD but from no remote ref: unpushed, whether or not an
  // upstream is configured.
  const unpushed = spawnSync('git', ['log', '--format=%h %s', 'HEAD', '--not', '--remotes'], { cwd, encoding: 'utf8' });
  if (unpushed.status !== 0 || typeof unpushed.stdout !== 'string') {
    process.exit(0); // fail open
  }
  const commits = unpushed.stdout.split('\n').filter(Boolean);
  if (commits.length === 0) {
    process.exit(0); // everything is on a remote -> nothing to say
  }

  const statePath = path.join(cwd, ...STATE_FILE);
  let reported = null;
  try {
    reported = JSON.parse(fs.readFileSync(statePath, 'utf8')).notifiedHead;
  } catch {
    // no state yet -> first report
  }
  if (reported === sha) {
    process.exit(0); // already said this for this exact HEAD
  }
  try {
    fs.writeFileSync(statePath, `${JSON.stringify({ notifiedHead: sha })}\n`);
  } catch {
    // state is a convenience, not a correctness requirement -> report anyway
  }

  const branch = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' });
  const where = (branch.stdout || '').trim() || 'HEAD (detached)';
  logHook('handoff-notice', 'block', cwd);
  console.error(
    `handoff-notice: ${commits.length} commit(s) on "${where}" exist only locally:\n`
    + `${commits.map((c) => `  ${c}`).join('\n')}\n`
    + 'Tell the user this before ending the turn and ask how to proceed (CLAUDE.md §9: '
    + 'run /code-review, then ask push-to-main vs. PR). Do NOT push on your own.'
  );
  process.exit(2);
});
```

- [ ] **Step 4: Test laufen lassen, Grün verifizieren**

Run: `npx node --test test/hooks/handoff-notice.test.js`
Expected: PASS (6 Tests).

- [ ] **Step 5: In `.claude/settings.json` verdrahten**

Im `Stop`-Array als zweiten Hook neben `stop-verify.js` ergänzen:

```json
{ "type": "command", "command": "node .claude/hooks/handoff-notice.js" }
```

- [ ] **Step 6: Volle Suite + Commit**

Run: `npm test`
Expected: 388 Tests, 0 Failures.

```bash
git add .claude/hooks/handoff-notice.js test/hooks/handoff-notice.test.js .claude/settings.json
git commit -F .git/COMMIT_MSG.tmp
```

Message: `feat(hooks): handoff-notice meldet ungepushte Commits einmal pro HEAD`

---

### Task 5: Tier-2-Prozessregeln (CLAUDE.md, HOMEY.md, Checkpoint-Skill)

Vier belegte Lücken, alle als Prosa-Regel (Codifizierungs-Ebene b) — mechanisch nicht prüfbar.

**Files:**
- Modify: `CLAUDE.md` (§4, §7, §9)
- Modify: `HOMEY.md` (Release-Checkliste)
- Modify: `.claude/skills/milestone-checkpoint/SKILL.md` (Schritt 7a, Bericht)

- [ ] **Step 1: CLAUDE.md §4 — Iterationsbudget, Bisect-Fallback, Suppression-Offenlegung, CRLF**

In §4 „Goal-Driven Execution" nach dem Absatz „Known defects are frozen immediately …" anfügen:

```markdown
Beim Rot-nach-Grün-Iterieren gilt ein **Budget**: bleibt die Suite nach ~10 Runden rot, hör auf zu
probieren — `git bisect` auf den einführenden Commit und Bericht statt weiterer Versuche. Und lege
am Ende **explizit offen, was durch Unterdrückung statt durch Verstehen behoben wurde** (Timeout
hochgesetzt, Test übersprungen, Warnung stummgeschaltet) — ein solcher Fix ist ein gültiges
Zwischenergebnis, aber nur, wenn er als solcher benannt ist.

Zähl- und Grep-Checks auf Repo-Dateien müssen **CRLF-sicher** sein (Windows-Checkout): ein
`sed`/`grep`-Muster mit `$`-Anker zählt auf CRLF-Dateien still Null — und eine stille Null liest
sich wie „sauber". Beobachtet 2026-07 bei der CI-Hang-Untersuchung.
```

- [ ] **Step 2: CLAUDE.md §4 — rAF-Regel**

Im selben Abschnitt anfügen:

```markdown
Generierte Visualisierungen sind per Default **statisch/vorberechnet**. Eine
`requestAnimationFrame`-/`setInterval`-Schleife ohne explizite Abbruchbedingung oder Frame-Cap geht
nicht raus — eine solche Schleife hat 2026-07 die CPU des Nutzers auf 100 % genagelt.
```

- [ ] **Step 3: CLAUDE.md §7 — „verifiziert vs. angenommen" in Resume-Prompts und Berichten**

In §7 in der Liste **Rules:** nach dem Punkt „Resume prompts state the **goal and the
machine-checkable done condition** …" einfügen:

```markdown
- Jeder Abschlussbericht und jeder Handover endet mit zwei Zeilen: **was tatsächlich ausgeführt und
  verifiziert wurde** (mit dem Kommando/Ergebnis) und **was angenommen wurde**, ohne es zu prüfen.
  Das ist die einzige Reibungsklasse, die im `/insights`-Report 2026-08-21 als „dissatisfied"
  auftaucht — unverifizierte Fertigmeldungen, nicht Bugs.
```

- [ ] **Step 4: CLAUDE.md §9 — Review-Linsen in den `/code-review`-Schritt hängen**

In §9 „Finishing: review, then ask", Punkt 1, den Satz „Proactively start `/code-review` on the diff
against the base branch — don't wait to be asked." ersetzen durch:

```markdown
1. Proactively start `/code-review` on the diff against the base branch — don't wait to be asked.
   Berührt der Diff Laufzeit-Ressourcen (Timer, Listener, Handles), einen HTTP-/API-Aufruf oder
   plattformabhängige Pfade/Shell-Aufrufe, dazu **parallel** die passenden Linsen-Agents aus
   `.claude/agents/` laufen lassen (`runtime-resource-reviewer`, `api-contract-reviewer`,
   `cross-platform-reviewer` — `superpowers:dispatching-parallel-agents` für den Fan-out). Grund:
   16 der Reibungsereignisse im `/insights`-Report 2026-08-21 waren Bugs, die erst beim manuellen
   Testen des Nutzers auffielen — genau diese drei Klassen. Nicht betroffene Linsen weglassen.
```

- [ ] **Step 5: HOMEY.md — generierte Store-Assets vor dem Commit ansehen**

In der Release-Checkliste nach Punkt 4 einfügen und die Folgenummern anpassen (5 → 6, 6 → 7):

```markdown
5. Generierte/geänderte Bild-Assets (App-Icon, Store-Images) **in Zielgröße rendern und ansehen**,
   bevor sie committet werden — Icon und Store-Image mussten 2026-07 je einmal nach dem Commit
   nachgebessert werden, weil der Defekt erst in der Store-Vorschau sichtbar war.
```

- [ ] **Step 6: Checkpoint-Skill Schritt 7a — Spiegel-Tabelle statt Gedächtnis**

In `.claude/skills/milestone-checkpoint/SKILL.md`, Abschnitt „### 7a: Drift Projekt → Framework
(M4.9)", am Ende anfügen:

```markdown
**Vor dem Editieren eine Tabelle zeigen, nicht aus dem Gedächtnis spiegeln.** Zweimal ging genau
hier ein Teil verloren (ein M9-Checkpoint, ein veralteter M2.1-Prompt). Also: erst jede betroffene
Datei über alle beteiligten Repos hinweg als Tabelle auflisten —
`Repo | Pfad | Ist-Zustand | Soll-Zustand` — dann editieren, dann die Tabelle erneut aufstellen und
zeigen, dass jede Zeile jetzt konsistent ist. Die zweite Tabelle ist der Nachweis; ohne sie ist die
Spiegelung eine Behauptung.
```

- [ ] **Step 7: Checkpoint-Skill „## Bericht" — Verifikationszeile**

Am Ende des Abschnitts „## Bericht" anfügen:

```markdown
Der Bericht endet mit zwei Zeilen (CLAUDE.md §7): **verifiziert** — was in dieser Session
tatsächlich ausgeführt wurde, mit Kommando/Ergebnis — und **angenommen** — was ungeprüft
übernommen wurde. Ein Schritt, den ein unbeaufsichtigter Lauf übersprungen hat (z. B. `/doctor`),
gehört in die zweite Zeile, nicht stillschweigend in die erste.
```

- [ ] **Step 8: Commit**

Run: `npm test` (Doku-Änderung, muss unverändert grün bleiben)
Expected: 388 Tests, 0 Failures.

```bash
git add CLAUDE.md HOMEY.md .claude/skills/milestone-checkpoint/SKILL.md
git commit -F .git/COMMIT_MSG.tmp
```

Message: `docs: Tier-2-Regeln aus /insights-Report (Iterationsbudget, Verifikationszeile, CRLF, Assets)`

---

### Task 6: Drei Review-Linsen als Agents (Tier 3)

16 Reibungsereignisse der Klasse „buggy_code" fielen erst beim manuellen Testen des Nutzers auf:
eine unbegrenzte `requestAnimationFrame`-Schleife, ein 400er durch fehlenden `Content-Type`, ein
Mutations-Bug aus einer Subagent-Implementierung. Das Muster existiert im Repo bereits
(`security-reviewer`, `write-path-security-reviewer`); es fehlen die Nicht-Security-Linsen.

Frontmatter folgt CLAUDE.md §11: Review-/Judge-Agents bekommen **kein** `model:` — sie erben die
Session (in einer Flagship-Session also das Flagship; das ist der Zweck, kein Kostenfehler).

**Files:**
- Create: `.claude/agents/runtime-resource-reviewer.md`
- Create: `.claude/agents/api-contract-reviewer.md`
- Create: `.claude/agents/cross-platform-reviewer.md`

- [ ] **Step 1: `runtime-resource-reviewer.md` anlegen**

```markdown
---
name: runtime-resource-reviewer
description: Review a diff for runtime-resource defects — unbounded loops, unthrottled timers/rAF, unclosed listeners, handles and servers, unbounded memory growth. Use in parallel with /code-review (CLAUDE.md §9) whenever a diff touches timers, listeners, sockets or long-lived state.
tools: Read, Bash, Grep
---

Du prüfst einen Diff auf **Laufzeit-Ressourcen-Defekte** — nur Bericht, keine Änderungen.
Basis: `git diff origin/main...HEAD` (bzw. der Working-Tree, wenn nichts committet ist).

Diese Linse existiert wegen zweier belegter Vorfälle: eine `requestAnimationFrame`-Schleife ohne
Abbruchbedingung hat die CPU des Nutzers auf 100 % genagelt, und ein geleakter NOTIFY-Listener hat
den nächtlichen CI-Lauf hängen lassen, bis er per Timeout starb. Beide waren im Diff sichtbar.

Melde je Fund **Datei:Zeile · Mechanismus · was konkret passiert · Fix** und ordne ein als
**BLOCKING / SHOULD-FIX / NIT**. Findest du nichts, sag das in einem Satz — kein Füllmaterial.

1. **Endlos-/Dauerschleifen** — `requestAnimationFrame`, `setInterval`, `setTimeout`-Ketten,
   `while (true)`, rekursive `setImmediate`. Jede braucht eine explizite Abbruchbedingung, einen
   Frame-/Iterations-Cap oder ein Cleanup. Eine Animation, die nur läuft, um zu laufen, ist
   statisch vorzuberechnen.
2. **Nicht abgeräumte Listener und Handles** — `addEventListener`/`on(...)` ohne
   `removeEventListener`/`off`/`once`, `server.listen` ohne `close`, offene Sockets, `fs.watch`,
   Timer ohne `clearInterval`/`clearTimeout`. Achte besonders auf Pfade, die pro Gerät, pro
   Verbindung oder pro Reconnect erneut registrieren — dort multipliziert sich der Leak.
3. **Lebenszyklus-Symmetrie** — zu jedem `onInit`/`connect`/`subscribe` gehört ein
   `onDeleted`/`onUninit`/`disconnect`/`unsubscribe`. Fehlt die Gegenseite, nenne sie.
4. **Unbegrenztes Wachstum** — Arrays/Maps/Caches, die nur wachsen; Logpuffer ohne Rotation;
   akkumulierte Response-Bodies. Gibt es eine Obergrenze, und was passiert an ihr?
5. **Blockierende Arbeit im Hot Path** — synchrone Datei-/Netz-/Krypto-Operationen in einem
   Handler, der pro Event läuft.
6. **Test-Nachweis** — deckt ein Test den Cleanup-Pfad ab (Listener nach `onDeleted` weg, Timer
   gestoppt)? Wenn nein, sag welchen Test es bräuchte.
```

- [ ] **Step 2: `api-contract-reviewer.md` anlegen**

```markdown
---
name: api-contract-reviewer
description: Review a diff for HTTP/API contract defects — missing or wrong headers, Content-Type, auth, status-code assumptions, error handling, encoding and timeout gaps. Use in parallel with /code-review (CLAUDE.md §9) whenever a diff touches fetch/http calls or a request handler.
tools: Read, Bash, Grep
---

Du prüfst einen Diff auf **API-Vertragsfehler** — nur Bericht, keine Änderungen.
Basis: `git diff origin/main...HEAD` (bzw. der Working-Tree).

Diese Linse existiert, weil ein fehlender `Content-Type`-Header live einen 400er erzeugt hat, der
erst beim manuellen Testen auffiel, und weil an anderer Stelle ein Cloud-Endpunkt benutzt wurde,
wo eine lokale API existierte (Rate-Limit statt Antwort).

Melde je Fund **Datei:Zeile · welche Annahme · was der Server tatsächlich verlangt/liefert · Fix**,
eingeordnet als **BLOCKING / SHOULD-FIX / NIT**. Nichts gefunden → ein Satz.

1. **Request-Header** — hat jeder Body-tragende Request einen passenden `Content-Type`? Stimmt er
   mit dem tatsächlich gesendeten Body überein (JSON vs. Form vs. Text)? Fehlt `Accept`, wo der
   Server sonst etwas anderes liefert?
2. **Auth** — sitzt das Credential im Header und nicht in URL/Query? Wird ein Pfad, der **kein**
   Auth braucht, unnötig mit Credentials belastet (und umgekehrt)?
3. **Status-Annahmen** — wird nur auf `res.ok` geprüft, obwohl 204/206/302 anders behandelt werden
   müssen? Wird ein Nicht-2xx still verschluckt? Wird ein Fehlertext als Erfolgspayload geparst?
4. **Fehlerpfade** — Netzwerkfehler, Timeout, abgebrochene Verbindung, ungültiges JSON: hat jeder
   dieser vier Fälle einen definierten Ausgang? Gibt es überhaupt ein Timeout?
5. **Encoding** — werden Query-/Pfadsegmente kodiert (`encodeURIComponent`) statt konkateniert?
   Werden Umlaute/Sonderzeichen im Body korrekt kodiert?
6. **Lokal vor Cloud** — existiert für den benutzten Endpunkt eine lokale/on-device-Entsprechung?
   Wenn ja, nenne sie; Cloud-Endpunkte bringen Rate-Limits und Ausfälle mit.
7. **Test-Nachweis** — prüft ein Test den Header/Status wirklich, oder nur den Happy-Path-Body?
```

- [ ] **Step 3: `cross-platform-reviewer.md` anlegen**

```markdown
---
name: cross-platform-reviewer
description: Review a diff for cross-platform defects on a Windows host — CRLF assumptions, path separators, /tmp vs. OS temp, file locks, shell quoting and heredoc/here-string hazards. Use in parallel with /code-review (CLAUDE.md §9) whenever a diff touches paths, shell invocations, file I/O or text parsing.
tools: Read, Bash, Grep
---

Du prüfst einen Diff auf **Plattform-Annahmen**, die auf dem Windows-Host dieses Projekts brechen —
nur Bericht, keine Änderungen. Basis: `git diff origin/main...HEAD` (bzw. der Working-Tree).

Diese Linse existiert, weil CRLF still einen `sed`-Zähler auf Null gesetzt hat (die stille Null las
sich wie „sauber"), weil `/tmp`-Pfade zwischen Bash- und Windows-Sicht auseinanderliefen und weil
gesperrte Verzeichnisse durch laufende `node --test --watch`-Prozesse Cleanups blockiert haben.

Melde je Fund **Datei:Zeile · welche Plattformannahme · wo sie bricht · Fix**, eingeordnet als
**BLOCKING / SHOULD-FIX / NIT**. Nichts gefunden → ein Satz.

1. **Zeilenenden** — jedes `split('\n')`, jeder Regex mit `$`-Anker, jeder Zeilenvergleich auf
   Repo-Dateien: bricht er bei CRLF? Bevorzugt `split(/\r?\n/)` und `trim()`. Besonders kritisch
   sind **Zähl**-Checks: eine still gezählte Null wird als Erfolg gelesen.
2. **Pfade** — hartkodierte `/`-Separatoren, String-Konkatenation statt `path.join`,
   Groß-/Kleinschreibungsannahmen, `/tmp` statt `os.tmpdir()`.
3. **Datei-Locks** — löscht/verschiebt der Code Verzeichnisse, die ein laufender Prozess offen
   halten könnte? Unter Windows scheitert das, statt zu warten. Gibt es einen Retry/eine Prüfung?
4. **Shell-Aufrufe** — Quoting, das nur in bash oder nur in PowerShell funktioniert; `&&`/`||`;
   Umgebungsvariablen-Präfixe (`VAR=x cmd` gibt es in PowerShell nicht); `2>/dev/null`.
5. **Heredoc/Here-String** — mehrzeilige Strings, die per `<<EOF` oder `@'…'@` gebaut werden: der
   Delimiter ist hier schon zweimal in den Inhalt geleakt. Datei + `-F`/`Write` ist der sichere Weg.
6. **Zeilenenden im Repo** — erzeugt oder normalisiert die Änderung Dateien so, dass `git status`
   sie dauerhaft als geändert sieht? Prüfe `.gitattributes` mit.
```

- [ ] **Step 4: Commit**

Run: `npm test`
Expected: 388 Tests, 0 Failures.

```bash
git add .claude/agents/runtime-resource-reviewer.md .claude/agents/api-contract-reviewer.md .claude/agents/cross-platform-reviewer.md
git commit -F .git/COMMIT_MSG.tmp
```

Message: `feat(agents): drei Review-Linsen (Runtime-Resource, API-Contract, Cross-Platform)`

---

### Task 7: Framework-Spiegelung (CLAUDE.md „Framework-Artefakte")

Generisch (jedes Projekt) sind: `lib/log.js`, `lib/env-ready.js`, `test-gate.js`,
`commit-msg-guard.js`, `handoff-notice.js`, die drei Review-Agents, die CLAUDE.md-§4/§7/§9-Regeln,
die Checkpoint-Schritte 5/7a/Bericht und die `settings.json`-Verdrahtung.
Projekt-spezifisch bleiben: `stop-verify.js` (existiert im Framework nicht — als Drift-Notiz im
CHANGELOG vermerken, nicht mitportieren) und die HOMEY.md-Asset-Regel (Homey-Store).

**Files (im Repo `C:/Users/TorstenSturm/source/repos/skill-agentic-loop-framework`):**
- Modify: `plugin/skills/agentic-loop-framework/templates/.claude/hooks/lib/log.js`
- Create: `plugin/skills/agentic-loop-framework/templates/.claude/hooks/lib/env-ready.js`
- Modify: `plugin/skills/agentic-loop-framework/templates/.claude/hooks/test-gate.js`
- Create: `plugin/skills/agentic-loop-framework/templates/.claude/hooks/commit-msg-guard.js`
- Create: `plugin/skills/agentic-loop-framework/templates/.claude/hooks/handoff-notice.js`
- Create: `plugin/skills/agentic-loop-framework/templates/test/hooks/{env-ready,commit-msg-guard,handoff-notice}.test.js`
- Modify: `plugin/skills/agentic-loop-framework/templates/test/hooks/test-gate.test.js`
- Create: `plugin/skills/agentic-loop-framework/templates/.claude/agents/{runtime-resource,api-contract,cross-platform}-reviewer.md`
- Modify: `plugin/skills/agentic-loop-framework/templates/.claude/settings.json`
- Modify: `plugin/skills/agentic-loop-framework/templates/CLAUDE.md`
- Modify: `plugin/skills/agentic-loop-framework/templates/.claude/skills/milestone-checkpoint/SKILL.md`
- Modify: `plugin/skills/agentic-loop-framework/CHANGELOG.md`

- [ ] **Step 1: Ist/Soll-Tabelle aufstellen (die Regel aus Task 5 Step 6 gilt ab sofort)**

Vor jeder Änderung eine Tabelle `Repo | Pfad | Ist | Soll` über alle oben gelisteten Dateien
ausgeben. `templates/test/hooks/hook-log.test.js` existiert dort **nicht** — prüfen und in der
Tabelle als „fehlt im Framework" führen, statt es stillschweigend zu übergehen.

- [ ] **Step 2: Dateien spiegeln**

Neue Hooks/Agents/Tests 1:1 kopieren; bei `log.js`, `test-gate.js`, `settings.json`,
`CLAUDE.md` und `milestone-checkpoint/SKILL.md` nur die in Task 1–6 beschriebenen Hunks übertragen.
Projektspezifische Bezüge beim Kopieren entfernen: kein `homey app validate`, kein Violet-Bezug,
keine konkreten Milestone-IDs. Die `/insights`-Datumsbezüge bleiben als Herkunftsnachweis stehen.

- [ ] **Step 3: Framework-Suite laufen lassen**

Run (im Framework-Repo): `npm test --prefix plugin/skills/agentic-loop-framework/templates`
Expected: grün. Schlägt sie fehl, weil `templates/` keine eigene Suite-Verdrahtung hat, das im
CHANGELOG als bekannte Lücke vermerken statt zu erzwingen.

- [ ] **Step 4: CHANGELOG-Eintrag**

In `plugin/skills/agentic-loop-framework/CHANGELOG.md` einen Eintrag ergänzen, der nennt: die drei
neuen/geänderten Hooks, den `env-ready`-Helper, die drei Review-Agents, die CLAUDE.md-Regeln, die
Checkpoint-Änderungen, die Herkunft (`/insights`-Report 2026-08-21) und die bewusst **nicht**
gespiegelte Änderung an `stop-verify.js` (Hook existiert dort nicht).

- [ ] **Step 5: Ist/Soll-Tabelle erneut aufstellen und Konsistenz zeigen**

- [ ] **Step 6: Commit im Framework-Repo (kein Push ohne Freigabe, CLAUDE.md §9)**

```bash
git add -A
git commit -F .git/COMMIT_MSG.tmp
```

Message: `feat: Insights-Hardening spiegeln (env-ready, commit-msg-guard, handoff-notice, 3 Review-Linsen)`

---

## Verifikation vor „fertig" (CLAUDE.md §0)

- [ ] `npm test` im Worktree: 388 Tests, 0 Failures
- [ ] `npx homey app validate` unverändert grün (keine App-Datei angefasst — Beleg statt Annahme)
- [ ] Jeder neue Hook ist in `.claude/settings.json` verdrahtet und hat einen Smoke-Test
- [ ] `hook-log.jsonl` im primären Checkout enthält 0 Blocks vor `2026-07-15T13:28:29`
- [ ] `/code-review` gegen `main` gelaufen (CLAUDE.md §9), Ergebnis dem Nutzer vorgelegt
- [ ] Abschlussbericht nennt getrennt: **verifiziert** vs. **angenommen**
