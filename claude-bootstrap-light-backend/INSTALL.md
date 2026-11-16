# Installing this layer - instructions for the model

You are Claude Code, running in the user's project - a server codebase in any language. The user unpacked this bootstrap folder somewhere outside the project and asked you to integrate the working layer in `template/` into the project. This file is your procedure. It is not copied into the project, and neither is anything else outside `template/`.

Four rules hold throughout:

- **Look before writing.** Every value comes from the repo or from the user. A plausible guess in a hook or in `CLAUDE.md` is worse than a question: every later session believes it.
- **Nothing the project already has is destroyed.** An existing `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, agent, skill, command, rule or hook is merged or left alone, never overwritten, and the report names what happened to each. **In a personal mode (step 1) no file the project's git tracks is touched at all.**
- **Files only.** No commit, no staging, no push, no package install, no source-code edit - the layer's own rules apply to you from the first minute.
- **Nothing is run against a database or a service, and no secret is read.** The install reads the repo: the example env file, never the real one; the migration folder's listing, never a connection. It starts nothing and applies nothing; the one exception is the project's own check command in step 8, run only when what it needs is already up.

**Run every command block with the Bash tool (Git Bash on Windows), never PowerShell.** Write repo files with the `Edit` / `Write` tools; on a first install the template is copied with the shell (step 3), on an update file by file with `Write` (section U), since the layer's own guard is live there and refuses a shell copy into the project. Never `cd` in a command chain: absolute paths, `git -C <dir>`. Below, `BOOT` is the absolute path of this bootstrap folder, `PROJECT` the project root (`git rev-parse --show-toplevel`), `LAYER_MD` the layer's `CLAUDE.md` - `PROJECT/CLAUDE.md` in team mode, `PROJECT/.claude/CLAUDE.md` in a personal mode - and `<scratchpad>` your session's scratchpad directory (any temporary folder outside the project if you have none); keep them quoted in every command, since any may hold a space. This install runs in the main thread, with no subagents. The steps run in their numbered order.

## 1. Which case, and where the layer lives

```bash
node --version
git -C "PROJECT" rev-parse --show-toplevel && git -C "PROJECT" status --short | head -20
ls -a "PROJECT"; ls -a "PROJECT/.claude" 2>/dev/null || echo "no .claude yet"
git -C "PROJECT" ls-files CLAUDE.md .claude | head -20                 # what the project already tracks
git -C "PROJECT" check-ignore -v CLAUDE.md .claude/x || echo "not ignored"   # names the file that ignores it, if any
test -d "PROJECT/.claude/.git" && echo "own repo" || echo "no own repo"
```

**No `node` on the path, or one older than 18: stop and tell the user.** The hooks are Node scripts whatever language the service is written in, and a hook that cannot start guards nothing. Installing Node is theirs to do.

- **An update of this layer** - the project already has it from an earlier version of this bootstrap: `.claude/hooks/guard.mjs` opens with the "PreToolUse guard" header and `.claude/hooks/backend-guard.mjs` exists. Go to section U, then come back for the ignore part of step 5 and steps 6, 7 and 8.
- **Another variant of this bootstrap** - the same guard header and no `backend-guard.mjs`: the full frontend layer (`.claude/skills/lifecycle/`) or the light frontend one (`.claude/skills/handoff/`) is installed. Stop and ask the user whether to replace it with this one; never merge two.
- **A first install** - everything else, including a project with Claude config of its own that this bootstrap did not write. Steps 2-8.

**Then ask where the layer lives, before anything else is acted on** - one `AskUserQuestion`, recommended option first, each with its one-line reason:

| Mode | What it means |
| --- | --- |
| **C. Own repo** (recommended unless the repo shows otherwise) | the whole layer in `.claude/`, its `CLAUDE.md` as `.claude/CLAUDE.md`; `.claude/` goes into `.git/info/exclude` and becomes the developer's own git repo. Why: history and a backup for the layer, and `git clean` / `git stash -a` in the project cannot delete it. The developer creates a private repo (their own account, wherever they keep personal repos) and pushes the layer there; step 8 prints the commands. |
| **B. Personal, no history** | as C without the nested repo |
| **A. Team** | committed with the project: the root `CLAUDE.md` merged, the `.gitignore` block, config edits with the user's yes |

What the commands showed sets the recommendation, never the choice:

- **`.claude/` is already ignored** (`check-ignore -v` names the project `.gitignore`, `.git/info/exclude` or the global excludes file): recommend C (or B); no ignore line is added - the report says where it is ignored.
- **The project already tracks files under `.claude/`** (a team config): A is the natural fit. A personal answer becomes B - a nested repo inside a tracked folder is not possible, so say so - with the layer's own paths excluded one by one (an exclude cannot hide tracked files), its hooks and permissions in `.claude/settings.local.json`, and no tracked file changed.
- **`.claude/.git` exists**: an own-repo layer - mode C, nothing to init.
- **Not coercive.** The developer may describe any other arrangement in their own words: follow it, naming once a consequence it brings. Hooks and `settings.json` load only from the launch folder's `.claude/`, so a layer in a parent folder loses its hooks when Claude Code starts in the repo. Later mode switches are not offered; one asked for in words is helped as it comes.

A project that is not a git repository: say so once, skip the git commands and the question - the layer works, but the docs check at lifecycle step 5 loses its file list and the frozen-migration check has no git index to read, so it protects nothing.

## 2. Inventory what is already here

Find the instruction files **by shape, not by a fixed list of names** - the project's own file may have been renamed to anything (`claude_old.md`, `CLAUDE.md.bak`, `docs/claude.md`):

```bash
git -C "PROJECT" ls-files | grep -i "claude\|agents\.md\|cursorrules\|copilot-instructions"
ls -a "PROJECT" | grep -i "claude\|agents\.md\|cursorrules"      # untracked ones too
find "PROJECT/.claude" -maxdepth 3 -type f 2>/dev/null
```

Classify each hit and write the list down before copying anything:

- **The project's own root `CLAUDE.md`** (or the renamed copy of it): merged in step 4 in team mode; in a personal mode read for facts, never edited.
- **`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, an instructions section in a README**: another tool's rules for the same repo. Read them for project facts worth carrying into `LAYER_MD`; never rewrite or delete them.
- **An existing `.claude/settings.json`**: merged in step 7 - or, when it is tracked and the mode is personal, left alone while the layer's entries go into `.claude/settings.local.json`. Read it now: an `allow` entry of theirs for a command the layer forbids (a deploy, a migration reset, a `git push`) is a conflict for step 6. `settings.local.json` is personal - touched only in that one case.
- **Existing agents, skills, commands, rules or hooks**: left alone. A name collision with a template file (their `hunt`, `drift`, `debug`, `handoff`, `retro`, `maintain-ai-layer`) is reported, not resolved: the layer's file is the newcomer, so it is not copied over theirs, and the user decides whether to rename one.
- **Another complete Claude layer** (rules, its own lifecycle, its own review agents - another variant of this bootstrap included): stop and ask the user before going on - two lifecycles in one repo is their decision, not a merge.

