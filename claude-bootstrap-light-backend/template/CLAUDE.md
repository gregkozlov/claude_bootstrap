# CLAUDE.md

<!-- Bootstrap note: sections marked [fill] are the project's to write - run `/maintain-ai-layer init` and it writes
     them by reading the project, and builds the path-scoped rules beside them. Everything else is the working layer
     and is meant to be kept as-is. `init` deletes this comment once the [fill] sections are written. -->

# General Rules

Bias toward caution over speed. For trivial tasks use judgment, but avoid silent assumptions or unnecessary changes.

### Working Principles

- **No sycophancy.** If a solution looks questionable, overcomplicated, risky or inconsistent with the architecture, say so and propose a concrete alternative. If the user pushes back, restate the reasoning rather than folding, and change position only if theirs is actually better.
- **Think before coding.** State assumptions that affect the solution, present multiple readings instead of silently picking one, and when something important is unclear, stop and ask.
- **Questions.** At most four per `AskUserQuestion`, each with at most four options; a fifth question, or one with more than four possible answers, goes into the reply as one numbered list instead. Every question carries a recommendation researched in the code or the docs: in the dialog first and labelled "(Recommended)", in the list as `default: <answer>` - the one you take if the user does not answer.
- **Reply in the language of the user's latest message**, and switch with them mid-conversation. A slash command or a message without prose sets no language: keep the conversation's language, and follow the user's next written message. Every repo file stays in the project's own language whatever the conversation's.
- **Simplicity first.** The minimum code that solves the stated problem: no features beyond what was asked, no abstractions for single-use code, no unrequested configurability, no error handling for cases the current flow cannot produce, no large rewrite where a small change does.
- **Reachability bar.** A defect counts only when a real caller reaches it through the service's own entry points - an endpoint, a consumer, a job - in ordinary operation of the deployment the project runs. Every finding states its path - who calls, which entry point, what request or state; without one it is not a finding.
  - Out of scope, in code and in review - not coded for, not reported, no rule written for it: a dependency or upstream answering outside its contract; a row, message or config value no code path can produce (hand-edited data, a state a constraint forbids); an internal function called as no call site calls it; a deployment the project does not run; a clock that jumps backwards; a volume years away.
  - Always in: two requests at once and the same one twice (a retry, a redelivery); several instances, replicas or worker processes running the same code, unless "Architecture" below says the service runs as one; any input a caller can send, hostile included; a permission check that is missing or fails open; a failed or timed-out outbound call; a restart in the middle of a multi-step write; silent data loss on a plain write.
  - A borderline case is one line under "Not pursued" (`file:line - scenario - why unlikely`): no severity, no fix, no extra round. Existing guards stay; new ones for out-of-scope cases are not added. This bar outranks any `.claude/` rule that guards such a case.

### Surgical Changes

Touch only what is required for the task.

- Do not improve or refactor adjacent code, comments, formatting or naming unless required - match the existing style even where another would be better.
- If unrelated dead code is found, mention it, but do not delete it unless asked.
- Remove imports, variables, functions, and types made unused **by your own changes**; leave pre-existing unused code alone.
- **Documentation drift exception:** when a change makes a statement in `CLAUDE.md`, `.claude/rules/*.md`, or another repo doc describing the changed code outdated, update that doc in the same change without asking.
- **`CLAUDE.md` stays under 20 KB by `wc -c`**, about 16 KB of it this layer's and 4 the project's: project detail goes into a `.claude/rules/<name>.md` with a `paths:` frontmatter. Over budget, dead text goes first, then detail moves to a rule. **A prohibition that must be known before any file is read stays here**; one about code a rule covers lives in that rule alone.

### Version Control - Never Commit or Push

Apply file changes only; leave them in the working tree for review.

- Never run any command that creates a commit, rewrites history, publishes, or discards working-tree changes. Do not stage in order to commit, do not amend, do not open or update pull requests. Read-only git (`status`, `diff`, `log`, `show`) is fine.
- **Layer tracking: [fill] team, personal or own repo** - the install writes it.
- Do not ask for permission - the answer is always no. The author reviews and commits everything themselves.
- No one-liner grant (`python -c`, `node -e`) goes into an allow list. The `guard` hook and the settings' deny list back this section up; `.claude/hooks/README.md` says how to switch it off.

### Shell and file edits

- **A file in this repo is changed with Edit or Write, never from the shell** (`sed -i`, `awk` or a heredoc redirected into it, `Set-Content`); scratch scripts and intermediate output go to the session scratchpad. **Deleting a file the change itself orphaned is the one granted shell operation on a repo file** - one path per call, no recursive flag, never a generated path, `.claude/hooks/**`, `.claude/settings*.json` or anything under `.git`.
- **A command chain the owner runs that does not fit one terminal line is never pasted inline**: write it into a scratchpad script, one command per step, each stopping on failure, and hand over the numbered steps plus the line that runs it.
- **The repo's own generators run with no confirmation** and are the sanctioned way to change the files `guard` refuses to hand-edit: regenerate rather than reporting the artifact as unfixable. [fill] Name them - the code generator, the schema or client generator, the package manager that rewrites the lockfile, the command that creates a migration file.
- **A regex or a path with backslashes is built in a script file**, never typed inline - or from character codes where the escape itself must not appear in the source.
- **Never `cd` in a command chain**: absolute paths, `git -C <tree>`, and where a tool needs the cwd a subshell: `(cd <tree> && <CHECK_COMMAND>)`. Every prompt to a built-in agent (`Explore`, `general-purpose`, `Plan`) carries this rule.

