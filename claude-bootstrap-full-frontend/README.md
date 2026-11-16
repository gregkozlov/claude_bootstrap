# Claude Code working layer - full, for a frontend

A ready-made Claude Code setup for a **codebase with a UI** (a smaller plan takes [light-frontend](../claude-bootstrap-light-frontend/README.md), a server codebase [light-backend](../claude-bootstrap-light-backend/README.md)): one task lifecycle, one review ladder, guard hooks, and review agents with one job each.

> [!IMPORTANT]
> Paste the prompt below into Claude Code, opened in your project, with the path filled in. Run it on **Opus at high effort**: start with `claude --model opus --effort high`, or type `/model opus` and then `/effort high` in a running session. Allow the bootstrap folder when asked, or add it first with `/add-dir <path to this folder>`.

```text
Integrate the Claude Code working layer I unpacked at <path to this folder> into this project.

1. Read INSTALL.md in that folder first and follow it - it covers a first install and an update of a layer installed earlier.
2. Never overwrite what this project already has (CLAUDE.md, AGENTS.md, anything under .claude/): merge it, and say what happened to each file.
3. Read every value the layer needs from this repo; ask me in chat only what the repo cannot answer.
4. Change files only - no commits, no pushes.
5. Finish with the report INSTALL.md asks for, then tell me to restart Claude Code and run /maintain-ai-layer init.
```

The same prompt updates a layer installed from an older version of this bootstrap.

> [!NOTE]
> **Requirements**
> - **Claude Code**, recent enough that hook matchers know the `PowerShell` tool and agent files accept an `effort:` line.
> - **Node 18+** on `PATH`. The rule-reach check needs Node 20.17+ or 22.5+; from Node 22.18 the probe runner also imports TypeScript directly.
> - **git**, and on Windows **Git Bash**: the command blocks in `INSTALL.md` are bash.
> - Optional: the **Claude in Chrome** extension, for the browser check. Without it the check stays off, and every change that renders reports "unverified - browser check off".
> - Optional: **TypeScript** in the project, for the compile probe of `hunt`. Without it `hunt` cannot test whether a wrong call compiles, and reasons about types instead.

## Install

1. Download this repository (Code > Download ZIP, or `git clone`) and unpack it anywhere **outside** your project. You need one folder of it: `claude-bootstrap-full-frontend`.
2. Open Claude Code in your project as the box above says, and paste the prompt. `--add-dir` saves only the prompts for reading the bootstrap. Each copy still asks once - about 34 for this layer.
3. Its first question is where the layer lives in git (table below). After that it asks only what the repo cannot answer - usually whether "never commit" stays and whether the browser check is on, and the check command if the project has none.
4. Restart Claude Code, then run `/maintain-ai-layer init`. It writes the project sections of the layer's `CLAUDE.md`, builds the path-scoped rules from your code, and tunes the agents and skills to the project.

**Where the layer lives:**

| Mode | What you get |
| --- | --- |
| **Personal, own repo** (recommended) | The whole layer in `.claude/`, hidden from the project's git by `.git/info/exclude`, and `.claude/` is your own git repo - history and a backup, and `git clean` or `git stash -a` in the project cannot delete it. Create a private repo and push the layer there; the install prints the commands. |
| **Personal, no history** | The same, without the repo. |
| **Team** | The layer is committed with the project, in the root `CLAUDE.md` and `.claude/`. |

You can also describe any other arrangement in your own words. A personal layer does not follow into a new `git worktree` - for your own repo, clone it into the new tree's `.claude/`.

> [!WARNING]
> In team mode the rules apply to everyone who uses Claude Code in the repo - agree it with the team first. The install makes the layer committable but commits nothing.
>
> The hooks are Node scripts: without `node` on PATH they do not run.

Left to you after `init`:

- **The marker endpoint** the browser check reads, so it can prove which dev server it is looking at. `examples/tree-marker-plugin.ts` is the Vite version. It is a source change, so no model writes it unasked; switch `Browser check:` in the layer's `CLAUDE.md` to `on` once it answers.
- **Feeding `hunt.md`** the bugs that surface after a review. `examples/hunt-example.md` shows what a fed list of attack angles looks like.

## What a task looks like

Say you ask for "a date-range filter on the orders page":

1. Claude reads the code and names the class: a **bounded** change. A change to a shared contract would go through plan mode instead; a bug report through `debug`.
2. It lists every consumer of what it will touch, then loads the `lifecycle` skill and edits.
3. It picks the review **tier** from the ladder and names the trigger - here tier 2, a date boundary.
4. `twins` looks for the same pattern elsewhere and `comments` trims the new comments, in parallel.
5. The check command passes, then `gate` and `hunt` review in parallel. Each finding is accepted or rejected, with a reason, in the session's task file.
6. The browser check looks at the page in your running app, or reports "unverified - browser check off".
7. Claude fixes the docs the change made false, lists what stays unverified and every decision it took for you, runs the check once more, and proposes three commit subjects.
8. You review the diff and commit. The layer never commits.

