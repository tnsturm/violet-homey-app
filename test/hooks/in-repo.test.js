'use strict';

// Unit test for .claude/hooks/lib/in-repo.js — the containment predicate every
// Edit|Write guard uses to stay inside the repository it is guarding
// (docs/superpowers/notes/2026-08-22-hook-cwd-containment.md).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { isInsideGuardedRepo } = require('../../.claude/hooks/lib/in-repo.js');

/** Fixture repo: a real directory carrying a .git marker. @param {string} label */
function makeRepo(label) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'inrepo-' + label + '-')));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.mkdirSync(path.join(dir, 'drivers', 'pool'), { recursive: true });
  return dir;
}

/** Plain directory with no .git anywhere above it. */
function makeLooseDir() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'inrepo-loose-')));
}

test('in-repo: relative path resolves against cwd -> inside', () => {
  const repo = makeRepo('rel');
  assert.strictEqual(isInsideGuardedRepo(repo, path.join('lib', 'Widget.js')), true);
});

test('in-repo: absolute path under cwd -> inside', () => {
  const repo = makeRepo('abs');
  assert.strictEqual(isInsideGuardedRepo(repo, path.join(repo, 'drivers', 'pool', 'driver.js')), true);
});

test('in-repo: cwd itself -> inside', () => {
  const repo = makeRepo('self');
  assert.strictEqual(isInsideGuardedRepo(repo, repo), true);
});

test('in-repo: file in another repository -> outside', () => {
  const ours = makeRepo('ours');
  const theirs = makeRepo('theirs');
  assert.strictEqual(isInsideGuardedRepo(ours, path.join(theirs, 'lib', 'env-ready.js')), false);
});

test('in-repo: sibling whose name merely starts with ours -> outside', () => {
  // Guards against a naive startsWith() containment check.
  const ours = makeRepo('fork');
  const sibling = ours + '-fork';
  fs.mkdirSync(path.join(sibling, 'lib'), { recursive: true });
  assert.strictEqual(isInsideGuardedRepo(ours, path.join(sibling, 'lib', 'x.js')), false);
});

test('in-repo: empty / missing file path -> outside', () => {
  const repo = makeRepo('empty');
  assert.strictEqual(isInsideGuardedRepo(repo, ''), false);
  assert.strictEqual(isInsideGuardedRepo(repo, undefined), false);
});

// --- the git-root refinement -------------------------------------------------
// Anchoring on cwd alone silently disabled every guard whenever the session cwd was a
// SUBDIRECTORY of the repo — a case compose-guard.js already documents as real.

test('in-repo: cwd is a subdirectory -> a file elsewhere in the same repo is inside', () => {
  const repo = makeRepo('subdir');
  const cwd = path.join(repo, 'drivers', 'pool');
  assert.strictEqual(isInsideGuardedRepo(cwd, path.join(repo, 'lib', 'VioletClient.js')), true);
});

test('in-repo: cwd is a subdirectory -> another repo is still outside', () => {
  const repo = makeRepo('subdir2');
  const theirs = makeRepo('subdir2-theirs');
  const cwd = path.join(repo, 'drivers', 'pool');
  assert.strictEqual(isInsideGuardedRepo(cwd, path.join(theirs, 'lib', 'x.js')), false);
});

test('in-repo: a worktree carries .git as a FILE and bounds itself', () => {
  // git worktrees get a .git FILE ("gitdir: ..."), not a directory.
  const repo = makeRepo('wt-parent');
  const wt = path.join(repo, '.claude', 'worktrees', 'feature');
  fs.mkdirSync(path.join(wt, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ' + path.join(repo, '.git', 'worktrees', 'feature'));
  assert.strictEqual(isInsideGuardedRepo(wt, path.join(wt, 'lib', 'x.js')), true);
  // ...and does not swallow files of the surrounding checkout.
  assert.strictEqual(isInsideGuardedRepo(wt, path.join(repo, 'lib', 'x.js')), false);
});

test('in-repo: no .git anywhere -> falls back to plain cwd containment', () => {
  const loose = makeLooseDir();
  const cwd = path.join(loose, 'inner');
  fs.mkdirSync(path.join(cwd, 'lib'), { recursive: true });
  assert.strictEqual(isInsideGuardedRepo(cwd, path.join(cwd, 'lib', 'x.js')), true);
  assert.strictEqual(isInsideGuardedRepo(cwd, path.join(loose, 'lib', 'x.js')), false);
});

// --- path canonicalisation ---------------------------------------------------
// cwd and file_path can be spelled differently for the same location; comparing the
// raw strings makes the guard silently skip a genuine in-repo violation.

test('in-repo: cwd reached through a junction/symlink alias -> still inside', () => {
  const repo = makeRepo('link');
  const alias = path.join(os.tmpdir(), 'inrepo-alias-' + process.pid);
  try {
    fs.symlinkSync(repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    return; // unprivileged/unsupported: nothing to assert
  }
  assert.strictEqual(isInsideGuardedRepo(alias, path.join(repo, 'lib', 'x.js')), true);
});

test('in-repo: 8.3 short-name cwd vs long-name file -> still inside (win32)', { skip: process.platform !== 'win32' }, () => {
  const repo = makeRepo('eightdotthree');
  let short;
  try {
    // cmd's %~sI is the only way to ask Windows for the 8.3 spelling of a path.
    short = execSync('for %I in ("' + repo + '") do @echo %~sI', { encoding: 'utf8', shell: 'cmd.exe' }).trim();
  } catch {
    return; // no cmd.exe available
  }
  if (!short || short.toLowerCase() === repo.toLowerCase()) return; // 8.3 generation disabled on this volume
  assert.strictEqual(isInsideGuardedRepo(short, path.join(repo, 'lib', 'x.js')), true);
});
