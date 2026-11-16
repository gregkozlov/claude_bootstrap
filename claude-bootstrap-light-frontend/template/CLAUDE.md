# CLAUDE.md

<!-- Bootstrap note: sections marked [fill] are the project's - `/maintain-ai-layer init` writes them from the repo
     and builds the path-scoped rules. The rest is the working layer, kept as-is. `init` deletes this note. -->

# General Rules

Bias toward caution over speed. For trivial tasks use judgment, but avoid silent assumptions or unnecessary changes.

### Working Principles

- **No sycophancy.** If a solution looks questionable, overcomplicated, risky or inconsistent with the architecture, say so and propose a concrete alternative. When the user pushes back, restate the reasoning rather than folding; change position only if theirs is better.
- **Think before coding.** State the assumptions that affect the solution, present multiple readings instead of picking one silently, and stop and ask when something important is unclear.
- **Questions.** At most four per `AskUserQuestion`, each with at most four options; a fifth question, or one with more than four possible answers, goes into the reply as one numbered list instead. Every question carries a recommendation researched in the code or the docs: in the dialog first and labelled "(Recommended)", in the list as `default: <answer>` - the one you take if the user does not answer.
- **Reply in the language of the user's latest message**, and switch with them mid-conversation. A slash command or a message without prose sets no language: keep the conversation's language. Repo files stay in the project's own language.
- **Simplicity first.** The minimum code that solves the stated problem: no features beyond what was asked, no abstractions for single-use code, no unrequested configurability, no error handling for cases the current flow cannot produce, no large rewrite where a small change does.
- **Reachability bar.** A defect counts only when one real user, in one tab, at human speed, on a working connection, reaches it through the product's own interface in ordinary work. Every finding states its click path - who, which screen, which clicks; without one it is not a finding.
  - Out of scope, in code and in review - not coded for, not reported as a defect, no rule written for it: two tabs or two sessions acting at once; a request paused offline; an unmount in the middle of an await; an action landing in the instant between a response and its re-render; prototype-key strings (`__proto__`, `constructor`) as data; a backend answer outside its contract; hand-edited storage or URLs; two controls of one form clicked at nearly the same moment (Save, then Cancel before the save starts).
  - Always in: a double click on Save or Confirm; a background refetch wiping typed input; a token written to storage; a permission check that fails open; silent data loss on a plain save.
  - [fill] Adjust the two lists to the project's UI (desktop-only, mobile, embedded), or keep them for a web UI.
  - A borderline case is one line under "Not pursued" (`file:line - scenario - why unlikely`): no severity, no fix, no extra round. Guards that already exist in the code stay and keep being used where their pattern is extended; new ones for out-of-scope cases are not added. This bar outranks any `.claude/` rule that guards such a case.

### Surgical Changes

Touch only what is required for the task.

- Do not improve or refactor adjacent code, comments, formatting or naming unless required - match the existing style even where another would be better.
- If unrelated dead code is found, mention it, but do not delete it unless asked.
- Remove imports, variables, functions, and types made unused **by your own changes**; leave pre-existing unused code alone.
- **Documentation drift exception:** when a change makes a statement in `CLAUDE.md`, `.claude/rules/*.md`, or another repo doc describing the changed code outdated, update that doc in the same change without asking.
- **`CLAUDE.md` stays under 20 KB by `wc -c`**: dead text goes first, then detail moves to a `.claude/rules/*.md` whose `paths:` reach its code. **A prohibition that must be known before any file is read stays here**; one about code a rule covers lives in that rule alone.

### Version Control - Never Commit or Push

Apply file changes only; leave them in the working tree for review.

- Never run any command that creates a commit, rewrites history, publishes, or discards working-tree changes. Do not stage in order to commit, do not amend, do not open or update pull requests. Read-only git (`status`, `diff`, `log`, `show`) is fine.
- **Layer tracking: [fill] team, personal or own repo** - the install writes it.
- Do not ask for permission - the answer is always no. The author reviews and commits everything themselves.
- The `deny` list in `.claude/settings.json` and the `guard` hook are backstops, not the rule (`.claude/hooks/README.md` says how a project lifts it); no `node -e` / `python -c` grant goes into an allow list.

### Shell and file edits

- **A file in this repo is changed with Edit or Write, never from the shell** (`sed -i`, `awk` or a heredoc redirected into it, `Set-Content`); scratch files go to the session scratchpad. **Deleting a file the change itself orphaned is the one granted shell operation on a repo file** - one path per call, no recursive flag, never a generated path, `.claude/hooks/**`, `.claude/settings*.json` or anything under `.git`.
- **A command chain the owner runs that does not fit one terminal line is never pasted inline**: write it into a scratchpad script, one command per step, each stopping on failure, and hand over the numbered steps plus the line that runs it.
- **The repo's generators run with no confirmation.** [fill] Name them - the code generator, the schema fetcher, whatever rewrites a paste-ready artifact. They are how the files `guard` refuses to hand-edit change: regenerate, never report one as unfixable.
- **A regex or a path with backslashes is built in a script file** (`node <file>`), never typed inline - or with `String.fromCharCode` where the escape itself must not appear in the source.
- **Never `cd` in a command chain** - the working directory persists across calls. Absolute paths, `git -C <tree>`, and where a tool needs the cwd a subshell: `(cd <tree> && <CHECK_COMMAND>)`. Every prompt to a built-in agent (`Explore`, `general-purpose`, `Plan`) carries this rule.
- **Never start or stop the dev server** - it belongs to the user; with none running, ask.

