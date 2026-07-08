'use strict';

// Smoke test for .claude/hooks/compose-guard.js (PreToolUse Edit|Write) — the guard
// blocks a direct edit/write of the GENERATED root app.json (exit 2) in a Homey
// Compose project, and passes edits to the compose sources, other files, and
// non-compose repos where app.json is the real source (exit 0). Fails open (exit 0)
// on its own errors. Mirrors the check-version-sync/secrets-guard/json-guard hooks.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'compose-guard.js');

// Build a throwaway project dir. `compose: true` adds a .homeycompose/ marker so the
// hook recognises app.json as generated; `compose: false` leaves it a plain app.
function makeProject(compose) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-guard-'));
  if (compose) fs.mkdirSync(path.join(dir, '.homeycompose'));
  return dir;
}

function runHook(toolInput, cwd, raw) {
  const payload = raw !== undefined
    ? raw
    : JSON.stringify({ tool_name: 'Edit', cwd, tool_input: toolInput });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

test('compose-guard: edit generated root app.json (relative) → BLOCK', () => {
  const dir = makeProject(true);
  const { code, err } = runHook({ file_path: 'app.json', new_string: '{}' }, dir);
  assert.strictEqual(code, 2, err);
});

test('compose-guard: write generated root app.json (absolute) → BLOCK', () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: path.join(dir, 'app.json'), content: '{}' }, dir);
  assert.strictEqual(code, 2);
});

// Windows-only: backslash is a path separator only there — on POSIX a backslash
// is a legal filename character, so this path does NOT address the root app.json
// and the guard must not block it (surfaced by the first Linux CI run, M4.6).
test('compose-guard: root app.json via backslash path → BLOCK (Windows)', { skip: process.platform !== 'win32' }, () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: dir + '\\app.json', new_string: '{}' }, dir);
  assert.strictEqual(code, 2);
});

test('compose-guard: edit .homeycompose/app.json (the source) → PASS', () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: '.homeycompose/app.json', new_string: '{}' }, dir);
  assert.strictEqual(code, 0);
});

test('compose-guard: edit driver.compose.json → PASS', () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: 'drivers/pool/driver.compose.json', new_string: '{}' }, dir);
  assert.strictEqual(code, 0);
});

test('compose-guard: edit lib source → PASS', () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: 'lib/VioletClient.js', new_string: 'x' }, dir);
  assert.strictEqual(code, 0);
});

test('compose-guard: app.json in a NON-compose project (real source) → PASS', () => {
  const dir = makeProject(false);
  const { code } = runHook({ file_path: 'app.json', new_string: '{}' }, dir);
  assert.strictEqual(code, 0);
});

test('compose-guard: no file_path → PASS', () => {
  const dir = makeProject(true);
  const { code } = runHook({ new_string: '{}' }, dir);
  assert.strictEqual(code, 0);
});

test('compose-guard: malformed stdin → PASS (fail-open)', () => {
  const { code } = runHook(null, undefined, 'not json{');
  assert.strictEqual(code, 0);
});

// The guard must anchor on the EDITED file's own directory, not on cwd — Claude Code
// passes an absolute file_path while cwd is the session dir (which may be a subdir or
// parent of the repo). Anchoring on cwd let an absolute-path edit of the real root
// app.json slip through whenever cwd != repo root (review 2026-07-06, finding 1).
test('compose-guard: cwd is a SUBDIR, absolute path to root app.json → BLOCK', () => {
  const dir = makeProject(true);
  const sub = path.join(dir, 'drivers');
  fs.mkdirSync(sub);
  const { code } = runHook({ file_path: path.join(dir, 'app.json'), content: '{}' }, sub);
  assert.strictEqual(code, 2);
});

test('compose-guard: cwd is the PARENT of the project, absolute path to root app.json → BLOCK', () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: path.join(dir, 'app.json'), new_string: '{}' }, path.dirname(dir));
  assert.strictEqual(code, 2);
});

test('compose-guard: absent cwd, absolute path to root app.json → BLOCK', () => {
  const dir = makeProject(true);
  const raw = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'app.json'), new_string: '{}' } });
  const { code } = runHook(null, undefined, raw);
  assert.strictEqual(code, 2);
});

test('compose-guard: uppercase APP.JSON next to .homeycompose → BLOCK (case-insensitive)', () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: path.join(dir, 'APP.JSON'), new_string: '{}' }, dir);
  assert.strictEqual(code, 2);
});

test('compose-guard: relative Write with content in compose project → BLOCK', () => {
  const dir = makeProject(true);
  const { code } = runHook({ file_path: 'app.json', content: '{}' }, dir);
  assert.strictEqual(code, 2);
});

test('compose-guard: block message steers to the compose source', () => {
  const dir = makeProject(true);
  const { err } = runHook({ file_path: 'app.json', new_string: '{}' }, dir);
  assert.match(err, /\.homeycompose/);
});
