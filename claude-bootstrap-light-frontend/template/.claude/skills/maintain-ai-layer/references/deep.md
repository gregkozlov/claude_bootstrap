# deep mode

The default mode, about once a month. **The mechanical checks are commands in the main thread** (M1-M4); then `drift` over every unit, the rules, consistency, hooks, memory and a walk of whole tasks (D1-D7).

## M1. Baseline

Run these and copy the numbers into the run file. `LAYER_MD` is the layer's `CLAUDE.md` ("Which `CLAUDE.md`" in `SKILL.md`):

```bash
git branch --show-current && git log --oneline -1 && git status --short
grep -l "Layer tracking" CLAUDE.md .claude/CLAUDE.md 2>/dev/null      # LAYER_MD
wc -c "LAYER_MD"
ls .claude/rules/ 2>/dev/null && wc -c .claude/rules/*.md                # the rule count and bytes
node .claude/skills/maintain-ai-layer/layer-refs.mjs      # dead paths, package scripts, skill and agent names in the layer and every tracked *.md
```

An own-repo layer: also `git -C .claude status --short` - uncommitted layer work is the owner's to commit before the run.

## M2. Mechanical fixes

- **`layer-refs` hits.** Find where each dead reference went (`git log --diff-filter=R --name-status -- <old path>`, or grep the identifier) and correct it. A path or package command deliberately named as something that must not exist or is not tracked (a forbidden folder, a refused command form, a placeholder in an example) is not stale - leave it, and say so once in the report.
- **Rule globs.** For every `.claude/rules/*.md`, measure each glob of its `paths:` ("Measuring a rule" in `SKILL.md`). A glob matching nothing points at code that moved - point it there, or drop it. A rule left with no glob is merged into a neighbour or deleted; a rule with no `paths:` at all loads in every session - give it globs or move its text into `CLAUDE.md` within the budget.
- **Counts.** Grep `CLAUDE.md` and the rules for a number or number word attached to something countable ("the six hooks", "two routes", "a handful of sites"), re-measure each with a command, and fix the wrong ones. Where a count keeps drifting, replace it with the grep that finds the sites.

## M3. Always-on text

- **`CLAUDE.md`:** delete text that is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph a rule already says. Text only one area needs - a mechanic, or a prohibition about code in files a rule covers - moves to the rule that loads with that area, with no pointer left behind; a prohibition that must be known before any file is read stays.
- **Descriptions:** every agent description and every skill description without `disable-model-invocation: true` loads in every session: `grep -h "^description:" $(grep -L "^disable-model-invocation: true" .claude/skills/*/SKILL.md) .claude/agents/*.md | awk '{print length}'`. One over ~300 characters is trimmed to its trigger phrases.
- **`hunt`'s attack angles** stay under the budget their own section states (`wc -c` of that section); past it, merge same-class angles and drop retired ones - a class a lint rule now catches, an API that is gone.

## M4. Consistency

- Every skill and agent a file names exists (`layer-refs` covers the names), and every step number another file cites matches `CLAUDE.md` Development Workflow: `grep -rn "step [0-9]" CLAUDE.md .claude`.
- `hunt`'s two modes match what lifecycle steps 2 and 4 hand it, and `drift`'s two what lifecycle step 5 and this skill hand it.

## D1. drift over every unit

The units are:

- each `##` and `###` section of the layer's `CLAUDE.md` (`grep -n "^##" "LAYER_MD"`);
- each `.claude/rules/*.md`;
- each `.claude/agents/*.md`;
- each skill's `SKILL.md` plus its `references/*.md`;
- `.claude/hooks/README.md`;
- every tracked README under the source directory.

Run one `drift` in `section` mode per unit, in waves of **eight in parallel**. Each run lists only the claims that need action, and each prompt carries `references/settled.md` and this run's decisions so far. Between waves, check and apply the returned pairs, so that the next wave reads the corrected text.

## D2. Rules

Run `references/rules.md`: R1's inventory (M1-M2 already ran); R2's two decisions - a rule whose subject is gone, a rule that restates another - on D1's results for the rule files; then R3-R5 - reach both ways, the split, and the rules the code needs. A layer with no project rule runs R7 instead of R2-R5.

