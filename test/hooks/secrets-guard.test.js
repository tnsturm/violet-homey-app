'use strict';

// Smoke test for .claude/hooks/secrets-guard.js (PreToolUse Edit|Write) — the guard
// blocks a hardcoded Basic auth token or a writePassword/writeUsername string
// literal (exit 2) in tracked app files, and passes clean code / store reads /
// non-guarded paths (exit 0). Enforces M3 threat-model SR-01/SR-02, and its error
// text must never echo the matched secret (SR-02).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'secrets-guard.js');
const SECRET_B64 = 'Basic YWRtaW46c3VwZXJzZWNyZXQxMjM0'; // base64 of a fake user:pass

function runHook(toolInput, env) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: toolInput }),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

const cases = [
  ['guarded lib + hardcoded Basic token → BLOCK', { file_path: 'lib/WriteClient.js', content: `const h = '${SECRET_B64}';` }, 2],
  ['guarded lib + runtime-built header → PASS', { file_path: 'lib/WriteClient.js', content: "const h = 'Basic ' + Buffer.from(u + ':' + p).toString('base64');" }, 0],
  ['legit driver store read → PASS', { file_path: 'drivers/pool/driver.js', content: 'store: { writePassword: pairData.writePassword }' }, 0],
  ['hardcoded writePassword literal → BLOCK', { file_path: 'drivers/pool/device.js', content: "writePassword: 'hunter2secret'" }, 2],
  ['non-guarded docs + Basic token → PASS', { file_path: 'docs/notes.md', content: `Authorization: ${SECRET_B64}` }, 0],
  ['guarded json clean → PASS', { file_path: '.homeychangelog.json', content: '{"0.3.0":{"en":"write control"}}' }, 0],
  ['Edit new_string with token → BLOCK', { file_path: 'lib/WriteClient.js', new_string: `headers.Authorization = '${SECRET_B64}'` }, 2],
  ['empty writePassword → PASS', { file_path: 'drivers/pool/driver.js', content: "writePassword: String(password || '')" }, 0],
];

for (const [name, toolInput, expected] of cases) {
  test(`secrets-guard: ${name}`, () => {
    const { code, err } = runHook(toolInput);
    assert.strictEqual(code, expected, `${name} (stderr: ${err})`);
    // SR-02: the error text must never echo a matched secret value.
    assert.ok(!/YWRtaW46|hunter2secret|supersecret1234/.test(err), 'error text leaked a secret');
  });
}

test('secrets-guard: known password via VIOLET_WRITE_PASSWORD env → BLOCK, no leak', () => {
  const { code, err } = runHook(
    { file_path: 'lib/WriteClient.js', content: "const p = 'MyR34lP@ss';" },
    { VIOLET_WRITE_PASSWORD: 'MyR34lP@ss' },
  );
  assert.strictEqual(code, 2);
  assert.ok(!/MyR34lP@ss/.test(err), 'error text leaked the configured secret');
});
