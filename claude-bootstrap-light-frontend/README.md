# Claude Code working layer - light, for a frontend

A small working layer for Claude Code in a codebase with a UI, sized for a ~20 USD plan.

> [!IMPORTANT]
> Run the install in Claude Code on **Opus at high effort**: `claude --model opus --effort high` (or `/model opus`, then `/effort high`). Allow this folder too: start with `--add-dir <path to this folder>`, or run `/add-dir <path to this folder>` first. Then paste this prompt, with the path filled in:

```text
Integrate the Claude Code working layer I unpacked at <path to this folder> into this project.

1. Read INSTALL.md in that folder first and follow it - it covers a first install and an update of a layer installed earlier.
2. Never overwrite what this project already has (CLAUDE.md, AGENTS.md, anything under .claude/): merge it, and say what happened to each file.
3. Read every value the layer needs from this repo; ask me in chat only what the repo cannot answer.
4. Change files only - no commits, no pushes.
5. Finish with the report INSTALL.md asks for, then tell me to restart Claude Code and run /maintain-ai-layer init.
```

> [!NOTE]
> **Requirements**
> - **Claude Code**, recent enough that hooks accept the `PowerShell` matcher and agents read `effort:` from their frontmatter (`claude update`).
> - **Node 18 or later.** The hooks are Node scripts: without `node` on PATH they do not run.
> - **git.** Without a repository the layer still works, but the docs check loses its file list.
> - **Git Bash on Windows.** The install runs its command blocks in bash.

## Install

1. Download this repository (Code > Download ZIP, or `git clone`) and unpack it **outside** your project. You need one folder of it: `claude-bootstrap-light-frontend`.
2. Open Claude Code in your project as the box above says, and paste the prompt. `--add-dir` saves only the prompts for reading the bootstrap. Each copy still asks once - about 20 for this layer.
3. The install first asks where the layer lives in git (below), then copies and fills it.
4. When it is done, restart Claude Code and run `/maintain-ai-layer init`. It writes the project sections of the layer's `CLAUDE.md`, builds path-scoped rules from your code and tunes `hunt` to the project.

The same prompt updates a layer installed from an older version of this bootstrap, keeping its mode. Opus is recommended for the install and `init`; daily work runs on the model you pick, and the layer's agents on Sonnet.

**Where the layer lives**

| Mode | What you get |
| --- | --- |
| **Own repo** (recommended) | the whole layer in `.claude/`, hidden from the project's git and kept in a git repo of its own - history, a backup, and safe from `git clean` and `git stash -a`. Create a private repo and push the layer there; the install prints the commands. |
| **Personal** | the same, without history |
| **Team** | committed with the project: everyone who uses Claude Code in the repo gets it |

You can also describe any other arrangement in your own words. A personal layer does not follow into a new `git worktree` - for an own repo, clone it into the new tree's `.claude/`.

> [!WARNING]
> In team mode the rules apply to everyone who uses Claude Code in the repo - agree it with the team first. The install makes the layer committable but commits nothing.

## What a task looks like

You ask for a change in plain words, with screenshots if you have them. Then:

1. Claude reads the code, names the task's class (spike, bounded, contract change, bug) and asks what is unclear.
2. A contract change goes through plan mode, and `hunt` reviews the plan before you approve it.
3. Before the first edit, Claude lists every consumer of what it will change.
4. It implements and runs your check command once.
5. `hunt` reviews the diff. Claude checks each finding and accepts or rejects it with a reason.
6. It greps the docs for what changed; `drift` runs only when a doc names it.
7. It closes with what stays unverified, the decisions it took for you and three commit subjects. You commit.

A bug report starts with the `debug` skill (reproduce, gather evidence, name the cause) and then follows the same steps.

## What it costs

**In short:** a trivial edit launches no agent, a normal task 1-2 (at most 5), and the monthly upkeep about 35. That upkeep run is the largest single bill the layer asks for - start it when your usage window has room.

There are two bills. **`CLAUDE.md` is paid on every turn**: the template is about 12 KB, and its budget is 20 KB (roughly 5k tokens). **An agent launch is paid once** but rebuilds its context from nothing, so it is the expensive unit. The table counts launches per task.

| Task | Agent launches | Which |
| --- | --- | --- |
| Super-trivial edit (one file, obvious, low risk) | 0 | none |
| Bounded change (known files, one surface) | usually 1, at most 4 | `hunt` on the diff; extras below |
| Contract change (plan mode) | usually 2, at most 5 | `hunt` on the plan and on the diff; extras below |
| Bug fix | as its class above | `debug` and the missing-rule check run in the main thread |
| Any task under "no subagents" | 0 | the main thread does every step itself |

The extras, each at most once: a second `hunt` round when a fix is itself non-trivial, `drift` when a doc names what changed, `Explore` when step 1 must sweep an unfamiliar area.

