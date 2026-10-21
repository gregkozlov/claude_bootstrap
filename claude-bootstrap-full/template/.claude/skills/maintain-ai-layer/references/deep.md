# deep mode

Run `references/weekly.md` steps 1-3, 5 and 6 in full, but skip step 4: step D1 covers every file. Then:

## D1. drift over every unit

The units are:

- each `##` and `###` section of `CLAUDE.md` (`grep -n "^##" CLAUDE.md`);
- each `.claude/rules/*.md`;
- each `.claude/agents/*.md`;
- each skill's `SKILL.md` plus its `references/*.md`;
- `.claude/hooks/README.md`;
- each `.claude/docs/*.md`;
- every tracked README under `<SRC_DIR>/`.

Run one `drift` in `section` mode per unit, in waves of **eight in parallel**. Each prompt asks for the non-`holds` entries plus the tally only, and carries this run's decisions so far. Between waves, check and apply the returned pairs, so that the next wave reads the corrected text.

## D2. Code to layer

Launch three `Explore` agents in parallel ("very thorough", read-only), each over one area of `<SRC_DIR>/`:

[fill] Split `<SRC_DIR>/` into three areas of roughly equal size by top-level folder - for example (a) the shared components, utilities, constants and state, (b) the pages or screens, (c) everything else except generated code - and list them here as (a), (b), (c).

Each prompt lists the layer files and asks for three things:

1. Conventions that a competent newcomer would get wrong and that no layer file states, each with at least three sites as evidence.
2. Shared components, helpers or hooks that the layer should point to but never names. Example: a rule says to build X, and X already exists.
3. Every policy in `CLAUDE.md` or a rule that the code breaks, with the site count.

Then decide on each. A real convention gets one line in the rule whose `paths:` reach it. A new rule file is created only when no rule reaches that code, and it gets `paths:` plus a fixture `must` pair. Policy breaks go through the "code is not the doc's servant" standing rule in `SKILL.md`.

## D3. Rule loading, per section

For every rule, map each `##` section to the globs its text needs. A section that serves a strict subset of the globs moves to a rule with narrower globs, or splits into one. A rule whose globs serve none of its sections has its globs narrowed. Record the `rules-reach` median, top-decile, max and "files over 30 KB" before and after, and add fixture pairs for everything moved.

**Then probe the loader itself.** `rules-reach.mjs` models Claude Code's rule loader, whose Read trigger alone is documented, and `--loads` only sees the loads that happened, never the one that should have and did not. `record-loads.mjs` records what the loader does, so the probe agent only drives: its own account of what was injected is not evidence. Launch one fresh `general-purpose` agent, read-only, that never opens anything under `.claude/` (a rule whose file it read is not injected again) and makes exactly these calls, one per step. A subagent's load carries its `agent_id`, but `--loads` lists by trigger, so pick every step's file so that no other step's file reaches its rules; a load then names its step by its trigger path alone:

- Grep and Glob on a file one rule matches, and no later step reaches that rule - expect no load of it; then Bash `head` on another single-rule file - expect its load (one tool call per message, so each load names its step);
- a Read of a file, then a second Read of it - expect its rules once;
- a file matched only through a brace alternative other than the first;
- a file matched only through a trailing `/**` glob;
- a wrong-case path to a matched file (on a case-insensitive file system);
- a matched file outside `<SRC_DIR>/`, if any rule has one.

Predict each step from the globs and write the predictions into the task file before the launch. Every context of the session writes to the same log, so launch only once no other agent of this session is still running, write the time (`date '+%F %T'`) into the task file just before the launch, and let the main thread Read nothing until the agent returns. Then `node .claude/scripts/rules-reach.mjs --loads <this session's id prefix>` lists the session's loads in order with their triggers: the probe's are the rows after that time whose trigger is a probe step's file. No such row for the first Read means `record-loads.mjs` is not firing or a field moved - check its registration in `.claude/settings.json`, then one record (`.claude/hooks/README.md`), before reading anything into the list. Past that control, a predicted load that is missing, one nobody predicted, or any `PARSER` / `REACH` / `ALWAYS` line means `rules-reach.mjs` and `.claude/rules/rules-reach.md` are stale: fix both, and record the probe table in the task file.

