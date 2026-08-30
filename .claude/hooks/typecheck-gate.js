'use strict';

// PreToolUse hook (matcher: Bash|PowerShell) — blocks `git commit` while `tsc -p
// tsconfig.checkjs.json` is red, so type errors can't land in history (M4.5 —
// eval doc §4A "Commit-Gate": ~+7 s per commit, deliberately NOT a PostToolUse
// per-edit check, measured 6.6 s each). Pattern mirrors check-version-sync.js:
// fail open on our own errors, exit 2 only on a real finding. tsc is resolved
// from the guarded repo's own node_modules — under the "typescript-checkjs"
// alias first (this repo: the literal name would flip homey-cli into TS mode,
// eval doc §1 Nachtrag), plain "typescript" as fallback for other repos; no npx,
// shell-free for Windows. Repos without config or checker are never blocked.
// JEDER Fail-open-Pfad meldet sich: Ledger-Eintrag 'skip' + eine stderr-Zeile
// "Nothing was verified". Bis 2026-08-30 kehrte der Hook hier still mit exit 0
// zurueck — als im Haupt-Checkout node_modules fehlte, war das Gate wirkungslos
// und von "lief und war gruen" nicht zu unterscheiden (Checkpoint-Retro M9.0b;
// dieselbe Klasse wie der commit-msg-guard mit leerem Ledger in M9.0). test-gate.js
// macht diese Unterscheidung seit dem /insights-Report 2026-08-21, hier fehlte sie.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { logHook } = require('./lib/log');
const { toolchainMissing } = require('./lib/env-ready');

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

  /** @param {string} reason Warum nichts geprueft wurde — landet im Ledger und auf stderr. */
  const skip = (reason) => {
    logHook('typecheck-gate', 'skip', cwd);
    console.error(`typecheck-gate: skipped — ${reason}. Nothing was verified; tsc did not run.`);
    process.exit(0);
  };

  // "konnte nicht pruefen" != "Pruefung fehlgeschlagen": ein Checkout ohne installierte
  // Abhaengigkeiten ist beweisbar nicht pruefbar. Nicht blockieren — aber auch nicht schweigen.
  const notReady = toolchainMissing(cwd);
  if (notReady) {
    skip(notReady);
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
    skip('neither "typescript-checkjs" nor "typescript" resolves from this repo');
  }

  const r = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.checkjs.json'], { cwd, encoding: 'utf8' });
  if (r.status === 0) {
    logHook('typecheck-gate', 'pass', cwd);
    process.exit(0); // green
  }
  if (r.status === null) {
    skip(`tsc could not be spawned (${r.error ? r.error.message : 'unknown reason'})`);
  }

  logHook('typecheck-gate', 'block', cwd);
  console.error(
    'typecheck-gate: tsc -p tsconfig.checkjs.json failed — fix the type errors below '
    + '(or run "npm run typecheck") before committing.\n'
    + [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
  );
  process.exit(2); // block the commit
});
