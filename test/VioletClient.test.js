'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildReadingsUrl, parseReadings } = require('../lib/VioletClient');

const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/getReadings.all.json'), 'utf8'),
);

test('buildReadingsUrl composes the no-auth ALL endpoint', () => {
  assert.strictEqual(buildReadingsUrl('violet.local'), 'http://violet.local/getReadings?ALL');
});

test('parseReadings maps the core probe fields', () => {
  const p = parseReadings(raw);
  assert.strictEqual(typeof p.ph, 'number');
  assert.strictEqual(typeof p.orp, 'number');
  assert.strictEqual(typeof p.pumpOn, 'boolean');
  assert.strictEqual(p.pumpOn, true); // fixture has PUMP: 1
});

test('parseReadings lists only OK onewire channels with numeric values', () => {
  const p = parseReadings(raw);
  assert.ok(Array.isArray(p.tempChannels));
  assert.ok(p.tempChannels.length >= 1);
  for (const ch of p.tempChannels) {
    assert.strictEqual(ch.state, 'OK');
    assert.strictEqual(typeof ch.value, 'number');
    assert.ok(ch.id >= 1 && ch.id <= 12);
  }
});

test('parseReadings returns null chlorine when pot sensor absent', () => {
  const p = parseReadings({ pH_value: 7.2, orp_value: 700, PUMP: 0 });
  assert.strictEqual(p.chlorine, null);
  assert.strictEqual(p.pumpOn, false);
});
