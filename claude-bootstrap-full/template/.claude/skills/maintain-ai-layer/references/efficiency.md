# efficiency mode

The other modes ask whether the layer is **true**. This one asks whether it is **cheap for what it buys**: where the pipeline is slow, does work nobody uses, or spends context and tokens with no visible result. The deliverable is a report of weak places, each with a default fix, and after the owner's answer the applied fixes.

## What is not a finding

- **The price of the review ladder as such.** A project that installs this ladder pays for subagents and reviews on purpose. A finding is cost **without a result**: an agent whose findings are mostly rejected or repeat another agent's, a check re-run on a tree state already checked, context loaded and never used. "Expensive and catches defects" is not a finding; "expensive and catches nothing" or "catches the same thing twice" is.
- **Settled decisions** - the standing rule applies; a case for reopening one goes to Observations, with numbers.
- **A weaker guard.** A prohibition, `guard`, the deny list, a parity or consistency checker are never "optimized" away. Making one cheaper (a narrower matcher, a faster path, a cache) is a finding; making it weaker is not.
- Product code in `<SRC_DIR>/` - one line in Observations at most.

## What this mode may read

This mode, and only this mode, reads past the session boundary - read-only, for statistics:

- every session folder's `agents.md`, `task-*.md` and `handoff.md`, under `.claude/sessions/` of this tree and of each other worktree `git worktree list` names;
- the transcripts of the last 30 days: `*.jsonl` (and the subagent transcripts in the same-named folders) under `~/.claude/projects/<slug>/` of this tree and of each worktree (the slug as `deep.md` D6 derives it). **Never with Read** - only through a `node` script in the scratchpad that prints aggregates. No raw transcript text goes into the report or the task file.

## E1. Baseline

The `references/weekly.md` step 1 commands, then measure into the task file:

- **Always-on bytes:** `wc -c` of `CLAUDE.md`, `~/.claude/CLAUDE.md` and the memory `MEMORY.md`; rule text without `paths:`; the frontmatter `description` of every agent and every model-invocable skill.
- **Checks:** `<CHECK_COMMAND>` (`timeout` 600000, awaited), then once more on the same tree; the time of each leg.
- **Hooks:** for every hook registered in `settings.json` / `settings.local.json`, one run of a scratch copy on a typical stdin payload file, timed, with `TMP`, `TEMP`, `TMPDIR`, `LOCALAPPDATA`, `XDG_CACHE_HOME` and `CLAUDE_PROJECT_DIR` pointed into the scratchpad and a made-up session id - the real hook on a real payload writes the live gate's state and the ledger E2 reads; and how many hooks fire on one `Edit`, one `Bash`, one `Read`.

## E2. Inventory and evidence

1. **Load map** - every layer file, its size, and when it loads: always / by `paths:` / when its skill is invoked / when its agent launches / on every tool call. Save it as `inventory.md` in the session folder.
2. **Transcript aggregates** (the script from "What this mode may read"), at least:
   - tokens per session (`usage`: input, cache read, cache creation, output);
   - tool calls by type; the same file Read more than once in one context; whole Reads of files over 500 lines;
   - tool-result size by tool - which outputs flood the main thread (the check command, agent reports);
   - check-command runs: count, duration, the leg that failed, re-runs with no edit in between;
   - hook and permission denials followed by a retry, and the calls each loop cost;
   - agent launches: type, model, prompt size, reply size, duration;
   - rule loads from the `record-loads` log (`rules-reach.mjs --loads`, 15 days at most - the hook prunes older records), and which rule never loaded in that window; skill loads from the transcripts' `Skill` tool calls and their slash-command entries (`<command-name>`; a skill with `disable-model-invocation` leaves no other trace), and which skill never loaded in 30 days.
3. **Ledger aggregates** - per agent type: launches (the `agents.md` rows the hook wrote), verdicts and findings accepted vs rejected (read from the verdict edits and the `task-*.md` findings, which have no fixed shape - a count you could not read is marked `HYPOTHESIS`).

