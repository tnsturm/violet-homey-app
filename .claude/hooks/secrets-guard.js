'use strict';

// PreToolUse hook (matcher: Edit|Write) — enforces M3 threat-model SR-01/SR-02
// ("Write-Credential nie in Source/Settings"; docs/superpowers/security/
// 2026-06-30-m3-write-control-threat-model.md). Blocks (exit 2) any Edit/Write
// that would put a controller credential into a TRACKED app file: a hardcoded
// `Basic <base64>` Authorization value, a string-literal writePassword/writeUsername
// assignment, or — when configured out-of-band — the exact Violet write password.
//
// Credentials must live ONLY in the device store and be read at runtime (M0 spec
// §6/§13). This file is itself tracked, so it deliberately embeds NO secret: the
// exact password is supplied (optionally) via the VIOLET_WRITE_PASSWORD env var,
// and no error message ever echoes a matched value (SR-02).
//
// Pattern mirrors .claude/hooks/check-version-sync.js (fail-open on our own errors).

const fs = require('fs');
const path = require('path');
const { logHook } = require('./lib/log');

// Files where a credential must never appear: app source + generated/committed
// manifests. Tooling/config/docs/tests/scratchpad are out of scope.
function isGuardedPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  if (!p) return false;
  if (/(?:^|\/)lib\//.test(p)) return true;
  if (/(?:^|\/)drivers\//.test(p)) return true;
  if (/(?:^|\/)\.homeycompose\//.test(p)) return true;
  // Committed *.json (app.json, package.json, .homeychangelog.json, locales/*.json)
  // but not dependency/config/doc/test/scratchpad JSON.
  if (/\.json$/.test(p) && !/(?:^|\/)(node_modules|\.git|\.claude|docs|test|scratchpad)\//.test(p)) {
    return true;
  }
  return false;
}

// Rules that flag a hardcoded credential. Each returns a short rule id (for the
// operator) — NEVER the matched text (SR-02: no secret in logs/errors).
function violation(content, knownSecret) {
  const text = String(content || '');

  // A. Hardcoded HTTP Basic Authorization value (base64 of user:pass).
  if (/\bBasic\s+[A-Za-z0-9+/]{20,}={0,2}/.test(text)) return 'basic-auth-token';

  // B. writePassword / writeUsername assigned a non-empty STRING LITERAL. Legit
  //    code reads these from store/settings (identifier/expression values), e.g.
  //    `writePassword: pairData.writePassword` or `String(password || '')` — those
  //    have no quoted literal and pass. `writePassword: ''` (empty) also passes.
  if (/\bwrite(?:Password|Username)\b\s*[:=]\s*['"`][^'"`]+['"`]/.test(text)) {
    return 'hardcoded-credential-literal';
  }

  // C. The exact Violet write password, if the operator wired it in out-of-band
  //    (env var — kept out of every tracked file). Matches the raw password and
  //    its base64 form (as it would appear inside a Basic token).
  if (knownSecret) {
    if (text.includes(knownSecret)) return 'known-write-password';
    const b64 = Buffer.from(knownSecret, 'utf8').toString('base64');
    if (b64.length >= 8 && text.includes(b64)) return 'known-write-password-b64';
  }

  return null;
}

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0); // can't parse -> fail open, don't block on our own error
  }

  const ti = input.tool_input || {};
  const filePath = ti.file_path || '';
  if (!isGuardedPath(filePath)) process.exit(0);

  // Only the NEW content being introduced: Write.content or Edit.new_string.
  const content = [ti.content, ti.new_string].filter((v) => typeof v === 'string').join('\n');
  if (!content) process.exit(0);

  const knownSecret = (process.env.VIOLET_WRITE_PASSWORD || '').trim() || null;

  const rule = violation(content, knownSecret);
  if (rule) {
    logHook('secrets-guard', 'block', input.cwd);
    const rel = String(filePath).replace(/\\/g, '/').replace(/^.*\/(lib|drivers|\.homeycompose)\//, '$1/');
    console.error(
      `secrets-guard: refusing to write what looks like a hardcoded Violet write `
      + `credential (rule: ${rule}) into ${rel}. Credentials must live ONLY in the `
      + `device store and be read at runtime (M3 threat model SR-01/SR-02). If this `
      + `is a false positive, adjust the value to read from store/settings instead of `
      + `a literal.`
    );
    process.exit(2); // block the Edit/Write
  }

  logHook('secrets-guard', 'pass', input.cwd);
  process.exit(0);
});
