---
paths:
  - '.claude/sessions/**'
  - '.claude/hooks/record-activity.mjs'
---

# The session artifact folder

The always-on rules are in `CLAUDE.md` (Development Workflow) and the `lifecycle` skill. This file carries the mechanics they rely on.

## A ledger, not an archive

- **`task-<slug>.md`** holds the Brief, the file list, the step-2a consumer list, every finding with its decision, every decision taken on the user's behalf, the measured facts with their source, one line per round of changes and the open risks. It is reconciled before the closing reply, and is never a pasted report.
- **`agents.md`** rows are `record-activity.mjs`'s alone.
  - The first file written into the folder makes it create the ledger from this session's launch event records. So the launches from before the folder existed get their rows too, and every launch after appends one.
  - The match is by session id. A plan accepted with cleared context starts a new id, so its plan-mode launches are left out.
  - The verdict under each row is yours. An empty verdict is a visible gap.
- **`handoff.md`** is the `precompact` skill's output.

## The folder name is the only link

The name is `<yyyy-mm-ddThh-mm>-<first 8 of the session id>`, local time. Take the id from the SessionStart hook's context line (`compact-pointer.mjs`); never guess or invent one.

`record-activity.mjs` and `compact-pointer.mjs` find the folder by that suffix and never create one. So:

- a folder under any other name gets no rows and no compaction pointer;
- a folder the user names to continue is read, never adopted.

## Verdict edits

**Anchor a verdict edit on the row's own text, description included, and put the row back into the replacement.** The recorder appends a later launch's row at the end of the file, below the verdict you are writing.

## Review skips

**A deliberate review skip** is written into the task file beside `.claude/.gate-waivers/review-<session id prefix>`. A session with no task file writes the waiver alone.

## No agent writes there

`hunt` and `integration` are the two reviewers with `Write`. They are refused every project path but their compile probe when their payload names them.
