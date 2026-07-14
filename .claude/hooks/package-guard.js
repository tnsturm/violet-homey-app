'use strict';

// PreToolUse hook (matchers: Bash|PowerShell AND Edit|Write) — M5.9 slopsquatting
// defense. Blocks (exit 2) agent-initiated npm installs and package.json edits
// that introduce UNVERIFIED package names: nonexistent on the registry
// (hallucinated), suspiciously fresh, barely adopted, or unverifiable because
// the registry is unreachable. Spec: docs/superpowers/specs/
// 2026-07-14-m5.9-package-guard-design.md §3; threat model docs/superpowers/
// security/2026-07-14-m5.9-package-guard-threat-model.md (SR-01..SR-10).
//
// Failure-mode asymmetry (spec §3.3, deliberate): harness-input parse errors
// fail OPEN (stdin comes from the trusted harness — house convention, cf.
// secrets-guard.js); the NETWORK verification path fails CLOSED (SR-04: a gate
// an attacker can disable via timeout is not a gate).
//
// Override path (SR-10): hooks only intercept agent tool calls — a human
// installing in their own terminal bypasses this guard BY DESIGN.
//
// Framework-mirror note: the copy in skill-agentic-loop-framework/templates
// ships BLOCK_RUNTIME_DEPS = false (generic projects have runtime deps) — the
// ONLY allowed divergence between the two copies (spec §6).

const fs = require('fs');
const path = require('path');
const { logHook } = require('./lib/log');
const {
  parseInstallCommand, resolveSpecName, diffNewDeps, verdict, knownDepNames,
} = require('./lib/package-specs');

// Spec §3.3 thresholds — single source of truth for the policy.
const MIN_AGE_DAYS = 90;
const MIN_WEEKLY_DOWNLOADS = 500;
const REQUEST_TIMEOUT_MS = Number(process.env.PACKAGE_GUARD_TIMEOUT_MS) || 5000;
// SR-06: this project's `dependencies` stays exactly {} (published Homey apps
// bundle runtime deps to end users' devices).
const BLOCK_RUNTIME_DEPS = true;
// Test seams (spec §3.4): overridable registry endpoints.
const REGISTRY_BASE = process.env.PACKAGE_GUARD_REGISTRY_BASE || 'https://registry.npmjs.org';
const DOWNLOADS_BASE = process.env.PACKAGE_GUARD_DOWNLOADS_BASE || 'https://api.npmjs.org';

const REASONS = {
  'not-found': 'the package does not exist on the npm registry (possible hallucinated/slopsquat name)',
  'too-new': `the package was first published less than ${MIN_AGE_DAYS} days ago`,
  'low-adoption': `the package has fewer than ${MIN_WEEKLY_DOWNLOADS} weekly downloads`,
  'verify-unavailable': 'the npm registry could not be reached to verify the package (fail closed, SR-04)',
  'runtime-dep': 'runtime dependencies must stay {} in this project — use devDependencies (SR-06)',
};

/**
 * GET a JSON document. Resolves {status, body} or {error: true} — never throws.
 * Metadata-only (SR-08): the guard never downloads the package itself.
 * @param {string} url
 * @returns {Promise<{status?: number, body?: any, error?: boolean}>}
 */
function fetchJson(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? require('https') : require('http');
    const req = mod.get(url, { headers: { accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ error: true }));
  });
}

/**
 * Registry metadata for one name, shaped for verdict() (spec §3.3 step 5).
 * @param {string} name
 * @returns {Promise<{exists: boolean, createdAt: string|null, weeklyDownloads: number|null}>}
 */
async function fetchMeta(name) {
  const reg = await fetchJson(`${REGISTRY_BASE}/${encodeURIComponent(name)}`);
  // Network error or non-404 oddity → exists w/o data → verdict = verify-unavailable.
  if (reg.error) return { exists: true, createdAt: null, weeklyDownloads: null };
  if (reg.status === 404) return { exists: false, createdAt: null, weeklyDownloads: null };
  const createdAt = (reg.body && reg.body.time && typeof reg.body.time.created === 'string')
    ? reg.body.time.created : null;
  // Downloads API takes scoped names with a literal slash.
  const dl = await fetchJson(`${DOWNLOADS_BASE}/downloads/point/last-week/${name}`);
  const weeklyDownloads = (!dl.error && dl.body && typeof dl.body.downloads === 'number')
    ? dl.body.downloads : null;
  return { exists: true, createdAt, weeklyDownloads };
}

