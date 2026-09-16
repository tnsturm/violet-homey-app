'use strict';

// App-settings page contract — M9.2 sub-task 1 (in-app Quick-Start Guide).
// Pins the Homey SDK v3 custom-view contract for settings/index.html
// (https://apps.developer.homey.app/advanced/custom-views/app-settings) plus this
// repo's self-containment and locale-parity rules (HOMEY.md § App-Store-Readme,
// CLAUDE.md §5). Sibling of test/Locales.test.js, which guards the error keys;
// this file guards the settings.* subtree the same way (fs+JSON.parse, no require).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'settings/index.html');

// The single external link the page is allowed to carry (Homey Community topic
// 157109 — see homeyCommunityTopicId in the manifest / HOMEY.md).
const COMMUNITY_URL = 'https://community.homey.app/t/157109';

/** @returns {string} */
function readIndex() {
  return fs.readFileSync(INDEX, 'utf8');
}

/** @param {string} rel @returns {*} */
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/**
 * Every `settings.*` string literal in the page. Superset of "referenced via
 * Homey.__ or the t() helper": the page reaches its keys through t(), and any
 * other literal that looks like a locale key must resolve too.
 * @param {string} html
 * @returns {Array<string>}
 */
function settingsKeysIn(html) {
  const found = html.match(/'settings\.[A-Za-z0-9_.]+'/g) || [];
  return [...new Set(found.map((s) => s.slice(1, -1)))];
}

/** @param {*} obj @param {string} dotted @returns {*} */
function lookup(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** @param {*} obj @param {string} prefix @returns {Array<string>} */
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

test('settings/index.html exists', () => {
  assert.ok(fs.existsSync(INDEX), 'settings/index.html missing');
});

test('loads homey.js with data-origin="settings"', () => {
  const html = readIndex();
  const tag = html.match(/<script[^>]*src="\/homey\.js"[^>]*>/);
  assert.ok(tag, 'no <script src="/homey.js"> tag');
  assert.match(tag[0], /data-origin="settings"/, 'homey.js tag lacks data-origin="settings"');
});

test('defines onHomeyReady and calls Homey.ready()', () => {
  const html = readIndex();
  assert.match(html, /function\s+onHomeyReady\s*\(/, 'onHomeyReady not defined');
  assert.match(html, /Homey\.ready\s*\(\s*\)/, 'Homey.ready() never called');
});

test('is self-contained: no src/href points at http(s)', () => {
  const html = readIndex();
  const external = html.match(/(?:src|href)\s*=\s*"https?:/gi) || [];
  assert.deepStrictEqual(external, [], `external resource references: ${external.join(', ')}`);
});

test('the only http(s) URL is the community topic, opened via Homey.openURL', () => {
  const html = readIndex();
  const urls = [...new Set(html.match(/https?:\/\/[^\s'"<>)]+/g) || [])];
  assert.deepStrictEqual(urls, [COMMUNITY_URL], 'unexpected URL(s) in the page');
  assert.ok(
    html.includes(`Homey.openURL('${COMMUNITY_URL}')`),
    'community URL is not passed to Homey.openURL',
  );
});

test('every settings.* key used by the page exists in en + de', () => {
  const html = readIndex();
  const en = readJson('locales/en.json');
  const de = readJson('locales/de.json');
  const keys = settingsKeysIn(html);
  assert.ok(keys.length >= 10, `expected the page to use many keys, found ${keys.length}`);
  for (const key of keys) {
    const e = lookup(en, key);
    const d = lookup(de, key);
    assert.ok(typeof e === 'string' && e.trim().length > 0, `en missing/empty: ${key}`);
    assert.ok(typeof d === 'string' && d.trim().length > 0, `de missing/empty: ${key}`);
  }
});

test('en.settings and de.settings have identical key sets, all non-empty strings', () => {
  const en = readJson('locales/en.json');
  const de = readJson('locales/de.json');
  assert.ok(en.settings && typeof en.settings === 'object', 'en.json has no "settings" object');
  assert.ok(de.settings && typeof de.settings === 'object', 'de.json has no "settings" object');

  const enKeys = flatten(en.settings, '').sort();
  const deKeys = flatten(de.settings, '').sort();
  assert.deepStrictEqual(deKeys, enKeys, 'settings key sets differ between en and de');

  for (const key of enKeys) {
    for (const [lang, obj] of [['en', en], ['de', de]]) {
      const v = lookup(obj, `settings.${key}`);
      assert.ok(
        typeof v === 'string' && v.trim().length > 0,
        `${lang}: settings.${key} is not a non-empty string`,
      );
    }
  }
});
