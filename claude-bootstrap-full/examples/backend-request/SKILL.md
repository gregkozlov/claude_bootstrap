---
name: backend-request
description: Draft one tracker issue for a backend-owned problem the frontend cannot fix; never creates it.
---

> Example from an inventory analytics frontend (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. Depends on: the tracker's MCP (read-only), a gitignored localDocs/backend-requests/ folder for the drafts, the tracked .claude/docs/decisions.md and `.claude/scripts/pretty-json.mjs` (`examples/pretty-json.mjs`). Drafts a backend ticket from measured facts.

# backend-request

Turn a backend-owned problem into one tracker issue the user can paste in. **The draft is the deliverable** - the tracker's MCP here is read-only, so the user creates the issue and this skill never claims to have done it.

One invocation = **one issue about one thing**. Two unrelated problems are two runs, and in a tracker that is not a style preference: separate issues get closed separately.

## The standing intent

Every issue filed is a backlog item about something the frontend cannot address: some need attention, others are observations or possible improvements, and none asks for an immediate reply. Consequences:

- **Nothing is urgent.** Never write "urgent", "blocker", "ASAP", never ask for an ETA, never mention a release.
- **No greeting, no sign-off, no apology for filing.** An issue is a record, not a letter.
- **No check-date sentences.** Never "Checked on <date>", "Rechecked on ... over <month>", "Still the case in <version>, checked ..." or any variant - the request/response block already carries what was called and with which dates. Applies to new drafts; existing files are not rewritten for it.
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
- Grep `.claude/docs/decisions.md` by the endpoint or field name, never Read it whole - if the item is recorded under `## Out of scope` as backend-owned, reuse the wording and measurements already written out. It records decisions, not filings, so it never proves "already filed".
- **Search the tracker for a duplicate before drafting** - the tracker's MCP issue search, scoped to project `PROJ`, with the endpoint path or field name as the query. If it already has the ask, say so and ask before filing again. Without the tracker's MCP (a teammate's machine), ask the owner for the duplicate check and the live Subsystem values instead of guessing.

If verification shows the problem is fixable on the frontend after all, **say so and stop**. Do not draft the issue.

## Summary line

The line they read in a list of twenty. Get it exact:

- **State the observable fact**, not the request. `GET /inventory/stock-levels ignores the warehouseId filter` beats "Fix stock endpoint".
- Lead with the endpoint or the API area, so related issues sort together.
- Roughly 50-90 characters. It must survive truncation in a board column.
- No "Please", no "Bug:", "FE:", "Request:" prefixes, no trailing period, no issue ID of your own invention.
- Present tense, describing the current state.

## Description

**Plain text.** The user posts it without markup: no backticks, no code or JSON literals, no quotes or braces around a value, no headings, no `**Problem:** / **Impact:**` scaffolding. A value is written as it reads, `warehouseIds: [412]`, never as a request body. The only markup is the `-` bullets of the list at the end. The one exception is the request/response block below.

**Paragraph 1 - what the behaviour is.** One or two sentences naming the endpoints and what they do today, plus one concrete example (an ID, a value, what came back) and, where one exists, the sibling endpoint that behaves correctly.

**Paragraph 2 - only when the consequence is not obvious from paragraph 1.** Most issues need none. When it is there: the user-visible consequence in product terms, what a person using the app actually sees. Then the line that eliminates the frontend side: what the frontend already has, and why it still cannot work. That second half is what keeps the issue from reading as a complaint.

**"What I need" - one to three bullets.** Concrete outcomes, one per line, no sub-bullets. A question they have to answer counts as a bullet and belongs here rather than buried in the prose. Three is the ceiling; if there are four, the issue is really two issues.

**Request and response - directly under "What I need", whenever the issue rests on a live call made in this session.** One block per call: `Request: POST /<domain>/<endpoint>`, the exact JSON body sent (with the real IDs and params), then `Response: <status>` and the backend's body verbatim, untrimmed and undecoded - the HTML entities and escaping as returned. Capture it whole (a truncated or output-filtered copy is not verbatim): the browser tool cuts output near 1000 characters and refuses base64, so read it in slices with `=` `&` `?` swapped for placeholders, reassemble it in a scratch file, and compare its SHA-256 against the page's before using it. The request and the response are one pair from one call: a response the user copied from the app's own request goes in only beside that request's payload, never beside a hand-built body. A pasted response showing `Ã` where an umlaut belongs was decoded wrong on copy - restore the UTF-8 character. Never paste a token, and never a response measured in an earlier session as if it were current - re-run the call, or leave the older measurement out. When the issue is that a parameter changes nothing, show the call once and name the other value on the response line (`Response: 200, the same body byte for byte with includeDiscontinued: true`) - compare the two bodies in full before writing it - and add one control pair, both calls, from an endpoint where the same change does move the answer. With several calls, each request/response pair is separated from the next by a line holding only `---`, with a blank line above and below it. **Formatted for reading**: every JSON body, request and response, is pretty-printed with two-space indentation and sits in a ```` ```json ```` fence, which the tracker renders as code; a non-JSON body (HTML, a database error, response headers) goes in a plain ```` ``` ```` fence as returned, and request headers that matter to the issue get their own plain fence above the request body. Re-indent the raw body saved in the scratchpad with `node .claude/scripts/pretty-json.mjs <file>`, which copies every literal through untouched and refuses a body that is not JSON (paste that one as returned, in a plain fence) - never `JSON.parse` + `JSON.stringify`, which rounds `0.1000000000000000055511` and rewrites `1E-10`. In the chat reply, wrap the whole draft in a `~~~` fence so the inner backtick fences survive. This block is exempt from the plain-text rule and from the word count.

**Never** include: frontend file paths, component or hook names, React / React Query / Zustand internals, store names, or how the frontend is structured. It turns a request into a briefing. The most they need is a capability - "the frontend already sends the warehouse ID" - never an architecture.

Total length: usually 40-80 words including the list. Shorter wins: an issue they can read in one glance gets handled.

## Voice

- **First person singular. "I", never "we".** The user files under their own name, not on behalf of a team.
- Plain full sentences with ordinary punctuation. Semicolons and colons are fine.
- **No em dashes or en dashes anywhere.** A full stop, a semicolon or a comma. A dash-joined clause is both a tell and against the repo's punctuation rule.
- `ID` when the word stands alone; keep the literal identifier as the API spells it (`warehouseId`, `supplierId`, `orderId`), written bare.
- Endpoint paths, field names and values bare in prose (/inventory/stock-levels, warehouseIds), never in backticks.
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

No "the item above" - there is no thread order any more. A reference to an earlier issue goes in only when the user wants one: then **ask the user for that issue's ID** and reference it as `<PROJ-123>` in the first line, or leave a placeholder and say so below the draft. Never invent an ID, a project key, a field name or a workflow state.

## Calibration: an edit

A draft chat message and the user's rewrite of it; the endpoint is an illustration, not a live defect. The voice carries into an issue unchanged.

Draft:

> Hi. We need a fix on GET /inventory/stock-levels - right now it ignores the warehouseId parameter, every warehouse comes back.
>
> Because of that the warehouse detail page in Stockroom shows the stock of all warehouses summed together: every user sees the same totals whichever warehouse they open. The frontend does send the warehouse id (it is in the page URL), but we cannot filter on our side - the list is paged, so filtering after the fact drops rows.
>
> What we need:
>
> 1. Apply the warehouseId filter on the backend.
> 2. Better - do the filtering in the database query instead of after loading. Returning every warehouse to every client means that in the current design anyone could read the stock of a warehouse they have no access to just by leaving the parameter out.
> 3. Please confirm that warehouseId is the same id as the one returned by GET /inventory/warehouses.

Posted:

> Need a fix for GET /inventory/stock-levels. Right now, it ignores the warehouseId parameter; every warehouse is returned.
>
> Because of this, the warehouse detail page in Stockroom effectively shows one total for all warehouses: every user sees the same numbers whichever warehouse they open. The frontend already sends the warehouse ID, but I cannot filter on my side because the response is paged and filtering it afterwards drops rows.

What survived into the posted version: no greeting, "I" where a pronoun was unavoidable, real punctuation for every dash, product language over internals, one softener in front of the harshest claim. The chat's list died as repetition plus a lecture; in an issue the list is the scope and stays - cut the lecture, keep the ask.

## Calibration: a posted issue

The user's own final form of an issue drafted at 130 words; the endpoints are illustrations. This is the target shape:

> Summary: GET /inventory/suppliers warehouseIds filter returns nothing
>
> Description:
>
> Filtering GET /inventory/suppliers by warehouseIds always returns 0 suppliers. Example: warehouse 412 has supplier 87 assigned, but warehouseIds: [412] returns nothing. The same filter on GET /inventory/skus works.
>
> What I need:
>
> - warehouseIds on GET /inventory/suppliers to return the suppliers assigned to that warehouse

What went: the "Follow-up to" line, the guess about which side of the relation is read, the paragraph on why the frontend cannot fix it, the second bullet that asked a question, every backtick, the JSON braces and quotes.

## Subsystem

The tracker has a **Subsystem** field, and setting it is what routes the issue to the right owner instead of leaving them to work out whose service it is. It is a fixed picklist: read the live values with the tracker's MCP (the field schema for project `PROJ`, the `Subsystem` field) rather than from any list written down, and reproduce a value **exactly** - no rewording, no abbreviating, no re-casing.

**The pick is mechanical, not a judgement call.** Each backend service is served under its own URL path prefix and is named `<prefix>-service` in the picklist (`/inventory/` -> `inventory-service`, and so on). Verification has already established which endpoint the issue is about, so the prefix gives the answer. The picklist also carries services this frontend never calls; they are there so a request the user raises about one of them can still be tagged - do not reach for one to fill a gap.

**Pick exactly one.** A request that needs two subsystems is two issues, same as everything else here.

**When nothing covers it, say so.** The picklist may have no item for a whole domain, and none for infrastructure - the web server, the deploy, a response header, the content security policy - check it rather than assume. Write `Subsystem: no item in the list covers <the thing>` and leave the choice to the user. Never substitute a neighbouring service to avoid an empty field.

**When one change has to span several services and only some are on the list**, name the one that is and add which affected services have none. That is not a licence to bundle: it applies when the ask is a single change applied in several places, not when there are several asks.

## Output

**The Subsystem is the first line of the draft** - `Subsystem: inventory-service`, or the no-item sentence from the Subsystem section, then a blank line - issues filed without it went to the board unrouted. The draft is one fenced block, `Subsystem:`, `Summary:`, then `Description:`, ready to copy. Below the block, in this order and no more than three lines total:

1. One line suggesting **Type and Priority** - the user asked for it and can ignore it. Keep Type and Priority to plausible generic values (Bug / Task / Feature, and a priority that matches the standing intent above, which is rarely higher than Normal). These are fields the user sets in the tracker's form, so they stay outside the block and never go inside the description.
2. Anything deliberately left out and why, or a fact worth confirming before filing.

If verification changed the request, lead with that instead of burying it under the draft.

**Every draft is also written to a file, in the same turn** - `<main>/localDocs/backend-requests/<MM.YYYY>/<NN>-<short-kebab-name>.txt` (create the month folder when it does not exist yet). `<NN>` is the next free two-digit sequence number in that month's folder (`01`, `02`, ... - list the folder first; each month starts again at `01`), so the files sort in the order they were drafted. `<main>` is the main tree's absolute path, the first entry of `git worktree list` - always that path, from every session and worktree: `localDocs/` is gitignored, so a relative path from a worktree writes a copy nobody sees. The file holds exactly the fenced block's content - `Subsystem:`, `Summary:`, `Description:`, the request/response block - and nothing else: no issue number, no Type/Priority line, no notes. The user sets the Subsystem field from its first line and pastes the rest into the tracker as is. A rewrite of an existing issue gets a file too. A redraft in the same conversation overwrites its own file, never a second one.
