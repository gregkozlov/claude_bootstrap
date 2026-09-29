---
name: crosscheck
description: The review policy for a finished change - the one place the review ladder lives. Load it after implementing any non-trivial change (lifecycle step 6), and when the user says "/crosscheck", "cross-check", "independent audit", "review it with several subagents".
---

# crosscheck

**Every review decision after implementation lives here** (lifecycle step 6); if another file restates the ladder, this one wins.

## The ladder - count the signals, let the count pick the tier

**Mechanically, not by judgement** (a tier once picked by judgement missed three runtime bugs the later fan-out found). List the signals the diff carries, count them, and name both the signals and the tier in the reply. The user's word overrides in both directions.

Signals (written for a frontend; [fill] replace with the classes this project has - the rule is "a class that has produced a runtime bug before"):

- a form
- a mutation flow, or any caching, invalidation or identity logic
- an overlay (modal, drawer, popover) or focus handling
- a data grid or table call site
- routing, auth or permissions
- a shared surface: shared components, theme, the HTTP client, stores, the internals of a shared preset; under `.claude/hooks` / `.claude/scripts` only a change to what a script reads or writes on disk (state files, event records, waivers, temp directories) or to its registration in `settings*.json`
- the first consumer of a new or changed endpoint, or a schema regeneration
- a persisted-state shape (persisted stores, storage keys)
- a new translation namespace
- a store flag or a library mode (an edit or drawing mode) set in one handler and cleared in others, the library's own exits from that mode included, or a new check that blocks on one - not an overlay's open state, a form's submit state or an auth or permission state, which their own signals cover

**A signal counts only when the diff changes what makes the class** - a form's fields or validation, an overlay's open, close or focus, a grid's rows or columns, a shared surface's props, defaults, exports or theme overrides, a flag's set or clear or a new check that blocks on it. A change confined to display literals - a colour, a spacing, a copy string with no interpolation, a token moved with every consumer compiling - carries no signal wherever the file lives. Two things are never waived as display: copy that interpolates a value; and any displayed percent, rate, ratio, KPI arithmetic or its formatter, and any date, period or bucket boundary, once the list above carries that class. **Code under `.claude/hooks` or `.claude/scripts` always gets tier 2 at least** - `gate` and `hunt`, with `integration` on top only when the shared-surface entry above applies to it.

Tiers:

- **Tier 0 - no review.** The `CLAUDE.md` skip rule, decided before this file loads. **"No subagents" is not tier 0**: count the signals and do that tier's review in the main thread, which keeps every obligation the skipped legs had.
- **Tier 1 - `gate` alone.** No signals.
  **A pure deletion lands here whatever its signals**, on one condition: the deleted code is unreachable, and the unreachability was proved by reading the installed library or the code that decides it, not asserted from a name or from the docs. Write the proof into `gate`'s prompt so it re-checks that claim first; without such a proof the signal count applies as usual. Nothing else about the diff may change behaviour - a deletion bundled with a rename, a default or a signature change is not this case.
- **Tier 2 - `gate` and `hunt` in one message, plus the lens the signal names.** Exactly one signal. `hunt` (`.claude/agents/hunt.md` - adversarial, runtime defects only, its own attack-angle library, reads the real implementation of what the diff consumes, compile probes) is always part of this tier; add the lens from the table on top, not the full set:

| Signal | Extra lens (on top of `hunt`) |
|---|---|
| First endpoint consumer; schema regeneration | Live probes (section 2) - the only lens that catches wrong scales, units and fail-silent vocabularies |
| Shared surface; persisted-state shape | The `integration` subagent (section 1, item 3) |
| Form; mutation / cache / identity; grid; routing, auth or permissions; overlay or focus handling; new translation namespace; a store flag or library mode across handlers | `hunt` alone covers it |

- **Tier 3 - full fan-out** (sections 0-4). Two or more signals, and whenever the user asks.

**Rounds.** Fix the findings and re-review, up to **3 rounds**, then escalate to the user. A later round re-launches `gate`, plus each leg that raised an accepted finding; a leg whose previous round was CLEAN re-runs only when the fix diff, counted on its own, carries a signal that leg covers. Every round after the first is scoped: each previous finding gets a verdict, ADDRESSED or NOT ADDRESSED, and new findings are raised only inside the fix diff; anything else the reviewer notices goes to Observations and never extends the loop. **A fix the reviewer itself prescribed, applied verbatim and with its library claim verified against the installed source, does not buy a round of its own.** On hook code, a guard bypass nobody would type by accident is written into the known gaps in `.claude/hooks/README.md`, not closed with new guard code; a realistic slip or retry is a defect. A leg that is skipped, denied or unavailable is named in the reply - a review that did not happen must never read like one that passed.

Do not shorten the reviewers' report contract: a finding without its file:line, failure scenario and evidence can only be believed, not adjudicated. Shorten what reaches the reply instead.

## 0. Scope

Establish before launching anything:

