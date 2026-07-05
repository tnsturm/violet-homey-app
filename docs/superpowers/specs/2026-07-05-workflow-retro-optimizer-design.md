# Workflow Retrospective Optimizer — Design

- **Date:** 2026-07-05
- **Status:** Draft design (to be wired into the `milestone-checkpoint` skill)
- **Motivation:** The same class of mistake recurred 3× (the `.homeychangelog.json` curly-quote / invalid-JSON bug) without the workflow learning from it. This adds a between-milestone step that mines recurring friction and codifies durable prevention.

---

## 1. Goal

Between milestones, **identify recurring, same-class problems and codify prevention into the lowest-maintenance, highest-reliability layer**, so the same mistake cannot recur. Optimize for *the workflow never hitting that problem again*, not for documenting that it happened.

Non-goal: fixing one-off mistakes (those are just fixed in place). The optimizer only acts on **recurring** or **user-flagged** friction — YAGNI on everything else.

## 2. Two halves: capture, then codify

Learning needs a signal. The signal must be created *during* a milestone and *reviewed* between milestones.

### 2.1 Capture convention (during a milestone)

Whenever a problem **recurs**, or the user **corrects the workflow** ("again", "third time", "don't do X"), record it immediately — cheap, one line, greppable:

- **`feedback`-type memory** (durable, cross-session) — the memory system already defines this exact category ("corrections… include the why + how to apply"). Preferred for anything that should survive sessions.
- **and/or** a dashboard `log[]` entry prefixed **`FRICTION:`** — `what happened · root cause (if known) · occurrence count`.

Minimum bar: the problem is written down somewhere greppable with a root-cause hint. Without this, the optimizer has nothing to review (exactly the gap that let the quotes bug recur silently).

### 2.2 The optimizer (between milestones)

A runnable procedure (to live in the `milestone-checkpoint` skill). **Inputs** — the friction signal for the just-finished milestone window:

1. `feedback` memories added/touched during the milestone.
2. Dashboard `log[]` entries (especially `FRICTION:`) across the milestone.
3. **Git signal:** repeated/duplicate fix commits, `fix:`/`revert:` commits, a commit that fixes an immediately-prior commit, or ≥2 commits of the same fix-class touching the same file.
4. In-session corrections: the model redoing the same work; user cues like "again"/"third time".

**Procedure:**

1. **Gather** the signal from all four sources.
2. **Cluster** into distinct problems; count occurrences. **Scope = seen ≥2× OR explicitly user-flagged.** Drop one-offs.
3. **Root-cause** each (three whys): *why it happened · why it recurred · why it wasn't caught before commit.*
4. **Choose the codification layer** — highest-reliability first; a problem may take more than one:
   | Layer | Use when | Example |
   |---|---|---|
   | **a. Hook** (automated guard) | the failure is *mechanically detectable* | invalid JSON, secret leak, version mismatch |
   | **b. HOMEY.md / CLAUDE.md rule** | a process/convention the model must follow but can't be fully automated | "changelog is JSON — build it via `node`, not by hand" |
   | **c. `feedback` memory** | cross-session guidance/preference not tied to this repo's docs | tool-usage habits |
   | **d. Skill edit** | a skill's steps are themselves wrong | fix the step |
   Prefer the highest layer that *fully* covers the failure. A hook that can't be forgotten beats a doc rule that can.
5. **Apply + verify.** Apply the change (or draft for approval if it's large). Every new hook ships with a **smoke test** (like `secrets-guard`). Verify the guard actually blocks the bad case and passes the good case.
6. **Record + close.** In the `→Mx` checkpoint `log[]`: `problem → root cause → layer → change → verified`. Mark the friction item resolved (so it isn't re-processed next time).

## 3. Integration

Add as a **4th step** of the `milestone-checkpoint` skill (the `→Mx` between-milestone checkpoint), after the existing three (`/fewer-permission-prompts`, `/claude-automation-recommender`, skill-sources). The `→Mx` dashboard entry gains a 4th step: **"Workflow-Retrospektive (Optimizer)"**.

Cadence: once per milestone boundary. It is cheap when the friction signal is empty (nothing recurred → no-op).

## 4. Guardrails

- **Only recurring/flagged problems** get codified — avoid over-fitting the workflow to a single incident.
- **Automation over prose:** a hook (can't be forgotten) beats a doc rule beats a memory. Reach for the lowest layer only when the higher one can't cover it.
- **Every new hook ships with a smoke test** and is wired in `.claude/settings.json`.
- **Keep CLAUDE.md lean:** add a rule there only for a genuine repeatable *process* constraint; otherwise prefer a hook or memory.
- **One optimization = one small, reversible change,** committed on its own.

## 5. Output

A short retro report (also suitable for the checkpoint `log[]`):

| Problem | Occ. | Root cause | Layer(s) | Change | Verified |
|---|---|---|---|---|---|

## 6. First worked example

See §"Re-review: the changelog quotes problem" applied below at adoption — the `.homeychangelog.json` curly-quote bug (3×) → a `json-guard` PostToolUse hook (primary) + HOMEY.md rule + `feedback` memory.
