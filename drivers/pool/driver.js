'use strict';

// Pool driver — pairing glue — spec §6
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Owns the custom pairing flow: validates the host against a live getReadings
// call, then hands a single "Pool" device to Homey. All readings/polling live
// in device.js; this file only runs at pair time.
// Device identity + pairing-error i18n: spec 2026-07-13-device-identity-design.md.
// Advisor action cards (get_balance_advice / analyze_fill_water): spec
// 2026-07-28-m8.1-water-balance-advisor-design.md §7.1–§7.2.

const Homey = require('homey');
const { deriveDeviceId } = require('../../lib/deviceIdentity');
const { fetchReadings, normalizeHost } = require('../../lib/VioletClient');

class PoolDriver extends Homey.Driver {
  async onInit() {
    this.log('Pool driver initialized');

    // "Set water chemistry" Flow action (M1 §7): writes the slow LSI inputs into
    // the target device's settings; the next poll recomputes the LSI. This is the
    // seam the M6 LabCOM bridge / automations push values through.
    this.homey.flow.getActionCard('set_water_chemistry').registerRunListener(async (args) => {
      await args.device.setSettings({
        chem_calcium_hardness: args.calcium,
        chem_total_alkalinity: args.alkalinity,
        chem_cya: args.cya,
      });
      await args.device._tick().catch(args.device.error);
      return true;
    });

    // M8.1 advisor Flow actions (spec §7.1/§7.2). Returning the token object is
    // how SDK3 resolves an action card's tokens. Both device methods are total —
    // missing/stale input yields explanatory text, never a rejected Flow (§9).
    this.homey.flow.getActionCard('get_balance_advice').registerRunListener(async (args) => args.device._balanceAdvice());
    this.homey.flow.getActionCard('analyze_fill_water').registerRunListener(async (args) => args.device._fillWaterAdvice());

    // M3 write-control Flow actions (spec §7). Each delegates to device._control,
    // which enforces the interlock + registry validation + sanitized errors.
    // null-Guard wie _pumpSpeedArg in device.js (review N3/Q5): ein ungesetztes
    // Flow-Arg darf nie zu Number(null)=0 = "Stufe 0 erzwingen" werden.
    const speedArg = (/** @type {*} */ v) => (v === undefined || v === null || v === 'default' ? undefined : Number(v));

    this.homey.flow.getActionCard('pump_set_mode').registerRunListener(async (args) => {
      await args.device._control({ target: 'PUMP', state: String(args.mode).toUpperCase(), args: { duration: Math.round((args.duration_min ?? 0) * 60), speed: speedArg(args.speed) } }, 'pump_set_mode');
      return true;
    });
    this.homey.flow.getActionCard('light_set_mode').registerRunListener(async (args) => {
      await args.device._control({ target: 'LIGHT', state: String(args.mode).toUpperCase() }, 'light_set_mode');
      return true;
    });
    this.homey.flow.getActionCard('light_all_scenes').registerRunListener(async (args) => {
      await args.device._control({ target: 'DMX_SCENE', scene: 1, state: String(args.mode).toUpperCase() }, 'light_all_scenes');
      return true;
    });
    this.homey.flow.getActionCard('dmx_scene').registerRunListener(async (args) => {
      await args.device._control({ target: 'DMX_SCENE', scene: Number(args.scene), state: String(args.mode).toUpperCase() }, 'dmx_scene');
      return true;
    });
    this.homey.flow.getActionCard('pvsurplus_set').registerRunListener(async (args) => {
      const speed = speedArg(args.speed);
      await args.device._control(String(args.state) === 'on'
        ? { target: 'PVSURPLUS', state: 'ON', args: { speed } }
        : { target: 'PVSURPLUS', state: 'OFF' }, 'pvsurplus_set');
      return true;
    });
  }

