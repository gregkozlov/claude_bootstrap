# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Bootstrap note: sections marked [fill] are the project's to write - run `/maintain-ai-layer init` and it writes
     them by reading the project, and builds the path-scoped rules beside them. Everything else is the working layer
     and is meant to be kept as-is. `init` deletes this comment once the [fill] sections are written. -->

# General Rules

Bias toward caution over speed. For trivial tasks use judgment, but avoid silent assumptions or unnecessary changes.

### Working Principles

- **No sycophancy.** If a solution looks questionable, overcomplicated, risky or inconsistent with the architecture, say so and propose a concrete alternative. If the user pushes back, restate the reasoning rather than folding, and change position only if theirs is actually better.
- **Think before coding.** State assumptions that affect the solution, present multiple readings instead of silently picking one, and when something important is unclear, stop and ask.
- **Reply in the language of the user's latest message**, and switch with them mid-conversation. A slash command or a message without prose sets no language: keep the conversation's language, and follow the user's next written message. Every repo file stays in the project's own language whatever the conversation's.
- **Simplicity first.** The minimum code that solves the stated problem: no features beyond what was asked, no abstractions for single-use code, no unrequested configurability, no error handling for cases the current flow cannot produce, no large rewrite where a small change does.
- **Reachability bar.** A defect counts only when a real caller reaches it through the service's own entry points - an endpoint, a consumer, a job - in ordinary operation of the deployment the project runs. Every finding states its path - who calls, which entry point, what request or state; without one it is not a finding.
  - Out of scope, in code and in review - not coded for, not reported, no rule written for it: a dependency or upstream answering outside its contract; a row, message or config value no code path can produce (hand-edited data, a state a constraint forbids); an internal function called as no call site calls it; a deployment the project does not run (a second instance, a replica); a clock that jumps backwards; a volume years away.
  - Always in: two requests at once and the same one twice (a retry, a redelivery); any input a caller can send, hostile included; a permission check that is missing or fails open; a failed or timed-out outbound call; a restart in the middle of a multi-step write; silent data loss on a plain write.
  - A borderline case is one line under "Not pursued" (`file:line - scenario - why unlikely`): no severity, no fix, no extra round. Existing guards stay; new ones for out-of-scope cases are not added. This bar outranks any `.claude/` rule that guards such a case.

### Surgical Changes

Touch only what is required for the task.

- Do not improve or refactor adjacent code, comments, formatting or naming unless required - match the existing style even where another would be better.
- If unrelated dead code is found, mention it, but do not delete it unless asked.
- Remove imports, variables, functions, and types made unused **by your own changes**; leave pre-existing unused code alone.
- **Documentation drift exception:** when a change makes a statement in `CLAUDE.md`, `.claude/rules/*.md`, or another repo doc describing the changed code outdated, update that doc in the same change without asking.
- **`CLAUDE.md` has a size budget: hold it under 20 KB**, of which this layer's own text is about 16.5 KB - the project's own facts get the remaining 3.5, so project detail belongs in path-scoped rules. It loads in full on every turn, so every conversation pays for it. Measure with `wc -c CLAUDE.md`, **not by line count**. Over budget, first delete what is true but dead - a status, an instruction already applied, an alternative nothing uses - then move the *detail* into `.claude/rules/<name>.md` with a `paths:` frontmatter: it loads by itself with those files, so no pointer stays here. **A prohibition that must be known before any file is read** (never create X, which tool to pick) **stays here** - a path-scoped rule fires only once a matching file is read; one about code in a file a rule covers lives in that rule alone.

### Version Control - Never Commit or Push

Apply file changes only; leave them in the working tree for review.

- Never run any command that creates a commit, rewrites history, publishes, or discards working-tree changes. Do not stage in order to commit, do not amend, do not open or update pull requests. Read-only git (`status`, `diff`, `log`, `show`) is fine.
- Do not ask for permission - the answer is always no. The author reviews and commits everything themselves.
- The deny list in `.claude/settings.json` and the `guard` hook are backstops, not the rule, which is why no one-liner grant (`python -c`, `node -e`) may go into an allow list. **A project that wants the opposite deletes this section** and both backstops together (`.claude/hooks/README.md` says where).

### Shell and file edits

