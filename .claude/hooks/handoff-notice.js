'use strict';

// Stop hook — makes commits that exist only locally visible before the turn ends
// (/insights report 2026-08-21: several sessions ended with unpushed branches the user had to
// chase, and one release commit was silently never made). A Stop hook can only reach the model
// via exit 2, so this blocks the turn end ONCE per new HEAD; a state file remembers the SHA it
// already reported, so a branch that stays unpushed does not re-fire on every single turn.
//
// It never pushes: CLAUDE.md §9 requires an explicit yes from the user before any push, and
// "always push before reporting done" would contradict that. The hook's whole job is that the
// state cannot stay invisible. `git log HEAD --not --remotes` covers both shapes at once — a
// branch with no upstream at all, and one that is merely ahead of its upstream.
// Fail-open on our own errors, like the other gates.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { logHook } = require('./lib/log');

const STATE_FILE = ['.claude', 'hooks', '.handoff-notice-state.json'];

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
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (head.status !== 0 || typeof head.stdout !== 'string') {
    process.exit(0); // not a git repo / no commits yet -> nothing to report
  }
  const sha = head.stdout.trim();

  // Commits reachable from HEAD but from no remote ref: unpushed, whether or not an
  // upstream is configured.
  const unpushed = spawnSync('git', ['log', '--format=%h %s', 'HEAD', '--not', '--remotes'], { cwd, encoding: 'utf8' });
  if (unpushed.status !== 0 || typeof unpushed.stdout !== 'string') {
    process.exit(0); // fail open
  }
  const commits = unpushed.stdout.split(/\r?\n/).filter(Boolean);
  if (commits.length === 0) {
    process.exit(0); // everything is on a remote -> nothing to say
  }

  const statePath = path.join(cwd, ...STATE_FILE);
  let reported = null;
  try {
    reported = JSON.parse(fs.readFileSync(statePath, 'utf8')).notifiedHead;
  } catch {
    // no state yet -> this is the first report
  }
  if (reported === sha) {
    process.exit(0); // already said this for this exact HEAD
  }
  try {
    fs.writeFileSync(statePath, `${JSON.stringify({ notifiedHead: sha })}\n`);
  } catch {
    // the state file is a convenience, not a correctness requirement -> report anyway
  }

  const branch = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' });
  const where = ((branch.stdout || '').trim()) || 'HEAD (detached)';
  logHook('handoff-notice', 'block', cwd);
  console.error(
    `handoff-notice: ${commits.length} commit(s) on "${where}" exist only locally:\n`
    + `${commits.map((c) => `  ${c}`).join('\n')}\n`
    + 'Say this to the user before ending the turn and ask how to proceed (CLAUDE.md §9: '
    + 'run /code-review, then ask push-to-main vs. PR). Do NOT push on your own.'
  );
  process.exit(2);
});
