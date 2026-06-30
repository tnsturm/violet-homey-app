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

## 5. Security by Design

**Derive security requirements before writing the plan — not after the bug.**

When a milestone adds a new attack surface — write/control paths, network listeners, credential handling, or any untrusted external input — invoke the `security-requirement-extraction` skill during **brainstorming/design** and **writing-plans** to:

- Build a short STRIDE threat model for the new surface (assets, trust boundaries, threats).
- Derive concrete, **testable** security requirements — each traced to a threat, with acceptance criteria.
- Record both in `docs/superpowers/security/<date>-<milestone>-threat-model.md` (the M3 doc is the pattern).

Then carry those requirements into the plan as explicit verification steps (§4) and TDD cases where testable, and re-run `/security-review` on the resulting diff before merge.

Skip only for changes with no new attack surface (pure reads, docs, refactors, UI copy). When in doubt, do the threat model — it is cheap relative to a shipped vulnerability.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

Based on: https://github.com/multica-ai/andrej-karpathy-skills