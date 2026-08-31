'use strict';

// SessionStart hook — makes a disarmed gate net AUDIBLE at session start (M9.0b, /insights
// + /doctor 2026-08-31). The commit-time invariant (test/hooks/hook-command-paths.test.js)
// only fires when a commit happens; the window before that is where 2026-08-27 produced
// five test-gate skip records nobody read, and where 211 hook launches failed silently over
// five days because a relative script path did not resolve from the session cwd.
//
// Checks, all against the checkout that OWNS this file (__dirname/../..), deliberately not
// the session cwd — starting in the wrong clone is the exact trap under test:
//   1. every hook script referenced in the settings cascade resolves on disk,
//   2. no hook command uses a cwd-relative `node <path>` form (goes inert off-root),
//   3. node_modules exists when package.json declares deps (else test-/typecheck-gate skip),
//   4. every settings file that exists actually parses (an unparseable file loads NO hooks).
//
// Contract: ALWAYS exit 0 — fail-open, a broken self-test must never block a session. But
// never silently: findings go to stdout, which Claude Code injects into the session context,
// so the model itself sees them. A clean repo prints nothing (stdout costs context; silence
// is the common case). Fail-open-must-be-audible is the M9.0b rule this hook generalizes.

const fs = require('fs');
const path = require('path');
const { logHook } = require('./lib/log');

const ROOT = path.resolve(__dirname, '..', '..');
const TOKEN = '${CLAUDE_PROJECT_DIR}';
const SETTINGS_FILES = ['settings.json', 'settings.local.json']
  .map((name) => path.join(ROOT, '.claude', name));

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let cwd = '';
  try { cwd = JSON.parse(payload).cwd || ''; } catch { /* checks don't depend on input */ }

  const findings = [];

  // --- hook commands across the settings cascade -------------------------------
  for (const file of SETTINGS_FILES) {
    if (!fs.existsSync(file)) continue; // settings.local.json is optional
    const base = path.basename(file);
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      // Check 4: an unparseable settings file is silently ignored wholesale — no hooks load.
      findings.push(base + ' does not parse (' + e.message.slice(0, 60) + ') — NO hooks from it are active.');
      continue;
    }
    for (const groups of Object.values(settings.hooks || {})) {
      for (const group of groups || []) {
        for (const hook of group.hooks || []) {
          if (typeof hook.command !== 'string') continue;
          const cmd = hook.command;
          // Check 2: cwd-relative `node <path>` — inert whenever the session cwd is off-root.
          if (/^\s*node\s+(?!["']?\$\{|["']?[A-Za-z]:|["']?[/\\])/.test(cmd) && !cmd.includes(TOKEN)) {
            findings.push(base + ': cwd-relative hook path (inert off the repo root): ' + cmd);
            continue;
          }
          // Check 1: the referenced script must resolve after token substitution.
          const m = cmd.replace(TOKEN, ROOT).match(/["']([^"']*[.]claude[/\\]hooks[/\\][A-Za-z0-9._-]+\.js)["']/);
          if (m && !fs.existsSync(m[1])) {
            findings.push(base + ': hook script missing on disk: ' + path.basename(m[1]));
          }
        }
      }
    }
  }

  // --- toolchain the gates depend on -------------------------------------------
  // Check 3: same condition test-gate/typecheck-gate skip on (lib/env-ready.js) — surfaced
  // at session start instead of as a ledger record at first commit.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const declared = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
    if (declared > 0 && !fs.existsSync(path.join(ROOT, 'node_modules'))) {
      findings.push('node_modules missing but package.json declares deps — test-gate/typecheck-gate will SKIP every commit. Run `npm ci` first.');
    }
  } catch { /* no/unreadable package.json -> not ours to gate */ }

  if (findings.length === 0) {
    logHook('selftest-guards', 'pass', cwd);
    process.exit(0);
  }
  logHook('selftest-guards', 'warn', cwd);
  console.log('selftest-guards: the gate net of ' + ROOT + ' is NOT fully armed:');
  for (const f of findings) console.log('selftest-guards: - ' + f);
  console.log('selftest-guards: fix this before relying on any gate — a disarmed gate looks identical to a green one.');
  process.exit(0); // fail-open, but the lines above are in the session context now
});
