'use strict';

const Homey = require('homey');
const crypto = require('node:crypto');
const { fetchReadings } = require('../../lib/VioletClient');

class PoolDriver extends Homey.Driver {
  async onInit() {
    this.log('Pool driver initialized');
  }

  onPair(session) {
    let pairData = null;

    session.setHandler('connect', async ({ host, username, password }) => {
      const cleanHost = String(host || '').trim();
      if (!cleanHost) throw new Error('Host is required');
      await fetchReadings(cleanHost, { timeoutMs: 10000 }); // throws on failure
      pairData = {
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
          data: { id: crypto.randomUUID() },
          settings: {
            host: pairData.host,
            writeUsername: pairData.writeUsername,
            pollIntervalSeconds: 300,
            pumpWarmupSeconds: 120,
            waterTempChannel: 'auto',
            group_chlorine: 'auto',
          },
          store: { writePassword: pairData.writePassword },
        },
      ];
    });
  }
}

module.exports = PoolDriver;
