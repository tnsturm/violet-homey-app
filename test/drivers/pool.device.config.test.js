'use strict';

// M5.7 device wiring tests: config lifecycle (fetch policy, marker compare,
// store persistence), cover reconcile break, onewire labels (spec §4, §5, §6).
// Load order matters: install mocks/stubs BEFORE requiring device.js.

const { test } = require('node:test');
const assert = require('node:assert');

const { installHomeyMock } = require('../mocks/homey');
installHomeyMock();

const VioletClient = require('../../lib/VioletClient');
/** @type {*} */
let currentFixture = null;
VioletClient.fetchReadings = async () => currentFixture;

const ConfigSource = require('../../lib/ConfigSource');
/** @type {?import('../../lib/ConfigSource').ConfigFacts} */
let configResult = null;
let configError = /** @type {?Error} */ (null);
let configCalls = 0;
ConfigSource.fetchConfigFacts = async () => {
  configCalls += 1;
  if (configError) throw configError;
  if (!configResult) throw new Error('no config in test');
  return configResult;
};

const PoolDevice = require('../../drivers/pool/device.js');

const fs = require('node:fs');
const path = require('node:path');
const referenceConfig = ConfigSource.parseConfigFacts(JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/getconfig-reference.json'), 'utf8'),
));

const DEFAULT_SETTINGS = {
  host: 'violet.test',
  pollIntervalSeconds: 60,
  pumpWarmupSeconds: 120,
  dosing_low_threshold_days: 7,
  lsi_enabled: false,
  control_enabled: false,
  show_advanced_diagnostics: false,
};

/** @param {Object<string, *>} rawExtra @param {Object<string, *>} [settings] @param {Object<string, *>} [store] */
async function makeDevice(rawExtra, settings = {}, store = {}) {
  currentFixture = { onewire1_state: 'OK', onewire1_value: '24.1', CONFIGCHANGEMARKER: 148, ...rawExtra };
  configCalls = 0;
  configError = null;
  const device = /** @type {*} */ (new PoolDevice());
  device.__test.settings = { ...DEFAULT_SETTINGS, ...settings };
  device.__test.store = { ...store };
  await device.onInit();
  await new Promise((resolve) => setImmediate(resolve));
  return device;
}

test('config wird beim ersten Tick geholt und im Store persistiert (Spec §4.1)', async () => {
  configResult = referenceConfig;
  const device = await makeDevice({ COVER_STATE: 'OPEN' });
  assert.ok(configCalls >= 1);
  assert.deepStrictEqual(device.__test.store.configFacts, referenceConfig);
  assert.strictEqual(device.__test.store.configMarker, 148);
});

test('Cover-False-Positive: Geister-COVER_STATE erzeugt keinen cover_state-Tile (Spec §6)', async () => {
  configResult = referenceConfig; // coverControlUse=false
  const device = await makeDevice({ COVER_STATE: 'OPEN' });
  await device._tick();
  assert.ok(!device.getCapabilities().includes('cover_state'), 'ghost cover tile must not exist');
});

test('Migration Bestandsgerät: vorhandener cover_state wird nach Config-Read entfernt (Spec §6)', async () => {
  configResult = referenceConfig;
  const device = await makeDevice({ COVER_STATE: 'OPEN' });
  device.__test.capabilities.push('cover_state'); // Altzustand simulieren
  await device._tick();
  assert.ok(!device.getCapabilities().includes('cover_state'));
});

test('force-Override hält cover trotz negativer Config (SR-15)', async () => {
  configResult = referenceConfig;
  const device = await makeDevice({ COVER_STATE: 'OPEN' }, { group_cover: 'force' });
  await device._tick();
  assert.ok(device.getCapabilities().includes('cover_state'));
});

test('Retry-Politik: nach 3 Fehlversuchen nur noch bei Marker-Änderung (Spec §4.3)', async () => {
  configResult = null; // fetch wirft
  const device = await makeDevice({});
  configError = new Error('down');
  await device._tick(); // attempt 2
  await device._tick(); // attempt 3
  const after3 = configCalls;
  await device._tick(); // kein Versuch mehr
  assert.strictEqual(configCalls, after3);
  currentFixture = { ...currentFixture, CONFIGCHANGEMARKER: 149 }; // Marker ändert sich
  await device._tick();
  assert.strictEqual(configCalls, after3 + 1);
});

test('Marker-Änderung refresht Facts im selben Tick (Spec §4.2)', async () => {
  configResult = referenceConfig;
  const device = await makeDevice({ COVER_STATE: 'OPEN' });
  await device._tick();
  assert.ok(!device.getCapabilities().includes('cover_state'));
  // Config ändert sich: Cover jetzt aktiv + Marker inkrementiert
  configResult = { ...referenceConfig, coverControlUse: true, extension1Use: true };
  currentFixture = { ...currentFixture, CONFIGCHANGEMARKER: 149 };
  await device._tick();
  assert.ok(device.getCapabilities().includes('cover_state'), 'cover appears after config change');
  assert.strictEqual(device.__test.store.configMarker, 149);
});

test('Store-Facts überleben Restart; unveränderter Marker → kein Re-Fetch (Spec §4.1)', async () => {
  configResult = referenceConfig;
  const device = await makeDevice({ COVER_STATE: 'OPEN' }, {}, { configFacts: referenceConfig, configMarker: 148 });
  await device._tick();
  assert.strictEqual(configCalls, 0, 'facts from store, marker unchanged → no fetch');
  assert.ok(!device.getCapabilities().includes('cover_state'), 'stored facts drive detection');
});