## D3. Cross-file consistency

Check that each rule is stated once. Find a statement that appears in two files with different content: grep its key phrase across `CLAUDE.md` and `.claude`. The copy that survives is chosen by the "where text lives" standing rule in `SKILL.md`.

Two more checks:

- The lifecycle steps live only in `CLAUDE.md` Development Workflow. A restatement elsewhere becomes a pointer.
- Each agent's description matches how `CLAUDE.md` and the skills launch it.

## D4. Hooks and settings (report only)

Every command in `.claude/settings.json` and `.claude/settings.local.json` `hooks` must point to an existing file, and every hook file must be registered and described in `.claude/hooks/README.md`. The deny list must still match what `CLAUDE.md` "Version Control" forbids - in `.claude/settings.json`, or in `.claude/settings.local.json` for a personal layer beside a tracked team `settings.json`. Run the hooks' self-tests (`.claude/hooks/tests/*.mjs`, each with `node`): every line `ok`. The README is fact-checked in D1. A mismatch goes to the report, and nothing under `.claude/hooks/` or in `settings*.json` is edited.

## D5. Memory

The memory folder is the one Claude Code keeps for this project: `~/.claude/projects/<slug>/memory/`, where the slug is the project's absolute path with every character other than a letter or a digit turned into `-`.

- Run `node .claude/skills/maintain-ai-layer/layer-refs.mjs <memory folder>`.
- Check that `MEMORY.md` lists every file in the folder once, and that every line points to an existing file. Fix the index directly.
- Memory holds machine-specific, personal and cross-repo facts only. A memory that duplicates the layer is proposed for deletion; one that carries project knowledge is proposed for a move - a settled decision to `CLAUDE.md` Architecture, a mechanic to the rule or skill that reaches its code.
- For each memory whose fact the code or the layer now contradicts (a named file or flag gone, a decision `CLAUDE.md` reversed, a duplicate of a layer rule), write one line in the report: the file, the contradiction, and the proposed action (update or delete). Change nothing until the owner confirms.

## D6. Workflow walk

A `drift` run checks one unit, so a break at the seam between two steps passes every run. This step walks whole tasks through the lifecycle. Launch two `general-purpose` agents in parallel, read-only: they may run `grep`, `ls` and `git log`, and they never edit or write a file. Each one reads the `CLAUDE.md` "Version Control", "Shell and file edits" and "Development Workflow" sections, the `debug`, `handoff` and `retro` skills, `.claude/agents/hunt.md` and `drift.md`, `.claude/hooks/README.md`, the hook files and the `hooks` block of the settings file that registers them (`.claude/settings.json`, or `.claude/settings.local.json`).

- (a) walks a **bounded** fix, and then the same fix as **super-trivial** and under "no subagents";
- (b) walks a **contract change** through plan mode, and a **bug report** through `debug`.

At every step, the agent checks:

- **Inputs:** what the step needs, and which earlier step produces it.
- **Outputs:** what the step hands on, and who consumes it.
- **Agent prompts:** what the step says to put in an agent's prompt, against what that agent's body demands, its `tools:` and its modes.
- **Hooks:** what `guard` and `upkeep-nudge` do at that point, against what the step expects.
- **Skips and the launch budget:** whether the skip rule and the launch count ("usually 1-2, at most 5") agree across files.

Each agent returns only the breaks. A break is a step that cannot run as written, an input nothing produces, or two files that disagree. Each break comes with the scenario, the step, and both texts quoted verbatim. The fix is either an exact `replace:` / `with:` pair or "design question for the owner". A contradiction with one plainly right side is applied under the standing rules. A process gap, such as a missing step, a reorder, or a defect that passes every reviewer, goes to the report as a proposal, because the shape of the process is the owner's call. A break in hook code or settings goes to the report only.

## D7. Verify and report

Re-run the M1 commands, then the project's check command once: a failure in a file this run did not touch belongs to someone else - say so and leave it. Stamp the run and write the report (`SKILL.md`).
