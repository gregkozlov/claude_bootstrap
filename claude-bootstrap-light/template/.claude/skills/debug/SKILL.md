---
name: debug
description: The procedure for every bug report. Load it before touching code - a screenshot, "it does not work", "why does it", "find out why", a console error, a wrong number, "/debug".
---

# debug

A bug report is a symptom with a story attached. The tempting move is to change the code that looks responsible and see whether the story goes away; that is how a `?? 0`, a `try / catch` or a second effect lands on top of a cause that stays. **Nothing is edited until the cause is named**, but for the tagged instrumentation of phase 2.

## 0. What arrived

Write down, before reading code: the surface (screen, module, command), the inputs and settings, the data the user was looking at, what they saw and what they expected. If any of that is missing and the bug cannot be reached without it, ask now.

Then, still before reading code: **what moved since it last worked?** `git log --oneline -- <the surface's files>`, a regeneration, a dependency bump, a backend version - each can move a scale or a vocabulary. A bug that appeared with a change is usually that change.

## 1. Reproduce - see it yourself

Run it: the app, the command, the script, with the user's inputs. The bug is reproduced when **you have observed** the wrong value, state or behaviour, not when the code "would" produce it.

- Reproduced: keep the exact steps, they are the proof in phase 4.
- **Intermittent** (it shows on some runs, not on others): repeat the trigger under the same conditions before any diagnosis and note the rate (`3 of 10 loads`); only then change one variable per run. The phase-4 re-run repeats the same number of tries - one clean try of a bug seen in three of ten proves nothing.
- Not reproducible on the data you can reach (a tenant, a permission, a day with no data): say so, name what would be needed, and offer instrumentation or a targeted question instead of a fix. **No fix ships for a bug nobody has seen.**
- Nothing to run it against (no server, no credentials, no sample data): phase 0 and the static half of phase 2 still run, then the turn ends asking the owner for what is missing - no named cause, no fix.

## 2. Evidence at every boundary

Follow the value from its source to what the user saw, and find the **first** boundary where reality diverges from expectation:

1. **Input** - the request, the file, the arguments that actually left: the right ids, the right period, the right enum vocabulary, nothing the caller set silently dropped.
2. **Response or read** - the body or the row as returned: the field, its scale (0-1 or percent), `null` where a number was expected, an array shorter than the count above it.
3. **Derivation** - the helper, the selector, the formatter, the comparator: **run the pure part** on the observed input rather than reasoning about it, and read the installed library implementation where its behaviour decides the outcome - never the prop name.
4. **Output** - the rendered element, the log line, the written file: which state branch was actually taken (loading, empty, error, data).

Two facts per boundary: expected and observed. The divergence sits at exactly one of them; everything downstream is a consequence, not a cause.

The cheapest instrument is a **working twin**: the sibling that produces the same value correctly (the other screen, the other endpoint, the previous release). Diff the broken site against it at each boundary - every difference, however small, is a candidate, and the list is usually short.

**Temporary instrumentation** - a log line, a debug attribute, a forced flag - is the one edit allowed before the cause is named: it observes and fixes nothing. It goes only at a boundary that separates the surviving hypotheses, every line carries one tag, `DEBUG-PROBE <short task name>`, and that tag is grepped to zero before the fix lands - nothing else is guaranteed to catch a leftover.

## 3. Name the cause

One sentence, anchored to `file:line`, that explains **every** observation from phase 2 - a mechanism, not a location. Then two questions before any edit:

- **Whose is it?** A backend or upstream fact (wrong scale, missing field, a param not applied) is a request to its owner, not a local patch - unless the code already documents a workaround for it, in which case the workaround is the site. A library behaviour is read in the installed package and worked around at the boundary, with a comment naming the version.
- **Who else does this?** List the obvious siblings now - code that does the same thing independently, not the consumers of the broken code (that is `CLAUDE.md` step 2's list) - they change the shape of the fix.

If two hypotheses survive, do not fix both: design the one observation that separates them, make it, and come back.

## 4. Fix at the cause, then prove it

The smallest change at the cause, not at the symptom. Say the class, then run the lifecycle from step 2 in `CLAUDE.md`. This skill adds:

- **The reproduction from phase 1 is re-run**, and its outcome stated with the observed value, not "works now".
- **A second fix that does not close the reproduction stops the work.** Two failed fixes mean the cause is not what was named; report both attempts and the pattern they share, and the third attempt is the user's call - it is usually a wrong model of the code, not a wrong line.

## Anti-patterns

- Editing code to "see if it helps". Every edit before phase 3 but the tagged instrumentation of phase 2 is a guess with a diff attached.
- Catching the symptom - `?? 0`, `try / catch`, an `if (!data) return null` - where the cause is upstream.
- Declaring an upstream bug from the rendered value without the raw response.
- Reproducing from the ticket text instead of the running thing: the ticket is a hypothesis, the observation is the fact.
