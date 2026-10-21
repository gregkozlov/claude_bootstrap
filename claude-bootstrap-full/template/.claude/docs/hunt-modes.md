# hunt - modes `area` and `refute`

Read by the `hunt` agent (`.claude/agents/hunt.md`) when the first word of its prompt is `area` or `refute`; mode `diff` never needs this file. Everything in `hunt.md` - Boundaries, the Attack angles, the Output verdict line and the `## Tree` block - still applies.

## Mode `area`

The prompt assigns a **scope** (a list of paths) and a **focus**. Your final message is consumed by an orchestrator, not a human - return only the report, no preamble, no closing chatter.

1. Grep `.claude/docs/decisions.md` (and any other decisions document the prompt names) for the scope's file names and key identifiers. A matching entry is settled: a finding it covers goes under Observations as `settled (decisions.md)`, unless you bring evidence the entry did not have.
2. Enumerate the scope with Glob, then **read every file in scope in full**. Do not sample. Large scopes are expected - budget for it.
3. Whenever impact depends on code outside the scope (consumers of a component, callers of a hook, the HTTP interceptors, the route guards, the translation files), Grep and read those call sites before judging.
4. Work the **Attack angles** against what the scope actually contains, and execute what is pure exactly as in the `diff` procedure.
5. Rate confidence 0-100 and keep only **>= 60**. This bar is lower than `diff`'s confirmed-only report on purpose: an area sweep is expected to feed a `refute` pass, which is what filters it.

**Output format (exact).** Per finding:

```
### Finding: <short title>
- Severity: Critical | High | Medium
- Category: bug | security | performance | ux | architecture | i18n
- Confidence: <0-100>
- Area: <screen / module>
- Files: <repo-relative path:line>, <path:line>
- Evidence: <short quoted code with line numbers>
- Description: <the mechanism - what the code does and why that is wrong>
- Impact: <what a user actually experiences>
- Recommendation: <concrete fix>
```

If there is nothing to report, write `No Medium+ findings.` End with:

```
### Coverage
- Read in full: <files/dirs>
- Skimmed or skipped: <files + reason>
- Checks not performed: <e.g. the probe compile could not run>
```

**Filing.** This schema is the hand-off format, not a backlog's. Whoever files these into the project's backlog rewrites each record as one item in that backlog's own item format, under the tier it earns; `Confidence` and `Evidence` are dropped, the mechanism and the recommendation stay as prose.

Three verified High findings are worth more than fifteen speculative ones. Every finding must cite the exact lines that prove it.

## Mode `refute`

The prompt hands you a batch of findings produced by another run. Your job is to **try to disprove each one** by reading the code yourself. Your final message is consumed by an orchestrator - return only the report.

1. Do step 1 of mode `area` for the batch's files, then for **every** finding in the batch:
2. Open every cited `file:line` and read enough surrounding code to understand the mechanism. Correct line numbers if they are off.
3. Grep for callers, consumers and mitigations elsewhere in the codebase (guards, interceptors, wrappers, query options). Something another system "probably" validates is not a mitigation in this codebase and not a finding about it - a finding whose only justification is speculation about another system is REFUTED.
4. Ask: does the described scenario actually occur? Is there a concrete sequence of user actions or server responses that triggers it? Is the severity right? Where a probe settles it - a pure module you can run, a type-level hole you can compile - probe it rather than arguing.
5. Check for duplicates within the batch (same root cause, different symptom).
6. Deliver a verdict. **Confirm only what you verified in code yourself.** If you genuinely cannot decide after reading, say UNVERIFIED and state exactly what would settle it - do not guess in either direction. A finding that is real but Low is DOWNGRADED, because Low is not publishable.

**Output format (exact).** Keep the batch order and the original titles.

```
### [<n>] <original title>
- Verdict: CONFIRMED | REFUTED | DOWNGRADED | UNVERIFIED | DUPLICATE_OF <m>
- Final severity: Critical | High | Medium | Low | n/a
- Category: <unchanged, or corrected>
- Area: <unchanged, or corrected>
- Files: <corrected repo-relative path:line list>
- Reasoning: <one paragraph: what you read, what you tried in order to refute it, why the verdict follows>
- Corrections: <only if CONFIRMED and the description, impact or recommendation was inaccurate - the corrected text; otherwise "none">
```

`Category` and `Area` are echoed from the input so a confirmed finding can be filed without re-joining it against the original batch. End with:

```
### Summary
- Confirmed: <n>, Refuted: <n>, Downgraded: <n>, Unverified: <n>, Duplicates: <n>
```
