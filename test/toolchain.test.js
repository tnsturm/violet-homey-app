'use strict';

// Toolchain invariants (M4.5 — eval doc §1 Nachtrag 2026-07-08,
// docs/superpowers/notes/2026-07-08-typescript-migration-evaluation.md): the Homey
// CLI (v4.1.1, App.usesTypeScript) flips into TypeScript mode as soon as
// package.json has a devDependency literally named "typescript" — validate/build/
// run/install then demand a root tsconfig.json + build script and fail. The checkJs
// checker must therefore stay installed under the "typescript-checkjs" npm alias.
// And the device ships zero runtime deps: dependencies stays exactly {} (CLAUDE.md
// null-dependency policy, §6 criterion 8).

const { test } = require('node:test');
const assert = require('node:assert');

const pkg = require('../package.json');

test('toolchain: no devDependency literally named "typescript" (Homey CLI TS-mode trigger)', () => {
  assert.strictEqual((pkg.devDependencies || {}).typescript, undefined,
    'devDependencies.typescript flips homey-cli into TS mode and breaks validate — use the typescript-checkjs alias');
});

test('toolchain: the aliased checker is present so `npm run typecheck` works', () => {
  assert.match(String((pkg.devDependencies || {})['typescript-checkjs']), /^npm:typescript@/);
});

test('toolchain: runtime dependencies stay exactly {}', () => {
  assert.deepStrictEqual(pkg.dependencies, {});
});
