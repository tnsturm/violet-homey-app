'use strict';

// Violet app entry point — spec §4. Thin shell; all device logic lives in
// drivers/pool/device.js.

const Homey = require('homey');

class VioletApp extends Homey.App {
  async onInit() {
    this.log('Violet app initialized');
  }
}

module.exports = VioletApp;
