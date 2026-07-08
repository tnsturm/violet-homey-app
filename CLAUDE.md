# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 0. Always-On Skills

**These two skill sets are mandatory for this project — apply them by default, not on request.**

- **Superpowers workflow skills** (`superpowers:*`): use them as the standard way of working — `brainstorming` before any creative/feature work, `writing-plans` before multi-step code, `test-driven-development` for features/bugfixes, `systematic-debugging` for bugs, and the code-review/verification skills before completion. When in doubt whether one applies, invoke it (see `using-superpowers`).
- **`/documenting-code`** (this project's own skill): apply whenever you write or modify a source file — add the spec-referenced file header, decision-point comments with §-refs, and JSDoc on pure `/lib` exports.

These override the default "just write the code" behavior; user instructions still take precedence over both.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

Known defects are frozen immediately as `{ todo: true }` tests encoding the CORRECT
expectation — every run lists them without going red; the fixing session removes the flag.

## 5. Security by Design

**Derive security requirements before writing the plan — not after the bug.**

When a milestone adds a new attack surface — write/control paths, network listeners, credential handling, or any untrusted external input — invoke the `security-requirement-extraction` skill during **brainstorming/design** and **writing-plans** to:

- Build a short STRIDE threat model for the new surface (assets, trust boundaries, threats).
- Derive concrete, **testable** security requirements — each traced to a threat, with acceptance criteria.
- Record both in `docs/superpowers/security/<date>-<milestone>-threat-model.md` (the M3 doc is the pattern).

Then carry those requirements into the plan as explicit verification steps (§4) and TDD cases where testable, and re-run `/security-review` on the resulting diff before merge.

Skip only for changes with no new attack surface (pure reads, docs, refactors, UI copy). When in doubt, do the threat model — it is cheap relative to a shipped vulnerability.

## 6. Platform-Specific Conventions

**Check for a `<PLATFORM>.md` at the project root before assuming generic tooling.**

If this repo targets a specific platform or SDK (e.g. Homey, iOS, a cloud provider's CLI), a root-level `<PLATFORM>.md` (e.g. `HOMEY.md`) holds the CLI commands, artifact-sync rules, and release mechanics specific to that platform. This file only covers conventions that hold regardless of platform — defer to the platform file wherever §7–8 say "see the platform file".

## 7. Progress Dashboard Protocol

**For multi-milestone projects, track progress in a self-contained dashboard artifact.**

Use a single-file `dashboard.html` (or equivalent): opens directly in a browser, no server/build step. It shows every milestone's status and, for each unfinished milestone, the full prompt needed to resume it.

**Single source of truth:** one data block near the top (e.g. `window.DASHBOARD_STATUS`). Edit only that block; never touch the renderer beneath it.

**Protocol per milestone session** — when working on milestone `Mx`, maintain its entry in the same run:
1. **At start:** `status: "active"`, `startedAt: "<YYYY-MM-DD>"`, append a `log` entry ("Brainstorming/Design started"), bump the top-level `updatedAt`.
2. **During the run:** tick off `steps[].done` as completed (fixed workflow: **Brainstorming → Spec → Plan → Implementation (TDD/SDD) → Validate + Release**); keep `currentActivity` current (or `null`); append coarse-grained entries to `log`; before every deployable release, bump the version and log it (§8 — see the platform file for the exact command).
3. **At the end:** `status: "done"`, `finishedAt`, `commit: "<short-sha>"`, all `steps[].done = true`, `currentActivity: null`, bump `updatedAt`.
4. **Between milestones:** once a milestone is closed and before starting the next, run the project's `milestone-checkpoint` skill (wraps `/fewer-permission-prompts`, `/claude-automation-recommender`, and a check of this project's third-party skill sources). Track this as its own checkpoint entry in the milestones list (same object shape as a milestone, `id: "→Mx"`), not just prose.

**Fields per milestone:** `id`, `title`, `status` (`done`|`active`|`todo`), `startedAt`/`finishedAt`, `commit`, `summary`, `steps[]` (`{label, done}`), `currentActivity`, `runtime`, `log[]` (`{at, note}`), `prompt` (full resume prompt; `null` once done).

**Rules:**
- Every resume prompt (milestone or checkpoint) ends with `/remote-control <id> — <title>` so the spawned session is reachable from the Claude mobile app.
- Log friction the moment it occurs: append a `log[]` entry prefixed `FRICTION:` to the active milestone (repeated errors, blocked tools, wrong assumptions, rework). The workflow retro in `milestone-checkpoint` reads these entries as its primary signal source — unlogged friction is invisible to it.
- Keep edits surgical — only the data block, only the one milestone's (or checkpoint's) object.
- Commit the file — other sessions and fresh worktrees read it (e.g. via "Start Mx…" chips).
- The progress bar derives automatically from `steps[].done` — don't maintain it by hand.
- View in a browser for the reliable full view (always shows every prompt in full); it can also be re-rendered inline in chat.