A finding that rests on neither the load map nor a number is marked `HYPOTHESIS`.

## E3. Audit by area

Launch one `general-purpose` agent per area, in parallel, read-only apart from its own report file `<scratchpad>/eff-<area>.md`; it returns a 10-15 line summary, and the main thread reads the file as it verifies. Each prompt carries: its area and the files it may read, `inventory.md`, "What is not a finding" verbatim, the matching `settled.md` / `decisions.md` entries, and the finding format below.

1. **Always-on context** - both `CLAUDE.md` files, rules without `paths:`, globs wider than their text needs, skill and agent descriptions, `MEMORY.md`; one text in several files; text one step needs that loads always; instructions for changes long applied.
2. **Process** - `lifecycle`, `crosscheck`, `debug`, `verify-live`, `precompact`: one check repeated across steps 4, 6, 8 and the Stop gate; tasks sent down a heavier path than their class needs; the trivial / bounded / architectural thresholds; re-entry loops; skill loads that could be shorter.
3. **Agents** - overlap between `gate`, `hunt`, `integration`, `twins`, `drift`, `comments` and the project's editor agents; what each re-reads that the main thread already holds; definition length; how much of each reply format the main thread actually uses; the accepted share from the ledgers.
4. **Hooks and settings** - latency per call, matcher breadth, node start-ups per tool call, work two hooks repeat, `verify-gate` against the check command and `gate`; allow / deny lists that cause prompts and retries.
5. **Scripts and checks** - the check command (fail-fast order, legs that could run in parallel, work repeated on an unchanged tree), `rules-reach`, `run-pure*`, `dev-servers` and the project's own checkers; the compiler's incrementality, the linter's cache; output that lands in context unfiltered.
6. **Memory, docs, sessions** - stale memory, memory that repeats the layer, `.claude/docs/*` nobody reads, session artifacts that are written and never read.

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
- Settled overlap: none | <decisions / settled / memory entry>
```

## E4. Verify

No finding is reported on trust: one command or measurement of your own confirms its evidence. A `HYPOTHESIS` is measured or listed as unverified with how to check it. Rejections go to the task file with the reason; findings against settled decisions go to Observations; duplicates across areas merge.

## E5. Report and approval stop

Write `efficiency-<yyyy-mm-dd>.md` into this session's artifact folder, in the user's language, marked DRAFT from E4 on:

1. **Summary** - the baseline, the five costliest places, the expected total gain (time per task, always-on bytes, calls).
2. **Table**, sorted by effect (frequency x cost): `# | where | class | evidence | effect | default fix | what is lost | target` - target being layer edit / hook or settings / script / owner decision.
3. **Details** per finding, in the E3 format.
4. **Checked, not a problem.**
5. **Unverified hypotheses.**
6. **Observations** on settled decisions.
7. **Sync** - which approved fixes touch text another copy of this layer shares (a sibling project, the bootstrap it came from); the owner ports them.

Then **stop**: show the table and ask what to apply. Every item defaults to its default fix - the owner answers with exceptions only ("all, except 4 and 9; 7 take the alternative"). Questions go by the `CLAUDE.md` rule: up to four through `AskUserQuestion`, more as a numbered list in the chat. Run `precompact` before the stop: the answer may arrive in another session, which the owner points at this folder.

## E6. Apply

- Apply what the owner approved, under the standing rules.
- **Hooks and `settings*.json` are editable in this mode** with Edit, for the items the owner approved one by one; a changed hook is re-run on the E1 payloads plus one payload per branch it changed, its decisions compared before and after, and `.claude/hooks/README.md` follows it. If the classifier refuses, ask for a grant and retry; never route around it.
- A change to a script's or hook's logic gets the review `crosscheck` gives `.claude/hooks` / `.claude/scripts` code (tier 2 at least: `gate` and `hunt`, launched without a `model:` override), with the diff, its consumers and this report; its findings are checked, not trusted.
- Then repeat the E1 measurements, write the before -> after table into the report, and drop the DRAFT mark. Add each owner decision and each accepted rejection to `settled.md`.
