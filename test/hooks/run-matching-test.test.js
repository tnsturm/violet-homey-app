'use strict';

// First smoke test for .claude/hooks/run-matching-test.js (PostToolUse Edit|Write)
// — the hook runs the matching test file after a source edit: lib/<Name>.js →
// test/<Name>.test.js (existing behaviour) and drivers/<id>/<file>.js →
// test/drivers/<id>.<file>.test.js (M4.7 spec §3 D5,
// docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md).
// Always exit 0 (PostToolUse can't block) — assertions read the hook's stdout
// for TAP evidence that the mapped suite actually ran.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'run-matching-test.js');

const GREEN = "'use strict';\nconst { test } = require('node:test');\ntest('fixture-marker', () => {});\n";

// Project with one lib module + one driver file and their mapped green tests.
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-matching-'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.mkdirSync(path.join(dir, 'drivers', 'pool'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test', 'drivers'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lib', 'Foo.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'drivers', 'pool', 'device.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'test', 'Foo.test.js'), GREEN);
  fs.writeFileSync(path.join(dir, 'test', 'drivers', 'pool.device.test.js'), GREEN);
  return dir;
}

/** @param {string} filePath @param {string} cwd */
function runHook(filePath, cwd) {
  const payload = JSON.stringify({ tool_name: 'Edit', cwd, tool_input: { file_path: filePath } });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// Async variant for the two grandchild-spawning cases: kicked off at module load
// so their `node --test` runs overlap instead of serializing (suite wall-time cap).
/** @param {string} filePath @param {string} cwd */
function runHookAsync(filePath, cwd) {
  return new Promise((resolve) => {
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(JSON.stringify({ tool_name: 'Edit', cwd, tool_input: { file_path: filePath } }));
  });
}

const libDir = makeProject();
const libRun = runHookAsync(path.join(libDir, 'lib', 'Foo.js'), libDir);
const drvDir = makeProject();
const drvRun = runHookAsync(path.join(drvDir, 'drivers', 'pool', 'device.js'), drvDir);

test('run-matching-test: lib edit runs test/<Name>.test.js', async () => {
  const { code, out } = await libRun;
  assert.strictEqual(code, 0);
  assert.match(out, /fixture-marker/);
});

test('run-matching-test: driver edit runs test/drivers/<id>.<file>.test.js', async () => {
  const { code, out } = await drvRun;
  assert.strictEqual(code, 0);
  assert.match(out, /fixture-marker/);
});

test('run-matching-test: no mapped test file → quiet PASS', () => {
  const dir = makeProject();
  fs.rmSync(path.join(dir, 'test', 'Foo.test.js'));
  const { code, out } = runHook(path.join(dir, 'lib', 'Foo.js'), dir);
  assert.strictEqual(code, 0);
  assert.doesNotMatch(out, /fixture-marker/);
});

test('run-matching-test: non-source file → quiet PASS', () => {
  const dir = makeProject();
  const { code, out } = runHook(path.join(dir, 'docs', 'x.md'), dir);
  assert.strictEqual(code, 0);
  assert.doesNotMatch(out, /fixture-marker/);
});

test('run-matching-test: malformed stdin → PASS (fail-open)', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json{', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});
