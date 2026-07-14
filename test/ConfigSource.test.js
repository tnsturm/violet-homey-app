'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG_QUERY, buildConfigUrl, parseConfigFacts } = require('../lib/ConfigSource');

const reference = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/getconfig-reference.json'), 'utf8'),
);

test('buildConfigUrl queries exactly the whitelist (SR-11)', () => {
  const url = buildConfigUrl('violet.test');
  assert.strictEqual(url, `http://violet.test/getConfig?${CONFIG_QUERY.join(',')}`);
  assert.ok(!url.includes('ALL'), 'must never query ?ALL');
  assert.ok(!url.includes('@'), 'no credentials in URL (SR-14)');
});

test('CONFIG_QUERY contains no secret groups (SR-11)', () => {
  for (const k of CONFIG_QUERY) {
    assert.ok(!/^(NET_|NOTIFY_|USER_|AUTH_|USERMODE_|BACKUP_|SERVICES_)/.test(k), `secret group in whitelist: ${k}`);
  }
});

test('parseConfigFacts: reference fixture → normalized facts', () => {
  const f = parseConfigFacts(reference);
  assert.strictEqual(f.coverControlUse, false);       // string "0"
  assert.strictEqual(f.extension1Use, false);         // number 0 (Mischtyp, Spec §1.4)
  assert.strictEqual(f.solarControlUse, false);
  assert.strictEqual(f.heaterControlUse, true);
  assert.strictEqual(f.heaterPvsurplusUse, true);
  assert.strictEqual(f.pumpPvsurplusUse, true);
  assert.strictEqual(f.backwashControlUse, false);
  assert.strictEqual(f.refillControlUse, true);
  assert.deepStrictEqual(f.adcChannels[0], { id: 1, use: true, units: 'Bar', name: 'Filterdruck' });
  assert.strictEqual(f.adcChannels.length, 6);
  assert.deepStrictEqual(f.impulsChannels, [
    { id: 1, use: true, units: 'cm/s' },
    { id: 2, use: false, units: 'm³/h' },
  ]);
  assert.strictEqual(f.onewireNames['1'], 'Schwimmbad');
  assert.strictEqual(f.onewireNames['9'], undefined); // leer → weggelassen
});

test('parseConfigFacts: fehlende Keys → null-Flags, leere Kanäle (Spec §3)', () => {
  const f = parseConfigFacts({ date: '14.07.2026', time: '15:24:20' });
  assert.strictEqual(f.coverControlUse, null);
  assert.strictEqual(f.heaterControlUse, null);
  assert.deepStrictEqual(f.adcChannels, []);
  assert.deepStrictEqual(f.impulsChannels, []);
  assert.deepStrictEqual(f.onewireNames, {});
});

test('parseConfigFacts: wirft nie, verwirft Fremd-Keys (SR-12, SR-13)', () => {
  for (const bad of [null, undefined, 'Access restricted, no Auth found', 42, []]) {
    const f = parseConfigFacts(bad);
    assert.strictEqual(f.coverControlUse, null);
  }
  const f = parseConfigFacts({ NET_wifi_password: 'x', COVER_control_use: '1', EXTENSION_1_use: 1 });
  assert.strictEqual(f.coverControlUse, true);
  assert.ok(!JSON.stringify(f).includes('wifi'), 'non-whitelisted keys must not survive');
});

test('parseConfigFacts: Platzhalter-Namen ("-", leer) werden gedroppt', () => {
  const f = parseConfigFacts({ NAMES_adc6: '-', NAMES_onewire3: '  ', NAMES_onewire1: 'Pool' });
  assert.strictEqual(f.onewireNames['1'], 'Pool');
  assert.strictEqual(f.onewireNames['3'], undefined);
  const adc6 = f.adcChannels.find((c) => c.id === 6);
  assert.strictEqual(adc6, undefined); // kein _use-Key → Kanal nicht gelistet
});
