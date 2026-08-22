'use strict';

// Guarded-repo containment (pure helper) — notes/2026-08-22-hook-cwd-containment.md
// (docs/superpowers/notes/2026-08-22-hook-cwd-containment.md).
//
// Every Edit|Write guard here decides WHAT to enforce from the file path alone, so an
// absolute path in ANOTHER repository that happens to carry a guarded segment (lib/,
// drivers/, docs/dashboard/, a .homeychangelog.json basename) was treated as one of our
// source files. Observed 2026-08-21: editing skill-agentic-loop-framework's
// templates/.claude/hooks/lib/env-ready.js from a VioletApp session was blocked by
// docs-header-guard over a header that repo does not use. Guards enforce THIS project's
// conventions, so they have to stay inside THIS project's tree.
//
// The bound is the REPOSITORY containing the session cwd, not the cwd itself: a session
// started in a subdirectory (cwd = <repo>/drivers/pool) must still guard <repo>/lib/*,
// and compose-guard.js documents that Claude Code does hand out a cwd that is a subdir
// or parent of the edited file's repo. Both sides are canonicalised before comparing,
// because the same location can be spelled differently on Windows (8.3 short names,
// junctions) and a raw string compare would silently skip a real violation.

const fs = require('fs');
const path = require('path');

/**
 * Canonical spelling of `p`: resolves 8.3 short names, junctions and symlinks. Paths
 * that do not exist yet (a Write creating a new file) canonicalise their longest
 * existing ancestor and keep the remaining segments verbatim.
 * @param {string} p absolute path
 * @returns {string}
 */
function canonical(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p; // drive/filesystem root — nothing left to resolve
    return path.join(canonical(parent), path.basename(p));
  }
}

/**
 * Nearest ancestor of `dir` (inclusive) carrying a `.git` entry. A linked worktree has
 * `.git` as a FILE rather than a directory, which is why existence is enough — that is
 * also what makes a worktree bound itself instead of its surrounding checkout. Falls
 * back to `dir` when nothing above it is a repository, preserving plain-cwd behaviour.
 * @param {string} dir absolute path
 * @returns {string}
 */
function repoRootFor(dir) {
  let cur = dir;
  for (;;) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return dir;
    cur = parent;
  }
}

/**
 * Whether `filePath` belongs to the repository the session is working in. Relative paths
 * resolve against `cwd` and are inside by construction; an absolute path in another
 * checkout is not. Comparison is on canonical resolved paths, so a sibling directory
 * whose name merely starts with ours (`repo-fork` vs `repo`) is correctly outside — as
 * is a different Windows drive, where path.relative() returns an absolute path.
 *
 * @param {string} cwd the session cwd (hook input `cwd`); the repository containing it
 *   is the actual bound
 * @param {string} [filePath] tool_input.file_path (absolute or relative); a missing or
 *   empty path is never inside anything, so callers can pass theirs unchecked
 * @returns {boolean}
 */
function isInsideGuardedRepo(cwd, filePath) {
  if (!filePath) return false;
  const start = path.resolve(cwd || process.cwd());
  const base = canonical(repoRootFor(start));
  const abs = canonical(path.resolve(start, filePath));
  const rel = path.relative(base, abs);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

module.exports = { isInsideGuardedRepo };
