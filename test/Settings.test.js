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
const {
  readJson,
  sentences,
  lookup,
  flatten,
  groupSettings,
  featureGroupBlock,
  labelRegex,
  proseSources,
} = require('./helpers/prose');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'settings/index.html');

// The single external link the page is allowed to carry (Homey Community topic
// 157109 — see homeyCommunityTopicId in the manifest / HOMEY.md).
const COMMUNITY_URL = 'https://community.homey.app/t/157109';

/** @returns {string} */
function readIndex() {
  return fs.readFileSync(INDEX, 'utf8');
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

// --- Wording must stay true to the device-settings schema (review finding A1) --------
// The page is the only place that describes the device settings in prose, so the
// prose has to be derived from — not merely written alongside — the schema in
// drivers/pool/driver.settings.compose.json. A group without a `force` value
// (group_dosing: auto|hide, mirrored by lib/FeatureGroups.js) must never appear in
// the sentence that promises "Always show".

test('settings.groups.p1 never promises "Always show" for a group that has no force value', () => {
  const groups = groupSettings();
  assert.ok(groups.length >= 10, `expected many group_* settings, found ${groups.length}`);

  const forceless = groups.filter((g) => !g.values.includes('force'));
  assert.ok(forceless.length > 0, 'no force-less group in the schema — update this test');

  const text = {
    en: readJson('locales/en.json').settings.groups.p1,
    de: readJson('locales/de.json').settings.groups.p1,
  };
  // The wording that promises all three options, per language.
  const forcePhrase = { en: /always show/i, de: /immer anzeigen/i };
  // The wording that names the exception ("Auto or Hide only"), quotes stripped.
  const exceptionPhrase = { en: /auto or hide only/i, de: /nur auto oder ausblenden/i };

  for (const g of forceless) {
    for (const lang of /** @type {Array<'en'|'de'>} */ (['en', 'de'])) {
      const label = g.label[lang];
      const flat = text[lang].replace(/[„“”"']/g, '');
      const labelRe = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      for (const s of sentences(flat)) {
        assert.ok(
          !(forcePhrase[lang].test(s) && labelRe.test(s)),
          `${lang}: settings.groups.p1 offers "Always show" for ${g.id}, which has only ${g.values.join('|')}: "${s}"`,
        );
      }
      assert.ok(
        labelRe.test(flat) && exceptionPhrase[lang].test(flat),
        `${lang}: settings.groups.p1 does not name ${g.id} as the Auto-or-Hide-only exception`,
      );
    }
  }
});

// --- Group names must be the schema's own labels (review finding B2) ---------------
// The page names the feature groups in prose; the user then looks for exactly that
// name in the device settings. So every group of the "Feature groups (show/hide)"
// block must appear in settings.groups.p1 under its schema label — a synonym
// ("Wassernachspeisung" for "Nachfüllung") sends the reader hunting for a setting
// that does not exist under that name.

test('settings.groups.p1 names every feature group by its schema label', () => {
  const groups = featureGroupBlock();
  assert.ok(groups.length >= 10, `expected many group_* settings, found ${groups.length}`);

  const text = {
    en: readJson('locales/en.json').settings.groups.p1,
    de: readJson('locales/de.json').settings.groups.p1,
  };

  for (const g of groups) {
    for (const lang of /** @type {Array<'en'|'de'>} */ (['en', 'de'])) {
      assert.match(
        text[lang],
        labelRegex(g.label[lang]),
        `${lang}: settings.groups.p1 does not name ${g.id} by its schema label "${g.label[lang]}"`,
      );
    }
  }
});

// The Violet controller has exactly one write login — no account model, no roles.
// So the control paragraph must not recommend a "dedicated, least-privilege
// account" (review finding A2); it states the two facts that are true instead:
// plain HTTP on the LAN, and the tile override falling back to Auto.
test('settings.control.p2 recommends no account model the controller does not have', () => {
  const text = {
    en: readJson('locales/en.json').settings.control.p2,
    de: readJson('locales/de.json').settings.control.p2,
  };
  const banned = {
    en: [/least[- ]privilege/i, /dedicated[^.]{0,20}account/i],
    de: [/wenig Rechten/i, /eigenes Konto/i],
  };
  const required = {
    en: [/plain HTTP/i, /override duration/i],
    de: [/HTTP/i, /Übersteuerungsdauer/i],
  };

  for (const lang of /** @type {Array<'en'|'de'>} */ (['en', 'de'])) {
    for (const re of banned[lang]) {
      assert.ok(!re.test(text[lang]), `${lang}: settings.control.p2 still matches ${re}`);
    }
    for (const re of required[lang]) {
      assert.ok(re.test(text[lang]), `${lang}: settings.control.p2 no longer states ${re}`);
    }
  }
});

// --- Credentials must be located where they actually live (review finding B3) -------
// The device settings hold only writeUsername; the write password is captured during
// pairing and changed via the Repair dialog (drivers/pool/driver.js), then read from
// the device store by _writeCreds(). Prose that sends the user to the device settings
// for the password describes a field that is not there.
// Scans EVERY locale key, not only settings.* (review finding C1): the runtime error
// toasts error.write_creds_missing / error.write_auth are the copy a user actually
// meets when a write fails, and they say "credentials", not "password".
// Sweeps proseSources(), not only the locales (review finding E2): the store version
// notes and the manifest description are prose a user reads too.

// Sources exempt from the rule, each with its reason. Dated store history is kept
// verbatim, not rewritten after the fact.
const HISTORIC = new Set([
  // Published 2026-07 (0.3.0), before the Repair dialog existed: back then the write
  // password really was a device setting. Kept verbatim as store history.
  'changelog:0.3.0',
]);

test('no prose sentence puts the write password in the device settings', () => {
  const pwd = { en: /password|credentials/i, de: /passwort|zugangsdaten/i };
  const where = { en: /device settings/i, de: /Geräteeinstellungen/i };
  // The places the password can actually be entered.
  const realPlace = { en: /pairing|paired|repair/i, de: /koppel|reparier|pairing|repair/i };

  const sources = proseSources();
  assert.ok(sources.some((p) => p.src.startsWith('changelog:')), 'prose sweep lost the changelog');
  /** @type {Array<string>} */
  const wrong = [];
  for (const { src, lang, text } of sources) {
    if (HISTORIC.has(src)) continue;
    for (const s of sentences(text)) {
      if (pwd[lang].test(s) && where[lang].test(s) && !realPlace[lang].test(s)) {
        wrong.push(`${lang}: ${src}: "${s}"`);
      }
    }
  }
  assert.deepStrictEqual(wrong, [], 'these sentences locate the write password in the device settings');
});

// --- The tile override does not always revert (review finding E3) -------------------
// control_default_duration_min allows 0 = permanent (its compose hint says so), so a
// sentence promising that the tile override reverts to Auto is false for that value
// unless it names the permanent case.
test('no prose sentence promises the tile override reverts to Auto without the 0 = permanent case', () => {
  const reverts = { en: /revert|falls? back/i, de: /zurück|fällt/i };
  const permanent = {
    en: /permanent|(?<![\d.,])0(?![\d.,])/i,
    de: /dauerhaft|(?<![\d.,])0(?![\d.,])/i,
  };

  /** @type {Array<string>} */
  const wrong = [];
  for (const { src, lang, text } of proseSources()) {
    if (HISTORIC.has(src)) continue;
    for (const s of sentences(text)) {
      if (reverts[lang].test(s) && /Auto/.test(s) && !permanent[lang].test(s)) {
        wrong.push(`${lang}: ${src}: "${s}"`);
      }
    }
  }
  assert.deepStrictEqual(wrong, [], 'these sentences hide that 0 makes the tile override permanent');
});

test('a settings.* sentence may only claim a credential field the schema really has', () => {
  const user = { en: /username/i, de: /Benutzername/i };
  const where = { en: /device settings/i, de: /Geräteeinstellungen/i };
  const compose = readJson('drivers/pool/driver.settings.compose.json');
  /** @type {Array<*>} */
  const labels = [];
  const walk = (/** @type {*} */ node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    if (node.label) labels.push(node.label);
    if (Array.isArray(node.children)) walk(node.children);
  };
  walk(compose);

  for (const lang of /** @type {Array<'en'|'de'>} */ (['en', 'de'])) {
    const locale = readJson(`locales/${lang}.json`);
    for (const key of flatten(locale.settings, '')) {
      const value = String(lookup(locale, `settings.${key}`));
      for (const s of sentences(value)) {
        if (!user[lang].test(s) || !where[lang].test(s)) continue;
        assert.ok(
          labels.some((l) => user[lang].test(String(l[lang] ?? ''))),
          `${lang}: settings.${key} sends the user to a "username" field the schema does not have: "${s}"`,
        );
      }
    }
  }
});

test('every fill() fallback in the page matches locales/en.json verbatim', () => {
  const html = readIndex();
  const en = readJson('locales/en.json');
  const fills = [...html.matchAll(/fill\('([^']+)',\s*'([^']+)'\)/g)].map((m) => [m[1], m[2]]);
  assert.ok(fills.length >= 20, `expected the page to fill many elements, found ${fills.length}`);

  for (const [id, key] of fills) {
    const m = html.match(new RegExp(`<([a-z0-9]+)[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`));
    assert.ok(m, `no element with id="${id}" in the page`);
    assert.strictEqual(
      m[2].trim(),
      lookup(en, key),
      `fallback text of #${id} differs from ${key} in locales/en.json`,
    );
  }
});
