# Claude Code working layer - light, for a backend

The light layer of `../claude-bootstrap-light-frontend`, retargeted at a **server codebase in any language**: an HTTP or RPC service, a worker, a job runner - Python, Go, Java, C#, PHP, Ruby, Rust, Node. Same budget and the same shape: built for a **20 dollar plan**, one lifecycle, **at most three agent launches per task** - `hunt` on the plan and on the diff, `drift` on the docs only when a doc names what changed or a bug was fixed (plus a scoped second `hunt` round when a fix is itself non-trivial, and an `Explore` when step 1 has to sweep an unfamiliar area) - and a `CLAUDE.md` held under 20 KB because it is paid for on every turn. What changes is what the layer is afraid of: not a stale closure or a form that loses its input, but a dropped table, an edited migration, a leaked key, a request that two callers send at once.

```
README.md      this file
INSTALL.md     the install and update procedure - read by the model, not copied into the project
template/      what a project receives (CLAUDE.md, .claude/*)
```

**It needs Node 18+ and git on the path, whatever the service is written in**: the hooks are Node scripts with no dependencies. A repo that holds both a server and a UI takes the layer that matches where the risk is; never two layers in one repo.

## Install

1. Download this repository (Code > Download ZIP, or `git clone`) and unpack it anywhere **outside** your project. You need one folder of it: `claude-bootstrap-light-backend`.
2. Open Claude Code in your project, preferably on Opus at high effort (`claude --model opus --effort high`, or `/model opus` and `/effort high` in a running session): the install reads your repo and merges with whatever Claude config you already have. It is a one-off cost; the layer runs cheap afterwards.
3. Paste the prompt below with the path filled in. If Claude Code asks to read the unpacked folder, allow it (or add it first with `/add-dir <path>`).
4. When it is done, restart Claude Code and run `/maintain-ai-layer init`: it writes the project sections of `CLAUDE.md`, builds the path-scoped rules from your code and tunes `hunt` to the project.

The same prompt updates a layer installed from an older version of this bootstrap. Neither the install nor `init` starts your service, applies a migration or reads an env file; each runs your check command once, and only when the database or containers it needs are already up.

```text
Integrate the Claude Code working layer I unpacked at <path to claude-bootstrap-light-backend> into this project.

1. Read <path>/INSTALL.md first and follow it - it covers a first install and an update of a layer installed earlier.
2. Never overwrite what this project already has (CLAUDE.md, AGENTS.md, anything under .claude/): merge it, and say what happened to each file.
3. Read every value the layer needs from this repo; ask me in chat only what the repo cannot answer.
4. Change files only - no commits, no pushes, no migration applied, no service started.
5. Finish with the report INSTALL.md asks for, then tell me to restart Claude Code and run /maintain-ai-layer init.
```

## What is in it

- **One lifecycle, six steps** (`CLAUDE.md`, Development Workflow): classify, the consumer walk plus a plan review, implement and exercise the changed path once, one review pass, the docs check, close with what stays unverified, what was decided on the user's behalf, what the owner must do by hand (apply a migration, set a variable) and three suggested commit subjects. A **contract change** - an endpoint, a schema, a message payload, a config key - goes through plan mode, and its consumer list names the callers the repo cannot show. Bug reports enter through the `debug` skill.
- **Four standing rules a server needs** (`CLAUDE.md`, Data, secrets and the outside world): the agent edits code anywhere, but what it **runs** reaches only this machine - localhost, a container, a test database, an emulator; a committed migration is frozen and a schema change is a new one; a secret is never read, printed or written; nothing leaves the machine - no deploy, no publish, no message to a real recipient. The agent cannot open the env file that says where a command points, so `init` asks you once where your local env file points and writes the answer into `CLAUDE.md`; with no answer there, the agent asks before the first command that touches a store.
- **The reachability bar** (`CLAUDE.md`, Working Principles), in a server's terms: a defect counts only when a real caller reaches it through an endpoint, a consumer or a job in ordinary operation of the deployment the project runs, and every finding states that path. Concurrency is not exotic here - two requests at once, a retry, a redelivery, hostile input and a restart mid-write are always in. Out of scope, in code and in review: a dependency answering outside its contract, data no code path can produce, a function called as no call site calls it, a deployment the project does not run. A borderline case is one "Not pursued" line, so neither the main thread nor the reviewer spends a round on it.
- **One reviewer**, the `hunt` subagent: runtime defects only, every finding a concrete request or state traced through the real implementation the change consumes. Its attack-angle library is a server's: input at the boundary, authorization and tenancy, transactions and concurrency, schema and stored data, queries and load, errors and partial failure, numbers and time, contracts with callers - security and performance included, as defects with a scenario, never as advice. The project feeds it with its own bugs. Two modes: the plan before it is approved, the diff after it is written. `sonnet` at medium effort by default - one line of frontmatter raises it.
- **One doc checker**, the `drift` subagent: every claim a changed identifier touches is re-checked by a command and comes back as an exact `replace:` / `with:` pair, a hand-kept API description included, and after a bug fix it proposes the one rule line no doc had. Two modes: `diff` at lifecycle step 5, launched only when the main thread's grep finds a doc naming what changed or the task fixed a bug, and `section <name>` from `maintain-ai-layer`. Read-only, `sonnet` at medium effort.
- **Two guards**, both local and free of tokens. `guard.mjs` is the full layer's guard with its two test suites unchanged: it refuses mutating git however the command is spelled, `gh` writes, shell writes and in-place edits into the tree, a copy or move into the tree, deletes beyond the one grant, `cd` outside a subshell, protected paths, dashes. `backend-guard.mjs` is this layer's own, with its own suite. It **refuses** a read, a print or a write of a **secret file** (env files, keys, credentials - example files and public keys stay readable; a recursive `grep` over the folder that holds one counts), an edit, delete or move of a **committed migration**, and a command that **deploys or publishes** - cluster and infrastructure tools, the cloud CLIs' write verbs, image and package pushes. A command aimed at this machine by its own words passes: an emulator behind a localhost endpoint, a local cluster named with `--context`, a dry run. And it **asks you** before a command that **destroys data** - `DROP` and `TRUNCATE` handed to a database client, `docker compose down -v`, the migration tools' wipe commands: you see a permission prompt, so a reset you asked for is one click, and one you did not ask for does not happen. Three lists make it the project's: frozen paths, extra secret files, the project's own forbidden commands.
- **One reminder**, `upkeep-nudge.mjs` at session start: when the `maintain-ai-layer` pass is 14 days overdue, the model tells you so in one line. Silent otherwise and in a linked worktree.
- **Four skills**: `debug` (root cause before any fix: reproduce locally, never against a shared environment; evidence at five boundaries - request in, data access, derivation, side effects, response out; and what the bug already damaged, named apart from the fix), `handoff` (`.claude/handoff.md`, for a `/compact`, a new session or a usage window that runs out), `retro` (only from its slash command), and `maintain-ai-layer` - `weekly`, the cheap pass with at most three `drift` runs; `deep` and `rules` on request only, since each costs dozens of launches; and `init`, right after the install and whenever the project has moved on: the `[fill]` sections of `CLAUDE.md` from facts found in the repo, the rule set built or updated with evidence for every line, `hunt` tuned to the project. Its survey has five read-only agents - the toolchain and tests, the layout and the request path, data and configuration, the written knowledge, the fix history - and it reads the repo only.

