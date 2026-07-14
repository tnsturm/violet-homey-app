'use strict';

// Tests for .claude/hooks/package-guard.js + lib/package-specs.js (M5.9).
// Spec: docs/superpowers/specs/2026-07-14-m5.9-package-guard-design.md §3, §7.
// Unit tests hit the pure lib directly (offline); hook tests spawn the hook
// against a local node:http stub registry — NO real network anywhere here.

const { test } = require('node:test');
const assert = require('node:assert');
const { parseInstallCommand } = require('../../.claude/hooks/lib/package-specs');

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