## D4. Cross-file consistency

Check that each rule is stated once. Find a statement that appears in two files with different content: grep its key phrase across `CLAUDE.md` and `.claude`. The copy that survives is chosen by the "where text lives" standing rule in `SKILL.md`.

Two more checks:

- The review ladder lives only in the `crosscheck` skill, and the lifecycle steps only in `CLAUDE.md` and the `lifecycle` skill. A restatement elsewhere becomes a pointer.
- Each agent's description matches how the skills and `CLAUDE.md` launch it.

## D5. Hooks and settings (report only)

Every command in `.claude/settings.json` and `.claude/settings.local.json` `hooks` must point to an existing file, and every hook file must be registered and described in `.claude/hooks/README.md`. The deny list in `.claude/settings.json` must still match what `CLAUDE.md` "Version Control" forbids. The README is fact-checked in D1. A mismatch goes to the report, and nothing under `.claude/hooks/` or in `settings*.json` is edited.

## D6. Memory

The memory folder is the one Claude Code keeps for this project: `~/.claude/projects/<slug>/memory/`, where the slug is the project's absolute path with every character other than a letter or a digit turned into `-`.

- Run `node <root>/.claude/skills/maintain-ai-layer/layer-refs.mjs <memory folder>`.
- Check that `MEMORY.md` lists every file in the folder once, and that every line points to an existing file. Fix the index directly.
- For each memory whose fact the code or the layer now contradicts (a named file or flag gone, a decision `CLAUDE.md` reversed, a duplicate of a layer rule), write one line in the report: the file, the contradiction, and the proposed action (update or delete). Change nothing until the owner confirms.

## D7. Workflow walk

A `drift` run checks one unit, so a break at the seam between two steps passes every run. This step walks whole tasks through the lifecycle. Launch two `general-purpose` agents in parallel, read-only: they may run `grep`, `ls` and `git log`, and they never edit or write a file. Each one reads the `CLAUDE.md` "Version Control", "Shell and file edits" and "Development Workflow" sections, the `lifecycle`, `crosscheck`, `debug`, `verify-live` and `precompact` skills, every `.claude/agents/*.md`, `.claude/rules/session-artifacts.md`, `.claude/hooks/README.md`, the hook files, the `hooks` block of `.claude/settings.json`, and the Stop-gate block `.claude/settings.local.example.json` gives. They do not read any session folder.

- (a) walks a **bounded** fix, and then the same fix as **super-trivial** and under "no subagents";
- (b) walks an **architectural** change through plan mode, and a **bug report** through `debug`.

At every step, the agent checks:

- **Inputs:** what the step needs, and which earlier step produces it.
- **Outputs:** what the step hands on, and who consumes it.
- **Agent prompts:** what the step says to put in an agent's prompt, against what that agent's body demands, its `tools:` and its modes.
- **The session folder:** what gets written there, and by whom.
- **Hooks:** what a hook does at that point (`guard`, `record-activity`, `verify-gate`, `compact-pointer`, `gate-registered`, `record-loads`), against what the step expects.
- **Skip and re-entry:** whether those rules agree across files.

Each agent returns only the breaks. A break is a step that cannot run as written, an input nothing produces, or two files that disagree. Each break comes with the scenario, the step, and both texts quoted verbatim. The fix is either an exact `replace:` / `with:` pair or "design question for the owner". A contradiction with one plainly right side is applied under the standing rules. A process gap, such as a missing step, a reorder, or a defect that passes every reviewer, goes to the report as a proposal, because the shape of the process is the owner's call. A break in hook code or settings goes to the report only.

## D8. Verify and report

Same as `references/weekly.md` step 7.
