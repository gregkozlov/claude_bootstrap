---
name: maintain-ai-layer
description: Periodic upkeep of the AI layer against the current code, in the main thread. Use on "/maintain-ai-layer", "maintain the AI layer", "audit the layer".
---

# maintain-ai-layer

The AI layer rots quietly: a file moves and a rule still names it, a count grows, a glob matches nothing, a `CLAUDE.md` paragraph describes code that changed. This skill is the recurring pass that fixes that - every week or two, or after a large refactor. It never touches the source directory. The deliverable is the edited layer plus a short report.

**It runs in the main thread and launches no subagent.** The full layer spends dozens of agent launches on this pass; here the mechanical checks are commands, and the one semantic check reads only the few places the recent code changes reached. Only when the user asks for a deeper pass does one `Explore` agent sweep a wider area.

## Standing rules

**This skill applies what it verified itself**, with no approval round: a stale fact, a dead line, a misplaced paragraph, a glob change goes in once one command of your own has confirmed it against the code. These limits still hold, because they come from `CLAUDE.md`:

- **Where text lives:** a prohibition stays in `CLAUDE.md`, and detail goes to the `.claude/rules/*.md` file whose `paths:` reach the code it describes. `CLAUDE.md` stays under its 20 KB budget (`wc -c CLAUDE.md`). A rule without `paths:` loads in every session.
- **The code is not the doc's servant.** When code breaks a written policy in several places, the policy is rewritten only if `git log` shows a deliberate move away from it. Otherwise it is a code finding for the report, and this skill never fixes it.
- **Settled is settled.** A decision `CLAUDE.md` marks as settled and deliberate is not reopened; a finding against one goes to the report.
- **Never edited, only reported:** `.claude/hooks/**`, `.claude/settings*.json`, the generated paths the guard protects. Memory files other than the `MEMORY.md` index are rewritten or deleted only after the owner confirms.
- **The layer is team-shared.** A personal preference never goes into `CLAUDE.md` or a rule: it goes to `CLAUDE.local.md`, or into the report as a suggestion.
- **Edits use Edit / Write only.** No commits, plain hyphens. If the branch is not the default one, say so before the first edit - an AI-layer edit riding on a feature branch is the owner's call.

## 1. Baseline

Run these and keep the numbers for the report:

```bash
git branch --show-current && git log --oneline -1 && git status --short
wc -c CLAUDE.md
node .claude/skills/maintain-ai-layer/layer-refs.mjs      # dead paths, package scripts, skill and agent names in every tracked *.md
git log --since=30.days --name-only --format= | sort | uniq -c | sort -rn | head -30
```

## 2. Mechanical fixes

- **`layer-refs` hits.** Find where each dead reference went (`git log --diff-filter=R --name-status -- <old path>`, or grep the identifier) and correct it. A path deliberately named as something that must not exist (a forbidden folder, a placeholder in an example) is not stale - leave it, and say so once in the report.
- **Rule globs.** For every `.claude/rules/*.md`, read its `paths:` list and check that each glob still matches a tracked file: `git ls-files ':(glob)<glob>' | head -3`. A glob matching nothing points at code that moved - point it there, or drop it. A rule left with no glob is merged into a neighbour or deleted; a rule with no `paths:` at all loads in every session - give it globs or move its text into `CLAUDE.md` within the budget.
- **Counts.** Grep `CLAUDE.md` and the rules for a number or number word attached to something countable ("the six hooks", "two routes", "a handful of sites"), re-measure each with a command, and fix the wrong ones. Where a count keeps drifting, replace it with the grep that finds the sites.

## 3. Hotspot fact-check

Match the step 1 file list against each rule's globs and against the `CLAUDE.md` sections that describe the same areas. Take **the two rules and the one `CLAUDE.md` section** the most changed files reached, read each in full, and check every claim in it against the code: a path, an identifier, a behaviour, a "never" the code now breaks. Fix what the code contradicts, with the minimal replacement; a claim you cannot settle from the code goes to the report as unverified.

## 4. Always-on text

- **`CLAUDE.md`:** delete text that is true but dead - a status, an instruction for a change already applied, an alternative nothing uses, a paragraph a rule already says. Text only one area needs (a mechanic, not a prohibition) moves to the rule that loads with that area, leaving a pointer.
- **Descriptions:** every agent description and every skill description without `disable-model-invocation: true` loads in every session: `grep -h "^description:" $(grep -L "^disable-model-invocation: true" .claude/skills/*/SKILL.md) .claude/agents/*.md | awk '{print length}'`. One over ~300 characters is trimmed to its trigger phrases.
- **`hunt`'s attack angles** stay under the budget their own section states (`wc -c` of that section); past it, merge same-class angles and drop retired ones - a class a lint rule now catches, an API that is gone.

## 5. Consistency

- Every skill and agent a file names exists (`layer-refs` covers the names), and every step number another file cites matches `CLAUDE.md` Development Workflow: `grep -rn "step [0-9]" CLAUDE.md .claude`.
- `hunt`'s two modes match what lifecycle steps 2 and 4 hand it.
- Every hook command in `.claude/settings.json` points to an existing file, and `.claude/hooks/README.md` describes it - a mismatch goes to the report only.
- **Memory**, when the project has one (`~/.claude/projects/<slug>/memory/`, the slug being the project's absolute path with every character other than a letter or a digit turned into `-`): `MEMORY.md` lists every file once and every line points to an existing file - fix the index directly; a memory the code or the layer now contradicts is one report line with the proposed action.

## 6. Verify and report

Re-run the step 1 commands, then the project's check command once: a failure in a file this run did not touch belongs to someone else - say so and leave it.

The report is in the user's language and short:

1. **Numbers, before -> after** - `CLAUDE.md` bytes, `layer-refs` unresolved, the check command.
2. **Applied** - grouped by file, one line per change.
3. **Reported, not applied** - hooks and settings, code findings, findings against settled decisions, memory awaiting confirmation; each answerable in one line.
4. **Not checked** - what stayed unverified, and what this pass skipped by design (only the hotspots were fact-checked).
