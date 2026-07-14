'use strict';

// Tests for .claude/hooks/package-guard.js + lib/package-specs.js (M5.9).
// Spec: docs/superpowers/specs/2026-07-14-m5.9-package-guard-design.md §3, §7.
// Unit tests hit the pure lib directly (offline); hook tests spawn the hook
// against a local node:http stub registry — NO real network anywhere here.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync, spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'package-guard.js');
const { parseInstallCommand, resolveSpecName, diffNewDeps, verdict } = require('../../.claude/hooks/lib/package-specs');

/** @param {string} cmd */
const specsOf = (cmd) => parseInstallCommand(cmd).map((e) => e.spec);

test('parse: plain npm install with two specs', () => {
  assert.deepStrictEqual(specsOf('npm install lodash left-pad'), ['lodash', 'left-pad']);
});

test('parse: npm i alias, scoped + versioned specs', () => {
  assert.deepStrictEqual(specsOf('npm i @scope/pkg@^1.2.3 foo@2'), ['@scope/pkg@^1.2.3', 'foo@2']);
});

test('parse: bare npm install / npm ci → no specs', () => {
  assert.deepStrictEqual(specsOf('npm install'), []);
  assert.deepStrictEqual(specsOf('npm ci'), []);
});

test('parse: compound command finds install segment', () => {
  assert.deepStrictEqual(specsOf('git pull && npm install evil-pkg; npm test'), ['evil-pkg']);
});

test('parse: flags skipped, value-flags consume their value', () => {
  assert.deepStrictEqual(specsOf('npm install --registry https://x.example lodash'), ['lodash']);
  assert.deepStrictEqual(specsOf('npm i -D --loglevel silent typescript'), ['typescript']);
});

test('parse: npx / npm exec take first non-flag token', () => {
  assert.deepStrictEqual(specsOf('npx --yes cowsay hello'), ['cowsay']);
  assert.deepStrictEqual(specsOf('npm exec prettier -- --write .'), ['prettier']);
});

test('parse: yarn add / pnpm add', () => {
  assert.deepStrictEqual(specsOf('yarn add foo && pnpm add bar'), ['foo', 'bar']);
});

test('parse: leading env-var assignment prefix does not hide the install (security-review Vuln 1)', () => {
  assert.deepStrictEqual(specsOf('CI=true npm install evil-pkg'), ['evil-pkg']);
  assert.deepStrictEqual(specsOf('HUSKY=0 npm_config_registry=https://x npm i -D fake'), ['fake']);
  // The env prefix does not turn a non-install into one.
  assert.deepStrictEqual(specsOf('FOO=bar node script.js'), []);
});

test('parse: npx/npm exec --package value IS the verified spec (security-review Vuln 2)', () => {
  assert.deepStrictEqual(specsOf('npx --package evil-tool run-it'), ['evil-tool']);
  assert.deepStrictEqual(specsOf('npx -p evil-tool cmd'), ['evil-tool']);
  assert.deepStrictEqual(specsOf('npm exec --package evil-tool -- cmd'), ['evil-tool']);
  assert.deepStrictEqual(specsOf('npx --package=evil-inline run'), ['evil-inline']);
  // Multiple --package: verify all of them.
  assert.deepStrictEqual(specsOf('npx -p a -p b cmd').sort(), ['a', 'b']);
  // Plain `npx <pkg>` still works (no --package).
  assert.deepStrictEqual(specsOf('npx cowsay hi'), ['cowsay']);
  // Ephemeral positional is per-segment: a later npx segment is not swallowed
  // by an earlier install's specs.
  assert.deepStrictEqual(specsOf('npm i lodash && npx foo'), ['lodash', 'foo']);
  // Non-ephemeral -w/--workspace value stays a skipped flag value (not a spec).
  assert.deepStrictEqual(specsOf('npm i -w pkgs/foo lodash'), ['lodash']);
});

test('parse: non-install commands → empty', () => {
  assert.deepStrictEqual(specsOf('npm test'), []);
  // Segment head is git, not npm — quoted text inside is never parsed as an install.
  assert.deepStrictEqual(specsOf('git commit -m "npm install lodash"'), []);
  assert.deepStrictEqual(specsOf('node script.js'), []);
});

test('parse: savesToRuntimeDeps semantics', () => {
  assert.strictEqual(parseInstallCommand('npm install foo')[0].savesToRuntimeDeps, true);
  assert.strictEqual(parseInstallCommand('npm i -D foo')[0].savesToRuntimeDeps, false);
  assert.strictEqual(parseInstallCommand('npm install --no-save foo')[0].savesToRuntimeDeps, false);
  assert.strictEqual(parseInstallCommand('npx foo')[0].savesToRuntimeDeps, false);
  assert.strictEqual(parseInstallCommand('yarn add foo')[0].savesToRuntimeDeps, true);
  // Global installs never land in the project manifest (code-review finding 2).
  assert.strictEqual(parseInstallCommand('npm i -g some-cli')[0].savesToRuntimeDeps, false);
  assert.strictEqual(parseInstallCommand('npm install --global some-cli')[0].savesToRuntimeDeps, false);
});