## 3. Copy the template, never overwriting

List what would collide first, then copy only what is missing:

```bash
(cd "BOOT/template" && find . -type f | sort) > "<scratchpad>/template-files.txt"
while read -r f; do [ -e "PROJECT/$f" ] && echo "EXISTS $f"; done < "<scratchpad>/template-files.txt"
```

Copy every file that does not exist yet (`mkdir -p` its folder, then `cp`), one path per `cp`, from `BOOT/template/<path>` to `PROJECT/<path>` - **every file but `.claude/settings.json`, which comes last** (step 7): it registers the guards, and a running session may pick the registration up at once, after which they refuse the remaining shell copies. **In a personal mode the template's `CLAUDE.md` goes to `.claude/CLAUDE.md`** (merged there in step 4 if one exists; the collision check above then looks at that path). **Tell the user before the first copy that a first install asks one permission per command.** `--add-dir` saves only the prompts for reading the bootstrap. Each copy still asks once - about 22 for this layer. A file that exists is not copied: `LAYER_MD` is merged in step 4, `.claude/settings.json` in step 7, and any other existing file goes into the report as kept, with a one-line note of how it differs from the template (`diff -q`). Confirm the layer is complete afterwards: `LAYER_MD`, `.claude/agents/{hunt,drift}.md`, `.claude/hooks/{guard,backend-guard,upkeep-nudge}.mjs`, `.claude/hooks/tests/` (four files), `.claude/hooks/README.md`, `.claude/skills/{debug,handoff,retro,maintain-ai-layer}/SKILL.md`, `.claude/skills/maintain-ai-layer/layer-refs.mjs` and its `references/` - and the settings file once step 7 has run, plus `.claude/scripts/check.sh` when step 5 wrote one, and `.claude/.gitignore` in mode C.

