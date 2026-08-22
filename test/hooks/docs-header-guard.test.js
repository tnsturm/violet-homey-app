'use strict';

// Smoke test for .claude/hooks/docs-header-guard.js (PostToolUse Edit|Write) — the
// guard blocks a lib/ or drivers/ .js file missing the documenting-code file header
// (exit 2) and leaves compliant / non-guarded files alone (exit 0). Ships with the
// hook per the workflow-retro optimizer guardrail
// (docs/superpowers/specs/2026-07-05-workflow-retro-optimizer-design.md).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'docs-header-guard.js');

/** @param {string} filePath @param {string} [cwd] session cwd = the guarded repo root */
function runHook(filePath, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', cwd, tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    env: { ...process.env, HOOK_LOG_DISABLE: '1' },
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

/**
 * Fixture repo holding <root>/lib/<name>. Returns both halves: the guard only looks at
 * files inside the session cwd, so every call site has to pass `root` as that cwd.
 * @param {string} name @param {string} content
 * @returns {{ root: string, file: string }}
 */
function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsheaderguard-'));
  const nested = path.join(dir, 'lib');
  fs.mkdirSync(nested);
  const p = path.join(nested, name);
  fs.writeFileSync(p, content);
  return { root: dir, file: p };
}

const COMPLIANT = "'use strict';\n\n// Widget helper (pure) — spec §3\n// (docs/superpowers/specs/2026-01-01-widget-design.md).\n\nfunction f() {}\nmodule.exports = { f };\n";

test('docs-header-guard: compliant header → exit 0', () => {
  const { root, file } = tmpFile('Widget.js', COMPLIANT);
  assert.strictEqual(runHook(file, root).code, 0);
});

test('docs-header-guard: missing "use strict" → exit 2', () => {
  const { root, file } = tmpFile('Widget.js', '// no use strict\nfunction f() {}\n');
  const { code, err } = runHook(file, root);
  assert.strictEqual(code, 2);
  assert.match(err, /must start with 'use strict'/);
});

test('docs-header-guard: "use strict" but no spec reference → exit 2', () => {
  const { root, file } = tmpFile('Widget.js', "'use strict';\n\n// just a comment, no spec ref\n\nfunction f() {}\n");
  const { code, err } = runHook(file, root);
  assert.strictEqual(code, 2);
  assert.match(err, /missing the spec-referenced file header/);
});

test('docs-header-guard: non-guarded path (test/) → exit 0 even without header', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsheaderguard-'));
  const p = path.join(dir, 'x.test.js');
  fs.writeFileSync(p, 'const a = 1;');
  assert.strictEqual(runHook(p, dir).code, 0);
});

test('docs-header-guard: non-.js file → exit 0', () => {
  const { root, file } = tmpFile('x.json', '{}');
  assert.strictEqual(runHook(file, root).code, 0);
});

test('docs-header-guard: absolute path outside cwd (another repository) → exit 0', () => {
  // A file in a DIFFERENT repo that happens to carry a lib/ segment is not ours to
  // gate — it has its own documentation conventions (observed 2026-08-21 against
  // skill-agentic-loop-framework). This content would block on both header rules.
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'docsheaderguard-foreign-'));
  fs.mkdirSync(path.join(foreign, 'lib'));
  const p = path.join(foreign, 'lib', 'env-ready.js');
  fs.writeFileSync(p, '// no use strict, no spec ref');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'docsheaderguard-cwd-'));
  assert.strictEqual(runHook(p, cwd).code, 0);
});

test('docs-header-guard: a worktree under <cwd> is still project source → exit 2', () => {
  // Worktrees live at <repo>/.claude/worktrees/<name> and hold the bulk of the work
  // (CLAUDE.md §9), so they get the same conventions — the old path-string exemption
  // silently disabled this guard exactly where it was needed.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docsheaderguard-wt-'));
  const dir = path.join(root, '.claude', 'worktrees', 'feature', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'Widget.js');
  fs.writeFileSync(p, '// no use strict, no spec ref');
  assert.strictEqual(runHook(p, root).code, 2);
});
