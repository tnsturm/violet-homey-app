'use strict';

// PreToolUse hook (matcher: Bash|PowerShell) — blocks `git commit` when app.json and
// .homeycompose/app.json disagree on version (HOMEY.md: "muessen vor dem
// Commit identisch sein").

const fs = require('fs');
const path = require('path');
const { logHook } = require('./lib/log');

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0); // can't parse -> fail open, don't block on our own error
  }

  const command = (input.tool_input && input.tool_input.command) || '';
  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0); // only care about commits
  }

  const cwd = input.cwd || process.cwd();
  let rootVersion;
  let composeVersion;
  try {
    rootVersion = JSON.parse(fs.readFileSync(path.join(cwd, 'app.json'), 'utf8')).version;
    composeVersion = JSON.parse(fs.readFileSync(path.join(cwd, '.homeycompose', 'app.json'), 'utf8')).version;
  } catch {
    process.exit(0); // files unreadable -> fail open
  }

  if (rootVersion !== composeVersion) {
    logHook('check-version-sync', 'block', cwd);
    console.error(
      `Version mismatch: app.json=${rootVersion} vs .homeycompose/app.json=${composeVersion}. `
      + 'Run "npx homey app build" (or version bump again) so both match before committing.'
    );
    process.exit(2); // block the commit
  }

  logHook('check-version-sync', 'pass', cwd);
  process.exit(0);
});
