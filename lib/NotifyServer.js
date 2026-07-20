'use strict';

// Violet NOTIFY inbound alarm listener — M6.1 spec §3/§4
// (docs/superpowers/specs/2026-06-26-violet-http-notifications-design.md) +
// threat model SR-M6-01..09
// (docs/superpowers/security/2026-07-16-m6.1-notify-listener-threat-model.md).
// This file has NO Homey dependency: parseAlarm is pure/total; the server part
// (Task 2) wraps node:http with a module-level singleton registry per port.

const http = require('node:http');

// SR-M6-02/03: hard input bounds — single source of truth, shared with the server.
const LIMITS = Object.freeze({
  urlLength: 2048,
  bodyBytes: 4096,
  subjectLength: 200,
  errorcodePattern: /^[A-Za-z0-9]{1,8}$/,
  triggersPerWindow: 10,
  windowMs: 10000,
});

/**
 * Parse one NOTIFY request into an alarm, or null if it is not a valid alarm.
 * Total function (SR-M6-01): never throws, whatever the input.
 * Contract (spec §1, confirmed live 2026-07-16 via the user's relay flow):
 * `?ERRORCODE=<alnum≤8>&SUBJECT=<text>`, GET or POST (form body).
 * @param {string} method HTTP method.
 * @param {string} url Request URL (path + query).
 * @param {string} [body] Raw request body (POST form variant).
 * @returns {{ errorcode: string, subject: string } | null}
 */
function parseAlarm(method, url, body) {
  if (method !== 'GET' && method !== 'POST') return null;
  if (typeof url !== 'string' || url.length >= LIMITS.urlLength) return null;
  if (body !== undefined && (typeof body !== 'string' || body.length >= LIMITS.bodyBytes)) return null;

  // URLSearchParams never throws on malformed %-sequences (SR-M6-01) and
  // handles both %XX and '+' decoding — exactly the form-encoding NOTIFY uses.
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  let params = new URLSearchParams(query);
  // POST variant (spec §1): fall back to the form body when the query has no code.
  if (!params.get('ERRORCODE') && method === 'POST' && body) {
    params = new URLSearchParams(body);
  }

  const errorcode = params.get('ERRORCODE');
  if (!errorcode || !LIMITS.errorcodePattern.test(errorcode)) return null;

  // SR-M6-03: strip control chars (log injection, Flow-token hygiene), cap length.
  // Range covers C0 controls + DEL (\u0000-\u001f\u007f), C1 controls
  // (\u0080-\u009f), and the Unicode line/paragraph separators (\u2028/\u2029) --
  // all of which can inject fake newlines into logs or Flow-token display without
  // being caught by the plain ASCII control set alone (SR-M6-03).
  const rawSubject = params.get('SUBJECT') || '';
  const subject = rawSubject
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .trim()
    .slice(0, LIMITS.subjectLength);

  return { errorcode, subject };
}

// Module-level singleton registry (spec §3): one http.Server per port app-wide.
// Each entry refcounts its attached onAlarm listeners; the last close() frees the port.
/** @type {Map<number, { server: import('node:http').Server, listeners: Set<Function>, limits: *, windowStart: number, windowCount: number, warned: boolean, error: (msg: string) => void, ready: Promise<void> }>} */
const registry = new Map();

/**
 * Start (or attach to) the NOTIFY listener on a port.
 * Resolves once listening; rejects with the original bind error (EADDRINUSE et al.,
 * SR-M6-07 — caller logs it and the device keeps running).
 * @param {{ port: number, onAlarm: (alarm: { errorcode: string, subject: string, remoteAddress: string }) => void,
 *           log?: (msg: string) => void, error?: (msg: string) => void, limits?: Object<string, *> }} options
 * @returns {Promise<{ close: () => Promise<void> }>}
 */
