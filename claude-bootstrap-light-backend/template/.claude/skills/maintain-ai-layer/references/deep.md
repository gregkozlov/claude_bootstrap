# deep mode

The routine pass, about once a month - the session-start reminder says when it is due, and the mode is the default with no argument on a filled layer. The mechanical checks run as commands in the main thread (D1-D3); then one `drift` per unit of the layer (D4), the rule steps (D5), cross-file consistency (D6), the hooks (D7), the memory (D8) and a walk of whole tasks through the lifecycle (D9). It costs dozens of agent launches, all on Sonnet (`SKILL.md`).

## D1. Baseline

Run these and copy the numbers into the run file:

```bash
git branch --show-current && git log --oneline -1 && git status --short
L=$(grep -l "Layer tracking" CLAUDE.md .claude/CLAUDE.md 2>/dev/null); echo "$L"; wc -c "$L"   # the layer's CLAUDE.md
ls .claude/rules/ 2>/dev/null && wc -c .claude/rules/*.md 2>/dev/null    # the rule count and bytes
node .claude/skills/maintain-ai-layer/layer-refs.mjs      # dead paths, package scripts, skill and agent names in the layer's *.md
```

`$L` in a later command is this variable: a new Bash call sets it again with the same line.

## D2. Mechanical fixes

- **`layer-refs` hits.** Find where each dead reference went (`git log --diff-filter=R --name-status -- <old path>`, or grep the identifier) and correct it; a hit in a file the layer does not own is reported, not edited. A path or package command deliberately named as something that must not exist or is not tracked (a forbidden folder, a refused command form, a placeholder in an example) is not stale - leave it, and say so once in the report.
- **Rule globs.** For every `.claude/rules/*.md`, measure each glob of its `paths:` ("Measuring a rule" in `SKILL.md`). A glob matching nothing points at code that moved - point it there, or drop it. A rule left with no glob is merged into a neighbour or deleted; a rule with no `paths:` at all loads in every session - give it globs or move its text into `CLAUDE.md` within the budget.
- **Counts.** Grep `CLAUDE.md` and the rules for a number or number word attached to something countable ("the six hooks", "two routes", "a handful of sites"), re-measure each with a command, and fix the wrong ones. Where a count keeps drifting, replace it with the grep that finds the sites.

## D3. Always-on text

- **`CLAUDE.md`:** delete text that is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph a rule already says. Text only one area needs - a mechanic, or a prohibition about code in files a rule covers - moves to the rule that loads with that area, with no pointer left behind; a prohibition that must be known before any file is read stays.
- **Descriptions:** every agent description and every skill description without `disable-model-invocation: true` loads in every session: `grep -h "^description:" $(grep -L "^disable-model-invocation: true" .claude/skills/*/SKILL.md) .claude/agents/*.md | awk '{print length}'`. One over ~300 characters is trimmed to its trigger phrases.
- **`hunt`'s attack angles** stay under the budget their own section states (`wc -c` of that section); past it, merge same-class angles and drop retired ones - a class a lint rule now catches, an API that is gone.

## D4. drift over every unit

The units are:

- each `##` and `###` section of the layer's `CLAUDE.md` (`grep -n "^##"` on it);
- each `.claude/rules/*.md`;
- each `.claude/agents/*.md`;
- each skill's `SKILL.md` plus its `references/*.md`;
- `.claude/hooks/README.md`;
- every tracked README in the source folders (`CLAUDE.md` Folder conventions lists them).

Run one `drift` in `section` mode per unit, in waves of **eight in parallel**. Each run lists only the claims that need action, and each prompt carries `references/settled.md` and this run's decisions so far. Between waves, check and apply the returned pairs, so that the next wave reads the corrected text. An `unverifiable` claim goes to the report as unverified, a `code-violates-policy` one as a code finding.

## D5. Rules

Run `references/rules.md`: R1's inventory (D1-D2 already ran its baseline); R2's two decisions - a rule whose subject is gone, a rule that restates another - on D4's results for the rule files; then R3-R5 - reach both ways, the split, and the rules the code needs. A layer with no project rule runs R7 instead of R2-R5.

## D6. Cross-file consistency

Check that each rule is stated once. Find a statement that appears in two files with different content: grep its key phrase across `CLAUDE.md` and `.claude`. The copy that survives is chosen by the "where text lives" standing rule in `SKILL.md`.

More checks:

