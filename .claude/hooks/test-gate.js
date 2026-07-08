'use strict';

// PreToolUse hook (matcher: Bash|PowerShell) — blocks `git commit` while the repo's own
// test suite is red, so failing tests can't land in history (M4.6 — spec
// docs/superpowers/specs/2026-07-08-m4.6-loop-hardening-gates-ci.md §3).
// Registered ALONGSIDE typecheck-gate.js, not merged into it (spec §3 D1):
// Claude Code runs matching hooks in parallel, so commit latency is
// max(tsc, suite) instead of the sum, and each gate stays single-purpose
// and fail-open. The test command comes from package.json scripts.test
// (spec §3 D2): no npm/npm.cmd startup detour on Windows, and the command
// stays a variable for the M4.9 framework extraction. Repos without a test
// script are never blocked. Pattern mirrors check-version-sync.js: fail open
// on our own errors, exit 2 only on a real finding.

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
    process.exit(0); // can't parse -> fail open, don't block on our own error
  }

  const command = (input.tool_input && input.tool_input.command) || '';
  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0); // only care about commits
  }

  const cwd = input.cwd || process.cwd();
  let testScript;
  try {
    testScript = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts.test;
  } catch {
    process.exit(0); // no readable package.json/scripts -> not ours to gate
  }
  if (!testScript) {
    process.exit(0); // no test script -> nothing to gate
  }

  // node:test marks its child processes via NODE_TEST_CONTEXT/NODE_TEST_WORKER_ID.
  // If this hook itself runs inside a suite (its own smoke tests, or a commit-gated
  // run whose suite spawns the hook), an inherited marker would flip the child
  // `node --test` into the runner's child protocol — exit 0 even on failures.
  // Strip the markers so the guarded suite always reports honestly.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;

  // shell:true because scripts.test is a shell command line (like npm run)
  const r = spawnSync(testScript, { cwd, shell: true, encoding: 'utf8', env });
  if (r.status === 0 || r.status === null) {
    process.exit(0); // green, or the suite failed to spawn -> fail open
  }

  console.error(
    `test-gate: test suite ("${testScript}") failed — fix the failing tests below `
    + '(or run "npm test") before committing.\n'
    + [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
  );
  process.exit(2); // block the commit
});
