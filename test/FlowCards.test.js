'use strict';

// Device-trigger card structure tests — M6.1 live-debugging finding 2026-07-17.
// A card used via getDeviceTriggerCard MUST define a `device` arg with a
// driver filter (SDK: apps.developer.homey.app/the-basics/flow, "Flow Device
// Trigger cards" + /arguments): without it the card mounts app-wide in the
// Flow editor and `.trigger(device, ...)` can never match a flow — the flow
// silently never runs even though the trigger call succeeds.
// alarm_received (M6.1) is asserted hard; the five M1/M2 cards share the
// defect in the shipped store version and are frozen as todo-tests per the
// known-defect protocol (CLAUDE.md §4) — fixing them is a main-branch task
// (existing store flows must be migrated deliberately, not as a side effect).

const { test } = require('node:test');
const assert = require('node:assert');

const app = require('../app.json');

/** @param {string} id @returns {*} */
function triggerCard(id) {
  const card = (app.flow.triggers || []).find((/** @type {*} */ t) => t.id === id);
  assert.ok(card, `trigger card ${id} exists in app.json`);
  return card;
}

/** @param {*} card */
function assertDeviceArg(card) {
  const dev = (card.args || []).find((/** @type {*} */ a) => a.type === 'device');
  assert.ok(dev, `${card.id}: has an args entry of type "device"`);
  assert.strictEqual(dev.name, 'device', `${card.id}: device arg is named "device"`);
  assert.strictEqual(dev.filter, 'driver_id=pool', `${card.id}: device arg filters on the pool driver`);
}

test('alarm_received defines the device arg getDeviceTriggerCard requires', () => {
  assertDeviceArg(triggerCard('alarm_received'));
});

for (const id of ['lsi_warning', 'dosing_blocked', 'dosing_low', 'overflow_dryrun', 'overflow_overfill', 'backwash_valve_fault']) {
  test(`${id} defines the device arg getDeviceTriggerCard requires`, { todo: true }, () => {
    assertDeviceArg(triggerCard(id));
  });
}
