# deep mode

The default mode, run about once a month: the mechanical pass M1-M5 first, then the semantic pass D1-D7.

## M1. Baseline

Run these, and copy the numbers into the task file:

```bash
git -C <root> branch --show-current && git -C <root> log --oneline -1 && git -C <root> status --short
wc -c $(grep -l "Layer tracking" <root>/CLAUDE.md <root>/.claude/CLAUDE.md 2>/dev/null)   # the layer's CLAUDE.md (SKILL.md)
node <root>/.claude/scripts/rules-reach.mjs             # weight report: per-file rule text, per-rule reach, globs matching nothing
node <root>/.claude/scripts/rules-reach.mjs --check     # glob shape + the 20 KiB per-rule budget
node <root>/.claude/skills/maintain-ai-layer/layer-refs.mjs   # dead paths, package scripts, skill and agent names in every tracked *.md
```

## M2. Mechanical fixes

- **`layer-refs` hits.** Find where each dead reference went (`git log --diff-filter=R --name-status -- <old path>`, or grep the identifier) and correct it. A path or `npm run` command that is deliberately named as something that must not exist or is not tracked (a forbidden folder, a refused command form, a gitignored hand-copy, a placeholder in an example) is not stale. Leave it, and note it once in the task file.
- **`rules-reach` problems.** Fix every `SHAPE` line and every "Globs matching nothing" cell. For such a glob, find where its code went, and point the glob there or drop it. A rule left with no glob at all is merged into a neighbour or deleted. A `FAIL` from `--check` is a rule over the budget: trim it by class (`references/rules.md` R4).

## M3. Counts

Launch one `Explore` agent ("very thorough", read-only) on `CLAUDE.md` and `.claude/rules/*.md`. It finds every **count claim** - a number or number word attached to something countable ("the six hooks", "all seven domains", "two routes", "a handful of sites") - re-measures each one with a command, and returns only the wrong ones, as exact `replace:` / `with:` pairs with the command it ran. Where a count keeps drifting, it proposes the grep that replaces the count.

## M4. Rule loading

From the `rules-reach` report:

- **Heavy files.** Take the three files with the most rule text. For each rule loaded there, read its `##` headings and decide whether the file needs that text. When a whole rule is irrelevant to a glob's files, narrow the glob. When only one section is irrelevant, move that section to the rule whose globs fit it. After the change, `--check` must pass.
- **Always-on text.** Rules without `paths:` are already `SHAPE` lines. Also measure the frontmatter `description` of every agent and of every skill without `disable-model-invocation: true`, because those load in every session and in every agent list: `grep -h "^description:" $(grep -L "^disable-model-invocation: true" .claude/skills/*/SKILL.md) .claude/agents/*.md | awk '{print length}'`. A description over ~400 characters is trimmed to its trigger phrases.
- **`CLAUDE.md` text that only one area needs** - a mechanic, or a prohibition about code in files a rule covers - moves to the rule that loads with that area, with no pointer left behind; a prohibition that must be known before any file is read stays.

## M5. CLAUDE.md, agents, skills

- **`CLAUDE.md`:** delete text that is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph a loaded rule already says. Report the bytes before and after.
- **Agents:** check that each `tools:` line fits its body. An agent told to edit needs `Edit`. A "read-only" agent with `Edit` or `Write` must have a stated reason (the compile probe). Every mode that a skill or `CLAUDE.md` asks an agent for (`drift section`, `comments sweep`, `hunt area` / `refute`, and any mode a project agent carries) must exist in that agent's body. To check, grep `CLAUDE.md` and `.claude/skills` for each agent's name, then compare the modes they ask for with the agent file.
- **Skills:** check that each step a skill hands to another skill or agent names one that exists (`layer-refs` covers the names). Check that the step numbers other files cite (`lifecycle step N`) match the `lifecycle` skill: `grep -rn "step [0-9]" CLAUDE.md .claude`.

## D1. drift over every unit

The units are:

- each `##` and `###` section of the layer's `CLAUDE.md` (`grep -n "^##" <that file>`);
- each `.claude/rules/*.md`;
- each `.claude/agents/*.md`;
- each skill's `SKILL.md` plus its `references/*.md`;
- `.claude/hooks/README.md`;
- each `.claude/docs/*.md`;
- every tracked README under `<SRC_DIR>/`.

