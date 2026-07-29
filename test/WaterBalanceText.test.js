'use strict';

// Localized advisor text tests — M8.1 spec §5
// (docs/superpowers/specs/2026-07-28-m8.1-water-balance-advisor-design.md).
// Fixtures are built by CALLING the advisor, so the templates can never drift
// away from the real result shapes (plan Task 4, Step 1).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderAdvice, renderExcerpt, renderFillPlan, leverName } = require('../lib/WaterBalanceText');
const { adviseBalance, adviseFillWater } = require('../lib/WaterBalanceAdvisor');

const BASE = { volumeM3: 50, products: { phMinus: 'h2so4_15', chlorine: 'naocl' }, dosingCtx: { violetDosesPh: false }, fill: null };

// Fixtures (real advisor output — see WaterBalanceAdvisor.test.js for the math):
// lowTa:  LSI -0.47 corrosive, driver ta 50→120, 5880 g nahco3, predicted -0.09
// highPh: LSI +0.63 scaling,  driver ph 8.2→7.56, 20510 mL h2so4_15, trichlor note
const lowTa = adviseBalance({ ...BASE, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 50, cya: 0 });
const highPh = adviseBalance({
  ...BASE, pH: 8.2, tempC: 26, chPpm: 250, taPpm: 100, cya: 0,
  products: { phMinus: 'h2so4_15', chlorine: 'trichlor' },
});
const incomplete = adviseBalance({});
const noVolume = adviseBalance({ ...BASE, volumeM3: null, pH: 7.4, tempC: 26, chPpm: 250, taPpm: 50, cya: 0 });
const violetPh = adviseBalance({
  ...BASE, pH: 8.2, tempC: 26, chPpm: 250, taPpm: 100, cya: 0, dosingCtx: { violetDosesPh: true },
});
const fillOk = adviseFillWater({ dhTotal: 14, ks43: 2.5, phTap: 7.5, caFractionPct: 75, volumeM3: 50, tempC: 26, products: { phMinus: 'h2so4_15' } });
const fillIncomplete = adviseFillWater({});

test('renderAdvice de: driver name, amount with unit, band, comma decimals, hedged predicted LSI (spec §5)', () => {
  const s = renderAdvice(lowTa, 'de');
  assert.match(s, /Alkalität/);            // leverName('ta','de')
  assert.match(s, /Natron \(NaHCO₃\)/);    // chemName('nahco3','de')
  assert.match(s, /5880 g/);
  assert.match(s, /korrosiv/);
  assert.match(s, /-0,47/);                // de comma decimals, signed LSI
  assert.ok(!s.includes('-0.47'), 'de must not use dot decimals');
  assert.match(s, /≈ ?-0,09/);             // predicted LSI hedged (spec §4.5 honesty rule)
});

test('renderAdvice en: english lever/chemical names and dot decimals', () => {
  const s = renderAdvice(lowTa, 'en');
  assert.match(s, /alkalinity/);
  assert.match(s, /baking soda \(NaHCO₃\)/);
  assert.match(s, /5880 g/);
  assert.match(s, /corrosive/);
  assert.match(s, /-0\.47/);
  assert.ok(!s.includes('-0,47'), 'en must not use comma decimals');
  assert.match(s, /≈ ?-0\.09/);
});

test('renderAdvice: pH-lowering advice names the acid product with its concentration (both langs)', () => {
  assert.match(renderAdvice(highPh, 'de'), /Schwefelsäure 14,9 %/);
  assert.match(renderAdvice(highPh, 'de'), /20510 mL/);
  assert.match(renderAdvice(highPh, 'en'), /sulfuric acid 14\.9 %/);
  assert.match(renderAdvice(highPh, 'de'), /\+0,63/);   // positive LSI carries a sign
});

test('renderAdvice: chlorine note rendered (trichlor drift, both langs)', () => {
  assert.match(renderAdvice(highPh, 'de'), /Trichlor/);
  assert.match(renderAdvice(highPh, 'en'), /[Tt]richlor/);
});

test('renderAdvice: notes rendered — needs_volume, violet_doses_ph, aeration_first, dilution %', () => {
  const nv = renderAdvice(noVolume, 'de');
  assert.match(nv, /Beckenvolumen/);
  assert.ok(!/\d+ g\b/.test(nv), 'without volume there are no gram amounts');
  assert.match(renderAdvice(noVolume, 'en'), /pool volume/i);

  const vp = renderAdvice(violetPh, 'de');
  assert.match(vp, /Violet/);
  assert.match(renderAdvice(violetPh, 'en'), /Violet/);

  assert.match(renderAdvice(lowTa, 'de'), /Belüftung|belüft/i);   // aeration_first
  assert.match(renderAdvice(lowTa, 'en'), /aeration/i);

  // ch lever in highPh carries the dilution note (measure null, no fill data)
  assert.match(renderAdvice(highPh, 'de'), /Teilwasserwechsel/);
  assert.match(renderAdvice(highPh, 'en'), /partial water exchange/);
});

