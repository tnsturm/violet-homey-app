'use strict';

// Smoke test for .claude/hooks/release-gate.js (PreToolUse Bash) — the gate
// blocks `homey app install|publish` (exit 2) when (a) .homeychangelog.json
// lacks a complete en+de entry for the compose version, (b) the version is
// already logged in docs/dashboard/versions.md (forgotten bump = double
// release), or (c) publish has no credential-rotation proof — M4.6 spec §4
// (docs/superpowers/specs/2026-07-08-m4.6-loop-hardening-gates-ci.md).
// Fails open (exit 0) on non-release commands, non-compose repos, malformed
// stdin. Mirrors the other hook tests in this directory.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'release-gate.js');
const VERSION = '0.9.9';

// Throwaway Homey-compose repo; opts toggle the three gate conditions.
/**
 * @param {{ changelog?: object, logged?: boolean, rotation?: string }} [opts]
 */
function makeRepo({ changelog, logged, rotation } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-'));
  fs.mkdirSync(path.join(dir, '.homeycompose'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.homeycompose', 'app.json'), JSON.stringify({ version: VERSION }));
  if (changelog !== undefined) {
    fs.writeFileSync(path.join(dir, '.homeychangelog.json'), JSON.stringify(changelog));
  }
  fs.mkdirSync(path.join(dir, 'docs', 'dashboard'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'dashboard', 'versions.md'),
    logged ? '| `' + VERSION + '` | 2026-07-08 | `abc1234` | Test | M9 | already released |\n' : '| `0.0.1` | ... |\n'
  );
  if (rotation) {
    fs.mkdirSync(path.join(dir, 'docs', 'superpowers', 'security'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'superpowers', 'security', 'credential-rotation.md'), rotation);
  }
  return dir;
}

const FULL_CHANGELOG = { [VERSION]: { en: 'New stuff.', de: 'Neues.' } };

function runHook(command, cwd, raw) {
  const payload = raw !== undefined
    ? raw
    : JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } });
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

test('release-gate: install with complete changelog + fresh version → PASS', () => {
  const { code, err } = runHook('npx homey app install', makeRepo({ changelog: FULL_CHANGELOG }));
  assert.strictEqual(code, 0, err);
});

test('release-gate: install with missing de entry → BLOCK naming the changelog', () => {
  const { code, err } = runHook('homey app install', makeRepo({ changelog: { [VERSION]: { en: 'Only English.' } } }));
  assert.strictEqual(code, 2, err);
  assert.match(err, /\.homeychangelog\.json/);
  assert.match(err, new RegExp(VERSION.replace(/\./g, '\\.')));
});

test('release-gate: install with missing changelog file → BLOCK', () => {
  const { code, err } = runHook('homey app install', makeRepo({}));
  assert.strictEqual(code, 2, err);
  assert.match(err, /\.homeychangelog\.json/);
});

test('release-gate: version only mentioned in prose (planned next upload) → PASS', () => {
  // versions.md ends with a "Naechster Upload: `X.Y.Z`" note — a planned
  // version is not a logged release and must not block (spec §4 b: table rows only).
  const dir = makeRepo({ changelog: FULL_CHANGELOG });
  fs.appendFileSync(
    path.join(dir, 'docs', 'dashboard', 'versions.md'),
    '\n**Naechster Upload: `' + VERSION + '`** (geplant).\n'
  );
  const { code, err } = runHook('homey app install', dir);
  assert.strictEqual(code, 0, err);
});

test('release-gate: install with version already in versions.md → BLOCK naming the bump', () => {
  const { code, err } = runHook('homey app install', makeRepo({ changelog: FULL_CHANGELOG, logged: true }));
  assert.strictEqual(code, 2, err);
  assert.match(err, /versions\.md/);
  assert.match(err, /bump/i);
});

test('release-gate: publish without rotation proof → BLOCK naming the rotation', () => {
  const { code, err } = runHook('homey app publish', makeRepo({ changelog: FULL_CHANGELOG }));
  assert.strictEqual(code, 2, err);
  assert.match(err, /credential-rotation\.md/);
});

test('release-gate: publish with rotation proof (dated) + rest ok → PASS', () => {
  const dir = makeRepo({ changelog: FULL_CHANGELOG, rotation: '# Rotation\n\nRotated on 2026-07-09.\n' });
  const { code, err } = runHook('homey app publish', dir);
  assert.strictEqual(code, 0, err);
});

test('release-gate: publish with undated rotation file → BLOCK (no proof)', () => {
  const dir = makeRepo({ changelog: FULL_CHANGELOG, rotation: 'todo' });
  const { code, err } = runHook('homey app publish', dir);
  assert.strictEqual(code, 2, err);
  assert.match(err, /credential-rotation\.md/);
});

test('release-gate: install does NOT require rotation proof → PASS', () => {
  const { code, err } = runHook('homey app install', makeRepo({ changelog: FULL_CHANGELOG }));
  assert.strictEqual(code, 0, err);
});

test('release-gate: multiple violations are all reported', () => {
  const { code, err } = runHook('homey app publish', makeRepo({ logged: true }));
  assert.strictEqual(code, 2, err);
  assert.match(err, /\.homeychangelog\.json/);
  assert.match(err, /versions\.md/);
  assert.match(err, /credential-rotation\.md/);
});

test('release-gate: non-release command → PASS', () => {
  const { code } = runHook('homey app validate --level publish', makeRepo({}));
  assert.strictEqual(code, 0);
});

test('release-gate: repo without .homeycompose → PASS (not ours to gate)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-'));
  const { code } = runHook('homey app publish', dir);
  assert.strictEqual(code, 0);
});

test('release-gate: malformed stdin → PASS (fail-open)', () => {
  const { code } = runHook(null, undefined, 'not json{');
  assert.strictEqual(code, 0);
});
