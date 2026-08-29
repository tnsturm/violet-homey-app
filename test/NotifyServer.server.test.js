'use strict';

// NotifyServer server-part tests — M6.1 spec §3/§7 + SR-M6-01/02/06/07/09.
// Real sockets on 127.0.0.1 with OS-assigned free ports (listen(0) probe).

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const { createNotifyServer } = require('../lib/NotifyServer');

/** Find a free TCP port (bind 0, read, release). @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address());
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

/** GET helper. @param {number} port @param {string} path @returns {Promise<{status: number, body: string}>} */
function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    }).on('error', reject);
  });
}

test('valid GET fires onAlarm with tokens + remoteAddress and answers 200 OK', async () => {
  const port = await freePort();
  /** @type {*[]} */
  const fired = [];
  const handle = await createNotifyServer({ port, onAlarm: (a) => fired.push(a) });
  try {
    const res = await get(port, '/violetmessage?ERRORCODE=1234&SUBJECT=Hello%20World');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body, 'OK');
    assert.strictEqual(fired.length, 1);
    assert.strictEqual(fired[0].errorcode, '1234');
    assert.strictEqual(fired[0].subject, 'Hello World');
    assert.ok(typeof fired[0].remoteAddress === 'string' && fired[0].remoteAddress.length > 0);
  } finally { await handle.close(); }
});

test('missing ERRORCODE → 400 Bad Request, no onAlarm (spec §7)', async () => {
  const port = await freePort();
  let fired = 0;
  const handle = await createNotifyServer({ port, onAlarm: () => { fired += 1; } });
  try {
    const res = await get(port, '/violetmessage?SUBJECT=NoCode');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body, 'Bad Request');
    assert.strictEqual(fired, 0);
  } finally { await handle.close(); }
});

test('response bodies are static — attacker input is never echoed (SR-M6-09)', async () => {
  const port = await freePort();
  const handle = await createNotifyServer({ port, onAlarm: () => {} });
  try {
    const res = await get(port, '/x?ERRORCODE=<img>&SUBJECT=<script>alert(1)</script>');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body, 'Bad Request'); // exact — nothing reflected
  } finally { await handle.close(); }
});

test('EADDRINUSE from a foreign server rejects with the original error (SR-M6-07)', async () => {
  const port = await freePort();
  const squatter = http.createServer(() => {});
  await new Promise((resolve) => squatter.listen(port, '0.0.0.0', () => resolve(undefined)));
  try {
    await assert.rejects(
      createNotifyServer({ port, onAlarm: () => {} }),
      (/** @type {*} */ err) => err.code === 'EADDRINUSE',
    );
  } finally { await new Promise((resolve) => squatter.close(() => resolve(undefined))); }
});

test('singleton per port: second create attaches, both fire, close is refcounted (spec §3)', async () => {
  const port = await freePort();
  /** @type {string[]} */
  const calls = [];
  const h1 = await createNotifyServer({ port, onAlarm: () => calls.push('a') });
  const h2 = await createNotifyServer({ port, onAlarm: () => calls.push('b') });
  await get(port, '/x?ERRORCODE=1&SUBJECT=s');
  assert.deepStrictEqual(calls.sort(), ['a', 'b']);
  await h1.close();
  await get(port, '/x?ERRORCODE=2&SUBJECT=s'); // h2 still listening
  assert.strictEqual(calls.length, 3);
  await h2.close();
  // Port is actually free again after the last close.
  const reclaim = net.createServer();
  await new Promise((resolve, reject) => {
    reclaim.listen(port, '127.0.0.1', () => reclaim.close(() => resolve(undefined)));
    reclaim.on('error', reject);
  });
});

test('concurrent unawaited creates on one port share one server — no spurious EADDRINUSE (spec §3)', async () => {
  const port = await freePort();
  /** @type {string[]} */
  const calls = [];
  const [h1, h2] = await Promise.all([
    createNotifyServer({ port, onAlarm: () => calls.push('a') }),
    createNotifyServer({ port, onAlarm: () => calls.push('b') }),
  ]);
  try {
    await get(port, '/x?ERRORCODE=1&SUBJECT=s');
    assert.deepStrictEqual(calls.sort(), ['a', 'b']);
  } finally { await h1.close(); await h2.close(); }
});

test('trigger-rate limit: flood fires onAlarm at most triggersPerWindow times (SR-M6-06)', async () => {
  const port = await freePort();
  let fired = 0;
  /** @type {string[]} */
  const errors = [];
  const handle = await createNotifyServer({
    port,
    onAlarm: () => { fired += 1; },
    error: (m) => errors.push(m),
    limits: { triggersPerWindow: 3, windowMs: 60000 },
  });
  try {
    for (let i = 0; i < 10; i += 1) {
      const res = await get(port, `/x?ERRORCODE=1&SUBJECT=flood${i}`);
      assert.strictEqual(res.status, 200); // sender always sees success
    }
    assert.strictEqual(fired, 3);
    assert.strictEqual(errors.filter((m) => /rate/i.test(m)).length, 1); // one warn per window
  } finally { await handle.close(); }
});

