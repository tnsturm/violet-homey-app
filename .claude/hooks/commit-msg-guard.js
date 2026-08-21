'use strict';

// PreToolUse hook (matcher: Bash|PowerShell) — blocks a `git commit -m` whose message is being
// built with a heredoc or a PowerShell here-string, because twice the delimiter itself leaked
// into the message (/insights report 2026-08-21: a stray "@" forced two amends, a later stray
// "EOF" needed a force-push to fix, and that force-push was then blocked by the auto-mode
// classifier). The reliable path on this Windows host is writing the message to a file and
// using `git commit -F <file>`.
//
// Deliberately narrow to keep false positives at zero: only a line consisting SOLELY of a
// delimiter counts, plus the heredoc introducers. "eslint@9" or the word EOF inside prose pass
// untouched, and heredocs outside a commit command are none of this hook's business.
// Pattern mirrors check-version-sync.js: fail open on our own errors, exit 2 only on a real
// finding.

const { logHook } = require('./lib/log');

// A line that is nothing but a delimiter: PowerShell here-string openers/terminators
// (@' '@ @" "@) and the bare @ that leaked live, or a heredoc EOF marker. The optional
// trailing quote catches the shape the incident actually had — the leaked delimiter sitting
// right before the closing quote of the -m argument (`... \nEOF"`).
const DELIMITER_LINE = /^(?:@|@'|'@|@"|"@|EOF)["']?$/;
// Heredoc introducers, quoted or not, with or without the dash form.
const HEREDOC_INTRO = /<<-?\s*(['"]?)EOF\1/;
// Does this commit carry an inline message at all? -F / --file / amend-no-edit have nothing
// for us to inspect.
const INLINE_MESSAGE = /\s-{1,2}m\b|\s-m["'@]|\s-am\b|\s--message\b/;

let payload = '';
process.stdin.on('data', (chunk) => { payload += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0); // can't parse -> fail open, don't block on our own error
  }

  const command = (input.tool_input && input.tool_input.command) || '';
  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0); // only care about commits
  }
  if (!INLINE_MESSAGE.test(command)) {
    process.exit(0); // -F / interactive -> the recommended path, nothing to inspect
  }

  const offenders = command.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => DELIMITER_LINE.test(line));
  if (HEREDOC_INTRO.test(command)) offenders.push('<<EOF');

  if (offenders.length === 0) {
    process.exit(0);
  }

  logHook('commit-msg-guard', 'block', input.cwd);
  console.error(
    'commit-msg-guard: this commit message is being built with a heredoc / PowerShell '
    + `here-string (found: ${[...new Set(offenders)].join(', ')}). Twice the delimiter itself `
    + 'leaked into the message on this host. Write the message to a file and commit with:\n'
    + '  git commit -F <file>\n'
    + '(build the file with the Write tool or `node -e`, then delete it afterwards)'
  );
  process.exit(2);
});
