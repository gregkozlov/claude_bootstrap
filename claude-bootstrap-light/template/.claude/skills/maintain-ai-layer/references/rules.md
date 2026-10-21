# rules mode

The rule set, and nothing else in the layer: every rule checked against the code, each `paths:` matched to the files its text needs (over-reach and under-reach), a rule whose sections serve different files split, and the rules the code needs and no layer file states added. With no project rule at all - the state right after the install, which ships none - R7 builds the set from the whole project. `deep` runs R1's inventory, R2's two decisions and R3-R5 as its D2, or R7 when there is no project rule.

The run applies what it verified, like `deep`. Reach is measured as `SKILL.md` "Measuring a rule" says; this layer has no reach checker, no fixture and no load log, so a rule's reach is proved by that measurement alone, before and after every change.

## Writing a rule

- The file is `.claude/rules/<subject>.md`, opening with a `paths:` frontmatter in block form - one glob per line, each a single-quoted item (`  - 'src/**/*.tsx'`). A flow list, a string or a misspelled key makes the loader read no globs, and the rule then loads in every session.
- **Point the globs at the files whose writing the text changes**, not at everything it governs: a rule about a query cache belongs on the files that call queries. Narrow by pattern (`.tsx` only, `index.tsx` only, a folder the text is about), never by listing today's folder names - the next module with the same shape is the file such a list misses. Reach is paid in bytes on every matching Read, under-reach in defects.
- **A prohibition stays in `CLAUDE.md`**: a rule fires only once a matching file is read, which is too late for "never create X". Text one process step needs goes into that step's skill.
- `CLAUDE.md` gets a one-line pointer naming the rule and when it loads, within its 20 KB budget.
- A count or a site list rots - write the grep that finds the sites.

## R1. Baseline

`references/weekly.md` steps 1 and 2. Then the inventory into the run file - per rule: its bytes, its `##` headings, its globs and its reach - and the union of all reaches against `git ls-files --cached --others --exclude-standard` of the source directory: the **unreached folders**, where no rule loads at all. Then the **heaviest files**: for the most-read folders, the summed bytes of every rule that reaches a file there.

**No project rule** - no `.claude/rules/*.md`, or none whose reach holds a file outside `.claude/` - sends the run to R7; R2-R5 have nothing to work on.

## R2. Against the code

