'use strict';

// PostToolUse hook (matcher: Edit|Write) — after editing docs/dashboard/dashboard.html,
// verify the window.DASHBOARD_STATUS data block (script#status-data) still parses as
// valid JS; on failure, surface the error to the model (exit 2) so it is fixed before
// commit.
//
// Born from a recurring failure (2026-07-09 workflow retrospective, milestone-checkpoint
// step 4): the same "smart-quote" class of bug that motivated json-guard.js (2026-07-05)
// hit dashboard.html on 2026-07-08 — its 4th occurrence overall, and the first one
// json-guard could not catch, because the data block is a JS object literal embedded in
// HTML, not a standalone .json file. Only caught by an ad-hoc node-eval-verify step, not
// by any automatic guard. Pattern mirrors json-guard.js (fail-open on our own errors).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { logHook } = require('./lib/log');

function isGuardedDashboard(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  return /(?:^|\/)docs\/dashboard\/dashboard\.html$/.test(p);
}

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(payload); } catch { process.exit(0); }

  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  if (!isGuardedDashboard(filePath)) process.exit(0);

  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(input.cwd || process.cwd(), filePath);
  let html;
  try { html = fs.readFileSync(abs, 'utf8'); } catch { process.exit(0); }

  const match = html.match(/<script id="status-data">([\s\S]*?)<\/script>/);
  if (!match) {
    // Marker missing/renamed — not this guard's job to enforce structure, fail open.
    process.exit(0);
  }

  try {
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(match[1], ctx, { filename: 'dashboard-status-data.js', timeout: 2000 });
    if (!ctx.window || typeof ctx.window.DASHBOARD_STATUS !== 'object' || ctx.window.DASHBOARD_STATUS === null) {
      throw new Error('window.DASHBOARD_STATUS did not evaluate to an object');
    }
    logHook('dashboard-guard', 'pass', input.cwd);
    process.exit(0);
  } catch (err) {
    logHook('dashboard-guard', 'block', input.cwd);
    console.error(
      `dashboard-guard: the window.DASHBOARD_STATUS data block in ${path.basename(abs)} `
      + `no longer parses as valid JS — ${err.message}. Common cause in this repo: an ASCII `
      + `" string delimiter came out as a curly "smart quote" (“ ”) inside a summary/log/prompt `
      + `string. Rebuild the affected string via node + JSON.stringify or check char codes rather `
      + `than hand-typing quotes; keep German inner quotes as „…“. Re-check by re-running `
      + `this edit before committing.`
    );
    process.exit(2); // PostToolUse: surface the error back to the model
  }
});
