'use strict';

// Smoke test for .claude/hooks/test-gate.js (PreToolUse Bash) — the gate blocks
// `git commit` (exit 2) while the guarded project's own test suite
// (package.json scripts.test) is red, passes green suites and non-commit
// commands, and fails open (exit 0) on its own errors — M4.6 spec §3
// (docs/superpowers/specs/2026-07-08-m4.6-loop-hardening-gates-ci.md).
// Mirrors typecheck-gate.test.js (incl. parallel kick-off of the two
// suite-running cases to stay inside the §6 wall-time cap from M4.5).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'test-gate.js');

// Throwaway project whose scripts.test runs node:test on one tiny file.
// `srcText` decides red vs green. No node_modules needed (node:test is builtin).
/** @param {string} srcText */
function makeProject(srcText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gate-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture', version: '0.0.0', scripts: { test: 'node --test' },
  }));
  fs.writeFileSync(path.join(dir, 'src.test.js'), srcText);
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

// Async variant for the two suite-running cases: both are kicked off at module
// load so their child `node --test` runs overlap instead of serializing (§6 cap).
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

const RED_SRC = "'use strict';\nconst { test } = require('node:test');\nconst assert = require('node:assert');\ntest('red', () => { assert.strictEqual(1, 2); });\n";
const GREEN_SRC = "'use strict';\nconst { test } = require('node:test');\nconst assert = require('node:assert');\ntest('green', () => { assert.strictEqual(1, 1); });\n";

const redRun = runHookAsync('git commit -m "x"', makeProject(RED_SRC));
const greenRun = runHookAsync('git commit -m "x"', makeProject(GREEN_SRC));

test('test-gate: git commit with red suite → BLOCK with test output', async () => {
  const { code, err } = await redRun;
  assert.strictEqual(code, 2, err);
  assert.match(err, /test-gate/);
  assert.match(err, /fail(ing|ed)?|✖|not ok/i); // the suite result must reach the model as fix guidance
});

test('test-gate: git commit with green suite → PASS', async () => {
  const { code, err } = await greenRun;
  assert.strictEqual(code, 0, err);
});

test('test-gate: non-commit command → PASS without running the suite', () => {
  const dir = makeProject(RED_SRC); // red on purpose: must not even be looked at
  const { code } = runHook('git status', dir);
  assert.strictEqual(code, 0);
});

test('test-gate: repo without package.json → PASS (not ours to gate)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gate-'));
  const { code } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 0);
});

test('test-gate: package.json without scripts.test → PASS (fail-open)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gate-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.0' }));
  const { code } = runHook('git commit -m "x"', dir);
  assert.strictEqual(code, 0);
});

test('test-gate: malformed stdin → PASS (fail-open)', () => {
  const { code } = runHook(null, undefined, 'not json{');
  assert.strictEqual(code, 0);
});
