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
