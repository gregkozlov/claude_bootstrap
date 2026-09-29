---
name: backend-request
description: Draft one tracker issue for a backend-owned problem the frontend cannot fix; never creates it. Use on "/backend-request", "file an issue for the backend", "write to the backend", "this cannot be fixed on the frontend".
---

> Example from an inventory analytics frontend (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. Depends on: the tracker's MCP (read-only), a gitignored localDocs/backend-requests.md register and the tracked .claude/docs/decisions.md. Drafts a backend ticket from measured facts.

# backend-request

Turn a backend-owned problem into one tracker issue the user can paste in. **The draft is the deliverable** - the tracker's MCP here is read-only, so the user creates the issue and this skill never claims to have done it.

One invocation = **one issue about one thing**. Two unrelated problems are two runs, and in a tracker that is not a style preference: separate issues get closed separately.

## The standing intent

Every issue filed is a backlog item about something the frontend cannot address: some need attention, others are observations or possible improvements, and none asks for an immediate reply. Consequences:

- **Nothing is urgent.** Never write "urgent", "blocker", "ASAP", never ask for an ETA, never mention a release.
- **No greeting, no sign-off, no apology for filing.** An issue is a record, not a letter.
- **An issue may be an observation.** Not every one of these is a defect demanding action, and a request framed as a question is legitimate. Do not inflate an observation into a bug.
- **It stands alone.** Someone opening it in three weeks has no conversation around it. Name the endpoint and the symptom in full.

## Who reads it

**The reader is the backend developer.** That single fact decides the tone:

- Report **what you observe from the outside**, not what they did wrong. "The endpoint ignores the `warehouseId` filter", not "the endpoint filters wrong".
- **Do not explain their own domain to them.** No lectures on query design, REST conventions, database modelling or security posture. A design concern worth raising becomes a short question in the list and they answer it, once.
- **Ask, don't prescribe.** Name the outcome, not the implementation. They decide how.
- Never imply the fix is easy, obvious or overdue. No "just", no "simply", no "should be quick".
- Uncertainty is stated plainly, without hedging theatre: "I might be reading the response wrong" beats "I may possibly be mistaken here, but".

## Before drafting: verify

Filing a wrong issue against the backend costs more than filing none. Confirm the claim against the code before writing a word:

- Read the generated client and schema for the endpoint (`src/api/<domain>/generated/`) - the real request shape, field types, nullability.
- Read the call site. Establish what the frontend sends today and what it does with the response.
- Separate **observed** from **inferred**. Anything measured in DevTools or by a live request (a status code, a response body, a rejection) is observed and can be stated flat. Anything derived from reading code is inferred, and either gets softer wording or gets checked first.
- Check **both** docs. **Grep them by the endpoint or field name, never Read them whole**:
  - `.claude/docs/decisions.md` - if the item is recorded under `## Out of scope` as backend-owned, reuse the wording and measurements already written out.
  - `<main>/localDocs/backend-requests.md` - the local register, one block per filed issue under `## Open` or `## Closed`. `<main>` is the main tree's absolute path, the `git worktree list` entry that holds `main`. Always that absolute path, from every session and every worktree: `localDocs/` is gitignored, and a relative read from a worktree silently finds nothing (or a forked copy). Do not infer "already filed" from `decisions.md` alone - it records decisions, not filings.
- **Search the tracker for a duplicate before drafting** - the tracker's MCP issue search, scoped to project `PROJ`, with the endpoint path or field name as the query - since the register only knows what was recorded in it. If either one already has the ask, say so and ask before filing again. Without the tracker's MCP (a teammate's machine), ask the owner for the duplicate check and the live Subsystem values instead of guessing.

If verification shows the problem is fixable on the frontend after all, **say so and stop**. Do not draft the issue.

**Keeping the register.** Once the owner has filed the issue and given its id, add a block under `## Open`: `### PROJ-nn - <summary line>` and one line naming the endpoints and fields it covers, which is what the next grep matches. When the owner says the issue is closed, or a search shows it resolved, move the block under `## Closed`. Never write a block for an issue with no id.

## Summary line

The line they read in a list of twenty. Get it exact:

- **State the observable fact**, not the request. `GET /inventory/stock-levels ignores the warehouseId filter` beats "Fix stock endpoint".
- Lead with the endpoint or the API area, so related issues sort together.
- Roughly 50-90 characters. It must survive truncation in a board column.
- No "Please", no "Bug:", "FE:", "Request:" prefixes, no trailing period, no issue ID of your own invention.
- Present tense, describing the current state.

## Description

The tracker renders Markdown, so backticks, fenced blocks and `-` bullets all work. Use them sparingly: this is prose with one list at the end, not a formatted report. No headings, no `**Problem:** / **Impact:**` scaffolding.

**Paragraph 1 - what the behaviour is.** One or two sentences naming the endpoints and what they do today.

**Paragraph 2 - why it matters, then why it is not mine to fix.** The user-visible consequence in product terms, what a person using the app actually sees. Then the line that eliminates the frontend side: what the frontend already has, and why it still cannot work. That second half is what keeps the issue from reading as a complaint.

**"What I need" - one to three bullets.** Concrete outcomes, one per line, no sub-bullets. A question they have to answer counts as a bullet and belongs here rather than buried in the prose. Three is the ceiling; if there are four, the issue is really two issues.

**Never** include: frontend file paths, component or hook names, React / React Query / Zustand internals, store names, or how the frontend is structured. It turns a request into a briefing. The most they need is a capability - "the frontend already sends the warehouse ID" - never an architecture.

Total length: usually 70-130 words including the list.

## Voice

- **First person singular. "I", never "we".** The user files under their own name, not on behalf of a team.
- Plain full sentences with ordinary punctuation. Semicolons and colons are fine.
- **No em dashes or en dashes anywhere.** A full stop, a semicolon or a comma. A dash-joined clause is both a tell and against the repo's punctuation rule.
- `ID` when the word stands alone; keep the literal identifier as the API spells it (`warehouseId`, `supplierId`, `orderId`).
- Endpoint paths bare in prose (`/inventory/stock-levels`). Backticks only for a literal value or a field name where the distinction matters.
- Plain product language over jargon: "the selected warehouse", not "the scoped location parameter".

## Not sounding like an AI

The tells, in rough order of how badly they give it away:

- Bolded label scaffolding, or a three-part structure announced in advance.
- Exclamation marks, and any enthusiasm at all.
- Restating the same point in three registers, or a final sentence that repeats the opening.
- "not just X, but Y", "it's worth noting that", "that said", "to be clear".
- Emoji.
- Symmetrical, evenly weighted sentences. Real writing has one long sentence and one short one.
- A "What I need" bullet that restates the paragraph above it verbatim.

## Cross-references

No "the item above" - there is no thread order any more. When a request follows from an existing issue, **ask the user for that issue's ID** and reference it as `<PROJ-123>` in the first line, or leave a placeholder and say so below the draft. Never invent an ID, a project key, a field name or a workflow state.

## Calibration: an edit

A draft chat message and the user's rewrite of it; the endpoint is an illustration, not a live defect. The voice carries into an issue unchanged.

Draft:

> Hi. We need a fix on GET /inventory/stock-levels - right now it ignores the warehouseId parameter, every warehouse comes back.
>
> Because of that the warehouse detail page in Stockroom shows the stock of all warehouses summed together: every user sees the same totals whichever warehouse they open. The frontend does send the warehouse id (it is in the page URL), but we cannot filter on our side - the list is paged, so filtering after the fact drops rows.
>
> What we need:
> 1. Apply the warehouseId filter on the backend.
> 2. Better - do the filtering in the database query instead of after loading. Returning every warehouse to every client means that in the current design anyone could read the stock of a warehouse they have no access to just by leaving the parameter out.
> 3. Please confirm that warehouseId is the same id as the one returned by GET /inventory/warehouses.

Posted:

> Need a fix for GET /inventory/stock-levels. Right now, it ignores the warehouseId parameter; every warehouse is returned.
>
> Because of this, the warehouse detail page in Stockroom effectively shows one total for all warehouses: every user sees the same numbers whichever warehouse they open. The frontend already sends the warehouse ID, but I cannot filter on my side because the response is paged and filtering it afterwards drops rows.

What survived into the posted version: no greeting, "I" where a pronoun was unavoidable, real punctuation for every dash, product language over internals, one softener in front of the harshest claim. The chat's list died as repetition plus a lecture; in an issue the list is the scope and stays - cut the lecture, keep the ask.

## Subsystem

The tracker has a **Subsystem** field, and setting it is what routes the issue to the right owner instead of leaving them to work out whose service it is. It is a fixed picklist: read the live values with the tracker's MCP (the field schema for project `PROJ`, the `Subsystem` field) rather than from any list written down, and reproduce a value **exactly** - no rewording, no abbreviating, no re-casing.

**The pick is mechanical, not a judgement call.** Each backend service is served under its own URL path prefix and is named `<prefix>-service` in the picklist (`/inventory/` -> `inventory-service`, and so on), except `/account/` and `/auth/`, which are both `account-service`. Verification has already established which endpoint the issue is about, so the prefix gives the answer. The picklist also carries services this frontend never calls; they are there so a request the user raises about one of them can still be tagged - do not reach for one to fill a gap.

**Pick exactly one.** A request that needs two subsystems is two issues, same as everything else here.

**When nothing covers it, say so.** The picklist may have no item for a whole domain, and none for infrastructure - the web server, the deploy, a response header, the content security policy - check it rather than assume. Write `Subsystem: no item in the list covers <the thing>` and leave the choice to the user. Never substitute a neighbouring service to avoid an empty field.

**When one change has to span several services and only some are on the list**, name the one that is and add which affected services have none. That is not a licence to bundle: it applies when the ask is a single change applied in several places, not when there are several asks.

## Output

Give the user the draft in one fenced block, `Summary:` then `Description:`, ready to copy, with nothing above it. Below the block, in this order and no more than three lines total:

1. One line suggesting **Type, Priority and Subsystem** - the user asked for it and can ignore it. Keep Type and Priority to plausible generic values (Bug / Task / Feature, and a priority that matches the standing intent above, which is rarely higher than Normal); take Subsystem from the section above. These are fields the user sets in the tracker's form, so they stay below the block and never go inside the description.
2. Anything deliberately left out and why, or a fact worth confirming before filing.

If verification changed the request, lead with that instead of burying it under the draft.
