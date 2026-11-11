# rules mode

The rule set, and nothing else in the layer: every rule checked against the code, each `paths:` matched to the files its text needs (over-reach and under-reach), a rule whose sections serve different files split, and the rules the code needs and no layer file states added. With no project rule at all - the state right after the install, which ships no rule - R7 builds the set from the whole project. `deep` runs R1's inventory, R2's two decisions and R3-R5 as its D2, or R7 when there is no project rule; `init` runs R7, or R1-R5 on a layer that already has rules.

The run applies what it verified, like `deep`. "Writing a rule" below is read before the first rule edit.

## Writing a rule

**A rule the loader reads no globs from - no frontmatter, a misspelled key - loads on every session**, exactly like `CLAUDE.md`, so a broken `paths:` block costs every conversation the rule's full bytes.

**How a rule loads.** Only the trigger is a documented contract: a rule loads when Claude reads a matching file, "not on every tool use". The rest is observed: a path-scoped rule is injected in full, once per context, when the Read tool or a Bash command that reads a file (`head`) opens a file its globs match, and not again once the rule's own file was Read - its text is already in context; Glob, Grep (a file path included), Write and Edit load nothing; a subagent's Read loads into that subagent only; after `/compact` every path-scoped rule is gone until the next matching Read, so the cost recurs per compaction. The loader expands every brace group, strips a trailing `/**` and matches case-insensitively, with gitignore semantics, against the repo-relative path: a glob with a slash inside is anchored at the root (`'src/pages/*/index.tsx'` matches one level, `'src/**/index.tsx'` every level), a slash-less glob matches at any depth, and a folder glob such as `nginx/**` is stripped to a slash-less name and so matches that folder at any depth. There is no negation: a rule that must not fire for a subfolder needs a narrower positive glob.

**What goes into a rule.**

- The **detail** behind a prohibition or a convention that `CLAUDE.md` states in one line: the mechanics, the exceptions with their reasons, the trap that produced the rule - and a prohibition about code in files the rule covers, which lives in that rule alone.
- Facts about one folder or one pattern that a session working elsewhere never needs.
- What stays in `CLAUDE.md`: a prohibition that must be known before any file is read (never create X, which tool to pick) - a path-scoped rule fires only after a matching file is read, which is too late for it. Text only one process step needs (a verification rig, an audit procedure) goes into the skill that runs that step, where it loads on demand.
- A count or a site list rots on the next added file - write the grep that finds the sites. Delete what is true but dead.
- **The budget is 20 KiB per rule**, by `wc -c` of the LF text; `--check` fails a rule over it.

**Choosing a glob.** Point the globs at what the rule describes, not at everything it governs: a rule about the query cache belongs on the files that call queries, and on the whole source tree it loads for every read. Reach is paid in bytes, under-reach in defects. Narrow a glob by pattern (`.tsx` only, `index.tsx` only, a folder the text is about), never by enumerating today's folder names - the next module of the same shape is exactly the file such a list misses. Never widen a glob past the files its text binds: the glob states which files need the rule, and text that binds other files moves instead.

**Shape problems.** `rules-reach.mjs` matches with `path.posix.matchesGlob` and prints a `SHAPE` line, exit 1 from `--check` and the report, wherever that and the loader disagree:

- a missing, duplicated or empty `paths:` block list, or a line in it that is not a single-quoted item (a blank or `#` line included) - the loader also reads a string or a flow list, the script only the block form;
- whitespace; a comma outside the brace group; nested or several brace groups; a brace group with one alternative, or an empty one;
- per brace alternative: a stray slash (leading, trailing, `./`, `//`); a segment ending in `*` before `/**`; a folder glob such as `nginx/**` (stripped to a slash-less name, the loader matches it at any depth); a slash-less glob a nested file also matches; a glob without `/**` that matches a directory (the rule then loads for everything inside it).

Not covered: an indentation mix a YAML parser rejects, which makes the loader ignore the frontmatter. The file list is `git ls-files --cached --others --exclude-standard`, so a file a change created counts before anyone commits it. The loader is case-insensitive, `matchesGlob` only for wildcard segments on Windows.

**The modes.**

- No flag: the rule bytes a Read of each `<SRC_DIR>/` source file pulls in (median, top decile, max, files over 30 and 20 KB), the heaviest files, and each rule's size, reach and `<SRC_DIR>/` globs matching nothing. Past ~30 KB of rules per file read, the globs overlap and need splitting by what the reader of that file needs.
- `--files <rule>`: every path the rule's globs match, `.claude/` included, one per line. `SHAPE` and `FAIL` lines go to stderr, so `| wc -l` counts paths alone; a name may carry its `.md`, and an unknown rule is a `FAIL` and exit 1.
- `--check`: the shape check, and a `FAIL` for each rule over the 20 KiB budget, measured on LF bytes; either exits 1. With no `.claude/rules/` folder it checks an empty set and passes.

**Adding a rule:**

1. the file with its `paths:` block, every item a single-quoted line;
2. `--files <rule>` read against the intent: every file kind the text binds is in it, and no file it says nothing about;
3. `node .claude/scripts/rules-reach.mjs --check`.

