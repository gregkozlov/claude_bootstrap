---
name: handoff
description: Write .claude/handoff.md so the work survives a /compact, a new session or a usage window running out. Only when the user says "/handoff", "handoff", "before compact", "write a handoff", or announces a /compact - never on your own initiative.
---

# handoff

A `/compact` keeps a summary of this chat; a new session keeps nothing; a usage window that closes mid-task ends it where it stands. This skill writes the one file that makes any of those cheap to continue from: **`.claude/handoff.md`**, in **English** - its reader is the model, not the user - with every fact the next session would otherwise rediscover or ask for.

**The file is the deliverable.** It is temporary and personal (gitignored), one per tree, rewritten in place. Nothing picks it up automatically: the next session reads it because the user says so, or because you say so in the report.

## 1. Collect the facts - by command, not from memory

```bash
git rev-parse --show-toplevel && git branch --show-current && git log --oneline -1
git status --short      # staged (first column) vs unstaged vs untracked - say which is which
git diff --stat | tail -1
```

Then walk the whole conversation, oldest message first, and pull out:

- **The task as the user asked it** - quoted, not paraphrased. Plus every later instruction that widened or narrowed it.
- **Every decision the user made** - verbatim, with the question it answered. Settled; the next session must not re-ask them.
- **Every decision you made** and the reason, especially the ones the user never saw.
- **What was done**, with the numbers that were measured, and **what was verified how** - a check that was not run is listed under "not verified", never implied.
- **Files outside git** that changed - local docs, `.claude/settings.local.json`, memory files.
- **Anything the user must do by hand** - a command that was denied, a decision still pending.
- **Scratchpad scripts** - one line each on what they do: they do not survive a new session, so they must be rewritable.
- **The next step**, concrete enough to start from without reading anything else, then the ones after it in order.

## 2. Write the file

Write tool, `.claude/handoff.md`, English, identifiers and paths as-is. Fixed sections, kept even when one says "none":

```markdown
# <date> - <task>

Handoff for continuing after /compact or in a fresh session. Temporary, never committed.
Tree <path>, branch <branch>, HEAD <sha>.

## Task                         <- quoted verbatim; later widenings and narrowings
## Tree state                   <- git facts; staged vs unstaged vs untracked; files outside git
## Done                         <- numbered; measured numbers as before / after pairs
## Owner decisions              <- verbatim quotes; settled, never re-ask
## My decisions and assumptions <- each with its reason
## Verified / not verified      <- two lists; a check not run is a check not run
## Open questions for the owner <- numbered, each answerable in one line
## Next steps                   <- ordered; step 1 startable from this file alone
## Tools and artifacts          <- scratchpad scripts, subagent reports, extracted inputs
```

Rules for the content:

- **Reference files by path; never paste their contents.** The file is a map, not a copy. The one exception is a small extracted input the next step needs and cannot cheaply recompute.
- **No secrets.** Nothing from `.env`, no tokens, no credentials - even if they appeared in the chat.
- **Verbatim quotes for the user's words**, your own words for everything else.
- Target under ~15 KB.

## 3. Verify and report

`git status --short` must not list the file; if it does, say so and stop - never edit `.gitignore` to hide it. Re-read "Next steps" as if you knew nothing else: if step 1 cannot be started from the file alone, fix the file.

Then three lines, in the user's language: the path and size, one sentence on what it carries, and the sentence that opens the next session, e.g. `Continue the task in .claude/handoff.md, from step 1`.

## Boundaries

- Do not make new decisions here - an open question goes under "Open questions for the owner".
- Do not write it for a task that is finished and reported; it is for work still in flight.
