# Installing this layer - instructions for the model

You are Claude Code, running in the user's project. The user unpacked this bootstrap folder somewhere outside the project and asked you to integrate the working layer in `template/` into the project. This file is your procedure. It is not copied into the project, and neither is anything else outside `template/`.

Three rules hold throughout:

- **Look before writing.** Every value comes from the repo or from the user. A plausible guess in a hook or in `CLAUDE.md` is worse than a question: every later session believes it.
- **Nothing the project already has is destroyed.** An existing `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, agent, skill, command, rule or hook is merged or left alone, never overwritten, and the report names what happened to each. **In a personal mode (step 1) no tracked file of the project is touched at all.**
- **Files only.** No commit, no staging, no push, no package install, no source-code edit - the layer's own rules apply to you from the first minute.

Write repo files with the `Edit` / `Write` tools; on a first install the template is copied with the shell (step 3), on an update file by file with `Write` (section U), since the layer's own guard is live there and refuses a shell copy into the project. Never `cd` in a command chain: absolute paths, `git -C <dir>`. **Run every command block with the Bash tool (Git Bash on Windows), never PowerShell** - the blocks are bash. Below, `BOOT` is the absolute path of this bootstrap folder, `PROJECT` the project root (`git rev-parse --show-toplevel`), `LAYER_MD` the layer's `CLAUDE.md` - `PROJECT/CLAUDE.md` in team mode, `PROJECT/.claude/CLAUDE.md` in a personal mode - and `<scratchpad>` your session's scratchpad directory (any temporary folder outside the project if you have none). Keep them quoted when you substitute them, since a path may hold a space. This install runs in the main thread, with no subagents.

**Before step 3 of a first install, tell the user in one line:** `--add-dir` saves only the prompts for reading the bootstrap. Each copy still asks once - about 20 for this layer.

## 1. Which case, and where the layer lives

```bash
node --version
git -C "PROJECT" rev-parse --show-toplevel && git -C "PROJECT" status --short | head -20
ls -a "PROJECT"; ls -a "PROJECT/.claude" 2>/dev/null || echo "no .claude yet"
git -C "PROJECT" ls-files CLAUDE.md .claude                # tracked: a team config is already here
git -C "PROJECT" check-ignore -v CLAUDE.md .claude/x || echo "not ignored"   # ignored, and by which file
test -d "PROJECT/.claude/.git" && echo "own repo" || echo "no own repo"
```

**No `node` on the path, or one older than 18: stop and tell the user.** The hooks are Node scripts, and a hook that cannot start guards nothing. Installing Node is theirs to do.

**If the session's directory is not `PROJECT`, stop and say:** the hooks run only when Claude Code is started in `PROJECT` - restart there and paste the prompt again.

- **An update of this layer** - the project already has it from an earlier version of this bootstrap: `.claude/hooks/guard.mjs` opens with the "PreToolUse guard" header, `.claude/skills/handoff/` exists and `.claude/hooks/backend-guard.mjs` does not. Go to section U, then come back for the git-exclusion part of step 5, then steps 6, 7 and 8.
- **Another variant of this bootstrap** - the same guard header, but `.claude/skills/lifecycle/` and no `.claude/skills/handoff/` (the full frontend layer), or `.claude/hooks/backend-guard.mjs` (the light backend layer). Stop and ask the user whether to replace it with this one; never merge two.
- **A first install** - everything else, including a project with Claude config of its own that this bootstrap did not write. The mode question below, then steps 2-8.

A project that is not a git repository: say so once, skip the git commands and the mode question, install as team mode (root `CLAUDE.md`, `Layer tracking: team`, no ignore lines) - only the docs check at lifecycle step 5 loses its file list.

**Ask the mode first**, before anything is copied: one `AskUserQuestion`, the recommended option first, each option with its one-line reason.

| Mode | What it means |
| --- | --- |
| **C. Personal, own git repo** (recommended unless the repo says otherwise) | the whole layer in `.claude/` (`CLAUDE.md` becomes `.claude/CLAUDE.md`), `.claude/` added to `.git/info/exclude`, and `.claude/` becomes the developer's own git repo. It gives the layer history and a backup, and `git clean` / `git stash -a` in the project cannot delete it. The developer creates a private repo (on their own account, wherever they keep personal repos) and pushes the layer there. |
| **B. Personal, no history** | as C, without the nested repo |
| **A. Team, committed with the project** | root `CLAUDE.md` merged, the `.gitignore` block: choosing A is the yes for the root `CLAUDE.md` merge and the `.gitignore` block; every other tracked-file edit with the user's yes |

Recommend by what the commands showed. These states are not offered as choices:

- **`.claude/` is already ignored** (the `check-ignore -v` line names the project's `.gitignore`, `.git/info/exclude` or the global excludes file): recommend C, or B. No new ignore line is needed - say where it is ignored.
- **The project tracks files under `.claude/`** (a team config): that means the team shares Claude settings, not that it agreed to this layer - recommend B (the layer's own paths excluded one by one, its hooks in `settings.local.json`, no tracked file modified); offer A as "only if the team agreed". C is not offered, since a nested repo cannot live inside a tracked folder - say so. The paths are excluded in step 5, never `.claude/` wholesale (an exclude cannot hide tracked files), and the hooks and permissions go into `.claude/settings.local.json` in step 7.
- **`.claude/.git` exists**: an own-repo layer - mode C, nothing to init.

The developer may answer in their own words ("Other") with any arrangement: follow it, and name once any consequence that follows. Hooks and `.claude/settings.json` load only from the launch directory's `.claude/`, and agents and skills are found only up to the repo root - a layer in a parent folder therefore does not work when Claude starts in the repo. An ignored layer has no history, `git clean -x` / `-X` and `git stash -a` delete it, and a new `git worktree` does not get it. The rest of the ask round stays in step 6.

## 2. Inventory what is already here

Find the instruction files **by shape, not by a fixed list of names** - the project's own file may have been renamed to anything (`claude_old.md`, `CLAUDE.md.bak`, `docs/claude.md`):

```bash
git -C "PROJECT" ls-files | grep -i "claude\|agents\.md\|cursorrules\|copilot-instructions"
ls -a "PROJECT" | grep -i "claude\|agents\.md\|cursorrules"      # untracked ones too
find "PROJECT/.claude" -maxdepth 3 -type f 2>/dev/null
```

Classify each hit and write the list down before copying anything:

- **The project's own `CLAUDE.md`** (or the renamed copy of it): merged in step 4 in team mode; in a personal mode read for facts, never edited.
- **`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, an instructions section in a README**: another tool's rules for the same repo. Read them for project facts worth carrying into `LAYER_MD`; never rewrite or delete them.
- **An existing `.claude/settings.json`**: merged in step 7 - unless the mode is personal and the team tracks anything under `.claude/`, in which case it is left alone and step 7 writes `.claude/settings.local.json`. Otherwise `settings.local.json` is personal - never touched.
- **Existing agents, skills, commands, rules or hooks**: left alone. A name collision with a template file (their `hunt`, `drift`, `debug`, `handoff`, `retro`, `maintain-ai-layer`) is reported, not resolved: the layer's file is the newcomer, so it is not copied over theirs, and the user decides whether to rename one.
- **Another complete Claude layer** (rules, its own lifecycle, its own review agents - the full bootstrap included): stop and ask the user before going on - two lifecycles in one repo is their decision, not a merge.

