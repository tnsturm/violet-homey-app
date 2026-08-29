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

test('parseReadings exposes pumpLastOn from PUMP_LAST_ON', () => {
  assert.strictEqual(parseReadings({ PUMP_LAST_ON: '1782331200' }).pumpLastOn, 1782331200);
  assert.strictEqual(parseReadings({}).pumpLastOn, null);
});

// Review 2026-08-28 N10: users paste URLs into the host field - strip scheme
// and trailing slashes so buildReadingsUrl never yields http://http://...
test('normalizeHost strips pasted scheme and trailing slash (N10)', () => {
  const { normalizeHost } = require('../lib/VioletClient');
  assert.strictEqual(normalizeHost(' http://192.168.178.30/ '), '192.168.178.30');
  assert.strictEqual(normalizeHost('HTTPS://violet.local'), 'violet.local');
  assert.strictEqual(normalizeHost('violet.local'), 'violet.local');
  assert.strictEqual(normalizeHost(null), '');
});
