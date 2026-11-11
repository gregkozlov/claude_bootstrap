# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Bootstrap note: sections marked [fill] are the project's to write - run `/maintain-ai-layer init` and it writes
     them by reading the project, asking only what the repo cannot answer, and builds the path-scoped rules beside
     them. Everything else is the working layer - the lifecycle, the guards, the budgets - and is meant to be kept
     as-is. `init` deletes this comment once the [fill] sections are written. -->

Path-scoped rules in `.claude/rules/` load by themselves when a file they cover is Read.

# General Rules

Bias toward caution over speed. For trivial tasks use judgment, but avoid silent assumptions or unnecessary changes.

### Working Principles

- **No sycophancy.** If a solution looks questionable, overcomplicated, risky or inconsistent with the architecture, say so and propose a concrete alternative. When the user pushes back, restate the reasoning rather than folding; change position only if theirs is better.
- **Think before coding.** State the assumptions that affect the solution, present multiple readings instead of picking one silently, and stop and ask when something important is unclear.
- **Reply in the language of the user's latest message**, and switch with them mid-conversation. A slash command or a message without prose sets no language: keep the conversation's language, and follow the user's next written message. Every repo file - docs, comments, skills, reports - stays in the project's own language whatever the conversation's.
- **Simplicity first.** The minimum code that solves the stated problem: no features beyond what was asked, no abstractions for single-use code, no unrequested configurability, no error handling for cases the current flow cannot produce, no large rewrite where a small change does.
- **Reachability bar.** A defect counts only when one real user, in one tab, at human speed, on a working connection, reaches it through the product's own interface in ordinary work. Every finding states its click path - who, which screen, which clicks; without one it is not a finding.
  - Out of scope, in code and in review - not coded for, not reported as a defect, no rule written for it: two tabs or two sessions acting at once; a request paused offline; an unmount in the middle of an await; an action landing in the instant between a response and its re-render; prototype-key strings (`__proto__`, `constructor`) as data; a backend answer outside its contract; hand-edited storage or URLs; two controls of one form clicked at nearly the same moment (Save, then Cancel before the save starts).
  - Always in: a double click on Save or Confirm; a background refetch wiping typed input; a token written to storage; a permission check that fails open; silent data loss on a plain save.
  - [fill] Adjust the two lists to the project's interface (a CLI, an API, a service), or keep them for a web UI.
  - A borderline case is one line under "Not pursued" (`file:line - scenario - why unlikely`): no severity, no fix, no extra round. Guards that already exist in the code stay and keep being used where their pattern is extended; new ones for out-of-scope cases are not added. This bar outranks any `.claude/` rule that guards such a case.

### Surgical Changes

Touch only what is required for the task.

- Do not improve or refactor adjacent code, comments, formatting or naming unless required - match the existing style even where another would be better.
- If unrelated dead code is found, mention it, but do not delete it unless asked.
- Remove imports, variables, functions, and types made unused **by your own changes**; leave pre-existing unused code alone.
- **Documentation drift exception:** when a change makes a statement in `CLAUDE.md`, `.claude/rules/*.md`, or another repo doc describing the changed code outdated, update that doc in the same change without asking.
- **Size budgets, by `wc -c` of the LF text: this file under 32 768 bytes, a rule file under 20 KiB.** The numbers are the project's own choice, not a tool limit: this file loads in full on every session, so its cost is paid by every conversation whether or not the detail is relevant; measure in bytes, never by line count - long lines grow a file while its line count shrinks. Over budget, dead text goes first (a status, an instruction for a change already applied, an alternative nothing uses, a paragraph another loaded file already says), then detail moves into the rule whose globs already reach the code (never widen a glob for it; a new rule: `maintain-ai-layer`, `references/rules.md`), process text into a skill; never a rule without `paths:` or a nested `CLAUDE.md`. **A prohibition that must be known before any file is read** (never create X, which tool to pick) **stays here**; one about code in a file a rule covers lives in that rule alone.

### Version Control - Never Commit or Push

Apply file changes only; leave them in the working tree for review.

- Never run any command that creates a commit, rewrites history, publishes, or discards working-tree changes. Do not stage in order to commit, do not amend, do not open or update pull requests. Read-only git (`status`, `diff`, `log`, `show`) is fine.
- Do not ask for permission - the answer is always no. The author reviews and commits everything themselves.
- The `settings.json` deny lists and the `guard` hook are backstops, not the rule (`.claude/hooks/README.md`): the deny list matches the raw command string only, so `git -C <path> commit`, a quoted path to the binary and a git call inside an interpreter one-liner slip past it, and the guard catches those by regex over the whole command. No `node -e` / `python -c` grant goes into an allow list.

