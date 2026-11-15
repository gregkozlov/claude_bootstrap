---
name: crosscheck
description: The review policy for a finished change - the one place the review ladder lives. Load it after implementing any non-trivial change (lifecycle step 3, which picks the tier), and when the user says "/crosscheck", "cross-check", "independent audit", "review it with several subagents".
---

# crosscheck

Every review decision after implementation lives here (the tier at lifecycle step 3, the reviewers at step 5); if another file restates the ladder, this one wins. Lifecycle step 4's batch (`twins`, `comments` and the project's editor agents on their conditions) runs for every tier above 0, before this, except where lifecycle's re-entry rule skips it (a change outside `<SRC_DIR>/` and the config files).

## The ladder

Read the triggers, pick the tier, and name it in the reply with the trigger that set it. The user's word overrides in both directions.

The triggers below are generic defaults written for a frontend. [fill] Tune them to this project - the rule for a trigger is "a class of change that has produced a runtime bug before": name the project's own shared surfaces, its auth and routing files, its build and deploy configuration, its layout or plugin contracts, and move a class between tiers where the project's history says so.

| Tier | When | Reviewers |
| --- | --- | --- |
| 0 | Display literals, styles, copy without interpolation, a translation-only edit, a `.claude` doc-only change. Never tier 0: interpolated copy, a value shown as a percent, rate or ratio, arithmetic behind a displayed number or its formatter, a date boundary. | none |
| 1 | An ordinary change with none of the triggers below; a pure deletion proven unreachable. | `gate` |
| 2 | A form with the mutation that submits it; caching, invalidation or identity logic; a date, period or bucket boundary; arithmetic behind a displayed number or its formatter; a shared surface (shared components, the theme, the HTTP client, the stores, the internals of a shared table or grid) or a persisted-state shape; the first consumer of a new or changed endpoint or a schema regeneration (plus live probes); code under `.claude/hooks` or `.claude/scripts`. | `gate` + `hunt` |
| 3 | Auth, the HTTP interceptors, tokens; permissions, route guards, the route configuration; build or deploy configuration; a contract other consumers rely on; a feature across several pages; or the owner asks. | `hunt` on the plan before approval when step 2b ran (a contract change), then `gate` + `hunt`, then `drift` after the last round (lifecycle step 7) |

- A trigger counts only when the diff changes what makes the class - a form's fields or validation, a grid's rows or columns, a shared surface's props, defaults, exports or theme overrides, a store's shape.
- **A pure deletion is tier 1** only when the deleted code was proved unreachable by reading the installed library or the code that decides it, not asserted from a name or from the docs; write the proof into `gate`'s prompt so it re-checks that claim first. A deletion bundled with a rename, a default or a signature change is not this case.
- **A super-trivial edit** (the `CLAUDE.md` skip rule) **is tier 0.** A fix to a wrong displayed number is never super-trivial: it goes through `debug` and its task file.
- **"No subagents" is not tier 0:** no reviewer runs, and the main thread keeps the tier's obligations - the step-2 consumer walk, the live probes the tier owes, and each skipped reviewer named as not run in the reply.
- **`hunt` on a plan (step 2b):** the plan records each finding with its one-line decision (accepted or rejected, why) - a plan accepted with cleared context is all the new session has.
- **Rounds: at most two.** A second round runs only when a fix changed logic beyond what a reviewer prescribed verbatim: `gate` alone over the fix diff, plus `hunt` when the fix answers a `hunt` finding. Still open after round two: the user decides.
- No `refute` pass on a diff - the main thread adjudicates (below). `refute` is for area audits.

## The briefing - one message, parallel

`<CHECK_COMMAND>` has passed (lifecycle step 5); no reviewer runs the check chain, and no leg runs a full build - a review that wants build evidence asks the main thread for it. Launch every agent without a `model:` parameter - the frontmatter is the policy. Every prompt carries:

- the exact file list (untracked files named - `git diff` does not show them), never "read `git diff` yourself";
- the Brief in a short summary, and the step-2 consumer list (`hunt` re-greps it);
- the deliberate decisions, each as "deliberate - here is why", never "do not flag";
- the path `.claude/docs/decisions.md`, to grep for the changed files and identifiers - a finding an entry settles is reported as `settled (decisions.md)` under "Not pursued" unless it brings evidence the entry lacked;
- the reachability bar (`CLAUDE.md`, Working Principles): every finding states its click path; a borderline case is one "Not pursued" line;
- for `hunt`, the angles this change invites (row identity, cache keys, param completeness, a value scale, whatever the diff touches), and, when it reviewed the plan at step 2b, the plan with its findings and their decisions - it confirms each reached the code instead of reviewing the design again; probe path `<SRC_DIR>/__hunt_probe.ts` and `<scratchpad>/hunt/` (a second `hunt`: `<SRC_DIR>/__hunt_probe2.ts`, `<scratchpad>/hunt2/`); every probe file is deleted before it reports.

A leg that fails environmentally is substituted by an equivalent reviewer or named as skipped in the reply - a review that did not happen must never read like one that passed.

## Live probes

Static review cannot catch wrong data-shape assumptions - scales, units, sort vocabularies, fields that are always null. For the first consumer of a new or changed endpoint, a schema regeneration, and displayed arithmetic, the browser check (lifecycle step 6, `verify-live`) adds, once the reviewers have returned:

- the real request and response bodies of the touched surfaces, not only the rendered result;
- value scales and units against what the UI assumes, and parameter vocabularies flipped on rows with distinct values - a declared member the backend accepts while ordering nothing shows only live;
- reads only; anything that mutates real data needs the user's explicit approval, every time;
- with no server listening for this tree, this lens cannot run and must not be replaced by reading the code again: the tier is **incomplete** and the owed probes are named.

## Adjudicate

Each finding is checked against the code and the reachability bar and accepted or rejected with a one-line reason (pre-existing and out of scope, factually wrong, contradicts a measured fact, outside the bar, cure worse than the disease). Reviewers are input, not verdicts. Each decision goes into the task file in one line. When a reviewer offers a minimal fix (drop the offending element) and a fuller one, on a visual or designer-sourced ticket the fuller fix that serves the ticket's stated goal wins over the smaller diff - take it or ask; "out of scope" is for a fix the ticket does not ask for.

## Report

**The closing reply carries the findings ledger**: every finding any agent raised in the task (the plan review, every reviewer and checker agent, a live probe), one line each - source, the defect in plain words, its fate: fixed (what changed), not fixed (outside the bar, the owner's call - with the reason) or not pursued. Then skipped or substituted legs, and the tier with the trigger that set it.