test('oversized POST body is cut off with 400, server survives (SR-M6-02)', async () => {
  const port = await freePort();
  let fired = 0;
  const handle = await createNotifyServer({ port, onAlarm: () => { fired += 1; }, limits: { bodyBytes: 64 } });
  try {
    const status = await new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/x', method: 'POST' },
        (res) => resolve(res.statusCode),
      );
      req.on('error', () => resolve(-1)); // connection may be destroyed mid-send — that's fine too
      req.end(`ERRORCODE=1&SUBJECT=${'a'.repeat(10000)}`);
    });
    assert.ok(status === 400 || status === -1);
    assert.strictEqual(fired, 0);
    // Listener still works afterwards:
    const res = await get(port, '/x?ERRORCODE=2&SUBJECT=ok');
    assert.strictEqual(res.status, 200);
  } finally { await handle.close(); }
});

// Review 2026-08-28 N7: bodies must be collected as bytes and decoded ONCE —
// per-chunk string concat corrupted multibyte characters on TCP boundaries and
// measured the SR-M6-02 cap in UTF-16 units (~3x bypass for multibyte payloads).

/** Raw POST with the body sent in explicit chunks. @param {number} port @param {Buffer[]} chunks @returns {Promise<number>} status (-1 on destroyed connection) */
function rawChunkedPost(port, chunks) {
  const body = Buffer.concat(chunks);
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1', async () => {
      sock.write(`POST /violetmessage HTTP/1.1\r\nHost: x\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`);
      for (const chunk of chunks) {
        sock.write(chunk);
        await new Promise((r) => setTimeout(r, 30)); // force separate TCP segments
      }
    });
    let response = '';
    sock.on('data', (d) => { response += d; });
    sock.on('close', () => resolve(Number((response.match(/^HTTP\/1\.1 (\d+)/) || [])[1] ?? -1)));
    sock.on('error', () => resolve(-1));
  });
}

test('POST body split mid-UTF-8-character decodes intact (N7)', async () => {
  const port = await freePort();
  /** @type {*[]} */
  const fired = [];
  const handle = await createNotifyServer({ port, onAlarm: (a) => fired.push(a) });
  try {
    const bytes = Buffer.from('ERRORCODE=7&SUBJECT=Sch%C3%B6n+Anlage=Störung', 'utf8');
    // Split inside the raw "ö" (0xC3 0xB6) of "Störung" — after the 0xC3 byte.
    const splitAt = bytes.indexOf(0xc3, bytes.indexOf('Anlage')) + 1;
    const status = await rawChunkedPost(port, [bytes.subarray(0, splitAt), bytes.subarray(splitAt)]);
    assert.strictEqual(status, 200);
    assert.strictEqual(fired.length, 1);
    assert.ok(!fired[0].subject.includes('�'), `subject corrupted: "${fired[0].subject}"`);
    assert.ok(fired[0].subject.includes('Störung'), `expected intact "Störung", got "${fired[0].subject}"`);
  } finally { await handle.close(); }
});

test('body cap counts BYTES, not UTF-16 code units (N7, SR-M6-02)', async () => {
  const port = await freePort();
  let fired = 0;
  const handle = await createNotifyServer({ port, onAlarm: () => { fired += 1; }, limits: { bodyBytes: 4096 } });
  try {
    // 1500 × '€' (3 bytes each) = 4500 bytes but only 1500 UTF-16 units — the
    // old string-length cap waved this through.
    const big = Buffer.from(`ERRORCODE=1&SUBJECT=${'€'.repeat(1500)}`, 'utf8');
    assert.ok(big.length > 4096, 'precondition: payload exceeds the byte cap');
    const status = await rawChunkedPost(port, [big]);
    assert.ok(status === 400 || status === -1, `oversized-by-bytes body must be rejected (got ${status})`);
    assert.strictEqual(fired, 0);
  } finally { await handle.close(); }
});

test('destroyed sockets and garbage bytes never crash the process (SR-M6-01)', async () => {
  const port = await freePort();
  const handle = await createNotifyServer({ port, onAlarm: () => {} });
  try {
    await new Promise((resolve) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write('\xff\xfe garbage not-http\r\n\r\n');
        sock.destroy();
        resolve(undefined);
      });
      sock.on('error', () => resolve(undefined));
    });
    // Give the event loop a beat, then prove the server is alive and well.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const res = await get(port, '/x?ERRORCODE=3&SUBJECT=alive');
    assert.strictEqual(res.status, 200);
  } finally { await handle.close(); }
});