A rule needs no pointer in `CLAUDE.md`: it loads by itself with its files.

## R1. Baseline

First, what exists:

- **No `rules-reach.mjs`**: stop and say so. A rule set nobody can measure is not built by hand.
- **No `.claude/rules/` folder**: go to R7 after the weekly step 1 commands; the report and `--check` run on an empty set.

Then `references/weekly.md` steps 1 and 2, and the inventory into the task file - per rule: its bytes, its `##` headings, its globs and its reach (`node .claude/scripts/rules-reach.mjs --files <rule> | wc -l`, every file kind; the report's "Files" column counts `<SRC_DIR>/` code only) - and the union of all reach lists against `git ls-files --cached --others --exclude-standard <SRC_DIR>`: the **unreached folders**, where no rule loads at all.

**No project rule** - no rule whose reach holds a file outside `.claude/` - sends the run to R7; R2-R5 have nothing to work on.

## R2. Against the code

One `drift` in `section` mode per rule file, in waves of eight in parallel, as `deep.md` D1 runs them (the claims that need action only; the pairs applied between waves). Then:

- **A rule whose subject is gone** - every component, helper, path and identifier it is about deleted from the code (`git log --diff-filter=D` finds where it went) - is deleted, with every reference `layer-refs` then reports. A rule with part of its subject gone loses those sections only.
- **A rule that restates `CLAUDE.md` or another rule** keeps one copy, chosen by the "where text lives" standing rule.

## R3. Reach, both ways

Launch one `general-purpose` agent per rule family (a rule with its `-internals` / `-<suffix>` siblings), in waves of eight, read-only: `grep`, `git grep`, `ls`, `git log`, `git show` and `rules-reach.mjs --files`, never an edit or a written file. Each prompt carries the family's rule files, "Writing a rule" above, the settled list and this run's decisions. Each agent returns:

- **Section map** - for each `##` section, the files its text changes how someone writes, as globs; the reached files no section needs (**over-reach**).
- **Under-reach** - the identifiers each section is about (components, hooks, helpers, props, file names), their use sites from `git grep --untracked -l` (uncommitted files count, as in `--files`), minus `--files <rule>`. A site counts only when the section's text would change how that file is written; an import that needs nothing of the text does not.
- **The fix** - the new `paths:` as a narrowed or widened pattern, never a list of today's folder names.

Apply each fix after checking it with `--files` before and after. A section that serves a strict subset of the rule's files goes to R4.

## R4. Split and trim

**A rule is split by audience, never by size.** Two halves that load for the same files cost the same bytes as one file and add a file to keep in step. Size only picks the candidates: a rule over ~8 KB, and every rule that binds a file the report lists over 30 KB.

- **Sections with a different audience** (R3's section map) move to a rule whose globs fit them: an existing one, or a split. The usual shape is `<name>.md` for the call sites and `<name>-internals.md` for the component's own folder. A split is made only when R3's map names files that stop loading the moved text, and the report after it must show that.
- **One audience, still heavy** - trim instead: true-but-dead text, a mechanic only one process step needs (to that step's skill), a second copy.
- **The floor:** a rule that would end under ~1 KB is merged into the rule whose globs it shares.
- The pointers to the old file are re-aimed (`grep -rn --exclude-dir=sessions "<rule>.md" CLAUDE.md .claude`).

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
5. **An audience:** the files it binds fit a glob narrower than the tree. A prohibition that must be known before any file is read goes into `CLAUDE.md` within its budget instead; nothing becomes a rule without `paths:`.

It lands as a line or a paragraph in the rule whose `paths:` reach those files, and a new file only when no rule reaches them or the reaching rule's audience is much wider than the text needs - by "Adding a rule" above. Policy breaks go through the "code is not the doc's servant" standing rule. Each rejected candidate is logged with the condition it failed.

## R6. Verify

`node .claude/scripts/rules-reach.mjs --check`, the report, `layer-refs` and `wc -c CLAUDE.md`, against R1. Then `references/weekly.md` step 7. `rules` does not stamp `.last-maintain`.

## R7. No project rule: build the set

1. **Survey.** `git ls-files` per top-level folder with counts, the stack from the package manifest, and the `CLAUDE.md` sections. Cut the code into areas of at most ~250 source files (a large folder by its subfolders), plus one for the root config files.
2. **Candidates.** One `general-purpose` agent per area, waves of eight, read-only as in R3, plus R5's fix-history agent. Each returns the R5 asks, every candidate with its sites and the glob of the files it binds. `CLAUDE.md` text that only one area needs (a mechanic, or a prohibition about code in that area's files) is a candidate too: it moves into the rule, with no pointer left behind.
3. **Filter** by R5's five conditions.
4. **Cluster by audience:** one rule per set of files that needs the same text, named by its subject; R4's floor and split shape hold from the first draft.
5. **Write** each rule by "Adding a rule" above, then `--check`.
6. Then R3 over the new set, and R6.
