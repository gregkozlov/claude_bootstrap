# rules mode

The rule set, and nothing else in the layer: every rule checked against the code, each `paths:` matched to the files its text needs (over-reach and under-reach), a rule whose sections serve different files split, and the rules the code needs and no layer file states added. With no project rule at all - the state right after the bootstrap, whose two shipped rules reach only `.claude/` - R7 builds the set from the whole project. `deep` runs R1's inventory, R2's two decisions and R3-R5 as its D2, or R7 when there is no project rule.

The run applies what it verified, like `deep`. `.claude/rules/rules-reach.md` ("What goes into a rule", "Adding a rule", and the checker) is read before the first rule edit.

## R1. Baseline

First, what exists:

- **No `rules-reach.mjs`**: stop and say so. A rule set nobody can measure is not built by hand.
- **No `.claude/rules/` folder**: the script cannot load. Run the weekly step 1 commands without its three lines, and go to R7.
- **No `rules-reach.fixture.json`** beside the script: create it as `{ "must": [], "mustNot": [] }` before `--check` runs.

Then `references/weekly.md` steps 1 and 2, and the inventory into the task file - per rule: its bytes, its `##` headings, its globs and its reach (`node .claude/scripts/rules-reach.mjs --files <rule> | wc -l`, every file kind; the report's "Files" column counts `<SRC_DIR>/` code only) - and the union of all reach lists against `git ls-files --cached --others --exclude-standard <SRC_DIR>`: the **unreached folders**, where no rule loads at all.

**No project rule** - no rule whose reach holds a file outside `.claude/` - sends the run to R7; R2-R5 have nothing to work on.

## R2. Against the code

One `drift` in `section` mode per rule file, in waves of eight in parallel, as `deep.md` D1 runs them (non-`holds` entries and the tally only; the pairs applied between waves). Then:

- **A rule whose subject is gone** - every component, helper, path and identifier it is about deleted from the code (`git log --diff-filter=D` finds where it went) - is deleted, with its fixture pairs, its `CLAUDE.md` pointer and every reference `layer-refs` then reports. A rule with part of its subject gone loses those sections only.
- **A rule that restates `CLAUDE.md` or another rule** keeps one copy, chosen by the "where text lives" standing rule.

## R3. Reach, both ways

Launch one `general-purpose` agent per rule family (a rule with its `-internals` / `-<suffix>` siblings), in waves of eight, read-only: `grep`, `git grep`, `ls`, `git log`, `git show` and `rules-reach.mjs --files`, never an edit or a written file. Each prompt carries the family's rule files, the "What goes into a rule" section of `rules-reach.md`, the settled list and this run's decisions. Each agent returns:

- **Section map** - for each `##` section, the files its text changes how someone writes, as globs; the reached files no section needs (**over-reach**).
- **Under-reach** - the identifiers each section is about (components, hooks, helpers, props, file names), their use sites from `git grep --untracked -l` (uncommitted files count, as in `--files`), minus `--files <rule>`. A site counts only when the section's text would change how that file is written; an import that needs nothing of the text does not.
- **The fix** - the new `paths:` as a narrowed or widened pattern, never a list of today's folder names, with one `must` pair per newly reached file kind (a needle from the section it needs) and a `mustNot` pair per glob that must stay out of a folder.

Apply each fix after checking it with `--files` before and after. A section that serves a strict subset of the rule's files goes to R4.

**Then probe the loader itself.** `rules-reach.mjs` models Claude Code's rule loader, whose Read trigger alone is documented, and `--loads` only sees the loads that happened, never the one that should have and did not. `record-loads.mjs` records what the loader does, so the probe agent only drives: its own account of what was injected is not evidence. Launch one fresh `general-purpose` agent, read-only, that never opens anything under `.claude/` (a rule whose file it read is not injected again) and makes exactly these calls, one per step. A subagent's load carries its `agent_id`, but `--loads` lists by trigger, so pick every step's file so that no other step's file reaches its rules; a load then names its step by its trigger path alone:

- Grep and Glob on a file one rule matches, and no later step reaches that rule - expect no load of it; then Bash `head` on another single-rule file - expect its load (one tool call per message, so each load names its step);
- a Read of a file, then a second Read of it - expect its rules once;
- a file matched only through a brace alternative other than the first;
- a file matched only through a trailing `/**` glob;
- a wrong-case path to a matched file (on a case-insensitive file system);
- a matched file outside `<SRC_DIR>/`, if any rule has one.

Predict each step from the globs and write the predictions into the task file before the launch. Every context of the session writes to the same log, so launch only once no other agent of this session is still running, write the time (`date '+%F %T'`) into the task file just before the launch, and let the main thread Read nothing until the agent returns. Then `node .claude/scripts/rules-reach.mjs --loads <this session's id prefix>` lists the session's loads in order with their triggers: the probe's are the rows after that time whose trigger is a probe step's file. No such row for the first Read means `record-loads.mjs` is not firing or a field moved - check its registration in `.claude/settings.json`, then one record (`.claude/hooks/README.md`), before reading anything into the list. Past that control, a predicted load that is missing, one nobody predicted, or any `PARSER` / `REACH` / `ALWAYS` line means `rules-reach.mjs` and `.claude/rules/rules-reach.md` are stale: fix both, and record the probe table in the task file.

## R4. Split and trim

**A rule is split by audience, never by size.** Two halves that load for the same files cost the same bytes as one file and add a file to keep in step. Size only picks the candidates: a rule over ~8 KB, and every rule that binds a file the report lists over 30 KB.

- **Sections with a different audience** (R3's section map) move to a rule whose globs fit them: an existing one, or a split. The usual shape is `<name>.md` for the call sites and `<name>-internals.md` for the component's own folder. A split is made only when R3's map names files that stop loading the moved text, and the report after it must show that.
- **One audience, still heavy** - trim instead: true-but-dead text, a mechanic only one process step needs (to that step's skill), a second copy.
- **The floor:** a rule that would end under ~1 KB is merged into the rule whose globs it shares.
- A moved section takes its fixture pairs (`rule` changed, `needle` kept), a new file gets its `must` pairs and a `CLAUDE.md` pointer within budget, and the pointers to the old file are re-aimed (`grep -rn --exclude-dir=sessions "<rule>.md" CLAUDE.md .claude`).

A candidate `settled.md` already answered is logged as settled.

## R5. Rules the code needs

Launch four agents in parallel, read-only, as in R3: three `Explore` ("very thorough"), each over one area of `<SRC_DIR>/`:

[fill] Split `<SRC_DIR>/` into three areas of roughly equal size by top-level folder - for example (a) the shared components, utilities, constants and state, (b) the pages or screens, (c) everything else except generated code - and list them here as (a), (b), (c).

Each is told the unreached folders in its area first. The fourth, a `general-purpose`, reads the **fix history**: `git log --since=6.months --no-merges -i --grep='^fix' --format='%h %s' --name-only -- <SRC_DIR>` (the project's fix-commit prefix in `--grep`), each commit's diff read with `git show`, its defect class named, and the classes fixed twice, or once in a shared component, returned with the commits.

Each prompt lists the layer files and asks for:

1. Conventions that a competent newcomer would get wrong and that no layer file states, each with at least three sites as evidence.
2. Shared components, helpers or hooks that the layer should point to but never names. Example: a rule says to build X, and X already exists.
3. Every policy in `CLAUDE.md` or a rule that the code breaks, with the site count.

**A candidate becomes rule text only when all five hold:**

1. **Evidence:** three sites that follow it, or a fix commit whose cause it names.
2. A competent newcomer would get it wrong.
3. Neither the type checker nor the linter catches it: an enforced rule teaches itself through its error.
4. No layer file says it - `CLAUDE.md`, a rule, an agent, or the skill that runs at that moment - and `settled.md` / `decisions.md` did not reject it.
5. **An audience:** the files it binds fit a glob narrower than the tree. A prohibition every session needs goes into `CLAUDE.md` within its budget instead; nothing becomes a rule without `paths:`.

It lands as a line or a paragraph in the rule whose `paths:` reach those files, and a new file only when no rule reaches them or the reaching rule's audience is much wider than the text needs - by "Adding a rule" in `rules-reach.md`. Policy breaks go through the "code is not the doc's servant" standing rule. Each rejected candidate is logged with the condition it failed.

## R6. Verify

`node .claude/scripts/rules-reach.mjs --check`, the report, `layer-refs` and `wc -c CLAUDE.md`, against R1. Then `references/weekly.md` step 7. `rules` does not stamp `.last-maintain`.

## R7. No project rule: build the set

1. **Survey.** `git ls-files` per top-level folder with counts, the stack from the package manifest, and the `CLAUDE.md` sections. Cut the code into areas of at most ~250 source files (a large folder by its subfolders), plus one for the root config files.
2. **Candidates.** One `general-purpose` agent per area, waves of eight, read-only as in R3, plus R5's fix-history agent. Each returns the R5 asks, every candidate with its sites and the glob of the files it binds. `CLAUDE.md` text that only one area needs (a mechanic, not a prohibition) is a candidate too: it moves into the rule, and a pointer stays.
3. **Filter** by R5's five conditions.
4. **Cluster by audience:** one rule per set of files that needs the same text, named by its subject; R4's floor and split shape hold from the first draft.
5. **Write** each rule by "Adding a rule" in `rules-reach.md` - `paths:`, `must` / `mustNot` pairs, a `CLAUDE.md` pointer within budget, `--check`.
6. Then R3 over the new set, and R6.
