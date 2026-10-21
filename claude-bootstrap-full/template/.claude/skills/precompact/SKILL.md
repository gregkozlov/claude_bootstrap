---
name: precompact
description: Write this session's handoff.md into its artifact folder before a /compact or a session switch.
---

# precompact

A `/compact` keeps a summary of this chat; a new session keeps nothing. This skill writes the one file that makes either continuation cheap: `handoff.md` in **this session's own artifact folder**, **in the project's own language** (`CLAUDE.md`, Working Principles) - its reader is the model, not the user - with every fact the next session would otherwise have to rediscover or ask for. The user's own words are quoted verbatim in whatever language they were said, a long dash written as a hyphen (the guard refuses the dash in any project file).

**The file is the deliverable.** It is temporary and personal (`.claude/sessions/` is gitignored), read in full by whoever picks the work up, and the owner prunes the folders by hand. **Nothing picks it up automatically** - no hook, no memory line: several sessions can run in the same tree at once, and a handoff belongs to one task, not to whoever starts next. The user names the folder in the session that should read it, which is why section 4 below ends by printing that sentence.

## 1. Collect the facts - by command, not from memory

Run these in the tree the session is working in (`git rev-parse --show-toplevel`; a worktree has its own root) and copy the results in:

```bash
git rev-parse --show-toplevel && git branch --show-current && git log --oneline -1
git status --short            # staged (first column) vs unstaged vs untracked - say which is which
git diff --stat | tail -1
git worktree list
ls <this session's folder>/handoff.md 2>/dev/null   # only this session's own folder, to see whether a handoff already exists - never list another's
```

Then walk the whole conversation, oldest message first, and pull out:

- **The task as the user asked it** - quote it, do not paraphrase. Plus every later instruction that widened or narrowed it.
- **Every decision the user made** - verbatim, with the question it answered. These are settled; the next session must not re-ask them.
- **Every decision you made** and the reason, especially the ones the user never saw (a default you picked, a reading you chose between two).
- **What was done**, with the numbers that were measured (before / after), and **what was verified how** - a check that was not run is listed under "not verified", never implied.
- **Files outside git** that changed - local docs, `.claude/settings.local.json`, memory files - git status does not show them.
- **Anything the user must do by hand** - a staged change to unstage, a command that was denied, a decision still pending.
- **Tools and artifacts** - scripts written to the scratchpad (session-scoped: they survive `/compact` but not a new session, so say what each does in one line so it can be rewritten), subagent reports, extracted inputs.
- **Background agents** still running - there should be none; if there are, say what they were asked and where their output lands.
- **The next step**, concrete enough to start from without reading anything else, then the ones after it in order.

## 2. Write the file

Path: `handoff.md` in this session's own artifact folder (the SessionStart hook names it; create it if missing). One handoff per folder however many days the task spans - rewrite it in place. Write tool, English, identifiers and paths as-is.

Fixed section order; keep every section even when it says "none":

```markdown
# Session <date> - <task>

Handoff for continuing after /compact or in a fresh session. Temporary, never committed - delete when the work is closed.
Tree <path>, branch <branch>, HEAD <sha>. Task file beside this one: <name or "none">.

## Task <- as the user asked it, quoted verbatim; later widenings / narrowings

## Tree state <- git facts; staged vs unstaged vs untracked; files outside git; what must not be committed

## Done <- numbered; measured numbers in a table when there are before / after pairs

## Owner decisions <- verbatim quotes; settled, never re-ask

## My decisions and assumptions <- each with its reason

## Verified / not verified <- two lists; a check not run is a check not run

## Open questions for the owner <- numbered, each answerable in one line

## Next steps <- ordered; step 1 startable immediately from this file alone

## Loose ends <- known small leftovers nobody decided on

## Tools and artifacts <- scratchpad scripts (path + one line each), memory files touched, subagent outputs

## Context for the next step <- pre-digested inputs the next step needs (an extracted report, a measured table), so it is not re-derived
```

Rules for the content:

- **Reference files on disk by path; never paste their contents.** The file is a map, not a copy. The exception is a small extracted input the next step needs and cannot cheaply recompute (a table pulled out of a report).
- **No secrets.** Nothing from `.env`, no tokens, no credentials - even if they appeared in the chat.
- **Numbers only where a decision depends on them**, and always as before / after pairs.
- **Verbatim quotes for the user's words**, your own words for everything else.
- Target under ~15 KB. Bulk that does not fit belongs in a gitignored local doc with a link here.

## 3. Verify

- `ls` on this session's folder shows the file and `git status --short` does not list it; if it does, stop and say so - never edit `.gitignore`.
- Re-read the "Next steps" section as if you knew nothing else: if step 1 cannot be started from the file alone, fix the file.

## 4. Report

Three lines, in the user's language: the path and size; a one-sentence summary of what the file carries; and the exact sentence the user can open the next session with, e.g. `This session builds on .claude/sessions/2030-01-15T09-30-3fa9c1b2/, read handoff.md and continue from step 1`.

## Boundaries

- Never delete another session's folder; the owner prunes them.
- Do not use this file as a place to make new decisions - open questions go under "Open questions for the owner", never into a decisions section.
- Do not run it in a worktree session against the main tree, or the reverse; the folder lives in the tree the session was working in.