### Shell and file edits

- **A file in this repo is changed with Edit or Write, never from the shell** (`sed -i`, `awk` or a heredoc redirected into it, `Set-Content`): the Bash tool eats backslashes in its arguments and a stream edit can rewrite line endings. Scratch scripts and intermediate output go to the session scratchpad. **Deleting a file the change itself orphaned is the one granted shell operation on a repo file** - one path per call, no recursive flag, never a generated or protected path (`<GENERATED_PATHS>`), `.claude/hooks/**`, `.claude/settings*.json` or anything under `.git`.
- **A command chain the owner runs that does not fit one terminal line is never pasted inline**: write it into a scratchpad script, one command per step, each stopping the script on failure, and hand over the numbered list of its steps plus the line that runs it; the session never runs it.
- **The repo's generators run with no confirmation** and are the way to change the files `guard` refuses to hand-edit - regenerate rather than reporting the artifact as unfixable. [fill] Name them - the code generator, the schema fetcher, whatever rewrites a paste-ready artifact. A new generator is a script file plus a package script, never a `node -e` one-liner.
- **A regex or a path with backslashes is built in a script file** (`node <file>`), never typed inline - or with `String.fromCharCode` where the escape itself must not appear in the source.
- **The working tree may carry someone else's changes** - the owner or another session may edit unrelated files meanwhile. A changed file the task did not touch is theirs: nothing to revert or report. Every subagent prompt names its file list; anything outside it is out of scope.
- **Never `cd` in a command chain** - the cwd persists across calls, into another worktree too. Absolute paths, `git -C <tree>`, and where a tool needs the cwd a subshell: `(cd <tree> && <CHECK_COMMAND>)`. Every prompt to a built-in agent (`Explore`, `general-purpose`, `Plan`) carries this rule. **Never call `EnterWorktree` from a session in the main tree**; a worktree gets its own session, started in its directory.
- **The Grep tool misses files when its `path` is `.claude` itself** - ripgrep misapplies the `.claude/*` ignore-plus-negation lines at that root, and a zero- or low-hit answer there proves nothing. Search `.claude` from the repo root with `glob: '.claude/**'`, or pass a subfolder (`.claude/agents`).

---

# Project-Specific Rules

[fill] One or two sentences: what <PROJECT> is and who uses it.

## Commands

```bash
<CHECK_COMMAND>    # the one verification call - every check the project has, in sequence
```

[fill] The other commands (dev server, build, generation) with one line each on what they cover. Keep the list to what an agent needs; the package manifest is the inventory.

**Every `<CHECK_COMMAND>` call takes a Bash or PowerShell `timeout` long enough for the whole chain (up to 600000) and is awaited to its exit** - a backgrounded call lets a verdict land without its result.

**The running app belongs to the user, and looking at it is the only verification of what renders.** Never start or stop a dev server (with none listening, ask the owner to start one), and never touch the app without the `verify-live` skill loaded.

[fill] Delete the paragraph above if the project has no browser UI, and delete the `verify-live` skill with it.

**The Stop hook** (`stop-check.mjs`) runs `<CHECK_COMMAND>`, or the faster subset its `CHECK` constant names, when a turn ends with the tree moved off the session's start state, and blocks once on a failure.

## Development Workflow

Every **non-trivial** task (feature, bug fix, refactor) runs one lifecycle of nine steps. Steps 1-2 run before and inside plan mode and are here; **steps 3-9, the session folder and the re-entry rules are in the `lifecycle` skill: load it once step 2 closes (after plan approval), before the first edit.** **The review ladder lives in the `crosscheck` skill alone** - lifecycle step 3 loads it; never re-derive a tier from memory.

1. **Investigate** - inline, or `Explore` for a broad or unfamiliar area. Say the class so the user can overrule it: a **spike** (a question, an experiment, throwaway code) is answered inline; a **bounded** change (known files, one surface, a shared component that keeps its contract) runs the lifecycle; an **architectural** one (a new or changed contract other consumers rely on, or several surfaces) goes through **plan mode**; a **bug report** goes through `debug` first. The ratchet is one-way: a bounded task that turns out to change a contract re-enters as architectural, and a higher class in an agent's report stands until the user downgrades it.
   **The Brief.** A ticket id is fetched through the tracker's MCP (issue and comments) before anything else is read. The task verbatim, what the screenshots show, the decisions taken, the ticket facts and the assumptions go into a **Brief** at the top of the plan and the task file - subagents never see the images.
   **Questions.** At most four per `AskUserQuestion`, more as one numbered list with the defaults you will take; each carries a recommendation researched in the code, the docs or the installed source, first and labelled "(Recommended)".
   **Context is scarce:** grep before Read; never Read a generated file, a schema, a fixture or a translation file whole - grep and Read with an offset; a question that needs more than a handful of files goes to `Explore`.