## Tests

The layer has no test policy of its own. `<CHECK_COMMAND>` runs whatever the project runs, the suite included; `CLAUDE.md` has a Tests section that `init` fills with the project's own convention - where tests live, how to run one, what a run needs, when a change comes with one - and the layer follows that. Two places lean on the suite when there is one: `debug` accepts a failing test as the reproduction, and lifecycle step 3 exercises a changed path the check does not reach with the existing test that covers it, or with a request against the local instance.

## What it changes, against the light frontend layer

| Unit | Light frontend | Here |
| --- | --- | --- |
| `CLAUDE.md` | generic rules, a contract is "a signature, schema, props" | the same rules plus "Data, secrets and the outside world"; a contract is an endpoint, a schema, a payload, a config key; `[fill]` sections for tests, data and migrations, configuration and environments |
| `hunt` | angles of a UI: state and effects, stale closures, a cache in the browser | angles of a server, listed above; it never connects to anything |
| `debug` | boundaries from the input to what was rendered | boundaries from the request to the response, local reproduction only, damaged data named |
| `guard.mjs`, its suites, `upkeep-nudge`, `handoff`, `retro`, `layer-refs.mjs` | - | the same files, byte for byte |
| `backend-guard.mjs` and its suite | none | new |
| `maintain-ai-layer` | four modes | the same four; `init` surveys data and configuration too, and reports stale hook lists |
| Reachability bar | one user, one tab, human speed: two sessions at once and a backend answer outside its contract are out of scope | a real caller through the service's own entry points: two requests at once, a retry and hostile input are always in; a dependency outside its contract, data no code path can produce and a deployment the project does not run are out |
| `CLAUDE.md` budget | 20 KB, about 5.5 for the project | 20 KB, about 3.5 for the project - the server rules and the server's own reachability bar take the difference, so project detail belongs in path-scoped rules |

What it drops against the full layer is what the light layer drops, for the same reasons - `../claude-bootstrap-light-frontend/README.md` has the table: `gate`, `twins`, `comments`, the review ladder, session folders, the Stop hook, the reach checker, the browser check.

## What the guards cannot do

`backend-guard.mjs` reads the text of one call. It does not see a script file that runs a forbidden command, a task-runner target that wraps one or a deploy tool its closed list does not name (add both to the forbidden list at install), SQL in a file handed to a database client, a secret printed from the process environment or reached through a variable, or a write request sent to a shared host - and it cannot know which database a connection string points at. Its lists err on the strict side: an env file with no secret in it and a private-looking fixture key are refused until their pattern is narrowed, and `.claude/hooks/README.md` says how. Those stay rules in `CLAUDE.md`, and the strongest protection is still outside the layer: credentials for shared environments that are not on the machine the agent works on.

## Tuning it for cost

- **`CLAUDE.md` is the recurring bill.** Its 20 KB budget is roughly 5k tokens on every turn. Detail that only matters for some files goes into `.claude/rules/<name>.md` with a `paths:` frontmatter, which loads only when a matching file is read.
- **A subagent is the one-off bill**, tens of thousands of tokens per launch. The lifecycle spends two on a task with a plan, one without, zero on a trivial edit - plus one `drift` when a doc names what changed or a bug was fixed, and one scoped second `hunt` round when a fix is itself non-trivial. Saying "no subagents" moves the obligations to the main thread rather than dropping them.
- **The reviewer's model is one line** in `.claude/agents/hunt.md` (`model:`, `effort:`). Raise it for a migration or a release, lower it for a sweep.
- **`maintain-ai-layer` has one cheap mode.** `weekly` spends at most three launches; `deep` and `rules` spend dozens and run only when you ask. `init` is deliberately not cheap: a rule set built on a thin survey costs every later session more than the survey did.
- **Do not use `Workflow` or ultracode here.** They spawn agents by the dozen; that is the opposite of this layer.
