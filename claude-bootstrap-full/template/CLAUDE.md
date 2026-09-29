# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Bootstrap note: sections marked [fill] are the project's to write - run the `setup` skill (/setup) and it
     writes them by reading the project, asking only what the repo cannot answer. Everything else is the working
     layer - the lifecycle, the guards, the budget rule - and is meant to be kept as-is. Delete this
     comment once the [fill] sections are written. -->

# General Rules

Bias toward caution over speed. For trivial tasks use judgment, but avoid silent assumptions or unnecessary changes.

### Working Principles

- **No sycophancy.** If a solution looks questionable, overcomplicated, risky or inconsistent with the architecture, say so and propose a concrete alternative. If the user pushes back, restate the reasoning rather than folding, and change position only if theirs is actually better.
- **Think before coding.** State assumptions that affect the solution, present multiple readings instead of silently picking one, and when something important is unclear, stop and ask.
- **Reply in the language of the user's latest message**, and switch with them mid-conversation. A slash command or a message without prose sets no language: keep the conversation's language, and follow the user's next written message. Every repo file - docs, comments, skills, reports - stays in the project's own language whatever the conversation's.
- **Simplicity first.** The minimum code that solves the stated problem: no features beyond what was asked, no abstractions for single-use code, no unrequested configurability, no error handling for cases the current flow cannot produce, no large rewrite where a small change does.

### Surgical Changes

Touch only what is required for the task.

- Do not improve or refactor adjacent code, comments, formatting or naming unless required - match the existing style even where another would be better.
- If unrelated dead code is found, mention it, but do not delete it unless asked.
- Remove imports, variables, functions, and types made unused **by your own changes**; leave pre-existing unused code alone.
- **Documentation drift exception:** when a change makes a statement in `CLAUDE.md`, `.claude/rules/*.md`, or another repo doc describing the changed code outdated, update that doc in the same change without asking.
- **`CLAUDE.md` has a size budget: hold it under 48 KB.** The number is this project's own choice, not a tool limit (Claude Code reads up to 4 MiB): the file loads in full on every session, so its cost is paid by every conversation whether or not the detail is relevant. Measure with `wc -c CLAUDE.md`, **not by line count** - long lines make a file grow while its line count appears to shrink. When a section outgrows the budget, first delete what is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph another loaded file already says - then move the *detail* into a path-scoped `.claude/rules/*.md` and leave the rule plus a pointer; list `.claude/rules/` and put the detail in the right existing file before adding another (a hard-coded count here rots). A rule file without `paths:` loads on every session, and a nested `CLAUDE.md` is never the overflow: it loads only once a file in its folder is read. A rule's `paths:` change is checked by `node .claude/scripts/rules-reach.mjs --check` against its fixture - move text to the file whose globs reach it, never widen a glob to make a pair pass. Process text only the main thread uses goes into a skill, with the trigger sentence left here. **Prohibitions stay here**: a path-scoped rule fires only once a matching file is read, which is too late for "never create X".

### Version Control - Never Commit or Push

Apply file changes only; leave them in the working tree for review.

- Never run any command that creates a commit, rewrites history, publishes, or discards working-tree changes. Do not stage in order to commit, do not amend, do not open or update pull requests. Read-only git (`status`, `diff`, `log`, `show`) is fine.
- Do not ask for permission - the answer is always no. The author reviews and commits everything themselves.
- `.claude/settings.json` **denies most of those verbs** for both the `Bash` and `PowerShell` tools, and a deny outranks every allow at every scope. Treat it as a backstop, not as the rule: it matches the **raw command string**, so `git -C <path> commit`, `git.exe commit`, a quoted full path to the binary and a git call inside an interpreter one-liner all slip past it, and several mutating verbs are not on the list at all. The `guard` PreToolUse hook (`.claude/hooks/guard.mjs`, registered in the same file) catches every one of those by regex over the whole command, and also refuses a shell copy, move or delete into the tree beyond the one delete grant, a `cd` outside a subshell, an interpreter one-liner that writes a file, edits to the protected paths it lists, and any written line carrying a dash character (Shell and file edits, below). Neither is the rule, which is why no `node -e` / `python -c` grant may go into an allow-list.

