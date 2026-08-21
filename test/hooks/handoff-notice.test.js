'use strict';

// Smoke test for .claude/hooks/handoff-notice.js (Stop) — makes commits that exist only
// locally visible at turn end (/insights report 2026-08-21: several sessions ended with
// unpushed branches the user had to chase, and one release commit was silently never made).
// It never pushes (CLAUDE.md §9 requires an explicit yes) and it reports once per NEW HEAD,
// not once per turn — otherwise a branch that stays unpushed would fire on every single turn.

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
  assert.strictEqual(code, 2, err);
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
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json{', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});
