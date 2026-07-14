'use strict';

// Pure parsing/verdict logic for the package-guard hook (M5.9 slopsquatting
// defense). Spec: docs/superpowers/specs/2026-07-14-m5.9-package-guard-design.md
// §3.1-§3.3; threat model docs/superpowers/security/
// 2026-07-14-m5.9-package-guard-threat-model.md SR-01/-02/-03/-05/-06.
// NO IO in this module — everything here is unit-testable offline (spec §7).

// Spec §3.1: install invocations the guard intercepts. `npm install` without a
// save-modifier lands in `dependencies` (npm default) → relevant for SR-06.
const NPM_INSTALL_SUBCOMMANDS = new Set(['install', 'i', 'add']);
const NO_RUNTIME_SAVE_FLAGS = new Set(['-D', '--save-dev', '-O', '--save-optional', '--no-save']);
// Flags whose VALUE is a separate token (would otherwise be misread as a spec).
const VALUE_FLAGS = new Set([
  '--registry', '--prefix', '--loglevel', '--cache', '--userconfig',
  '--omit', '--include', '-w', '--workspace', '-p', '--package',
]);

/**
 * Extract package-spec tokens from every install invocation in a shell command.
 * Walks each segment of compound commands (&&, ||, ;, |, newline) — spec §3.1.
 * @param {string} command
 * @returns {{spec: string, savesToRuntimeDeps: boolean}[]}
 */
function parseInstallCommand(command) {
  const out = [];
  for (const segment of String(command || '').split(/&&|\|\||;|\||\r?\n/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const bin = tokens[0].replace(/^.*[\\/]/, ''); // tolerate full paths to the binary
    let specStart = -1;
    let ephemeral = false; // npx/npm exec: fetched+run, but never persisted to a manifest
    if (bin === 'npm' && NPM_INSTALL_SUBCOMMANDS.has(tokens[1])) specStart = 2;
    else if (bin === 'npm' && tokens[1] === 'exec') { specStart = 2; ephemeral = true; }
    else if (bin === 'npx') { specStart = 1; ephemeral = true; }
    else if ((bin === 'yarn' || bin === 'pnpm') && tokens[1] === 'add') specStart = 2;
    if (specStart < 0) continue;

    const rest = tokens.slice(specStart);
    const savesToRuntimeDeps = !ephemeral && !rest.some((t) => NO_RUNTIME_SAVE_FLAGS.has(t));
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k];
      if (t === '--') break; // everything after -- is args to the invoked tool, not specs
      if (t.startsWith('-')) {
        if (VALUE_FLAGS.has(t)) k++; // skip the flag's value token too
        continue;
      }
      out.push({ spec: t, savesToRuntimeDeps });
      if (ephemeral) break; // npx/npm exec: only the first non-flag token is the package
    }
  }
  return out;
}

module.exports = { parseInstallCommand };