## 3. Copy the template, never overwriting

List what would collide first, then copy only what is missing:

```bash
(cd "BOOT/template" && find . -type f | sort) > "<scratchpad>/template-files.txt"
while read -r f; do [ -e "PROJECT/$f" ] && echo "EXISTS $f"; done < "<scratchpad>/template-files.txt"; true
```

In a personal mode the template's `./CLAUDE.md` is checked as `./.claude/CLAUDE.md`; the root file is never a collision.

Copy every file that does not exist yet (`mkdir -p` its folder, then `cp`), one path per `cp`, from `BOOT/template/<path>` to `PROJECT/<path>` - **every file but `.claude/settings.json`, which comes last** (step 7): it registers the guard, and a running session may pick the registration up at once, after which the guard refuses the remaining shell copies. **In a personal mode the template's `CLAUDE.md` goes to `PROJECT/.claude/CLAUDE.md`** (merged there in step 4 if one exists), never to the root. A file that exists is not copied: `CLAUDE.md` is merged in step 4, `.claude/settings.json` in step 7, and any other existing file goes into the report as kept, with a one-line note of how it differs from the template (`diff -q`). Confirm the layer is complete afterwards: `LAYER_MD`, `.claude/agents/{hunt,drift}.md`, `.claude/hooks/{guard,upkeep-nudge}.mjs`, `.claude/hooks/tests/` (three files), `.claude/hooks/README.md`, `.claude/skills/{debug,handoff,retro,maintain-ai-layer}/SKILL.md`, `.claude/skills/maintain-ai-layer/layer-refs.mjs` and its `references/` - and `.claude/settings.json` (or `settings.local.json`) once step 7 has run, plus `.claude/scripts/check.sh` (or `check.mjs`) when step 5 wrote one, and `.claude/.gitignore` in mode C.

