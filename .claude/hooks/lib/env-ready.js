'use strict';

// Toolchain-readiness probe (pure helper) — /insights report 2026-08-21.
// A gate that runs the project's own suite must tell two things apart:
//   "the check ran and failed"  -> a real finding, block (exit 2)
//   "the check could not run"   -> nothing was verified, don't block
// test-gate.js already made that distinction for a failed spawn (status === null); a fresh
// worktree whose node_modules were never installed belongs in the same category but exits
// non-zero with MODULE_NOT_FOUND, so it used to read as "tests red" and blocked EVERY commit
// for a whole session (memory: worktree-npm-ci-required). This helper is the shared probe.
// Deliberately narrow: it reports only the one condition it can prove from the filesystem —
// everything it cannot prove stays a real finding for the gate.

const fs = require('fs');
const path = require('path');

/**
 * Reason the guarded repo's toolchain is provably not installed, or null when it is installed,
 * nothing is declared, or we cannot tell. Never throws.
 * @param {string} cwd Guarded repo root.
 * @returns {string|null} Human-readable reason for a gate to print, or null to proceed.
 */
function toolchainMissing(cwd) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null; // no readable manifest -> not ours to judge (fail open)
  }
  const declared = Object.keys(pkg.dependencies || {}).length
    + Object.keys(pkg.devDependencies || {}).length;
  if (declared === 0) return null; // nothing to install -> a red suite is a real finding
  if (fs.existsSync(path.join(cwd, 'node_modules'))) return null;
  return `${declared} dependencies are declared but node_modules is missing — run "npm ci" first`;
}

module.exports = { toolchainMissing };
