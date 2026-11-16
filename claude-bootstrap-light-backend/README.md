# Claude Code working layer - light, for a backend

A working layer for Claude Code - rules, two review agents and guard hooks - for a server codebase in any language (Java, .NET, Python, Node, Go and the rest), sized for a ~20 USD plan. Terms: [Glossary](#glossary).

> [!IMPORTANT]
> Run the prompt below in Claude Code on Opus at high effort: `claude --model opus --effort high`, or `/model opus` and then `/effort high` in a running session. Allow this folder too: start with `--add-dir "<path to this folder>"`, or run `/add-dir <path to this folder>` first.

```text
Integrate the Claude Code working layer I unpacked at <path to this folder> into this project.

1. Read INSTALL.md in that folder first and follow it - it covers a first install and an update of a layer installed earlier.
2. Never overwrite what this project already has (CLAUDE.md, AGENTS.md, anything under .claude/): merge it, and say what happened to each file.
3. Read every value the layer needs from this repo; ask me in chat only what the repo cannot answer.
4. Change files only - no commits, no pushes, no migration applied, no service started.
5. Finish with the report INSTALL.md asks for, then tell me to restart Claude Code and run /maintain-ai-layer init.
```

> [!NOTE]
> **Requirements**
> - **Claude Code**, a release recent enough to know the `PowerShell` tool and to read `effort:` in agent frontmatter: the hooks and the agents rely on both.
> - **Node 18 or newer** on the PATH, whatever the service is written in. The hooks are Node scripts: without `node` on PATH they do not run.
> - **git** on the PATH.
> - **On Windows, Git Bash**: the command blocks in `INSTALL.md` are bash.

## Install

1. Download this repository (Code > Download ZIP, or `git clone`) and unpack it anywhere **outside** your project. You need one folder of it: `claude-bootstrap-light-backend`.
2. Open Claude Code at the repository root of your project as the box above says, and paste the prompt with the path filled in. `--add-dir` saves only the prompts for reading the bootstrap. Each copy still asks once - about 22 for this layer.
3. The install first asks where the layer lives in git (below), then asks only what the repo cannot answer - usually the check command and whether "never commit" and the local-only rules stay.
4. When it is done, restart Claude Code with the same flags, then run `/maintain-ai-layer init`. It writes the project sections of `CLAUDE.md`, builds the path-scoped rules from your code and tunes `hunt` to the project.

The same prompt updates a layer installed from an older version. Neither the install nor `init` starts your service, applies a migration or reads an env file. Each runs your check command once, and only when the database or containers it needs are already up. One layer per repo: a repo with both a server and a UI takes the layer that matches where the risk is.

**Where the layer lives:**

| Mode | What it means |
| --- | --- |
| **Personal, own repo** (recommended) | the whole layer in `.claude/`, excluded from the project's git, and `.claude/` becomes your own git repo once you run the five commands the install prints (`git init`, a first commit, a push to a private repo you create). Until then it has no history, and `git clean -x` or `git stash -a` can delete it. |
| **Personal, no history** | the same, without the nested repo |
| **Team** | committed with the project, the root `CLAUDE.md` merged |

You can also describe any other arrangement in your own words. A personal layer does not follow into a new `git worktree` (own repo: clone it into the new tree's `.claude/`).

> [!WARNING]
> In team mode the rules apply to everyone who uses Claude Code in the repo - agree it with the team first. The personal modes touch no file the project's git tracks.

## What a task looks like

1. You describe the task in chat, with the logs, stack traces or screenshots you have.
2. Claude names the class: a question, a bounded change, a contract change (an endpoint, a schema, a payload, a config key) or a bug report.
3. A bug report goes through the `debug` skill first: reproduce it locally, find the first boundary where the value goes wrong, name the cause.
4. A contract change goes through plan mode, and `hunt` reviews the plan before you approve it.
5. Claude implements, walks the callers it listed, runs your check command and exercises the changed path once against a local instance.
6. `hunt` reviews the diff. Claude checks each finding against the code and accepts or rejects it with a reason.
7. Claude greps the docs for what changed, and launches `drift` only when a doc names it.
8. The reply closes with what stays unverified, the decisions taken for you, what you must do by hand (apply a migration, set a variable) and three commit subjects. You commit.

## What it costs

`CLAUDE.md` is the recurring bill: it loads on every turn, so it stays under 20 KB (about 5k tokens). A personal layer beside a team root `CLAUDE.md` loads both. Detail that only some files need goes into `.claude/rules/<name>.md` with a `paths:` frontmatter, which loads with those files. An agent launch is the one-off bill, tens of thousands of tokens each.

| Task | Agent launches | Which |
| --- | --- | --- |
| Trivial edit (one file, obvious, low risk) | 0 | - |
| Bounded change | usually 1, at most 4 | `hunt` on the diff; extras: a scoped second `hunt` round when a fix is itself non-trivial, `drift` when a doc names what changed, `Explore` for an unfamiliar area |
| Planned or contract change | usually 2, at most 5 | `hunt` on the plan and on the diff, plus the same extras |
| Bug fix | usually 1-2, at most 5 | as the class `debug` ends in; the gap check (the one rule line the bug shows no doc had) runs in the main thread and adds no launch |

| Agent | Model and effort | Where it is set |
| --- | --- | --- |
| `hunt` | `sonnet`, medium | its frontmatter in `.claude/agents/hunt.md` |
| `drift` | `sonnet`, medium | its frontmatter in `.claude/agents/drift.md` |
| `Explore` in a task | Claude Code's built-in default | - |
| every agent `maintain-ai-layer` launches | `sonnet` (`drift` keeps its own effort) | `maintain-ai-layer/SKILL.md` |

| Upkeep | When | Agent launches |
| --- | --- | --- |
| `/maintain-ai-layer init` | once after the install, and when the project has moved on | 5 survey agents (4 `Explore`, 1 `general-purpose`); then, with no rule yet, one `general-purpose` per area of about 250 source files, one for the migrations and schema files, one for the root config files and one on the fix history, and one per new rule family (a rule and the sibling rules split off it) to check its reach |
| `/maintain-ai-layer deep` - also what a bare `/maintain-ai-layer` runs once `CLAUDE.md` has no `[fill]` line left; until then it runs `init` | about once a month, when the reminder says so | one `drift` per unit (each `CLAUDE.md` section, rule, agent, skill, the hooks README, each source-folder README), the `rules` steps (next row), and 2 `general-purpose` walkers - dozens in all |
| `/maintain-ai-layer rules` | on request | one `drift` per rule, one `general-purpose` per rule family, and 4 more (3 `Explore`, 1 `general-purpose`) for new rules; with no rule yet, the `init` build above |

To spend less: say "no subagents" for a task - the main thread then carries the review and docs obligations itself. To spend more on a risky change, raise `model:` or `effort:` in `.claude/agents/hunt.md`. Do not run `Workflow` or ultracode here: they spawn agents by the dozen.

## When a hook stops you

> [!TIP]
> - **A refusal** reads `Blocked by .claude/hooks/<hook>.mjs: ...`. It names the rule and the form that works, and Claude usually retries in that form by itself.
> - **A question** comes from `backend-guard` before a command that wipes data, prints a secret from a cluster or a cloud secret store, or reaches another host. It arrives as a permission prompt, in auto mode too. Approve it only if you asked for exactly that command.
> - **A command that is yours to run** - a deploy, a migration on staging, a push - you run yourself: type `! <command>` in the Claude Code prompt.
> - **To switch a rule off** for good, `.claude/hooks/README.md` "Switching a rule off" names every place it lives. The hyphen rule has no switch.

## What the guards cannot do

`backend-guard.mjs` reads the text of one call. It does not see a script file or a task-runner target that runs a forbidden command, SQL in a file handed to a database client, or a secret printed from the process environment. It cannot tell which database a connection string points at, and its deploy list is closed: a tool it does not name goes into the project's forbidden list at install. Its lists err on the strict side - an env file with no secret in it is refused until its pattern is narrowed. The rules in `CLAUDE.md` cover what the hook cannot see. The strongest protection is outside the layer: keep credentials for shared environments off the machine the agent works on.

## What is in it

- **One lifecycle, six steps** (`CLAUDE.md`, Development Workflow), as above. A trivial edit skips the review and the docs check; a migration, a query that writes, a permission check or money arithmetic never counts as trivial.
- **Four standing rules a server needs** (`CLAUDE.md`, Data, secrets and the outside world). The agent edits code anywhere, but what it **runs** reaches only this machine: localhost, a container, a test database, an emulator. A migration on the default branch is frozen, so a schema change is a new one. A secret is never read, printed or written. Nothing leaves the machine: no deploy, no publish, no message to a real recipient.
- **Where the local env file points** is the one thing the agent cannot read. `init` asks you once and writes the answer into `CLAUDE.md`; until then, the agent asks before the first command that touches a store.
- **The reachability bar** (`CLAUDE.md`, Working Principles): a defect counts only when a real caller reaches it through an endpoint, a consumer or a job, and every finding names that path. Two requests at once, a retry, a redelivery, hostile input, a restart mid-write and several instances of the service are always in scope. A dependency answering outside its contract and data no code path can produce are out.
- **One reviewer**, the `hunt` subagent: runtime defects only, each a concrete request or state traced through the real code the change calls. Its attack angles are a server's - input, authorization and tenancy, transactions and concurrency, stored data, queries and load, partial failure, numbers and time, contracts with callers. The project feeds it with its own bugs.
- **One doc checker**, the `drift` subagent: it re-checks every doc claim a changed identifier touches and returns exact `replace:` / `with:` pairs. After a bug fix the main thread runs its gap check itself, to propose the one rule line no doc had.
- **Two guard hooks**, local and free of tokens. `guard.mjs` refuses git commands that commit, push or discard work, shell writes into the tree, broad deletes, `cd` outside a subshell, edits of generated files and dash characters. `backend-guard.mjs` refuses reading a secret file, editing a frozen migration and any command that deploys or publishes. It **asks you** before a command that wipes data, prints a secret from a cluster or a cloud secret store, or opens a shell on another host. `.claude/hooks/README.md` has the full lists.
- **One reminder**, `upkeep-nudge.mjs`: at session start, once the last upkeep pass is 30 days old, Claude tells you in one line that `/maintain-ai-layer` is due.
- **Four skills.** `debug` finds the root cause before any fix, reproduces it locally and names the data the bug already damaged. `handoff` writes `.claude/handoff.md` for a `/compact` or a new session. `retro` runs only from its slash command. `maintain-ai-layer` keeps the layer true to the code: `deep` monthly, `rules` and `init` on request.

The layer has no test policy of its own. `CLAUDE.md` has a Tests section that `init` fills with the project's convention, and the layer follows it.

## Verify

In the project, after the install and after every edit to a hook or one of its lists:

```bash
node .claude/hooks/tests/guard-test.mjs
node .claude/hooks/tests/guard-shell-test.mjs
node .claude/hooks/tests/backend-guard-test.mjs
node .claude/hooks/tests/upkeep-nudge-test.mjs
node .claude/skills/maintain-ai-layer/layer-refs.mjs
```

Each case line reads `ok` and each suite ends with `N passed, 0 failed`. `layer-refs.mjs` lists every skill, agent and path a layer doc names that does not resolve; each hit is fixed or explained.

## Glossary

| Term | Meaning |
| --- | --- |
| lifecycle | the six steps every non-trivial task runs, in `CLAUDE.md` Development Workflow |
| check command | the one command that runs every check the project has - `./gradlew check`, `mvn verify`, `dotnet test`, `make check`, a task-runner target that chains linting and tests; the install finds it, or proposes one |
| contract change | a change to what a caller relies on - an endpoint, a schema, a message payload, a config key; it goes through plan mode |
| `hunt` | the review agent: runtime defects only, each with a concrete failing request; it reviews the plan and the diff |
| `drift` | the doc checker: it finds doc statements the code no longer matches and returns exact replacements |
| `gate`, `twins` | review agents of the full frontend layer that this layer leaves out; `hunt` and the main thread carry their checks |
| tier, ladder | the full layer picks reviewers by a ladder of tiers; this layer has one tier - `hunt` on every non-trivial change |
| reachability bar | the line between a defect and a hypothetical: a real caller must reach it through the service's own entry points |
| Not pursued | the one-line slot for a borderline case, `file:line - scenario - why unlikely`, with no fix and no extra round |
| `[fill]` | a section of `CLAUDE.md` the project writes; `/maintain-ai-layer init` fills it from the repo |
| rule reach | the files whose Read loads a path-scoped rule (`.claude/rules/*.md` with `paths:`), measured with `git ls-files` |
| frozen migration | a migration on the upstream default branch (with no remote, any one git tracks); `backend-guard` refuses to edit, move or delete it |

Maintaining the bootstrap itself - how it differs from the light frontend layer and which files must stay identical with it - is in [MAINTAINERS.md](MAINTAINERS.md).
