'use strict';

// Stop hook — a turn must not END with red verification while source dirs are
// modified (M4.7 — spec docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md §5):
// when `git status --porcelain` shows changes under lib/, drivers/ or
// .homeycompose/, run the repo's test suite and (when .homeycompose/app.json
// exists) `npx homey app validate`; on failure exit 2 with the output so the
// model keeps working instead of ending broken. stop_hook_active from the hook
// input short-circuits (Claude Code sets it when the turn is already being
// continued by a stop hook — exiting 0 breaks the loop). Clean worktree or
// non-source-only changes exit 0 without running anything. Fail-open pattern
// as in the M4.6 gates; suite spawn strips the node:test child-process env
// markers for honest nested reporting (test-gate lesson).

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
    process.exit(0); // can't parse -> fail open
  }
  if (input.stop_hook_active === true) {
    process.exit(0); // already continuing because of a stop hook -> never loop
  }

  const cwd = input.cwd || process.cwd();
  const st = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  if (st.status !== 0 || typeof st.stdout !== 'string') {
    process.exit(0); // not a git repo / git unavailable -> fail open
  }
  // Porcelain line = XY<space>path; renames report "old -> new" (new counts).
  const guarded = st.stdout.split('\n').filter(Boolean).map((line) => {
    const p = line.slice(3);
    const arrow = p.indexOf(' -> ');
    return (arrow >= 0 ? p.slice(arrow + 4) : p).replace(/^"|"$/g, '');
  }).filter((p) => /^(lib|drivers)\//.test(p) || /^\.homeycompose\//.test(p));
  if (guarded.length === 0) {
    process.exit(0); // nothing source-relevant modified -> nothing to verify
  }

  const problems = [];

  let testScript = null;
  try {
    testScript = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts.test;
  } catch {
    // no package.json/scripts -> skip the suite step
  }
  if (testScript) {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_TEST_WORKER_ID;
    const r = spawnSync(testScript, { cwd, shell: true, encoding: 'utf8', env });
    if (r.status !== 0 && r.status !== null) {
      problems.push(`test suite ("${testScript}") failed:\n${[r.stdout, r.stderr].filter(Boolean).join('\n').trim()}`);
    }
  }

  // Validate only in Homey compose repos; spawn errors fail open (status null).
  if (fs.existsSync(path.join(cwd, '.homeycompose', 'app.json'))) {
    const v = spawnSync('npx homey app validate', { cwd, shell: true, encoding: 'utf8' });
    if (v.status !== 0 && v.status !== null) {
      problems.push(`npx homey app validate failed:\n${[v.stdout, v.stderr].filter(Boolean).join('\n').trim()}`);
    }
  }

  if (problems.length > 0) {
    console.error(
      'stop-verify: source files are modified but verification is red — fix before ending the turn '
      + `(modified: ${guarded.join(', ')}):\n${problems.join('\n\n')}`
    );
    process.exit(2); // block the stop; the model continues and fixes
  }

  process.exit(0);
});
