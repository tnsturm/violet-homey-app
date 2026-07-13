'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { deriveDeviceId } = require('../lib/deviceIdentity');

test('deriveDeviceId returns the serial string', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '4' }), '4');
});

test('deriveDeviceId trims whitespace', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '  4 ' }), '4');
});

test('deriveDeviceId coerces numeric serials to string', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: 4 }), '4');
});

test('deriveDeviceId returns null when the key is missing', () => {
  assert.strictEqual(deriveDeviceId({}), null);
});

test('deriveDeviceId returns null for empty or blank serials', () => {
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '' }), null);
  assert.strictEqual(deriveDeviceId({ HW_SERIAL_CARRIER: '   ' }), null);
});

test('deriveDeviceId reads the serial from the full live fixture', () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/getReadings.all.json'), 'utf8'),
  );
  assert.strictEqual(deriveDeviceId(raw), String(raw.HW_SERIAL_CARRIER).trim());
});