## 4. The layer's CLAUDE.md

- **Team mode, no root `CLAUDE.md`**: the template's copy is now in place.
- **Team mode, the project has one**: merge, do not concatenate. Read the template's copy from `BOOT/template/CLAUDE.md`. The layer's sections - Working Principles, Surgical Changes, Version Control, Shell and file edits, Data, secrets and the outside world, Development Workflow, Comments, Punctuation - come in verbatim, with the bootstrap note at the top; the project's own facts (commands, architecture, conventions, prohibitions) go into the matching `[fill]` sections of the merged file, in the owner's words. A statement in the old file that contradicts the layer (a different lifecycle, a different review policy, "commit when done", "run the migrations on staging", "deploy when green") is **not merged silently**: it goes into the report as a conflict with your recommendation, for the user to settle.
- **A personal mode**: `.claude/CLAUDE.md` is the template's copy, or a merge into the one already there. The team's root `CLAUDE.md` stays as it is; each statement in it that contradicts the layer goes into the report as a conflict. When a team root `CLAUDE.md` exists, add this line right after the Layer tracking line: `` - The team's root `CLAUDE.md` holds the project facts; where it disagrees with this file on process (commits, review, the lifecycle), this file wins. ``
- **Every mode**: replace the `Layer tracking: [fill]` line in Version Control with exactly one of these, `<where>` naming the file that ignores the layer (`.git/info/exclude`, the project's `.gitignore`, the global excludes file):
  - `` - **Layer tracking: team.** The layer is committed with the project; a change to it is reviewed like code. ``
  - `` - **Layer tracking: personal.** The layer lives in `.claude/` (`CLAUDE.md` is `.claude/CLAUDE.md`), kept out of the project's git by <where>: never stage it or suggest committing it there; `git clean -x` / `-X` and `git stash -a` would delete it. ``
  - `` - **Layer tracking: own repo.** `.claude/` (`CLAUDE.md` is `.claude/CLAUDE.md`) is the owner's own git repo, kept out of the project's git by <where>: never stage it in the project, and before a branch operation in the project ask the owner to commit the layer repo. ``

The `[fill]` sections nothing answers stay `[fill]` - `/maintain-ai-layer init` writes them. Mind the 20 KB budget (`wc -c "LAYER_MD"`): the layer's own text takes most of it, so project detail past it is moved into path-scoped rules by `init`, not trimmed by you.

## 5. The placeholders and the ignore lines

Fill these in every layer file that carries them (`grep -rln "<[A-Z][A-Z_]\{2,\}>" "LAYER_MD" "PROJECT/.claude"`), with `Edit`. Read each value from the repo; what it cannot answer goes into step 6, and its answer is filled in before step 7. Mark each in the report as **read from `<file>`** or **assumed**.

| Placeholder | What it is | Where to read it |
| --- | --- | --- |
| `<PROJECT>` | the project name | the build manifest's name (`pyproject.toml`, `go.mod`, `pom.xml` or the Gradle settings, `Cargo.toml`, a `.csproj`, `composer.json`, `package.json`, a gemspec), or the repo folder |
| `<STACK>` | the stack in one line - the language and its version, the web framework, the data layer (database, ORM or query builder, migration tool), the queue if there is one; it opens `hunt`'s first sentence | the manifest's direct dependencies with their major versions (never a lockfile) |
| `<SRC_DIR>` | **one** source folder, relative, forward slashes, no `./`, no trailing slash - it only feeds `guard.mjs`, its suites and `layer-refs.mjs`, which each take a single folder | where most of the code lives, from `git ls-files`, not from convention (`app`, `src`, `internal`, `src/main/java`). A server's code often has several roots (`cmd` beside `internal`, one folder per service or module): name them all in the report - `init` writes the full list into the layer's `CLAUDE.md` Folder conventions, where the skills read it |
| `<CHECK_COMMAND>` | the **one** verification call: every check the project has, in sequence | the task runner (`make check`, a `just` or `task` recipe), the manifest's scripts, the build tool's own aggregate (a Gradle `check`, a Maven `verify`), and the CI workflow, which shows what the project really runs. With several and no single entry point, team mode proposes the task-runner target or script that chains them (step 6). **A personal mode adds no Gradle task, npm script, Makefile target or anything else to a tracked file**: the value is a raw command line the project's tools already take, with the flags that keep `.claude/` out of a tool that would scan it; when it needs several commands or quoted flags, they go into a layer-owned `.claude/scripts/check.sh` and the value is `bash .claude/scripts/check.sh`. Never invent a command that does not exist |
| `<GENERATED_PATHS>` | a **JSON array** of regex sources for the files `guard.mjs` refuses to hand-edit, forward slashes, matching the path's tail | what a tool writes: generated clients and server stubs, protocol output, a compiled schema, the lockfile (the package manager is its generator); `[]` is a fine answer. Never the migration folder - a new migration must be writable, and the frozen list covers the old ones |
| `<FROZEN_PATHS>` | fills `FROZEN_RAW` in `backend-guard.mjs`: a **JSON array** of regex sources for the files the hook freezes once they are on the upstream default branch (with no remote, once git tracks them), forward slashes, matching the path's tail - never `^`, the test runs on the absolute path. The check reads the project's git, whatever the mode | the migration files: the migration tool's config, the folder its command writes to (`git ls-files` shows the numbered or dated files). **The regex matches the numbered files only, never a file a new migration has to edit** - a Liquibase master changelog or include list, a single append-only changelog, a Flyway repeatable `R__` script, a schema snapshot the tool rewrites: `"db/migrations/V[^/]+\\.sql$"`, not the bare folder. `[]` when the project has no migrations |
| `<SECRET_PATHS>` | fills `SECRET_RAW` in `backend-guard.mjs` (the built-in list beside it is the constant `SECRET_PATHS`): a **JSON array** of regex sources for the project's secret files beyond the built-in ones (env files, keys, credentials - `.claude/hooks/README.md` names them), matching the path's tail - never `^`, a Read hands the absolute path | the repo's ignore file: an ignored config with a tracked example beside it (`config/local.settings.json`, `application-local.yml`) is one; `[]` is a fine answer. Read the ignore file and the names, never the files |
| `<FORBIDDEN_COMMANDS>` | fills `FORBIDDEN_RAW` in `backend-guard.mjs`: a **JSON array** of regex sources for the project's own commands that deploy or publish, tested against one command with its words joined by single spaces; a match is always refused | the task runner's targets and the manifest's scripts that wrap a deploy or a release (`"\\bmake\\s+deploy\\b"`), and a deploy tool the built-in list does not know. Not the database wipes: the hook asks the user about those, and a target that wraps one (`make db-reset`) belongs here only if the owner wants it refused outright; `[]` is a fine answer |

**The values land inside code and JSON literals**, so each has a shape it must keep:

- The four lists each sit in a `` String.raw`...` `` template (`guard.mjs`, `backend-guard.mjs`) and are the JSON array itself, written as it would be in a `.json` file (`["app/clients/[^/]+/generated/", "\\.lock$"]` - a regex backslash doubled once for JSON); no backtick and no `${`. A bare string or a broken array makes the hook throw, and a hook that throws allows every call; a placeholder left unfilled reads as an empty list.
- `<CHECK_COMMAND>` sits in JSON strings in `settings.json`: one plain command - no `;`, `&&`, `|`, redirect, quote, backslash or backtick; chain or quote inside a task-runner target or a script, and its name is the value.
- `<SRC_DIR>` sits in single-quoted strings and regexes (`guard.mjs`, `layer-refs.mjs`): letters, digits, `_`, `-`, `@` and `/` only, plus a `.` inside a name, never leading - and never `.` itself: with the code spread over several folders, the one holding most of it, and the others named in the report.

The settings file is not written yet; its `<CHECK_COMMAND>` is filled when step 7 writes it. When the grep above shows no hit in a layer file, the placeholders are done; a `<UPPER_CASE>` token in a file the project wrote itself is not this grep's business. The `[fill]` markers are not placeholders - they stay for `init`.

**The ignore lines, by mode.**

- **A personal mode, `.claude/` already ignored**: no line; the report says where it is ignored.
- **A personal mode, otherwise**: add one `.claude/` line to `PROJECT/.git/info/exclude` with `Edit` / `Write` (`.git` is a protected path, so the user sees one prompt). Where the project tracks files under `.claude/`, add instead one line per layer folder and personal path - `.claude/CLAUDE.md`, `.claude/agents/hunt.md`, `.claude/agents/drift.md`, `.claude/hooks/`, `.claude/skills/`, `.claude/rules/`, `.claude/scripts/`, `.claude/settings.local.json`, `.claude/handoff.md`, `.claude/.last-maintain`. Folders, not today's files, so what step 7, `init` and later sessions write there stays excluded too; an exclude never hides a tracked file, so the team's own files in those folders stay visible.
- **Mode C**: also write `.claude/.gitignore` for the nested repo, one line each: `settings.local.json`, `handoff.md`, `.last-maintain`.
- **Team mode**: the layer is trackable and the personal paths are not. List what the project already tracks under `.claude/` first - its negations must survive the `.claude/*` line:

```bash
git -C "PROJECT" ls-files .claude | awk -F/ '{print (NF > 2 ? $2 "/" : $2)}' | sort -u
```

In team mode, append this block unless the file already has a `.claude/*` line (then compare its negations with this list and add what is missing, with the user's yes in step 6). Add one `!.claude/<dir>/` line for every folder the command printed that the block lacks, and one `!.claude/<file>` line for every file - never for a personal path (`settings.local.json`, `handoff.md`, `.last-maintain`), which is a finding for the report if git tracks it:

```gitignore
# Ignore .claude contents, not the dir itself - git will not descend into an ignored directory, so the
# negations only work against `.claude/*`. Deny by default: add a line when you add a directory.
.claude/*
!.claude/agents/
!.claude/skills/
!.claude/hooks/
!.claude/rules/
!.claude/settings.json
CLAUDE.local.md
```

A team-mode answer over a bare `.claude/` (or `/.claude`) line means that line must go - git does not descend into an ignored directory, so no negation after it rescues the layer; name the file it is in, and replace it with the block. Then prove the team block - `check-ignore` reads the patterns, so a file step 7 has not written yet is judged too:

```bash
git -C "PROJECT" check-ignore CLAUDE.md .claude/settings.json .claude/agents/hunt.md .claude/hooks/guard.mjs .claude/hooks/backend-guard.mjs .claude/skills/maintain-ai-layer/SKILL.md   # must print nothing
git -C "PROJECT" check-ignore -q .claude/handoff.md && git -C "PROJECT" check-ignore -q .claude/.last-maintain && git -C "PROJECT" check-ignore -q .claude/settings.local.json || echo "NOT IGNORED"   # must print nothing
```

**A real env file that git tracks** (`git -C "PROJECT" ls-files | grep -i "\.env"` shows more than the example files) is a finding for the report, by name only: the secrets in it are already in the history, and what to do about that is the owner's call. Do not open it and do not change the ignore file for it.

## 6. Ask, once

What the repo could not answer goes to the user in one round: `AskUserQuestion` calls of at most four questions each, every question with the option you recommend first, labelled "(Recommended)", and checked against the repo before you recommend it. A question with more than four possible answers goes into the reply as a numbered list with `default: <answer>` instead. Typical items:

- the check command when the project has none, or when it needs a database the session cannot assume; which files are migrations and which are generated; the project's own deploy commands;
- an env file with no secret in it that the project tracks on purpose (`.env.test`) - the built-in list refuses it until its pattern in `SECRET_PATHS` (`backend-guard.mjs`) is narrowed, which is the owner's edit;
- whether local development drives a local cluster or a cloud emulator through `kubectl`, `aws` or `gcloud` - those pass only when the command itself names the local target (`--context kind-...`, `--endpoint-url http://localhost...`);
- whether the "never commit" policy and the local-only rules stay - each is one section of the layer's `CLAUDE.md` plus its guard checks, and `.claude/hooks/README.md` "Switching a rule off" says how to turn one off. The hyphen rule is not a question: it is always on;
- a conflict from step 2 or 4, a name collision from step 2, in team mode a negation to add to an existing `.claude/*` block.

An unanswered question keeps its recommended default, marked as assumed. Fill the answers into step 5's placeholders and ignore lines before going on. A user who lifts the never-commit policy gets it removed in every place `.claude/hooks/README.md` "Switching a rule off" lists, and step 7 then leaves out the git `deny` entries; a lifted local-only rule is removed the same way. A personal mode skips every edit the layer would want in a tracked file (a lint or build exclude for `.claude/`), and the report names each with what skipping it costs.

## 7. settings.json - the last copy

Every placeholder is filled by now, so nothing is registered while a value is still unfilled.

- **No `.claude/settings.json` in the project**: write the template's copy with `Write`, with its placeholders filled.
- **The project has one, team mode or untracked**: add the layer's hook registrations (every entry of the template's `hooks` block, under the same events - both `PreToolUse` entries, each with its own matcher) and every `deny` and `allow` entry it lacks. Never drop an entry that was there, never move a personal one into the tracked file, and keep the JSON valid (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "PROJECT/.claude/settings.json"` - read-only). An `allow` entry of theirs for a command the layer forbids stays as it is unless the user's step 6 answer removes it.
- **A personal mode and a tracked `.claude/settings.json`**: leave it as it is, and merge the same hook registrations and `deny` / `allow` entries into `.claude/settings.local.json` instead, by the same rules.

## 8. Prove it, report, hand over

```bash
find "PROJECT/.claude" -name "*.mjs" -not -path "*/.git/*" -exec node --check {} \;
node "PROJECT/.claude/hooks/tests/guard-test.mjs"
node "PROJECT/.claude/hooks/tests/guard-shell-test.mjs"
node "PROJECT/.claude/hooks/tests/backend-guard-test.mjs"
node "PROJECT/.claude/hooks/tests/upkeep-nudge-test.mjs"
node "PROJECT/.claude/skills/maintain-ai-layer/layer-refs.mjs"
grep -rn "<[A-Z][A-Z_]\{2,\}>" "LAYER_MD" "PROJECT/.claude"
git -C "PROJECT" status --short          # a personal mode: nothing new from the layer
```

`node --check` prints nothing for a file that parses - a filled value that broke a literal shows here first, as a `SyntaxError` naming the file; each case line reads `ok` and each suite ends with `N passed, 0 failed`; `layer-refs` reads the layer's Markdown from disk, whatever git ignores, and lists what does not resolve - every hit is explained (a `[fill]` example path is fine) or fixed; the placeholder grep shows no layer file. In a personal mode `git status` shows no layer path and no changed tracked file - the proof that the layer is excluded and nothing tracked was touched. A failing case is a bad list regex nine times out of ten - fix the value, not the test. **Add one case per entry of `<GENERATED_PATHS>`, `<SECRET_PATHS>` and `<FORBIDDEN_COMMANDS>`** - `guard-test.mjs` carries two commented lines showing the shape, `backend-guard-test.mjs` two more at the end of its first part: without them nothing proves a list is live, since an empty list passes too. Then run each suite you added a case to again. **The frozen list is proved by hand instead**, since the suite's frozen cases run in a temp repo with sample lists: write `{"tool_name":"Edit","tool_input":{"file_path":"<absolute path of a migration on the default branch - with no remote, one git tracks>"},"cwd":"PROJECT"}` to `<scratchpad>/payload.json` with `Write`, then run `node "PROJECT/.claude/hooks/backend-guard.mjs" < "<scratchpad>/payload.json"; echo "exit $?"` - it must print `exit 2`. The same payload with the file a new migration must still edit (a master changelog) must print `exit 0`. Then run `<CHECK_COMMAND>` once, **only when what it needs is already up** - a check that wants a database or containers the session did not find running is reported as not run, with what it needs; a failure is the project's pre-existing state, reported, never fixed here.

**Mode C: print these commands for the developer, and never run them** - after they create a private repo on their own account. Needs git 2.28+ (for `init -b`) and a configured `user.name` / `user.email`.

```bash
git -C "PROJECT/.claude" init -b main
git -C "PROJECT/.claude" add -A
git -C "PROJECT/.claude" commit -m "add: AI layer"
git -C "PROJECT/.claude" remote add origin <private repo url>
git -C "PROJECT/.claude" push -u origin main
```

**The report**, in the user's language, short: the case (first install or update) and the mode, with where the layer is ignored; what was read and what was assumed; every file copied, kept, merged or left alone, with what happened to it; the values filled, the four lists entry by entry; the tracked-file edits a personal mode skipped; the conflicts and collisions with your recommendation; the test results; whether the check command ran; in mode C the printed commands.

**End with these two lines, always:**

1. Restart Claude Code: agents, skills and hooks are read when a session starts, and a session that began before the `.claude/agents` folder existed does not see the new agents.
2. Then run `/maintain-ai-layer init` (best on Opus at high effort): it writes the project sections of the layer's `CLAUDE.md`, builds the path-scoped rules from the code, and tunes the layer's agents to this project.

## U. Updating a layer installed earlier

The project carries a layer from an older version of this bootstrap, possibly tuned since. The template is the new version of the generic parts; the project owns everything it filled or wrote. **Keep its mode**: the layer's `CLAUDE.md` is whichever file carries the `Layer tracking` line (`grep -l "Layer tracking" "PROJECT/CLAUDE.md" "PROJECT/.claude/CLAUDE.md"`), and that line names the mode. An older layer without the line: detect the mode as step 1 does, confirm it with the user, and write the line (step 4). **The old layer's guards are live in this session**: they refuse a shell copy or move into the project, any shell delete under `.claude/hooks/` or of `.claude/settings*.json`, and an edit of a migration on the default branch. So every new or changed file is written with `Write` / `Edit` (read the template file, write its content), and a delete a guard refuses is left to the owner and named in the report.

1. **Compare.** For every file of `BOOT/template/`, `diff -u "PROJECT/<path>" "BOOT/template/<path>"` (a missing project file is new; the template's `CLAUDE.md` compares against `LAYER_MD`). For every layer file in the project that the template no longer has, find out whether it was the layer's (it carries the bootstrap's shape) or the project's own.
2. **Generic files** - the hooks and their tests, `layer-refs.mjs`, the skills the project has not tuned: take the template's version, then re-apply the placeholder values the project's copy carries (step 5 - read them from the old copy, the four lists included). A hunk the project changed on purpose (an extra guard case, an added list entry, a `rule(...)` line it deleted to allow its own deploy) is kept and ported onto the new version.
3. **Tuned files - never replaced wholesale:** the filled `LAYER_MD` (its `Layer tracking` line kept as it is), the tuned `hunt.md` (its attack angles), `maintain-ai-layer/references/settled.md`, the project's `.claude/rules/*.md`, and the project's own agents and skills. Port the template's changes to the layer text in them hunk by hunk, keeping the project's filled parts; a template section that replaces one the project filled keeps the project's facts.
4. **Removed units.** A layer file the template dropped is deleted (one path per `rm`) once nothing the project wrote depends on it, and every reference to it is gone (`grep -rn "<name>" "LAYER_MD" "PROJECT/.claude"`); under `.claude/hooks/` the guard refuses the delete, so the owner makes it. `maintain-ai-layer/references/weekly.md` is one: the `weekly` mode is gone and `deep` is the monthly default. A hook removed from the template comes out of the settings file too; a hook added to it goes in (step 7).
5. Then the ignore part of step 5, and steps 6, 7 and 8 - this version may ask for configuration an older one did not. **The report** adds, per file: taken from the template, ported hunk by hunk, kept as the project's, deleted, or left for the owner to delete - and why. `/maintain-ai-layer init` afterwards brings the project sections and the rules up to date with the new layer; it updates, it never rebuilds.
