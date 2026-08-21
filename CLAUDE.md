# CLAUDE.md

Project instructions. A rule earns its place here only if it carries information a fresh session doesn't have — a project fact, an incident-derived lesson, or a convention that differs from defaults. Model-default behavior (surgical edits, simplicity, stating assumptions) is deliberately NOT restated. Exception: security fail-closed rules stay non-negotiable bans — their value lies in not being judgment calls.

## 0. Default Skills

**Two skill sets are the default way of working here — applied by judgment, not as ritual.**

- **Superpowers workflow skills** (`superpowers:*`) are the normal path for substantive work: `brainstorming` before feature/design work, `writing-plans` before multi-step changes, `subagent-driven-development` to execute a written plan (`executing-plans` instead when the tasks share toolchain state or one common error list, so fresh-context subagents don't pay off — name which one and why in the plan header), `test-driven-development` for features/bugfixes, `systematic-debugging` for bugs, and `verification-before-completion` before any "done"/"passing" claim (code review itself runs through `/code-review`, §9). Whether a task is substantive is your call — a one-file fix, a doc edit, or a question needs no ritual. When you deliberately skip a process skill on substantive work, say so in one sentence; that traceability replaces the obligation.
- **`/documenting-code`** (this project's own skill): apply to source files with spec-relevant logic — file header, decision-point comments with §-refs, JSDoc on pure `/lib` exports. Pure mechanics (rename, format fix) only need the existing header kept accurate.

User instructions take precedence over both.

## 1. Think Before Coding

If multiple interpretations of a request exist, name them — don't pick one silently. Push back when a simpler approach exists.

During brainstorming, before converging on a design:

- **Hunt unknown unknowns:** bring your own domain knowledge to the table — name risks, constraints, and pitfalls in this territory the user hasn't mentioned, don't only extract what they already know.
- **Architecture changers first:** order clarifying questions by impact — questions whose answers would change the architecture come before detail questions.

## 2. Simplicity First

Minimum code that solves the problem — nothing speculative. Kept as the tie-breaker when in doubt; the rest is model default.

## 3. Surgical Changes

Model default, with one project nuance: unrelated dead code you notice gets mentioned, not deleted.

## 4. Goal-Driven Execution

State verifiable success criteria before multi-step work ("write a test that reproduces it, then make it pass" — never "make it work"); strong criteria let you loop independently. How you format the plan is your call.

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

### Dependency Hygiene (slopsquatting defense)

LLM-hallucinated package names are a supply-chain attack vector (attackers pre-register them). Therefore:

- No new dependency — runtime or dev, **including `npm:` alias targets** — enters a spec/plan without an **existence proof**: a registry lookup or context7 doc hit, recorded in the plan's Tech Stack/Global Constraints.
- Agent-run installs use `--ignore-scripts`.
- The `package-guard` hook (`.claude/hooks/package-guard.js`) enforces registry existence + freshness/adoption at install/manifest time (fail closed). Its override path is a human terminal install — never weaken the hook to get past it.

### Extension Hygiene (third-party skills, agents, hooks, MCP)

A skill is more privileged than a dependency: `` !`cmd` `` dynamic-context blocks in a SKILL.md execute during preprocessing — **before the model sees the skill** — so no amount of model-side judgment can stop them. Skills also arrive without an install step: `.claude/skills/` in a cloned repo loads once the workspace is trusted. Therefore:

- **No external skill, agent, command, hook, or MCP server enters this project or `~/.claude/` without a read of its actual source** — first adoption AND every update. Read the diff, not the README.
- **Review checklist** (block on any hit, ask the user): `` !`…` `` / ```` ```! ```` dynamic-context blocks · `allowed-tools` frontmatter granting Bash/Write/network · outbound network calls (`curl`, `fetch`, webhooks, telemetry) · credential paths (`~/.ssh`, `~/.aws`, `gh auth`, `.env`, keychain) · install/postinstall scripts · obfuscation (base64, `eval`, minified blobs) · bundled hooks that self-register into `settings.json`.
- **`disableSkillShellExecution: true` is the default posture** in `.claude/settings.json` (§10 layer 2). It neutralizes the whole dynamic-context attack class. Turn it off only deliberately, for a named skill that needs it, and record why.
- **Cloning a repo is an adoption decision.** Before working in a foreign checkout, check whether it carries `.claude/skills/`, `.claude/agents/`, or `.claude/hooks/`, and apply the checklist to those files before trusting the workspace.
- Curated indexes (awesome-lists, marketplaces) are **discovery aids, not trust signals** — listing implies no review. The checklist applies unchanged to anything found through them.

The `milestone-checkpoint` skill enforces this at update time (its Schritt 4).

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
4. **Between milestones:** once a milestone is closed and before starting the next, run the project's `milestone-checkpoint` skill (its step 1 is a branch/worktree cleanup — check locally and on origin for no-longer-needed branches and worktrees, show a short explanation per candidate, offer selectable deletion, then delete the selected branches (local + origin) and worktrees (git + disk) — followed by `/fewer-permission-prompts`, a `/doctor` run (user-typed — the command blocks model invocation), `/claude-automation-recommender`, and a check of this project's third-party skill sources). Track this as its own checkpoint entry in the milestones list (same object shape as a milestone, `id: "Mx.0"`, `title: "Housekeeping Agentic Loop"`; the implementation milestone it gates is numbered `Mx.1`), not just prose.

**Fields per milestone:** `id`, `title`, `status` (`done`|`active`|`todo`), `startedAt`/`finishedAt`, `commit`, `summary`, `steps[]` (`{label, done}`), `currentActivity`, `runtime`, `log[]` (`{at, note}`), `prompt` (full resume prompt; `null` once done), `recommendedModel` (`{model, effort, why}` — see §11; set for every open milestone, drop once `status` is `done`).

**Rules:**
- Every new milestone (or checkpoint) entered into the dashboard gets a `recommendedModel` at creation time, not as an afterthought — assign it per §11 before the entry is committed.
- Every resume prompt (milestone or checkpoint) ends with `/remote-control <id> — <title>` so the spawned session is reachable from the Claude mobile app.
- Resume prompts state the **goal and the machine-checkable done condition**, never a step-by-step procedure. For flagship sessions (§11 palette) this is load-bearing, not stylistic: over-prescriptive prompts measurably reduce flagship output quality. Give the full task spec up front and let the session plan its own path.
- Log friction the moment it occurs: append a `log[]` entry prefixed `FRICTION:` to the active milestone (repeated errors, blocked tools, wrong assumptions, rework). The workflow retro in `milestone-checkpoint` reads these entries as its primary signal source — unlogged friction is invisible to it.
- New milestone sessions and the release-readiness subagent read `docs/dashboard/triage-inbox.md`
  FIRST (when present) — surface open findings before starting new work.
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

## 9. Branch Lifecycle

### Starting: one worktree per session

**A milestone or feature session works in its own git worktree — never in a checkout another session may be using.**

Use `superpowers:using-git-worktrees` at session start. Exempt: short read-only or single-file sessions (nightly triage, dashboard edits, a quick doc fix) — they stay in the primary checkout.

Why: two agent sessions sharing one working directory collide in ways git cannot arbitrate. Observed 2026-07-21 — a parallel milestone session edited `HOMEY.md`/`README.txt` mid-session, so `git status` showed foreign changes that had to be reasoned about before every commit, and that session's `git push` swept along a finished-but-unpushed commit from the other session that nobody had decided to ship. Isolation is cheap; untangling a shared tree is not. The `milestone-checkpoint` skill already cleans worktrees up afterwards (§7, its step 1).

Corollary for automations: a routine that writes **only its own ledger file** (e.g. the nightly triage writing `docs/dashboard/triage-inbox.md`) commits it directly on `main` — its findings must be readable on `main`, because every new milestone session reads them first (§7). The moment an automation touches anything beyond that ledger — code, version bumps, shared docs — it needs a branch and a PR.

### Finishing: review, then ask

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

## 11. Model Tiering (Subagents & Milestones)

**Don't pay flagship prices for mechanical work — and never economize on the checker or on high-risk judgment calls.**

**Current palette:** *workhorse* = Claude Sonnet 5, *implementer* = Claude Opus 5, *flagship* = Claude Fable 5. The tier rules below reference these roles, not model names — when the palette changes, edit only this line. Milestone sessions still know only two tiers (workhorse/flagship); the implementer exists as a delegation target inside flagship sessions (see Flagship orchestration below). Within a tier, tune `effort` before switching models; the model switch happens only at the judgment boundary.

### Subagents

Subagents inherit the session model by default. Assign tiers explicitly via frontmatter in `.claude/agents/*.md` (`model:` + `effort:`):

- **Mechanical/checklist/extraction agents** (run commands, compare outputs, grep & report — e.g. `release-readiness`): workhorse, `effort: low`/`medium`.
- **Review/judge/security agents** (e.g. `security-reviewer`): `model: inherit` — feedback quality is the loop bottleneck (§4), and a weak verifier defeats the maker/checker split. In a flagship session the checker inherits the flagship — that is the point, not a cost bug.
- In multi-agent workflows, set effort per stage: low for finder/collector stages, high only for verify/judge stages.
- Global session-wide override if ever needed: `CLAUDE_CODE_SUBAGENT_MODEL`.

### Milestones (main-loop sessions)

Every open milestone in the dashboard (§7) carries a `recommendedModel: { model, effort, why }` — a suggestion for which Claude model/tier and reasoning effort best fits *that milestone's own* main-loop session (distinct from the subagents it spawns internally). Set it when the milestone entry is created (checkpoint or milestone-planning session), and re-derive it if the milestone's scope changes materially.

Judge by the nature of the remaining work, not by project phase or milestone number:
- **Mechanical/checklist work** (checkpoints, scoped reads-milestones with brainstorming/spec already done): workhorse, `effort: low`/`medium`.
- **Open design/brainstorming, external-integration research, or moderate ambiguity**: workhorse, `effort: medium`/`high`.
- **High-stakes judgment calls** (GO/NO-GO decisions against measurable criteria, touching the one untested/production-crash-prone code path, correctness-critical domain logic feeding user-facing decisions, or any milestone with its own threat-model/security-review): flagship, `effort: high`/`xhigh` — judgment quality outweighs speed or cost here (`max` only for single correctness-critical decisions where cost is irrelevant).
- One-line `why` always states *what about this milestone's remaining work* drives the tier — and, with the role-based palette, what drives the effort level within it.

**Security milestones on the flagship:** safety classifiers may refuse benign adversarial work (STRIDE modeling, exploit-shaped test cases, credential-path review). Log each refusal as a `FRICTION:` entry (§7), rephrase toward the defensive intent, and only drop the affected sub-step to the workhorse if it persists — the milestone itself stays on the flagship.

**Autonomous loops default to the workhorse:** scheduled routines and long unattended loops (nightly triage, `/goal` sessions) run on the workhorse unless the loop's core is a judgment call — flagship turns can run many minutes at flagship rates, and both compound unattended. A flagship autonomous loop is a deliberate per-case decision recorded in the milestone's `why`.

This is a recommendation surfaced to whoever starts that milestone session (human or automation deciding which model to launch it with) — not an enforced gate.

### Flagship orchestration

In a flagship milestone session, the main loop acts as **orchestrator** — that is `superpowers:subagent-driven-development` (fresh implementer per task, task review after each, whole-branch review at the end); follow the skill rather than a paraphrase of it, and use `superpowers:dispatching-parallel-agents` for the fan-out when 2+ tasks are genuinely independent. What the flagship tier adds is the **model choice per subagent**: *implementer* (via the Agent tool's `model` parameter or agent frontmatter) for complex or ambiguous implementation work, *workhorse* for mechanical work; review subagents stay `model: inherit`, so they inherit the flagship. **Delegation is the default, not a ban:** trivial edits and short verification commands the orchestrator does itself — for a one-line fix, handing over context costs more flagship tokens than the fix. This pattern applies only to flagship sessions; workhorse sessions implement directly. It lives here as a standing rule, not in resume prompts — those stay goal + done condition (§7).

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

**Framework-Artefakte** (seit M4.9): Jede GENERISCHE Änderung an Gate-/Guard-Hooks,
CLAUDE.md-Protokollregeln, dem Checkpoint-Ablauf oder den Dashboard-/Template-Formaten wird
**in derselben Session** in das Framework-Repo `skill-agentic-loop-framework`
(`plugin/skills/agentic-loop-framework/templates/` bzw. `homey/`) gespiegelt + dessen
CHANGELOG ergänzt. Projekt-spezifisches (z. B. Violet-Live-Smoke, konkrete Allowlist-Einträge)
bleibt hier. Der milestone-checkpoint prüft Drift (Schritt 7a).