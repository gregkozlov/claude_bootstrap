---
paths:
  - '.claude/rules/*.md'
  - '.claude/scripts/rules-reach.{mjs,fixture.json}'
---

# Path-scoped rules and their reach

The always-on rule is the size-budget bullet in `CLAUDE.md` (Surgical Changes); this file carries how a rule loads, what goes into one and how `.claude/scripts/rules-reach.mjs` proves the globs.

## How a rule loads

Only the trigger is a documented contract: a rule loads when Claude reads a matching file, "not on every tool use". The rest is observed, and was read in the 2.1.283 bundle. `rules-reach.mjs` encodes it, so a loader change makes `--check` pass on a wrong model: `--loads` replays every load `record-loads.mjs` logged against it, and the `maintain-ai-layer` skill's `deep` mode re-measures it with a loader probe (D3).

A path-scoped rule is injected in full, once per context, when the Read tool opens a file its `paths:` match, or a connected IDE opens one in the main thread; after `/compact` every path-scoped rule is gone until the next matching Read, so the cost recurs per compaction. Glob, Grep (a file path included), Write and Edit load nothing, but a Bash command that reads a file does: `head` on a matched file loaded its rules (2.1.296). A subagent's Read loads into that subagent only; since 2.1.296 its load event carries `agent_id` and `agent_type` (a main-thread load carries neither), and `--loads` still attributes a load by its trigger path and its time. A rule whose own file was already Read is not injected again - its text is already in context. A rule the loader reads no `paths:` from - no frontmatter, a misspelled key - loads on every session, exactly like `CLAUDE.md`, and costs the same; a string value is split at its commas outside braces and a flow list is read as a list, and the script refuses both, since its parser reads only the block form. The loader expands every brace group, strips a trailing `/**` and matches with gitignore semantics against the repo-relative path - the load event's `globs` is the rule's whole list in that form: a glob with a slash inside is anchored at the root (`'src/pages/*/index.tsx'` matches one level, `'src/**/index.tsx'` every level), a slash-less glob matches at any depth, and a folder glob such as `nginx/**` is stripped to a slash-less name and so matches that folder at any depth. There is no negation: a rule that must not fire for a subfolder needs a narrower positive glob.

## What goes into a rule

- The **detail** behind a prohibition or a convention that `CLAUDE.md` states in one line: the mechanics, the exceptions with their reasons, the trap that produced the rule.
- Facts about one folder or one pattern that a session working elsewhere never needs.
- **Point the globs at what the rule describes, not at everything it governs.** A rule about the query cache belongs on the files that call queries; putting it on the whole source tree loads it for every read and costs the whole project.
- **Reach is paid in bytes, under-reach in defects.** Narrow a glob by pattern (`.tsx` only, `index.tsx` only, a folder the text is about), never by enumerating today's folder names: the next module with the same shape is exactly the file such a list misses.
- A count or a site list rots on the next added file - write the grep that finds the sites. Delete what is true but dead.

What stays in `CLAUDE.md`: every prohibition ("never create X") - a path-scoped rule fires only after a matching file is read, which is too late for something that must not be created at all. Text only one step of the process needs (a verification rig, an audit procedure) goes into the skill that runs that step, where it loads on demand.

**Adding a rule is four steps:**

1. the file with its `paths:` block, every item a single-quoted line (`rules-reach.mjs` refuses anything else as a shape problem);
2. a `must` pair in `rules-reach.fixture.json` - a file that needs the rule and a needle from the paragraph it needs - and a `mustNot` pair wherever the glob could over-reach;
3. a pointer in `CLAUDE.md` naming when it loads, within its size budget;
4. `node .claude/scripts/rules-reach.mjs --check`.

## rules-reach.mjs

The script matches with `path.posix.matchesGlob` and refuses, as a shape problem, the rules and globs where it and the loader disagree: a missing, duplicated or empty `paths:` block list, any line inside it that is not a single-quoted item (a blank or `#` line included), whitespace, a comma outside the brace group (the loader splits an item there), nested or several brace groups (the loader expands every group, but the per-alternative checks expand a glob only when it has exactly one), a brace group with one alternative or an empty one, and - checked on each brace alternative - a stray slash (leading, trailing, `./` or `//`), a segment ending in `*` before `/**` (the loader also matches a file such as `SummaryTable.tsx` against `*Table*/**`), a folder glob such as `nginx/**`, a slash-less glob a nested file also matches, and a glob without `/**` that matches a directory (the loader then loads the rule for everything inside it). Not covered: an indentation mix a YAML parser rejects, which makes the loader ignore the frontmatter. The file list is `git ls-files --cached --others --exclude-standard`, so a file this change created counts before anyone commits it. The loader is case-insensitive, `matchesGlob` only for wildcard segments on Windows.

Without arguments it reports the rule bytes a Read of each source file pulls in, the heaviest files and each rule's reach; past ~30 KB of rules per file read, the globs overlap and need splitting by what the reader of that file needs. `--check` runs the shape check and `rules-reach.fixture.json`: every `must` pair names a file, a rule and a needle - a string from the paragraph the file needs, never a heading or a glob - and fails when the glob misses the file or the rule body no longer contains the needle; every `mustNot` pair fails when the rule loads; either fails on a rule that does not exist, on an entry without a file, a rule or (for `must`) a non-empty needle, and on a path that exists on disk but is not in that list - Windows resolves `src\x.ts`, `./src/x.ts` and a wrong case, and no glob matches them. A fixture file that no longer exists is a warning, not a failure, so a rename on a branch without the AI layer does not break the check command; update the fixture in the next AI-layer change. A fixture path that no commit on any branch has ever seen is a typo, and fails - so does one git refuses to read (a path outside the repo).

`--loads [session id prefix]` replays the log `record-loads.mjs` keeps for this tree, 15 days deep. Every `path_glob_match` load of a project rule is checked against the script's model: the globs the loader read must be the parser's whole list, expanded the loader's way, or - since the event is described as carrying only the matched patterns - a non-empty part of it that matches the trigger (`PARSER`), and the trigger path must match, case-insensitively like the loader (`REACH`). A gitignored trigger is not `REACH`-checked, only counted: the loader also matches a gitignored namesake deeper in the tree (`node_modules/x/package.json`), which no rule shape can exclude; a trigger merely deleted since is still checked. A project rule loaded at session start is an `ALWAYS` line. A user or managed rule is not checked, and a load of a rule the parser reports a problem or a `SHAPE` line for, or older than its rule file's last change, is skipped. With a prefix it first lists that session's loads in order, in local date and time, each with its trigger. It exits 1 on a mismatch, on a record that is unreadable or lacks `load_reason`, `file_path` or `memory_type` (a payload field moved), and when no rule load was left to check. It checks one direction only: a load that should have happened and did not leaves no record, which only the D3 probe catches.

**A new rule or a changed `paths:` gets a `must` pair for the file that needs it** - and when a pair fails, move the text to the rule whose globs reach that file; never widen a glob to make a pair pass.
