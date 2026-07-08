#!/usr/bin/env node
'use strict';

// Read-only live smoke against the REAL installation (M4.7 spec §4 D6/D7,
// docs/superpowers/specs/2026-07-08-m4.7-loop-hardening-verification-net.md):
// compares the Homey pool device's live capability state (read-only CLI,
// `homey api devices get-devices`) with a FRESH getReadings?ALL pulled straight
// from the controller via lib/VioletClient. Deliberately NOT under test/ — it
// needs the physical device + a logged-in CLI, so it must never run inside
// npm test/CI (D6). No writes anywhere: release-readiness point 8 runs this.
// Exit 0 = all PASS; exit 1 = at least one FAIL (unreachable device is a FAIL
// by design — a release check needs the live device, D8).

const { spawnSync } = require('node:child_process');
const { fetchReadings } = require('../lib/VioletClient');
const { detectFeatures } = require('../lib/FeatureDetector');
const { desiredM2Capabilities, buildM2Updates } = require('../lib/FeatureGroups');

const HOST = process.env.VIOLET_HOST || 'violet';
const APP_ID = 'de.neunbft.violet';

let fails = 0;
function check(name, ok, detail) {
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function warn(name, detail) {
  console.log(`WARN ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  // C0: fresh raw readings straight from the controller (credential-free read).
  let raw = null;
  try {
    raw = await fetchReadings(HOST, { timeoutMs: 10000 });
    check('C0 getReadings reachable', true, `${Object.keys(raw).length} fields from ${HOST}`);
  } catch (err) {
    check('C0 getReadings reachable', false, `${HOST}: ${err.message}`);
  }

  // C1: pool device present + available on the Homey (read-only CLI).
  let device = null;
  // --json is required: without it the CLI prints a box-drawing table (verified live).
  const r = spawnSync('homey api devices get-devices --json', { shell: true, encoding: 'utf8', timeout: 60000 });
  try {
    const all = JSON.parse(r.stdout);
    device = Object.values(all).find(
      (d) => typeof d.driverId === 'string' && d.driverId.includes(APP_ID) && d.driverId.endsWith(':pool')
    ) || null;
  } catch {
    // fall through — reported below (CLI missing/not logged in/no JSON)
  }
  check('C1 pool device found + available', Boolean(device && device.available),
    device ? `available=${device.available}` : `no ${APP_ID}:pool device in get-devices output`);

  if (!device || !raw) {
    console.log(`\nlive-smoke: ${fails} FAIL — aborting dependent checks`);
    process.exit(1);
  }

  const caps = device.capabilitiesObj || {};
  const capValue = (id) => (caps[id] ? caps[id].value : undefined);

  // C2: core caps present; detected-group caps only WARN when absent — an
  // override (Hide/Force) is indistinguishable from drift without settings access.
  for (const core of ['measure_ph', 'measure_orp', 'measure_temperature', 'measurements_fresh']) {
    check(`C2 core capability ${core}`, core in caps, core in caps ? undefined : 'missing on device');
  }
  const features = detectFeatures(raw);
  const desired = desiredM2Capabilities({ features, overrides: {}, diagnosticsEnabled: false });
  const missing = desired.filter((c) => !(c in caps));
  if (missing.length) warn('C2 detected-but-absent group caps (override?)', missing.join(', '));
  else check('C2 detected feature groups all present', true, `${desired.length} caps`);

  // C3: plausibility of live values (only when non-null).
  const plaus = [
    ['measure_ph', 4, 10],
    ['measure_orp', -200, 1200],
    ['measure_temperature', 0, 45],
  ];
  for (const [cap, lo, hi] of plaus) {
    const v = capValue(cap);
    if (v === null || v === undefined) { warn(`C3 ${cap}`, 'null (stale-cleared or absent)'); continue; }
    check(`C3 ${cap} plausible`, v >= lo && v <= hi, `${v} in [${lo}, ${hi}]`);
  }

  // C4: controller clock sane. LIVE FINDING (2026-07-08): the Violet reports
  // CURRENT_TIME_UNIX in LOCAL time (measured drift ≈ exactly +2 h = CEST) —
  // harmless for freshness math (device.js only compares controller-internal
  // timestamps, M1 design), but a UTC comparison must tolerate timezone-shaped
  // offsets. Sane = total drift < 26 h AND within 120 s of a quarter-hour
  // multiple (covers all timezones incl. DST; a dead/reset clock still fails).
  const nowUnix = Math.floor(Date.now() / 1000);
  const ctrl = Number(raw.CURRENT_TIME_UNIX);
  const drift = Math.abs(ctrl - nowUnix);
  const offNearQuarter = Math.abs(drift - Math.round(drift / 900) * 900);
  check('C4 controller clock sane (timezone-shaped offset allowed)',
    Number.isFinite(ctrl) && drift < 26 * 3600 && offNearQuarter < 120,
    `controller=${ctrl} local=${nowUnix} drift=${Number.isFinite(ctrl) ? Math.round(drift) : 'n/a'}s (${Number.isFinite(ctrl) ? (drift / 3600).toFixed(2) : '?'}h)`);

  // C5: no hanging alarm_* — device says true while a fresh recompute says false.
  // alarm_water_balance is LSI/settings-derived → out of scope here (spec D7).
  const m2 = buildM2Updates(raw, { dosingChannels: features.dosingChannels, dosingLowThresholdDays: 7 });
  let hanging = 0;
  for (const [id, obj] of Object.entries(caps)) {
    if (!id.startsWith('alarm_') || id === 'alarm_water_balance') continue;
    if (obj.value === true && m2[id] === false) {
      hanging += 1;
      check(`C5 ${id} not hanging`, false, 'device=true but fresh recompute=false');
    }
  }
  if (hanging === 0) check('C5 no hanging alarm_* tiles', true);

  console.log(`\nlive-smoke: ${fails === 0 ? 'PASS' : `${fails} FAIL`}`);
  process.exit(fails === 0 ? 0 : 1);
})();
