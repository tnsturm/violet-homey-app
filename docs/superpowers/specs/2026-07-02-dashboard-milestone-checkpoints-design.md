# Dashboard Milestone-Checkpoints + Remote-Control Prompts (Design Spec)

- **Date:** 2026-07-02
- **Status:** Approved design (pending written-spec review)
- **Project:** Homey Pro app for the PoolDigital "Violet" pool controller
- **This spec covers:** two small, related additions to the progress dashboard —
  (1) explicit "between milestones" checkpoint entries, and (2) a `/remote-control` line at the end
  of every non-done resume prompt. It is **not** a feature milestone (M0–M7); it changes the
  process-tracking artifact, not the app.

---

## 1. Context & problem

CLAUDE.md §7 point 4 already requires: *"Between milestones: once a milestone is closed and before
starting the next, run `/claude-automation-recommender` once..."* — but this rule only exists as
prose. `docs/dashboard/dashboard.html` tracks milestones M0–M7 in a flat `milestones[]` array; there
is no dashboard-visible representation of the between-milestones step, so it's easy to forget and
there's no resumable prompt for it (unlike every milestone, which has one).

Separately, the user wants every resume prompt to end with `/remote-control <name>` so the spawned
session is reachable from the Claude mobile app. The global `/config` → "Enable Remote Control for
all sessions" setting has been on for a while but does not reliably connect every session, so this
is a deliberate per-prompt belt-and-suspenders addition, not a replacement for that setting.

**Goal:** make the between-milestones step trackable and resumable exactly like a milestone, and
make every resume prompt end with an explicit Remote Control connect line.

---

## 2. Checkpoint entries

### 2.1 Shape