function createNotifyServer({ port, onAlarm, log = () => {}, error = () => {}, limits = {} }) {
  const effective = { ...LIMITS, ...limits };

  /** Build the detachable handle for one attached listener. @param {*} entry */
  const makeHandle = (entry) => ({
    close() {
      entry.listeners.delete(onAlarm);
      if (entry.listeners.size > 0) return Promise.resolve();
      registry.delete(port);
      return new Promise((resolve) => entry.server.close(() => resolve(undefined)));
    },
  });

  // SR-M6-01/spec §3: registry race — two unawaited concurrent creates for the
  // same port must share ONE bind attempt. The entry (with its `ready` promise)
  // is registered synchronously below, before `.listen()` is even called, so a
  // second caller arriving before the first bind resolves attaches to the same
  // entry instead of racing its own server onto the port.
  const existing = registry.get(port);
  if (existing) {
    existing.listeners.add(onAlarm);
    return existing.ready.then(() => makeHandle(existing));
  }

  /** @type {*} */
  const entry = {
    server: /** @type {*} */ (null),
    listeners: new Set([onAlarm]),
    limits: effective,
    windowStart: 0,
    windowCount: 0,
    warned: false,
    error,
    ready: /** @type {*} */ (null),
  };

  const server = http.createServer((req, res) => {
    // SR-M6-01: the whole request path is wrapped — no input may throw uncaught.
    try {
      let body = '';
      let overflow = false;
      req.on('data', (chunk) => {
        if (overflow) return;
        body += chunk;
        if (body.length >= entry.limits.bodyBytes) {
          overflow = true; // SR-M6-02: hard cap — reject and drop the connection
          res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request');
          req.destroy();
        }
      });
      req.on('error', () => {}); // aborted uploads etc. — socket-level noise, not ours
      res.on('error', () => {}); // SR-M6-01 belt-and-braces: error handlers on both streams
      req.on('end', () => {
        if (overflow || res.writableEnded) return;
        try {
          const alarm = parseAlarm(req.method || '', req.url || '', body);
          if (!alarm) {
            res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request');
            return;
          }
          // SR-M6-06: rolling-window trigger-rate limit; the sender still gets 200
          // (the Violet retries nothing anyway) but Flows are protected from floods.
          const now = Date.now();
          if (now - entry.windowStart > entry.limits.windowMs) {
            entry.windowStart = now;
            entry.windowCount = 0;
            entry.warned = false;
          }
          if (entry.windowCount >= entry.limits.triggersPerWindow) {
            if (!entry.warned) {
              entry.warned = true;
              entry.error(`NOTIFY rate limit: >${entry.limits.triggersPerWindow} alarms in ${entry.limits.windowMs} ms — dropping excess triggers`);
            }
          } else {
            entry.windowCount += 1;
            const payload = { ...alarm, remoteAddress: req.socket.remoteAddress || '' };
            for (const listener of entry.listeners) listener(payload);
          }
          res.writeHead(200, { 'Content-Type': 'text/plain' }).end('OK'); // SR-M6-09: static body
        } catch (err) {
          // SR-M6-01 residual: a throwing logger must not escape the 'end' listener.
          try { error(`NOTIFY handler error: ${err instanceof Error ? err.message : String(err)}`); } catch { /* logger threw - nothing safe left */ }
          if (!res.writableEnded) res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Error');
        }
      });
    } catch (err) {
      // SR-M6-01 residual: same guard for the outer request-handler catch.
      try { error(`NOTIFY request error: ${err instanceof Error ? err.message : String(err)}`); } catch { /* logger threw - nothing safe left */ }
      try { req.destroy(); } catch { /* already gone */ }
    }
  });

  // SR-M6-02: slowloris guards — kill slow/incomplete requests early.
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.on('clientError', (_err, socket) => {
    try { socket.destroy(); } catch { /* already gone */ }
  });

  entry.server = server;
  // Register BEFORE listen() resolves/rejects (see race comment above): any
  // caller arriving while the bind is in flight attaches to this same entry.
  registry.set(port, entry);

  entry.ready = new Promise((resolve, reject) => {
    const onBindError = (/** @type {*} */ err) => {
      registry.delete(port); // free the port for a later, independent attempt
      reject(err);
    };
    server.once('error', onBindError);
    server.listen(port, '0.0.0.0', () => {
      server.removeListener('error', onBindError);
      // Post-bind runtime errors must never bubble as uncaught (SR-M6-01).
      server.on('error', (err) => error(`NOTIFY server error: ${err.message}`));
      log(`NOTIFY listener bound on port ${port}`);
      resolve(undefined);
    });
  });

  return entry.ready.then(() => makeHandle(entry));
}

module.exports = { parseAlarm, LIMITS, createNotifyServer };