2. **Before the first edit.** (a) Something with more than one consumer (a parser, a schema, a helper, a shared component, a CSS rule): grep its consumers and list them with the invariants the change must keep (round-trip, key uniqueness, every call site of a changed signature) - in the plan when there is one, since a plan accepted with cleared context loses the reply. (b) A **contract change** gets `hunt` on its plan before the user approves it, briefed as `crosscheck` says.

**The session's record** is `.claude/sessions/<yyyy-mm-ddThh-mm>-<first 8 of the session id>/` (gitignored; its contents in `lifecycle`). **Open it as step 1 closes**, by writing the Brief into `task-<slug>.md`; in plan mode right after approval - a plan accepted with cleared context runs under a new session id, so the task file carries the plan-mode launches and their decisions. **Only this session's main thread writes there, and a session never reads another session's folder**, unless the user names one to continue in their first message: then read its `handoff.md` and task file, and write everything new into this session's own folder.

**The findings of `twins`, `gate`, `hunt` and `drift` are never applied on trust** - each is checked against the code and the reachability bar, and accepted or rejected with a reason; the edits of `comments` and of the project's own editor agents need no review.

**`/retro` runs only from its slash command**: asked for a retro in prose, name the command and stop. `/maintain-ai-layer`, and any project skill that owns a recurring job, loads from a prose request too - never do one of those jobs without its skill.

**Skip steps 2, 4, 5 and 7** for super-trivial edits (single-file, obvious, low-risk) - [fill] never for the change classes that have cost this project a bug while looking trivial (a displayed rate or its formatter, a date boundary), kept in step with the "never tier 0" list in `crosscheck`, or delete this clause; "no subagents" skips every subagent launch. Either way the skipped steps' obligations stay with the main thread: it edits the delegated artefacts and the comments itself by the rules in `.claude/agents/comments.md` and the project's editor agents, and greps the twin sites and the docs the diff touches. `lifecycle` still loads before the first edit (steps 3, 6, 8 and 9). Step 9 is never skipped, nor step 6 for a change the browser can show. "Single file, so trivial" does not qualify - a single file with a consumer is a shared surface, grep first. A step's skill is loaded, not recalled. **Name every skill and agent the task ran; a skipped or failed check - a subagent unavailable, a call denied - is said plainly.** A review that did not happen must never read like one that passed.

## Architecture

[fill] Stack in one paragraph (<STACK>), then only the facts an agent cannot derive from the code in a minute: the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list. A count or a site list here rots - write the grep that finds the sites instead. Mark each standing decision a reviewer would otherwise flag as **settled and deliberate, with its reason**, and say that a review that wants to reopen one raises it as a note under "Not pursued" - `gate` and `hunt` read that clause here, not in their own files. Only a project-wide decision belongs here; one about a single site - a won't-do, a rejected fix, a disproven claim, a surface verified clean - goes into `.claude/docs/decisions.md`, which every reviewer greps by the diff.

### Folder conventions

[fill]

### Generated code

[fill] What is generated, from what, by which command - and that it is never hand-edited. The `guard` hook enforces the paths listed in `<GENERATED_PATHS>`; keep this section and that list in step.

## Code Style

[fill] Only the rules a linter does not already enforce, and the linter settings that surprise (a warning that fails the build, a ban with no visible reason in the code).

### Comments - the default is none

**Write a comment only where a competent reader of this codebase would get the code wrong without it**: a value that looks like a bug and is not, a workaround for a library bug or version, a domain fact the API does not encode, a deliberate deviation someone would "fix" back. Everything else is deleted, not shortened. **One line, two only for a trap that cost real debugging time, never a multi-paragraph block** (that belongs in a `.claude/rules/*.md` file); one rationale once, at the definition or the first call site. No ticket ids, history, dates, process notes or `CLAUDE.md` pointers. When in doubt, delete.

### Punctuation

Use a plain hyphen `-`, never an em dash or an en dash, everywhere: code, comments, user-facing strings and every markdown doc in the repo. The `guard` hook refuses a written line that carries one; delete this section and the `DASH` check in `guard.mjs` together if the project does not want the rule.