## 4. CLAUDE.md

- **The layer's file has no predecessor** (team mode with no root `CLAUDE.md`, or a personal mode with no `.claude/CLAUDE.md`): the template's copy is now in place.
- **Team mode, the project has a root `CLAUDE.md`**: merge, do not concatenate. Read the template's copy from `BOOT/template/CLAUDE.md`. The layer's sections - Working Principles, Surgical Changes, Version Control, Shell and file edits, Development Workflow, Comments, Punctuation - come in verbatim, with the bootstrap note at the top; the project's own facts (commands, architecture, conventions, prohibitions) go into the matching `[fill]` sections of the merged file, in the owner's words. A statement in the old file that contradicts the layer (a different lifecycle, a different review policy, "commit when done") is **not merged silently**: it goes into the report as a conflict with your recommendation, for the user to settle. The `[fill]` sections the old file does not answer stay `[fill]` - `/maintain-ai-layer init` writes them. Mind the 20 KB budget (`wc -c "LAYER_MD"`): project detail past it is moved into path-scoped rules by `init`, not trimmed by you.
- **A personal mode and `.claude/CLAUDE.md` exists**: if git tracks it, stop and ask - team mode, or no install; untracked, merge as in team mode.
- **A personal mode with a team root `CLAUDE.md`**: the team file is left exactly as it is; both files load. Do not copy its facts into `LAYER_MD` - `init` fills the `[fill]` sections with what the team file does not already say. Add this line to `LAYER_MD`'s Version Control section, right after the Layer tracking line: `` - The team's root `CLAUDE.md` holds the project facts; where it disagrees with this file on process (commits, review, the lifecycle), this file wins. `` Report each conflict between the two files.

