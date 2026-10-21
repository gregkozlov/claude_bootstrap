# weekly mode

## 1. Baseline

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

## 2. Mechanical fixes

- **`layer-refs` hits.** Find where each dead reference went (`git log --diff-filter=R --name-status -- <old path>`, or grep the identifier) and correct it. A path or `npm run` command that is deliberately named as something that must not exist or is not tracked (a forbidden folder, a refused command form, a gitignored hand-copy, a placeholder in an example) is not stale. Leave it, and note it once in the task file.
- **`rules-reach` problems.** Fix every `SHAPE` line, every `FAIL` and `WARN` from `--check`, and every "Globs matching nothing" cell. For such a glob, find where its code went, and point the glob there or drop it. A rule left with no glob at all is merged into a neighbour or deleted.
- **`--loads` findings.** A `PARSER`, `REACH` or `ALWAYS` line is the real loader disagreeing with `rules-reach.mjs`: fix the script and `.claude/rules/rules-reach.md` against it. A missing-field `FAIL` means a payload field was renamed: read one record and fix the names `rules-reach.mjs` reads; a renamed `load_reason` also goes to the report, since `record-loads.mjs` prunes on it and this skill never edits a hook. An empty log in this tree means `record-loads.mjs` is not firing. "No rule load left to check" means nothing was verified: every load predates a rule edit, or no rule was read since - say so in the report, not as a pass.

## 3. Counts

Launch one `Explore` agent ("very thorough", read-only) on `CLAUDE.md` and `.claude/rules/*.md`. It finds every **count claim** - a number or number word attached to something countable ("the six hooks", "all seven domains", "two routes", "a handful of sites") - re-measures each one with a command, and returns only the wrong ones, as exact `replace:` / `with:` pairs with the command it ran. Where a count keeps drifting, it proposes the grep that replaces the count.

## 4. Hotspot drift

Match the step 1 `git log` file list against each rule's globs (the `rules-reach` report shows reach per rule). Take the **three rules** that the most changed files reached. Then take the **`CLAUDE.md` sections** that describe the same areas, at most two. Launch the `drift` agent in `section <name>` mode on each, all in parallel. Tell each run to print only the non-`holds` entries and the tally.

## 5. Rule loading

From the `rules-reach` report:

- **Heavy files.** Take the three files with the most rule text. For each rule loaded there, read its `##` headings and decide whether the file needs that text. When a whole rule is irrelevant to a glob's files, narrow the glob. When only one section is irrelevant, move that section to the rule whose globs fit it. After the change, `--check` must pass.
- **Always-on text.** Rules without `paths:` are already `SHAPE` lines. Also measure the frontmatter `description` of every agent and of every skill without `disable-model-invocation: true`, because those load in every session and in every agent list: `grep -h "^description:" $(grep -L "^disable-model-invocation: true" .claude/skills/*/SKILL.md) .claude/agents/*.md | awk '{print length}'`. A description over ~400 characters is trimmed to its trigger phrases.
- **`CLAUDE.md` text that only one area needs** (a mechanic, not a prohibition) becomes a pointer, and the detail moves to the rule that loads with that area.

## 6. CLAUDE.md, agents, skills

- **`CLAUDE.md`:** delete text that is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph a loaded rule already says. Report the bytes before and after.
- **Agents:** check that each `tools:` line fits its body. An agent told to edit needs `Edit`. A "read-only" agent with `Edit` or `Write` must have a stated reason (the compile probe). Every mode that a skill or `CLAUDE.md` asks an agent for (`drift section`, `comments sweep`, `hunt area` / `refute`, and any mode a project agent carries) must exist in that agent's body. To check, grep `CLAUDE.md` and `.claude/skills` for each agent's name, then compare the modes they ask for with the agent file.
- **Skills:** check that each step a skill hands to another skill or agent names one that exists (`layer-refs` covers the names). Check that the step numbers other files cite (`lifecycle step N`) match the `lifecycle` skill: `grep -rn "step [0-9]" CLAUDE.md .claude`.

## 7. Verify and report

Re-run the step 1 commands. Then run `<CHECK_COMMAND>`: a failure in a file this run did not touch belongs to a parallel session, so say so and leave it. Then write the report (`SKILL.md` "Report").
