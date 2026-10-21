# deep mode

Run `references/weekly.md` steps 1, 2, 4 and 5 in full, but skip step 3: step D1 covers every file. Then:

## D1. drift over every unit

The units are:

- each `##` and `###` section of `CLAUDE.md` (`grep -n "^##" CLAUDE.md`);
- each `.claude/rules/*.md`;
- each `.claude/agents/*.md`;
- each skill's `SKILL.md` plus its `references/*.md`;
- `.claude/hooks/README.md`;
- every tracked README under the source directory.

Run one `drift` in `section` mode per unit, in waves of **eight in parallel**. Each prompt asks for the non-`holds` entries plus the tally only, and carries `references/settled.md` and this run's decisions so far. Between waves, check and apply the returned pairs, so that the next wave reads the corrected text.

## D2. Rules

Run `references/rules.md`: R1's inventory (weekly steps 1-2 already ran); R2's two decisions - a rule whose subject is gone, a rule that restates another - on D1's results for the rule files; then R3-R5 - reach both ways, the split, and the rules the code needs. A layer with no project rule runs R7 instead of R2-R5.

## D3. Cross-file consistency

Check that each rule is stated once. Find a statement that appears in two files with different content: grep its key phrase across `CLAUDE.md` and `.claude`. The copy that survives is chosen by the "where text lives" standing rule in `SKILL.md`.

Two more checks:

- The lifecycle steps live only in `CLAUDE.md` Development Workflow. A restatement elsewhere becomes a pointer.
- Each agent's description matches how `CLAUDE.md` and the skills launch it.

## D4. Hooks and settings (report only)

Every command in `.claude/settings.json` and `.claude/settings.local.json` `hooks` must point to an existing file, and every hook file must be registered and described in `.claude/hooks/README.md`. The deny list in `.claude/settings.json` must still match what `CLAUDE.md` "Version Control" forbids. Run the hooks' self-tests (`.claude/hooks/tests/*.mjs`, each with `node`): every line `ok`. The README is fact-checked in D1. A mismatch goes to the report, and nothing under `.claude/hooks/` or in `settings*.json` is edited.

## D5. Memory

The memory folder is the one Claude Code keeps for this project: `~/.claude/projects/<slug>/memory/`, where the slug is the project's absolute path with every character other than a letter or a digit turned into `-`.

- Run `node .claude/skills/maintain-ai-layer/layer-refs.mjs <memory folder>`.
- Check that `MEMORY.md` lists every file in the folder once, and that every line points to an existing file. Fix the index directly.
- For each memory whose fact the code or the layer now contradicts (a named file or flag gone, a decision `CLAUDE.md` reversed, a duplicate of a layer rule), write one line in the report: the file, the contradiction, and the proposed action (update or delete). Change nothing until the owner confirms.

## D6. Workflow walk

A `drift` run checks one unit, so a break at the seam between two steps passes every run. This step walks whole tasks through the lifecycle. Launch two `general-purpose` agents in parallel, read-only: they may run `grep`, `ls` and `git log`, and they never edit or write a file. Each one reads the `CLAUDE.md` "Version Control", "Shell and file edits" and "Development Workflow" sections, the `debug`, `handoff` and `retro` skills, `.claude/agents/hunt.md` and `drift.md`, `.claude/hooks/README.md`, the hook files and the `hooks` block of `.claude/settings.json`.

- (a) walks a **bounded** fix, and then the same fix as **super-trivial** and under "no subagents";
- (b) walks a **contract change** through plan mode, and a **bug report** through `debug`.

At every step, the agent checks:

- **Inputs:** what the step needs, and which earlier step produces it.
- **Outputs:** what the step hands on, and who consumes it.
- **Agent prompts:** what the step says to put in an agent's prompt, against what that agent's body demands, its `tools:` and its modes.
- **Hooks:** what `guard` and `upkeep-nudge` do at that point, against what the step expects.
- **Skips and the launch budget:** whether the skip rule and the "at most three launches" count agree across files.

Each agent returns only the breaks. A break is a step that cannot run as written, an input nothing produces, or two files that disagree. Each break comes with the scenario, the step, and both texts quoted verbatim. The fix is either an exact `replace:` / `with:` pair or "design question for the owner". A contradiction with one plainly right side is applied under the standing rules. A process gap, such as a missing step, a reorder, or a defect that passes every reviewer, goes to the report as a proposal, because the shape of the process is the owner's call. A break in hook code or settings goes to the report only.

## D7. Verify and report

Same as `references/weekly.md` step 6.
