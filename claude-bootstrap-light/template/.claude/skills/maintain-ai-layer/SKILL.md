---
name: maintain-ai-layer
description: Periodic upkeep of the AI layer against the current code - weekly (default, cheap) or deep; rules rebuilds the rule set; efficiency audits its cost. Use on "/maintain-ai-layer", "maintain the AI layer", "audit the layer", "optimize the rules".
argument-hint: '[weekly | deep | rules | efficiency]'
---

# maintain-ai-layer

The AI layer rots quietly: a file moves and a rule still names it, a count grows, a glob matches nothing or a whole rule loads for files it never mentions, a `CLAUDE.md` paragraph describes code that changed. This skill is the recurring pass that fixes that. It never touches the source directory. The deliverable is the edited layer plus the report.

## Mode

The argument picks the mode, and the first line of the reply names it. Each mode's steps live in `references/<mode>.md` (an alias reads its mode's file): read that file before the first step, and only the others it names, plus `references/settled.md` (Standing rules).

- **`weekly`** (also `weekly-maintenance`, and the default with no argument) - the cheap pass, every week or two: the mechanical checks in the main thread, and at most three `drift` runs on the places the recent changes reached.
- **`deep`** (also `deep-audit`) - everything `weekly` does, then a `drift` fact-check of every layer file, the `rules` steps, cross-file consistency, the hooks, the memory and a walk of whole tasks through the lifecycle. Dozens of agent launches: run it after a large refactor, or every month or two.
- **`rules`** - the rule set alone, in depth: every rule checked against the code, `paths:` over- and under-reach, a rule whose sections serve different files split, new rules from a sweep of the code and its fix history, stale ones corrected or deleted. With no project rule - the state right after the install - it builds the set from the whole project. Run it once after `setup`, then after a large code change.
- **`efficiency`** - where the pipeline is slow, does needless work or spends context and tokens with no result, measured, each finding with a default fix. The standing rules hold except where `efficiency.md` says otherwise, it writes its own report, and it stops for the owner's answer before applying. Run it every month or two.

**This layer's budget holds in every mode.** `weekly` is the one meant to run routinely; the other three spend agent launches by the dozen and run when the user asks for them, never as a default.

## Measuring a rule

This layer ships no reach checker, so the reach of a rule - the files whose Read loads it - is measured with git. For each item of its `paths:` list: `git ls-files --cached --others --exclude-standard ':(glob)<glob>'`. Three places where git and the loader read a glob differently: a brace group (`*.{ts,tsx}`) is expanded by hand, one call per alternative; a glob without a slash matches at any depth for the loader, so measure it as `**/<glob>` too; a trailing `/**` the loader strips, which reaches the same files. The union is the rule's reach; a rule the loader reads no `paths:` from (no frontmatter, a misspelled key, a flow list) loads in every session.

## Standing rules (all modes)

**This skill applies what it verified itself**, with no approval round (`efficiency` stops for one before applying): a stale fact, a dead line, a misplaced paragraph, a glob change goes in once one command of your own has confirmed it against the code. These limits still hold, because they come from `CLAUDE.md` and this skill cannot lift them:

- **Check every finding before applying it.** An agent's `replace:` / `with:` pair is re-verified with one command of your own before the Edit. A finding you reject is logged with its reason.
- **Where text lives:** a prohibition stays in `CLAUDE.md`, and detail goes to the `.claude/rules/*.md` file whose `paths:` reach the code it describes. `CLAUDE.md` stays under its 20 KB budget (`wc -c CLAUDE.md`). A rule without `paths:` loads in every session.
- **A `paths:` change is measured before and after** ("Measuring a rule"): the files that needed the rule are still reached, and the ones that did not are gone. A glob is never widened to reach one more file - the text moves to the rule whose globs already reach it.
- **The code is not the doc's servant.** When code breaks a written policy in several places, the policy is rewritten only if `git log` shows a deliberate move away from it. Otherwise it is a code finding for the report, and this skill never fixes it.
- **Settled is settled.** A decision `CLAUDE.md` marks as settled and deliberate is not reopened; a finding against one goes to the report's Observations. Findings earlier runs settled are in `references/settled.md`: every agent prompt carries that list, a matching finding is logged as settled and not reported, and the run appends each new owner answer and each accepted rejection to it.
- **Never edited, only reported:** `.claude/hooks/**`, `.claude/settings*.json` (outside `efficiency`, which edits them per owner-approved item), the generated paths the guard protects. Memory files other than the `MEMORY.md` index are rewritten or deleted only after the owner confirms.
- **The layer is team-shared.** A personal preference never goes into `CLAUDE.md` or a rule: it goes to `CLAUDE.local.md`, or into the report as a suggestion.
- **Edits use Edit / Write only.** No commits, plain hyphens. If the branch is not the default one, say so before the first edit - an AI-layer edit riding on a feature branch is the owner's call.
- **Record the run** in `<scratchpad>/ai-layer-<mode>.md` (this session's scratchpad): the mode, the baseline numbers, every finding with its decision (applied, rejected with the reason, reported), and the numbers after. Every agent prompt names the files it may read and carries the decisions this run already took. A run that may outlive the session (`deep`, `rules`, `efficiency`) runs `handoff` before a `/compact`, naming that file.
- **Stamp the run.** A `weekly` or `deep` run in the main tree ends by writing today's date (`YYYY-MM-DD`, the only line) into the gitignored `.claude/.last-maintain` with `Write`; `upkeep-nudge.mjs` reads it at session start and asks for the next pass after 14 days. `rules` and `efficiency` do not stamp.
- **Every agent this skill launches runs on Sonnet.** Pass `model: "sonnet"` on each `Agent` call and no `effort`, so `drift` keeps its frontmatter's and the built-ins run at their usual effort. A claim-by-claim check does not need a bigger model.

## Report

The `weekly`, `deep` and `rules` report is in the user's language and short:

1. **Mode and what ran** - each agent type with its count (`drift` x3, or x24 in 3 waves), and every step skipped, with the reason.
2. **Numbers, before -> after** - `CLAUDE.md` bytes; the rule count and total rule bytes; `layer-refs` unresolved; the check command.
3. **Applied** - grouped by file, one line per change; the rules added, split, merged and deleted come first, each with its reason.
4. **Reported, not applied** - hooks and settings, code findings, findings against settled decisions, workflow design proposals, memory awaiting confirmation; each answerable in one line.
5. **Not checked** - `unverifiable` claims, and what this pass skipped by design (`weekly` fact-checks only the hotspots).
