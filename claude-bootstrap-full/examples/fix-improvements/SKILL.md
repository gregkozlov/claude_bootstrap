---
name: fix-improvements
description: Work the localDocs/improvements.md backlog (ids like P0.3, not tracker ids like PROJ-123) one ticket at a time, planning without implementing. Use on "/fix-improvements", "next ticket", an id like "P0.3", or `close <id>` / `release <id>`.
---

> Example from an inventory analytics frontend (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. Depends on: a gitignored localDocs/improvements.md backlog with numbered tickets, and the tracked .claude/docs/decisions.md. Takes one ticket through the lifecycle.

# fix-improvements

Take one finding out of the improvements backlog, prove or disprove it against the real code, ask the questions the code cannot answer, and hand back an executable plan. **This skill does not implement anything by default** - the verdict and the plan are the deliverable, and the user decides: fix it, skip it, or drop it.

A ticket is a hypothesis with a one-line `Fix:` clause on the end, not a work order. What makes the plan worth building is everything that clause leaves out: the sibling call sites carrying the same defect, the repo rules the change triggers, what deliberately stays untouched, and which part of it is still an assumption.

## The backlog file

**`<main>/localDocs/improvements.md`** - always this absolute path, from every session, in every worktree. `<main>` is the main tree's absolute path: the `git worktree list` entry that holds `main`.

`localDocs/` is gitignored, so it sits outside git entirely - no history, no merge, and `git worktree add` does not copy it. Cross-worktree claiming only works while every agent edits that one file. **Never** open a relative `localDocs/improvements.md`, and **never** create one in a worktree: a second copy silently forks the backlog and every claim marker stops meaning anything - both reads succeed, and each tree goes on seeing a plausible backlog.

So check positively instead of waiting for a failure. Before the first edit, confirm the path actually opened resolves under `<main>/localDocs/`. **A worktree-local `localDocs/` existing at all is the error condition**, not a fallback - stop and tell the user. If the absolute read fails outright, that session is missing the main repo in its `additionalDirectories`; tell the user to add `<main>` there and stop. Do not work around either case.

The file is gitignored and therefore has **no git history** - a bad edit is unrecoverable. Use targeted `Edit` calls only, never `Write`.

### Structure

- A short header - title, generation date, `**Method.**`, `**Status - open.**`, the pointer to the decisions file - then a `---` rule.
- Below it, nothing but open work: `## P0` through `## P5`. Some tiers carry bold sub-group labels (`**Tables and number formatting**`) that are **not** headings and hold no items of their own.
- **This file contains only open tickets**, so it shrinks as they close and ends up empty. A tier heading left with no items under it is normal - leave it alone.

### The companion file

**`.claude/docs/decisions.md`** (tracked, team-shared) holds the decisions already taken: `## Won't do` (product decisions), `## Out of scope` (backend-owned), `## Rejected fixes and disproven claims` (fixes tried and refused, with why), `## Verified clean` (claims that were measured and found sound). A ticket that matches an entry is settled, not open.

**Nothing in it is work, and this skill never claims from it.** Read it in one situation: the ticket in front of you resembles something already rejected or already measured. If it is in there, your verdict is WRONG or STALE and the evidence is already written out - cite it and recommend `close`.

### Item format

One item = one top-level `- ` bullet on one physical line, no labelled fields:

```
- **P0.1 - <claim sentence.>** `file:line` refs, mechanism as prose, optional **Verified by hand.** Fix: <recommendation> **(S)**
```

Trailing `**(S)** / **(M)** / **(L)**` is the effort estimate. An item may nest `  - ` sub-bullets - those belong to it and move or die with it.

Ids are **stable and cross-referenced inline** ("see P0.12", "Combined with P1.17"). **Never renumber.** A gap in the numbering after a delete is correct and expected.

## Modes

Selected by the argument the user passes:

| Argument | Mode |
| --- | --- |
| none | take the next unclaimed ticket |
| a ticket id, e.g. `P3.4` | take that ticket specifically |
| `close`, `close P0.1` | delete a finished ticket |
| `release`, `release P0.1` | drop a claim, leave the ticket |

A ticket argument may carry one modifier - `deep` forces the investigation to a subagent, `inline` keeps it in the main thread (`/fix-improvements P1.3 deep`). Without one, the trigger table in step 2 decides.

**Do not run this skill in plan mode.** Claiming is an `Edit` to the backlog, which plan mode forbids: the claim never lands, the run looks normal, and a parallel session walks onto the same ticket.

**An architectural ticket** (a changed contract, or several pages) still goes through plan mode, with `hunt` on the plan when it changes a contract - claim it here first, outside plan mode, then enter plan mode.

---

## Mode 1: take a ticket (default)

**Read `references/take-a-ticket.md` in full before reading the backlog** - its claim step is timing-sensitive.

---

## Mode 2: `close [id]`

Deletes the item outright, with no questions asked. `.claude/docs/decisions.md` is not touched.

1. **Pick the target.** The id if given; otherwise the ticket this session claimed; otherwise, if exactly one `[WIP <this worktree>` marker exists in the file, that one. If it is still ambiguous, list every open claim with its tag and timestamp and ask.
2. **Report what landed.** `git status --short` and `git diff --stat`. This is informational and never a blocker - a ticket may legitimately be closed with an empty diff because it was WRONG, STALE or not worth fixing. Just say which case it is.
3. **Echo the full item text verbatim in your report, before deleting it.** The file is gitignored and has no history, so a delete cannot be undone - the echoed copy is the only way back from a wrong close. When the diff is empty because the ticket was rejected rather than fixed, add one line to the report: the decision, rewritten without the ticket id, can be added to `.claude/docs/decisions.md` so the next review sweep does not re-file it - under `## Rejected fixes and disproven claims` for a WRONG or STALE verdict, under `## Won't do` only when it was real but not worth fixing. Say it once and move on - do not ask, and do not write that file yourself.
4. **Check for dangling references.** Grep the id across the file (`P0.12`) and name any other item that mentions it inline. Delete anyway; just tell the user which items now point at nothing.
5. **Delete with one `Edit`**: `old_string` = the whole item line including its trailing newline, plus any nested `  - ` sub-bullets; `new_string` = empty. No blank line left behind, no double blank line between neighbours.
6. **Never renumber** the remaining items, and leave the tier heading in place even when its last item is gone.

## Mode 3: `release [id]`

Remove the `[WIP ...] ` prefix and nothing else - the item text must come back byte-identical. Use it when abandoning a ticket, or to clear a stale claim once the user has confirmed the holder is dead.