### Shell and file edits

- **A file in this repo is changed with Edit or Write, never from the shell.** No `sed -i`, no `awk` or heredoc redirected into a repo file, no `Set-Content`: the Bash tool eats backslashes in its arguments, heredoc quoting fails silently, and a stream edit can rewrite line endings. Scratch scripts and intermediate output go to the session scratchpad, not the tree. The `guard` hook refuses the shell forms. **Deleting a file the change itself orphaned is the one shell operation on a repo file that is granted** - one path at a time, no recursive flag, and never a generated or protected path (`<GENERATED_PATHS>`), `.claude/hooks/**`, `.claude/settings*.json`, a session's `agents.md` or anything under `.git`.
- **The repo's own generators are the exception, and running one needs no confirmation from the user.** [fill] Name them - the code generator, the schema fetcher, whatever rewrites a paste-ready artifact. Their outputs are exactly the files `guard` refuses to hand-edit, so the generator **is** the sanctioned way to change them; regenerate rather than reporting the artifact as unfixable. A new generator is a script file plus a package script, never a `node -e` one-liner - a terminal wraps that mid-identifier.
- **The working tree may carry someone else's changes.** The author edits from a second terminal while a task runs, on unrelated files - never the same diff from two places. A changed file the task did not touch is theirs: not scope creep, not a dirty tree, nothing to revert or report. So every subagent prompt names its file list explicitly, and anything outside it is out of scope. The Stop gate's checks cannot be taught this - they diff the whole tree unattributed and fire on a parallel edit too; only its review block goes by what this session edited.
- **A regex or a path with backslashes is built in a script file** (`node <file>`), never typed inline - or with `String.fromCharCode` where the escape itself must not appear in the source.
- **Never `cd` in a command chain.** The working directory persists across calls and into another worktree, so one `cd` retargets every later relative path. Absolute paths, `git -C <tree>`, and where a tool needs the cwd a subshell: `(cd <tree> && <CHECK_COMMAND>)`. The `guard` hook refuses a `cd` anywhere else, PowerShell's included. **Never call `EnterWorktree` from a session in the main tree** - it moves the whole session's cwd; a worktree gets its own session, started in its directory.
- **The Grep tool misses files when its `path` is `.claude` itself** - ripgrep misapplies the `.claude/*` ignore-plus-negation lines at that root, and a zero- or low-hit answer there proves nothing. Search `.claude` from the repo root with `glob: '.claude/**'`, or pass a subfolder (`.claude/rules`).

---

# Project-Specific Rules

[fill] One or two sentences: what <PROJECT> is and who uses it.

## Commands

```bash
<CHECK_COMMAND>    # the one verification call - every check the project has, in sequence
```

[fill] The other commands (dev server, build, generation) with one line each on what they cover. Keep the list to what an agent needs; the package manifest is the inventory.

**The running app belongs to the user.** Never touch it without the `verify-live` skill loaded: it carries the ritual (the port by fact, the machine by the marker endpoint, then the read-first pass) and the prohibitions that hold throughout - attach and never start a server, a write in the UI mutates real data and needs approval every time, never attempt credentials.

[fill] Delete the line above if the project has no browser UI, and delete the `verify-live` skill with it.

**Optional Stop gate.** `.claude/hooks/verify-gate.mjs` runs `<CHECK_COMMAND>` at the end of a turn that changed a watched file and blocks once on failure. It is **opt-in and personal** - the script is tracked, the registration is not. It diffs the **whole working tree**, unattributed (a parallel session in the same tree fires it too), and covers only its own tree. It also blocks once when this session edited a file under `<SRC_DIR>/` after its last `gate` launch, reading what `record-activity.mjs` wrote (that recorder is registered in the tracked `settings.json` and fires for everyone); a parallel session's edits and a `comments` pass do not arm that block. It defers a check while this session's agent that owns the checked files, or another session's `gate` or probe writer that collides with it, is still running. Deliberately not reviewing is a legitimate answer: write the reason into the per-session waiver the block names (`.claude/.gate-waivers/review-<session id prefix>`) and into the task file, if the session keeps one. What arms, defers and quiets it, and setup, in `.claude/hooks/README.md`.

