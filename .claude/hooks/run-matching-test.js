'use strict';

// PostToolUse hook (matcher: Edit|Write) — after editing lib/Foo.js, runs
// test/Foo.test.js if it exists, for immediate TDD feedback (CLAUDE.md §4).
// M4.7 (spec docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md §3 D5):
// drivers/<id>/<file>.js additionally maps to test/drivers/<id>.<file>.test.js
// (flat, dot-joined — mirrors the flat lib convention).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0);
  }

  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  const normalized = filePath.replace(/\\/g, '/');
  let testFile = null;
  const lib = /(?:^|\/)lib\/(\w+)\.js$/.exec(normalized);
  if (lib) testFile = path.join('test', `${lib[1]}.test.js`);
  const drv = /(?:^|\/)drivers\/([\w-]+)\/(\w+)\.js$/.exec(normalized);
  if (drv) testFile = path.join('test', 'drivers', `${drv[1]}.${drv[2]}.test.js`);
  if (!testFile) process.exit(0);

  const cwd = input.cwd || process.cwd();
  if (!fs.existsSync(path.join(cwd, testFile))) process.exit(0);

  // Strip node:test child markers: inherited (e.g. when this hook itself runs
  // under a suite, as in its own smoke tests) they flip the spawned `node --test`
  // into the runner's child protocol — no readable TAP (test-gate lesson, M4.6).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;

  spawnSync(process.execPath, ['--test', testFile], { cwd, stdio: 'inherit', env });
  process.exit(0); // PostToolUse can't block; just surface pass/fail output
});
