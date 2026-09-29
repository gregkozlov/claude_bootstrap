# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Bootstrap note: sections marked [fill] are the project's to write - run the `setup` skill (/setup) and it
     writes them by reading the project. Everything else is the working layer and is meant to be kept as-is.
     Delete this comment once the [fill] sections are written. -->

# General Rules

Bias toward caution over speed. For trivial tasks use judgment, but avoid silent assumptions or unnecessary changes.

### Working Principles

- **No sycophancy.** If a solution looks questionable, overcomplicated, risky or inconsistent with the architecture, say so and propose a concrete alternative. If the user pushes back, restate the reasoning rather than folding, and change position only if theirs is actually better.
- **Think before coding.** State assumptions that affect the solution, present multiple readings instead of silently picking one, and when something important is unclear, stop and ask.
- **Reply in the language of the user's latest message**, and switch with them mid-conversation. A slash command or a message without prose sets no language: keep the conversation's language, and follow the user's next written message. Every repo file stays in the project's own language whatever the conversation's.
- **Simplicity first.** The minimum code that solves the stated problem: no features beyond what was asked, no abstractions for single-use code, no unrequested configurability, no error handling for cases the current flow cannot produce, no large rewrite where a small change does.

### Surgical Changes

Touch only what is required for the task.

- Do not improve or refactor adjacent code, comments, formatting or naming unless required - match the existing style even where another would be better.
- If unrelated dead code is found, mention it, but do not delete it unless asked.
- Remove imports, variables, functions, and types made unused **by your own changes**; leave pre-existing unused code alone.
- **Documentation drift exception:** when a change makes a statement in `CLAUDE.md`, `.claude/rules/*.md`, or another repo doc describing the changed code outdated, update that doc in the same change without asking.
- **`CLAUDE.md` has a size budget: hold it under 20 KB**, of which this layer's own text is about 13 KB - the project's own facts get the remaining 7. The file loads in full on every session and on every turn, so its cost is paid by every conversation whether or not the detail is relevant; on a small plan that is the whole point of this layer being light. Measure with `wc -c CLAUDE.md`, **not by line count**. When a section outgrows the budget, first delete what is true but dead - a status, an instruction for a change already applied, an alternative nothing uses - then move the *detail* into `.claude/rules/<name>.md` with a `paths:` frontmatter listing the globs it belongs to, and leave the rule plus a pointer here. **Prohibitions stay here**: a path-scoped rule fires only once a matching file is read, which is too late for "never create X".

### Version Control - Never Commit or Push

Apply file changes only; leave them in the working tree for review.

- Never run any command that creates a commit, rewrites history, publishes, or discards working-tree changes. Do not stage in order to commit, do not amend, do not open or update pull requests. Read-only git (`status`, `diff`, `log`, `show`) is fine.
- Do not ask for permission - the answer is always no. The author reviews and commits everything themselves.
- `.claude/settings.json` denies most of those verbs and the `guard` PreToolUse hook catches the forms a deny list cannot see (`git -C <path> commit`, a quoted path to the binary, a git call inside an interpreter one-liner). Both are backstops, not the rule, which is why no `node -e` / `python -c` grant may go into an allow list.
- **A project that wants the opposite deletes this section**, the `deny` block in `.claude/settings.json` and the git checks in `.claude/hooks/guard.mjs` together (`.claude/hooks/README.md` says where).

### Shell and file edits

- **A file in this repo is changed with Edit or Write, never from the shell.** No `sed -i`, no `awk` or heredoc redirected into a repo file, no `Set-Content`: the Bash tool eats backslashes in its arguments, heredoc quoting fails silently, and a stream edit can rewrite line endings. Scratch scripts and intermediate output go to the session scratchpad, not the tree. The `guard` hook refuses the shell forms. **Deleting a file the change itself orphaned is the one shell operation on a repo file that is granted** - one path at a time, no recursive flag, and never a generated path, `.claude/hooks/**`, `.claude/settings*.json` or anything under `.git`.
- **The repo's own generators are the exception, and running one needs no confirmation from the user.** [fill] Name them - the code generator, the schema fetcher, whatever rewrites a paste-ready artifact. Their outputs are exactly the files `guard` refuses to hand-edit, so the generator **is** the sanctioned way to change them; regenerate rather than reporting the artifact as unfixable.
- **A regex or a path with backslashes is built in a script file** (`node <file>`), never typed inline - or with `String.fromCharCode` where the escape itself must not appear in the source.
- **Never `cd` in a command chain.** The working directory persists across calls, so one `cd` retargets every later relative path. Absolute paths, `git -C <tree>`, and where a tool needs the cwd a subshell: `(cd <tree> && <CHECK_COMMAND>)`. The `guard` hook refuses a `cd` anywhere else, PowerShell's included.
- **The Grep tool misses files when its `path` is `.claude` itself** - ripgrep misapplies the `.claude/*` ignore-plus-negation lines at that root, and a zero- or low-hit answer there proves nothing. Search `.claude` from the repo root with `glob: '.claude/**'`, or pass a subfolder (`.claude/agents`).

---

# Project-Specific Rules

[fill] One or two sentences: what <PROJECT> is and who uses it.

## Commands

```bash
<CHECK_COMMAND>    # the one verification call - every check the project has, in sequence
```

[fill] The other commands (dev server, build, generation) with one line each on what they cover. Keep the list to what an agent needs; the package manifest is the inventory.

## Development Workflow