## Development Workflow

Every **non-trivial** task (feature, bug fix, refactor) runs one lifecycle of ten steps. Steps 1-2 are here because they run before and inside plan mode; **steps 3-10 - implement, the twins / editor agents / comments pass, review, browser check, drift, the unverified list, verify - and the re-entry rules are in the `lifecycle` skill: load it once step 2 closes (after plan approval), before the first edit.**

1. **Investigate** - inline, or the built-in `Explore` subagent for a broad or unfamiliar area. Classify the brief first: a **spike** (a question, an experiment, throwaway code) is answered inline; a **bounded** change (known files, one surface) goes straight through the lifecycle; an **architectural** one (a new or changed contract - a signature, schema, props or behaviour other consumers rely on - or several surfaces) goes through **plan mode**; a change inside a shared component that keeps its contract is bounded, with the step-2 consumer walk; and a **bug report** goes through the `debug` skill - reproduce, evidence per boundary, named cause - before any of them. Say the class in the reply so the user can overrule it, and the ratchet is one-way: a bounded task that turns out to change a contract stops and re-enters as architectural, nothing downgrades mid-task. **A class dispute resolves upward**: when an agent's report classifies the task higher than the main thread did, the higher class stands until the user downgrades it. A plan is presented only after a self-check: every requirement of the brief maps to a change, no step is a placeholder ("add error handling", "similar to step 3"), a name used in a later step is the name defined in an earlier one, and a risk the plan rates as rare or out of scope that rests on a library's behaviour was read in the installed source, not judged from the API name. Route any real ambiguity to the user (`AskUserQuestion`) before implementing. **`AskUserQuestion` holds at most four questions per call; when there are more, write them all in the chat instead** - a numbered list, each with its options and the recommended one, followed by the defaults you will take unless overruled - never several forms in a row. **The brief arrives in human language, with screenshots, chat excerpts and a ticket id - turning it into the spec is this step, not the user's job.** A ticket id is fetched through the tracker's MCP (issue and comments) before anything is read; what the screenshots and the customer said is transcribed into a **Brief** section at the top of the plan - the task verbatim, what the images show, the decisions already taken, the ticket facts, the assumptions - because that text is what every later agent gets in its prompt: subagents never see the images. A task without a plan puts the same Brief into the summary every agent prompt carries. **The main thread's context is the scarce resource**: grep before Read; never Read a generated file, a schema, a fixture or a translation file whole - grep the identifier and Read with an offset; **a mechanical sweep across many files (an import path, a rename) edits from `Grep -C` output without reading them** - only a Read pulls a path-scoped rule into context, and a stale `old_string` fails rather than corrupting; a question that needs more than a handful of files goes to `Explore`.
2. **Two checks before the first edit.** The defects a review finds a round later are almost always a consumer or an invariant the implementation never looked at. (a) When the change touches something with more than one consumer (a parser, a schema, a helper, a shared component, a CSS rule): grep its consumers and list them in the reply with the invariants the change must keep (round-trip `parse(format(x)) === x`, key uniqueness, every call site of a changed signature). (b) A **contract change** gets the `hunt` subagent on its plan before the user approves it - its prompt carries the plan file, the files the plan will touch and the consumer list from (a); fix the plan, not the diff, and record in the plan that `hunt` ran, with each finding's decision.

**The session keeps its working record in its own artifact folder**, `.claude/sessions/<yyyy-mm-ddThh-mm>-<first 8 of the session id>/`, in local time (gitignored, pruned by the owner): `task-<slug>.md` per task (the Brief, the file list, every finding with its decision, the open risks - a ledger, never a pasted report), `agents.md`, which the `record-activity` hook keeps - the first file written into the folder opens it with every launch made before, and each later launch appends its row (**never `Write` it and never add a row by hand**; a verdict goes in with `Edit`), `handoff.md` from `precompact`. **Open it as step 1 closes**, by writing the Brief into `task-<slug>.md`; in plan mode, which allows no other write, open it right after approval - a plan accepted with cleared context runs under a new session id whose ledger cannot see the plan-mode launches, so the task file carries them and their decisions from the plan. **Only this session's main thread writes there. A session never reads another session's folder, whatever its date**, unless the user names one to continue in their first message: then read its `handoff.md` and task file, and still write everything new into this session's own folder. The folder's mechanics - the name as the only link, anchoring a verdict edit - are in `.claude/rules/session-artifacts.md`.

