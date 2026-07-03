'use strict';

// Violet HTTP write client (pure builder/parser + one authenticated fetch) —
// M3 spec §4 (docs/superpowers/specs/2026-07-02-violet-homey-app-m3-write-control-design.md).
// Mirrors VioletClient's read path but adds BasicAuth. Credentials are NEVER put
// in the URL (SR-01) and NEVER logged (SR-02); every command is validated against
// WRITE_TARGETS before it can leave Homey (SR-04/05/06).

// SR-04/05/06: single source of truth for the write allowlist + safe ranges.
// argSpecs are positional; a trailing `optional` arg may be omitted (shorter URL).
const WRITE_TARGETS = {
  PUMP: {
    token: 'PUMP',
    states: ['AUTO', 'ON', 'OFF'],
    argSpecs: [
      { name: 'duration', kind: 'seconds', min: 0, max: 86400, default: 0 },
      { name: 'speed', kind: 'enum', set: [0, 1, 2, 3], optional: true },
    ],
  },
  LIGHT: {
    token: 'LIGHT',
    states: ['AUTO', 'ON', 'OFF', 'COLOR'],
    argSpecs: [ { kind: 'fixed', value: '0' }, { kind: 'fixed', value: '0' } ],
  },
  DMX_SCENE: {
    sceneRange: [1, 12],
    states: ['ON', 'AUTO', 'OFF', 'ALLON', 'ALLAUTO', 'ALLOFF'],
    argSpecs: [ { kind: 'fixed', value: '0' }, { kind: 'fixed', value: '0' } ],
  },
  PVSURPLUS: {
    token: 'PVSURPLUS',
    states: ['ON', 'OFF'],
    argSpecs: [ { name: 'speed', kind: 'enum', set: [1, 2, 3], optional: true } ],
  },
};

// Validate + encode one positional arg to its string form, or null to omit it.
function encodeArg(spec, value) {
  if (spec.kind === 'fixed') return spec.value;
  if (value === undefined || value === null) {
    if (spec.optional) return null;
    if (spec.default !== undefined) return String(spec.default);
    throw new RangeError(`Missing required arg ${spec.name}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RangeError(`Non-finite ${spec.name}: ${value}`);
  if (spec.kind === 'seconds') {
    if (n < spec.min || n > spec.max) throw new RangeError(`${spec.name} out of range [${spec.min},${spec.max}]: ${n}`);
    return String(Math.trunc(n));
  }
  if (spec.kind === 'enum') {
    if (!spec.set.includes(n)) throw new RangeError(`${spec.name} not in {${spec.set.join(',')}}: ${n}`);
    return String(n);
  }
  throw new RangeError(`Unknown arg kind ${spec.kind}`);
}

/**
 * Build the credential-free write URL for a validated command (spec §4; SR-01/04/05/06).
 * @param {string} host Hostname or IP of the paired Violet controller.
 * @param {{target:string, scene?:number, state:string, args?:object}} cmd Command;
 *   `args` keyed by arg name (`duration`, `speed`).
 * @returns {string} `http://<host>/setFunctionManually?TOKEN,STATE[,V1[,V2]]`.
 * @throws {RangeError} on unknown target, invalid scene/state, or out-of-range/non-finite arg.
 */
function buildWriteUrl(host, { target, scene, state, args = {} } = {}) {
  const spec = WRITE_TARGETS[target];
  if (!spec) throw new RangeError(`Unknown write target: ${target}`);
  let token;
  if (spec.sceneRange) {
    const n = Number(scene);
    if (!Number.isInteger(n) || n < spec.sceneRange[0] || n > spec.sceneRange[1]) {
      throw new RangeError(`Scene out of range: ${scene}`);
    }
    token = `DMX_SCENE${n}`;
  } else {
    token = spec.token;
  }
  if (!spec.states.includes(state)) throw new RangeError(`Invalid state ${state} for ${target}`);
  const parts = [token, state];
  let omitted = false;
  for (const argSpec of spec.argSpecs) {
    const encoded = encodeArg(argSpec, argSpec.name ? args[argSpec.name] : undefined);
    if (encoded === null) { omitted = true; continue; }
    if (omitted) throw new RangeError('Cannot provide an arg after an omitted trailing arg');
    parts.push(encoded);
  }
  return `http://${host}/setFunctionManually?${parts.join(',')}`;
}

module.exports = { WRITE_TARGETS, buildWriteUrl };
