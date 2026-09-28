'use strict';

// Shared readers for the prose-vs-schema tests (review finding E1,
// docs/superpowers/reviews/2026-09-16-approved.md, Runde 4).
//
// test/Settings.test.js and test/SettingsSchemaHints.test.js both check user-facing
// wording against drivers/pool/driver.settings.compose.json. They used to carry
// private copies of these helpers, and the two sentences() differed — so a fact rule
// ported from one file to the other silently changed meaning. One definition here.
//
// Not a test file itself: `node --test` still loads it (every .js under test/ is
// picked up, like test/mocks/homey.js) and reports it as one passing entry.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Parse a repo file as JSON.
 * @param {string} rel path relative to the repo root
 * @returns {*}
 */
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/**
 * Read a repo file as UTF-8 text.
 * @param {string} rel path relative to the repo root
 * @returns {string}
 */
function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * Split prose into sentences, whitespace collapsed first. A semicolon counts as a
 * sentence end: it joins independent clauses, each stating its own fact, and the
 * fact rules ask "does ONE statement pair X with Y" — a clause after ';' is a new
 * statement (e.g. "Try violet.local first; if that does not resolve …").
 * Only punctuation followed by whitespace splits, so "violet.local" stays whole.
 * @param {string} s
 * @returns {Array<string>}
 */
function sentences(s) {
  return s.replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+/);
}

/**
 * Resolve a dotted key ("settings.control.p2") in a nested object.
 * @param {*} obj
 * @param {string} dotted
 * @returns {*}
 */
function lookup(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Every leaf key of a nested object, dotted, prefixed with `prefix` when given.
 * @param {*} obj
 * @param {string} prefix
 * @returns {Array<string>}
 */
function flatten(obj, prefix) {
  /** @type {Array<string>} */
  const out = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') out.push(...flatten(v, key));
    else out.push(key);
  }
  return out;
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

/**
 * The `group_*` settings of the "Feature groups (show/hide)" block — the block
 * settings.groups.p1 enumerates. (group_chlorine sits outside it, on its own.)
 * @returns {Array<{id: string, label: {en: string, de: string}, values: Array<*>}>}
 */
function featureGroupBlock() {
  const compose = readJson('drivers/pool/driver.settings.compose.json');
  const block = compose.find(
    (/** @type {*} */ n) => n.type === 'group' && n.label?.en === 'Feature groups (show/hide)',
  );
  if (!block) throw new Error('no "Feature groups (show/hide)" block in the device-settings schema');
  return block.children.filter((/** @type {*} */ n) => Array.isArray(n.values));
}

/**
 * A label as the prose has to spell it: the part before a parenthetical, matched
 * case-insensitively on Unicode letter boundaries (\b is ASCII-only and fails
 * before "Überlaufbehälter").
 * @param {string} label
 * @returns {RegExp}
 */
function labelRegex(label) {
  const bare = label.replace(/\s*\(.*$/, '').trim();
  return new RegExp(`(?<!\\p{L})${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu');
}

/**
 * Every text a user can read, per language: all locale strings, every schema
 * label/hint, the store version notes (.homeychangelog.json) and the manifest
 * description, the settings page, the pair/repair views (their literal English text
 * and t() fallbacks), the three READMEs and both community guides.
 * Fact sweep (review findings C2, E2): one fact, every prose copy checked.
 * @returns {Array<{src: string, lang: 'en'|'de', text: string}>}
 */
function proseSources() {
  /** @type {Array<{src: string, lang: 'en'|'de', text: string}>} */
  const out = [];
  const add = (/** @type {string} */ src, /** @type {'en'|'de'} */ lang, /** @type {*} */ text) => {
    if (typeof text === 'string') out.push({ src, lang, text: text.replace(/\s+/g, ' ') });
  };
  for (const lang of /** @type {Array<'en'|'de'>} */ (['en', 'de'])) {
    const walk = (/** @type {*} */ v, /** @type {string} */ key) => {
      if (v !== null && typeof v === 'object') {
        for (const [k, c] of Object.entries(v)) walk(c, key ? `${key}.${k}` : k);
      } else add(`locales/${lang}.json:${key}`, lang, v);
    };
    walk(readJson(`locales/${lang}.json`), '');
    for (const node of schemaNodes()) {
      for (const field of ['label', 'hint']) add(`compose:${node.id}.${field}`, lang, node[field]?.[lang]);
      for (const v of Array.isArray(node.values) ? node.values : []) {
        add(`compose:${node.id}.values.${v.id}`, lang, v.label?.[lang]);
      }
    }
    for (const [version, notes] of Object.entries(readJson('.homeychangelog.json'))) {
      add(`changelog:${version}`, lang, notes?.[lang]);
    }
    add('manifest:description', lang, readJson('.homeycompose/app.json').description?.[lang]);
  }
  for (const [lang, file] of /** @type {Array<['en'|'de', string]>} */ ([
    ['en', 'settings/index.html'],
    ['en', 'drivers/pool/pair/connect.html'],
    ['en', 'drivers/pool/repair/repair.html'],
    ['en', 'README.md'],
    ['en', 'README.txt'],
    ['de', 'README.de.txt'],
    ['en', 'docs/community/quickstart-guide.en.md'],
    ['de', 'docs/community/quickstart-guide.de.md'],
  ])) add(file, lang, readText(file));
  return out;
}

module.exports = {
  readJson,
  readText,
  sentences,
  lookup,
  flatten,
  schemaNodes,
  groupSettings,
  featureGroupBlock,
  labelRegex,
  proseSources,
};
