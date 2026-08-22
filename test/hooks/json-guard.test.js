'use strict';

// Smoke test for .claude/hooks/json-guard.js (PostToolUse Edit|Write) — the guard
// blocks invalid manifest/changelog JSON (exit 2) and leaves valid / non-guarded /
// non-JSON files alone (exit 0). Ships with the hook per the workflow-retro
// optimizer guardrail (docs/superpowers/specs/2026-07-05-workflow-retro-optimizer-design.md).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'json-guard.js');

// Curly "smart-quote" delimiters, built via char codes so this test file itself
// can never be corrupted by the very bug it checks for.
const LQ = String.fromCharCode(0x201C); // “
const RQ = String.fromCharCode(0x201D); // ”
const CURLY_DELIM_JSON = `{ ${LQ}version${RQ}: ${LQ}1.0.0${RQ} }`;

/** @param {string} filePath @param {string} [cwd] session cwd = the guarded repo root */
function runHook(filePath, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', cwd, tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

/**
 * Fixture repo holding <root>/<name>. Returns both halves: the guard only looks at
 * files inside the session cwd, so every call site has to pass `root` as that cwd.
 * @param {string} name @param {string} content
 * @returns {{ root: string, file: string }}
 */
function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonguard-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return { root: dir, file: p };
}

/** Runs the hook on a tmpFile() fixture, using its root as the session cwd.
 * @param {{ root: string, file: string }} fixture */
function runFixture(fixture) {
  return runHook(fixture.file, fixture.root);
}

test('json-guard: valid guarded JSON (app.json) → exit 0', () => {
  assert.strictEqual(runFixture(tmpFile('app.json', JSON.stringify({ version: '1.0.0' }))).code, 0);
});

test('json-guard: invalid guarded JSON — curly delimiters → exit 2', () => {
  const { code, err } = runFixture(tmpFile('.homeychangelog.json', CURLY_DELIM_JSON));
  assert.strictEqual(code, 2);
  assert.match(err, /not valid JSON/);
});

test('json-guard: generic invalid guarded JSON → exit 2', () => {
  assert.strictEqual(runFixture(tmpFile('package.json', '{ "x": }')).code, 2);
});

test('json-guard: invalid JSON on a NON-guarded path → exit 0', () => {
  assert.strictEqual(runFixture(tmpFile('notes.json', CURLY_DELIM_JSON)).code, 0);
});

test('json-guard: non-JSON file → exit 0', () => {
  assert.strictEqual(runFixture(tmpFile('x.js', 'const a = 1;')).code, 0);
});

test('json-guard: absolute path outside cwd (another repository) → exit 0', () => {
  // Every repo on disk has a package.json; only ours is ours to gate
  // (docs/superpowers/notes/2026-08-22-hook-cwd-containment.md).
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonguard-foreign-'));
  const p = path.join(foreign, 'package.json');
  fs.writeFileSync(p, CURLY_DELIM_JSON);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonguard-cwd-'));
  assert.strictEqual(runHook(p, cwd).code, 0);
});