One `drift` in `section` mode per rule file, in waves of eight in parallel (non-`holds` entries and the tally only; `references/settled.md` and this run's decisions in every prompt; the pairs applied between waves). Then:

- **A rule whose subject is gone** - every component, helper, path and identifier it is about deleted from the code (`git log --diff-filter=D` finds where it went) - is deleted, with its `CLAUDE.md` pointer and every reference `layer-refs` then reports. A rule with part of its subject gone loses those sections only.
- **A rule that restates `CLAUDE.md` or another rule** keeps one copy, chosen by the "where text lives" standing rule.

## R3. Reach, both ways

Launch one `general-purpose` agent per rule family (a rule with its `-internals` / `-<suffix>` siblings), in waves of eight, read-only: `grep`, `git grep`, `git ls-files`, `ls`, `git log` and `git show`, never an edit or a written file. Each prompt carries the family's rule files, "Measuring a rule" from `SKILL.md`, "Writing a rule" above, `references/settled.md` and this run's decisions. Each agent returns:

- **Section map** - for each `##` section, the files its text changes how someone writes, as globs; the reached files no section needs (**over-reach**).
- **Under-reach** - the identifiers each section is about (components, hooks, helpers, props, file names), their use sites from `git grep --untracked -l`, minus the rule's reach. A site counts only when the section's text would change how that file is written; an import that needs nothing of the text does not.
- **The fix** - the new `paths:` as a narrowed or widened pattern, never a list of today's folder names, with the reach before and after.

Apply each fix after measuring it yourself. A section that serves a strict subset of the rule's files goes to R4.

## R4. Split and trim

**A rule is split by audience, never by size.** Two halves that load for the same files cost the same bytes as one file and add a file to keep in step. Size only picks the candidates: a rule over ~8 KB, and every rule that adds to one of R1's heaviest files.

- **Sections with a different audience** (R3's section map) move to a rule whose globs fit them: an existing one, or a split. The usual shape is `<name>.md` for the call sites and `<name>-internals.md` for the component's own folder. A split is made only when R3's map names files that stop loading the moved text, and the reach after it must show that.
- **One audience, still heavy** - trim instead: true-but-dead text, a mechanic only one process step needs (to that step's skill), a second copy.
- **The floor:** a rule that would end under ~1 KB is merged into the rule whose globs it shares.
- A new file gets its `CLAUDE.md` pointer within budget, and the pointers to the old file are re-aimed (`grep -rn "<rule>.md" CLAUDE.md .claude`).

A candidate `references/settled.md` already answered is logged as settled.

## R5. Rules the code needs

Cut the source directory into three areas of roughly equal file count by top-level folder (`git ls-files <source dir> | cut -d/ -f1-2 | sort | uniq -c`), generated code left out. Launch four agents in parallel, read-only, as in R3: three `Explore` ("very thorough"), one per area, each told the unreached folders in its area first; and one `general-purpose` on the **fix history**: `git log --since=6.months --no-merges -i --grep='^fix' --format='%h %s' --name-only -- <source dir>` (the project's fix-commit prefix in `--grep`), each commit's diff read with `git show`, its defect class named, and the classes fixed twice, or once in a shared component, returned with the commits.

Each prompt lists the layer files and asks for:

1. Conventions that a competent newcomer would get wrong and that no layer file states, each with at least three sites as evidence.
2. Shared components, helpers or hooks that the layer should point to but never names. Example: a rule says to build X, and X already exists.
3. Every policy in `CLAUDE.md` or a rule that the code breaks, with the site count.

**A candidate becomes rule text only when all five hold:**

1. **Evidence:** three sites that follow it, or a fix commit whose cause it names.
2. A competent newcomer would get it wrong.
3. Neither the type checker nor the linter catches it: an enforced rule teaches itself through its error.
4. No layer file says it - `CLAUDE.md`, a rule, an agent, a skill - and `references/settled.md` did not reject it.
5. **An audience:** the files it binds fit a glob narrower than the tree. A prohibition every session needs goes into `CLAUDE.md` within its budget instead; nothing becomes a rule without `paths:`.

It lands as a line or a paragraph in the rule whose `paths:` reach those files, and a new file only when no rule reaches them or the reaching rule's audience is much wider than the text needs - by "Writing a rule". Policy breaks go through the "code is not the doc's servant" standing rule. Each rejected candidate is logged with the condition it failed.

## R6. Verify

The rule count, the bytes, every changed rule's reach, `layer-refs` and `wc -c CLAUDE.md`, against R1. Then `references/weekly.md` step 6, without the stamp: `rules` does not stamp.

## R7. No project rule: build the set

1. **Survey.** `git ls-files` per top-level folder with counts, the stack from the package manifest, and the `CLAUDE.md` sections. Cut the code into areas of at most ~250 source files (a large folder by its subfolders), plus one for the root config files.
2. **Candidates.** One `general-purpose` agent per area, waves of eight, read-only as in R3, plus R5's fix-history agent. Each returns the R5 asks, every candidate with its sites and the glob of the files it binds. `CLAUDE.md` text that only one area needs (a mechanic, not a prohibition) is a candidate too: it moves into the rule, and a pointer stays - the move that keeps `CLAUDE.md` inside its budget.
3. **Filter** by R5's five conditions.
4. **Cluster by audience:** one rule per set of files that needs the same text, named by its subject; R4's floor and split shape hold from the first draft.
5. **Write** each rule by "Writing a rule", and measure its reach.
6. Then R3 over the new set, and R6.
