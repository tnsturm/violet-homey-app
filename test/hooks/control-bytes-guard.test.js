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
 * Fixture repo holding <root>/<name>. Returns both halves: the guard only looks at
 * files inside the session cwd, so every call site has to pass `root` as that cwd.
 * @param {string} name @param {string} content
 * @returns {{ root: string, file: string }}
 */
function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrlbytesguard-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return { root: dir, file: p };
}

/** Runs the hook on a tmpFile() fixture, using its root as the session cwd.
 * @param {{ root: string, file: string }} fixture */
function runFixture(fixture) {
  return runHook(fixture.file, fixture.root);
}

test('control-bytes-guard: clean text → exit 0', () => {
  assert.strictEqual(runFixture(tmpFile('a.js', "'use strict';\nconst x = 1;\n")).code, 0);
});

test('control-bytes-guard: tab/LF/CR are not flagged → exit 0', () => {
  assert.strictEqual(runFixture(tmpFile('a.md', 'line one\r\n\tindented\n')).code, 0);
});

test('control-bytes-guard: raw NUL byte → exit 2', () => {
  const { code, err } = runFixture(tmpFile('a.js', `const x = '\x00';\n`));
  assert.strictEqual(code, 2);
  assert.match(err, /raw control byte \(0x00\)/);
});

test('control-bytes-guard: raw ESC byte reports correct line number', () => {
  const { code, err } = runFixture(tmpFile('a.md', `line1\nline2 \x1b bad\nline3\n`));
  assert.strictEqual(code, 2);
  assert.match(err, /a\.md:2/);
});

test('control-bytes-guard: non-guarded extension → exit 0 even with control byte', () => {
  assert.strictEqual(runFixture(tmpFile('a.png', '\x00\x01\x02')).code, 0);
});

test('control-bytes-guard: absolute path outside cwd (another repository) → exit 0', () => {
  // Another repo's text files are not ours to gate, however broken they look
  // (docs/superpowers/notes/2026-08-22-hook-cwd-containment.md).
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrlbytesguard-foreign-'));
  const p = path.join(foreign, 'a.md');
  fs.writeFileSync(p, 'text with a raw ' + String.fromCharCode(0) + ' byte');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrlbytesguard-cwd-'));
  assert.strictEqual(runHook(p, cwd).code, 0);
});

test('control-bytes-guard: the .jsonl telemetry ledger is not guarded → exit 0', () => {
  // The anchored GUARDED_EXT is what keeps .claude/hooks/hook-log.jsonl out of scope;
  // an explicit exclusion for it was unreachable dead code and has been removed.
  const fixture = tmpFile('hook-log.jsonl', '{"hook":"x"}' + String.fromCharCode(0));
  assert.strictEqual(runFixture(fixture).code, 0);
});