Run one `drift` in `section` mode per unit, in waves of **eight in parallel**. Each run lists only the claims that need action, and each prompt carries this run's decisions so far. Between waves, check and apply the returned pairs, so that the next wave reads the corrected text.

## D2. Rules

Run `references/rules.md`: R1's inventory (M1-M2 already ran); R2's two decisions - a rule whose subject is gone, a rule that restates another - on D1's results for the rule files; then R3-R5 - reach both ways, the split, and the rules the code needs. A layer with no project rule runs R7 instead of R2-R5. Record the `rules-reach` median, top-decile, max and "files over 30 KB" before and after.

## D3. Cross-file consistency

Check that each rule is stated once. Find a statement that appears in two files with different content: grep its key phrase across `CLAUDE.md` and `.claude`. The copy that survives is chosen by the "where text lives" standing rule in `SKILL.md`.

Two more checks:

- The review ladder lives only in the `crosscheck` skill, and the lifecycle steps only in `CLAUDE.md` and the `lifecycle` skill. A restatement elsewhere becomes a pointer.
- Each agent's description matches how the skills and `CLAUDE.md` launch it.

## D4. Hooks and settings (report only)

Every command in `.claude/settings.json` and `.claude/settings.local.json` `hooks` must point to an existing file, and every hook file must be registered and described in `.claude/hooks/README.md`. The deny list in `.claude/settings.json` must still match what `CLAUDE.md` "Version Control" forbids. The README is fact-checked in D1. A mismatch goes to the report, and nothing under `.claude/hooks/` or in `settings*.json` is edited.

## D5. Memory

The memory folder is the one Claude Code keeps for this project: `~/.claude/projects/<slug>/memory/`, where the slug is the project's absolute path with every character other than a letter or a digit turned into `-`.

- Run `node <root>/.claude/skills/maintain-ai-layer/layer-refs.mjs <memory folder>`.
- Check that `MEMORY.md` lists every file in the folder once, and that every line points to an existing file. Fix the index directly.
- Memory holds machine-specific, personal and cross-repo facts only. A memory that duplicates the layer is proposed for deletion; one that carries project knowledge is proposed for a move - a decision to `.claude/docs/decisions.md`, a mechanic to the rule or skill that reaches its code.
- For each memory whose fact the code or the layer now contradicts (a named file or flag gone, a decision `CLAUDE.md` reversed, a duplicate of a layer rule), write one line in the report: the file, the contradiction, and the proposed action (update or delete). Change nothing until the owner confirms.

## D6. Workflow walk

A `drift` run checks one unit, so a break at the seam between two steps passes every run. This step walks whole tasks through the lifecycle. Launch two `general-purpose` agents in parallel, read-only: they may run `grep`, `ls` and `git log`, and they never edit or write a file. Each one reads the `CLAUDE.md` "Version Control", "Shell and file edits" and "Development Workflow" sections, the `lifecycle`, `crosscheck`, `debug`, `verify-live` and `precompact` skills, every `.claude/agents/*.md`, `.claude/hooks/README.md`, the hook files and the `hooks` block of `.claude/settings.json`. They do not read any session folder.

- (a) walks a **bounded** fix, and then the same fix as **super-trivial** and under "no subagents";
- (b) walks an **architectural** change through plan mode, and a **bug report** through `debug`.

At every step, the agent checks:

- **Inputs:** what the step needs, and which earlier step produces it.
- **Outputs:** what the step hands on, and who consumes it.
- **Agent prompts:** what the step says to put in an agent's prompt, against what that agent's body demands, its `tools:` and its modes.
- **The session folder:** what gets written there, and by whom.
- **Hooks:** what a hook does at that point (`guard`, `stop-check`, `compact-pointer`, `upkeep-nudge`), against what the step expects.
- **Skip and re-entry:** whether those rules agree across files.

Each agent returns only the breaks. A break is a step that cannot run as written, an input nothing produces, or two files that disagree. Each break comes with the scenario, the step, and both texts quoted verbatim. The fix is either an exact `replace:` / `with:` pair or "design question for the owner". A contradiction with one plainly right side is applied under the standing rules. A process gap, such as a missing step, a reorder, or a defect that passes every reviewer, goes to the report as a proposal, because the shape of the process is the owner's call. A break in hook code or settings goes to the report only.

## D7. Verify and report

Re-run the M1 commands. Then run `<CHECK_COMMAND>`: a failure in a file this run did not touch belongs to a parallel session, so say so and leave it. Then write the report (`SKILL.md` "Report").