- **A file in this repo is changed with Edit or Write, never from the shell.** No `sed -i`, no `awk` or heredoc redirected into a repo file, no `Set-Content`: the Bash tool eats backslashes in its arguments and a stream edit can rewrite line endings. Scratch scripts and intermediate output go to the session scratchpad, not the tree. The `guard` hook refuses the shell forms. **Deleting a file the change itself orphaned is the one shell operation on a repo file that is granted** - one path at a time, no recursive flag, and never a generated path, `.claude/hooks/**`, `.claude/settings*.json` or anything under `.git`.
- **A command chain the owner runs that does not fit one terminal line is never pasted inline** - the terminal wraps it and breaks the copy: write it into a scratchpad script, one command per step, each stopping on failure, and hand over the numbered steps plus the line that runs it.
- **The repo's own generators are the exception, and running one needs no confirmation from the user.** [fill] Name them - the code generator, the schema or client generator, the package manager that rewrites the lockfile, the command that creates a migration file. Their outputs are exactly the files `guard` refuses to hand-edit, so the generator **is** the sanctioned way to change them; regenerate rather than reporting the artifact as unfixable.
- **A regex or a path with backslashes is built in a script file**, never typed inline - or from character codes where the escape itself must not appear in the source.
- **Never `cd` in a command chain.** The working directory persists across calls, so one `cd` retargets every later relative path. Absolute paths, `git -C <tree>`, and where a tool needs the cwd a subshell: `(cd <tree> && <CHECK_COMMAND>)`. The `guard` hook refuses a `cd` anywhere else, PowerShell's included; every prompt to a built-in agent (`Explore`, `general-purpose`, `Plan`) carries this rule.
- **The Grep tool misses files when its `path` is `.claude` itself** (ripgrep misapplies the `.claude/*` ignore lines at that root), so a low-hit answer there proves nothing: search with `glob: '.claude/**'` from the repo root, or pass a subfolder.

### Data, secrets and the outside world

Git cannot revert a dropped table, a leaked key or a message sent to a real customer. The `backend-guard` hook refuses the forms it can read in a call (`.claude/hooks/README.md`); these rules hold where it sees nothing.

- **Local only.** You edit code anywhere; what you **run** - the service, a migration, a seed, a script, a request that writes - may reach only what lives on this machine and can be rebuilt: localhost, a container, a test database, an emulator. Anything shared, staging or production is the owner's: name the command and stop. **Where a command points sits in an env file you cannot open**: before the first one that touches a store or an outside service, take the target from "Configuration and environments" below, and when that does not say, ask.
- **A committed migration is frozen**: another environment has applied it. A schema or data change is a new migration, created the project's way - never an edit, rename or delete of a committed one. Never wipe a database (a reset, a drop, a downgrade past the task's own migration), a local one included, unless the user asked for exactly that - the hook then has them confirm the command.
- **A secret is never read, printed, logged or written.** No env file, key or credentials file in a Read, a `cat` or a search: search with the Grep tool or `git grep`, never `grep -r` over a folder that holds one. A variable's name comes from the example file and the code that reads it; a new one goes into the example file with a placeholder, and the reply tells the owner to set it.
- **Nothing leaves the machine.** No deploy, publish, image push or infrastructure change; no email, webhook, queue message, payment or third-party call that reaches a real recipient - use the project's fake or sandbox, and with none, leave that path unrun and name it as unverified.

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

Every **non-trivial** task (feature, bug fix, refactor) runs these six steps. **The expensive part of a task is a subagent launch** - it rebuilds the context from nothing - so this lifecycle spends at most three - `hunt` on the plan and on the diff, `drift` on the docs only when a doc names what changed or a bug was fixed (plus one scoped second `hunt` round when a fix is itself non-trivial) - and only where an independent pair of eyes is what catches the defect.