test('renderAdvice: dilution measure renders the exchange percentage', () => {
  const r = adviseBalance({
    ...BASE, pH: 7.4, tempC: 26, chPpm: 600, taPpm: 100, cya: 0,
    fill: { chPpm: 150, taPpm: 100 },
  });
  const ch = r.drivers.find((d) => d.param === 'ch');
  assert.ok(ch && ch.measure && ch.measure.chemical === 'dilution', 'fixture must produce a dilution measure');
  const s = renderAdvice(r, 'de');
  assert.match(s, new RegExp(`${ch.measure.amount.value} ?%`));
  assert.match(s, /Teilwasserwechsel/);
});

test('renderAdvice: fill_water_is_source honesty note', () => {
  const r = adviseBalance({
    ...BASE, pH: 7.4, tempC: 26, chPpm: 600, taPpm: 100, cya: 0,
    fill: { chPpm: 600, taPpm: 100 },
  });
  assert.ok(r.drivers.some((d) => d.notes.includes('fill_water_is_source')), 'fixture must carry the note');
  assert.match(renderAdvice(r, 'de'), /Füllwasser/);
  assert.match(renderAdvice(r, 'en'), /fill water/i);
});

test('renderAdvice incomplete: lists the missing values localized, no amounts, no LSI claim', () => {
  const de = renderAdvice(incomplete, 'de');
  assert.match(de, /pH-Wert/);
  assert.match(de, /Wassertemperatur/);
  assert.match(de, /Calciumhärte/);
  assert.match(de, /Alkalität/);
  assert.ok(!de.includes('LSI'), 'incomplete text makes no LSI claim');
  assert.ok(!/\d+ ?(g|mL)\b/.test(de), 'incomplete text carries no amounts');

  const en = renderAdvice(incomplete, 'en');
  assert.match(en, /water temperature/);
  assert.match(en, /calcium hardness/);
  assert.match(en, /alkalinity/);
  assert.ok(!en.includes('LSI'));
});

test('renderAdvice incomplete: stale + lsi_disabled reasons get their own sentence (device wiring)', () => {
  const stale = { ...incomplete, missing: ['stale'] };
  assert.match(renderAdvice(stale, 'de'), /aktuell|Umwälz/i);
  assert.match(renderAdvice(stale, 'en'), /fresh|circulat/i);

  const off = { ...incomplete, missing: ['lsi_disabled'] };
  assert.match(renderAdvice(off, 'de'), /Einstellungen/);
  assert.match(renderAdvice(off, 'en'), /settings/i);

  const both = { ...incomplete, missing: ['lsi_disabled', 'stale', 'pH'] };
  const s = renderAdvice(both, 'de');
  assert.match(s, /Einstellungen/);
  assert.match(s, /pH-Wert/);
});

test('renderExcerpt: ≤ 200 chars, contains band and the top measure (both langs)', () => {
  for (const lang of ['de', 'en']) {
    const s = renderExcerpt(lowTa, lang);
    assert.ok(s.length <= 200, `excerpt too long (${s.length}): ${s}`);
    assert.match(s, lang === 'de' ? /korrosiv/ : /corrosive/);
    assert.match(s, /5880 g/);
    assert.match(s, lang === 'de' ? /Natron/ : /baking soda/);
  }
  assert.ok(renderExcerpt(highPh, 'de').length <= 200);
  assert.ok(renderExcerpt(incomplete, 'de').length <= 200);
  assert.ok(renderExcerpt(noVolume, 'en').length <= 200);
  assert.ok(renderExcerpt({}, 'de').length <= 200);
});

test('renderExcerpt: genuinely over-long content is truncated with an ellipsis', () => {
  // All reason sentences plus the full missing-value list overflow the 200-char cap
  // (de: 253 chars untruncated, en: 252) — this fixture actually exercises clip().
  const overflow = { ...incomplete, missing: ['stale', 'lsi_disabled', 'pH', 'tempC', 'chPpm', 'taPpm'] };
  for (const lang of ['de', 'en']) {
    // renderAdvice renders the same sentences uncapped — proof the fixture really overflows.
    const raw = renderAdvice(overflow, lang);
    assert.ok(raw.length > 200, `fixture must exceed the cap, got ${raw.length}`);
    const s = renderExcerpt(overflow, lang);
    assert.ok(s.length <= 200, `truncation failed (${s.length}): ${s}`);
    assert.ok(s.endsWith('…'), `truncation marker missing: ${s}`);
    assert.ok(raw.startsWith(s.slice(0, -1).trimEnd()), 'truncated excerpt must be a prefix of the full text');
  }
});

