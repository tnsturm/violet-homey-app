'use strict';

function buildReadingsUrl(host) {
  return `http://${host}/getReadings?ALL`;
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function parseReadings(raw) {
  const tempChannels = [];
  for (let id = 1; id <= 12; id += 1) {
    const state = raw[`onewire${id}_state`];
    const value = num(raw[`onewire${id}_value`]);
    if (state === 'OK' && value !== null) {
      tempChannels.push({ id, value, state });
    }
  }
  return {
    ph: num(raw.pH_value),
    orp: num(raw.orp_value),
    chlorine: raw.pot_value === undefined ? null : num(raw.pot_value),
    pumpOn: Number(raw.PUMP) === 1,
    tempChannels,
    timeUnix: num(raw.CURRENT_TIME_UNIX),
    raw,
  };
}

async function fetchReadings(host, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildReadingsUrl(host), { signal: controller.signal });
    if (!res.ok) throw new Error(`Violet HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { buildReadingsUrl, parseReadings, fetchReadings };
