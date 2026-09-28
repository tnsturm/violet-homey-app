# CLAUDE.md · skill-agentic-loop-framework-V2 · since fable-5.1 · last ablation: 2026-09

## Project
Violet pool-controller app for Homey Pro (Homey Apps SDK v3, plain Node). Platform conventions: @HOMEY.md.
Commands: `npm test` · `npm run typecheck` · `npx homey app validate --level publish`
Layout: pure logic in lib/ (unit-tested, total functions: bad input ⇒ null, never throw) · device I/O in drivers/pool/ · recorded controller responses in test/fixtures/.

## Done means
- test, typecheck and validate are green — the command AND its output are in the transcript
- a bug fix starts with the failing test that reproduces it
- `/ship` returned 0 confirmed findings, or the human triaged what it returned
- the final message ends with two lines: what was verified / what was assumed

## Workflow
- One worktree per session; never a checkout another session may be using.
- Substantive change → `/ship <task>`. The human triages confirmed findings and decides push and merge.
- New attack surface (write path, network listener, credentials) → a short threat note in docs/superpowers/security/ before implementing.
- The nightly cloud routine writes docs/dashboard/triage-inbox.md on main; a new milestone session reads it first.
- Fix the process, not the instance: a repeated mistake becomes a test, a line in the adversary's search space, or one line here — in that order. A new hook only for a must-never.

## Must never (the first two are hook-enforced by the plugin — never weaken a hook to get past it)
- A controller credential in a tracked file or a log line. Credentials live in the device store only.
- A dependency without a registry existence proof; agent installs use --ignore-scripts. Runtime dependencies stay `{}`.
- `homey app publish`, `homey app install` or `git push` without an explicit human yes.
- A third-party skill, hook, agent or MCP server adopted without reading its source.

## Output contracts
- Version 0.X.Y (X = milestone, Y = build). Every install/publish runs through `/homey-release`: bump, changelog en+de (the user approves the store notes first), one line in docs/dashboard/versions.md.
- Manifest/changelog JSON is generated with node + JSON.stringify, never hand-typed (smart quotes pass validate); an existing manifest gets a targeted edit plus a JSON.parse check, never a re-serialisation.
- Store readme (README.txt / README.de.txt): 1–2 paragraphs, no URLs.

## Environment facts — verified, not assumed
- Windows host, CRLF checkout, PowerShell primary. Multi-line file content goes through the Write tool; commit messages through `git commit -F <file>`; `$`-anchored greps count silently zero on CRLF.
- Tests run under Node, the runtime that ships to the Homey Pro — never Bun. A fresh worktree needs `npm ci` first.
- Tiers: implement = Opus · adversary and disprover = Fable · mechanics = Sonnet. Never save on the checker.
