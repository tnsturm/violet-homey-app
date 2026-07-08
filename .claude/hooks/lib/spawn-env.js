'use strict';

// Spawn env for nested node:test runs (pure helper) — M4.8 spec §3 D7, dedupe of
// the M4.6/M4.7 lesson (docs/superpowers/specs/2026-07-09-m4.8-loop-hardening-autonomy-metaloop.md):
// inherited NODE_TEST_CONTEXT/NODE_TEST_WORKER_ID flip a child `node --test`
// into the runner's child protocol — exit 0 despite failures, no readable TAP.

/**
 * process.env copy without the node:test child-process markers (spec D7).
 * @returns {Object<string, string|undefined>} Env safe for spawning nested suites.
 */
function spawnEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  return env;
}

module.exports = { spawnEnv };
