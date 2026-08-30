# CLAUDE.md

Project instructions. A rule earns its place here only if it carries information a fresh session doesn't have — a project fact, an incident-derived lesson, or a convention that differs from defaults. Model-default behavior (surgical edits, simplicity, stating assumptions) is deliberately NOT restated, and **procedures live in skills, not here**. Exception: security fail-closed rules stay non-negotiable bans — their value lies in not being judgment calls.

## 0. Default Skills

**Two skill sets are the default way of working here — applied by judgment, not as ritual.**
- **Superpowers workflow skills** (`superpowers:*`) are the normal path for substantive work: `brainstorming` before feature/design work, `writing-plans` before multi-step changes, `subagent-driven-development` to execute a written plan (`executing-plans` instead when the tasks share toolchain state or one common error list — name which one and why in the plan header), `test-driven-development` for features/bugfixes, `systematic-debugging` for bugs, `verification-before-completion` before any "done"/"passing" claim (code review runs through `/code-review`, §9). Whether a task is substantive is your call — a one-file fix, a doc edit, or a question needs no ritual. When you deliberately skip a process skill on substantive work, say so in one sentence; that traceability replaces the obligation.
- **`/documenting-code`** (this project's own skill): apply to source files with spec-relevant logic — file header, decision-point comments with §-refs, JSDoc on pure `/lib` exports. Pure mechanics (rename, format fix) only need the existing header kept accurate.
- Dashboard work runs through `dashboard-sync` (§7); between-milestone housekeeping through `milestone-checkpoint`.
- User instructions take precedence over all of them.

## 1. Think Before Coding

If multiple interpretations of a request exist, name them — don't pick one silently. Push back when a simpler approach exists. During brainstorming, before converging on a design: **hunt unknown unknowns** — bring your own domain knowledge, name risks, constraints and pitfalls the user hasn't mentioned, don't only extract what they already know — and order clarifying questions so that **architecture-changing questions come first**.

## 2. Simplicity First

Minimum code that solves the problem — nothing speculative. Kept as the tie-breaker when in doubt; the rest is model default.

## 3. Surgical Changes

Model default, with one project nuance: unrelated dead code you notice gets mentioned, not deleted.

## 4. Goal-Driven Execution

State verifiable success criteria before multi-step work ("write a test that reproduces it, then make it pass" — never "make it work"); strong criteria let you loop independently. How you format the plan is your call.
- Known defects are frozen immediately as `{ todo: true }` tests encoding the CORRECT expectation — every run lists them without going red; the fixing session removes the flag.
- Red-to-green **budget**: if the suite is still red after ~10 rounds, stop trying — `git bisect` onto the introducing commit and report instead. And state explicitly at the end **what was fixed by suppression rather than by understanding** (timeout raised, test skipped, warning silenced). Such a fix is a valid interim result — but only if it is named as one.
- Count/grep checks on repo files must be **CRLF-safe** (Windows checkout): a `sed`/`grep` pattern anchored with `$` silently counts zero on CRLF files — and a silent zero reads like "clean". Observed 2026-07 during the CI-hang investigation.
- Generated visualizations are **static/precomputed** by default. A `requestAnimationFrame`/`setInterval` loop without an explicit stop condition or frame cap does not ship — such a loop pinned the user's CPU at 100 % in 2026-07.

## 5. Security by Design

**Derive security requirements before writing the plan — not after the bug.** When a milestone adds a new attack surface — write/control paths, network listeners, credential handling, or any untrusted external input — invoke `security-requirement-extraction` during **brainstorming/design** and **writing-plans**: build a short STRIDE threat model for the new surface, derive concrete **testable** requirements traced to threats with acceptance criteria, and record both in `docs/superpowers/security/<date>-<milestone>-threat-model.md` (the M3 doc is the pattern). Carry those requirements into the plan as explicit verification steps (§4) and TDD cases where testable, then re-run `/security-review high` on the resulting diff before merge. Skip only for changes with no new attack surface (pure reads, docs, refactors, UI copy). When in doubt, do the threat model — it is cheap relative to a shipped vulnerability.

### Dependency Hygiene (slopsquatting defense)

LLM-hallucinated package names are a supply-chain attack vector (attackers pre-register them). Therefore:
- No new dependency — runtime or dev, **including `npm:` alias targets** — enters a spec/plan without an **existence proof**: a registry lookup or context7 doc hit, recorded in the plan's Tech Stack/Global Constraints.
- Agent-run installs use `--ignore-scripts`.
- The `package-guard` hook enforces registry existence + freshness/adoption at install/manifest time (fail closed). Its override path is a human terminal install — never weaken the hook to get past it.

### Extension Hygiene (third-party skills, agents, hooks, MCP)

A skill is more privileged than a dependency: `` !`cmd` `` dynamic-context blocks in a SKILL.md execute during preprocessing — **before the model sees the skill** — so no amount of model-side judgment can stop them, and skills arrive without an install step (`.claude/skills/` in a cloned repo loads once the workspace is trusted). Therefore:
- **No external skill, agent, command, hook, or MCP server enters this project or `~/.claude/` without a read of its actual source** — first adoption AND every update. Read the diff, not the README. The blocking review checklist and the mechanical prefilter live in `milestone-checkpoint` (its Schritt 4), which enforces this at update time.
- **`disableSkillShellExecution: true` is the default posture** in `.claude/settings.json`. It neutralizes the whole dynamic-context attack class. Turn it off only deliberately, for a named skill that needs it, and record why.
- **Cloning a repo is an adoption decision.** Before working in a foreign checkout, check whether it carries `.claude/skills/`, `.claude/agents/` or `.claude/hooks/`, and apply the checklist to those files before trusting the workspace.
- Curated indexes (awesome-lists, marketplaces) are **discovery aids, not trust signals** — listing implies no review.

## 6. Platform-Specific Conventions

**Check for a `<PLATFORM>.md` at the project root before assuming generic tooling.** Here that is @HOMEY.md — CLI commands, artifact-sync rules and release mechanics for Homey. This file only covers conventions that hold regardless of platform; defer to the platform file wherever §7–8 say so.

## 7. Progress Dashboard Protocol

**The procedure is the `dashboard-sync` skill** — mandatory in every milestone and checkpoint session. It owns the field schema, the per-session lifecycle (start / during / end) and the shape of checkpoint entries (`Mx.0`; the implementation milestone it gates is `Mx.1`). `docs/dashboard/dashboard.html` is one self-contained file: edit **only** the `window.DASHBOARD_STATUS` data block, never the renderer beneath it, and commit it — other sessions and fresh worktrees read it.

Rules that outlive the procedure:
- New milestone sessions and the `release-readiness` subagent read `docs/dashboard/triage-inbox.md` **first** — surface open findings before starting new work.
- **Log friction the moment it occurs**: append a `log[]` entry prefixed `FRICTION:` to the active milestone. Not only milestone-shaped events — **session mechanics count too**: a tool the classifier blocked, a shell form that corrupted its own output, a step redone because an assumption was wrong. Those are exactly the classes the `/insights` report keeps surfacing while this log stays silent on them (re-checked 2026-08-24: all three of its categories were missing here). The `milestone-checkpoint` retro reads this log as its primary source — unlogged friction is invisible to it.
- Resume prompts state the **goal and the machine-checkable done condition**, never a step-by-step procedure. For flagship sessions (§11) this is load-bearing, not stylistic: over-prescriptive prompts measurably reduce flagship output quality.
- Every final report and every handover ends with two lines: **what was actually executed and verified** and **what was assumed** without checking. "Verified" means one thing only: the command AND its output are in this transcript. Reasoning that something must work, a test written but not run, and a gate that stayed silent are all *assumed* — a silent gate especially, since silence and "never ran" look identical from outside (M9.0: `commit-msg-guard` had a clean ledger for its whole life while letting four heredoc commits through). A step an unattended run skipped belongs in the second line, never silently in the first. Unverified completion claims are the only friction class the `/insights` reports flag as "dissatisfied" — not bugs.
- Between milestones, run `milestone-checkpoint` and track it as its own `Mx.0` entry, not just as prose.

## 8. Versioning & Release Log

**Every real release gets a version bump and a log entry mapping it to a commit.** Version scheme `0.X.Y`: **X = milestone number**, **Y = build number within that milestone** (resets to 0 at each new milestone). Major stays `0` until the first public 1.0.

Any build that is actually deployed/installed/published — not a throwaway dev run — gets its own version number and a line in `docs/dashboard/versions.md` (`| Version | Date | Commit | Target | Milestone | Note |`). Per release: commit the code being deployed → bump the version (see @HOMEY.md for the exact command) → write a changelog entry in the language(s) the project's users see → verify the generated manifest is in sync and commit bump + changelog together → deploy/publish, then append the log line. An ephemeral dev-run command that tears itself down on stop is not a release and needs no bump/log entry.

## 9. Branch Lifecycle

### Starting: one worktree per session

**A milestone or feature session works in its own git worktree — never in a checkout another session may be using.** Use the native path first — `claude --worktree <name>` at launch, or the `EnterWorktree` tool mid-session (`/fork` gets its own worktree too); only the native path also isolates Bash/git from the main checkout. `superpowers:using-git-worktrees` stays the fallback. Exempt: short read-only or single-file sessions (nightly triage, dashboard edits, a quick doc fix) and checkpoint sessions that must delete worktrees — they stay in the primary checkout.

Why: two agent sessions sharing one working directory collide in ways git cannot arbitrate. Observed 2026-07-21 — a parallel milestone session edited `HOMEY.md`/`README.txt` mid-session, so `git status` showed foreign changes that had to be reasoned about before every commit, and that session's `git push` swept along a finished-but-unpushed commit from the other session that nobody had decided to ship. Isolation is cheap; untangling a shared tree is not.

Corollary for automations: a routine that writes **only its own ledger file** (e.g. the nightly triage writing `docs/dashboard/triage-inbox.md`) commits it directly on `main` — its findings must be readable on `main`, because every new milestone session reads them first (§7). The moment an automation touches anything beyond that ledger — code, version bumps, shared docs — it needs a branch and a PR.

### Finishing: review, triage, then ask

**Before any git action on a finished branch, run `/code-review`, let the human triage the findings, re-review the fixes — then ask how to proceed.**
1. Proactively start `/code-review` on the diff against the base branch — don't wait to be asked. **Always name the level**, never call it bare: without one the command reuses the last level you typed, across sessions. `medium` for a task review inside `subagent-driven-development` (few, high-confidence findings), `xhigh` for the whole-branch review here, `ultra` (Cloud multi-agent, costs credits — a per-case decision) plus `/security-review high` for a milestone with its own threat model (§5). `--fix` only at `medium`; its edits sit outside `/rewind` checkpoints, so undo them with git.
   Fan-out der Linsen-Agents aus `.claude/agents/` **parallel** dazu, über `superpowers:dispatching-parallel-agents`. `adversarial-reviewer` läuft **immer** mit — er ist das Gegengewicht zur hochsicheren Kalibrierung von `/code-review` und deckt ab, was erst unter ungünstigen Eingaben, Zeitpunkten oder Reihenfolgen kippt; er meldet nur, was er mit einem Repro-Szenario belegen kann. Die drei übrigen sind bedingt: `runtime-resource-reviewer` (Timer, Listener, Handles), `api-contract-reviewer` (HTTP-/API-Aufruf), `cross-platform-reviewer` (plattformabhängige Pfade/Shell-Aufrufe) — nicht betroffene Linsen weglassen. Grund: drei der Bugs im `/insights`-Report 2026-08-21 fielen erst beim manuellen Testen des Nutzers auf — und alle drei gehörten in genau diese Klassen.
2. Funde aller Linsen zusammenführen, Dubletten streichen, als Artifact veröffentlichen — und **dort anhalten**. Der Mensch triagiert jeden Fund als `approved` / `rejected` / `deferred`; ein Fund ohne reproduzierbares Szenario wird ohne Diskussion abgelehnt. Die freigegebenen landen in `docs/superpowers/reviews/<datum>-approved.md`, mit dem geprüften `head`-SHA im Frontmatter — vor dem Fixen gegen `git rev-parse HEAD` prüfen, eine Abweichung heißt: die Freigabe ist veraltet. Gefixt wird test-first (`superpowers:test-driven-development`), das Repro-Szenario ist der zuerst geschriebene Test. Dieses Gate ist der Grund, warum die Linsen paranoid sein dürfen: über die Relevanz entscheidet ein Mensch, nicht der Reviewer.
3. **Nach den Fixes den Fix-Diff erneut reviewen — vor dem Push.** Die Freigabe aus Schritt 2 gilt dem Code, wie er VOR den Fixes aussah; die Fixes selbst sind frisch geschriebener, ungeprüfter Code, und dort ist die Fehlerdichte am höchsten. Also `/code-review medium` **plus** `adversarial-reviewer` über den Diff der Fix-Commits (nicht noch einmal über den ganzen Branch — den hat Schritt 1 gesehen). Funde innerhalb des bereits freigegebenen Mandats werden direkt test-first behoben, alles darüber hinaus geht zurück in die Triage aus Schritt 2. Ergebnis als Nachtrag ins `-approved.md`. Grund: der erste vollständige Loop (PR #19, 2026-08-29) fand mit genau diesem Schritt **vier reale Defekte in den 20 frischen Fixes** — der neue Repair-Dialog sperrte Legacy-UUID-Geräte aus, eine Reihenfolgeregel war nur einseitig implementiert, eine Entprellung zählte Ticks statt Wanduhrzeit, und leere Repair-Felder löschten die gespeicherten Credentials. Ohne den Nachreview wären alle vier gemergt worden.
4. Based on the result, ask (don't decide silently): **trivial change (no Critical Issues)** — whether to push directly to `origin/main` and pull the local `main` up to date, skipping a PR; **otherwise** — whether to push the branch and open a Pull Request.

Always wait for an explicit yes before pushing or merging — this section only saves re-explaining the two options each time, not the confirmation itself.

## 10. Permission Strategy (2 Layers)

**Hooks define what must never happen; the Auto Mode classifier judges everything else.**
1. **Hooks = "must NEVER happen"** — deterministic exit-2 guards (PreToolUse). They apply in every permission mode; neither Auto Mode nor `bypassPermissions` can override them.
2. **Auto Mode = the normal case**, not situational autonomy: `permissions.defaultMode: "auto"` is set globally, and it is the Pro/Max product default from v2.1.228 (v2.1.233 on native Windows). Hooks stay in force underneath. Never use `bypassPermissions` locally.

Two boundaries the classifier must not clear on its own — both evaluated **before** it:
- **`permissions.ask`** = human checkpoint, always prompts: `Bash(git push --force*)` globally, `Bash(homey app publish*)` here (the conditional `release-gate` hook stays the content check).
- **`autoMode.hard_deny`** = prose rules no user intent or `allow` entry can clear. Keep `"$defaults"` in the array or the built-in exfiltration rule is silently replaced. Read **only** from `~/.claude/settings.json`, never from a repo's `.claude/settings.json` — so tool-pattern boundaries for this repo belong in `permissions.ask`/`deny` instead.

`permissions.allow` is no longer curated per checkpoint; it documents read-only everyday commands and keeps non-auto sessions usable. Global vs. project split: see "Claude-Code-Settings: Skill = Source of Truth" below.

## 11. Model Tiering (Subagents & Milestones)

**Current palette:** *workhorse* = Claude Sonnet 5, *implementer* = Claude Opus 5, *flagship* = Claude Fable 5. When the palette changes, edit only this line.
The tier rules — per-subagent tiers, `recommendedModel` for milestones, the security-milestone and autonomous-loop clauses, and flagship orchestration (including "SDD implementers are dispatched as `general-purpose`, never `fork`") — live in `docs/superpowers/notes/2026-08-24-model-tiering.md`. Read it when assigning a tier: agent frontmatter, a new milestone's `recommendedModel`, or a flagship fan-out.

---

## Claude-Code-Settings: Skill = Source of Truth

**Globale** Settings-Änderungen (die auf jedem Rechner gelten sollen — global nützliche `permissions`-Muster, globale Hooks, `model`, `autoMode`, Notification-Flags, Plugins/Marketplaces) gehören in das private Skill-Repo `skill-ClaudeCode-general-settings` als **Quelle der Wahrheit**: zuerst dort ablegen (`settings-reference.json` bzw. das `general-settings`-Plugin), dann in die Live-`~/.claude/settings.json` spiegeln — nie nur die Live-Datei ändern, sonst geht die Änderung beim Rechnerwechsel verloren. Ein `diff` der beiden darf nur `_comment*`-Keys zeigen.

**Projekt-/plattformspezifische** Settings (die Homey-Allowlist, die Homey-Hooks wie `compose-guard`/`secrets-guard`) bleiben in der `.claude/settings.json` dieses Repos — dort sind sie schon portabel (ein `git clone` bringt sie mit). Faustregel: „In jedem Projekt sinnvoll?" → global (Skill). „Nur hier / nur für Homey sinnvoll?" → projekt-lokal.

**Framework-Artefakte** (seit M4.9): Jede GENERISCHE Änderung an Gate-/Guard-Hooks, CLAUDE.md-Protokollregeln, dem Checkpoint-Ablauf oder den Dashboard-/Template-Formaten wird **in derselben Session** in das Framework-Repo `skill-agentic-loop-framework` (`plugin/skills/agentic-loop-framework/templates/` bzw. `homey/`) gespiegelt + dessen CHANGELOG ergänzt. Projekt-Spezifisches (Violet-Live-Smoke, konkrete Allowlist-Einträge) bleibt hier. Der `milestone-checkpoint` prüft Drift (Schritt 7a).

Based on: https://github.com/multica-ai/andrej-karpathy-skills
