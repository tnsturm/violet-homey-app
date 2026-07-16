'use strict';

// parseAlarm unit tests — M6.1 spec §8 + threat model SR-M6-01/02/03
// (docs/superpowers/security/2026-07-16-m6.1-notify-listener-threat-model.md).
// parseAlarm must be TOTAL: any (method, url, body) → object or null, never a throw.

const { test } = require('node:test');
const assert = require('node:assert');
const { parseAlarm, LIMITS } = require('../lib/NotifyServer');

test('GET with ERRORCODE+SUBJECT parses and URL-decodes', () => {
  assert.deepStrictEqual(
    parseAlarm('GET', '/violetmessage?ERRORCODE=1234&SUBJECT=Hello%20World'),
    { errorcode: '1234', subject: 'Hello World' },
  );
});

test('any path is accepted — only the query matters (spec §6)', () => {
  assert.deepStrictEqual(
    parseAlarm('GET', '/?ERRORCODE=0&SUBJECT=Test'),
    { errorcode: '0', subject: 'Test' },
  );
  assert.deepStrictEqual(
    parseAlarm('GET', '/some/deep/path.htm?ERRORCODE=902&SUBJECT=x'),
    { errorcode: '902', subject: 'x' },
  );
});

test('POST variant: params read from form body when query has none (spec §1)', () => {
  assert.deepStrictEqual(
    parseAlarm('POST', '/violetmessage', 'ERRORCODE=0020&SUBJECT=Filterdruck+zu+niedrig'),
    { errorcode: '0020', subject: 'Filterdruck zu niedrig' },
  );
});

test('POST with params in the query works too (contract is GET-style)', () => {
  assert.deepStrictEqual(
    parseAlarm('POST', '/x?ERRORCODE=A1&SUBJECT=Timer', ''),
    { errorcode: 'A1', subject: 'Timer' },
  );
});

test('missing or empty ERRORCODE → null (spec §7: 400, no trigger)', () => {
  assert.strictEqual(parseAlarm('GET', '/x?SUBJECT=NoCode'), null);
  assert.strictEqual(parseAlarm('GET', '/x?ERRORCODE=&SUBJECT=Empty'), null);
  assert.strictEqual(parseAlarm('GET', '/x'), null);
});

test('missing SUBJECT is fine → empty subject (only ERRORCODE is mandatory)', () => {
  assert.deepStrictEqual(parseAlarm('GET', '/x?ERRORCODE=51'), { errorcode: '51', subject: '' });
});

test('ERRORCODE validation: alphanumeric 1..8 only (SR-M6-03)', () => {
  assert.strictEqual(parseAlarm('GET', '/x?ERRORCODE=12%2034&SUBJECT=s'), null); // decoded space
  assert.strictEqual(parseAlarm('GET', '/x?ERRORCODE=<script>&SUBJECT=s'), null);
  assert.strictEqual(parseAlarm('GET', '/x?ERRORCODE=123456789&SUBJECT=s'), null); // 9 chars
  assert.deepStrictEqual(parseAlarm('GET', '/x?ERRORCODE=A1&SUBJECT=s'), { errorcode: 'A1', subject: 's' });
});

test('subject sanitization: control chars stripped, length capped (SR-M6-03)', () => {
  const parsed = parseAlarm('GET', '/x?ERRORCODE=1&SUBJECT=line1%0D%0Aline2%09tab');
  assert.deepStrictEqual(parsed, { errorcode: '1', subject: 'line1 line2 tab' });
  const long = parseAlarm('GET', `/x?ERRORCODE=1&SUBJECT=${'a'.repeat(500)}`);
  assert.ok(long && long.subject.length === LIMITS.subjectLength);
});

test('malformed %-encoding must not throw → treated as best-effort text (SR-M6-01)', () => {
  const parsed = parseAlarm('GET', '/x?ERRORCODE=1&SUBJECT=%zz%');
  assert.ok(parsed !== undefined); // object or null — the call itself survived
  assert.strictEqual(parsed && parsed.errorcode, '1');
});

test('oversized URL → null (SR-M6-02)', () => {
  assert.strictEqual(parseAlarm('GET', `/x?ERRORCODE=1&SUBJECT=${'a'.repeat(LIMITS.urlLength)}`), null);
});

test('oversized body → null (SR-M6-02)', () => {
  assert.strictEqual(parseAlarm('POST', '/x', `ERRORCODE=1&SUBJECT=${'a'.repeat(LIMITS.bodyBytes)}`), null);
});

test('unsupported methods → null', () => {
  assert.strictEqual(parseAlarm('PUT', '/x?ERRORCODE=1'), null);
  assert.strictEqual(parseAlarm('DELETE', '/x?ERRORCODE=1'), null);
  assert.strictEqual(parseAlarm('', '/x?ERRORCODE=1'), null);
});

test('totality: garbage inputs never throw (SR-M6-01)', () => {
  const junk = [undefined, null, 42, {}, [], Buffer.from([0xff, 0xfe]).toString('latin1')];
  for (const m of ['GET', 'POST']) {
    for (const u of junk) {
      for (const b of junk) {
        assert.doesNotThrow(() => parseAlarm(m, /** @type {*} */ (u), /** @type {*} */ (b)));
      }
    }
  }
  assert.doesNotThrow(() => parseAlarm(/** @type {*} */ (null), /** @type {*} */ (undefined)));
});

test('duplicate params: first value wins', () => {
  assert.deepStrictEqual(
    parseAlarm('GET', '/x?ERRORCODE=1&ERRORCODE=2&SUBJECT=a&SUBJECT=b'),
    { errorcode: '1', subject: 'a' },
  );
});

test('lowercase param names are NOT accepted (contract is exact, confirmed live)', () => {
  assert.strictEqual(parseAlarm('GET', '/x?errorcode=1&subject=s'), null);
});
