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
const {
  readText,
  sentences,
  schemaNodes,
  groupSettings,
  labelRegex,
  proseSources,
} = require('./helpers/prose');

// Review finding E5: the label matcher must use Unicode letter boundaries — \b is
// ASCII-only, so it never matches before an umlaut-initial German label.
test('the label matcher finds umlaut-initial labels on Unicode boundaries only', () => {
  const re = labelRegex('Überlaufbehälter');
  assert.ok(re.test('der Überlaufbehälter'), 'misses the label after a space');
  assert.ok(!re.test('der Überlaufbehälterdeckel'), 'matches inside a longer word');
});

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

  /** @type {Set<string>} */
  const carriers = new Set();
  for (const node of schemaNodes()) {
    if (!node.hint || typeof node.hint !== 'object') continue;
    for (const lang of /** @type {Array<'en'|'de'>} */ (['en', 'de'])) {
      const hint = String(node.hint[lang] ?? '');
      if (!FORCE_PHRASE[lang].test(hint) || !GENERALISES[lang].test(hint)) continue;
      carriers.add(`${node.id}/${lang}`);
      for (const g of forceless) {
        assert.ok(
          labelRegex(g.label[lang]).test(hint),
          `${lang}: hint of ${node.id} generalises "Always show" without naming ${g.id} (${g.label[lang]}): "${hint}"`,
        );
        assert.ok(
          EXCEPTION[lang].test(hint),
          `${lang}: hint of ${node.id} names ${g.label[lang]} but not its Auto-or-Hide-only restriction: "${hint}"`,
        );
      }
    }
  }
  // Single carrier (review finding E4): the group_eco hint heads the feature-group
  // block and states the rule once; group_chlorine only describes its own options.
  assert.deepStrictEqual(
    [...carriers].sort(),
    ['group_eco/de', 'group_eco/en'],
    'the "same three options for every group" statement must live in the group_eco hint only',
  );
});

// --- B4: no advice about an account model the controller does not have -------------
// Twin of the settings.control.p2 check in test/Settings.test.js (finding A2): the
// Violet has exactly one write login — no accounts, no roles — so no hint and no
// guide may recommend a "dedicated, least-privilege account". The plain-HTTP-on-LAN
// warning is the true part and stays. (The dated threat model under
// docs/superpowers/security/ is a historical record and deliberately untouched.)

// Fact sweep (review finding C2): one fact, every prose copy checked. Each fix round
// found the next copy of the same false fact in a file the previous sweep never read.
// proseSources() lives in test/helpers/prose.js (finding E1) so every fact rule
// sweeps the same list.

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
// Checks the fact, not the sentence shape (review finding E7): the section may
// phrase the list any way it likes, as long as it names groups by schema label and
// uses none of the synonyms below.

// Synonyms that already slipped in once — keep this list short.
const GROUP_SYNONYMS = {
  en: ['water top-up', 'fresh water'],
  de: ['Frischwasser', 'Wassernachspeisung', 'Nachspeisung'],
};

/**
 * The guide's feature-group section: from its heading to the next "## " heading.
 * @param {string} md @param {string} heading @returns {string|null}
 */
function guideSection(md, heading) {
  const i = md.indexOf(heading);
  if (i < 0) return null;
  const rest = md.slice(i + heading.length);
  const next = rest.search(/\n## /);
  return (next < 0 ? rest : rest.slice(0, next)).replace(/\s+/g, ' ');
}

/**
 * Schema labels named in a feature-group section, and synonyms it uses instead.
 * @param {string} section @param {'en'|'de'} lang
 * @returns {{named: Array<string>, synonyms: Array<string>}}
 */
function groupNaming(section, lang) {
  return {
    named: groupSettings()
      .filter((g) => labelRegex(g.label[lang]).test(section))
      .map((g) => g.id),
    synonyms: GROUP_SYNONYMS[lang].filter((s) => labelRegex(s).test(section)),
  };
}

test('the group-naming check accepts any phrasing and rejects a synonym', () => {
  const free = groupNaming(
    'Heater, solar, cover, backwash, water refill and overflow tank each have an Auto / Always show / Hide setting.',
    'en',
  );
  assert.ok(free.named.length >= 4, `a list without parentheses was not recognised: ${free.named}`);
  assert.deepStrictEqual(free.synonyms, []);

  const old = groupNaming('Jede Ausstattungsgruppe (Heizung, Solar, Abdeckung, Rückspülung, Frischwasser, Überlaufbehälter, …)', 'de');
  assert.deepStrictEqual(old.synonyms, ['Frischwasser']);
});

test('the quick-start guides name feature groups by their schema labels', () => {
  for (const [lang, file, heading] of /** @type {Array<['en'|'de', string, string]>} */ ([
    ['en', 'docs/community/quickstart-guide.en.md', '## Showing/hiding equipment tiles'],
    ['de', 'docs/community/quickstart-guide.de.md', '## Anlagenteile ein-/ausblenden'],
  ])) {
    const section = guideSection(readText(file), heading);
    assert.ok(section, `${file} has no "${heading}" section`);
    const { named, synonyms } = groupNaming(section, lang);
    assert.ok(named.length >= 4, `${file}: expected the section to name groups by schema label, found ${named}`);
    assert.deepStrictEqual(synonyms, [], `${file} calls a feature group by a name the settings do not use`);
  }
});

test('README does not promise "Always show" for a force-less group', () => {
  const forceless = groupSettings().filter((g) => !g.values.includes('force'));
  const readme = readText('README.md');

  for (const s of sentences(readme)) {
    if (!FORCE_PHRASE.en.test(s)) continue;
    for (const g of forceless) {
      assert.ok(
        !labelRegex(g.label.en).test(s),
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
