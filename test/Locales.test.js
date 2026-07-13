'use strict';

// Locale-consistency guard — device-identity spec §Testing, §User-visible
// error localization (docs/superpowers/specs/2026-07-13-device-identity-design.md).
// Every user-visible error key must exist in BOTH languages, non-empty, with
// identical __token__ placeholder sets. fs+JSON.parse (not require) to avoid
// require-cache/type-inference coupling.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/en.json'), 'utf8'));
const de = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/de.json'), 'utf8'));

const REQUIRED_KEYS = [
  'pair.error.host_required',
  'pair.error.no_serial',
  'error.write_creds_missing',
  'error.control_disabled',
  'error.controller_rejected',
  'error.write_auth',
  'error.write_failed',
  'error.invalid_value',
  'error.unreachable',
];

/** @param {*} obj @param {string} dotted @returns {*} */
function lookup(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** @param {string} s @returns {Array<string>} */
function tokensOf(s) {
  return (s.match(/__[a-z]+__/g) || []).sort();
}

for (const key of REQUIRED_KEYS) {
  test(`locale key ${key} present in en+de with matching tokens`, () => {
    const e = lookup(en, key);
    const d = lookup(de, key);
    assert.ok(typeof e === 'string' && e.trim().length > 0, `en missing/empty: ${key}`);
    assert.ok(typeof d === 'string' && d.trim().length > 0, `de missing/empty: ${key}`);
    assert.deepStrictEqual(tokensOf(d), tokensOf(e), `token mismatch for ${key}`);
  });
}
