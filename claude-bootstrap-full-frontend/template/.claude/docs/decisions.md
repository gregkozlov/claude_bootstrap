# Decisions - do not re-file

Decisions already taken about this codebase, each with its reason. A fresh review would otherwise rediscover them and raise them again.

- **Who reads it.** `crosscheck` greps it by the diff's files and identifiers and hands the matching entries to every reviewer as settled. `drift`, `hunt` (in its `area` and `refute` modes) and `maintain-ai-layer` read it too, and the plan review at lifecycle step 2b gets the entries that match the plan's files.
- **What a match means.** A finding that matches an entry is reported as `settled (decisions.md)`, not as a defect - unless it brings evidence the entry did not have, which reopens it.
- **When an entry stops applying.** An entry describes code. When that code changes, the entry no longer binds and the finding is judged fresh.
- **Not here.** What `CLAUDE.md` or a `.claude/rules/*.md` file already states, and open work: a live defect belongs in the backlog. A count, path or behaviour an entry cites is re-measured before it is relied on.

**Adding an entry.** One bullet in the right section: a bold lead naming the thing and the verdict, then the reason in one to three short sentences. Name files and identifiers, not line numbers. No ticket or review ids, no dates, no history of how it was decided. Entries are the owner's: no agent or skill edits this file unless the owner asks for that entry.

## Won't do

Product decisions - real, and deliberately not done.

## Out of scope

Owned by another team, the backend or the deploy; this repo cannot fix them.

## Rejected fixes and disproven claims

Fixes someone will propose again, and claims someone will re-derive.

## Verified clean

Claims that were measured and found sound. Re-measure before relying on one.
