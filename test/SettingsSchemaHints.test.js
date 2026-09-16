'use strict';

// Device-settings schema hints + README must stay true to the schema itself
// (review findings B1 and B4, docs/superpowers/reviews/2026-09-16-approved.md).
//
// Sibling of test/Settings.test.js, which guards the app-settings page prose:
// this file guards the OTHER user-facing wording that describes the same schema —
// the `hint` strings inside drivers/pool/driver.settings.compose.json, README.md
// and the Community quick-start guides. Same technique as there: read the schema
// with fs+JSON.parse and derive the expectation from it, never from a hand-kept
// list. Nothing here requires the app, so it runs under plain `node --test`.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** @param {string} rel @returns {*} */
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/** @param {string} rel @returns {string} */
function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * Every node of the device-settings schema, flattened across `children`.
 * @returns {Array<*>}
 */
function schemaNodes() {
  const compose = readJson('drivers/pool/driver.settings.compose.json');
  /** @type {Array<*>} */
  const out = [];
  const walk = (/** @type {*} */ node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    out.push(node);
    if (Array.isArray(node.children)) walk(node.children);
  };
  walk(compose);
  return out;
}

/**
 * The `group_*` radios/dropdowns with the value ids they offer.
 * @returns {Array<{id: string, label: {en: string, de: string}, values: Array<string>}>}
 */
function groupSettings() {
  return schemaNodes()
    .filter((n) => typeof n.id === 'string' && n.id.startsWith('group_') && Array.isArray(n.values))
    .map((n) => ({ id: n.id, label: n.label, values: n.values.map((/** @type {*} */ v) => v.id) }));
}

/** @param {string} s @returns {RegExp} */
function wordRe(s) {
  return new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}

/** @param {string} s @returns {Array<string>} */
function sentences(s) {
  return s.replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+/);
}

// --- B1: a hint that generalises the three options must name the exception ----------
// group_dosing offers only auto|hide (mirrored by lib/FeatureGroups.js), so any hint
// that promises "Always show" for *every* feature group is wrong unless it names
// dosing as the Auto-or-Hide-only exception.

// Wording that promises the forcing option.
const FORCE_PHRASE = { en: /always show/i, de: /immer anzeigen/i };
// Wording that extends a statement to the other feature groups.
const GENERALISES = {
  en: /\b(?:every|all|the same three)\b[^.]*\bgroups?\b/i,
  de: /\b(?:jede|jeder|alle|dieselben)\b[^.]*gruppe/i,
};
// Wording that names the exception ("Auto or Hide only").
const EXCEPTION = { en: /auto or hide only/i, de: /nur auto oder ausblenden/i };

test('schema hints that generalise "Always show" to every group name the exception', () => {
  const forceless = groupSettings().filter((g) => !g.values.includes('force'));
  assert.ok(forceless.length > 0, 'no force-less group in the schema — update this test');

  let checked = 0;
  for (const node of schemaNodes()) {
    if (!node.hint || typeof node.hint !== 'object') continue;
    for (const lang of /** @type {Array<'en'|'de'>} */ (['en', 'de'])) {
      const hint = String(node.hint[lang] ?? '');
      if (!FORCE_PHRASE[lang].test(hint) || !GENERALISES[lang].test(hint)) continue;
      checked += 1;
      for (const g of forceless) {
        assert.ok(
          wordRe(g.label[lang]).test(hint),
          `${lang}: hint of ${node.id} generalises "Always show" without naming ${g.id} (${g.label[lang]}): "${hint}"`,
        );
        assert.ok(
          EXCEPTION[lang].test(hint),
          `${lang}: hint of ${node.id} names ${g.label[lang]} but not its Auto-or-Hide-only restriction: "${hint}"`,
        );
      }
    }
  }
  assert.ok(checked >= 2, `expected the generalising hints to be found, matched ${checked}`);
});

test('README does not promise "Always show" for a force-less group', () => {
  const forceless = groupSettings().filter((g) => !g.values.includes('force'));
  const readme = readText('README.md');

  for (const s of sentences(readme)) {
    if (!FORCE_PHRASE.en.test(s)) continue;
    for (const g of forceless) {
      assert.ok(
        !wordRe(g.label.en).test(s),
        `README offers "Always show" for ${g.id}, which has only ${g.values.join('|')}: "${s}"`,
      );
    }
  }
  for (const g of forceless) {
    assert.match(
      readme.replace(/\s+/g, ' '),
      new RegExp(`${g.label.en}[^.]*Auto / Hide`, 'i'),
      `README never states that ${g.id} offers Auto / Hide only`,
    );
  }
});