test('resolve: plain, versioned, scoped', () => {
  assert.strictEqual(resolveSpecName('lodash'), 'lodash');
  assert.strictEqual(resolveSpecName('foo@^1.2.3'), 'foo');
  assert.strictEqual(resolveSpecName('@scope/pkg@2.0.0'), '@scope/pkg');
  assert.strictEqual(resolveSpecName('@scope/pkg'), '@scope/pkg');
});

test('resolve: npm: alias → target name (SR-05)', () => {
  assert.strictEqual(resolveSpecName('npm:homey-apps-sdk-v3-types@^0.3.12'), 'homey-apps-sdk-v3-types');
  assert.strictEqual(resolveSpecName('npm:@real/scope-pkg@1'), '@real/scope-pkg');
});

test('resolve: git/file/url/workspace specs skipped (spec §3.2)', () => {
  for (const s of ['github:user/repo', 'git+https://x.git', 'git://x.git',
                   'file:../local', 'link:../x', 'workspace:*',
                   'https://x.example/a.tgz', 'http://x/a.tgz', 'user/repo']) {
    assert.strictEqual(resolveSpecName(s), null, s);
  }
});

test('resolve: invalid npm names → null', () => {
  assert.strictEqual(resolveSpecName('UPPER_CASE'), null);
  assert.strictEqual(resolveSpecName('.hidden'), null);
  assert.strictEqual(resolveSpecName(''), null);
});

const PRE = { dependencies: {}, devDependencies: { typescript: '^5.0.0', '@types/node': 'npm:other-types@^1' } };

test('diff: unchanged deps → empty (SR-01 no self-DoS)', () => {
  assert.deepStrictEqual(diffNewDeps(PRE, PRE), []);
});

test('diff: new devDep detected with depBlock', () => {
  const post = { ...PRE, devDependencies: { ...PRE.devDependencies, 'new-pkg': '^1.0.0' } };
  assert.deepStrictEqual(diffNewDeps(PRE, post),
    [{ name: 'new-pkg', spec: '^1.0.0', depBlock: 'devDependencies' }]);
});

test('diff: changed spec re-verifies; alias target resolved (SR-05)', () => {
  const post = { ...PRE, devDependencies: { ...PRE.devDependencies, '@types/node': 'npm:evil-types@^2' } };
  assert.deepStrictEqual(diffNewDeps(PRE, post),
    [{ name: 'evil-types', spec: 'npm:evil-types@^2', depBlock: 'devDependencies' }]);
});

test('diff: runtime dep addition lands in dependencies block (SR-06)', () => {
  const post = { ...PRE, dependencies: { sneaky: '1.0.0' } };
  assert.deepStrictEqual(diffNewDeps(PRE, post),
    [{ name: 'sneaky', spec: '1.0.0', depBlock: 'dependencies' }]);
});

test('diff: overrides walked recursively; git specs skipped', () => {
  const post = {
    ...PRE,
    overrides: { a: { b: 'npm:deep-override@1' } },
    devDependencies: { ...PRE.devDependencies, g: 'github:u/r' },
  };
  assert.deepStrictEqual(diffNewDeps(PRE, post),
    [{ name: 'deep-override', spec: 'npm:deep-override@1', depBlock: 'overrides' }]);
});

test('diff: null pre (new file) → all entries new', () => {
  assert.strictEqual(diffNewDeps(null, PRE).length, 2);
});

const NOW = Date.parse('2026-07-14T00:00:00Z');
/** @param {number} d */
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

test('verdict: not-found / too-new / low-adoption / pass / boundaries', () => {
  assert.deepStrictEqual(verdict({ exists: false, createdAt: null, weeklyDownloads: null }, NOW), { ok: false, rule: 'not-found' });
  assert.deepStrictEqual(verdict({ exists: true, createdAt: daysAgo(10), weeklyDownloads: 9999 }, NOW), { ok: false, rule: 'too-new' });
  assert.deepStrictEqual(verdict({ exists: true, createdAt: daysAgo(400), weeklyDownloads: 12 }, NOW), { ok: false, rule: 'low-adoption' });
  assert.deepStrictEqual(verdict({ exists: true, createdAt: daysAgo(400), weeklyDownloads: 50000 }, NOW), { ok: true });
  // Boundaries pass (spec §7): exactly 90 days, exactly 500 downloads.
  assert.deepStrictEqual(verdict({ exists: true, createdAt: daysAgo(90), weeklyDownloads: 500 }, NOW), { ok: true });
  // Missing metadata on an existing package → fail closed (SR-04).
  assert.deepStrictEqual(verdict({ exists: true, createdAt: null, weeklyDownloads: 500 }, NOW), { ok: false, rule: 'verify-unavailable' });
  assert.deepStrictEqual(verdict({ exists: true, createdAt: daysAgo(400), weeklyDownloads: null }, NOW), { ok: false, rule: 'verify-unavailable' });
});