test('Leere Facts (nur {date,time}) überschreiben gute Facts/Marker nicht (SR-13, T-M57-T1)', async () => {
  configResult = referenceConfig;
  const device = await makeDevice(
    { COVER_STATE: 'OPEN' },
    {},
    { configFacts: referenceConfig, configMarker: 148 },
  );
  const before = configCalls;
  // Nächster Poll: Marker bewegt sich, aber die Antwort trägt kein whitelisted
  // Signal (leeres {date,time}-Envelope) — muss wie ein Fetch-Fehler behandelt werden.
  configResult = ConfigSource.parseConfigFacts({});
  currentFixture = { ...currentFixture, CONFIGCHANGEMARKER: 149 };
  await device._tick();
  assert.strictEqual(configCalls, before + 1, 'attempt was made');
  assert.deepStrictEqual(device.__test.store.configFacts, referenceConfig, 'old facts kept');
  assert.strictEqual(device.__test.store.configMarker, 148, 'old marker kept');
  assert.ok(!device.getCapabilities().includes('cover_state'), 'detection still uses old (good) facts');

  // Ein späterer guter Fetch funktioniert weiterhin.
  configResult = { ...referenceConfig, coverControlUse: true, extension1Use: true };
  currentFixture = { ...currentFixture, CONFIGCHANGEMARKER: 150 };
  await device._tick();
  assert.strictEqual(device.__test.store.configMarker, 150);
  assert.ok(device.getCapabilities().includes('cover_state'), 'later good fetch applies');
});

test('Config-Fehler machen das Gerät nie unavailable (SR-16)', async () => {
  configResult = null;
  const device = await makeDevice({});
  configError = new Error('down');
  await device._tick();
  await device._tick();
  assert.ok(!device._log.available.includes('unavailable'));
});

test('onewire-Sub-Sensor bekommt NAMES_-Label als Titel (Spec §5)', async () => {
  configResult = referenceConfig; // onewireNames['1'] = 'Schwimmbad'
  const device = await makeDevice({});
  await device._tick();
  const titled = device._log.setOptions.filter((/** @type {*} */ o) => o.cap === 'measure_temperature.ow1');
  assert.ok(titled.some((/** @type {*} */ o) => o.options.title && o.options.title.en === 'Schwimmbad'),
    `expected Schwimmbad title, got ${JSON.stringify(titled)}`);
});

test('ohne Facts bleibt der Sensor-Fallback-Titel (Spec §5)', async () => {
  configResult = null;
  const device = await makeDevice({});
  configError = new Error('down');
  await device._tick();
  const titled = device._log.setOptions.filter((/** @type {*} */ o) => o.cap === 'measure_temperature.ow1');
  assert.ok(titled.every((/** @type {*} */ o) => !o.options.title || o.options.title.en === 'Sensor 1'));
});

test('M5.8 §3: use=1-Eingaenge werden Caps mit Titel/Einheit/Dezimalstellen aus der Config', async () => {
  configResult = referenceConfig;
  const device = await makeDevice({ ADC1_value: 0.48, IMP1_value: 10.2 });
  assert.ok(device.hasCapability('measure_adc.1'));
  assert.ok(device.hasCapability('measure_impulse.1'));
  assert.ok(!device.hasCapability('measure_adc.4'));
  assert.ok(!device.hasCapability('measure_impulse.2'));
  const optCalls = device._log.setOptions.filter((/** @type {*} */ o) => o.cap === 'measure_adc.1');
  const opts = optCalls[optCalls.length - 1].options;
  assert.strictEqual(opts.title.de, 'Filterdruck');
  assert.strictEqual(opts.units, 'Bar');
  assert.strictEqual(opts.decimals, 2);
  const adcVal = device._log.setValue.filter((/** @type {*} */ o) => o.cap === 'measure_adc.1');
  const impVal = device._log.setValue.filter((/** @type {*} */ o) => o.cap === 'measure_impulse.1');
  assert.strictEqual(adcVal[adcVal.length - 1].value, 0.48);
  assert.strictEqual(impVal[impVal.length - 1].value, 10.2);
});

test('M5.8 §3: group_inputs=hide entfernt alle Eingangs-Kacheln', async () => {
  configResult = referenceConfig;
  const device = await makeDevice({ ADC1_value: 0.48 }, { group_inputs: 'hide' });
  assert.ok(!device.getCapabilities().some((/** @type {string} */ c) => c.startsWith('measure_adc.') || c.startsWith('measure_impulse.')));
});

test('M5.8 §3: Fallback-Titel ohne NAMES-Label', async () => {
  const noNames = { ...referenceConfig, adcChannels: referenceConfig.adcChannels.map((/** @type {*} */ c) => ({ ...c, name: '' })) };
  configResult = noNames;
  const device = await makeDevice({ ADC1_value: 0.48 });
  const optCalls = device._log.setOptions.filter((/** @type {*} */ o) => o.cap === 'measure_adc.1');
  const opts = optCalls[optCalls.length - 1].options;
  assert.strictEqual(opts.title.de, 'Analogeingang 1');
});
