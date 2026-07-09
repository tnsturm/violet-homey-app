'use strict';

// Shared by release-gate.js (blocks install/publish) and changelog-lang-guard.js
// (blocks the edit itself) so the "complete en+de entry" rule lives in one place.
function isChangelogEntryComplete(entry) {
  const has = (lang) => Boolean(entry && typeof entry[lang] === 'string' && entry[lang].trim());
  return has('en') && has('de');
}

module.exports = { isChangelogEntryComplete };