**Inline chat rendering:** inline widgets are recreated per session and do NOT auto-load the dashboard file. When rendering it in chat, build it 1:1 from the status data block and include, for every unfinished milestone, its **full** prompt (collapsed under a "show prompt" toggle). Never truncate or omit prompts — that's exactly how they end up feeling "lost".

## 8. Versioning & Release Log

**Every real release gets a version bump and a log entry mapping it to a commit.**

Version scheme `0.X.Y`: **X = milestone number**, **Y = build number within that milestone** (resets to 0 at each new milestone). Major stays `0` until the first public 1.0 release.

Any build that is actually deployed/installed/published — not a throwaway dev run — gets its own version number and a line in a committed version log (e.g. `versions.md`):

| Version | Date | Commit | Target | Milestone | Note |

Per release:
1. Commit the code being deployed.
2. Bump the version (see the platform file, §6, for the exact command — new build within a milestone vs. a new milestone).
3. Write a changelog entry for the new version, in the language(s) the project's users see.
4. Verify any generated/derived manifest is in sync with its source; commit the bump + changelog together.
5. Deploy/publish, then append the log line (version, date, commit, target, note).

An ephemeral dev-run command (one that tears itself down on stop) is not a release and needs no bump/log entry.

## 9. Finishing a Branch

**Before any git action on a finished branch, run `/code-review` — then ask how to proceed.**

Once a branch/worktree's change is complete and a git action (commit/push/merge) is next:

1. Proactively start `/code-review` on the diff against the base branch — don't wait to be asked.
2. Based on the result, ask (don't decide silently):
   - **Trivial change (no Critical Issues):** ask whether to push directly to `origin/main` and pull the local `main` checkout up to date — skipping a PR.
   - **Otherwise:** ask whether to push the branch and open a Pull Request.

Always wait for an explicit yes before pushing or merging — this section only saves re-explaining the two options each time, not the confirmation itself.

## 10. Permission Strategy (3 Layers)

**Hooks always win; the allowlist covers the everyday; Auto Mode is for autonomous loops.**

1. **Hooks = "must NEVER happen"** — deterministic exit-2 guards (PreToolUse). They apply in every permission mode; neither Auto Mode nor `bypassPermissions` can override them.
2. **Project allowlist (`permissions.allow` in `.claude/settings.json`) = "is ALWAYS ok"** — deterministic, documents intent, git-portable (team, worktrees, routines). Curated at every milestone checkpoint via `/fewer-permission-prompts`. Global vs. project split: see "Claude-Code-Settings: Skill = Source of Truth" below.
3. **Auto Mode (`claude --permission-mode auto`) = situational autonomy** for long autonomous runs (`/goal` milestone sessions, nightly routines) — the classifier approves novel actions; hooks and allowlist remain in force underneath. Never use `bypassPermissions` locally.

Everyday sessions run in the default mode with the allowlist; autonomous loop sessions start with `--permission-mode auto`.

## 11. Subagent Model Tiering

**Don't pay flagship prices for mechanical work — and never economize on the checker.**

Subagents inherit the session model by default. Assign tiers explicitly via frontmatter in `.claude/agents/*.md` (`model:` + `effort:`):

- **Mechanical/checklist/extraction agents** (run commands, compare outputs, grep & report — e.g. `release-readiness`): `model: haiku` or `sonnet`, `effort: low`/`medium`.
- **Review/judge/security agents** (e.g. `security-reviewer`): `model: inherit` — feedback quality is the loop bottleneck (§4), and a weak verifier defeats the maker/checker split.
- In multi-agent workflows, set effort per stage: low for finder/collector stages, high only for verify/judge stages.
- Global session-wide override if ever needed: `CLAUDE_CODE_SUBAGENT_MODEL`.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

Based on: https://github.com/multica-ai/andrej-karpathy-skills

---

## Project Extensions

This repo targets the Homey platform — see @HOMEY.md for platform-specific conventions (versioning, CLI, release mechanics).

## Claude-Code-Settings: Skill = Source of Truth

**Globale** Claude-Code-Settings-Änderungen (die auf jedem Rechner gelten sollen — `permissions.allow`-Muster, die überall nützlich sind, globale Hooks, `model`, Notification-Flags, Plugins/Marketplaces) gehören in das private Skill-Repo `skill-ClaudeCode-general-settings` als **Quelle der Wahrheit**, nicht nur in die Live-`~/.claude/settings.json`:

1. Zuerst im Skill-Repo ablegen (`settings-reference.json` bzw. das `general-settings`-Plugin), dann in die Live-`~/.claude/settings.json` **spiegeln** — nie nur die Live-Datei ändern (sonst geht die Änderung beim Rechnerwechsel verloren).
2. **Projekt-/plattformspezifische** Settings (z. B. die Homey-Allowlist `homey api … get-*`, `homey app validate *`, oder die Homey-Hooks wie `compose-guard`/`secrets-guard`) bleiben in der **`.claude/settings.json` dieses Repos** — sie sind dort schon portabel (ein `git clone` bringt sie mit) und gehören nicht in den globalen Skill.

Faustregel: „In jedem Projekt sinnvoll?" → global (Skill). „Nur hier / nur für Homey sinnvoll?" → projekt-lokal (dieses Repo).