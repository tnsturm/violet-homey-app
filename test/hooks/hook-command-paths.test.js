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
const SETTINGS = path.join(REPO_ROOT, '.claude', 'settings.json');
const TOKEN = '${CLAUDE_PROJECT_DIR}';

/** Every {event, matcher, command} triple configured in .claude/settings.json. */
function hookCommands() {
  const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  const out = [];
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    for (const group of groups || []) {
      for (const hook of group.hooks || []) {
        if (typeof hook.command === 'string') {
          out.push({ event, matcher: group.matcher || '(none)', command: hook.command });
        }
      }
    }
  }
  return out;
}

test('hook wiring: settings.json actually declares hooks', () => {
  // Guards the assertions below from passing vacuously if the hooks block ever moves.
  assert.ok(hookCommands().length > 0, 'no hook commands found in .claude/settings.json');
});

test('hook wiring: every hook command resolves its script via ${CLAUDE_PROJECT_DIR}', () => {
  const offenders = hookCommands()
    .filter((h) => /\.claude[/\\]hooks[/\\]/.test(h.command) && !h.command.includes(TOKEN))
    .map((h) => `${h.event} [${h.matcher}]: ${h.command}`);
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
  const missing = [];
  for (const h of hookCommands()) {
    const m = h.command.match(/[.]claude[/\\]hooks[/\\][A-Za-z0-9._-]+\.js/);
    if (!m) continue;
    const rel = m[0].split('\\').join('/');
    if (!fs.existsSync(path.join(REPO_ROOT, rel))) missing.push(`${h.event}: ${rel}`);
  }
  assert.deepStrictEqual(missing, [], 'hook scripts referenced but absent:\n  ' + missing.join('\n  '));
});

// --- the repro ---------------------------------------------------------------
// Both halves run the hook script the way Claude Code would, from a cwd that is NOT the
// repo root. The negative control pins the defect; the positive one pins the fix.

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
  const stderr = runFromForeignCwd(path.join('.claude', 'hooks', 'test-gate.js'));
  assert.match(stderr, /Cannot find module/, 'expected the relative path to fail from a foreign cwd');
});

test('hook wiring: the ${CLAUDE_PROJECT_DIR}-substituted path resolves from any cwd', () => {
  // What Claude Code passes to the shell after substituting the token.
  const substituted = path.join(REPO_ROOT, '.claude', 'hooks', 'test-gate.js');
  const stderr = runFromForeignCwd(substituted);
  assert.doesNotMatch(stderr, /Cannot find module/, 'substituted path still failed to resolve:\n' + stderr);
});
