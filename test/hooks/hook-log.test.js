'use strict';

// Smoke test for .claude/hooks/lib/log.js — the telemetry helper appends one
// parseable JSONL decision record to <cwd>/.claude/hooks/hook-log.jsonl and is
// strictly fail-silent: no throw, no file when the target dir doesn't exist
// (that is what keeps fixture-spawned hook runs from polluting anything) —
// M4.8 spec §3 D1/D2 (docs/superpowers/specs/2026-07-09-m4.8-loop-hardening-autonomy-metaloop.md).
// Also covers lib/spawn-env.js (D7, dedupe of the nested-node:test lesson).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { logHook } = require('../../.claude/hooks/lib/log');

test('logHook: appends a parseable JSONL line when .claude/hooks exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
  fs.mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true });
  logHook('test-gate', 'block', dir);
  logHook('test-gate', 'pass', dir);
  const lines = fs.readFileSync(path.join(dir, '.claude', 'hooks', 'hook-log.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].hook, 'test-gate');
  assert.strictEqual(lines[0].decision, 'block');
  assert.strictEqual(lines[1].decision, 'pass');
  assert.match(lines[0].ts, /^\d{4}-\d{2}-\d{2}T/);
});

test('logHook: silent no-op when the target dir does not exist (fixture safety)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-'));
  assert.doesNotThrow(() => logHook('test-gate', 'block', dir));
  assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false);
});

test('logHook: no process.cwd() fallback — undefined cwd never writes (fixture safety)', () => {
  // Found live (M4.8 E2E verify): guard tests spawn hooks WITHOUT a payload cwd
  // while the suite runs in the real repo — a cwd fallback wrote their fixture
  // decisions into the real hook-log.jsonl. undefined must mean "skip".
  assert.doesNotThrow(() => logHook('secrets-guard', 'block', undefined));
});

test('spawnEnv: strips the node:test child markers, keeps the rest', () => {
  const { spawnEnv } = require('../../.claude/hooks/lib/spawn-env');
  process.env.NODE_TEST_CONTEXT = 'child-v8';
  const env = spawnEnv();
  delete process.env.NODE_TEST_CONTEXT;
  assert.strictEqual(env.NODE_TEST_CONTEXT, undefined);
  assert.strictEqual(env.NODE_TEST_WORKER_ID, undefined);
  assert.strictEqual(typeof env.PATH === 'string' || typeof env.Path === 'string', true);
});
