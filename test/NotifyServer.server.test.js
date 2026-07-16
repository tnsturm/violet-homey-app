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
