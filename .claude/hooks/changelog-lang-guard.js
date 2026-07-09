'use strict';

// PostToolUse hook (matcher: Edit|Write) — after editing .homeychangelog.json, block
// (exit 2) if the entry for the CURRENT .homeycompose/app.json version is missing an en
// or de half. release-gate.js already enforces this at `homey app install/publish` time;
// this hook shifts the same check left to the edit itself, so a forgotten language
// surfaces immediately instead of at release time. Shares the completeness check via
// lib/changelog.js to avoid duplicating release-gate's logic.
//
// Recommended by /claude-automation-recommender during the VioletApp →M5 checkpoint;
// implemented directly per the new milestone-checkpoint step 2.

const fs = require('fs');
const path = require('path');
const { logHook } = require('./lib/log');
const { isChangelogEntryComplete } = require('./lib/changelog');

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(payload); } catch { process.exit(0); }

  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  const p = String(filePath).replace(/\\/g, '/');
  if (!/(?:^|\/)\.homeychangelog\.json$/.test(p)) process.exit(0);

  const cwd = input.cwd || process.cwd();

  let version;
  try {
    version = JSON.parse(fs.readFileSync(path.join(cwd, '.homeycompose', 'app.json'), 'utf8')).version;
  } catch { process.exit(0); } // no compose manifest -> not a Homey compose repo, not ours to gate
  if (!version) process.exit(0);

  const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  let changelog;
  try { changelog = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { process.exit(0); } // json-guard's job, not ours

  const entry = changelog[version];
  if (entry === undefined || isChangelogEntryComplete(entry)) {
    logHook('changelog-lang-guard', 'pass', cwd);
    process.exit(0);
  }

  logHook('changelog-lang-guard', 'block', cwd);
  console.error(
    `changelog-lang-guard: .homeychangelog.json entry for ${version} is missing an en or de `
    + 'text. Fill both languages now (HOMEY.md release checklist step 3) — release-gate.js '
    + 'would block this at homey app install/publish anyway; this just catches it right after the edit.'
  );
  process.exit(2);
});
