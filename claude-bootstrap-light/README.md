# Claude Code working layer - light

A small, project-agnostic working layer for Claude Code, cut from the full one in `../claude-bootstrap-full` for a **20 dollar plan**: one lifecycle, **at most two review launches per task** (plus an `Explore` when step 1 has to sweep an unfamiliar area), one deterministic guard, and a `CLAUDE.md` held under 20 KB because it is paid for on every turn.

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

**Check what the installer says about `.gitignore`.** A project whose ignore file already carries a bare `.claude/` line keeps the whole layer untracked - git does not descend into an ignored directory, so no negation can rescue it. The installer says so instead of appending; replace that line with the block it names.

**Taking a layer update later:** the installer never overwrites, so a re-run only adds what is missing - and drops the current template `CLAUDE.md` beside yours as `CLAUDE.light.md`, which is exactly the file to diff against. To refresh any other file, delete it first and re-run, or diff it against `template/` and port what you want by hand; a filled `CLAUDE.md` and a tuned `hunt.md` are the two you will not want replaced.

## What is in it

- **One lifecycle, six steps** (`CLAUDE.md`, Development Workflow): classify, the consumer walk plus a plan review, implement, one review pass, docs, close with what stays unverified and what was decided on the user's behalf. Bug reports enter through the `debug` skill.
- **One reviewer**, the `hunt` subagent: runtime defects only, every finding a concrete failure scenario traced through the real implementation the change consumes, with an attack-angle library the project feeds with its own bugs. Two modes: the plan before it is approved, the diff after it is written. `sonnet` at medium effort by default - one line of frontmatter raises it.
- **One hook**, `guard.mjs`, copied unchanged from the full layer with its two test suites: mutating git however the command is spelled, `gh` writes, shell writes and in-place edits into the tree, a copy or move into the tree, deletes beyond the one grant, `cd` outside a subshell, protected paths, dashes. It costs no tokens - it runs locally - which is why it is the one part that was not trimmed.
- **Four skills**: `setup` (this layer's first-run fill), `debug` (root cause before any fix), `handoff` (`.claude/handoff.md`, for a `/compact`, a new session or a usage window that runs out), `retro` (on request after a task: what went badly, each fix at the cheapest layer that would have caught it, each with a default - no subagent).

## What it drops, against the full layer

| Dropped | Why, and what carries the obligation instead |
| --- | --- |
| `gate` (static review agent) | the main thread runs the check command itself - one Bash call instead of a whole agent context |
| `integration`, `twins`, `comments`, `drift` | `hunt` carries the sibling-sweep question; comments are a `CLAUDE.md` rule; doc drift, and the missing rule after a bug fix, are a grep the main thread runs at step 5 |
| The signal-counting review ladder | one rule: a non-trivial change gets `hunt`, a trivial one gets nothing |
| Session artifact folders, the agent ledger, `record-activity.mjs` | a verdict written into the chat, and `handoff.md` when the session must survive |
| The Stop gate (`verify-gate.mjs`) | it can cost an extra turn per block; the lifecycle's own step 3 and step 6 run the check command |
| `rules-reach.mjs`, the shipped rules, `dev-servers.mjs`, `run-pure.mjs`, `verify-live` | project-specific machinery; `.claude/rules/*.md` with a `paths:` frontmatter still works, unmeasured |
| `maintain-ai-layer`, `.claude/docs/decisions.md` | the upkeep pass costs dozens of agent launches; a decision a reviewer would re-file goes into `CLAUDE.md` Architecture as settled and deliberate, which `hunt` reads anyway |
| Probe compiling in the reviewer | needs per-project build config, allow-listed probe paths and a scratchpad project; the reviewer reads and reasons instead |

The full layer is the better tool when the budget is not the constraint: it catches more, in more places, at several times the token cost per task.

## Tuning it for cost

- **`CLAUDE.md` is the recurring bill.** Its 20 KB budget is roughly 5k tokens on every turn. Detail that only matters for some files goes into `.claude/rules/<name>.md` with a `paths:` frontmatter, which loads only when a matching file is read.
- **A subagent is the one-off bill**, tens of thousands of tokens per launch. The lifecycle spends two on a task with a plan, one without, zero on a trivial edit. Saying "no subagents" moves the obligations to the main thread rather than dropping them.
- **The reviewer's model is one line** in `.claude/agents/hunt.md` (`model:`, `effort:`). Raise it for a release, lower it for a sweep.
- **Do not use `Workflow` or ultracode here.** They spawn agents by the dozen; that is the opposite of this layer.
