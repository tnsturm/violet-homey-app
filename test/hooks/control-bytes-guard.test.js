'use strict';

// Smoke test for .claude/hooks/control-bytes-guard.js (PostToolUse Edit|Write) — the
// guard blocks a guarded text file that contains a raw control byte (exit 2) and
// leaves clean / non-guarded files alone (exit 0). Ships with the hook per the
// workflow-retro optimizer guardrail
// (docs/superpowers/specs/2026-07-05-workflow-retro-optimizer-design.md).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'control-bytes-guard.js');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrlbytesguard-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

test('control-bytes-guard: clean text → exit 0', () => {
  assert.strictEqual(runHook(tmpFile('a.js', "'use strict';\nconst x = 1;\n")).code, 0);
});

test('control-bytes-guard: tab/LF/CR are not flagged → exit 0', () => {
  assert.strictEqual(runHook(tmpFile('a.md', 'line one\r\n\tindented\n')).code, 0);
});

test('control-bytes-guard: raw NUL byte → exit 2', () => {
  const { code, err } = runHook(tmpFile('a.js', `const x = '\x00';\n`));
  assert.strictEqual(code, 2);
  assert.match(err, /raw control byte \(0x00\)/);
});

test('control-bytes-guard: raw ESC byte reports correct line number', () => {
  const { code, err } = runHook(tmpFile('a.md', `line1\nline2 \x1b bad\nline3\n`));
  assert.strictEqual(code, 2);
  assert.match(err, /a\.md:2/);
});

test('control-bytes-guard: non-guarded extension → exit 0 even with control byte', () => {
  assert.strictEqual(runHook(tmpFile('a.png', '\x00\x01\x02')).code, 0);
});
