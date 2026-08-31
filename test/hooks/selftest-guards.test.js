'use strict';

// Unit tests for .claude/hooks/selftest-guards.js — the SessionStart self-test that makes a
// disarmed gate net AUDIBLE at session start instead of silently inert.
//
// Why it exists (M9.0b, /insights + /doctor 2026-08-31): the commit-time invariant
// (hook-command-paths.test.js) only fires when a commit happens. The window before that —
// a fresh worktree without `npm ci`, a stale second clone, an unresolvable hook path — is
// exactly where 2026-08-27 produced five test-gate skip records that nobody read. A
// SessionStart hook prints its findings to stdout, which Claude Code injects into the
// session context, so the MODEL sees the warning — not just a ledger file.
//
// Contract: always exit 0 (fail-open — a broken self-test must never block a session), but
// never silently: every finding is one stdout line prefixed "selftest-guards:". A clean
// repo produces NO output (SessionStart stdout costs context; silence is the common case).
// The repo root is anchored on the hook file's own location (__dirname/../..), deliberately
// NOT on the session cwd — the wrong-clone trap is the exact scenario under test.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_SRC = path.join(REPO_ROOT, '.claude', 'hooks', 'selftest-guards.js');
const LIB_SRC = path.join(REPO_ROOT, '.claude', 'hooks', 'lib');

/**
 * Build a fixture checkout: .claude/hooks with the hook under test + lib helpers,
 * a settings.json wiring up the given hook commands, and optional package.json.
 * @param {string} label
 * @param {{settings?: object|string, localSettings?: object, packageJson?: object,
 *          nodeModules?: boolean, extraHooks?: string[]}} [opts]
 * @returns {string} fixture root
 */
function makeFixture(label, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'selftest-' + label + '-'));
  fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.copyFileSync(HOOK_SRC, path.join(root, '.claude', 'hooks', 'selftest-guards.js'));
  fs.cpSync(LIB_SRC, path.join(root, '.claude', 'hooks', 'lib'), { recursive: true });
  for (const name of opts.extraHooks || []) {
    fs.writeFileSync(path.join(root, '.claude', 'hooks', name), '// fixture hook\n');
  }
  if (opts.settings !== undefined) {
    const body = typeof opts.settings === 'string' ? opts.settings : JSON.stringify(opts.settings, null, 2);
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), body);
  }
  if (opts.localSettings !== undefined) {
    fs.writeFileSync(path.join(root, '.claude', 'settings.local.json'), JSON.stringify(opts.localSettings, null, 2));
  }
  if (opts.packageJson !== undefined) {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(opts.packageJson, null, 2));
  }
  if (opts.nodeModules) {
    fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  }
  return root;
}

/** Wire one hook command into a minimal settings shape. @param {string[]} commands */
function settingsWith(commands) {
  return {
    hooks: {
      PreToolUse: [
        { matcher: 'Bash|PowerShell', hooks: commands.map((c) => ({ type: 'command', command: c })) },
      ],
    },
  };
}

/**
 * Run the fixture's copy of the hook from a FOREIGN cwd (the wrong-clone scenario).
 * @param {string} fixtureRoot
 */
function runSelftest(fixtureRoot) {
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'selftest-cwd-'));
  const r = spawnSync(process.execPath, [path.join(fixtureRoot, '.claude', 'hooks', 'selftest-guards.js')], {
    cwd: foreign,
    input: '{}',
    encoding: 'utf8',
    timeout: 15000,
  });
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

test('selftest-guards: clean repo -> exit 0 and NO output', () => {
  const root = makeFixture('clean', {
    settings: settingsWith(['node "${CLAUDE_PROJECT_DIR}/.claude/hooks/probe.js"']),
    extraHooks: ['probe.js'],
    packageJson: { name: 'fx', version: '1.0.0' }, // no deps declared -> node_modules not required
  });
  const r = runSelftest(root);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout.trim(), '', 'clean repo must stay silent, got: ' + r.stdout);
});

test('selftest-guards: registered hook script missing on disk -> audible, exit 0', () => {
  const root = makeFixture('missing', {
    settings: settingsWith(['node "${CLAUDE_PROJECT_DIR}/.claude/hooks/ghost.js"']),
    packageJson: { name: 'fx', version: '1.0.0' },
  });
  const r = runSelftest(root);
  assert.strictEqual(r.status, 0, 'must fail open');
  assert.match(r.stdout, /selftest-guards:/);
  assert.match(r.stdout, /ghost\.js/, 'must name the missing script');
});

test('selftest-guards: declared deps but no node_modules -> audible npm ci hint, exit 0', () => {
  const root = makeFixture('nodeps', {
    settings: settingsWith(['node "${CLAUDE_PROJECT_DIR}/.claude/hooks/probe.js"']),
    extraHooks: ['probe.js'],
    packageJson: { name: 'fx', version: '1.0.0', devDependencies: { 'some-tool': '^1.0.0' } },
  });
  const r = runSelftest(root);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /node_modules/, 'must name the missing node_modules');
  assert.match(r.stdout, /npm ci/, 'must name the remedy');
});

test('selftest-guards: node_modules present -> deps check stays silent', () => {
  const root = makeFixture('depsok', {
    settings: settingsWith(['node "${CLAUDE_PROJECT_DIR}/.claude/hooks/probe.js"']),
    extraHooks: ['probe.js'],
    packageJson: { name: 'fx', version: '1.0.0', devDependencies: { 'some-tool': '^1.0.0' } },
    nodeModules: true,
  });
  const r = runSelftest(root);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout.trim(), '');
});

test('selftest-guards: cwd-relative hook path in settings.local.json -> audible, exit 0', () => {
  // The exact regression the commit-time invariant cannot see before the first commit.
  const root = makeFixture('relative', {
    settings: settingsWith(['node "${CLAUDE_PROJECT_DIR}/.claude/hooks/probe.js"']),
    localSettings: settingsWith(['node .claude/hooks/probe.js']),
    extraHooks: ['probe.js'],
    packageJson: { name: 'fx', version: '1.0.0' },
  });
  const r = runSelftest(root);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /settings\.local\.json/, 'must name the offending file');
  assert.match(r.stdout, /cwd/i, 'must say why the relative form is a problem');
});

test('selftest-guards: unparseable settings.json -> audible fail-open, exit 0', () => {
  // M9.0b rule: a fail-open path must be audible — a settings file that stopped parsing
  // means NO hooks load at all, which must not look like a clean start.
  const root = makeFixture('broken', {
    settings: '{ this is not json',
    packageJson: { name: 'fx', version: '1.0.0' },
  });
  const r = runSelftest(root);
  assert.strictEqual(r.status, 0, 'must fail open');
  assert.match(r.stdout, /settings\.json/, 'must name the unreadable file');
});
