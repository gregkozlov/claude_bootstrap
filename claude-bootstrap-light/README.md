# Claude Code working layer - light

A small, project-agnostic working layer for Claude Code, cut from the full one in `../claude-bootstrap-full` for a **20 dollar plan**: one lifecycle, **at most three agent launches per task** - `hunt` on the plan and on the diff, `drift` on the docs only when a doc names what changed or a bug was fixed (plus a scoped second `hunt` round when a fix is itself non-trivial, and an `Explore` when step 1 has to sweep an unfamiliar area) - one deterministic guard, and a `CLAUDE.md` held under 20 KB because it is paid for on every turn.

```
README.md      this file
INSTALL.md     the install and update procedure - read by the model, not copied into the project
template/      what a project receives (CLAUDE.md, .claude/*)
```

## Install

1. Download this repository (Code > Download ZIP, or `git clone`) and unpack it anywhere **outside** your project. You need one folder of it: `claude-bootstrap-light`.
2. Open Claude Code in your project, preferably on Opus at high effort (`claude --model opus --effort high`, or `/model opus` and `/effort high` in a running session): the install reads your repo and merges with whatever Claude config you already have. It is a one-off cost; the layer runs cheap afterwards.
3. Paste the prompt below with the path filled in. If Claude Code asks to read the unpacked folder, allow it (or add it first with `/add-dir <path>`).
4. When it is done, restart Claude Code and run `/maintain-ai-layer init`: it writes the project sections of `CLAUDE.md`, builds the path-scoped rules from your code and tunes `hunt` to the project.

The same prompt updates a layer installed from an older version of this bootstrap.

```text
Integrate the Claude Code working layer I unpacked at <path to claude-bootstrap-light> into this project.

1. Read <path>/INSTALL.md first and follow it - it covers a first install and an update of a layer installed earlier.
2. Never overwrite what this project already has (CLAUDE.md, AGENTS.md, anything under .claude/): merge it, and say what happened to each file.
3. Read every value the layer needs from this repo; ask me in chat only what the repo cannot answer.
4. Change files only - no commits, no pushes.
5. Finish with the report INSTALL.md asks for, then tell me to restart Claude Code and run /maintain-ai-layer init.
```

## What is in it

- **One lifecycle, six steps** (`CLAUDE.md`, Development Workflow): classify, the consumer walk plus a plan review, implement, one review pass, the docs check, close with what stays unverified, what was decided on the user's behalf and three suggested commit subjects. Bug reports enter through the `debug` skill.
- **One reviewer**, the `hunt` subagent: runtime defects only, every finding a concrete failure scenario traced through the real implementation the change consumes, with an attack-angle library the project feeds with its own bugs. Two modes: the plan before it is approved, the diff after it is written. `sonnet` at medium effort by default - one line of frontmatter raises it.
- **One doc checker**, the `drift` subagent, which keeps the layer true to the code without a manual pass: every claim a changed identifier touches is re-checked by a command and comes back as an exact `replace:` / `with:` pair, and after a bug fix it proposes the one rule line no doc had. Two modes: `diff` at lifecycle step 5, launched only when the main thread's grep finds a doc naming what changed or the task fixed a bug, and `section <name>` from `maintain-ai-layer`. Read-only, `sonnet` at medium effort.
- **One guard**, `guard.mjs`, the full layer's guard with its two test suites unchanged; the hook itself differs only in a comment noting that its `hunt` write fence only narrows `hunt`'s Bash movers here. It refuses: mutating git however the command is spelled, `gh` writes, shell writes and in-place edits into the tree, a copy or move into the tree, deletes beyond the one grant, `cd` outside a subshell, protected paths, dashes. It costs no tokens - it runs locally - which is why it is the one part that was not trimmed.
- **One reminder**, `upkeep-nudge.mjs` at session start: when the `maintain-ai-layer` pass is 14 days overdue (it reads the date the pass writes into the gitignored `.claude/.last-maintain`), the model tells you so in one line. Silent otherwise and in a linked worktree, so it costs tokens only on the day it speaks.
- **Four skills**: `maintain-ai-layer` (the layer's upkeep, one `references/<mode>.md` per mode: `weekly`, every week or two - dead references by `layer-refs.mjs`, rule globs that match nothing, wrong counts, always-on bytes in the main thread, plus at most three `drift` runs on the rules and the `CLAUDE.md` section the recent code changes reached; on request only, since each costs dozens of agent launches, `deep` - `drift` over every unit, the rule steps, consistency, hooks, memory and a walk of whole tasks through the lifecycle - and `rules` - each rule checked against the code, its reach measured with `git ls-files` for over- and under-reach, a rule whose sections serve different files split, new rules from a sweep of the code and its fix history; and `init`, right after the install and whenever the project has moved on - the `[fill]` sections of `CLAUDE.md` from facts found in the repo, the rule set built or updated and enriched with evidence for every line, `hunt` tuned to the project, with a survey as thorough as the full layer's, since every later session pays for a thin one), `debug` (root cause before any fix), `handoff` (`.claude/handoff.md`, for a `/compact`, a new session or a usage window that runs out), `retro` (only from its slash command, after a task: what went badly, each fix at the cheapest layer that would have caught it, each with a default - no subagent).