1. **Investigate and classify.** A **spike** (a question, an experiment, throwaway code) is answered inline. A **bounded** change (known files, one surface) goes straight to step 2, without plan mode. A **contract change** goes through **plan mode**: a contract is what a caller or another deployment relies on - an endpoint (path, method, request and response shape, status, error format), a database schema, a message or job payload, a config key or environment variable, a function several modules call. A **bug report** goes through the `debug` skill - reproduce, evidence per boundary, named cause - before any of them. Say the class in the reply so the user can overrule it, and the ratchet is one-way: a bounded task that turns out to change a contract stops and re-enters as a contract change, nothing downgrades mid-task. Route any real ambiguity to the user (`AskUserQuestion`) before implementing; every question carries a recommendation checked against the code, the docs or the installed source first. **The brief arrives in human language, with logs, stack traces and screenshots** - turning it into the spec is this step, and what they show is transcribed into the plan (for a bug also the reproduction steps and the named cause), because a subagent never sees an image. **The main thread's context is the scarce resource**: grep before Read; never Read a generated file, a schema, a lockfile or a fixture whole - grep the identifier and Read with an offset; a question that needs more than a handful of files goes to the `Explore` subagent.
2. **Before the first edit.** (a) When the change touches something with more than one consumer (a handler, a serializer, a schema, a query helper, a shared service, a message type): grep its consumers and list them in the reply with the invariants the change must keep (every call site of a changed signature, key uniqueness, a row, cached value or queued message written by the old code still readable by the new, and the reverse while both run). **A contract also has callers this repo cannot show** - a frontend, another service, a scheduled job: keep the old shape working for them, or say in the plan that the change breaks them. The defects a review finds a round later are almost always a consumer nobody looked at. (b) **A plan written in plan mode is reviewed by the `hunt` subagent before the user approves it** - its prompt opens with the word `plan` and carries the plan, the files it will touch, the consumer list from (a) and the plan's deliberate decisions. Fix the plan, not the diff, and record each finding's decision in the plan.
3. **Implement**, then walk the consumer list from step 2 yourself, then run `<CHECK_COMMAND>` once. **A changed path the check does not reach is exercised once** - the existing test that covers it, or a request or script against the local instance - and the observed result goes into the reply; a path that cannot be run locally is named under "unverified" in step 6.
4. **Review: the `hunt` subagent on the diff** - one launch, its prompt carrying the file list explicitly, a one-paragraph summary of the change, the consumer list, and the deliberate decisions as context, never as a "do not flag" list. **Its findings are never applied on trust**: check each against the code and the reachability bar, and accept it or reject it with a written reason. A second round only when a fix is itself non-trivial, and it is scoped - each previous finding gets ADDRESSED or NOT ADDRESSED, new findings only inside the fix diff. Never a third.
5. **Docs.** Grep every Markdown doc, one the diff added included (`git ls-files --cached --others --exclude-standard '*.md'`), and every API description the repo keeps by hand, for each identifier, path, route, command and key the diff changed; a generated description is regenerated, never patched. **No hit and no bug fixed: the step ends there** - say so in the reply. Otherwise one `drift` launch in `diff` mode, its prompt carrying the file list, the hits, the summary of the change and each `hunt` finding with its decision. Check each replacement with one command of your own; apply the drift this diff created, and report to the user the drift that predates it and any gap `drift` proposes (the rule no doc had, after a bug fix) - zero is the normal result.
6. **Close.** Name **what stays unverified** - not everything unseen, the one to three things that need the user's data, environment or judgement **and** have a real chance of being wrong, each with what to look at. Beside it, **every decision taken on the user's behalf** - a default picked, a reading chosen between two, a scope drawn - one line each with what it costs if wrong; a decision that stays in the transcript was made in secret. Then **what the owner must do by hand** when the change needs it - apply a migration, set a variable, deploy in an order. Re-run `<CHECK_COMMAND>` if anything changed after step 3 - every run with a `timeout` long enough for the whole chain, awaited to its exit. End with three suggested commit subjects, derived from the final `git diff` in the repo's own subject format (`git log --format='%s' -50`); the user commits.

**Skip steps 2, 4 and 5** for super-trivial edits (single-file, obvious, low-risk) - never for a migration, a query that writes, a permission check or money arithmetic; "no subagents" skips the `hunt` and `drift` launches, and their obligations stay with the main thread - step 5 by `.claude/agents/drift.md`'s rules. Two rationalizations do not qualify: "single file, so trivial" - a single file with a consumer is a shared surface, grep first - and "obvious". **A skipped or unavailable step is named in the reply. A review that did not happen must never read like one that passed.**

Skills are loaded when their moment comes, never recalled from memory: `debug`, `handoff`, `maintain-ai-layer` (`weekly` routinely; `deep`, `rules` and `init` only when the user asks), and `retro` only from its slash command - asked for one in prose, name `/retro` and stop.

## Architecture

[fill] Stack in one paragraph (<STACK>), the path a request takes (routing, authentication, validation, business logic, data access) with where each lives, then only the facts an agent cannot derive from the code in a minute: the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list. A count or a site list here rots - write the grep that finds the sites instead. Mark each standing decision a reviewer would otherwise flag as **settled and deliberate, with its reason**, and say that a review that wants to reopen one raises it as a finding about the decision, in Observations.

### Folder conventions

[fill] The source folders first, one line each - the layer's skills read the list from here, since a server's code rarely sits under one root - then the conventions inside them.

### Data and migrations

[fill] The stores (database, cache, queue) and the migration tool with its create and apply-locally commands; where a transaction begins and ends. The `backend-guard` hook freezes the committed files under its `FROZEN_PATHS`; keep this section and that list in step.

### Configuration and environments

[fill] Where configuration is read and the example file that lists the variables; **where the local env file points, in the owner's words** (which database, which services) and what may be run against it; the fakes that stand in for outside services.

### Generated code

[fill] What is generated, from what, by which command - and that it is never hand-edited. The `guard` hook enforces the paths listed in its `PROTECTED_PATHS`; keep this section and that list in step.

## Code Style

[fill] Only the rules a linter does not already enforce, the linter settings that surprise (a warning that fails the build, a ban with no visible reason in the code), and the formatter: its command, and whether the agent runs it on the files it changed or a commit hook does.

### Comments - the default is none

**Write a comment only where a competent reader of this codebase would get the code wrong without it**: a value that looks like a bug and is not, a workaround for a library bug or version, a domain fact the API does not encode, a deliberate deviation someone would "fix" back. Everything else is deleted rather than shortened. **One line; two only for a trap that cost real debugging time; never a block.** One rationale once, at the definition or the first call site. No ticket ids, history, dates or process notes. When in doubt, delete.

### Punctuation

Use a plain hyphen `-` instead of an em dash or an en dash everywhere: code, comments, user-facing strings, and every markdown doc in the repo. The `guard` hook refuses a write that carries one; delete this section and the `DASH` check in `guard.mjs` together if the project does not want the rule.
