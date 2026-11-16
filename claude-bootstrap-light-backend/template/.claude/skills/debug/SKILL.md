---
name: debug
description: The procedure for every bug report. Load it before touching code on a defect report - "is broken", "does not work", a stack trace or an error in a log, a failing request, a wrong response, status or value, a screenshot of a fault, "/debug".
---

# debug

A bug report is a symptom with a story attached. The tempting move is to change the code that looks responsible and see whether the story goes away; that is how a null check, a `try / catch` or a retry lands on top of a cause that stays. **Nothing is edited until the cause is named**, but for the tagged instrumentation of phase 2.

## 0. What arrived

Write down, before reading code: the surface (endpoint, job, consumer, command), the request or message as it was sent (method, path, body, the caller's identity and tenant), the environment it happened in, what came back or was written, and what was expected. If any of that is missing and the bug cannot be reached without it, ask now.

Then, still before reading code: **what moved since it last worked?** `git log --oneline -- <the surface's files>`, a deploy, a migration, a dependency bump, a config or flag change, a change in the data or in a caller - each can move a contract. A bug that appeared with a change is usually that change.

## 1. Reproduce - see it yourself, locally

Run it against the local instance or the test database: the request, the command, the script - or a test that fails for the reported reason, an existing one or, where the project's convention has tests (`CLAUDE.md` Tests), a new one. The bug is reproduced when **you have observed** the wrong response, row or behaviour, not when the code "would" produce it.

- **A local instance**: start the service with `run_in_background` on a free port and stop it once the run is recorded, or ask the owner to start it. Throwaway containers a test provisions itself (Testcontainers) count as local. A run that may take longer than 10 minutes goes to the background and is awaited to its exit.
- Reproduced: keep the exact steps, they are the proof in phase 4.
- **Never reproduce against a shared or production environment**, and never read its secrets to get there. What happened there reaches you as evidence the owner hands over: log lines, a trace id, the request, a screenshot, a row with its personal data removed. That pasted evidence is the observation for phases 0 and 2; ask for exactly what phase 2 needs.
- **Intermittent** (it shows on some runs, not on others): repeat the trigger under the same conditions before any diagnosis and note the rate (`3 of 10 requests`); only then change one variable per run - the load, the order, the data, the timing. Two requests at once is a condition, not noise. The phase-4 re-run repeats the same number of tries - one clean try of a bug seen in three of ten proves nothing.
- Not reproducible on the data you can reach (a tenant, a volume, a row shape that only exists elsewhere): say so, name what would be needed, and offer instrumentation or a targeted question instead of a fix. **No fix ships for a bug nobody has seen.**
- Nothing to run it against (no local database, no fake for the outside service): phase 0 and the static half of phase 2 still run, then the turn ends asking the owner for what is missing - no named cause, no fix.

## 2. Evidence at every boundary

Read the service's own logs and the trace for the failing request first: they often name the boundary. Then follow the value from the request to what the caller got, and find the **first** boundary where reality diverges from expectation:

1. **Request in** - what the handler actually received after routing, authentication, parsing and validation: the right ids, the right tenant, the enum vocabulary, a field the binder silently dropped, defaulted or coerced.
2. **Data access** - the statement as executed, with its parameters, and the rows it returned: the filter that is missing, the join that multiplies rows, `null` where a value was expected, a stale cache or replica, a transaction that does not see what another one wrote.
3. **Derivation** - the business logic, the mapper, the calculation: **run the pure part** on the observed input rather than reasoning about it - when the cause sits there, that run on that input is the proof repeated after the fix (phase 4) - and read the installed library implementation where its behaviour decides the outcome - never the method name.
4. **Side effects** - what was written, sent or enqueued, and in which order against the commit: a message published before the row exists, a write that a later failure did not roll back.
5. **Response out** - the status, the body and what the serializer did to it: a field dropped or renamed, a number or a timestamp reformatted, an error mapped to the wrong status.

Two facts per boundary: expected and observed. The divergence sits at exactly one of them; everything downstream is a consequence, not a cause.

The cheapest instrument is a **working twin**: the sibling that produces the same value correctly (the other endpoint, the other tenant, the previous release). Diff the broken path against it at each boundary - every difference, however small, is a candidate, and the list is usually short.

**Temporary instrumentation** - a log line, a forced flag, a printed statement - is the one edit allowed before the cause is named: it observes and fixes nothing. It goes only at a boundary that separates the surviving hypotheses, it never logs a secret or a whole personal record, every line carries one tag, `DEBUG-PROBE <short task name>`, and that tag is grepped to zero before the fix lands - nothing else is guaranteed to catch a leftover.

## 3. Name the cause

One sentence, anchored to `file:line`, that explains **every** observation from phase 2 - a mechanism, not a location. Then three questions before any edit:

- **Whose is it?** A caller sending the wrong thing, another service, a library: a request to its owner or a workaround at the boundary with a comment naming the version - not a patch that makes this code tolerate anything. A cause that is the **data** (rows an old bug or a manual change left behind) is not fixed by code that reads around them.
- **Who else does this?** List the obvious siblings now - code that does the same thing independently, not the consumers of the broken code (that is `CLAUDE.md` step 2's list) - they change the shape of the fix.
- **What did it already damage?** Rows written wrong, messages sent, money moved while the bug was live. The fix stops new damage; repairing the old is a separate step the owner decides - name it, with the query that would count the affected rows.

If two hypotheses survive, do not fix both: design the one observation that separates them, make it, and come back.

## 4. Fix at the cause, then prove it

The smallest change at the cause, not at the symptom. Say the class, then run the lifecycle from step 2 in `CLAUDE.md`. This skill adds:

- **The proof is the reproduction, before and after.** The pure-part run on the observed input (phase 2, Derivation) or the reproduction of phase 1 shows the wrong value before the fix and the right one after it; both outputs are named in the reply. A run that does not show the wrong value before the fix means the cause is named wrong - back to phase 3, no fix.
- **The reproduction from phase 1 is re-run**, and its outcome stated with the observed value, not "works now".
- **A second fix that does not close the reproduction stops the work.** Two failed fixes mean the cause is not what was named; report both attempts and the pattern they share, and the third attempt is the user's call - it is usually a wrong model of the code, not a wrong line.

## Anti-patterns

- Editing code to "see if it helps". Every edit before phase 3 but the tagged instrumentation of phase 2 is a guess with a diff attached.
- Catching the symptom - a null check, a `try / catch`, a retry, a wider timeout - where the cause is upstream.
- Declaring a caller's or a database's fault from the response alone, without the request as received and the statement as executed.
- Reproducing from the ticket text instead of the running thing: the ticket is a hypothesis, the observation is the fact.
- Patching data by hand to make the symptom go away, and calling the bug fixed.