Every **non-trivial** task (feature, bug fix, refactor) runs these six steps. **The expensive part of a task is a subagent launch** - it rebuilds the context from nothing - so this lifecycle spends at most two, and only where an independent pair of eyes is what catches the defect.

1. **Investigate and classify.** A **spike** (a question, an experiment, throwaway code) is answered inline. A **bounded** change (known files, one surface) goes straight to step 3. A **contract change** (a signature, schema, props or behaviour other consumers rely on, or several surfaces) goes through **plan mode**. A **bug report** goes through the `debug` skill - reproduce, evidence per boundary, named cause - before any of them. Say the class in the reply so the user can overrule it, and the ratchet is one-way: a bounded task that turns out to change a contract stops and re-enters as a contract change, nothing downgrades mid-task. Route any real ambiguity to the user (`AskUserQuestion`) before implementing. **The brief arrives in human language, with screenshots and chat excerpts** - turning it into the spec is this step, not the user's job, and what the images show is transcribed into the plan, because a subagent never sees them. **The main thread's context is the scarce resource**: grep before Read; never Read a generated file, a schema or a fixture whole - grep the identifier and Read with an offset; a question that needs more than a handful of files goes to the `Explore` subagent.
2. **Before the first edit.** (a) When the change touches something with more than one consumer (a parser, a schema, a helper, a shared component, a CSS rule): grep its consumers and list them in the reply with the invariants the change must keep (round-trip `parse(format(x)) === x`, key uniqueness, every call site of a changed signature). The defects a review finds a round later are almost always a consumer nobody looked at. (b) **A plan written in plan mode is reviewed by the `hunt` subagent before the user approves it** - its prompt carries the plan, the files it will touch and the consumer list from (a). Fix the plan, not the diff, and record each finding's decision in the plan.
3. **Implement**, then walk the consumer list from step 2 yourself, then run `<CHECK_COMMAND>` once.
4. **Review: the `hunt` subagent on the diff** - one launch, its prompt carrying the file list explicitly, a one-paragraph summary of the change, the consumer list, and the deliberate decisions as context, never as a "do not flag" list. **Its findings are never applied on trust**: check each against the code and accept it or reject it with a written reason. A second round only when a fix is itself non-trivial, and it is scoped - each previous finding gets ADDRESSED or NOT ADDRESSED, new findings only inside the fix diff. Never a third.
5. **Docs, in the main thread** - no subagent: grep every tracked Markdown doc (`git ls-files '*.md'`) for each identifier, path, command and key the diff changed, read the paragraphs around the hits, and fix what the diff made false. A pre-existing wrong statement is reported to the user, not silently rewritten. After a bug fix, also propose the rule no doc had - only when the defect is a class that can be written again elsewhere, today's docs would lead a competent reader into it, and no linter or check catches it: a prohibition as one line here, the detail in the rule whose `paths:` reach the code. Zero is the normal result.
6. **Close.** Name **what stays unverified** - not everything unseen, the one to three things that need the user's data, eyes or judgement **and** have a real chance of being wrong, each with what to look at. Beside it, **every decision taken on the user's behalf** - a default picked, a reading chosen between two, a scope drawn - one line each with what it costs if wrong; a decision that stays in the transcript was made in secret. Re-run `<CHECK_COMMAND>` if anything changed after step 3.

**Skip steps 2, 4 and 5** for super-trivial edits (single-file, obvious, low-risk); "no subagents" skips the `hunt` launches, and their obligations stay with the main thread. Two rationalizations do not qualify: "single file, so trivial" - a single file with a consumer is a shared surface, grep first - and "obvious". **A skipped or unavailable step is named in the reply. A review that did not happen must never read like one that passed.**

Skills, loaded when their moment comes and never recalled from memory: `debug` (a bug report), `handoff` (before a `/compact`, a new session, or a usage window running out), `retro` (only on the user's request, after a task), `setup` (this layer's own first-run fill).

## Architecture

[fill] Stack in one paragraph (<STACK>), then only the facts an agent cannot derive from the code in a minute: the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list. A count or a site list here rots - write the grep that finds the sites instead. Mark each standing decision a reviewer would otherwise flag as **settled and deliberate, with its reason**, and say that a review that wants to reopen one raises it as a finding about the decision, in Observations.

### Folder conventions

[fill]

### Generated code

[fill] What is generated, from what, by which command - and that it is never hand-edited. The `guard` hook enforces the paths listed in its `PROTECTED_PATHS`; keep this section and that list in step.

## Code Style

[fill] Only the rules a linter does not already enforce, and the linter settings that surprise (a warning that fails the build, a ban with no visible reason in the code).

### Comments - the default is none

**Write a comment only where a competent reader of this codebase would get the code wrong without it**: a value that looks like a bug and is not, a workaround for a library bug or version, a domain fact the API does not encode, a deliberate deviation someone would "fix" back. Everything else is deleted rather than shortened - what the code does, why it is shaped that way, what was considered and rejected, how a fact was measured, what a library API means. **One line. Two only for a trap that cost real debugging time. Never a multi-paragraph block.** One rationale is written once, at the definition or the first call site. No ticket ids, no history, no dates, no process notes. When in doubt, delete.

### Punctuation

Use a plain hyphen `-` instead of an em dash or an en dash everywhere: code, comments, user-facing strings, and every markdown doc in the repo. The `guard` hook refuses a write that carries one; delete this section and the `DASH` check in `guard.mjs` together if the project does not want the rule.
