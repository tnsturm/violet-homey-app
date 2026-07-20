'use strict';

// PostToolUse hook (matcher: Edit|Write) — after editing a text source/doc file, block
// (exit 2) if it now contains raw control bytes (anything below 0x20 except tab/LF/CR,
// or 0x7F). Workflow retro (2026-07-20, M7.0 checkpoint): twice during M6.1 a literal
// `\u`-escape the model intended as source TEXT (e.g. in a comment or JS string) came
// out as a raw control byte instead — caught by hand each time and fixed via a Node
// script rather than the editor tool. This mechanizes that catch at edit time. Pattern
// mirrors json-guard.js (fail-open on our own errors).

const fs = require('fs');
const path = require('path');
const { logHook } = require('./lib/log');

const GUARDED_EXT = /\.(js|json|md|html|txt)$/;

function isGuardedText(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  if (!GUARDED_EXT.test(p)) return false;
  if (/(?:^|\/)(node_modules|\.git|scratchpad)\//.test(p)) return false;
  if (/(?:^|\/)hook-log\.jsonl$/.test(p)) return false;
  return true;
}

// Control bytes that are never legitimate in these file types: C0 controls minus
// tab (0x09) / LF (0x0A) / CR (0x0D), plus DEL (0x7F).
// eslint-disable-next-line no-control-regex
const CONTROL_BYTE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(payload); } catch { process.exit(0); }

  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  if (!isGuardedText(filePath)) process.exit(0);

  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(input.cwd || process.cwd(), filePath);
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { process.exit(0); }

  const match = CONTROL_BYTE.exec(text);
  if (!match) {
    logHook('control-bytes-guard', 'pass', input.cwd);
    process.exit(0);
  }

  const upToMatch = text.slice(0, match.index);
  const line = upToMatch.split('\n').length;
  const code = `0x${match[0].charCodeAt(0).toString(16).padStart(2, '0')}`;

  logHook('control-bytes-guard', 'block', input.cwd);
  console.error(
    `control-bytes-guard: ${path.basename(abs)}:${line} contains a raw control byte (${code}) — `
    + 'likely a literal \\u-escape that was written as a real control character instead of text '
    + '(seen twice during M6.1). Rebuild the affected text via a node -e script with '
    + 'fs.writeFileSync (never hand-type/edit the escape), then re-check.'
  );
  process.exit(2);
});