// ---- hook spawn tests (stub registry, spec §7) ----

/**
 * Start a stub registry+downloads server, run fn(base, hits), tear down.
 * Routes: {'/name': registryDoc, '/downloads/point/last-week/name': {downloads: n}}.
 * @param {Record<string, object>} routes
 * @param {(base: string, hits: string[]) => Promise<void>} fn
 */
function withStub(routes, fn) {
  return new Promise((resolve, reject) => {
    /** @type {string[]} */
    const hits = [];
    const srv = http.createServer((req, res) => {
      hits.push(String(req.url));
      const body = routes[decodeURIComponent(String(req.url))];
      res.statusCode = body ? 200 : 404;
      res.end(JSON.stringify(body || {}));
    });
    srv.listen(0, '127.0.0.1', async () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (srv.address());
      const base = `http://127.0.0.1:${addr.port}`;
      try { await fn(base, hits); resolve(undefined); } catch (e) { reject(e); } finally { srv.close(); }
    });
  });
}

/**
 * Sync spawn — ONLY for tests without a live in-process stub (spawnSync blocks
 * the event loop, which would deadlock the stub server until the hook times out).
 * @param {object} input hook stdin payload
 * @param {Record<string, string>} [env]
 */
function runHook(input, env) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
  return { code: r.status, err: (r.stderr || '').trim() };
}

/**
 * Async spawn — for tests that talk to the in-process stub registry.
 * @param {object} input hook stdin payload
 * @param {Record<string, string>} [env]
 * @returns {Promise<{code: number|null, err: string}>}
 */
function runHookAsync(input, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], { env: { ...process.env, ...(env || {}) } });
    let err = '';
    child.stderr.on('data', (c) => { err += c; });
    child.on('close', (code) => resolve({ code, err: err.trim() }));
    child.stdin.end(JSON.stringify(input));
  });
}

const OLD_OK = { time: { created: '2020-01-01T00:00:00Z' } };

test('hook: not-found blocks with name + rule in stderr (SR-01/SR-10)', async () => {
  await withStub({}, async (base) => {
    const { code, err } = await runHookAsync(
      { tool_name: 'Bash', tool_input: { command: 'npm i -D ghost-pkg-xyz' } },
      { PACKAGE_GUARD_REGISTRY_BASE: base, PACKAGE_GUARD_DOWNLOADS_BASE: base });
    assert.strictEqual(code, 2, err);
    assert.match(err, /ghost-pkg-xyz/);
    assert.match(err, /not-found/);
    assert.match(err, /manually in your own terminal/);
  });
});

test('hook: too-new and low-adoption block; old+popular passes (SR-02)', async () => {
  const fresh = { time: { created: new Date(Date.now() - 10 * 86400000).toISOString() } };
  await withStub({
    '/fresh-pkg': fresh, '/downloads/point/last-week/fresh-pkg': { downloads: 99999 },
    '/quiet-pkg': OLD_OK, '/downloads/point/last-week/quiet-pkg': { downloads: 3 },
    '/good-pkg': OLD_OK, '/downloads/point/last-week/good-pkg': { downloads: 8888 },
  }, async (base) => {
    const env = { PACKAGE_GUARD_REGISTRY_BASE: base, PACKAGE_GUARD_DOWNLOADS_BASE: base };
    const freshR = await runHookAsync({ tool_name: 'Bash', tool_input: { command: 'npm i -D fresh-pkg' } }, env);
    assert.strictEqual(freshR.code, 2, freshR.err); assert.match(freshR.err, /too-new/);
    const quietR = await runHookAsync({ tool_name: 'Bash', tool_input: { command: 'npm i -D quiet-pkg' } }, env);
    assert.strictEqual(quietR.code, 2, quietR.err); assert.match(quietR.err, /low-adoption/);
    const goodR = await runHookAsync({ tool_name: 'Bash', tool_input: { command: 'npm i -D good-pkg' } }, env);
    assert.strictEqual(goodR.code, 0, goodR.err);
  });
});

