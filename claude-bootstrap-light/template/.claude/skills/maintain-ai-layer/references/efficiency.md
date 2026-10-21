# efficiency mode

The other modes ask whether the layer is **true**. This one asks whether it is **cheap for what it buys**: where the pipeline is slow, does work nobody uses, or spends context and tokens with no visible result. On a layer whose whole point is a small budget, that is the question that matters most. The deliverable is a report of weak places, each with a default fix, and after the owner's answer the applied fixes.

## What is not a finding

- **The price of the lifecycle's launches as such** - `hunt` on the plan and the diff, `drift` when a doc names what changed. A finding is cost **without a result**: a launch whose findings are mostly rejected, a check re-run on a tree state already checked, context loaded and never used. "Costs a launch and catches defects" is not a finding; "costs a launch and catches nothing" is.
- **Settled decisions** - the standing rule applies; a case for reopening one goes to Observations, with numbers.
- **A weaker guard.** A prohibition, `guard`, the deny list are never "optimized" away. Making one cheaper (a narrower matcher, a faster path) is a finding; making it weaker is not.
- Product code in the source directory - one line in Observations at most.

## What this mode may read

This mode, and only this mode, reads past the session boundary - read-only, for statistics: the transcripts of the last 30 days, `*.jsonl` (and the subagent transcripts in the same-named folders) under `~/.claude/projects/<slug>/` of this tree and of each worktree `git worktree list` names (the slug as `deep.md` D5 derives it), and `.claude/handoff.md`. **Never with Read** - only through a `node` script in the scratchpad that prints aggregates. No raw transcript text goes into the report or the run file.

## E1. Baseline

The `references/weekly.md` step 1 commands, then measure into the run file:

- **Always-on bytes:** `wc -c` of `CLAUDE.md`, `~/.claude/CLAUDE.md` and the memory `MEMORY.md`; rule text without `paths:`; the frontmatter `description` of every agent and every model-invocable skill.
- **Checks:** the project's check command (with a `timeout` long enough for the whole chain, awaited), then once more on the same tree; the time of each leg.
- **Hooks:** for every hook registered in `settings.json` / `settings.local.json`, one run of a scratch copy on a typical stdin payload file, timed, with `TMP`, `TEMP`, `TMPDIR` and `CLAUDE_PROJECT_DIR` pointed into the scratchpad; and how many hooks fire on one `Edit`, one `Bash`, one `Read`.

## E2. Inventory and evidence

1. **Load map** - every layer file, its size, and when it loads: always / by `paths:` / when its skill is invoked / when its agent launches / on every tool call. Save it as `<scratchpad>/inventory.md`.
2. **Transcript aggregates** (the script from "What this mode may read"), at least:
   - tokens per session (`usage`: input, cache read, cache creation, output);
   - tool calls by type; the same file Read more than once in one context; whole Reads of files over 500 lines;
   - tool-result size by tool - which outputs flood the main thread (the check command, agent reports);
   - check-command runs: count, duration, the leg that failed, re-runs with no edit in between;
   - hook and permission denials followed by a retry, and the calls each loop cost;
   - agent launches per task: type, model, prompt size, reply size, duration - against the lifecycle's budget of three;
   - skill loads from the `Skill` tool calls and the slash-command entries (`<command-name>`), and which skill never loaded in 30 days.

This layer keeps no ledger of verdicts, so how many of an agent's findings were accepted is read from the replies that followed its report, or marked `HYPOTHESIS`. A finding that rests on neither the load map nor a number is marked `HYPOTHESIS`.

## E3. Audit by area

Launch one `general-purpose` agent per area, in parallel, read-only apart from its own report file `<scratchpad>/eff-<area>.md`; it returns a 10-15 line summary, and the main thread reads the file as it verifies. Each prompt carries: its area and the files it may read, `<scratchpad>/inventory.md`, "What is not a finding" verbatim, the matching `references/settled.md` entries, and the finding format below.

1. **Always-on context and memory** - both `CLAUDE.md` files, rules without `paths:`, globs wider than their text needs, skill and agent descriptions, `MEMORY.md` and memory that repeats the layer; one text in several files; text one step needs that loads always; instructions for changes long applied.
2. **Process** - `CLAUDE.md` Development Workflow, `debug`, `handoff`, `retro`: tasks sent down a heavier path than their class needs, the trivial / bounded / contract thresholds, the check command run more often than the steps ask, skill loads that could be shorter.
3. **Agents** - `hunt` and `drift`: what each re-reads that the main thread already holds, definition length, how much of each reply format the main thread actually uses, the accepted share.
4. **Hooks, settings and checks** - latency per call, matcher breadth, node start-ups per tool call; allow / deny lists that cause prompts and retries; the check command (fail-fast order, legs that could run in parallel, work repeated on an unchanged tree, output that lands in context unfiltered).

Each agent also lists what it checked and found fine.

**Finding format:**

```
### <id> <title>
- Where: <file:line, script or hook>
- Class: slow | needless work | tokens without result | dead weight
- Symptom:
- Evidence: a number from the baseline or inventory, file:line, a transcript aggregate - or HYPOTHESIS
- Frequency: every session | every tool call | every task | rare
- Default fix: the concrete edit (file, what changes)
- Alternative:
- What is lost: the guarantee or convenience that goes; "nothing" only when checked
- Settled overlap: none | <settled entry>
```

## E4. Verify

No finding is reported on trust: one command or measurement of your own confirms its evidence. A `HYPOTHESIS` is measured or listed as unverified with how to check it. Rejections go to the run file with the reason; findings against settled decisions go to Observations; duplicates across areas merge.

## E5. Report and approval stop

Write `<scratchpad>/efficiency-<yyyy-mm-dd>.md`, in the user's language, marked DRAFT from E4 on:

1. **Summary** - the baseline, the five costliest places, the expected total gain (tokens per task, always-on bytes, calls).
2. **Table**, sorted by effect (frequency x cost): `# | where | class | evidence | effect | default fix | what is lost | target` - target being layer edit / hook or settings / check command / owner decision.
3. **Details** per finding, in the E3 format.
4. **Checked, not a problem.**
5. **Unverified hypotheses.**
6. **Observations** on settled decisions.
7. **Sync** - which approved fixes touch text another copy of this layer shares (a sibling project, the template it came from); the owner ports them.

Then **stop**: show the table in the chat and ask what to apply. Every item defaults to its default fix - the owner answers with exceptions only ("all, except 4 and 9; 7 take the alternative"). Questions go by the `CLAUDE.md` rule: one `AskUserQuestion` for up to four, more as a numbered list in the chat. Run `handoff` before the stop, with the report's table in it: the answer may arrive in another session, and the scratchpad does not outlive this one.

## E6. Apply

- Apply what the owner approved, under the standing rules.
- **Hooks and `settings*.json` are editable in this mode** with Edit, for the items the owner approved one by one; a changed hook is re-run on the E1 payloads plus one payload per branch it changed, its decisions compared before and after, its self-tests (`.claude/hooks/tests/*.mjs`) pass, and `.claude/hooks/README.md` follows it. If the classifier refuses, ask for a grant and retry; never route around it.
- A change to a hook's logic gets `hunt` in `diff` mode, with the diff, its consumers and this report; its findings are checked, not trusted.
- Then repeat the E1 measurements, write the before -> after table into the report, and drop the DRAFT mark. Add each owner decision and each accepted rejection to `references/settled.md`.
