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

/** @param {string} filePath */
function runHook(filePath) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    env: { ...process.env, HOOK_LOG_DISABLE: '1' },
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

/** @param {string} name @param {string} content */
function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsheaderguard-'));
  const nested = path.join(dir, 'lib');
  fs.mkdirSync(nested);
  const p = path.join(nested, name);
  fs.writeFileSync(p, content);
  return p;
}

const COMPLIANT = "'use strict';\n\n// Widget helper (pure) — spec §3\n// (docs/superpowers/specs/2026-01-01-widget-design.md).\n\nfunction f() {}\nmodule.exports = { f };\n";

test('docs-header-guard: compliant header → exit 0', () => {
  assert.strictEqual(runHook(tmpFile('Widget.js', COMPLIANT)).code, 0);
});

test('docs-header-guard: missing "use strict" → exit 2', () => {
  const { code, err } = runHook(tmpFile('Widget.js', '// no use strict\nfunction f() {}\n'));
  assert.strictEqual(code, 2);
  assert.match(err, /must start with 'use strict'/);
});

test('docs-header-guard: "use strict" but no spec reference → exit 2', () => {
  const { code, err } = runHook(tmpFile('Widget.js', "'use strict';\n\n// just a comment, no spec ref\n\nfunction f() {}\n"));
  assert.strictEqual(code, 2);
  assert.match(err, /missing the spec-referenced file header/);
});

test('docs-header-guard: non-guarded path (test/) → exit 0 even without header', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsheaderguard-'));
  const p = path.join(dir, 'x.test.js');
  fs.writeFileSync(p, 'const a = 1;');
  assert.strictEqual(runHook(p).code, 0);
});

test('docs-header-guard: non-.js file → exit 0', () => {
  assert.strictEqual(runHook(tmpFile('x.json', '{}')).code, 0);
});
