'use strict';

// Smoke test for .claude/hooks/commit-msg-guard.js (PreToolUse Bash|PowerShell) — blocks a
// `git commit -m` whose message carries a heredoc / PowerShell here-string delimiter and points
// at `git commit -F <file>` instead. Two live incidents (/insights report 2026-08-21): a stray
// "@" leaked into a commit message and forced two amends, a later stray "EOF" needed a
// force-push to fix. Must NOT fire on legitimate text that merely contains "@" or the word EOF.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'commit-msg-guard.js');

/** @param {string|null} command @param {string} [raw] */
function runHook(command, raw) {
  const payload = raw !== undefined
    ? raw
    : JSON.stringify({ tool_name: 'Bash', cwd: process.cwd(), tool_input: { command } });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

test('commit-msg-guard: PowerShell here-string terminator → BLOCK naming git commit -F', () => {
  const { code, err } = runHook('git commit -m @"\nfeat: thing\n"@');
  assert.strictEqual(code, 2);
  assert.match(err, /commit-msg-guard/);
  assert.match(err, /git commit -F/);
});

test('commit-msg-guard: lone @ line inside the message → BLOCK', () => {
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

test('commit-msg-guard: non-commit command → PASS (heredocs are fine elsewhere)', () => {
  const { code } = runHook('cat <<EOF > notes.txt\n@\nEOF');
  assert.strictEqual(code, 0);
});

test('commit-msg-guard: malformed stdin → PASS (fail open)', () => {
  const { code } = runHook(null, 'not json{');
  assert.strictEqual(code, 0);
});
