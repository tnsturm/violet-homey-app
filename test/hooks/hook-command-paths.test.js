'use strict';

// Repo invariant for the hook WIRING in .claude/settings.json — not for any single hook's
// logic. Every hook command must locate its script through ${CLAUDE_PROJECT_DIR}, never
// through a bare repo-relative path.
//
// Why: a relative "node .claude/hooks/x.js" is resolved against the SESSION cwd. Whenever
// that cwd is not the repo root, Node cannot find the module and the hook never runs — the
// whole gate net (test-gate, typecheck-gate, commit-msg-guard, secrets-guard, …) goes
// inert at once. The failure surfaces only as a hook_non_blocking_error in the transcript,
// which neither the model nor the user sees, so it is indistinguishable from "ran and was
// green" — the same silent-degradation class as the M9.0b typecheck-gate finding, one step
// worse because the process never starts.
//
// Evidence (transcript scan, /doctor run 2026-08-31): 211 such failures over five days,
// from four different session cwds — a sibling repo, .claude/worktrees, .claude/hooks
// itself, and a second checkout's .git/worktrees.
//
// ${CLAUDE_PROJECT_DIR} is substituted by Claude Code itself before the command reaches a
// shell, so it is shell-independent. The bare $CLAUDE_PROJECT_DIR form is NOT: these hooks
// match Bash|PowerShell, and PowerShell reads $CLAUDE_PROJECT_DIR as an undefined variable
// ($null) — the CLI emits a warning for exactly that spelling.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOKS_DIR = path.join(REPO_ROOT, '.claude', 'hooks');
const TOKEN = '${CLAUDE_PROJECT_DIR}';

// Hooks may be declared in any file of the settings cascade. settings.local.json is
// gitignored and per-checkout, which makes it the likeliest place for a relative path to
// creep back in unnoticed — so it is covered here, not just the checked-in file.
const SETTINGS_FILES = ['settings.json', 'settings.local.json']
  .map((name) => path.join(REPO_ROOT, '.claude', name));

/** Every {source, event, matcher, command} tuple across the settings cascade. */
function hookCommands() {
  const out = [];
  for (const file of SETTINGS_FILES) {
    if (!fs.existsSync(file)) continue; // settings.local.json is optional
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [event, groups] of Object.entries(settings.hooks || {})) {
      for (const group of groups || []) {
        for (const hook of group.hooks || []) {
          if (typeof hook.command === 'string') {
            out.push({
              source: path.basename(file),
              event,
              matcher: group.matcher || '(none)',
              command: hook.command,
            });
          }
        }
      }
    }
  }
  return out;
}

/** Hook script filenames present in .claude/hooks (lib/ holds helpers, not hooks). */
function hookScriptsOnDisk() {
  return fs.readdirSync(HOOKS_DIR)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => fs.statSync(path.join(HOOKS_DIR, name)).isFile())
    .sort();
}

/** The hook script filenames actually wired up in the settings cascade. */
function hookScriptsRegistered() {
  const names = new Set();
  for (const h of hookCommands()) {
    const m = h.command.match(/[.]claude[/\\]hooks[/\\]([A-Za-z0-9._-]+\.js)/);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

test('hook wiring: settings.json actually declares hooks', () => {
  // Guards the assertions below from passing vacuously if the hooks block ever moves.
  assert.ok(hookCommands().length > 0, 'no hook commands found in .claude/settings.json');
});

test('hook wiring: every hook command resolves its script via ${CLAUDE_PROJECT_DIR}', () => {
  // Anchored on `node <relative path>`, not on the hooks directory: a hook pointing at
  // node scripts/gate.js carries exactly the same cwd dependency and must not slip through.
  const offenders = hookCommands()
    .filter((h) => /^\s*node\s+(?!["']?\$\{|["']?[A-Za-z]:|["']?[/\\])/.test(h.command))
    .filter((h) => !h.command.includes(TOKEN))
    .map((h) => `${h.source} ${h.event} [${h.matcher}]: ${h.command}`);
  assert.deepStrictEqual(
    offenders,
    [],
    'these hook commands use a cwd-relative path and go inert outside the repo root:\n  '
      + offenders.join('\n  '),
  );
});

test('hook wiring: no bare $CLAUDE_PROJECT_DIR (PowerShell reads it as $null)', () => {
  // Matches the bare form only — ${CLAUDE_PROJECT_DIR} is preceded by a brace, not a word char.
  const offenders = hookCommands()
    .filter((h) => /\$CLAUDE_PROJECT_DIR\b/.test(h.command))
    .map((h) => `${h.event} [${h.matcher}]: ${h.command}`);
  assert.deepStrictEqual(offenders, [], 'use ${CLAUDE_PROJECT_DIR} instead:\n  ' + offenders.join('\n  '));
});

test('hook wiring: every referenced hook script exists on disk', () => {
  const onDisk = new Set(hookScriptsOnDisk());
  const missing = hookScriptsRegistered().filter((name) => !onDisk.has(name));
  assert.deepStrictEqual(missing, [], 'hook scripts referenced but absent:\n  ' + missing.join('\n  '));
});

test('hook wiring: every hook script on disk is actually registered', () => {
  // The other direction. A guard that exists, is unit-tested and green, but was never wired
  // into settings.json is inert in production — and looks exactly like a working guard from
  // the test suite. Same indistinguishability this file exists to close.
  const registered = new Set(hookScriptsRegistered());
  const orphans = hookScriptsOnDisk().filter((name) => !registered.has(name));
  assert.deepStrictEqual(
    orphans,
    [],
    'hook scripts present but not wired into any settings file:\n  ' + orphans.join('\n  '),
  );
});

// --- the repro ---------------------------------------------------------------
// Both halves run the hook script the way Claude Code would, from a cwd that is NOT the
// repo root. The negative control pins the defect; the positive one pins the fix.
//
// The probe is deliberately control-bytes-guard: it requires no child_process at all and
// returns 0 on an empty tool_input. Probing with test-gate would make this file's safety
// depend on that hook's trigger condition — broaden it once and `npm test` re-enters
// `npm test` from inside the suite.
const PROBE = 'control-bytes-guard.js';

/**
 * Runs `node <script>` from a foreign cwd and returns the combined stderr.
 * @param {string} scriptPath Path to the hook script, relative or absolute.
 * @returns {string}
 */
function runFromForeignCwd(scriptPath) {
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'hookpath-'));
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: foreign,
    input: JSON.stringify({ cwd: foreign, tool_input: {} }),
    encoding: 'utf8',
    timeout: 20000,
  });
  return String(r.stderr || '');
}

test('hook wiring: a cwd-relative script path does NOT resolve outside the repo root', () => {
  // Negative control — this is the live defect, reproduced.
  const stderr = runFromForeignCwd(path.join('.claude', 'hooks', PROBE));
  assert.match(stderr, /Cannot find module/, 'expected the relative path to fail from a foreign cwd');
});

test('hook wiring: the ${CLAUDE_PROJECT_DIR}-substituted path resolves from any cwd', () => {
  // What Claude Code passes to the shell after substituting the token.
  const substituted = path.join(REPO_ROOT, '.claude', 'hooks', PROBE);
  const stderr = runFromForeignCwd(substituted);
  assert.doesNotMatch(stderr, /Cannot find module/, 'substituted path still failed to resolve:\n' + stderr);
});
