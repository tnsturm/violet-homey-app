'use strict';

const Homey = require('homey');

class VioletApp extends Homey.App {
  async onInit() {
    this.log('Violet app initialized');
  }
}

module.exports = VioletApp;