/**
 * Print the block message (SR-10: name + rule + override path) and exit 2.
 * @param {string} name @param {string} rule @param {string|undefined} cwd
 * @returns {never}
 */
function block(name, rule, cwd) {
  logHook('package-guard', 'block', cwd);
  console.error(
    `package-guard: blocking "${name}" (rule: ${rule}) — `
    + `${REASONS[/** @type {keyof REASONS} */ (rule)] || rule}. `
    + `If intentional, install it manually in your own terminal.`
  );
  process.exit(2);
}

/**
 * Read+parse a JSON file; null on any error (missing pre-edit file is legal).
 * @param {string} p
 * @returns {Record<string, any>|null}
 */
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** @param {any} input harness stdin payload */
async function main(input) {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();

  /** @type {{name: string, isRuntimeDep: boolean}[]} */
  let candidates = [];

  if (tool === 'Bash' || tool === 'PowerShell') {
    const entries = parseInstallCommand(ti.command || '');
    if (entries.length === 0) process.exit(0); // no install → zero IO (spec §7 perf)
    const known = knownDepNames(readJson(path.join(cwd, 'package.json')));
    const seen = new Set();
    for (const e of entries) {
      const name = resolveSpecName(e.spec);
      if (!name || known.has(name) || seen.has(name)) continue; // SR-01: no self-DoS on reinstalls
      seen.add(name);
      candidates.push({ name, isRuntimeDep: e.savesToRuntimeDeps });
    }
  } else if (tool === 'Edit' || tool === 'Write') {
    const filePath = String(ti.file_path || '');
    const norm = filePath.replace(/\\/g, '/');
    if (!/(^|\/)package\.json$/.test(norm) || /(^|\/)node_modules\//.test(norm)) process.exit(0);
    const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
    const preText = (() => { try { return fs.readFileSync(abs, 'utf8'); } catch { return null; } })();

    let postText;
    if (tool === 'Write') {
      postText = typeof ti.content === 'string' ? ti.content : null;
    } else {
      // Edit: reconstruct the post-edit file from the pre-edit disk state.
      if (preText === null || typeof ti.old_string !== 'string' || !preText.includes(ti.old_string)) {
        process.exit(0); // the Edit itself will fail → nothing to guard
      }
      postText = ti.replace_all
        ? preText.split(ti.old_string).join(ti.new_string || '')
        : preText.replace(ti.old_string, ti.new_string || '');
    }
    if (typeof postText !== 'string') process.exit(0);

    /** @type {Record<string, any>|null} */
    let post = null;
    try { post = JSON.parse(postText); } catch { process.exit(0); } // json-guard's job
    const pre = preText === null ? null : (() => { try { return JSON.parse(preText); } catch { return null; } })();
    candidates = diffNewDeps(pre, /** @type {Record<string, any>} */ (post))
      .map((d) => ({ name: d.name, isRuntimeDep: d.depBlock === 'dependencies' }));
  } else {
    process.exit(0);
  }

  if (candidates.length === 0) { logHook('package-guard', 'pass', cwd); process.exit(0); }

  // SR-06 first — a policy violation needs no registry round-trip.
  if (BLOCK_RUNTIME_DEPS) {
    const rt = candidates.find((c) => c.isRuntimeDep);
    if (rt) block(rt.name, 'runtime-dep', cwd);
  }

  // SR-01/SR-02/SR-04: verify each new name against the registry.
  for (const c of candidates) {
    const v = verdict(await fetchMeta(c.name), Date.now(),
      { minAgeDays: MIN_AGE_DAYS, minWeeklyDownloads: MIN_WEEKLY_DOWNLOADS });
    if (!v.ok) block(c.name, /** @type {{ok: false, rule: string}} */ (v).rule, cwd);
  }

  logHook('package-guard', 'pass', cwd);
  process.exit(0);
}

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0); // trusted-harness input unparseable → fail open (house convention)
  }
  main(input).catch(() => process.exit(0)); // own bugs never block the loop
});
