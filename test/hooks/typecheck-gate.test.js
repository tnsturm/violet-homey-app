'use strict';

// Smoke test for .claude/hooks/typecheck-gate.js (PreToolUse Bash) — the gate blocks
// `git commit` (exit 2) while `tsc -p tsconfig.checkjs.json` is red in the guarded
// project, passes green projects and non-commit commands, and fails open (exit 0) on
// its own errors (malformed stdin, no checker config, no typescript install) — M4.5
// eval doc §4A "Commit-Gate". Mirrors the compose-guard/json-guard hook tests.
// Assumes devDependencies are installed (node_modules/typescript-checkjs present,
// the alias — eval doc §1 Nachtrag).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'typecheck-gate.js');
const REPO_NODE_MODULES = path.join(__dirname, '..', '..', 'node_modules');

// Throwaway project with a one-file checker config. `srcText` decides red vs green.
// node_modules is junction-linked to this repo's so the checker resolves without a
// per-test npm install (junction: works without admin rights on Windows).
/** @param {string} srcText */
function makeProject(srcText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-gate-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.checkjs.json'), JSON.stringify({
    compilerOptions: { allowJs: true, checkJs: true, noEmit: true, strict: false, types: [] },
    include: ['src.js'],
  }));
  fs.writeFileSync(path.join(dir, 'src.js'), srcText);
  fs.symlinkSync(REPO_NODE_MODULES, path.join(dir, 'node_modules'), 'junction');
  return dir;
}

/** @param {*} command @param {string} [cwd] @param {string} [raw] */
function runHook(command, cwd, raw) {
  const payload = raw !== undefined
    ? raw
    : JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

// Async variant for the two tsc-running cases: both are kicked off at module load
// so their ~1,7 s tsc runs overlap instead of serializing — keeps the whole suite
// inside the §6 wall-time cap (2 × B_test); measured 8,81 s vs cap 8,86 s serial.
/** @param {string} command @param {string} cwd */
function runHookAsync(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, err: err.trim() }));
    child.stdin.end(JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } }));
  });
}

const RED_SRC = "'use strict';\n/** @type {number} */\nconst n = 'not a number';\nmodule.exports = n;\n";
const GREEN_SRC = "'use strict';\n/** @type {number} */\nconst n = 1;\nmodule.exports = n;\n";

const redRun = runHookAsync('git commit -m "x"', makeProject(RED_SRC));
const greenRun = runHookAsync('git commit -m "x"', makeProject(GREEN_SRC));

test('typecheck-gate: git commit with red typecheck → BLOCK with tsc output', async () => {
  const { code, err } = await redRun;
  assert.strictEqual(code, 2, err);
  assert.match(err, /src\.js/); // the tsc finding must reach the model as fix guidance
});

test('typecheck-gate: git commit with green typecheck → PASS', async () => {
  const { code, err } = await greenRun;
  assert.strictEqual(code, 0, err);
});

test('typecheck-gate: non-commit command → PASS without running tsc', () => {
  const dir = makeProject(RED_SRC); // red on purpose: must not even be looked at
  const { code } = runHook('git status', dir);
  assert.strictEqual(code, 0);
});

test('typecheck-gate: repo without tsconfig.checkjs.json → PASS (not ours to gate)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-gate-'));
  const { code } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 0);
});

test('typecheck-gate: typescript not resolvable → PASS (fail-open), aber SICHTBAR', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-gate-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.checkjs.json'), '{}');
  const { code, err } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 0);
  // Checkpoint-Retro 2026-08-30: ein stilles exit 0 ist von "lief und war gruen"
  // nicht unterscheidbar. Der Fail-open-Pfad MUSS sagen, dass nichts geprueft wurde.
  assert.match(err, /Nothing was verified/);
});

test('typecheck-gate: declared deps but no node_modules → SKIP, sichtbar und nicht blockierend', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-gate-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.checkjs.json'), '{}');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'x', devDependencies: { 'typescript-checkjs': 'npm:typescript@^6.0.3' },
  }));
  // kein node_modules -> toolchainMissing() beweist den Grund vor jedem Aufloesungsversuch
  const { code, err } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 0, 'darf nicht blockieren: nichts wurde geprueft, nichts ist widerlegt');
  assert.match(err, /node_modules is missing/);
  assert.match(err, /Nothing was verified/);
});

test('typecheck-gate: malformed stdin → PASS (fail-open)', () => {
  const { code } = runHook(null, undefined, 'not json{');
  assert.strictEqual(code, 0);
});