test('renderFillPlan: ordered steps TA → CH → outgassing → pH with equilibrium pH value', () => {
  const de = renderFillPlan(fillOk, 'de');
  const iTa = de.indexOf('Alkalität');
  const iCh = de.indexOf('Calciumhärte');
  const iOut = de.search(/CO₂/);
  const iPh = de.lastIndexOf('pH');
  assert.ok(iTa >= 0 && iCh > iTa, `TA before CH: ${de}`);
  assert.ok(iOut > iCh, `outgassing after CH: ${de}`);
  assert.ok(iPh > iOut, `pH step last: ${de}`);
  assert.match(de, /8,4/);              // equilibrium pH, de comma
  assert.match(de, /7,56/);             // pH target
  assert.match(de, /Calciumchlorid/);   // chemName cacl2
  assert.match(de, /4600 g/);

  const en = renderFillPlan(fillOk, 'en');
  assert.match(en, /8\.4/);
  assert.match(en, /calcium chloride/);
  assert.match(en, /CO₂/);
  // Numbered steps start with a capital in both languages (en templates lead with the verb).
  for (const s of [de, en]) {
    // (the outgassing step legitimately starts with a digit: "1–2 days")
    for (const m of s.matchAll(/(?:^|\s)(\d+\.\s*)(\S)/g)) assert.ok(!/\p{Ll}/u.test(m[2]), `step not capitalized: ${s}`);
  }
});

test('renderFillPlan incomplete: names the missing waterworks values, both langs', () => {
  const de = renderFillPlan(fillIncomplete, 'de');
  assert.match(de, /Gesamthärte/);
  assert.match(de, /Säurekapazität/);
  assert.ok(!/\d+ ?(g|mL)\b/.test(de));
  const en = renderFillPlan(fillIncomplete, 'en');
  assert.match(en, /total hardness/i);
  assert.match(en, /acid capacity/i);
});

test('unknown/absent language falls back to en (spec §5)', () => {
  assert.equal(renderAdvice(lowTa, 'fr'), renderAdvice(lowTa, 'en'));
  assert.equal(renderAdvice(lowTa, undefined), renderAdvice(lowTa, 'en'));
  assert.equal(renderExcerpt(lowTa, 'nl'), renderExcerpt(lowTa, 'en'));
  assert.equal(renderFillPlan(fillOk, ''), renderFillPlan(fillOk, 'en'));
  assert.equal(leverName('ta', 'it'), leverName('ta', 'en'));
});

test('leverName: localized lever names for the top_driver token (Task 6)', () => {
  assert.equal(leverName('ph', 'en'), 'pH');
  assert.equal(leverName('ph', 'de'), 'pH-Wert');
  assert.equal(leverName('ta', 'en'), 'alkalinity');
  assert.equal(leverName('ta', 'de'), 'Alkalität');
  assert.equal(leverName('ch', 'en'), 'calcium hardness');
  assert.equal(leverName('ch', 'de'), 'Calciumhärte');
  assert.equal(typeof leverName(/** @type {*} */ (null), 'de'), 'string');
  assert.equal(typeof leverName(/** @type {*} */ ({}), 'en'), 'string');
});

test('totality: garbage/partial results yield a best-effort string, never a throw (spec §4.8)', () => {
  /** @type {Array<*>} */
  const junk = [
    {}, null, undefined, 42, 'nonsense', [],
    { status: 'ok' },
    { status: 'ok', drivers: null, lsiNow: 'abc', band: 7, co2: null },
    { status: 'ok', lsiNow: NaN, band: 'corrosive', drivers: [null, { param: 'xx' }, { param: 'ta', measure: { chemical: 'zzz', amount: {} } }], co2: {} },
    { status: 'incomplete', missing: [null, 5, 'unknown_key'] },
    { status: 'ok', plan: [null, { step: 'nope' }, { step: 'ta', measure: {} }] },
  ];
  for (const r of junk) {
    for (const lang of [/** @type {*} */ ('de'), 'en', undefined, 42]) {
      for (const fn of [renderAdvice, renderExcerpt, renderFillPlan]) {
        const s = fn(r, lang);
        assert.equal(typeof s, 'string', `${fn.name} must return a string`);
        assert.ok(s.length > 0, `${fn.name} must not return an empty string`);
        assert.ok(!s.includes('undefined') && !s.includes('NaN') && !s.includes('null'),
          `${fn.name} leaked a placeholder: ${s}`);
      }
    }
  }
});

test('output hygiene: no double spaces, no leading/trailing whitespace', () => {
  for (const r of [lowTa, highPh, incomplete, noVolume, violetPh]) {
    for (const lang of ['de', 'en']) {
      for (const s of [renderAdvice(r, lang), renderExcerpt(r, lang)]) {
        assert.equal(s, s.trim(), `whitespace at the edges: "${s}"`);
        assert.ok(!s.includes('  '), `double space: "${s}"`);
      }
    }
  }
  for (const r of [fillOk, fillIncomplete]) {
    for (const lang of ['de', 'en']) {
      const s = renderFillPlan(r, lang);
      assert.equal(s, s.trim());
      assert.ok(!s.includes('  '), `double space: "${s}"`);
    }
  }
});
