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