## What it drops, against the full layer

| Dropped | Why, and what carries the obligation instead |
| --- | --- |
| `gate` (static review agent) | the main thread runs the check command itself - one Bash call instead of a whole agent context |
| `twins`, `comments` | the sibling question is the `debug` skill's "who else does this", and `hunt` re-greps the consumers; comments are a `CLAUDE.md` rule |
| The review ladder (`crosscheck`) and the reachability bar | one rule: a non-trivial change gets `hunt`, a trivial one gets nothing |
| Session artifact folders, `compact-pointer.mjs` | a verdict written into the chat, and `handoff.md` when the session must survive |
| The Stop hook (`stop-check.mjs`) | it can cost an extra turn per block; the lifecycle's own step 3 and step 6 run the check command |
| `rules-reach.mjs`, `dev-servers.mjs`, `run-pure.mjs`, `verify-live` | project-specific machinery; `.claude/rules/*.md` with a `paths:` frontmatter still works, and `maintain-ai-layer` measures a rule's reach with `git ls-files` instead - no glob-shape check |
| `maintain-ai-layer`'s session-folder record and `crosscheck` review | a run keeps its findings in a scratchpad file and runs `handoff` when it may outlive the session; hooks and settings are reported, never edited |
| `drift`'s `decisions.md`, its `opus` / `high` default | light has no such file - a settled decision lives in `CLAUDE.md` Architecture; `sonnet` at medium effort is enough for claim-by-claim checks |
| `.claude/docs/decisions.md` | a decision a reviewer would re-file goes into `CLAUDE.md` Architecture as settled and deliberate, which `hunt` reads anyway |
| Probe compiling in the reviewer | needs per-project build config, allow-listed probe paths and a scratchpad project; the reviewer reads and reasons instead |

The full layer is the better tool when the budget is not the constraint: it catches more, in more places, at several times the token cost per task.

## Tuning it for cost

- **`CLAUDE.md` is the recurring bill.** Its 20 KB budget is roughly 5k tokens on every turn. Detail that only matters for some files goes into `.claude/rules/<name>.md` with a `paths:` frontmatter, which loads only when a matching file is read.
- **A subagent is the one-off bill**, tens of thousands of tokens per launch. The lifecycle spends two on a task with a plan, one without, zero on a trivial edit - plus one `drift` when a doc names what changed or a bug was fixed, and one scoped second `hunt` round when a fix is itself non-trivial. Saying "no subagents" moves the obligations to the main thread rather than dropping them.
- **The reviewer's model is one line** in `.claude/agents/hunt.md` (`model:`, `effort:`). Raise it for a release, lower it for a sweep.
- **`maintain-ai-layer` has one cheap mode.** `weekly` spends at most three launches; `deep` and `rules` spend dozens and run only when you ask. `init` is deliberately not cheap: a rule set built on a thin survey costs every later session more than the survey did.
- **Do not use `Workflow` or ultracode here.** They spawn agents by the dozen; that is the opposite of this layer.
