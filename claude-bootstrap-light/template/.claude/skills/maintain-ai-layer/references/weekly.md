# weekly mode

**The mechanical checks are commands in the main thread; the one semantic check is at most three `drift` runs**, on the few places the recent code changes reached. Only when the user asks for more does `drift` run on the further sections they name, one section per run - or the run becomes `deep`.

## 1. Baseline

Run these and copy the numbers into the run file:

```bash
git branch --show-current && git log --oneline -1 && git status --short
wc -c CLAUDE.md
ls .claude/rules/ 2>/dev/null && wc -c .claude/rules/*.md                # the rule count and bytes
node .claude/skills/maintain-ai-layer/layer-refs.mjs      # dead paths, package scripts, skill and agent names in every tracked *.md
git log --since=30.days --name-only --format= | sort | uniq -c | sort -rn | head -30
```

## 2. Mechanical fixes

- **`layer-refs` hits.** Find where each dead reference went (`git log --diff-filter=R --name-status -- <old path>`, or grep the identifier) and correct it. A path or package command deliberately named as something that must not exist or is not tracked (a forbidden folder, a refused command form, a placeholder in an example) is not stale - leave it, and say so once in the report.
- **Rule globs.** For every `.claude/rules/*.md`, measure each glob of its `paths:` ("Measuring a rule" in `SKILL.md`). A glob matching nothing points at code that moved - point it there, or drop it. A rule left with no glob is merged into a neighbour or deleted; a rule with no `paths:` at all loads in every session - give it globs or move its text into `CLAUDE.md` within the budget.
- **Counts.** Grep `CLAUDE.md` and the rules for a number or number word attached to something countable ("the six hooks", "two routes", "a handful of sites"), re-measure each with a command, and fix the wrong ones. Where a count keeps drifting, replace it with the grep that finds the sites.

## 3. Hotspot fact-check

Match the step 1 file list against each rule's reach and against the `CLAUDE.md` sections that describe the same areas. Take **the two rules and the one `CLAUDE.md` section** the most changed files reached, and launch `drift` in `section <name>` mode on each, in parallel - each prompt naming its section, asking for the non-`holds` entries and the tally only, and carrying the decisions this run already took and `references/settled.md`. Apply each replacement your own command confirms; an `unverifiable` claim goes to the report as unverified, a `code-violates-policy` one as a code finding.

## 4. Always-on text

- **`CLAUDE.md`:** delete text that is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph a rule already says. Text only one area needs (a mechanic, not a prohibition) moves to the rule that loads with that area, leaving a pointer.
- **Descriptions:** every agent description and every skill description without `disable-model-invocation: true` loads in every session: `grep -h "^description:" $(grep -L "^disable-model-invocation: true" .claude/skills/*/SKILL.md) .claude/agents/*.md | awk '{print length}'`. One over ~300 characters is trimmed to its trigger phrases.
- **`hunt`'s attack angles** stay under the budget their own section states (`wc -c` of that section); past it, merge same-class angles and drop retired ones - a class a lint rule now catches, an API that is gone.

## 5. Consistency

- Every skill and agent a file names exists (`layer-refs` covers the names), and every step number another file cites matches `CLAUDE.md` Development Workflow: `grep -rn "step [0-9]" CLAUDE.md .claude`.
- `hunt`'s two modes match what lifecycle steps 2 and 4 hand it, and `drift`'s two what lifecycle step 5 and this skill hand it.
- Every hook command in `.claude/settings.json` points to an existing file, and `.claude/hooks/README.md` describes it - a mismatch goes to the report only.
- **Memory**, when the project has one (`~/.claude/projects/<slug>/memory/`, the slug being the project's absolute path with every character other than a letter or a digit turned into `-`): `MEMORY.md` lists every file once and every line points to an existing file - fix the index directly; a memory the code or the layer now contradicts is one report line with the proposed action.

## 6. Verify and report

Re-run the step 1 commands, then the project's check command once: a failure in a file this run did not touch belongs to someone else - say so and leave it. Stamp the run and write the report (`SKILL.md`).
