'use strict';

// Pool driver — pairing glue — spec §6
// (docs/superpowers/specs/2026-06-24-violet-homey-app-m0-foundation-design.md).
// Owns the custom pairing flow: validates the host against a live getReadings
// call, then hands a single "Pool" device to Homey. All readings/polling live
// in device.js; this file only runs at pair time.

const Homey = require('homey');
const crypto = require('node:crypto');
const { fetchReadings } = require('../../lib/VioletClient');

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

    // M3 write-control Flow actions (spec §7). Each delegates to device._control,
    // which enforces the interlock + registry validation + sanitized errors.
    const speedArg = (v) => (v === undefined || v === 'default' ? undefined : Number(v));

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
  async onPair(session) {
    let pairData = null;

    session.setHandler('connect', async ({ host, username, password }) => {
      const cleanHost = String(host || '').trim();
      if (!cleanHost) throw new Error('Host is required');
      // Pairing completes only on a valid live response: this throws on any
      // fetch/parse failure, surfacing a clear error to the pairing view (spec §6).
      await fetchReadings(cleanHost, { timeoutMs: 10000 });
      pairData = {
        // Generate the device id once, here; it must stay immutable — Homey keys
        // Flows/Insights off data.id (spec §6).
        id: crypto.randomUUID(),
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
          // Write password → encrypted store, never plain settings (spec §6, §13).
          store: { writePassword: pairData.writePassword },
        },
      ];
    });
  }
}

module.exports = PoolDriver;