**In every mode**, replace the `Layer tracking` `[fill]` line in `LAYER_MD` with exactly one of these (`<where>` is the file that ignores `.claude/`: `.git/info/exclude`, the project's `.gitignore` or the global excludes file):

- team: `` - **Layer tracking: team.** The layer is committed with the project; a change to it is reviewed like code. ``
- personal: `` - **Layer tracking: personal.** The layer lives in `.claude/` (`CLAUDE.md` is `.claude/CLAUDE.md`), kept out of the project's git by <where>: never stage it or suggest committing it there; `git clean -x` / `-X` and `git stash -a` would delete it. ``
- own repo: `` - **Layer tracking: own repo.** `.claude/` (`CLAUDE.md` is `.claude/CLAUDE.md`) is the owner's own git repo, kept out of the project's git by <where>: never stage it in the project, and before a branch operation in the project ask the owner to commit the layer repo. ``

## 5. The placeholders and the git exclusion

Fill these in every layer file that carries them (`grep -rln "<[A-Z][A-Z_]\{2,\}>" "LAYER_MD" "PROJECT/.claude"`), with `Edit`. Read each value from the repo; a value the repo cannot answer waits for step 6 and is filled right after it. Mark each in the report as **read from `<file>`** or **assumed**.

| Placeholder | What it is | Where to read it |
| --- | --- | --- |
| `<PROJECT>` | the project name | the manifest's `name`, or the repo folder |
| `<STACK>` | the stack in one line - the framework, the language mode, the two or three libraries that shape the code; it opens `hunt`'s first sentence | the manifest's direct dependencies with their major versions (never a lockfile) |
| `<SRC_DIR>` | the source directory, relative, forward slashes, no `./`, no trailing slash | where the code actually lives, from `git ls-files`, not from convention |
| `<CHECK_COMMAND>` | the **one** verification call: every check the project has, in sequence | the manifest's scripts. With several (`typecheck`, `lint`, `test`) and no single entry point: in team mode propose a package script that chains them (step 6); in a personal mode no package script is added - the value is a raw command line, or a layer-owned script (below) when the checks need several commands or quoted flags. Never invent a command that does not exist |
| `<GENERATED_PATHS>` | a **JSON array** of regex sources for the files the guard refuses to hand-edit, forward slashes, matching the path's tail | the generators behind the manifest scripts (an API client, a schema, migrations, a minified artifact); `[]` is a fine answer |

**The values land inside code and JSON literals**, so each has a shape it must keep:

- `<GENERATED_PATHS>` sits in a `` String.raw`...` `` template in `guard.mjs` and is the JSON array itself, written as it would be in a `.json` file (`["src/api/generated/", "\\.openapi\\.json$"]` - a regex backslash doubled once for JSON); no backtick and no `${`. A bare string or a broken array is named on stderr and protects nothing until fixed, while every other check stays live; a backtick or `${` breaks the file, and a hook that cannot load allows every call. A placeholder left unfilled reads as an empty list.
- `<CHECK_COMMAND>` sits in JSON strings in `settings.json`: one plain command - no `;`, `&&`, `|`, redirect, quote, backslash or backtick. In team mode, chain or quote inside a package script, and the script name is the value. In a personal mode, write a layer-owned `.claude/scripts/check.sh` that runs the checks in sequence, each stopping on failure, with any flag that keeps the layer out of them (`npx eslint . --ignore-pattern ".claude/**"` when the project lints dot-folders); the value is then `bash .claude/scripts/check.sh`. On Windows prove which bash that is: `cmd //c where bash` must list Git's `bash.exe` first; otherwise write the chain as `.claude/scripts/check.mjs` instead (Node, one `spawnSync` per command with `stdio: 'inherit'` and `shell: true`, exiting with the first non-zero status) and the value is `node .claude/scripts/check.mjs`.
- `<SRC_DIR>` sits in single-quoted strings and regexes (`guard.mjs`, `layer-refs.mjs`): letters, digits, `_`, `-`, `@` and `/` only, plus a `.` inside a name, never leading - and never `.` itself: with the code spread over several folders, the one holding most of it, and the others named in the report.

When the grep above shows no hit in a layer file, the placeholders are done; a `<UPPER_CASE>` token in a file the project wrote itself is not this grep's business. The `[fill]` markers are not placeholders - they stay for `init`.

**A personal mode edits no tracked file to fit the layer** - not `.gitignore`, not the package manifest, not a linter or compiler config. A config change the layer would want (a lint exclude for `.claude/`) is skipped and named in the report with what it costs.

**The linter, the formatter check or any other whole-tree tool** may reach the layer's files (a formatter check that walks dot-folders honours `.gitignore`, not the exclude file). In team mode propose the tool's own ignore entry for the layer's paths (step 6), never a weakened rule for the whole tree; in a personal mode the check command's own flags keep the layer out.

**The git exclusion, by mode.**

- **B and C:** add one `.claude/` line to the file `git -C "PROJECT" rev-parse --git-path info/exclude` names (`.git/info/exclude` in a plain clone; in a linked worktree or a submodule `.git` is a file, and a relative answer is relative to `PROJECT`) with `Edit` / `Write` (it sits under a `.git` folder, a protected path, so this asks once). No line when `.claude/` is already ignored - name where. When the project tracks files under `.claude/`, add one line per layer folder and personal path instead: `.claude/CLAUDE.md`, `.claude/agents/hunt.md`, `.claude/agents/drift.md`, `.claude/hooks/`, `.claude/skills/`, `.claude/rules/`, `.claude/scripts/`, `.claude/worktrees/`, `.claude/settings.local.json`, `.claude/handoff.md`, `.claude/.last-maintain`. An exclude never hides a tracked file, so the team's own files in those folders stay visible.
- **C also:** write `PROJECT/.claude/.gitignore` for the per-machine paths of the nested repo: `worktrees/`, `handoff.md`, `.last-maintain`, `settings.local.json`.
- **A:** the `.gitignore` block below.

**Team mode (A).** The layer's folders stay visible to git and the personal paths are ignored; committing the layer is the team's step, not this install's. First list what the project already tracks under `.claude`:

```bash
git -C "PROJECT" ls-files .claude | cut -d/ -f2 | sort -u
```

Every folder in that list gets its own `!.claude/<dir>/` line beside the layer's four, and every file directly under `.claude` its own `!.claude/<file>` line - otherwise the block below would hide the next file the project adds there. Append the block unless the file already has a `.claude/*` line (then compare its negations with this list and add what is missing, with the user's yes):