A checkpoint is a milestone-shaped object inserted directly into the same `milestones[]` array
(confirmed approach — keeps the existing renderer untouched, per CLAUDE.md §7's "never touch the
renderer" rule). No renderer code changes.

```js
{
  id: "→M3",
  title: "Zwischen-Check",
  status: "todo",              // "done" | "active" | "todo", same lifecycle as a milestone
  startedAt: null,
  finishedAt: null,
  commit: null,
  summary: "Housekeeping zwischen M2 und M3: Permission-Allowlist pruefen, Automation-Empfehlungen pruefen (CLAUDE.md §7 Punkt 4).",
  steps: [
    { label: "/fewer-permission-prompts", done: false },
    { label: "/claude-automation-recommender", done: false }
  ],
  currentActivity: null,
  runtime: null,
  log: [],
  prompt: `...` // see 2.3
}
```

`id` uses an arrow prefix (`→Mx`) to read as "gate before Mx" and sort naturally next to the
milestone it precedes. Two explicit steps (not combined into one) match the existing granularity of
milestone `steps[]`.

### 2.2 Scope: `→M2` through `→M7` only

Six checkpoints, inserted before M2, M3, M4, M5, M6, M7 respectively. **No `→M1`**: M0 and M1 are
both closed history that predates CLAUDE.md §7 point 4 existing at all — a retroactive checkpoint
there would have no evidence and no value.

### 2.3 Retroactive fill: `→M2` is already done

Both commands already ran in the M1→M2 gap, with evidence:
- `/fewer-permission-prompts` → commit `9c10b13` ("chore(claude): allowlist read-only commands to
  cut permission prompts", 2026-07-02).
- `/claude-automation-recommender` → this conversation's first message, same session.

`→M2` is created with `status: "done"`, `startedAt`/`finishedAt: "2026-07-02"`, `commit: "9c10b13"`,
both steps `done: true`, and two `log[]` entries citing the above. Its `prompt` stays `null` (the
renderer only shows prompts for non-done entries, same as milestones).

`→M3` through `→M7` are created with `status: "todo"`, both steps `false`, empty `log[]`, and a real
resume `prompt` (section 2.4 below shows the template; near-identical to a milestone prompt but
short, since the task itself is just "run two skills and update this entry").

### 2.4 Checkpoint prompt template

```
UMGEBUNG: Repo liegt lokal unter C:/Users/TorstenSturm/source/repos/VioletApp (NICHT mehr in OneDrive). Claude Code in diesem Ordner starten; alle Pfade unten sind repo-relativ.

Zwischen-Check vor M<N> (CLAUDE.md §7 Punkt 4). M<N-1> ist abgeschlossen, M<N> startet als Naechstes.

Fuehre nacheinander aus:
1. /fewer-permission-prompts
2. /claude-automation-recommender

Aktualisiere danach den →M<N>-Eintrag in docs/dashboard/dashboard.html: status "done", finishedAt = heute, beide Steps abhaken, je einen log-Eintrag mit kurzer Zusammenfassung. (Dashboard-Protokoll: CLAUDE.md §7, bereits automatisch geladen.)

/remote-control →M<N> — Zwischen-Check
```

One instance per checkpoint (`→M3` … `→M7`), `<N>`/`<N-1>` substituted accordingly.

---

## 3. `/remote-control` line in every non-done prompt

Every resume prompt — milestone (M2–M7; M0/M1 are done, `prompt: null`, nothing to touch) and
checkpoint (`→M3`–`→M7`) — gets one new final line:

```
/remote-control <id> — <title>
```

using that entry's own `id` and `title` verbatim (e.g. `/remote-control M2 — Volle Reads +
Feature-Gruppen`). This sets the Remote Control session's display title to match the dashboard
entry, so it's identifiable in the mobile app's session list.

**Known limitation, accepted by the user:** these prompts are pasted as a single message into a
fresh session. Whether a `/remote-control` line embedded at the end of a large pasted block is
parsed as a live slash-command (vs. inert trailing text) is not something this session can verify —
if it doesn't fire, the user sends it as a separate follow-up message. This is a deliberate
belt-and-suspenders addition on top of the (already-enabled but seemingly unreliable) global
`/config` auto-connect setting, not a guaranteed fix.

---

## 4. Companion text updates

- **CLAUDE.md §7 point 4**: extend to mention `/fewer-permission-prompts` alongside
  `/claude-automation-recommender`, and note this is tracked as a `→Mx` checkpoint entry, not just
  prose. Add one rule under the existing "**Rules:**" bullet list: every resume prompt ends with
  `/remote-control <id> — <title>`.
- **`.claude/skills/dashboard-sync/SKILL.md`**: short addition noting checkpoint entries
  (`→Mx`) are edited with the exact same rules as milestone entries, and that new prompts (of either
  kind) must end with the `/remote-control` line.
- **`docs/dashboard/README.md`**: one line noting the `→Mx` checkpoint convention.

---

## 5. Out of scope

- Renderer changes in `dashboard.html` (none needed — checkpoints reuse the milestone card shape).
- A `→M1` checkpoint (predates the rule; no evidence, no value — see 2.2).
- Verifying whether `/remote-control` actually fires when embedded in a pasted multi-paragraph
  message (cannot be tested from this session; accepted as a known limitation, section 3).
- Changing the global `/config` Remote Control auto-connect setting (interactive-terminal-only,
  outside this session's reach).

---

## 6. Files touched

| File | Change |
|---|---|
| `docs/dashboard/dashboard.html` | Insert 6 checkpoint objects into `milestones[]`; append `/remote-control` line to M2–M7 prompts |
| `CLAUDE.md` | §7 point 4 wording + new Rules bullet |
| `.claude/skills/dashboard-sync/SKILL.md` | Checkpoint-entry note + `/remote-control` convention |
| `docs/dashboard/README.md` | One-line mention of the `→Mx` convention |
| `.claude/skills/milestone-checkpoint/SKILL.md` | New skill (addendum, §7) |

---

## 7. Addendum: consolidate checkpoint housekeeping into one skill

Added mid-implementation, before push — same branch/diff (user decision).

**Trigger:** the checkpoint's two commands (`/fewer-permission-prompts`,
`/claude-automation-recommender`) should also cover a third housekeeping task: checking whether the
Homey-specific skills this project depends on (`homey-cli-skill`, `homey-app-skill`, both installed
as plain file copies under `~/.claude/skills/`, sourced from real git clones under `/tmp/`) or
Superpowers (installed via the `claude-plugins-official` marketplace, **not** a git checkout — no
direct relationship to `github.com/obra/Superpowers`) have upstream updates.

**Decision: consolidate all three into one new skill**, `milestone-checkpoint` (project-local —
the exact skill list is Homey/VioletApp-specific). Every `→Mx` checkpoint prompt now runs this one
skill instead of listing two separate commands.

**Update behavior per source** (confirmed via live testing, not assumption):
- `homey-cli-skill` / `homey-app-skill`: real git clones with real remotes — `git fetch` +
  `log HEAD..origin/HEAD` detects updates; if found, `git pull` in the `/tmp` clone then copy over
  the live `~/.claude/skills/` copy (which has no git tracking of its own). **Auto-applied**, no
  confirmation needed (user decision).
- Marketplace-install as an alternative was tested and rejected: `claude plugin marketplace add
  https://github.com/timvdhoorn/homey-cli-skill` fails — the repo has no
  `.claude-plugin/marketplace.json` manifest, so it isn't marketplace-installable as-is. Forking
  to add one was considered and rejected (added maintenance burden for two single-file skills).
- Superpowers: **report-only**. No git remote to check; its actual update path is
  `claude plugin update superpowers`, which requires a restart and can't be driven from this
  session. The skill reports the currently-installed version (`claude plugin list`) and tells the
  user to run the update command themselves if they want to.

**Retroactive `→M2` data**: both `homey-cli-skill` and `homey-app-skill` were live-checked during
this session (2026-07-02) and found already current (no commits beyond local HEAD); Superpowers is
at `6.0.3`. `→M2` gets a third step (`"Skill-Quellen geprüft"`, done) and a matching log entry with
this real result, instead of a placeholder.