- The lifecycle steps live only in `CLAUDE.md` Development Workflow. A restatement elsewhere becomes a pointer, and every step number another file cites matches it: `grep -rn "step [0-9]" "$L" .claude --exclude-dir=sessions --exclude-dir=.git`.
- Every skill and agent a file names exists (`layer-refs` covers the names), and each agent's description matches how `CLAUDE.md` and the skills launch it: `hunt`'s two modes against what lifecycle steps 2 and 4 hand it, `drift`'s two against what lifecycle step 5 and this skill hand it.

## D7. Hooks and settings (report only)

Every command in `.claude/settings.json` and `.claude/settings.local.json` `hooks` must point to an existing file, and every hook file must be registered and described in `.claude/hooks/README.md`. The deny list in `.claude/settings.json` must still match what `CLAUDE.md` "Version Control" forbids, and the three project lists at the top of `backend-guard.mjs` what the code shows: every migration folder under its frozen list, every secret file the repo's ignore file names under its secret list, the project's own deploy and reset commands under its forbidden list. Run the hooks' self-tests (`.claude/hooks/tests/*.mjs`, each with `node`): each case line reads `ok` and each suite ends with `N passed, 0 failed`. The README is fact-checked in D4. A mismatch goes to the report, and nothing under `.claude/hooks/` or in `settings*.json` is edited.

## D8. Memory

The memory folder is the one Claude Code keeps for this project: `~/.claude/projects/<slug>/memory/`, where the slug is the project's absolute path with every character other than a letter or a digit turned into `-`. With no such folder, skip this step.

- Run `node .claude/skills/maintain-ai-layer/layer-refs.mjs <memory folder>`.
- Check that `MEMORY.md` lists every file in the folder once, and that every line points to an existing file. Fix the index directly.
- Memory holds machine-specific, personal and cross-repo facts only. A memory that duplicates the layer is proposed for deletion; one that carries project knowledge is proposed for a move - a settled decision to `CLAUDE.md` Architecture, a mechanic to the rule or skill that reaches its code.
- For each memory whose fact the code or the layer now contradicts (a named file or flag gone, a decision `CLAUDE.md` reversed, a duplicate of a layer rule), write one line in the report: the file, the contradiction, and the proposed action (update or delete). Change nothing until the owner confirms.

## D9. Workflow walk

A `drift` run checks one unit, so a break at the seam between two steps passes every run. This step walks whole tasks through the lifecycle. Launch two `general-purpose` agents in parallel, read-only: they may run `grep`, `ls` and `git log`, and they never edit or write a file. Each one reads the `CLAUDE.md` "Version Control", "Shell and file edits", "Data, secrets and the outside world" and "Development Workflow" sections, the `debug`, `handoff` and `retro` skills, `.claude/agents/hunt.md` and `drift.md`, `.claude/hooks/README.md`, the hook files and the `hooks` block of `.claude/settings.json` (or `.claude/settings.local.json`, where a personal install registered them).

- (a) walks a **bounded** fix, and then the same fix as **super-trivial** and under "no subagents";
- (b) walks a **contract change** that carries a migration through plan mode, and a **bug report** from a shared environment through `debug`.

At every step, the agent checks:

- **Inputs:** what the step needs, and which earlier step produces it.
- **Outputs:** what the step hands on, and who consumes it.
- **Agent prompts:** what the step says to put in an agent's prompt, against what that agent's body demands, its `tools:` and its modes.
- **Hooks:** what `guard`, `backend-guard` and `upkeep-nudge` do at that point, against what the step expects - a step that needs a call one of them refuses (a secret read, a migration reset, a write to a shared environment) is a break.
- **Skips and the launch budget:** whether the skip rule and the launch count (usually one or two per task, at most five) agree across files.

Each agent returns only the breaks. A break is a step that cannot run as written, an input nothing produces, or two files that disagree. Each break comes with the scenario, the step, and both texts quoted verbatim. The fix is either an exact `replace:` / `with:` pair or "design question for the owner". A contradiction with one plainly right side is applied under the standing rules. A process gap, such as a missing step, a reorder, or a defect that passes every reviewer, goes to the report as a proposal, because the shape of the process is the owner's call. A break in hook code or settings goes to the report only.

## D10. Verify and report

Re-run the D1 commands, then the project's check command once, only when what it needs is already up: a failure in a file this run did not touch belongs to someone else - say so and leave it. Stamp the run - in team mode the stamp is one more file for the owner to commit - and write the report (`SKILL.md`).
