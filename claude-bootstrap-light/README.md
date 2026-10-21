# Claude Code working layer - light

A small, project-agnostic working layer for Claude Code, cut from the full one in `../claude-bootstrap-full` for a **20 dollar plan**: one lifecycle, **at most three agent launches per task** - `hunt` on the plan and on the diff, `drift` on the docs only when a doc names what changed or a bug was fixed (plus a scoped second `hunt` round when a fix is itself non-trivial, and an `Explore` when step 1 has to sweep an unfamiliar area) - one deterministic guard, and a `CLAUDE.md` held under 20 KB because it is paid for on every turn.

```
README.md      this file
install.mjs    copies template/ into a project; never overwrites what is there
template/      what a project receives (CLAUDE.md, .claude/*)
```

## Install

```bash
node install.mjs D:/path/to/project            # or --dry-run first
```

**A hand copy works too**: drop `template/CLAUDE.md` and `template/.claude/` into the project root, rename an existing `CLAUDE.md` out of the way (any name - `claude_old.md` is fine), and run `/setup`. It finds the instruction files by shape rather than by name, tells the layer's copy from the project's own by the bootstrap note inside, and checks `.gitignore` itself, which is the one thing the installer would have done for you.

Then, in the project: start Claude Code and run **`/setup`**. It reads the repo (manifest, build config, source layout, what is generated), looks at whatever Claude config was already there (`CLAUDE.md`, `AGENTS.md`, an existing `.claude/settings.json`, existing agents and skills), asks in chat what it cannot settle, fills every placeholder and `[fill]` section, and self-tests the guard. Restart the session afterwards: agents, skills and hook registrations are read at session start.

Nothing existing is overwritten. A project that already has a `CLAUDE.md` gets the layer's copy as `CLAUDE.light.md`, and `/setup` merges them in front of the user.

**Check what the installer says about `.gitignore`.** A project whose ignore file already carries a bare `.claude/` line keeps the whole layer untracked - git does not descend into an ignored directory, so no negation can rescue it. The installer says so instead of appending; replace that line with the block it prints.

**Taking a layer update later:** the installer never overwrites, so a re-run only adds what is missing - and drops the current template `CLAUDE.md` beside yours as `CLAUDE.light.md`, which is exactly the file to diff against. To refresh any other file, delete it first and re-run, or diff it against `template/` and port what you want by hand; a filled `CLAUDE.md` and a tuned `hunt.md` are the two you will not want replaced.

## What is in it

- **One lifecycle, six steps** (`CLAUDE.md`, Development Workflow): classify, the consumer walk plus a plan review, implement, one review pass, the docs check, close with what stays unverified, what was decided on the user's behalf and three suggested commit subjects. Bug reports enter through the `debug` skill.
- **One reviewer**, the `hunt` subagent: runtime defects only, every finding a concrete failure scenario traced through the real implementation the change consumes, with an attack-angle library the project feeds with its own bugs. Two modes: the plan before it is approved, the diff after it is written. `sonnet` at medium effort by default - one line of frontmatter raises it.
- **One doc checker**, the `drift` subagent, which keeps the layer true to the code without a manual pass: every claim a changed identifier touches is re-checked by a command and comes back as an exact `replace:` / `with:` pair, and after a bug fix it proposes the rule no doc had. Two modes: `diff` at lifecycle step 5, launched only when the main thread's grep finds a doc naming what changed or the task fixed a bug, and `section <name>` from `maintain-ai-layer`. Read-only, `sonnet` at medium effort.
- **One guard**, `guard.mjs`, the full layer's guard with its two test suites unchanged; the hook itself differs in two places only - it reads the unfilled generated-paths placeholder as an empty list, so it works before `/setup`, and it notes that its session-ledger check is inert here and its `hunt` write fence only narrows `hunt`'s Bash movers. It refuses: mutating git however the command is spelled, `gh` writes, shell writes and in-place edits into the tree, a copy or move into the tree, deletes beyond the one grant, `cd` outside a subshell, protected paths, dashes. It costs no tokens - it runs locally - which is why it is the one part that was not trimmed.
- **One reminder**, `upkeep-nudge.mjs` at session start: when the `maintain-ai-layer` pass is 14 days overdue (it reads the date the pass writes into the gitignored `.claude/.last-maintain`), the model tells you so in one line. Silent otherwise and in a linked worktree, so it costs tokens only on the day it speaks.
- **Five skills**: `setup` (this layer's first-run fill), `maintain-ai-layer` (the layer's upkeep, one `references/<mode>.md` per mode: `weekly`, every week or two - dead references by `layer-refs.mjs`, rule globs that match nothing, wrong counts, always-on bytes in the main thread, plus at most three `drift` runs on the rules and the `CLAUDE.md` section the recent code changes reached; and on request only, since each costs dozens of agent launches, `deep` - `drift` over every unit, the rule steps, consistency, hooks, memory and a walk of whole tasks through the lifecycle - `rules` - each rule checked against the code, its reach measured with `git ls-files` for over- and under-reach, a rule whose sections serve different files split, new rules from a sweep of the code and its fix history, and with no rule yet, a whole set built from the project - and `efficiency`, which measures where the layer spends tokens with no result and stops for your answer before applying), `debug` (root cause before any fix), `handoff` (`.claude/handoff.md`, for a `/compact`, a new session or a usage window that runs out), `retro` (only from its slash command, after a task: what went badly, each fix at the cheapest layer that would have caught it, each with a default - no subagent).