test('hook: registry unreachable → verify-unavailable, fail closed (SR-04)', () => {
  const { code, err } = runHook(
    { tool_name: 'Bash', tool_input: { command: 'npm i -D whatever-pkg' } },
    { PACKAGE_GUARD_REGISTRY_BASE: 'http://127.0.0.1:9', PACKAGE_GUARD_DOWNLOADS_BASE: 'http://127.0.0.1:9',
      PACKAGE_GUARD_TIMEOUT_MS: '500' });
  assert.strictEqual(code, 2, err);
  assert.match(err, /verify-unavailable/);
});

test('hook: runtime-dep blocked before network (SR-06)', () => {
  const { code, err } = runHook(
    { tool_name: 'Bash', tool_input: { command: 'npm install some-runtime-pkg' } },
    { PACKAGE_GUARD_REGISTRY_BASE: 'http://127.0.0.1:9', PACKAGE_GUARD_DOWNLOADS_BASE: 'http://127.0.0.1:9' });
  assert.strictEqual(code, 2, err);
  assert.match(err, /runtime-dep/);
});

test('hook: manifest edit with new fake dep blocked; unchanged manifest passes (SR-01/-03)', async () => {
  await withStub({}, async (base) => {
    const env = { PACKAGE_GUARD_REGISTRY_BASE: base, PACKAGE_GUARD_DOWNLOADS_BASE: base };
    const disk = fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8');
    const post = disk.replace('"devDependencies": {', '"devDependencies": {\n    "ghost-types": "^1.0.0",');
    const blocked = await runHookAsync({ tool_name: 'Write', tool_input: { file_path: 'package.json', content: post } }, env);
    assert.strictEqual(blocked.code, 2, blocked.err);
    assert.match(blocked.err, /ghost-types/); assert.match(blocked.err, /not-found/);
    const clean = await runHookAsync({ tool_name: 'Write', tool_input: { file_path: 'package.json', content: disk } }, env);
    assert.strictEqual(clean.code, 0, clean.err);
  });
});

test('hook: non-install / non-manifest / existing dep → exit 0, ZERO registry hits (spec §7 perf)', async () => {
  await withStub({}, async (base, hits) => {
    const env = { PACKAGE_GUARD_REGISTRY_BASE: base, PACKAGE_GUARD_DOWNLOADS_BASE: base };
    assert.strictEqual((await runHookAsync({ tool_name: 'Bash', tool_input: { command: 'npm test' } }, env)).code, 0);
    assert.strictEqual((await runHookAsync({ tool_name: 'Edit', tool_input: { file_path: 'lib/x.js', new_string: 'y' } }, env)).code, 0);
    // typescript-checkjs is an existing devDep (alias key) → reinstall passes without lookup.
    assert.strictEqual((await runHookAsync({ tool_name: 'Bash', tool_input: { command: 'npm i -D typescript-checkjs' } }, env)).code, 0);
    assert.deepStrictEqual(hits, []);
  });
});

test('hook: unparseable stdin → exit 0 (fail open, trusted harness)', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});

test('hook: Edit on package.json reconstructs post-state and blocks new fake dep (SR-03)', async () => {
  await withStub({}, async (base) => {
    const env = { PACKAGE_GUARD_REGISTRY_BASE: base, PACKAGE_GUARD_DOWNLOADS_BASE: base };
    const { code, err } = await runHookAsync({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'package.json',
        old_string: '"devDependencies": {',
        new_string: '"devDependencies": {\n    "ghost-edit-dep": "^1.0.0",',
      },
    }, env);
    assert.strictEqual(code, 2, err);
    assert.match(err, /ghost-edit-dep/); assert.match(err, /not-found/);
    // Edit whose old_string does not match → the Edit fails on its own → pass.
    const miss = await runHookAsync({
      tool_name: 'Edit',
      tool_input: { file_path: 'package.json', old_string: 'NO-SUCH-ANCHOR', new_string: 'x' },
    }, env);
    assert.strictEqual(miss.code, 0, miss.err);
  });
});

test('hook: deep overrides nesting cannot crash-bypass the analysis (code-review finding 1)', () => {
  // A recursive flatten would RangeError on hostile-deep (but npm-valid) nesting
  // and — with a fail-open catch — silently bypass the gate. The flatten must be
  // iterative: analysis completes, finds the buried name, and (registry
  // unreachable here) fails CLOSED.
  let deep = '"buried-pkg": "1.0.0"';
  for (let i = 0; i < 5000; i++) deep = `"o": {${deep}}`;
  const post = `{"name":"t","overrides":{${deep}}}`;
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'package.json', content: post } }),
    encoding: 'utf8',
    env: {
      ...process.env,
      PACKAGE_GUARD_REGISTRY_BASE: 'http://127.0.0.1:9', PACKAGE_GUARD_DOWNLOADS_BASE: 'http://127.0.0.1:9',
      PACKAGE_GUARD_TIMEOUT_MS: '500',
    },
  });
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /buried-pkg/);
  assert.match(r.stderr, /verify-unavailable/);
});