## What it costs

Agents launched per task. Any task may also start one `Explore` to survey an unfamiliar area, and an agent your project adds (a translations owner, say) runs when its own condition fires.

| Task | Agents | Launches |
| --- | --- | --- |
| Super-trivial edit (tier 0) | none | 0 |
| Bounded change, tier 1 | `twins`, `comments`, `gate` | 3, or 4 with a second round |
| Bounded change, tier 2 | `twins`, `comments`, `gate`, `hunt` | 4, or 6 with a second round |
| Planned or contract change, tier 3 | `hunt` on the plan; `twins`, `comments`; `gate`, `hunt`; `drift` | 6, or 8 with a second round |
| Bug fix | `debug` (a skill, no agent), then the tier of the fix | as that tier; a wrong displayed number is never tier 0 |

A second round runs only when a fix changed logic beyond what a reviewer prescribed: `gate` again, plus `hunt` when the fix answers a `hunt` finding. There is never a third.

| Agent | Model | Effort |
| --- | --- | --- |
| `gate`, `hunt`, `twins`, `drift` | Opus | high |
| `comments` | Sonnet | high |
| `Explore`, `general-purpose` | Claude Code's built-in default | built-in default |

`/maintain-ai-layer` runs every agent it launches on Sonnet:

| Mode | Launches |
| --- | --- |
| `init`, first run | 4 survey agents; then one per code area of up to ~250 source files, one for the root config files and one reading the fix history; then one per new rule family |
| `init`, later runs | 4 survey agents; one `drift` per rule; one per rule family; 4 looking for rules the code needs |
| `deep` (monthly) | 1 count check; one `drift` per unit (each `CLAUDE.md` section, rule, agent, skill and doc), eight at a time; one per rule family; 4 looking for rules; 2 walking whole tasks |

## When a hook stops you

> [!TIP]
> A refusal from `guard.mjs` is a message, not a crash. It starts with `Blocked by .claude/hooks/guard.mjs:` and names the rule it enforces.
>
> - **Read the reason.** It names the `CLAUDE.md` section behind the refusal and, where there is one, the form to retry with - a subshell `(cd <tree> && ...)`, `Edit` instead of `sed -i`. Claude usually retries on its own.
> - **Run it yourself when it is yours to run.** A commit, a push or a branch switch is the owner's. Type `! <command>` in the prompt: it runs in your shell, and the hooks do not judge it.
> - **A blocked turn end** is the Stop hook: the check command failed after the turn's edits. Claude gets the output and continues once.
> - **Switching a rule off**: `.claude/hooks/README.md` says how, for "never commit" and the `cd` rule. The plain-hyphen rule has no off-switch.

## What is in it

- **One lifecycle** of nine steps. Steps 1-2 sit in `CLAUDE.md` (Development Workflow), because they run before and inside plan mode. Steps 3-9 sit in the `lifecycle` skill, loaded once step 2 closes: implement, the editor batch, review, browser check, docs, the unverified list, one final check.
- **One review ladder** in the `crosscheck` skill, picked by triggers, not by counting. Tier 0 has no reviewer, tier 1 `gate`, tier 2 `gate` + `hunt`, tier 3 adds `hunt` on the plan and `drift` at the end. `init` tunes the triggers to the classes that produced a bug in your project.
- **The reachability bar** in `CLAUDE.md`. A defect counts only when one real user reaches it through the interface in ordinary work, with a stated click path. The cases out of scope are named, so reviewers stop spending rounds on them.
- **One browser ritual** in the `verify-live` skill. It finds the port your dev server listens on, confirms through the marker endpoint that it is this checkout's server, and reads the page before clicking anything. `dev-servers.mjs` runs on Windows, macOS and Linux (`lsof` / `ps` off Windows, `ss` as the Linux fallback).
- **A folder per session** under `.claude/sessions/`, ignored by git. It holds one task file per task (the Brief, the findings and their decisions, the open risks) and the `precompact` handoff. `compact-pointer.mjs` names it at session start and carries it across a compaction.
- **Hooks** in `.claude/hooks/`. `guard.mjs` refuses git writes, `gh` writes, shell edits and copies into the tree, a delete of more than one file per call, a top-level `cd`, edits to generated files, and dash characters - before the call runs. `stop-check.mjs` runs the check command when a turn changed the tree, and blocks once on a failure. `upkeep-nudge.mjs` asks for `/maintain-ai-layer` when it is 30 days overdue.
- **Agents with fences.** `gate` reviews against the Brief and the conventions; `hunt` hunts runtime defects, each a traced scenario; `twins` finds the same pattern elsewhere; `drift` checks docs against code; `comments` cuts comments. Only `comments` edits, and only comment text; `hunt` writes nothing but its compile probe.
- **Rule reach.** `.claude/scripts/rules-reach.mjs` measures which files each path-scoped rule loads for, because a rule that does not load where its code lives does not exist. The template ships no rule: `init` builds the set from your code.
- **Settled decisions** in `.claude/docs/decisions.md`: the won't-dos, rejected fixes and verified-clean claims. Every reviewer greps it, and a match is reported as settled instead of re-filed. The entries are the owner's.
- **Skills**: `lifecycle`, `crosscheck`, `debug` (root cause before any fix), `verify-live`, `precompact` (the handoff file), `retro` (on request, numbered improvements from the session) and `maintain-ai-layer`. Its modes: `deep` (the default, monthly), `rules` (the rule set alone) and `init` (the project parts after an install).

