---
name: maintain-ai-layer
description: Periodic upkeep of the AI layer (CLAUDE.md, .claude/rules, agents, skills, scripts, hooks README) against the current code - `weekly` (default) is a whole-layer mechanical pass plus the recent hotspots, `deep` a full code-vs-layer audit. Use on "/maintain-ai-layer", "maintain the AI layer", "AI layer upkeep", "weekly maintenance", "deep audit of the AI layer".
argument-hint: "[weekly | deep]"
---

# maintain-ai-layer

The AI layer rots quietly: a file moves and a rule still names it, a count grows, a glob matches nothing or a whole rule loads for files it never mentions, and an agent still describes a mode nobody uses. This skill is the recurring pass that fixes that. It never touches `<SRC_DIR>/`. The deliverable is the edited layer plus the report.

## Mode

The argument picks the mode, and the first line of the reply names it:

- **`weekly`** (also `weekly-maintenance`, and the default with no argument) - the whole layer, shallow: every mechanical check, the counts, rule loading, and a semantic `drift` pass limited to the rules the last 14 days of code touched. Run it every week or two.
- **`deep`** (also `deep-audit`) - everything `weekly` does, then a `drift` fact-check of every layer file, a code-to-layer sweep, a per-section rule-loading audit, cross-file consistency, the hooks and the memory.

## Standing rules (both modes)

**This skill applies what it verified itself**, with no approval round: every stale fact, dead line, misplaced text, glob and fixture change goes in once it has been checked against the code. These limits still hold, because they come from `CLAUDE.md` and this skill cannot lift them:

- **Check every finding before applying it.** An agent's `replace:` / `with:` pair is re-verified with one command of your own before the Edit. A finding you reject is logged with its reason.
- **Where text lives:** a prohibition stays in `CLAUDE.md`, and detail goes to the `.claude/rules/*.md` file whose `paths:` reach the code it describes. `CLAUDE.md` stays under 48 KB as measured by `wc -c`. A rule without `paths:` loads in every session, and a nested `CLAUDE.md` never takes overflow. Read `CLAUDE.md` "Surgical Changes" for the order in which text is cut.
- **`paths:` changes pass `node .claude/scripts/rules-reach.mjs --check`.** A glob is never widened to make a fixture pair pass: the text moves instead. When text moves, the fixture pair's `rule` / `needle` moves with it. A pair is deleted only when its claim was deleted. A new or narrowed glob gets a `must` pair, and a glob that must stay out of a folder gets a `mustNot` pair.
- **The code is not the doc's servant.** When code violates a policy in several places, the policy is rewritten only if `git log` shows a deliberate move away from it. Otherwise it is a code finding for the report, and this skill never fixes it.
- **Settled is settled.** `.claude/docs/decisions.md` and the "settled and deliberate" items in `CLAUDE.md` are not reopened. A finding against one goes to the report's Observations. Findings earlier runs settled are in `references/settled.md`: every agent prompt carries that list, a matching finding is logged as settled and not reported, and the run appends each new owner answer and each accepted rejection to it.
- **Never edited, only reported:** `.claude/hooks/**` code, `.claude/settings*.json`, the generated and protected paths (`<GENERATED_PATHS>`), `.claude/docs/decisions.md`, the project's backlog. Memory files other than the `MEMORY.md` index are rewritten or deleted only after the owner confirms.
- **The layer is team-shared.** A personal preference never goes into `CLAUDE.md` or a rule: it goes to `CLAUDE.local.md`, or into the report as a suggestion.
- **Edits use Edit / Write only.** No commits, and plain hyphens. If the branch is not the default one, say so before the first edit - an AI-layer edit riding on a feature branch is the owner's call. If the auto-mode classifier refuses a `.claude/` edit, ask the owner for a grant and retry. Never route the edit through another tool.
- **Record the run.** Open `task-ai-layer-<mode>.md` in this session's artifact folder. It holds the mode, the baseline numbers, every finding with its decision (applied, rejected with the reason, reported), and the numbers after. Every agent prompt names the files it may read and carries the list of decisions already taken in this run.
- **Every agent this skill launches runs on Sonnet**: pass `model: "sonnet"` on each `Agent` call - a mechanical fact-check does not need the review model. `drift` keeps its frontmatter `effort: high`; the built-in `Explore` has no effort setting to pass.

