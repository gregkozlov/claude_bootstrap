---
name: maintain-ai-layer
description: Periodic upkeep of the AI layer against the current code - weekly (default) or deep; rules rebuilds the rule set; efficiency audits its cost. Use on "/maintain-ai-layer", "maintain the AI layer", "audit the layer", "optimize the rules".
argument-hint: '[weekly | deep | rules | efficiency]'
---

# maintain-ai-layer

The AI layer rots quietly: a file moves and a rule still names it, a count grows, a glob matches nothing or a whole rule loads for files it never mentions, and an agent still describes a mode nobody uses. This skill is the recurring pass that fixes that. It never touches `<SRC_DIR>/`. The deliverable is the edited layer plus the report.

## Mode

The argument picks the mode, and the first line of the reply names it. Each mode's steps live in `references/<mode>.md` (`weekly`, `deep`, `rules`, `efficiency`; an alias reads its mode's file): read that file before the first step, and only the others it names (`deep` runs the `weekly.md` steps it lists and the `rules.md` steps of its D2, `rules` runs `weekly.md` steps 1, 2 and 7, `efficiency` uses `weekly.md` step 1 and `deep.md` D5), plus `settled.md` (Standing rules).

- **`weekly`** (also `weekly-maintenance`, and the default with no argument) - the whole layer, shallow: every mechanical check, the counts, rule loading, and a semantic `drift` pass limited to the rules the last 14 days of code touched. Run it every week or two.
- **`deep`** (also `deep-audit`) - everything `weekly` does, then a `drift` fact-check of every layer file, the `rules` reach, split and code-sweep steps, cross-file consistency, the hooks and the memory.
- **`rules`** - the rule set alone, in depth: every rule checked against the code, `paths:` over- and under-reach, a rule whose sections serve different files split, new rules from a sweep of the code and its fix history, stale ones corrected or deleted. With no project rule - the state right after the bootstrap - it builds the set from the whole project. Run it once after `/setup`, then after a large code change, or when rule text per file climbs.
- **`efficiency`** - where the pipeline is slow, does needless work or spends context and tokens with no result, measured, each finding with a default fix. The standing rules hold except where `efficiency.md` says otherwise, and it writes its own report. Run it every month or two, or after a large layer change.

## Standing rules (all modes)

**This skill applies what it verified itself**, with no approval round (`efficiency` stops for one before applying): every stale fact, dead line, misplaced text, glob and fixture change goes in once it has been checked against the code. These limits still hold, because they come from `CLAUDE.md` and this skill cannot lift them:

- **Check every finding before applying it.** An agent's `replace:` / `with:` pair is re-verified with one command of your own before the Edit. A finding you reject is logged with its reason.
- **Where text lives:** a prohibition stays in `CLAUDE.md`, and detail goes to the `.claude/rules/*.md` file whose `paths:` reach the code it describes. `CLAUDE.md` stays under 48 000 bytes as measured by `wc -c`. A rule without `paths:` loads in every session, and a nested `CLAUDE.md` never takes overflow. Read `CLAUDE.md` "Surgical Changes" for the order in which text is cut.
- **`paths:` changes pass `node .claude/scripts/rules-reach.mjs --check`.** A glob is never widened to make a fixture pair pass: the text moves instead. When text moves, the fixture pair's `rule` / `needle` moves with it. A pair is deleted only when its claim was deleted. A new or narrowed glob gets a `must` pair, and a glob that must stay out of a folder gets a `mustNot` pair.
- **The code is not the doc's servant.** When code violates a policy in several places, the policy is rewritten only if `git log` shows a deliberate move away from it. Otherwise it is a code finding for the report, and this skill never fixes it.
- **Settled is settled.** `.claude/docs/decisions.md` and the "settled and deliberate" items in `CLAUDE.md` are not reopened. A finding against one goes to the report's Observations. Findings earlier runs settled are in `references/settled.md`: every agent prompt carries that list, a matching finding is logged as settled and not reported, and the run appends each new owner answer and each accepted rejection to it.
- **Never edited, only reported:** `.claude/hooks/**` code and `.claude/settings*.json` (outside `efficiency`, which edits them per owner-approved item), the generated and protected paths (`<GENERATED_PATHS>`), `.claude/docs/decisions.md`, the project's backlog. Memory files other than the `MEMORY.md` index are rewritten or deleted only after the owner confirms.
- **The layer is team-shared.** A personal preference never goes into `CLAUDE.md` or a rule: it goes to `CLAUDE.local.md`, or into the report as a suggestion.
- **Edits use Edit / Write only.** No commits, and plain hyphens. If the branch is not the default one, say so before the first edit - an AI-layer edit riding on a feature branch is the owner's call. If the auto-mode classifier refuses a `.claude/` edit, ask the owner for a grant and retry. Never route the edit through another tool.
- **Record the run.** Open `task-ai-layer-<mode>.md` in this session's artifact folder. It holds the mode, the baseline numbers, every finding with its decision (applied, rejected with the reason, reported), and the numbers after. Every agent prompt names the files it may read and carries the list of decisions already taken in this run.
- **Stamp the run.** A `weekly` or `deep` run in the main tree ends by writing today's date (`YYYY-MM-DD`, the only line) into the gitignored `.claude/.last-maintain` with `Write`; `upkeep-nudge.mjs` reads it at session start and asks for the next pass after 14 days. `rules` and `efficiency` do not stamp.
- **Every agent this skill launches runs on Sonnet; the main thread stays on the model the user picked.** Pass `model: "sonnet"` on each `Agent` call and no `effort`: the tool takes one only on an explicit request, and this skill makes none, so `drift` keeps its frontmatter `effort: high`, and the built-in `Explore`, which has no frontmatter, runs at its usual effort. A mechanical fact-check does not need the review model. The one exception is the review of an `efficiency` hook or script change, which follows `crosscheck`.

## Report

The `weekly`, `deep` and `rules` report is in the user's language and says:

1. **Mode and what ran** - each agent type with its count (for example: `drift` x31 in 4 waves, `Explore` x4), and every step skipped, with the reason.
2. **Numbers, before -> after** - a table with: `CLAUDE.md` bytes; the rule count and total rule bytes; the rules-reach median, top-decile and max; files over 30 KB; `layer-refs` unresolved; the `--check` and `--loads` results; `<CHECK_COMMAND>`.
3. **Applied** - grouped by file, one line per change; the rules added, split, merged and deleted come first, each with its reason.
4. **Reported, not applied** - hooks and settings, code findings, findings against settled decisions, workflow design proposals from D6, memory awaiting confirmation. Each item is answerable in one line.
5. **Not checked** - `unverifiable` claims, and anything skipped.

The detail stays in the task file. The reply does not paste agent reports.
