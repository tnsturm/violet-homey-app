'use strict';

// Device-settings schema hints + README must stay true to the schema itself
// (review findings B1 and B4, docs/superpowers/reviews/2026-09-16-approved.md).
//
// Sibling of test/Settings.test.js, which guards the app-settings page prose:
// this file guards the OTHER user-facing wording that describes the same schema —
// the `hint` strings inside drivers/pool/driver.settings.compose.json, README.md
// and the Community quick-start guides; the account-model sweep (B4/C2) runs over
// every prose source via proseSources(). Same technique as there: read the schema
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

// --- B4: no advice about an account model the controller does not have -------------
// Twin of the settings.control.p2 check in test/Settings.test.js (finding A2): the
// Violet has exactly one write login — no accounts, no roles — so no hint and no
// guide may recommend a "dedicated, least-privilege account". The plain-HTTP-on-LAN
// warning is the true part and stays. (The dated threat model under
// docs/superpowers/security/ is a historical record and deliberately untouched.)

// Fact sweep (review finding C2): one fact, every prose copy checked. Each fix round
// found the next copy of the same false fact in a file the previous sweep never read.
/**
 * Every text a user can read, per language: all locale strings, every schema
 * label/hint, the settings page, the three READMEs and both community guides.
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
  }
  for (const [lang, file] of /** @type {Array<['en'|'de', string]>} */ ([
    ['en', 'settings/index.html'],
    ['en', 'README.md'],
    ['en', 'README.txt'],
    ['de', 'README.de.txt'],
    ['en', 'docs/community/quickstart-guide.en.md'],
    ['de', 'docs/community/quickstart-guide.de.md'],
  ])) add(file, lang, readText(file));
  return out;
}

// Hyphen class covers ASCII '-', U+2010 hyphen, U+2011 non-breaking hyphen,
// U+2012 figure dash, U+2013 en dash and a space ("least‑privilege" slipped past B4).
const BANNED = {
  en: [/least[-‐-– ]privilege/i, /dedicated[^.]{0,20}account/i],
  de: [/minimalen Rechten/i, /wenig Rechten/i, /eigenes Konto/i],
};

test('no prose source recommends a controller account model', () => {
  const sources = proseSources();
  assert.ok(sources.length > 100, `prose sweep found only ${sources.length} texts`);
  /** @type {Array<string>} */
  const hits = [];
  for (const { src, lang, text } of sources) {
    for (const re of BANNED[lang]) if (re.test(text)) hits.push(`${src} matches ${re}`);
  }
  assert.deepStrictEqual(hits, [], 'account-model advice survives in these prose sources');
});

test('the prose sources still state that the controller API is plain HTTP', () => {
  // The fact that justified the advice must survive it.
  for (const [file, re] of /** @type {Array<[string, RegExp]>} */ ([
    ['README.md', /plain HTTP/i],
    ['docs/community/quickstart-guide.en.md', /plain HTTP/i],
    ['docs/community/quickstart-guide.de.md', /unverschlüsseltes HTTP/i],
  ])) {
    assert.match(readText(file).replace(/\s+/g, ' '), re, `${file} no longer states that the controller API is plain HTTP`);
  }
});

// --- B2: the guides must call a group what the settings page calls it --------------
// Three names for one setting ("Wassernachspeisung" / "Nachfüllung" / "Frischwasser")
// leave the reader hunting for a setting that does not exist under that name, so the
// group list in each quick-start guide may only use labels the schema actually has.

/** @param {string} label @returns {string} */
function bareLabel(label) {
  return label.replace(/\s*\(.*$/, '').trim().toLowerCase();
}

test('the quick-start guides enumerate feature groups by their schema labels', () => {
  const groups = groupSettings();
  const guides = /** @type {Array<{lang: 'en'|'de', file: string, re: RegExp}>} */ ([
    { lang: 'en', file: 'docs/community/quickstart-guide.en.md', re: /equipment group \(([^)]*)\)/ },
    { lang: 'de', file: 'docs/community/quickstart-guide.de.md', re: /Ausstattungsgruppe \(([^)]*)\)/ },
  ]);

  for (const guide of guides) {
    const m = readText(guide.file).replace(/\s+/g, ' ').match(guide.re);
    assert.ok(m, `no feature-group enumeration found in ${guide.file}`);
    const known = new Set(groups.map((g) => bareLabel(g.label[guide.lang])));
    const listed = m[1]
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s !== '…' && s !== '...');
    assert.ok(listed.length >= 4, `expected a list of groups in ${guide.file}, got ${m[1]}`);

    for (const name of listed) {
      assert.ok(
        known.has(name),
        `${guide.file} calls a feature group "${name}", which is no schema label (${[...known].join(', ')})`,
      );
    }
  }
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