  // async to match the SDK's declared onPair signature (checkJs TS2416, M4.5 eval doc
  // §3) — typing strictness, not a runtime bug: handler registration stays synchronous
  // and Homey awaits the returned promise either way.
  /** @param {*} session Homey pairing session. */
  async onPair(session) {
    /** @type {?{id: string, host: string, writeUsername: string, writePassword: string}} */
    let pairData = null;

    session.setHandler('connect', async (/** @type {{host?: string, username?: string, password?: string}} */ { host, username, password }) => {
      const cleanHost = normalizeHost(host);
      if (!cleanHost) throw new Error(this.homey.__('pair.error.host_required'));
      // Pairing completes only on a valid live response (spec §6). Raw
      // fetch/JSON/abort internals are useless in the pairing dialog (review
      // N10): log the detail, surface one actionable localized message.
      let raw;
      try {
        raw = await fetchReadings(cleanHost, { timeoutMs: 10000 });
      } catch (err) {
        this.error('pairing connect failed:', err instanceof Error ? err.message : String(err));
        throw new Error(this.homey.__('pair.error.unreachable'));
      }
      // data.id = controller serial (HW_SERIAL_CARRIER): stable per unit, so Homey
      // itself blocks adding the same controller twice. Fail-closed when missing —
      // never fall back to a random/weak id (device-identity spec §Decision,
      // §Missing/invalid serial). Existing devices keep their frozen UUIDs.
      const id = deriveDeviceId(raw);
      if (!id) throw new Error(this.homey.__('pair.error.no_serial'));
      pairData = {
        id,
        host: cleanHost,
        writeUsername: String(username || '').trim(),
        writePassword: String(password || ''),
      };
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!pairData) return [];
      return [
        {
          name: 'Pool',
          data: { id: pairData.id },
          // Initial settings use the M0 defaults (spec §12; poll 60s lowered in
          // M0 — notes/2026-06-26-m1-inputs.md §3).
          settings: {
            host: pairData.host,
            writeUsername: pairData.writeUsername,
            pollIntervalSeconds: 60,
            pumpWarmupSeconds: 120,
            waterTempChannel: 'auto',
            group_chlorine: 'auto',
          },
          // Write password → device store: hidden from the settings UI, but NOT
          // encrypted at rest — Homey documents no such guarantee (spec §6, §13,
          // corrected 2026-07-13). Never plain settings.
          store: { writePassword: pairData.writePassword },
        },
      ];
    });
  }

  // Repair flow (review 2026-08-28 N5): the ONLY way to set/rotate the write
  // password after pairing — it lives in the device store (SR-01/02), which the
  // settings UI must never expose. The host may be updated too (controller
  // moved IP); the serial check prevents silently rebinding the device to a
  // DIFFERENT controller (all Flows would act on the wrong pool).
  /** @param {*} session Homey repair session. @param {*} device The device being repaired. */
  async onRepair(session, device) {
    session.setHandler('connect', async (/** @type {{host?: string, username?: string, password?: string}} */ { host, username, password }) => {
      const cleanHost = normalizeHost(host) || device.getSetting('host');
      let raw;
      try {
        raw = await fetchReadings(cleanHost, { timeoutMs: 10000 });
      } catch (err) {
        this.error('repair connect failed:', err instanceof Error ? err.message : String(err));
        throw new Error(this.homey.__('pair.error.unreachable'));
      }
      const id = deriveDeviceId(raw);
      if (!id) throw new Error(this.homey.__('pair.error.no_serial'));
      if (id !== device.getData().id) throw new Error(this.homey.__('pair.error.wrong_device'));
      // Empty fields KEEP the stored values (diff review 2026-08-29): the view
      // labels them "(optional)" and the common repair reason is an IP change —
      // silently wiping the write password would break every control Flow.
      const newPassword = String(password || '');
      if (newPassword) await device.setStoreValue('writePassword', newPassword);
      const newUsername = String(username || '').trim();
      const patch = /** @type {Object<string, *>} */ ({ host: cleanHost });
      if (newUsername) patch.writeUsername = newUsername;
      await device.setSettings(patch);
      return true;
    });
  }
}

module.exports = PoolDriver;
