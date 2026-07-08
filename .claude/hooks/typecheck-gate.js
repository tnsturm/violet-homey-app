'use strict';

// PreToolUse hook (matcher: Bash) — blocks `git commit` while `tsc -p
// tsconfig.checkjs.json` is red, so type errors can't land in history (M4.5 —
// eval doc §4A "Commit-Gate": ~+7 s per commit, deliberately NOT a PostToolUse
// per-edit check, measured 6.6 s each). Pattern mirrors check-version-sync.js:
// fail open on our own errors, exit 2 only on a real finding. tsc is resolved
// from the guarded repo's own node_modules — under the "typescript-checkjs"
// alias first (this repo: the literal name would flip homey-cli into TS mode,
// eval doc §1 Nachtrag), plain "typescript" as fallback for other repos; no npx,
// shell-free for Windows. Repos without config or checker are never blocked.

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
  if (!fs.existsSync(path.join(cwd, 'tsconfig.checkjs.json'))) {
    process.exit(0); // no checker config -> not ours to gate
  }

  let tscPath = null;
  for (const pkg of ['typescript-checkjs', 'typescript']) {
    try {
      tscPath = require.resolve(`${pkg}/lib/tsc.js`, { paths: [cwd] });
      break;
    } catch {
      // try next name
    }
  }
  if (!tscPath) {
    process.exit(0); // checker not installed -> fail open
  }

  const r = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.checkjs.json'], { cwd, encoding: 'utf8' });
  if (r.status === 0 || r.status === null) {
    process.exit(0); // green, or tsc itself failed to spawn -> fail open
  }

  console.error(
    'typecheck-gate: tsc -p tsconfig.checkjs.json failed — fix the type errors below '
    + '(or run "npm run typecheck") before committing.\n'
    + [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
  );
  process.exit(2); // block the commit
});
