'use strict';

// Smoke test for .claude/hooks/lib/env-ready.js — the helper answers "is the guarded repo's
// toolchain actually installed?", so gates can tell "could not check" apart from "check failed"
// (/insights report 2026-08-21: a worktree without node_modules blocked every git commit for a
// whole session, because a red suite and an uninstalled suite looked identical to test-gate).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { toolchainMissing } = require('../../.claude/hooks/lib/env-ready');

/** @param {object} pkg @param {boolean} withModules */
function makeRepo(pkg, withModules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-ready-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  if (withModules) fs.mkdirSync(path.join(dir, 'node_modules'));
  return dir;
}

test('toolchainMissing: declared deps but no node_modules → reason string', () => {
  const dir = makeRepo({ name: 'f', devDependencies: { typescript: '5' } }, false);
  const reason = toolchainMissing(dir);
  assert.strictEqual(typeof reason, 'string');
  assert.match(String(reason), /node_modules/);
  assert.match(String(reason), /npm ci/);
});

test('toolchainMissing: declared deps and node_modules present → null', () => {
  const dir = makeRepo({ name: 'f', devDependencies: { typescript: '5' } }, true);
  assert.strictEqual(toolchainMissing(dir), null);
});

test('toolchainMissing: no declared deps at all → null (nothing to install)', () => {
  const dir = makeRepo({ name: 'f' }, false);
  assert.strictEqual(toolchainMissing(dir), null);
});

test('toolchainMissing: empty dependency objects → null (nothing to install)', () => {
  const dir = makeRepo({ name: 'f', dependencies: {}, devDependencies: {} }, false);
  assert.strictEqual(toolchainMissing(dir), null);
});

test('toolchainMissing: unreadable package.json → null (fail open, not ours to judge)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-ready-'));
  assert.strictEqual(toolchainMissing(dir), null);
});