- The diff: working tree (`git status --porcelain` + `git diff --stat`) or committed branch work (`git log --oneline <base>..HEAD`). Do not print the full `git diff` into the main context - every reviewer reads it itself. Enumerate untracked files explicitly - reviewers must read those in full, `git diff` will not show them.
- A one-paragraph feature summary and the exact file list.
- The deliberate-decisions list (what was chosen on purpose, with the why) and any measured ground truths (live-backend facts the code encodes).
- **The settled excerpt.** Grep `.claude/docs/decisions.md` for each changed file's name and for the diff's key identifiers (components, hooks, endpoints, config keys). Every matching entry goes into every reviewer's prompt verbatim, under "settled - do not re-file". The reviewer reports a finding that matches an entry under Observations as `settled (decisions.md)`, not as a defect - unless it brings evidence the entry did not have, which reopens it. No match: say so in the prompt, so an empty excerpt reads as searched, not forgotten.

## 1. Launch the reviewers - one message, parallel

Every prompt carries the **file list** explicitly - never "read `git diff` yourself". Beside it: the feature summary, the measured ground truths, the consumer list from the step-2 walk (`hunt` re-greps it and reports what it missed), and the deliberate-decisions list **as context, not law** - phrase each entry as "deliberate - here is why", never "do not flag". A reviewer who thinks a deliberate decision contradicts a written rule is producing exactly the finding this tier exists for. Require file:line plus a concrete failure scenario or fix per finding. Every fact handed over carries its provenance - `measured: <command or live request> -> <result>` when this thread ran it, `relayed from <agent or file>, not re-checked` otherwise; a count, site list or `file:line` is never relayed, this thread recounts it first. The prompt tells the reviewer to re-run a measured command (or the same search through a tool its own fence allows) rather than write a new one, to rely on a live request as measured (no reviewer has a browser), to verify a relayed fact before a conclusion rests on it, and to name in its report any conclusion resting on a handed fact it did not re-check. A completeness claim - the consumer list, a sibling sweep, a zero-hit search - is re-derived with the reviewer's own searches instead, never re-run. Each probe writer gets its own probe path and scratch subfolder in the prompt: `hunt` `<SRC_DIR>/__hunt_probe.ts` and `<scratchpad>/hunt/`, a second `hunt` `<SRC_DIR>/__hunt_probe2.ts` and `<scratchpad>/hunt2/`, `integration` `<SRC_DIR>/__hunt_probe_integration.ts` and `<scratchpad>/integration/`.

The lens set:

1. **gate re-run** (`gate` subagent) - the standard gate on the final diff; give it round-2 context: what changed since any earlier pass, so it re-verifies the deltas hardest.
2. **Adversarial bug hunt** (the `hunt` subagent, never an ad-hoc `general-purpose` prompt). Seed it with the angles specific to *this* change (row identity, export pipeline, cache keys, param completeness, stale closures, whatever the diff touches) and tell it to hunt beyond them. **When `hunt` already reviewed this task's plan at step 2b**, hand it that plan and its plan findings with their decisions: it confirms each one reached the code and hunts what the plan did not settle, instead of reviewing the design a second time (`hunt.md`, A diff after its plan).
3. **Integration review** (the `integration` subagent, never an ad-hoc `general-purpose` prompt). Seed it with the surfaces this diff touches; it asks the rest itself.

**`gate` owns the compiler.** Only `gate` runs the project's check command; the probe writers compile through their own scratchpad project (recipe in `hunt.md`). **No leg runs a full build** - a review that wants build evidence asks the main thread for it.

If a leg fails environmentally (sandbox error, unavailable CLI), substitute an equivalent reviewer and name the substitution in the final report - a review that did not happen must never read like one that passed. A substituted `gate` is not a `gate` launch to the Stop gate: the substitution is the reason in the session's review waiver.

## 2. Live probes - main thread, read-only

Static review cannot catch wrong data-shape assumptions - scales, units, sort vocabularies, fields that are always null. This lens is what a first endpoint consumer adds to the browser check (lifecycle step 7) - one pass, run as step 7 with these additions once the reviewers have returned, not a second visit to the app:

- Read the real request and response bodies of the touched surfaces, not only the rendered result.
- For new or newly consumed endpoints: verify value scales and units against what the UI assumes, and flip parameter vocabularies on rows with distinct values - a declared member the backend accepts while ordering nothing shows only live.
- Reads only. Anything that mutates real data needs the user's explicit approval, every time.
- With no server listening for this tree, this lens cannot run and must not be replaced by reading the code again: report the tier as **incomplete** and name the probes still owed.

## 3. Adjudicate and fix

Dedup, verify each finding against the code, fix what survives and reject the rest with a written reason (pre-existing and out of scope, factually wrong, contradicts a measured truth, cure worse than the disease). Run `<CHECK_COMMAND>` only after the round's `gate` has reported, and re-check in the running app anything a fix changed visibly.

## 4. Report

- Per reviewer: verdict and headline findings.
- Fixed: finding -> what changed, with file references.
- Rejected: finding -> reason.
- Skipped or substituted legs, named explicitly.
- What stays unverified and could really fail (lifecycle step 9).
- **Feed the library.** A defect that surfaces after the review - in the browser, or reported by the user later - adds its angle to **Attack angles** in `.claude/agents/hunt.md` in the same task, phrased as the check that would have caught it, under that section's budget.