## weekly

### 1. Baseline

Run these, and copy the numbers into the task file:

```bash
git -C <root> branch --show-current && git -C <root> log --oneline -1 && git -C <root> status --short
wc -c <root>/CLAUDE.md
node <root>/.claude/scripts/rules-reach.mjs             # weight report: per-file rule text, per-rule reach, globs matching nothing
node <root>/.claude/scripts/rules-reach.mjs --check     # fixture + glob shape
node <root>/.claude/scripts/rules-reach.mjs --loads     # every rule load of the last 15 days against the model
node <root>/.claude/skills/maintain-ai-layer/layer-refs.mjs   # dead paths, package scripts, skill and agent names in every tracked *.md
git -C <root> log --since=14.days --name-only --format= -- <SRC_DIR> | sort | uniq -c | sort -rn | head -40
```

### 2. Mechanical fixes

- **`layer-refs` hits.** Find where each dead reference went (`git log --diff-filter=R --name-status -- <old path>`, or grep the identifier) and correct it. A path that is deliberately named as something that must not exist (a forbidden folder, a placeholder in an example) is not stale. Leave it, and note it once in the task file.
- **`rules-reach` problems.** Fix every `SHAPE` line, every `FAIL` and `WARN` from `--check`, and every "Globs matching nothing" cell. For such a glob, find where its code went, and point the glob there or drop it. A rule left with no glob at all is merged into a neighbour or deleted.
- **`--loads` findings.** A `PARSER`, `REACH` or `ALWAYS` line is the real loader disagreeing with `rules-reach.mjs`: fix the script and `.claude/rules/rules-reach.md` against it. A missing-field `FAIL` means a payload field was renamed: read one record and fix the names `rules-reach.mjs` reads; a renamed `load_reason` also goes to the report, since `record-loads.mjs` prunes on it and this skill never edits a hook. An empty log in this tree means `record-loads.mjs` is not firing. "No rule load left to check" means nothing was verified: every load predates a rule edit, or no rule was read since - say so in the report, not as a pass.

### 3. Counts

Launch one `Explore` agent ("very thorough", read-only) on `CLAUDE.md` and `.claude/rules/*.md`. It finds every **count claim** - a number or number word attached to something countable ("the six hooks", "all seven domains", "two routes", "a handful of sites") - re-measures each one with a command, and returns only the wrong ones, as exact `replace:` / `with:` pairs with the command it ran. Where a count keeps drifting, it proposes the grep that replaces the count.

### 4. Hotspot drift

Match the step 1 `git log` file list against each rule's globs (the `rules-reach` report shows reach per rule). Take the **three rules** that the most changed files reached. Then take the **`CLAUDE.md` sections** that describe the same areas, at most two. Launch the `drift` agent in `section <name>` mode on each, all in parallel. Tell each run to print only the non-`holds` entries and the tally.

### 5. Rule loading

From the `rules-reach` report:

- **Heavy files.** Take the three files with the most rule text. For each rule loaded there, read its `##` headings and decide whether the file needs that text. When a whole rule is irrelevant to a glob's files, narrow the glob. When only one section is irrelevant, move that section to the rule whose globs fit it. After the change, `--check` must pass.
- **Always-on text.** Rules without `paths:` are already `SHAPE` lines. Also measure the frontmatter `description` of every skill and agent, because those load in every session and in every agent list: `grep -h "^description:" .claude/skills/*/SKILL.md .claude/agents/*.md | awk '{print length}'`. A description over ~400 characters is trimmed to its trigger phrases.
- **`CLAUDE.md` text that only one area needs** (a mechanic, not a prohibition) becomes a pointer, and the detail moves to the rule that loads with that area.

### 6. CLAUDE.md, agents, skills

- **`CLAUDE.md`:** delete text that is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph a loaded rule already says. Report the bytes before and after.
- **Agents:** check that each `tools:` line fits its body. An agent told to edit needs `Edit`. A "read-only" agent with `Edit` or `Write` must have a stated reason (the compile probe). Every mode that a skill or `CLAUDE.md` asks an agent for (`drift section`, and any mode a project agent carries) must exist in that agent's body. To check, grep `CLAUDE.md` and `.claude/skills` for each agent's name, then compare the modes they ask for with the agent file.
- **Skills:** check that each step a skill hands to another skill or agent names one that exists (`layer-refs` covers the names). Check that the step numbers other files cite (`lifecycle step N`) match the `lifecycle` skill: `grep -rn "step [0-9]" CLAUDE.md .claude`.