```gitignore
# Ignore .claude contents, not the dir itself - git will not descend into an ignored directory, so the
# negations only work against `.claude/*`. Deny by default: add a line when you add a directory.
.claude/*
!.claude/agents/
!.claude/skills/
!.claude/hooks/
!.claude/rules/
!.claude/settings.json
# The upkeep stamp is shared: one /maintain-ai-layer run resets the reminder for the whole team.
!.claude/.last-maintain
CLAUDE.local.md
```

A bare `.claude/` (or `/.claude`) line hides the whole layer, and no negation after it can rescue the files. In team mode it is replaced with the block only with the user's yes (step 6); without one, the layer stays out of git and the report says so. Then prove it:

```bash
git -C "PROJECT" check-ignore CLAUDE.md .claude/settings.json .claude/agents/hunt.md .claude/hooks/guard.mjs .claude/skills/maintain-ai-layer/SKILL.md .claude/.last-maintain   # must print nothing
git -C "PROJECT" check-ignore -q .claude/handoff.md && git -C "PROJECT" check-ignore -q .claude/settings.local.json || echo "NOT IGNORED"   # must print nothing
```

## 6. Ask, once

What the repo could not answer goes to the user in one round: `AskUserQuestion` calls of at most four questions each, every question with the option you recommend first, labelled "(Recommended)", and checked against the repo before you recommend it. A question with more than four possible answers goes into the reply as a numbered list with `default: <answer>` instead. Typical items: the check command when the project has none, which folders are generated, a conflict from step 4, a name collision from step 2, in team mode a `.gitignore` line to replace or a missing negation, and **whether the "never commit" policy stays** (recommended: it stays). An unanswered question keeps its recommended default, marked as assumed.

Then apply the answers: fill the values step 5 left open and run its proof. A user who lifts the never-commit policy gets it removed in every place `.claude/hooks/README.md` "Switching a rule off" lists, and step 7 then leaves out the git `deny` entries. The plain-hyphen rule is not a question: it is always on.

## 7. settings.json - the last copy

It registers the guard, so it comes after every other file and every filled value.

- **No `.claude/settings.json` in the project** (and the last bullet does not apply): write the template's copy with `Write`, with its placeholders filled.
- **The project has one** (and the last bullet does not apply): add the layer's hook registrations (every entry of the template's `hooks` block, under the same events) and every `deny` and `allow` entry it lacks. A registration that already runs the same command takes the template's `matcher`, `timeout` and `statusMessage`; never a second entry. Never drop an entry that was there, never move a personal one into a tracked file, and keep the JSON valid (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "PROJECT/.claude/settings.json"` - read-only; the same for `settings.local.json`).
- **A personal mode where the team tracks anything under `.claude/`** (the per-path excludes of step 5), with or without a `settings.json`: never create or edit `.claude/settings.json`. The registrations and permissions go into `.claude/settings.local.json`, merged the same way (Claude Code keeps that file out of git through its global excludes).

## 8. Prove it, report, hand over

```bash
find "PROJECT/.claude" -name "*.mjs" -exec node --check {} \;
node "PROJECT/.claude/hooks/tests/guard-test.mjs"
node "PROJECT/.claude/hooks/tests/guard-shell-test.mjs"
node "PROJECT/.claude/hooks/tests/upkeep-nudge-test.mjs"
node "PROJECT/.claude/skills/maintain-ai-layer/layer-refs.mjs"
grep -rn "<[A-Z][A-Z_]\{2,\}>" "LAYER_MD" "PROJECT/.claude"
git -C "PROJECT" status --short     # a personal mode: nothing new from the layer
```

No `node --check` error - a filled value that broke a literal shows here first; each case line reads `ok` and each suite ends with `N passed, 0 failed`; `layer-refs` lists what does not resolve - every hit is explained (a `[fill]` example path is fine) or fixed; the placeholder grep shows no layer file. A failing guard case is a bad `<GENERATED_PATHS>` regex nine times out of ten - fix the value, not the test. Add one `guard-test.mjs` case per entry of `<GENERATED_PATHS>` (two commented lines there show the shape): without them nothing proves the list is live, since an empty list passes too; then run that suite again. **In a personal mode `git status --short` must list nothing the install added** - that proves no tracked file changed and the layer is excluded. Then run `<CHECK_COMMAND>` once: a failure is the project's pre-existing state, reported, never fixed here - except a failure naming a path under `.claude/` or the layer's `CLAUDE.md`, which is the install's own: in team mode propose the tool's ignore entry (step 5), in a personal mode put the ignoring flag into `<CHECK_COMMAND>` or the check script behind it.

**In mode C, print these for the developer** - you never run them. The developer first creates a private repo on their own account, wherever they keep personal repos. Needs git 2.28+ (for `init -b`) and a configured `user.name` / `user.email`. When `.claude/.git` already exists (an update, or an own repo found in step 1), print only `add -A`, `commit -m "update: AI layer"` and `push`.

```bash
git -C "PROJECT/.claude" init -b main
git -C "PROJECT/.claude" add -A
git -C "PROJECT/.claude" commit -m "add: AI layer"
git -C "PROJECT/.claude" remote add origin <private repo url>
git -C "PROJECT/.claude" push -u origin main
```

**The report**, in the user's language, short: the case (first install or update) and the mode; what was read and what was assumed; every file copied, kept, merged or left alone, with what happened to it; the values filled; the config edits skipped in a personal mode, with their cost; the conflicts and collisions with your recommendation; the test results; in mode C, the commands above.

**End with these two lines, always:**

1. Restart Claude Code: agents, skills and hooks are read when a session starts, and a session that began before the `.claude/agents` folder existed does not see the new agents.
2. Then run `/maintain-ai-layer init` (best on Opus at high effort): it writes the project sections of the layer's `CLAUDE.md`, builds the path-scoped rules from the code, and tunes the layer's agents to this project. The session-start reminder will say `/maintain-ai-layer` is due until `init` has run - it means this `init` run.

## U. Updating a layer installed earlier

The project carries a layer from an older version of this bootstrap, possibly tuned since. The template is the new version of the generic parts; the project owns everything it filled or wrote. **The old layer's guard is live in this session**: it refuses a shell copy or move into the project and any shell delete under `.claude/hooks/` or of `.claude/settings*.json`. So every new or changed file is written with `Write` / `Edit` (read the template file, write its content), and a delete the guard refuses is left to the owner and named in the report.

**The mode is kept.** Read it from the `Layer tracking` line (`grep -l "Layer tracking" "PROJECT/CLAUDE.md" "PROJECT/.claude/CLAUDE.md" 2>/dev/null`); `LAYER_MD` is the file that carries it. An older layer without the line is detected as in step 1 (a root `CLAUDE.md` with the layer's sections and the `.gitignore` block is team mode) and gets the line (step 4); nothing moves between modes.

**Before the first write, make the old layer recoverable.** Own repo: `git -C "PROJECT/.claude" status --short` must print nothing - otherwise ask the owner to commit the layer repo and wait; that commit is the base for every diff. Team: the same for the layer's files in the project (`git -C "PROJECT" status --short -- CLAUDE.md .claude`). Personal, no history: `cp -R "PROJECT/.claude" "<scratchpad>/layer-backup"`, named in the report.

**A rule the owner switched off stays off.** A section, a `deny` entry or a guard check the template has and the project lacks is never restored unasked: list them and ask once whether each was removed on purpose. Where `LAYER_MD` has no "Never Commit or Push" section, the never-commit question is not asked again and step 7 leaves the git `deny` entries out; the removed guard and test hunks are ported as deliberate.

1. **Compare.** For every file of `BOOT/template/`, `diff -u --strip-trailing-cr "PROJECT/<path>" "BOOT/template/<path>"` (a missing project file is new, unless `init` deletes it by design and nothing in the layer references it - then it stays deleted; the template's `CLAUDE.md` compares with `LAYER_MD`). For every layer file in the project that the template no longer has, find out whether it was the layer's (it carries the bootstrap's shape and is named in an older version's file list: `skills/setup/`, `maintain-ai-layer/references/efficiency.md`, `maintain-ai-layer/references/weekly.md`) or the project's own.
2. **Generic files** - the hooks and their tests, the skills the project has not tuned: take the template's version, then re-apply the placeholder values the project's copy carries (step 5 - read them from the old copy). A hunk the project changed on purpose (an extra guard case, an added `PROTECTED_PATHS` entry) is kept and ported onto the new version. After each generic file, `diff --strip-trailing-cr "PROJECT/<path>" "BOOT/template/<path>"` must show only the filled placeholder lines and the hunks kept on purpose.
3. **Tuned files - never replaced wholesale:** the filled `LAYER_MD`, the tuned `hunt.md` (its attack angles), `maintain-ai-layer/layer-refs.mjs` (its `PREFIXES`), `maintain-ai-layer/references/settled.md`, the project's `.claude/rules/*.md`, and the project's own agents and skills. Port the template's changes to the layer text in them hunk by hunk, keeping the project's filled parts; a template section that replaces one the project filled keeps the project's facts.
4. **Removed units.** A layer file the template dropped is deleted (one path per `rm`) once nothing the project wrote depends on it, and every reference to it is gone (`grep -rn "<name>" "LAYER_MD" "PROJECT/.claude"`); under `.claude/hooks/` the guard refuses the delete, so the owner makes it. A hook removed from the template comes out of the settings file that registers it; a hook added to it goes in (step 7).
5. Then the git-exclusion part of step 5 for the kept mode, then steps 6, 7 and 8 - this version may ask for configuration an older one did not. **The report** adds, per file: taken from the template, ported hunk by hunk, kept as the project's, deleted, or left for the owner to delete - and why. `/maintain-ai-layer init` afterwards brings the project sections and the rules up to date with the new layer; it updates, it never rebuilds.
