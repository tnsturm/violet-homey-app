'use strict';

// Smoke test for .claude/hooks/changelog-lang-guard.js (PostToolUse Edit|Write) — blocks
// (exit 2) an edit to .homeychangelog.json that leaves the CURRENT .homeycompose/app.json
// version without a complete en+de entry; passes through otherwise. Shift-left twin of
// release-gate.js's changelog check (same lib/changelog.js helper), added via
// /claude-automation-recommender during the VioletApp →M5 checkpoint.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'changelog-lang-guard.js');
const VERSION = '0.9.9';

function makeRepo(changelog) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-lang-guard-'));
  fs.mkdirSync(path.join(dir, '.homeycompose'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.homeycompose', 'app.json'), JSON.stringify({ version: VERSION }));
  const changelogPath = path.join(dir, '.homeychangelog.json');
  fs.writeFileSync(changelogPath, JSON.stringify(changelog));
  return { dir, changelogPath };
}

function runHook(filePath, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', cwd, tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

test('changelog-lang-guard: complete en+de entry for the compose version → exit 0', () => {
  const { dir, changelogPath } = makeRepo({ [VERSION]: { en: 'New stuff.', de: 'Neues.' } });
  assert.strictEqual(runHook(changelogPath, dir).code, 0);
});

test('changelog-lang-guard: missing de entry for the compose version → exit 2', () => {
  const { dir, changelogPath } = makeRepo({ [VERSION]: { en: 'Only English.' } });
  const { code, err } = runHook(changelogPath, dir);
  assert.strictEqual(code, 2);
  assert.match(err, new RegExp(VERSION.replace(/\./g, '\\.')));
});

test('changelog-lang-guard: compose version not yet authored in changelog → exit 0 (nothing to check yet)', () => {
  const { dir, changelogPath } = makeRepo({ '0.1.0': { en: 'Old.', de: 'Alt.' } });
  assert.strictEqual(runHook(changelogPath, dir).code, 0);
});

test('changelog-lang-guard: edit to a non-changelog file → exit 0', () => {
  const { dir } = makeRepo({ [VERSION]: { en: 'Only English.' } });
  const otherPath = path.join(dir, 'notes.json');
  fs.writeFileSync(otherPath, '{}');
  assert.strictEqual(runHook(otherPath, dir).code, 0);
});

test('changelog-lang-guard: repo without .homeycompose → exit 0 (not ours to gate)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-lang-guard-'));
  const changelogPath = path.join(dir, '.homeychangelog.json');
  fs.writeFileSync(changelogPath, JSON.stringify({ [VERSION]: { en: 'Only English.' } }));
  assert.strictEqual(runHook(changelogPath, dir).code, 0);
});

test('changelog-lang-guard: malformed stdin → exit 0 (fail-open)', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json{', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});