### 7. Verify and report

Re-run the step 1 commands. Then run `<CHECK_COMMAND>`: a failure in a file this run did not touch belongs to a parallel session, so say so and leave it. Then write the report (below).

## deep

Run `weekly` steps 1-3, 5 and 6 in full, but skip step 4: step D1 covers every file. Then:

### D1. drift over every unit

The units are:

- each `##` and `###` section of `CLAUDE.md` (`grep -n "^##" CLAUDE.md`);
- each `.claude/rules/*.md`;
- each `.claude/agents/*.md`;
- each skill's `SKILL.md` plus its `references/*.md`;
- `.claude/hooks/README.md`;
- every tracked README under `<SRC_DIR>/`.

Run one `drift` in `section` mode per unit, in waves of **eight in parallel**. Each prompt asks for the non-`holds` entries plus the tally only, and carries this run's decisions so far. Between waves, check and apply the returned pairs, so that the next wave reads the corrected text.

### D2. Code to layer

Launch three `Explore` agents in parallel ("very thorough", read-only), each over one area of `<SRC_DIR>/`:

[fill] Split `<SRC_DIR>/` into three areas of roughly equal size by top-level folder - for example (a) the shared components, utilities, constants and state, (b) the pages or screens, (c) everything else except generated code - and list them here as (a), (b), (c).

Each prompt lists the layer files and asks for three things:

1. Conventions that a competent newcomer would get wrong and that no layer file states, each with at least three sites as evidence.
2. Shared components, helpers or hooks that the layer should point to but never names. Example: a rule says to build X, and X already exists.
3. Every policy in `CLAUDE.md` or a rule that the code breaks, with the site count.

Then decide on each. A real convention gets one line in the rule whose `paths:` reach it. A new rule file is created only when no rule reaches that code, and it gets `paths:` plus a fixture `must` pair. Policy breaks go through the "code is not the doc's servant" rule above.

### D3. Rule loading, per section

For every rule, map each `##` section to the globs its text needs. A section that serves a strict subset of the globs moves to a rule with narrower globs, or splits into one. A rule whose globs serve none of its sections has its globs narrowed. Record the `rules-reach` median, top-decile, max and "files over 30 KB" before and after, and add fixture pairs for everything moved.

**Then probe the loader itself.** `rules-reach.mjs` models Claude Code's rule loader, whose Read trigger alone is documented, and `--loads` only sees the loads that happened, never the one that should have and did not. `record-loads.mjs` records what the loader does, so the probe agent only drives: its own account of what was injected is not evidence. Launch one fresh `general-purpose` agent, read-only, that never opens anything under `.claude/` (a rule whose file it read is not injected again) and makes exactly these calls, one per step. A load carries no agent id, so pick every step's file so that no other step's file reaches its rules; a load then names its step by its trigger path alone:

- Grep, Bash `head` and Glob on a file one rule matches, and no later step reaches that rule - expect no load of it;
- a Read of a file, then a second Read of it - expect its rules once;
- a file matched only through a brace alternative other than the first;
- a file matched only through a trailing `/**` glob;
- a wrong-case path to a matched file (on a case-insensitive file system);
- a matched file outside `<SRC_DIR>/`, if any rule has one.

Predict each step from the globs and write the predictions into the task file before the launch. Every context of the session writes to the same log, so launch only once no other agent of this session is still running, write the time (`date '+%F %T'`) into the task file just before the launch, and let the main thread Read nothing until the agent returns. Then `node .claude/scripts/rules-reach.mjs --loads <this session's id prefix>` lists the session's loads in order with their triggers: the probe's are the rows after that time whose trigger is a probe step's file. No such row for the first Read means `record-loads.mjs` is not firing or a field moved - check its registration in `.claude/settings.json`, then one record (`.claude/hooks/README.md`), before reading anything into the list. Past that control, a predicted load that is missing, one nobody predicted, or any `PARSER` / `REACH` / `ALWAYS` line means `rules-reach.mjs` and `.claude/rules/rules-reach.md` are stale: fix both, and record the probe table in the task file.

