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
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'typecheck-gate.js');
const REPO_NODE_MODULES = path.join(__dirname, '..', '..', 'node_modules');

// Throwaway project with a one-file checker config. `srcText` decides red vs green.
// node_modules is junction-linked to this repo's so the checker resolves without a
// per-test npm install (junction: works without admin rights on Windows).
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

function runHook(command, cwd, raw) {
  const payload = raw !== undefined
    ? raw
    : JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

const RED_SRC = "'use strict';\n/** @type {number} */\nconst n = 'not a number';\nmodule.exports = n;\n";
const GREEN_SRC = "'use strict';\n/** @type {number} */\nconst n = 1;\nmodule.exports = n;\n";

test('typecheck-gate: git commit with red typecheck → BLOCK with tsc output', () => {
  const dir = makeProject(RED_SRC);
  const { code, err } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 2, err);
  assert.match(err, /src\.js/); // the tsc finding must reach the model as fix guidance
});

test('typecheck-gate: git commit with green typecheck → PASS', () => {
  const dir = makeProject(GREEN_SRC);
  const { code, err } = runHook('git commit -m "x"', dir);
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

test('typecheck-gate: typescript not resolvable → PASS (fail-open)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-gate-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.checkjs.json'), '{}');
  const { code } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 0);
});

test('typecheck-gate: malformed stdin → PASS (fail-open)', () => {
  const { code } = runHook(null, undefined, 'not json{');
  assert.strictEqual(code, 0);
});