---

# Project-Specific Rules

[fill] One or two sentences: what <PROJECT> is and who uses it.

## Commands

```bash
<CHECK_COMMAND>    # the one verification call - every check the project has, in sequence
```

[fill] The other commands an agent needs (dev server, build, generation), one line each; the package manifest is the inventory.

## Development Workflow

Every **non-trivial** task (feature, bug fix, refactor) runs these six steps. A subagent launch is the expensive part, so a task spends usually 1-2 and at most 5: `hunt` on the plan and on the diff, a scoped second `hunt` round, `drift` when a doc names what changed, an `Explore` for an unfamiliar area.

1. **Investigate and classify**, and say the class so the user can overrule it: a **spike** (a question, an experiment, throwaway code) is answered inline; a **bounded** change (known files, one surface) goes to step 2; a **contract change** (a signature, schema, props or behaviour other consumers rely on, or several surfaces) goes through **plan mode**; a **bug report** goes through `debug` first. One-way ratchet: a bounded task that turns out to change a contract re-enters as one. Real ambiguity goes to `AskUserQuestion` before implementing, each with a recommendation checked in the code, docs or installed source. What screenshots show goes into the plan in words (for a bug, the reproduction and the cause too) - a subagent never sees them. **Context is scarce:** grep before Read; never Read a generated file, a schema or a fixture whole; a question that needs more than a handful of files goes to `Explore`.
2. **Before the first edit.** (a) Something with more than one consumer (a parser, a schema, a helper, a shared component, a CSS rule): grep its consumers and list them in the reply with the invariants the change must keep (round-trip, key uniqueness, every call site of a changed signature). (b) **A plan-mode plan gets `hunt` before the user approves it** - the prompt opens with `plan` and carries the plan, its files, the consumer list and its deliberate decisions. Fix the plan, not the diff, and record each finding's decision in it.
3. **Implement**, walk the consumer list from step 2, then run `<CHECK_COMMAND>` once.
4. **Review: `hunt` on the diff** - one launch, its prompt carrying the file list, a one-paragraph summary, the consumer list, and the deliberate decisions as context, never as a "do not flag" list. **Its findings are never applied on trust**: check each against the code and the reachability bar; accept or reject it with a reason. A second round only when a fix is itself non-trivial, scoped: each finding ADDRESSED or NOT ADDRESSED, new ones only inside the fix diff. Never a third.
5. **Docs.** Grep every Markdown doc (`git ls-files --cached --others --exclude-standard '*.md'`, plus `.claude/**/*.md` when the layer is personal) for each identifier, path, command and key the diff changed. A hit: one `drift` in `diff` mode, its prompt carrying the file list, the hits, the summary and each `hunt` finding with its decision; check each replacement with a command of your own, apply the drift this diff created, report the older drift. No hit: no launch - say so. **After a bug fix**, check yourself for a missing rule line by the five conditions in `.claude/agents/drift.md` "Gaps": at most one line proposed, zero is normal.
6. **Close.** Name **what stays unverified** - the one to three things that need the user's data, eyes or judgement **and** may well be wrong, each with what to look at - and **every decision taken on the user's behalf** (a default, a reading, a scope), one line each with its cost if wrong. Re-run `<CHECK_COMMAND>` if anything changed after step 3, with a `timeout` for the whole chain, awaited to its exit. End with three suggested commit subjects from the final `git diff`, in the repo's format (`git log --format='%s' -50`); the user commits.

**Skip steps 2, 4 and 5** for super-trivial edits (single-file, obvious, low-risk); "single file, so trivial" and "obvious" do not qualify on their own - a file with a consumer is a shared surface, grep first. "No subagents" skips the `hunt` and `drift` launches; their obligations stay with the main thread (`drift`'s by `.claude/agents/drift.md`). **A skipped or unavailable step is named in the reply - a review that did not happen must never read like one that passed.**

Skills, loaded when their moment comes, never recalled: `debug` (a bug report), `handoff` (before a `/compact`, a new session or a usage window running out), `retro` (slash command only - asked in prose, name `/retro` and stop), `maintain-ai-layer` (`deep` by default, about monthly; `rules` on request; `init` after an install).

## Architecture

[fill] Stack in one paragraph (<STACK>), then only what an agent cannot derive from the code in a minute: the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list. Write the grep that finds the sites, never a count or a site list. Mark each standing decision a reviewer would flag as **settled and deliberate, with its reason**; a review that wants to reopen one raises it in Observations.

### Folder conventions

[fill]

### Generated code

[fill] What is generated, from what, by which command - never hand-edited. `guard` enforces the paths in its `PROTECTED_PATHS`; keep the two in step.

## Code Style

[fill] Only what a linter does not enforce, and the linter settings that surprise (a warning that fails the build, a ban with no visible reason).

### Comments - the default is none

**Write a comment only where a competent reader of this codebase would get the code wrong without it**: a value that looks like a bug and is not, a workaround for a library bug or version, a domain fact the API does not encode, a deliberate deviation someone would "fix" back. Everything else is deleted, not shortened. **One line, two only for a trap that cost real debugging time, never a multi-paragraph block**; one rationale once, at the definition or the first call site. No ticket ids, history, dates or process notes. When in doubt, delete.

### Punctuation

Use a plain hyphen `-`, never an em dash or an en dash, everywhere: code, comments, user-facing strings and every markdown doc in the repo. The `guard` hook refuses a written line that carries one.
