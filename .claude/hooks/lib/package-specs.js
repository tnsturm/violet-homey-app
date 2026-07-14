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

// Spec §3.2: skip specs that don't resolve via the public registry — they are
// not squattable by name registration and remain visually auditable.
const SKIP_SPEC = /^(git\+|git:|github:|file:|link:|workspace:|https?:)/;
// Official npm name grammar (validate-npm-package-name, condensed). Rejects a
// bare `user/repo` github shorthand: unscoped names may not contain '/'.
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Resolve a dependency spec to the registry name actually fetched (SR-05:
 * `npm:` aliases verify the TARGET, never the manifest key).
 * @param {string} spec
 * @returns {string | null} registry name, or null = skip (out of registry scope)
 */
function resolveSpecName(spec) {
  let s = String(spec || '').trim();
  if (!s || SKIP_SPEC.test(s)) return null;
  if (s.startsWith('npm:')) s = s.slice(4);
  // Strip a trailing @range (the @ after position 0 — handles @scope/name@range).
  const at = s.indexOf('@', 1);
  if (at > 0) s = s.slice(0, at);
  if (!NPM_NAME.test(s)) return null;
  return s;
}

// Spec §3.1: dependency blocks the manifest path diffs. `overrides` is handled
// separately (nested tree).
const DEP_BLOCKS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * Flatten an overrides tree to [key, spec] string pairs (spec §3.1: recursive).
 * @param {object|undefined} node
 * @param {[string, string][]} acc
 * @returns {[string, string][]}
 */
function flattenOverrides(node, acc) {
  for (const [k, v] of Object.entries(node || {})) {
    if (typeof v === 'string') acc.push([k, v]);
    else if (v && typeof v === 'object') flattenOverrides(v, acc);
  }
  return acc;
}

/**
 * Registry name for a manifest entry: `npm:` aliases resolve the TARGET
 * (SR-05); plain range specs resolve the KEY; skip-specs resolve to null.
 * @param {string} key @param {string} spec
 * @returns {string | null}
 */
function entryName(key, spec) {
  if (spec.startsWith('npm:')) return resolveSpecName(spec);
  if (SKIP_SPEC.test(spec)) return null;
  return resolveSpecName(key);
}

/**
 * Diff dependency blocks pre→post; return entries that are new or have a
 * changed spec, alias-resolved to registry names (SR-01/-05/-06). A pure
 * range bump also re-verifies — harmless over-checking; the attack case is
 * the alias-target swap, which looks identical at this level.
 * @param {Record<string, any>|null} preJson pre-edit package.json (null = no pre-edit file)
 * @param {Record<string, any>} postJson post-edit package.json
 * @returns {{name: string, spec: string, depBlock: string}[]}
 */
function diffNewDeps(preJson, postJson) {
  /** @type {{name: string, spec: string, depBlock: string}[]} */
  const out = [];
  /** @param {string} blockName @param {[string, string][]} pairs @param {[string, string][]} prePairs */
  const collect = (blockName, pairs, prePairs) => {
    const pre = new Map(prePairs);
    for (const [key, spec] of pairs) {
      if (typeof spec !== 'string' || pre.get(key) === spec) continue;
      const name = entryName(key, spec);
      if (name) out.push({ name, spec, depBlock: blockName });
    }
  };
  for (const b of DEP_BLOCKS) {
    collect(b,
      Object.entries((postJson || {})[b] || {}),
      Object.entries((preJson || {})[b] || {}));
  }
  collect('overrides',
    flattenOverrides((postJson || {}).overrides, []),
    flattenOverrides((preJson || {}).overrides, []));
  return out;
}

/**
 * Policy verdict for one package's registry metadata (spec §3.3 rules table;
 * SR-01/SR-02/SR-04). Boundary semantics: exactly minAgeDays / exactly
 * minWeeklyDownloads → pass.
 * @param {{exists: boolean, createdAt: string|null, weeklyDownloads: number|null}} meta
 * @param {number} nowMs
 * @param {{minAgeDays?: number, minWeeklyDownloads?: number}} [opts]
 * @returns {{ok: true} | {ok: false, rule: string}}
 */
function verdict(meta, nowMs, opts) {
  const { minAgeDays = 90, minWeeklyDownloads = 500 } = opts || {};
  if (!meta.exists) return { ok: false, rule: 'not-found' };
  const createdMs = meta.createdAt ? Date.parse(meta.createdAt) : NaN;
  if (!Number.isFinite(createdMs) || typeof meta.weeklyDownloads !== 'number') {
    // SR-04: incomplete metadata = unverified → fail closed, never silently allow.
    return { ok: false, rule: 'verify-unavailable' };
  }
  if ((nowMs - createdMs) / 86400000 < minAgeDays) return { ok: false, rule: 'too-new' };
  if (meta.weeklyDownloads < minWeeklyDownloads) return { ok: false, rule: 'low-adoption' };
  return { ok: true };
}

/**
 * All names a manifest already vouches for: dependency-block KEYS (what a
 * reinstall command names) plus alias-resolved registry TARGETS. Used to keep
 * existing deps from ever re-blocking (SR-01 no-self-DoS).
 * @param {Record<string, any>|null} manifest parsed package.json
 * @returns {Set<string>}
 */
function knownDepNames(manifest) {
  const known = new Set();
  for (const b of DEP_BLOCKS) {
    for (const key of Object.keys((manifest || {})[b] || {})) known.add(key);
  }
  for (const [key] of flattenOverrides((manifest || {}).overrides, [])) known.add(key);
  for (const { name } of diffNewDeps(null, manifest || {})) known.add(name);
  return known;
}

module.exports = { parseInstallCommand, resolveSpecName, diffNewDeps, verdict, knownDepNames };
