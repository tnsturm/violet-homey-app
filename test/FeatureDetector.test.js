'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { detectFeatures } = require('../lib/FeatureDetector');

test('detects chlorine dosing and a single OK temp channel', () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/chlorine-only.json'), 'utf8'),
  );
  const f = detectFeatures(raw);
  assert.strictEqual(f.chlorine, true);
  assert.strictEqual(f.electrolysis, false);
  assert.deepStrictEqual(f.okTempChannels, [1]);
});

test('detects electrolysis and lighting from the live fixture', () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/getReadings.all.json'), 'utf8'),
  );
  const f = detectFeatures(raw);
  assert.strictEqual(typeof f.light, 'boolean');
  assert.ok(Array.isArray(f.okTempChannels) && f.okTempChannels.length >= 1);
});

const salt = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'salt-electrolysis.json'), 'utf8'));
const minimal = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal-pool.json'), 'utf8'));

test('detectFeatures: history-based actuator detection', () => {
  const s = detectFeatures(salt);
  assert.strictEqual(s.heater, true);   // HEATER_RUNTIME != 0
  assert.strictEqual(s.cover, true);    // COVER_STATE present
  assert.strictEqual(s.solar, false);   // never ran
  assert.strictEqual(s.light, false);   // never ran
  assert.strictEqual(s.waterLevel, true); // BATHING_AI_SYSTEM_BOOT === 1
  assert.strictEqual(s.diagnostics, true);
  const m = detectFeatures(minimal);
  assert.strictEqual(m.heater, false);
  assert.strictEqual(m.cover, false);
  assert.strictEqual(m.waterLevel, false);
});

test('detectFeatures: dosing channels from _USE flags', () => {
  assert.deepStrictEqual(detectFeatures(salt).dosingChannels, ['elo', 'phm']);
  assert.deepStrictEqual(detectFeatures(minimal).dosingChannels, []);
});

test('detectFeatures: pump always present', () => {
  assert.strictEqual(detectFeatures(minimal).pump, true);
});

// M5.7: per-Feature-Signalmatrix mit ConfigFacts (Spec §3, §6).
const { parseConfigFacts } = require('../lib/ConfigSource');
const referenceConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/getconfig-reference.json'), 'utf8'),
);

test('M5.7 cover: Config ist in beide Richtungen autoritativ (4 Quadranten)', () => {
  const rawWithCover = { COVER_STATE: 'OPEN' };   // getReadings-Geisterwert (Spec §1.8)
  const rawNoCover = /** @type {*} */ ({});
  // Quadrant 1: control_use=0 → false trotz COVER_STATE (der reale False-Positive-Fix)
  let facts = parseConfigFacts({ COVER_control_use: '0', EXTENSION_1_use: 0, EXTENSION_2_use: 0 });
  assert.strictEqual(detectFeatures(rawWithCover, facts).cover, false);
  // Quadrant 2: control_use=1 + Extension → true auch ohne COVER_STATE
  facts = parseConfigFacts({ COVER_control_use: '1', EXTENSION_1_use: 1, EXTENSION_2_use: 0 });
  assert.strictEqual(detectFeatures(rawNoCover, facts).cover, true);
  // Quadrant 3: control_use=1, beide Extensions explizit aus → false (Cover braucht Relais)
  facts = parseConfigFacts({ COVER_control_use: '1', EXTENSION_1_use: 0, EXTENSION_2_use: 0 });
  assert.strictEqual(detectFeatures(rawWithCover, facts).cover, false);
  // Quadrant 4: control_use=1, Extension-Keys fehlen (null) → control_use allein zählt
  facts = parseConfigFacts({ COVER_control_use: '1' });
  assert.strictEqual(detectFeatures(rawNoCover, facts).cover, true);
});

test('M5.7 cover: Facts ohne COVER-Key oder facts=null → heutige Heuristik', () => {
  const raw = { COVER_STATE: 'OPEN' };
  assert.strictEqual(detectFeatures(raw, null).cover, true);
  assert.strictEqual(detectFeatures(raw, parseConfigFacts({})).cover, true);
  assert.strictEqual(detectFeatures(raw).cover, true); // Ein-Argument-Aufruf unverändert
});

test('M5.7 solar/heater: control_use ∨ pvsurplus ∨ Historie („Regelung aus" ≠ „ungenutzt")', () => {
  // Referenz-Fall (Spec §1): SOLAR_control_use=0, aber Laufzeit vorhanden → true
  const facts = parseConfigFacts(referenceConfig);
  assert.strictEqual(detectFeatures({ SOLAR_RUNTIME: '19h 23m 23s' }, facts).solar, true);
  // Solar nie gelaufen + Regelung aus → false
  assert.strictEqual(detectFeatures({}, facts).solar, false);
  // Heater: HEATER_pvsurplus_use allein reicht (Referenz-Config hat beides an)
  assert.strictEqual(detectFeatures({}, facts).heater, true);
  const noHeater = parseConfigFacts({ HEATER_control_use: '0', HEATER_pvsurplus_use: '0' });
  assert.strictEqual(detectFeatures({}, noHeater).heater, false);       // keine Historie
  assert.strictEqual(detectFeatures({ HEATER: 1 }, noHeater).heater, true); // Historie gewinnt (nur positiv-additiv)
});

test('M5.7 backwash/refill: Config nur positiv-additiv', () => {
  const facts = parseConfigFacts({ BACKWASH_control_use: '1', REFILL_control_use: '1' });
  assert.strictEqual(detectFeatures({}, facts).backwash, true);
  assert.strictEqual(detectFeatures({}, facts).refill, true);
  const off = parseConfigFacts({ BACKWASH_control_use: '0', REFILL_control_use: '0' });
  assert.strictEqual(detectFeatures({ BACKWASH: 1 }, off).backwash, true); // Historie bleibt
  assert.strictEqual(detectFeatures({}, off).backwash, false);
});

test('M5.7 adc/impuls-Kanäle werden durchgereicht (M5.8-Vorleistung)', () => {
  const facts = parseConfigFacts(referenceConfig);
  const f = detectFeatures({}, facts);
  assert.strictEqual(f.adcChannels.length, 6);
  assert.deepStrictEqual(f.impulsChannels[0], { id: 1, use: true, units: 'cm/s' });
  assert.deepStrictEqual(detectFeatures({}).adcChannels, []);
});
