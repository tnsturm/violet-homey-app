'use strict';

// Tests for .claude/hooks/package-guard.js + lib/package-specs.js (M5.9).
// Spec: docs/superpowers/specs/2026-07-14-m5.9-package-guard-design.md §3, §7.
// Unit tests hit the pure lib directly (offline); hook tests spawn the hook
// against a local node:http stub registry — NO real network anywhere here.

const { test } = require('node:test');
const assert = require('node:assert');
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
