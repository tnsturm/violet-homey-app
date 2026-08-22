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

/** @param {string} filePath @param {string} [cwd] session cwd = the guarded repo root */
function runHook(filePath, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', cwd, tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

/**
 * Fixture repo holding <root>/docs/dashboard/<name>. Returns both halves: the guard only
 * looks at files inside the session cwd, so every call site has to pass `root` as that cwd.
 * @param {string} name @param {string} content
 * @returns {{ root: string, file: string }}
 */
function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashguard-'));
  const p = path.join(dir, 'docs', 'dashboard');
  fs.mkdirSync(p, { recursive: true });
  const full = path.join(p, name);
  fs.writeFileSync(full, content);
  return { root: dir, file: full };
}

/** Runs the hook on a tmpFile() fixture, using its root as the session cwd.
 * @param {{ root: string, file: string }} fixture */
function runFixture(fixture) {
  return runHook(fixture.file, fixture.root);
}

/** @param {string} dataBlockBody */
function htmlWith(dataBlockBody) {
  return `<html><body>\n<script id="status-data">\n${dataBlockBody}\n</script>\n</body></html>`;
}

test('dashboard-guard: valid data block → exit 0', () => {
  const html = htmlWith('window.DASHBOARD_STATUS = { project: "X", milestones: [] };');
  assert.strictEqual(runFixture(tmpFile('dashboard.html', html)).code, 0);
});

test('dashboard-guard: curly smart-quote delimiter breaks the block → exit 2', () => {
  const broken = `window.DASHBOARD_STATUS = { project: ${LQ}X${RQ}, note: "a "stray" quote" };`;
  const { code, err } = runFixture(tmpFile('dashboard.html', htmlWith(broken)));
  assert.strictEqual(code, 2);
  assert.match(err, /no longer parses/);
});

test('dashboard-guard: generic syntax error in data block → exit 2', () => {
  const broken = 'window.DASHBOARD_STATUS = { project: "X", milestones: [ };';
  assert.strictEqual(runFixture(tmpFile('dashboard.html', htmlWith(broken))).code, 2);
});

test('dashboard-guard: non-dashboard HTML file → exit 0', () => {
  const broken = 'window.DASHBOARD_STATUS = { project: "X", milestones: [ };';
  assert.strictEqual(runFixture(tmpFile('other.html', htmlWith(broken))).code, 0);
});

test('dashboard-guard: dashboard.html without the status-data marker → exit 0 (fail open)', () => {
  assert.strictEqual(runFixture(tmpFile('dashboard.html', '<html></html>')).code, 0);
});

test('dashboard-guard: absolute path outside cwd (another repository) → exit 0', () => {
  // skill-agentic-loop-framework ships a dashboard.html TEMPLATE at this exact path
  // (docs/superpowers/notes/2026-08-22-hook-cwd-containment.md).
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'dashguard-foreign-'));
  const dir = path.join(foreign, 'docs', 'dashboard');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'dashboard.html');
  fs.writeFileSync(p, htmlWith('window.DASHBOARD_STATUS = { project: "X", milestones: [ };'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dashguard-cwd-'));
  assert.strictEqual(runHook(p, cwd).code, 0);
});