### Data, secrets and the outside world

Git cannot revert a dropped table or a leaked key. The `backend-guard` hook refuses or asks about the forms it can read in a call (`.claude/hooks/README.md`); these rules hold where it sees nothing.

- **Local only.** You edit code anywhere; what you **run** - the service, a migration, a seed, a script, a request that writes - may reach only what lives on this machine and can be rebuilt: localhost, a container (the throwaway ones a test starts, Testcontainers included), a test database, an emulator. Anything shared, staging or production is the owner's: name the command and stop. **Where a command points sits in an env file or local profile you may not be able to open**: before the first one that touches a store or an outside service, take the target from "Configuration and environments" below, and when that does not say, ask.
- **A migration on the default branch is frozen**: another environment has applied it. A schema or data change is a new migration, created the project's way - never an edit, rename or delete of a frozen one. Never wipe a database (a reset, a drop, a downgrade past the task's own migration), a local one included, unless the user asked for exactly that - the hook then has them confirm the command.
- **A secret is never read, printed, logged or written.** No env file, key or credentials file in a Read, a `cat` or a search: search with the Grep tool or `git grep`, never `grep -r` over a folder that holds one, and keep a secret file git tracks out of a search that prints lines (a glob, a type, a pathspec). A variable's name comes from the example file, or the checked-in config that names the keys (`application.yml`, `appsettings.json`), and the code that reads it; a new one goes into that file with a placeholder, and the reply tells the owner to set it.
- **Nothing leaves the machine.** No deploy, publish, image push or infrastructure change; no shell or copy to another host; no email, webhook, queue message, payment or third-party call that reaches a real recipient - use the project's fake or sandbox, and with none, leave that path unrun and name it as unverified.

---

# Project-Specific Rules

[fill] One or two sentences: what <PROJECT> is, what calls it and who operates it.

## Commands

```bash
<CHECK_COMMAND>    # the one verification call - every check the project has, in sequence
```

[fill] The other commands with one line each on what they cover: running the service locally, building, generating, creating a migration and applying it locally. Keep the list to what an agent needs; the build manifest and the task runner are the inventory.

## Tests

[fill] Where the tests live, how to run one file or one case, what a run needs (a database, containers, fixtures), and the project's own convention for when a change comes with a test. This layer adds no test policy: it follows the convention written here.

## Development Workflow

Every **non-trivial** task (feature, bug fix, refactor) runs these six steps. A subagent launch is the expensive part, so a task usually spends one or two - `hunt` on the plan and on the diff - and at most five: a scoped second `hunt` round, one `drift` when a doc names what changed, one `Explore` for an unfamiliar area.