## What it drops, against the full layer

| Dropped | Why, and what carries the obligation instead |
| --- | --- |
| `gate` (static review agent) | the main thread runs the check command itself - one Bash call instead of a whole agent context |
| `integration`, `twins`, `comments` | the sibling question is the `debug` skill's "who else does this", and `hunt` re-greps the consumers; comments are a `CLAUDE.md` rule |
| The signal-counting review ladder | one rule: a non-trivial change gets `hunt`, a trivial one gets nothing |
| Session artifact folders, the agent ledger, `record-activity.mjs` | a verdict written into the chat, and `handoff.md` when the session must survive |
| The Stop gate (`verify-gate.mjs`) | it can cost an extra turn per block; the lifecycle's own step 3 and step 6 run the check command |
| `rules-reach.mjs` with its fixture and load log, the shipped rules, `dev-servers.mjs`, `run-pure.mjs`, `verify-live` | project-specific machinery; `.claude/rules/*.md` with a `paths:` frontmatter still works, and `maintain-ai-layer` measures a rule's reach with `git ls-files` instead - no glob-shape check, no fixture, no probe of the rule loader |
| `maintain-ai-layer`'s session-folder record and `crosscheck` review | a run keeps its findings in a scratchpad file and runs `handoff` when it may outlive the session; a hook change in `efficiency` gets `hunt` |
| `drift`'s `decisions.md` and provenance tags, its `opus` / `high` default | light has neither file nor tags - a settled decision lives in `CLAUDE.md` Architecture; `sonnet` at medium effort is enough for claim-by-claim checks |
| `.claude/docs/decisions.md` | a decision a reviewer would re-file goes into `CLAUDE.md` Architecture as settled and deliberate, which `hunt` reads anyway |
| Probe compiling in the reviewer | needs per-project build config, allow-listed probe paths and a scratchpad project; the reviewer reads and reasons instead |

The full layer is the better tool when the budget is not the constraint: it catches more, in more places, at several times the token cost per task.

## Tuning it for cost

- **`CLAUDE.md` is the recurring bill.** Its 20 KB budget is roughly 5k tokens on every turn. Detail that only matters for some files goes into `.claude/rules/<name>.md` with a `paths:` frontmatter, which loads only when a matching file is read.
- **A subagent is the one-off bill**, tens of thousands of tokens per launch. The lifecycle spends two on a task with a plan, one without, zero on a trivial edit - plus one `drift` when a doc names what changed or a bug was fixed, and one scoped second `hunt` round when a fix is itself non-trivial. Saying "no subagents" moves the obligations to the main thread rather than dropping them.
- **The reviewer's model is one line** in `.claude/agents/hunt.md` (`model:`, `effort:`). Raise it for a release, lower it for a sweep.
- **`maintain-ai-layer` has one cheap mode.** `weekly` spends at most three launches; `deep`, `rules` and `efficiency` spend dozens and run only when you ask - after `setup`, `rules` once is the way to a first rule set.
- **Do not use `Workflow` or ultracode here.** They spawn agents by the dozen; that is the opposite of this layer.