## Verify

Each case line reads `ok` and each suite ends with `N passed, 0 failed`.

- Guard: `node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs`. The shell suite needs `<SRC_DIR>` filled: an unfilled `<...>` reads as a redirect.
- Upkeep reminder: `node .claude/hooks/tests/upkeep-nudge-test.mjs`.
- Rule reach: `node .claude/scripts/rules-reach.mjs --check` ends with `0 over budget, 0 rule shape problems`.
- References: `node .claude/skills/maintain-ai-layer/layer-refs.mjs` - every hit explained.
- Stop hook: edit a source file and end the turn with the check command failing. The turn is blocked once with the output, and a second Stop on the same tree state stays quiet.
- `run-pure.mjs`: a probe importing `<SRC_DIR>/<module>` runs under Node with the alias resolved and `window` shimmed.

## Glossary

| Term | Meaning |
| --- | --- |
| Lifecycle | The nine steps every non-trivial task runs, from investigating to the final check. |
| Brief | The task as asked, what the screenshots show, the decisions and assumptions - at the top of the plan and the task file, so agents that never see images get it. |
| Tier, ladder | The review level a change gets, 0 to 3, picked by triggers in `crosscheck`. |
| `gate` | Static reviewer: does the change do what the Brief asks, by the project's conventions. |
| `hunt` | Runtime-defect hunter: every finding a concrete failing scenario with its click path. |
| `twins` | Finds code that does the same thing elsewhere and needs the same change. |
| `drift` | Checks documentation claims against the code. |
| Reachability bar | A defect counts only when a real user reaches it in ordinary work. |
| Not pursued | The one-line list where a reviewer puts what falls below the bar or is already settled. |
| `[fill]` | A section of the template only the project can write; `init` fills it. |
| Rule reach | The files a path-scoped rule loads for, measured by `rules-reach.mjs`. |

## Placeholders

`INSTALL.md` has the model fill these in every template file that carries them, reading each from the repo; its table says where.

| Placeholder | Meaning | Example value |
| --- | --- | --- |
| `<PROJECT>` | project name | `stockroom` |
| `<STACK>` | the stack in one line, goes into the agents' first sentence | `React + TypeScript on Vite, ...` |
| `<SRC_DIR>` | source directory, no trailing slash; also the import alias `run-pure.mjs` resolves | `src` |
| `<CHECK_COMMAND>` | the one verification call; the lifecycle, the Stop hook and the allow list use it | `npm run check` |
| `<DEV_PORT_RANGE>` | ports `dev-servers.mjs` scans | `5173-5179` |
| `<DEV_BASE_PATH>` | the app's base path with both slashes; the marker lives at `<DEV_BASE_PATH>__tree` | `/stockroom/` |
| `<GENERATED_PATHS>` | JSON array of regex sources the guard refuses to edit, forward slashes | `["src/api/[^/]+/generated/", "\\.openapi\\.json$"]` |

## The folders

```
README.md       this file
INSTALL.md      the install and update procedure - read by the model, not copied into the project
MAINTAINERS.md  for whoever changes the layer: writing rules, Claude Code facts it relies on, the guard's known gaps
template/       what a project receives (CLAUDE.md, .claude/*)
examples/       project-specific pieces, rewritten onto one invented app
```

`examples/` is reference only: copy one by hand when it fits. Each is rewritten onto one invented app - Stockroom, an inventory analytics frontend (React + TypeScript on Vite, en / fr) - so its names, endpoints and decisions are illustrations, not facts to copy.

- `i18n.md` - an editor agent fenced to one artefact, with its checker `i18n-check.mjs`.
- `hunt-example.md` - a fed list of attack angles.
- `rule-queries.md` - a path-scoped rule written by class, with narrowed globs.
- `decisions-example.md` - a filled `.claude/docs/decisions.md`.
- `verify-live-example.md` - the browser ritual with real endpoints.
- `tree-marker-plugin.ts` - the Vite marker endpoint.
