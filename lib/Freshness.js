'use strict';

function isFresh({ pumpOn, pumpOnSince, now, warmupSeconds }) {
  if (!pumpOn || pumpOnSince === null || pumpOnSince === undefined) return false;
  return now - pumpOnSince >= warmupSeconds;
}

module.exports = { isFresh };