| Agent | Model | Effort | Set where |
| --- | --- | --- | --- |
| `hunt` | sonnet | medium | `.claude/agents/hunt.md` frontmatter |
| `drift` | sonnet | medium | `.claude/agents/drift.md` frontmatter |
| `Explore`, `general-purpose` | Claude Code's default in a task; Sonnet in upkeep | Claude Code's default | `maintain-ai-layer` passes `model: "sonnet"` |

**Upkeep is the big launch bill.** Every agent `maintain-ai-layer` starts runs on Sonnet, and nothing runs until you type the command.

| Run | When | Launches |
| --- | --- | --- |
| the install | once | none - it runs in the main thread |
| `init` | once after the install, again when the project has moved on | 4 survey agents (3 `Explore`, 1 `general-purpose`). With no rules yet, 1 `general-purpose` per area of up to ~250 source files, 1 for root config, 1 on the fix history and 1 per rule family. About 15 for a 1,000-file project. |
| `deep` (the default) | about once a month - a session-start reminder tells you when | 1 `drift` per unit: 12 `CLAUDE.md` sections, each rule, 2 agents, 4 skills, the hooks README, each README in the source tree. Then 1 `general-purpose` per rule family, 4 for new-rule search, 2 for a workflow walk. About 35 with five rules. |
| `rules` | when you ask | 1 `drift` per rule, 1 `general-purpose` per rule family, 4 for new-rule search |

To spend less:

- Keep `CLAUDE.md` lean. Detail that only some files need goes into `.claude/rules/<name>.md` with a `paths:` frontmatter, which loads only when a matching file is read.
- Change a reviewer's model or effort in one line of its frontmatter: raise it for a release, lower it for a sweep.
- Say "no subagents" for a task you will review yourself; the steps still run, in the main thread.
- Do not use `Workflow` or ultracode here. They spawn agents by the dozen.

## When a hook stops you

> [!TIP]
> The `guard` hook blocks a tool call that breaks a rule, and its message says which rule and why.
> - **Read the reason first.** Most messages also name the form to retry with, such as `(cd <dir> && cmd)` instead of `cd`, or Edit instead of `sed -i`. Claude should retry that way by itself.
> - **When the command is yours to run** - a commit, a push, a delete the layer refuses - type it yourself as `! <command>` in the prompt.
> - **To switch a rule off** for the whole project, `.claude/hooks/README.md` "Switching a rule off" lists every place it lives. The plain-hyphen rule has no off-switch.

## What is in it

| Part | What it does |
| --- | --- |
| `CLAUDE.md` | the working rules, the six-step lifecycle and `[fill]` sections that `init` writes for your project |
| `hunt` agent | the one reviewer: runtime defects only, each with a concrete failure scenario, on the plan and on the diff |
| `drift` agent | the doc checker: re-checks every doc claim a change touches and returns exact replacements |
| `guard.mjs` hook | refuses commits and pushes, shell writes into the tree, `cd` outside a subshell, protected paths and dashes; runs locally, no tokens |
| `upkeep-nudge.mjs` hook | at session start, says once when the monthly upkeep is due; silent otherwise |
| `debug` skill | root cause before any fix, for every defect report |
| `handoff` skill | writes `.claude/handoff.md` before a `/compact`, a new session or a usage window running out |
| `retro` skill | only from `/retro`: what went badly in a task and the cheapest fix for each |
| `maintain-ai-layer` skill | the upkeep: `deep`, `rules` and `init` |

The [full-frontend](../claude-bootstrap-full-frontend/README.md) layer catches more, in more places, at several times the token cost per task. A server codebase takes [light-backend](../claude-bootstrap-light-backend/README.md).

## Verify

After the install, and after any edit to a hook, run these from the project root:

```bash
node .claude/hooks/tests/guard-test.mjs
node .claude/hooks/tests/guard-shell-test.mjs
node .claude/hooks/tests/upkeep-nudge-test.mjs
node .claude/skills/maintain-ai-layer/layer-refs.mjs
```

Each case line reads `ok` and each suite ends with `N passed, 0 failed`. `layer-refs` lists each path, script, skill or agent name in the docs that does not resolve.

## Glossary

| Term | Meaning |
| --- | --- |
| lifecycle | the six steps every non-trivial task runs, in `CLAUDE.md` "Development Workflow" |
| `hunt` | the review agent; it looks for runtime defects in a plan or a diff |
| `drift` | the doc-check agent; it finds doc statements a change made false |
| `gate`, `twins` | review agents of the full layer; this layer has neither |
| tier, ladder | the full layer's graded review policy; here one rule replaces it - a non-trivial change gets `hunt` |
| reachability bar | a defect counts only when one real user reaches it in ordinary work, with a stated click path |
| Not pursued | the one-line list for borderline cases: no severity, no fix, no extra round |
| `[fill]` | a project-specific part of a template file, written by `/maintain-ai-layer init` |
| rule | a `.claude/rules/*.md` file that loads only when Claude reads a file its `paths:` match |
| rule reach | the set of files whose reading loads a rule, measured with `git ls-files` |

How the layer is built, and what it drops against the full one: [MAINTAINERS.md](MAINTAINERS.md).
