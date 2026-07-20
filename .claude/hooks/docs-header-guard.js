'use strict';

// PostToolUse hook (matcher: Edit|Write) — after editing a lib/ or drivers/ source
// file, verify it still carries the file header the documenting-code skill requires:
// 'use strict'; followed by a short // comment block that references the governing
// spec/notes/threat-model doc (docs/superpowers/...). Mechanically enforces only the
// header rule — the skill's other two building blocks (decision-point comments,
// JSDoc on pure /lib exports) require judgment (what's "non-obvious", what's "glue"
// vs "pure") that a regex can't safely apply retroactively without flagging the
// existing codebase's pre-M6.1 gaps as new violations. Pattern mirrors json-guard.js
// (fail-open on our own errors, exit 2 surfaces the fix to the model).

const fs = require('fs');
const path = require('path');
const { logHook } = require('./lib/log');

function isGuardedSource(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  if (!/\.js$/.test(p)) return false;
  if (/(?:^|\/)(node_modules|\.git|scratchpad|\.claude\/worktrees)\//.test(p)) return false;
  return /(?:^|\/)(lib|drivers)\//.test(p);
}

// Reference grammar from .claude/skills/documenting-code/SKILL.md: `spec §N`,
// `notes/<date>-<topic>.md §N`, `plan task N`, or any docs/superpowers/ path.
const SPEC_REF = /spec §\d|docs\/superpowers\/|notes\/\d{4}-\d{2}-\d{2}|plan task \d/;

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(payload); } catch { process.exit(0); }

  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  if (!isGuardedSource(filePath)) process.exit(0);

  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(input.cwd || process.cwd(), filePath);
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { process.exit(0); }

  const lines = text.split('\n');
  const firstLine = (lines[0] || '').trim();
  if (firstLine !== "'use strict';") {
    logHook('docs-header-guard', 'block', input.cwd);
    console.error(
      `docs-header-guard: ${path.basename(abs)} must start with 'use strict'; followed by a `
      + `file header (documenting-code skill). See .claude/skills/documenting-code/SKILL.md.`
    );
    process.exit(2);
  }

  const headerWindow = lines.slice(1, 12).join('\n');
  if (!SPEC_REF.test(headerWindow)) {
    logHook('docs-header-guard', 'block', input.cwd);
    console.error(
      `docs-header-guard: ${path.basename(abs)} is missing the spec-referenced file header `
      + `(documenting-code skill) — a // comment block after 'use strict'; naming the `
      + `governing spec section, e.g. "spec §7 (docs/superpowers/specs/<file>.md)". `
      + `Add it, or reference notes/<date>-<topic>.md §N / plan task N if that fits better.`
    );
    process.exit(2);
  }

  logHook('docs-header-guard', 'pass', input.cwd);
  process.exit(0);
});
