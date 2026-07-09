'use strict';

// Smoke test for .claude/hooks/dashboard-guard.js (PostToolUse Edit|Write) — the guard
// blocks a broken window.DASHBOARD_STATUS data block (exit 2) and leaves a valid block /
// non-guarded files alone (exit 0). Ships with the hook per the workflow-retro optimizer
// guardrail (docs/superpowers/specs/2026-07-05-workflow-retro-optimizer-design.md),
// closing the gap that json-guard.js cannot cover (dashboard.html is HTML, not JSON).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'dashboard-guard.js');

// Curly "smart-quote" delimiters, built via char codes so this test file itself can
// never be corrupted by the very bug it checks for.
const LQ = String.fromCharCode(0x201C); // “
const RQ = String.fromCharCode(0x201D); // ”

function runHook(filePath) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashguard-'));
  const p = path.join(dir, 'docs', 'dashboard');
  fs.mkdirSync(p, { recursive: true });
  const full = path.join(p, name);
  fs.writeFileSync(full, content);
  return full;
}

function htmlWith(dataBlockBody) {
  return `<html><body>\n<script id="status-data">\n${dataBlockBody}\n</script>\n</body></html>`;
}

test('dashboard-guard: valid data block → exit 0', () => {
  const html = htmlWith('window.DASHBOARD_STATUS = { project: "X", milestones: [] };');
  assert.strictEqual(runHook(tmpFile('dashboard.html', html)).code, 0);
});

test('dashboard-guard: curly smart-quote delimiter breaks the block → exit 2', () => {
  const broken = `window.DASHBOARD_STATUS = { project: ${LQ}X${RQ}, note: "a "stray" quote" };`;
  const { code, err } = runHook(tmpFile('dashboard.html', htmlWith(broken)));
  assert.strictEqual(code, 2);
  assert.match(err, /no longer parses/);
});

test('dashboard-guard: generic syntax error in data block → exit 2', () => {
  const broken = 'window.DASHBOARD_STATUS = { project: "X", milestones: [ };';
  assert.strictEqual(runHook(tmpFile('dashboard.html', htmlWith(broken))).code, 2);
});

test('dashboard-guard: non-dashboard HTML file → exit 0', () => {
  const broken = 'window.DASHBOARD_STATUS = { project: "X", milestones: [ };';
  assert.strictEqual(runHook(tmpFile('other.html', htmlWith(broken))).code, 0);
});

test('dashboard-guard: dashboard.html without the status-data marker → exit 0 (fail open)', () => {
  assert.strictEqual(runHook(tmpFile('dashboard.html', '<html></html>')).code, 0);
});
