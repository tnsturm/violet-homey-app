'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG_QUERY, buildConfigUrl, parseConfigFacts, fetchConfigFacts, createConfigLogThrottle, factsEmpty } = require('../lib/ConfigSource');

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

test('fetchConfigFacts: parsed facts on 200 JSON; URL is the whitelist URL', async () => {
  const orig = global.fetch;
  /** @type {Array<{url: string, opts: *}>} */
  const calls = [];
  global.fetch = /** @type {any} */ (async (/** @type {*} */ url, /** @type {*} */ opts) => {
    calls.push({ url: String(url), opts });
    return { ok: true, status: 200, text: async () => JSON.stringify(reference) };
  });
  try {
    const f = await fetchConfigFacts('violet.test');
    assert.strictEqual(f.heaterControlUse, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, buildConfigUrl('violet.test'));
    assert.strictEqual(calls[0].opts.redirect, 'error'); // Host-Pinning wie SR-08
    assert.strictEqual(calls[0].opts.headers, undefined); // Default: KEIN Auth-Header
  } finally { global.fetch = orig; }
});

test('fetchConfigFacts: restricted (Klartext-Body) + Credentials → einmaliger Auth-Retry (SR-14)', async () => {
  const orig = global.fetch;
  /** @type {Array<{url: string, opts: *}>} */
  const calls = [];
  global.fetch = /** @type {any} */ (async (/** @type {*} */ url, /** @type {*} */ opts) => {
    calls.push({ url: String(url), opts });
    if (calls.length === 1) return { ok: true, status: 200, text: async () => 'Access restricted, no Auth found' };
    return { ok: true, status: 200, text: async () => JSON.stringify(reference) };
  });
  try {
    const f = await fetchConfigFacts('violet.test', { credentials: { username: 'u', password: 'p' } });
    assert.strictEqual(f.refillControlUse, true);
    assert.strictEqual(calls.length, 2);
    assert.ok(!calls[0].url.includes('u:p') && !calls[1].url.includes('u:p'), 'creds never in URL (SR-14)');
    assert.match(calls[1].opts.headers.Authorization, /^Basic /);
  } finally { global.fetch = orig; }
});

test('fetchConfigFacts: 401 ohne Credentials → Error ohne Body/Creds (SR-12/14)', async () => {
  const orig = global.fetch;
  global.fetch = /** @type {any} */ (async () => ({ ok: false, status: 401, text: async () => 'Access restricted, no Auth found' }));
  try {
    await assert.rejects(() => fetchConfigFacts('violet.test'), (/** @type {Error} */ err) => {
      assert.match(err.message, /401|restricted/i);
      assert.ok(!err.message.includes('Access restricted, no Auth found'), 'no raw body in errors');
      return true;
    });
  } finally { global.fetch = orig; }
});

test('fetchConfigFacts: restricted trotz Credentials → Error (kein zweiter Retry)', async () => {
  const orig = global.fetch;
  let n = 0;
  global.fetch = /** @type {any} */ (async () => { n += 1; return { ok: false, status: 401, text: async () => 'x' }; });
  try {
    await assert.rejects(() => fetchConfigFacts('violet.test', { credentials: { username: 'u', password: 'p' } }));
    assert.strictEqual(n, 2);
  } finally { global.fetch = orig; }
});

test('SR-11 grep: source of ConfigSource never contains getConfig?ALL', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/ConfigSource.js'), 'utf8');
  assert.ok(!src.includes('getConfig?' + 'ALL'));
});

test('factsEmpty: bare {date,time} envelope (no whitelisted signal at all) → true (SR-13)', () => {
  assert.strictEqual(factsEmpty(parseConfigFacts({ date: '14.07.2026', time: '15:24:20' })), true);
});

test('factsEmpty: reference fixture (full signal) → false', () => {
  assert.strictEqual(factsEmpty(parseConfigFacts(reference)), false);
});

test('factsEmpty: a single known flag counts as signal → false', () => {
  assert.strictEqual(factsEmpty(parseConfigFacts({ COVER_control_use: '0' })), false);
});

test('createConfigLogThrottle: first/repeat/recovered-Sequenz (SR-16)', () => {
  const t = createConfigLogThrottle(300000);
  assert.strictEqual(t.success(0), null);            // Erfolg ohne vorherigen Fehler: still
  assert.strictEqual(t.failure(1000), 'first');      // 1. Fehler: Warnung
  assert.strictEqual(t.failure(2000), null);         // direkt danach: gedrosselt
  assert.strictEqual(t.failure(302000), 'repeat');   // > 5 min später: einmal loggen
  assert.strictEqual(t.failure(303000), null);       // wieder gedrosselt
  assert.strictEqual(t.success(304000), 'recovered');// Recovery: Info
  assert.strictEqual(t.success(305000), null);       // erneuter Erfolg: still
  assert.strictEqual(t.failure(306000), 'first');    // neuer Fehlerzyklus beginnt vorn
});
