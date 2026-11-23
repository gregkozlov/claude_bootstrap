---
name: maintain-ai-layer
description: Upkeep of the AI layer against the code - deep (default, about monthly), rules; init fills CLAUDE.md, rules and agents after an install. Use on "/maintain-ai-layer", "maintain the AI layer", "audit the layer", "optimize the rules".
argument-hint: '[deep | rules | init]'
---

# maintain-ai-layer

The AI layer rots quietly: a file moves and a rule still names it, a count grows, a glob matches nothing or a whole rule loads for files it never mentions, a `CLAUDE.md` paragraph describes code that changed. This skill is the recurring pass that fixes that. It never touches the source directory. The deliverable is the edited layer plus the report.

## Mode

The argument picks the mode, and the first line of the reply names it. With no argument, when the layer's `CLAUDE.md` still carries `[fill]` lines, the mode is `init` - say so in the first line. Each mode's steps live in `references/<mode>.md` (an alias reads its mode's file): read that file before the first step, and only the others it names, plus `references/settled.md` (Standing rules).

- **`deep`** (also `deep-audit`, and the default with no argument on a filled layer) - about once a month, when the session-start reminder asks, and after a large refactor: the mechanical checks in the main thread (dead references, rule globs that match nothing, wrong counts, always-on bytes), then a `drift` fact-check of every layer file, the `rules` steps, cross-file consistency, the hooks, the memory and a walk of whole tasks through the lifecycle. Dozens of agent launches.
- **`rules`** - the rule set alone, in depth: every rule checked against the code, `paths:` over- and under-reach, a rule whose sections serve different files split, new rules from a sweep of the code and its fix history, stale ones corrected or deleted. With no project rule, it builds the set from the whole project. Run it after a large code change.
- **`init`** - the project-specific parts, from a survey of the repo: the `[fill]` sections of `CLAUDE.md`, the rule set built or updated and enriched, and the units tuned to the project. Run it once right after the install, and again whenever the project has moved on; a second run updates, it never rebuilds. `rules` touches the rules alone, `deep` audits the layer as it stands.

**Every mode spends agent launches by the dozen, and only when the user starts it** - the reminder tells the user, it never starts a run. `deep` is the routine one, about monthly; `rules` runs on request. `init` is as thorough as in the full layer by design, because every later session pays for a rule set built on a thin survey.

## Measuring a rule

This layer ships no reach checker, so the reach of a rule - the files whose Read loads it - is measured with git. For each item of its `paths:` list: `git ls-files --cached --others --exclude-standard ':(glob)<glob>'`. Three places where git and the loader read a glob differently: a brace group (`*.{ts,tsx}`) is expanded by hand, one call per alternative; a glob without a slash matches at any depth for the loader, so measure it as `**/<glob>` too; a trailing `/**` the loader strips, which reaches the same files. The union is the rule's reach; a rule the loader reads no `paths:` from (no frontmatter, a misspelled key, a flow list) loads in every session.

## Standing rules (all modes)

**This skill applies what it verified itself**, with no approval round: a stale fact, a dead line, a misplaced paragraph, a glob change goes in once one command of your own has confirmed it against the code. These limits still hold, because they come from `CLAUDE.md` and this skill cannot lift them:

- **Which `CLAUDE.md`:** `CLAUDE.md` in this skill means the layer's file - the one with the `Layer tracking` line (`grep -l "Layer tracking" CLAUDE.md .claude/CLAUDE.md`): the root file in team mode, the one inside `.claude/` in a personal one. A team's root `CLAUDE.md` beside a personal layer is the project's, never edited here.
- **Check every finding before applying it.** An agent's `replace:` / `with:` pair is re-verified with one command of your own before the Edit. A finding you reject is logged with its reason.
- **Where text lives:** a prohibition that must be known before any file is read stays in `CLAUDE.md`; one about code in a file a rule covers, and every detail, goes to the `.claude/rules/*.md` file whose `paths:` reach that code. `CLAUDE.md` stays under its 20 KB budget (`wc -c` of the layer's file). A rule without `paths:` loads in every session.
- **A `paths:` change is measured before and after** ("Measuring a rule"): the files that needed the rule are still reached, and the ones that did not are gone. A glob is never widened to reach one more file - the text moves to the rule whose globs already reach it.
- **The code is not the doc's servant.** When code breaks a written policy in several places, the policy is rewritten only if `git log` shows a deliberate move away from it. Otherwise it is a code finding for the report, and this skill never fixes it.
- **Settled is settled.** A decision `CLAUDE.md` marks as settled and deliberate is not reopened; a finding against one goes to the report as a note about the decision, not a defect. Findings earlier runs settled are in `references/settled.md`: every agent prompt carries that list, a matching finding is logged as settled and not reported, and the run appends each new owner answer and each accepted rejection to it.
- **Never edited, only reported:** `.claude/hooks/**`, `.claude/settings*.json`, the generated paths the guard protects. Memory files other than the `MEMORY.md` index are rewritten or deleted only after the owner confirms.
- **A team layer is shared.** With `Layer tracking: team`, a personal preference never goes into `CLAUDE.md` or a rule: it goes to `CLAUDE.local.md`, or into the report as a suggestion.
- **Searching `.claude`:** the Grep tool misses files when its `path` is `.claude` itself (ripgrep misapplies the `.claude/*` ignore lines at that root), and from the repo root it skips a layer git ignores, so a low-hit answer there proves nothing: pass a subfolder (`.claude/agents`), or `grep -rn` over `.claude` in Bash. Every agent prompt that searches the layer carries this.
- **Edits use Edit / Write only.** No commits, plain hyphens. In a team layer, if the branch is not the default one, say so before the first edit - an AI-layer edit riding on a feature branch is the owner's call.
- **Record the run** in `<scratchpad>/ai-layer-<mode>.md` (this session's scratchpad): the mode, the baseline numbers, every finding with its decision (applied, rejected with the reason, reported), and the numbers after. Every agent prompt names the files it may read and carries the decisions this run already took. A run that may outlive the session (`deep`, `rules`, `init`) runs `handoff` before a `/compact`, naming that file.
- **Stamp the run.** A `deep` or `init` run in the main tree ends by writing today's date (`YYYY-MM-DD`, the only line) into `.claude/.last-maintain` with `Write` - committed with the layer in team mode, per machine in a personal one; `upkeep-nudge.mjs` reads it at session start and asks for the next pass after 30 days. In team mode the stamp is one more file for the owner to commit. `rules` does not stamp.
- **Every agent this skill launches runs on Sonnet at high effort.** Pass `model: "sonnet"` and `effort: "high"` on each `Agent` call - this sentence is the explicit request the tool needs before it takes an effort; without it the built-in `Explore` and `general-purpose` would run at whatever effort Claude Code defaults to. A claim-by-claim check does not need a bigger model.

## Report

The `deep` and `rules` report is in the user's language and short (`init` writes the report its own file names):

1. **Mode and what ran** - each agent type with its count (`drift` x24 in 3 waves), and every step skipped, with the reason.
2. **Numbers, before -> after** - `CLAUDE.md` bytes; the rule count and total rule bytes; `layer-refs` unresolved; the check command.
3. **Applied** - grouped by file, one line per change; the rules added, split, merged and deleted come first, each with its reason.
4. **Reported, not applied** - hooks and settings, code findings, findings against settled decisions, workflow design proposals, memory awaiting confirmation; each answerable in one line.
5. **Not checked** - `unverifiable` claims, and what this pass skipped by design.