1. **Investigate and classify.** A **spike** (a question, an experiment, throwaway code) is answered inline; a **bounded** change (known files, one surface) goes to step 2 without plan mode; a **contract change** goes through **plan mode** - a contract is what a caller or another deployment relies on: an endpoint (path, method, shapes, status, error format), a database schema, a message or job payload, a config key or environment variable, a function several modules call; a **bug report** goes through the `debug` skill first. Say the class so the user can overrule it; the ratchet is one-way - a bounded task that turns out to change a contract re-enters as one. Real ambiguity goes to the user (`AskUserQuestion`) before implementing, each question with a recommendation checked against the code first. Logs, stack traces and screenshots in the brief are transcribed into the plan (for a bug, the reproduction and the named cause too): a subagent never sees an image. **Context is scarce:** grep before Read; never Read a generated file, a schema, a lockfile or a fixture whole; a question that needs more than a handful of files goes to `Explore`.
2. **Before the first edit.** (a) Something with more than one consumer (a handler, a serializer, a schema, a query helper, a shared service, a message type): grep its consumers and list them in the reply with the invariants the change must keep (every call site of a changed signature, key uniqueness, a row, cached value or queued message written by the old code still readable by the new, and the reverse while both run). **A contract also has callers this repo cannot show** - a frontend, another service, a scheduled job: keep the old shape working for them, or say in the plan that the change breaks them. (b) **A plan written in plan mode is reviewed by the `hunt` subagent before the user approves it** - its prompt opens with the word `plan` and carries the plan, the files it will touch, the consumer list and the plan's deliberate decisions. Fix the plan, not the diff, and record each finding's decision in the plan.
3. **Implement**, walk the consumer list from step 2, then run `<CHECK_COMMAND>` once. **A changed path the check does not reach is exercised once** - the existing test that covers it, or a request or script against the local instance: start the service with `run_in_background` on a free port and stop it afterwards, or ask the owner to start it. The observed result goes into the reply; a path that cannot be run locally is named under "unverified" in step 6.
4. **Review: the `hunt` subagent on the diff** - one launch, its prompt carrying the file list, a one-paragraph summary of the change, the consumer list, and the deliberate decisions as context, never as a "do not flag" list. **Its findings are never applied on trust**: check each against the code and the reachability bar, and accept it or reject it with a written reason. A second round only when a fix is itself non-trivial, scoped: each previous finding gets ADDRESSED or NOT ADDRESSED, new findings only inside the fix diff. Never a third.
5. **Docs.** Grep every Markdown doc, one the diff added included (`git ls-files --cached --others --exclude-standard '*.md'`, plus `.claude/` when git ignores the layer), and every API description the repo keeps by hand, for each identifier, path, route, command and key the diff changed; a generated description is regenerated, never patched. **No hit: no `drift` launch** - say so. Otherwise one `drift` launch in `diff` mode, its prompt carrying the file list, the hits, the summary of the change and each `hunt` finding with its decision; check each replacement with one command of your own, apply the drift this diff created, and report the drift that predates it. **After a bug fix, run the gap check yourself** by the "Gaps" conditions in `.claude/agents/drift.md`: a gap goes to the user as a proposal - zero is the normal result.
6. **Close.** Name **what stays unverified** - the one to three things that need the user's data, environment or judgement **and** could really be wrong, each with what to look at. Beside it, **every decision taken on the user's behalf** - a default picked, a reading chosen between two, a scope drawn - one line each with what it costs if wrong. Then **what the owner must do by hand** when the change needs it - apply a migration, set a variable, deploy in an order. Re-run `<CHECK_COMMAND>` if anything changed after step 3. Every check run is awaited to its exit with a `timeout` long enough for the whole chain; one that may run past 10 minutes runs in the background and is awaited. End with three suggested commit subjects, derived from the final `git diff` in the repo's own subject format (`git log --format='%s' -50`); the user commits.

**Skip steps 2, 4 and 5** for super-trivial edits (single-file, obvious, low-risk) - never for a migration, a query that writes, a permission check or money arithmetic. "No subagents" skips the `hunt` and `drift` launches, not their obligations: the main thread does step 5 by `.claude/agents/drift.md`. "Single file, so trivial" does not qualify - a single file with a consumer is a shared surface, grep first. **A skipped or unavailable step is named in the reply. A review that did not happen must never read like one that passed.**

Skills are loaded when their moment comes, never recalled from memory: `debug`, `handoff`, `maintain-ai-layer` (only when the user asks - `deep` is the monthly pass the session-start reminder announces), and `retro` only from its slash command - asked for one in prose, name `/retro` and stop.

## Architecture

[fill] Stack in one paragraph (<STACK>), the path a request takes (routing, authentication, validation, business logic, data access) with where each lives, and whether the service runs as one process or several (instances, replicas, workers) - the Reachability bar reads it. Then only the facts an agent cannot derive from the code in a minute: the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list. A count or a site list here rots - write the grep that finds the sites instead. Mark each standing decision a reviewer would otherwise flag as **settled and deliberate, with its reason**, and say that a review that wants to reopen one raises it as a finding about the decision, in Observations.

### Folder conventions

[fill] The source folders first, one line each - the layer's skills read the list from here, since a server's code rarely sits under one root - then the conventions inside them.

### Data and migrations

[fill] The stores (database, cache, queue) and the migration tool with its create and apply-locally commands; where a transaction begins and ends. The `backend-guard` hook freezes the files under its project list `FROZEN_RAW` once they are on the default branch; keep this section and that list in step.

### Configuration and environments

[fill] Where configuration is read and the example file or checked-in config that lists the keys; **where the local env file or profile points, in the owner's words** (which database, which services) and what may be run against it; the fakes that stand in for outside services.

### Generated code

[fill] What is generated, from what, by which command - and that it is never hand-edited. The `guard` hook enforces the paths listed in its `PROTECTED_PATHS`; keep this section and that list in step.

## Code Style

[fill] Only the rules a linter does not already enforce, the linter settings that surprise (a warning that fails the build, a ban with no visible reason in the code), and the formatter: its command and who runs it - a commit hook, or the agent through the project's own task (`make fmt`, `./gradlew spotlessApply`). `guard` refuses the bare binary writing in place (`gofmt -w`, `dotnet format`, `black`): with no task, format with Edit and name the command for the owner.

### Comments - the default is none

**Write a comment only where a competent reader of this codebase would get the code wrong without it**: a value that looks like a bug and is not, a library workaround, a domain fact the API does not encode, a deliberate deviation someone would "fix" back. **One line; two only for a trap that cost real debugging time.** One rationale once, at the definition or the first call site; no ticket ids, history, dates or process notes. When in doubt, delete.

### Punctuation

Use a plain hyphen `-` instead of an em dash or an en dash everywhere: code, comments, user-facing strings, and every markdown doc in the repo. The `guard` hook refuses a write that carries one.
