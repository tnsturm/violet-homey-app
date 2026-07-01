'use strict';

// PostToolUse hook (matcher: Edit|Write) — after editing lib/Foo.js, runs
// test/Foo.test.js if it exists, for immediate TDD feedback (CLAUDE.md §4).

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
  const match = /(?:^|\/)lib\/(\w+)\.js$/.exec(normalized);
  if (!match) process.exit(0);

  const cwd = input.cwd || process.cwd();
  const testFile = path.join('test', `${match[1]}.test.js`);
  if (!fs.existsSync(path.join(cwd, testFile))) process.exit(0);

  spawnSync(process.execPath, ['--test', testFile], { cwd, stdio: 'inherit' });
  process.exit(0); // PostToolUse can't block; just surface pass/fail output
});