**Never start or stop a dev server** - with nothing listening for this tree the browser check is pending and the owner is asked to start one. **The findings of `twins`, `gate`, `hunt`, `integration` and `drift` are never applied on trust** - each is checked against the code and accepted or rejected with a reason; the edits of `comments` and of any project editor agent listed in the gate's `UNREVIEWED_WRITERS` need no review.

**Skip steps 2, 4, 5, 6 and 8** for super-trivial edits (single-file, obvious, low-risk) - [fill] never for the change classes that have cost this project a bug while looking trivial (a displayed rate or its formatter, a date boundary), or delete this clause; "no subagents" skips every subagent launch. Either way the skipped steps' obligations stay with the main thread, which then edits the delegated artefacts and the comments itself. Step 10 is never skipped, nor is step 7 for a change the browser can show; when step 7 has to wait for the owner to start a server, step 10 still runs before the turn ends. Two rationalizations do not qualify: "single file, so trivial" - a single file with a consumer is a shared surface, grep first; "obvious" - the one tier-2 call made on that word passed three runtime bugs. A step's skill is loaded, not recalled from memory - skills change - and the reply names each skill and agent the task ran, so a skipped step is visible. **If a step is skipped for any other reason - a subagent is unavailable, a call was denied - say so in the reply.** A review that did not happen must never read like one that passed.

## Architecture

[fill] Stack in one paragraph (<STACK>), then only the facts an agent cannot derive from the code in a minute: the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list. A count or a site list here rots - write the grep that finds the sites instead. Mark each standing decision a reviewer would otherwise flag as **settled and deliberate, with its reason**, and say that a review that wants to reopen one raises it as a finding about the decision, in Observations - `gate`, `hunt` and `integration` read that clause here, not in their own files. Only a project-wide decision belongs here; one about a single site - a won't-do, a rejected fix, a disproven claim, a surface verified clean - goes into `.claude/docs/decisions.md`, which `crosscheck` greps by the diff and hands every reviewer as settled.

### Folder conventions

[fill]

### Generated code

[fill] What is generated, from what, by which command - and that it is never hand-edited. The `guard` hook enforces the paths listed in `<GENERATED_PATHS>`; keep this section and that list in step.

## Code Style

[fill] Only the rules a linter does not already enforce, and the linter settings that surprise (a warning that fails the build, a ban with no visible reason in the code).

### Comments - the default is none

**Write a comment only where a competent reader of this codebase would get the code wrong without it**: a value that looks like a bug and is not, a workaround for a library bug or version, a domain fact the API does not encode, a deliberate deviation someone would "fix" back. Everything else is deleted rather than shortened - what the code does, why it is shaped that way, what was considered and rejected, how a fact was measured, what a library API means, what a rule file already says. **One line. Two only for a trap that cost real debugging time. Never a multi-paragraph block** - an explanation that needs one belongs in a `.claude/rules/*.md` file, not above the code. One rationale is written once, at the definition or the first call site. No ticket ids, no history, no dates, no process notes, and no `See CLAUDE.md "<section>"` pointer - make the comment self-contained. When in doubt, delete.

### Punctuation

Use a plain hyphen `-` instead of an em dash or an en dash everywhere: code, comments, user-facing strings, and **every markdown doc in the repo** - `CLAUDE.md`, `.claude/rules/*.md`, `.claude/agents/*.md`, `.claude/skills/**`, `.claude/docs/*.md`, the project's own docs. The `guard` hook refuses a write that carries one; delete this section and the `DASH` check in `guard.mjs` together if the project does not want the rule.
