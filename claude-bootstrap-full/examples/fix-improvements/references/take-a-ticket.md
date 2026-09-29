> Example from an inventory analytics frontend (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. Reference for fix-improvements.

# Mode 1: take a ticket

### 1. Claim it first, before any analysis

Claiming is what keeps parallel agents off each other's ticket, so it happens before you read a single source file.

1. **Take the timestamp first** - `date '+%Y-%m-%d %H:%M'` in Bash, `Get-Date -Format 'yyyy-MM-dd HH:mm'` in PowerShell (neither exists in the other tool) - so no tool call sits between the read and the claim.
2. Read the backlog file.
3. Pick the target:
   - **No argument** - the first item in document order (P0.1, P0.2, ... then P1.1, ...) whose line does **not** start with `- [WIP`.
   - **An id** - that item. If it already carries a `[WIP` marker, say who holds it and when, and stop. Do not take it.
4. Claim with a single `Edit`:
   - `old_string`: `- **P0.1 - ` - **include the leading `- `**, it is load-bearing.
   - `new_string`: `- [WIP <tag> <timestamp>] **P0.1 - `, for instance `- [WIP main 2030-01-15 09:30] **P0.1 - `
   - The tag is the working tree: `main` in the main tree, `wt1` / `wt2` in a worktree under `stockroom-wt/`.
5. **A failed claim `Edit` means another agent got there first** (`File has been modified since read`, or `String to replace not found`): re-read, take the next unclaimed item, never retry the same one.
6. Re-read the claimed line: someone else's tag on it means you lost it (of two simultaneous writes the last wins) - take the next item, do not re-claim.

**Stale claims.** A marker more than 6 hours old is probably a session that died. Report it to the user with its tag and timestamp and ask whether to take it over. Never silently steal a claim.

**Then write the Brief** - the ticket verbatim, its id, your claim tag - into this session's `task-<slug>.md`, before the `Plan` launch in step 2.

### 2. Investigate - inline or delegated

Treat the item as a **hypothesis** written at the header's HEAD - **Verified by hand** included, which held at that HEAD, not necessarily at yours.

Whoever does the reading - you or a subagent - covers the same ground:

- `git log --oneline -1` - note whether HEAD has moved past the header's.
- Read every `file:line` the item cites, with surrounding context, not the cited line alone. **Line numbers drift - locate the code by content**, and say so in the report if the reference is stale.
- Trace the path yourself: does the defect actually reach the user, or is it blocked by a guard the sweep did not read? Who calls this, with what, and when?
- Where the fix, or a risk the plan rates as rare or out of scope, rests on a library's behaviour - which calls fire events, what a mode does on exit, when a callback runs - read it in `node_modules` first; a rating from the API name is a guess.
- Look at the adjacent code for two things: the same defect in a sibling (widgets built as a pair drift - `StockLevelChart` and `LeadTimeChart` share a shape), and the shared helper the fix must reuse - the item usually names one. Find siblings by grepping the pattern across `src/`, not by reading the files the ticket happens to cite.

#### Which branch

| Investigate inline | Delegate |
| --- | --- |
| Effort tag **(S)** and the item names 1-3 files | Effort tag **(M)** or **(L)** |
| The defect and its fix live in one file | The item names 4+ files, or a shared helper whose call sites it does not enumerate |
| | The verdict depends on tracing a path across layers - API client -> generated hook -> widget -> column definition |
| | A sibling sweep is needed: the same defect in the paired widget, or in the other tables (`grep -rln "<DataTable" src` lists them) |
| `inline` modifier passed | `deep` modifier passed |

#### Rules that hold either way

- **The subagent never touches `localDocs/improvements.md`** - not to read it, not to claim, not to close. It gets the ticket text pasted into its prompt and nothing else from that file.
- **Agent type `Plan`, no `model` override** - it inherits the session's model, unlike the pinned reviewers. `Plan` has no `Edit` or `Write`, which is what makes delegating safe here - read-only by construction rather than by instruction. Confirm it in the session's agent-type list, which prints each type's tools, before the launch; if `Plan` has gained either, treat it as unavailable. If `Plan` is unavailable in the session, map the area with `Explore` and design the plan inline - and **say in the report which one ran**.
- **A verdict that rests on build output is measured, never inferred.** For a ticket about chunks, what is lazy or static, bundle size or a dependency's weight, the main thread runs `node .claude/scripts/bundle-report.mjs build <scratchpad dir>` on the current tree before the `Plan` launch (it builds the working tree, so name any uncommitted `src/` change folded into the baseline) - and, where the fix can be applied as a source rewrite, the same build with `--transform` - and hands both to the dossier as `measured:`. `Plan` cannot build, so its reading of the bundler is a hypothesis that run settles; a CONFIRMED resting on that reading alone is PARTLY at most.
- **Re-read the files the plan actually edits before you present it, and recount every count and sibling list it carries.** The dossier is evidence, not a verdict. A backlog produced by review sweeps carries claims that turn out to be wrong; inheriting a plan unread is that same failure one layer down. When your reading contradicts the dossier, your reading wins and the report says which claim moved.

#### The delegation prompt

Hand it facts, not a story about what the ticket probably means - a guess in the prompt is a blind spot in the answer.

> Read-only investigation. Do not modify any file, do not run any command that writes, do not start a dev server, and do not open or edit `localDocs/improvements.md`.
> Ticket, verbatim: `<full item text, including its (S)/(M)/(L) tag>`
> It was filed by a review sweep against HEAD `<sha>` on `<date>`; HEAD is now `<current sha>`. Treat it as a **hypothesis**, not a bug report - review sweeps file claims that are factually wrong, and line numbers drift, so locate the code by content.
> Return:
>
> 1. a verdict - CONFIRMED / PARTLY / STALE / WRONG - with the code that proves it;
> 2. the mechanism in `file:line` terms, and whether it actually reaches the user or is blocked by a guard the sweep did not read - any library behaviour it rests on read in `node_modules`, not inferred from the API;
> 3. every sibling or call site carrying the same defect - grep the pattern across `src/`, do not stop at the files the ticket cites;
> 4. an executable change plan, file by file, naming the existing helper or convention each edit must reuse;
> 5. the rules in `CLAUDE.md` and `.claude/rules/*.md` this change triggers, and the task's class by `CLAUDE.md` step 1 (bounded or architectural) with the clause that decides it;
> 6. the questions you could not answer from the code, each with what changes depending on the answer.
>
> Do not manufacture findings. If the ticket is wrong, say so plainly and show what the code does instead.

#### The verdict

Land on one:

- **CONFIRMED** - the mechanism is real and reaches the user.
- **PARTLY** - name which clauses hold and which do not. Common: the bug is real but the stated cause or blast radius is wrong.
- **STALE** - already fixed, or the code no longer exists.
- **WRONG** - the mechanism does not exist. Show what the code actually does.

**A STALE or WRONG verdict is a result, not a failure.** Not everything in this backlog needs fixing. Say so plainly and recommend `close`.

**A CONFIRMED or PARTLY runtime defect is reproduced before the plan**: load the `debug` skill and run its reproduction phase on the surface the ticket names. Where that cannot happen - no server listening for this tree, data out of reach - the steps are still written from the code and **How to reproduce** is marked `not observed live`.

### 3. Explain the bug, then ask the blocking questions

Ask **before** presenting the plan, so the user reads one decided plan - but **never open with the question**: a choice between contracts is unanswerable until the defect is pictured, and "explain what the bug actually is" coming back is this step failing.

So write **What is broken** and **How to reproduce** first, in the user's language, exactly as step 4 defines them: the mechanism anchored to `file:line`, then numbered steps through the real UI ending in observed vs expected. Only then make **one** `AskUserQuestion` call, with each option phrased as what it does to the product rather than as a code edit.

- **Qualifies:** the answer changes what gets built, and the code cannot settle it. Every item ending **"Decide before touching it"** is one by construction - typically a helper whose name and behaviour disagree, where "fix the behaviour" and "rename to match it" produce different diffs. Scope is the other recurring one: fix the cited site, or sweep all its siblings.
- **Does not qualify:** anything a read would answer - go read it. And anything shaped like permission to proceed ("shall I start?", "is this right?"); the three ways forward at the end of the report already are that question.
- **Cap it at 2-3 questions in that one call.** Recommendation first, labelled `(Recommended)`. More than three means the investigation stopped early.
- **Backend-owned semantics are not a user question.** Whether `fillRate` is 0-1 or 0-100, or whether a new purchase order is meant to change the stock-level list, is answerable only by the backend. State the assumption, mark the plan conditional on it, and point at `/backend-request` - do not make the user guess on their own backend's behalf.
- **Non-blocking ambiguity is not a question either.** It goes in the plan as a stated assumption under **Notes**, and the work proceeds.

### 4. Report the verdict, then the plan

No source edits in this mode. Answer in the user's language, headings included. Structure:

**`<id> - <short title>`** `(effort tag)` - **VERDICT**

- **What is broken** - the mechanism in 2-4 sentences, anchored to `file:line`. Not a paraphrase of the ticket: what you established by reading the code.
- **How to reproduce** - numbered steps through the real UI: route, filters, click sequence, then observed vs expected - observed in the browser, or marked `not observed live` (see the verdict). Name the preconditions (a supplier with no purchase orders, a period with no data, a second user account). If it is not reproducible from the UI - build, tooling, dead code, a config file - say so and give the command, grep or bundle measurement that demonstrates it instead - for a bundle ticket, the `bundle-report diff` table of the baseline build against the `--transform` build.
- **Plan** - see below.
- **Notes** - what the ticket missed or got wrong, a simpler alternative, an assumption the plan rests on. Drop this section when there is nothing real to add; padding it wastes the user's time.
- **Risk** - what else the change touches, and the effort you actually expect versus the tag on the ticket.

**When step 3 asked a question, the report opens at Plan** - its first two sections were already delivered.

**The plan exists only for CONFIRMED and PARTLY.** A STALE or WRONG ticket ends at the disproof plus a `close` recommendation - a detailed plan for a bug that does not exist is the worst output this skill can produce. Under PARTLY the plan covers only the clauses that held, and names the ones it dropped.

#### What goes in the plan

1. **Changes** - file by file, in the order to make them, each with what changes and the existing helper or convention it must reuse, by path (`formatQuantity`, `compareSkus`, `invalidateDomain`, `useEntityDialog`, ...). A code sketch only where one sentence does not carry it.
2. **Siblings** - every other site with the same defect, named rather than swept in by default, each marked **in scope** or **out of scope with a reason**. Never silently either way: this is where the paired-widget drift and the table class (`grep -rln "<DataTable" src`) get handled or get named, and a sibling nobody mentioned is how the same ticket comes back in the next review.
3. **Repository obligations** - only the rules this change actually triggers, cited by name from `CLAUDE.md` and the rule files its paths pull in, never a blanket checklist; include the documentation-drift update when the change falsifies a doc.
4. **Out of scope** - what deliberately stays untouched. Adjacent code that looks wrong, a refactor the fix invites, a second defect found along the way (file it, do not fold it in). This is the line that keeps an (S) ticket from turning into an (L) diff.
5. **Verification** - `npm run check`, then what only the running app can settle: route, filters, click path, the forced states, both locales. Name those, briefly, and only the ones with a real chance of failing.

Close the report with the three ways forward: implement it, `/fix-improvements close <id>` to skip it, or `/fix-improvements release <id>` to leave it for later.

### 5. Only if the user says go

Then implement it in the main thread: load the `lifecycle` skill and continue from step 3. Never start `npm run dev` yourself; never commit.

**Execute the plan as written.** If the code contradicts it once you are in there, stop and re-report - the approval was for that plan, and quietly substituting a different fix under it is how a change lands that nobody agreed to. A small correction inside the same approach is fine; say what moved.

Leave the `[WIP` marker in place through implementation and review. The user closes the ticket, not you.

#### Close with three commit subjects

The user commits everything themselves, so the last thing in the done-report is **three suggested subject lines** they can pick from and paste. Derive them from the diff that actually landed, not from the ticket text - the two diverge, and the commit describes the change.

Match what the repo does, checked against `git log --format='%s' -50` rather than a remembered convention:

- One of the prefixes the history uses (for example `fix:` / `feat:` / `refactor:` / `perf:`), then a space. `fix:` for a defect, `feat:` for new or changed behaviour, `refactor:` for a restructure that keeps behaviour.
- Lowercase after the colon, no scope parens, no trailing period, one line.
- Describes the outcome in the product's own words - `fix: reorder table keeps its sort after a refetch`, `feat: lead time chart labels in both locales`.
- **No ticket id.** `P1.16` means nothing outside a gitignored file, and no subject in the history carries one.

Vary the three by angle, not by wording: what broke, what the user now sees, what the code now does. If the change spans two unrelated concerns, say it wants two commits and give subjects for each instead of one line covering both.
