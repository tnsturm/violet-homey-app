'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { WRITE_TARGETS, buildWriteUrl } = require('../lib/WriteClient');

const H = 'violet.local';
const U = (s) => `http://violet.local/setFunctionManually?${s}`;

test('registry exposes exactly the M3 core targets', () => {
  assert.deepStrictEqual(Object.keys(WRITE_TARGETS).sort(), ['DMX_SCENE', 'LIGHT', 'PUMP', 'PVSURPLUS']);
});

test('PUMP encodes mode + duration + speed', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 120, speed: 2 } }), U('PUMP,ON,120,2'));
  assert.strictEqual(buildWriteUrl(H, { target: 'PUMP', state: 'AUTO', args: { duration: 0 } }), U('PUMP,AUTO,0'));
});

test('PUMP omits trailing speed when not given (default = keep configured)', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 600 } }), U('PUMP,ON,600'));
});

test('PUMP rejects out-of-range duration and bad speed and unknown state (SR-05)', () => {
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 999999 } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: -1 } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: NaN } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 60, speed: 9 } }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'PUMP', state: 'BOOST', args: { duration: 60 } }), RangeError);
});

test('LIGHT pads 0,0 and allows COLOR', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'LIGHT', state: 'ON' }), U('LIGHT,ON,0,0'));
  assert.strictEqual(buildWriteUrl(H, { target: 'LIGHT', state: 'COLOR' }), U('LIGHT,COLOR,0,0'));
});

test('DMX_SCENE builds token from scene and supports ALL* states', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'DMX_SCENE', scene: 3, state: 'ON' }), U('DMX_SCENE3,ON,0,0'));
  assert.strictEqual(buildWriteUrl(H, { target: 'DMX_SCENE', scene: 1, state: 'ALLAUTO' }), U('DMX_SCENE1,ALLAUTO,0,0'));
  assert.throws(() => buildWriteUrl(H, { target: 'DMX_SCENE', scene: 13, state: 'ON' }), RangeError);
  assert.throws(() => buildWriteUrl(H, { target: 'DMX_SCENE', scene: 0, state: 'ON' }), RangeError);
});

test('PVSURPLUS is 2 or 3 fields; speed clamped to 1..3', () => {
  assert.strictEqual(buildWriteUrl(H, { target: 'PVSURPLUS', state: 'ON', args: { speed: 2 } }), U('PVSURPLUS,ON,2'));
  assert.strictEqual(buildWriteUrl(H, { target: 'PVSURPLUS', state: 'OFF' }), U('PVSURPLUS,OFF'));
  assert.throws(() => buildWriteUrl(H, { target: 'PVSURPLUS', state: 'ON', args: { speed: 0 } }), RangeError);
});

test('unknown target throws (SR-04)', () => {
  assert.throws(() => buildWriteUrl(H, { target: 'DOS_1_CL', state: 'ON' }), RangeError);
});

test('no credentials ever appear in the built URL (SR-01)', () => {
  const url = buildWriteUrl(H, { target: 'PUMP', state: 'ON', args: { duration: 60, speed: 1 } });
  assert.ok(!/Basic|:@|password|Authorization/i.test(url));
});

const { parseWriteResponse, basicAuthHeader } = require('../lib/WriteClient');

test('parseWriteResponse reads OK / ERROR from line 1', () => {
  assert.deepStrictEqual(parseWriteResponse('OK\nPUMP\nswitched on\n'), { ok: true, output: 'PUMP', info: ['switched on'] });
  assert.strictEqual(parseWriteResponse('ERROR\nPUMP\nnot allowed').ok, false);
  assert.strictEqual(parseWriteResponse('').ok, false);
  assert.strictEqual(parseWriteResponse('OK\r\nLIGHT').ok, true); // CRLF tolerated
});

test('basicAuthHeader is a base64 Basic token of user:pass', () => {
  assert.strictEqual(basicAuthHeader('user', 'pass'), 'Basic ' + Buffer.from('user:pass').toString('base64'));
});
