'use strict';

// Smoke test for .claude/hooks/stop-verify.js (Stop event) — the hook blocks a
// turn from ENDING (exit 2) while lib/, drivers/ or .homeycompose/ files are
// modified AND the suite (or validate) is red; passes clean worktrees, green
// suites, honours stop_hook_active (infinite-loop protection) and fails open on
// its own errors — M4.7 spec §5 D9/D10
// (docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md).
// Fixtures have NO .homeycompose, so the npx-validate branch never runs here
// (no CLI download in tests, CI-safe); the short-circuit cases prove skipping
// via a COMMITTED red suite that must not even run.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'stop-verify.js');

const GREEN = "'use strict';\nconst { test } = require('node:test');\ntest('g', () => {});\n";
const RED = "'use strict';\nconst { test } = require('node:test');\nconst assert = require('node:assert');\ntest('r', () => { assert.strictEqual(1, 2); });\n";

// Committed baseline repo: package.json + suite + lib/a.js, clean tree.
function makeRepo({ suite }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-verify-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture', version: '0.0.0', scripts: { test: 'node --test' },
  }));
  fs.writeFileSync(path.join(dir, 'src.test.js'), suite);
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'module.exports = 1;\n');
  const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A']);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init']);
  return dir;
}

function runHook(cwd, extra, raw) {
  const payload = raw !== undefined ? raw : JSON.stringify({ cwd, stop_hook_active: false, ...extra });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

function runHookAsync(cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, err: err.trim() }));
    child.stdin.end(JSON.stringify({ cwd, stop_hook_active: false }));
  });
}

// The two suite-running cases, kicked off in parallel at module load (wall-time cap).
const redDir = makeRepo({ suite: RED });
fs.appendFileSync(path.join(redDir, 'lib', 'a.js'), '// dirty\n');
const redRun = runHookAsync(redDir);

const greenDir = makeRepo({ suite: GREEN });
fs.appendFileSync(path.join(greenDir, 'lib', 'a.js'), '// dirty\n');
const greenRun = runHookAsync(greenDir);

test('stop-verify: dirty lib/ + red suite → BLOCK the stop with output', async () => {
  const { code, err } = await redRun;
  assert.strictEqual(code, 2, err);
  assert.match(err, /stop-verify/);
  assert.match(err, /lib\/a\.js/);
});

test('stop-verify: dirty lib/ + green suite → PASS', async () => {
  const { code, err } = await greenRun;
  assert.strictEqual(code, 0, err);
});

test('stop-verify: clean worktree → PASS without running the (committed red) suite', () => {
  const dir = makeRepo({ suite: RED }); // red on purpose — must not even run
  const { code } = runHook(dir);
  assert.strictEqual(code, 0);
});

test('stop-verify: dirty file OUTSIDE guarded dirs → PASS without running the suite', () => {
  const dir = makeRepo({ suite: RED });
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'x.md'), 'note\n');
  const { code } = runHook(dir);
  assert.strictEqual(code, 0);
});

test('stop-verify: stop_hook_active → PASS immediately (loop protection)', () => {
  const dir = makeRepo({ suite: RED });
  fs.appendFileSync(path.join(dir, 'lib', 'a.js'), '// dirty\n');
  const { code } = runHook(dir, { stop_hook_active: true });
  assert.strictEqual(code, 0);
});

test('stop-verify: not a git repo → PASS (fail-open)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-verify-'));
  const { code } = runHook(dir);
  assert.strictEqual(code, 0);
});

test('stop-verify: malformed stdin → PASS (fail-open)', () => {
  const { code } = runHook(undefined, undefined, 'not json{');
  assert.strictEqual(code, 0);
});