### D4. Cross-file consistency

Check that each rule is stated once. Find a statement that appears in two files with different content: grep its key phrase across `CLAUDE.md` and `.claude`. The copy that survives is chosen by the "where text lives" rule above.

Two more checks:

- The review ladder lives only in the `crosscheck` skill, and the lifecycle steps only in `CLAUDE.md` and the `lifecycle` skill. A restatement elsewhere becomes a pointer.
- Each agent's description matches how the skills and `CLAUDE.md` launch it.

### D5. Hooks and settings (report only)

Every command in `.claude/settings.json` and `.claude/settings.local.json` `hooks` must point to an existing file, and every hook file must be registered and described in `.claude/hooks/README.md`. The README is fact-checked in D1. A mismatch goes to the report, and nothing under `.claude/hooks/` or in `settings*.json` is edited.

### D6. Memory

The memory folder is the one Claude Code keeps for this project: `~/.claude/projects/<slug>/memory/`, where the slug is the project's absolute path with every character other than a letter or a digit turned into `-`.

- Run `node <root>/.claude/skills/maintain-ai-layer/layer-refs.mjs <memory folder>`.
- Check that `MEMORY.md` lists every file in the folder once, and that every line points to an existing file. Fix the index directly.
- For each memory whose fact the code or the layer now contradicts (a named file or flag gone, a decision `CLAUDE.md` reversed, a duplicate of a layer rule), write one line in the report: the file, the contradiction, and the proposed action (update or delete). Change nothing until the owner confirms.

### D7. Workflow walk

A `drift` run checks one unit, so a break at the seam between two steps passes every run. This step walks whole tasks through the lifecycle. Launch two `general-purpose` agents in parallel, read-only: they may run `grep`, `ls` and `git log`, and they never edit or write a file. Each one reads the `CLAUDE.md` "Development Workflow" section, the `lifecycle`, `crosscheck`, `debug`, `verify-live` and `precompact` skills, every `.claude/agents/*.md`, `.claude/rules/session-artifacts.md`, `.claude/hooks/README.md`, the hook files, and the `hooks` block of `.claude/settings.json`. They do not read any session folder.

- (a) walks a **bounded** fix, and then the same fix as **super-trivial** and under "no subagents";
- (b) walks an **architectural** change through plan mode, and a **bug report** through `debug`.

At every step, the agent checks:

- **Inputs:** what the step needs, and which earlier step produces it.
- **Outputs:** what the step hands on, and who consumes it.
- **Agent prompts:** what the step says to put in an agent's prompt, against what that agent's body demands, its `tools:` and its modes.
- **The session folder:** what gets written there, and by whom.
- **Hooks:** what a hook does at that point (`guard`, `record-activity`, `verify-gate`), against what the step expects.
- **Skip and re-entry:** whether those rules agree across files.

Each agent returns only the breaks. A break is a step that cannot run as written, an input nothing produces, or two files that disagree. Each break comes with the scenario, the step, and both texts quoted verbatim. The fix is either an exact `replace:` / `with:` pair or "design question for the owner". A contradiction with one plainly right side is applied under the standing rules. A process gap, such as a missing step, a reorder, or a defect that passes every reviewer, goes to the report as a proposal, because the shape of the process is the owner's call. A break in hook code goes to the report only.

### D8. Verify and report

Same as `weekly` step 7.

## Report

The report is in the user's language and says:

1. **Mode and what ran** - each agent type with its count (for example: `drift` x31 in 4 waves, `Explore` x4), and every step skipped, with the reason.
2. **Numbers, before -> after** - a table with: `CLAUDE.md` bytes; the rules-reach median, top-decile and max; files over 30 KB; `layer-refs` unresolved; the `--check` and `--loads` results; `<CHECK_COMMAND>`.
3. **Applied** - grouped by file, one line per change.
4. **Reported, not applied** - hooks and settings, code findings, findings against settled decisions, workflow design proposals from D7, memory awaiting confirmation. Each item is answerable in one line.
5. **Not checked** - `unverifiable` claims, and anything skipped.

The detail stays in the task file. The reply does not paste agent reports.
