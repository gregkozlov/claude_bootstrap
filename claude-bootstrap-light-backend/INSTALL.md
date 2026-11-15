# Installing this layer - instructions for the model

You are Claude Code, running in the user's project - a server codebase in any language. The user unpacked this bootstrap folder somewhere outside the project and asked you to integrate the working layer in `template/` into the project. This file is your procedure. It is not copied into the project, and neither is anything else outside `template/`.

Four rules hold throughout:

- **Look before writing.** Every value comes from the repo or from the user. A plausible guess in a hook or in `CLAUDE.md` is worse than a question: every later session believes it.
- **Nothing the project already has is destroyed.** An existing `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, agent, skill, command, rule or hook is merged or left alone, never overwritten, and the report names what happened to each.
- **Files only.** No commit, no staging, no push, no package install, no source-code edit - the layer's own rules apply to you from the first minute.
- **Nothing is run against a database or a service, and no secret is read.** The install reads the repo: the example env file, never the real one; the migration folder's listing, never a connection. It starts nothing and applies nothing; the one exception is the project's own check command in step 8, run only when what it needs is already up.

Write repo files with the `Edit` / `Write` tools; on a first install the template is copied with the shell (step 3), on an update file by file with `Write` (section U), since the layer's own guard is live there and refuses a shell copy into the project. Never `cd` in a command chain: absolute paths, `git -C <dir>`. Below, `BOOT` is the absolute path of this bootstrap folder, `PROJECT` the project root (`git rev-parse --show-toplevel`), and `<scratchpad>` your session's scratchpad directory (any temporary folder outside the project if you have none). This install runs in the main thread, with no subagents.

## 1. Which case

```bash
node --version
git -C PROJECT rev-parse --show-toplevel && git -C PROJECT status --short | head -20
ls -a PROJECT; ls -a PROJECT/.claude
```

**No `node` on the path, or one older than 18: stop and tell the user.** The hooks are Node scripts whatever language the service is written in, and a hook that cannot start guards nothing. Installing Node is theirs to do.

- **An update of this layer** - the project already has it from an earlier version of this bootstrap: `.claude/hooks/guard.mjs` opens with the "PreToolUse guard" header and `.claude/hooks/backend-guard.mjs` exists. Go to section U, then come back for steps 5, the `.gitignore` part of 6, 7 and 8.
- **Another variant of this bootstrap** - the same guard header and no `backend-guard.mjs`: the full frontend layer (`.claude/skills/lifecycle/`) or the light frontend one (`.claude/skills/handoff/`) is installed. Stop and ask the user whether to replace it with this one; never merge two.
- **A first install** - everything else, including a project with Claude config of its own that this bootstrap did not write. Steps 2-8.

A project that is not a git repository: say so once and skip the git commands - the layer works, but the docs check at lifecycle step 5 loses its file list and the frozen-migration check has no git index to read, so it protects nothing.

## 2. Inventory what is already here

Find the instruction files **by shape, not by a fixed list of names** - the project's own file may have been renamed to anything (`claude_old.md`, `CLAUDE.md.bak`, `docs/claude.md`):

```bash
git -C PROJECT ls-files | grep -i "claude\|agents\.md\|cursorrules\|copilot-instructions"
ls -a PROJECT | grep -i "claude\|agents\.md\|cursorrules"      # untracked ones too
find PROJECT/.claude -maxdepth 3 -type f 2>/dev/null
```

Classify each hit and write the list down before copying anything:

- **The project's own `CLAUDE.md`** (or the renamed copy of it): merged in step 4.
- **`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, an instructions section in a README**: another tool's rules for the same repo. Read them for project facts worth carrying into `CLAUDE.md`; never rewrite or delete them.
- **An existing `.claude/settings.json`**: merged in step 5. `settings.local.json` is personal - never touched.
- **Existing agents, skills, commands, rules or hooks**: left alone. A name collision with a template file (their `hunt`, `drift`, `debug`, `handoff`, `retro`, `maintain-ai-layer`) is reported, not resolved: the layer's file is the newcomer, so it is not copied over theirs, and the user decides whether to rename one.
- **Another complete Claude layer** (rules, its own lifecycle, its own review agents - another variant of this bootstrap included): stop and ask the user before going on - two lifecycles in one repo is their decision, not a merge.

## 3. Copy the template, never overwriting

List what would collide first, then copy only what is missing:

```bash
(cd BOOT/template && find . -type f | sort) > <scratchpad>/template-files.txt
while read -r f; do [ -e "PROJECT/$f" ] && echo "EXISTS $f"; done < <scratchpad>/template-files.txt
```

Copy every file that does not exist yet (`mkdir -p` its folder, then `cp`), one path per `cp`, from `BOOT/template/<path>` to `PROJECT/<path>` - **every file but `.claude/settings.json`, which comes last** (step 5): it registers the guards, and a running session may pick the registration up at once, after which they refuse the remaining shell copies. A file that exists is not copied: `CLAUDE.md` is merged in step 4, `.claude/settings.json` in step 5, and any other existing file goes into the report as kept, with a one-line note of how it differs from the template (`diff -q`). Confirm the layer is complete afterwards: `CLAUDE.md`, `.claude/settings.json`, `.claude/agents/{hunt,drift}.md`, `.claude/hooks/{guard,backend-guard,upkeep-nudge}.mjs`, `.claude/hooks/tests/` (four files), `.claude/hooks/README.md`, `.claude/skills/{debug,handoff,retro,maintain-ai-layer}/SKILL.md`, `.claude/skills/maintain-ai-layer/layer-refs.mjs` and its `references/`.

## 4. CLAUDE.md

- **No `CLAUDE.md` in the project**: the template's copy is now in place. Done.
- **The project has one**: merge, do not concatenate. Read the template's copy from `BOOT/template/CLAUDE.md`. The layer's sections - Working Principles, Surgical Changes, Version Control, Shell and file edits, Data, secrets and the outside world, Development Workflow, Comments, Punctuation - come in verbatim, with the bootstrap note at the top; the project's own facts (commands, architecture, conventions, prohibitions) go into the matching `[fill]` sections of the merged file, in the owner's words. A statement in the old file that contradicts the layer (a different lifecycle, a different review policy, "commit when done", "run the migrations on staging", "deploy when green") is **not merged silently**: it goes into the report as a conflict with your recommendation, for the user to settle. The `[fill]` sections the old file does not answer stay `[fill]` - `/maintain-ai-layer init` writes them. Mind the 20 KB budget (`wc -c CLAUDE.md`): the layer's own text takes most of it, so project detail past it is moved into path-scoped rules by `init`, not trimmed by you.

## 5. settings.json - last, after step 6

Fill the placeholders (step 6) first, so nothing is registered while a value is still unfilled.

- **No `.claude/settings.json` in the project**: write the template's copy with `Write`, with its placeholders filled.
- **The project has one**: add the layer's hook registrations (every entry of the template's `hooks` block, under the same events - both `PreToolUse` entries, each with its own matcher) and every `deny` and `allow` entry it lacks. Never drop an entry that was there, never move a personal one into the tracked file, and keep the JSON valid (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" PROJECT/.claude/settings.json` - read-only). An `allow` entry of theirs for a command the layer forbids (a deploy, a migration reset, a `git push`) is a conflict for step 7, not something to delete.

## 6. The placeholders and `.gitignore`

Fill these in every file under `CLAUDE.md` and `.claude/` that carries them (`grep -rln "<[A-Z][A-Z_]\{2,\}>" PROJECT/CLAUDE.md PROJECT/.claude`), with `Edit`. Read each value from the repo; ask only what it cannot answer (step 7). Mark each in the report as **read from `<file>`** or **assumed**.

| Placeholder | What it is | Where to read it |
| --- | --- | --- |
| `<PROJECT>` | the project name | the build manifest's name (`pyproject.toml`, `go.mod`, `pom.xml` or the Gradle settings, `Cargo.toml`, a `.csproj`, `composer.json`, `package.json`, a gemspec), or the repo folder |
| `<STACK>` | the stack in one line - the language and its version, the web framework, the data layer (database, ORM or query builder, migration tool), the queue if there is one; it opens `hunt`'s first sentence | the manifest's direct dependencies with their major versions (never a lockfile) |
| `<SRC_DIR>` | **one** source folder, relative, forward slashes, no `./`, no trailing slash - it only feeds `guard.mjs`, its suites and `layer-refs.mjs`, which each take a single folder | where most of the code lives, from `git ls-files`, not from convention (`app`, `src`, `internal`, `src/main/java`). A server's code often has several roots (`cmd` beside `internal`, one folder per service or module): name them all in the report - `init` writes the full list into `CLAUDE.md` Folder conventions, where the skills read it |
| `<CHECK_COMMAND>` | the **one** verification call: every check the project has, in sequence | the task runner (`make check`, a `just` or `task` recipe), the manifest's scripts, the build tool's own aggregate (a Gradle `check`, a Maven `verify`), and the CI workflow, which shows what the project really runs. With several and no single entry point, propose the task-runner target or script that chains them (step 7); never invent a command that does not exist |
| `<GENERATED_PATHS>` | a **JSON array** of regex sources for the files `guard.mjs` refuses to hand-edit, forward slashes, matching the path's tail | what a tool writes: generated clients and server stubs, protocol output, a compiled schema, the lockfile (the package manager is its generator); `[]` is a fine answer. Never the migration folder - a new migration must be writable, and the frozen list covers the old ones |
| `<FROZEN_PATHS>` | a **JSON array** of regex sources for the files `backend-guard.mjs` freezes once git tracks them, forward slashes, matching the path's tail - never `^`, the test runs on the absolute path | the migration files: the migration tool's config, the folder its command writes to (`git ls-files` shows the numbered or dated files). **The regex matches the numbered files only, never a file a new migration has to edit** - a Liquibase master changelog or include list, a single append-only changelog, a Flyway repeatable `R__` script, a schema snapshot the tool rewrites: `"db/migrations/V[^/]+\\.sql$"`, not the bare folder. `[]` when the project has no migrations |
| `<SECRET_PATHS>` | a **JSON array** of regex sources for the project's secret files beyond the built-in list (env files, keys, credentials - `.claude/hooks/README.md` names it), matching the path's tail - never `^`, a Read hands the absolute path | the repo's ignore file: an ignored config with a tracked example beside it (`config/local.settings.json`, `application-local.yml`) is one; `[]` is a fine answer. Read the ignore file and the names, never the files |
| `<FORBIDDEN_COMMANDS>` | a **JSON array** of regex sources for the project's own commands that deploy or publish, tested against one command with its words joined by single spaces; a match is always refused | the task runner's targets and the manifest's scripts that wrap a deploy or a release (`"\\bmake\\s+deploy\\b"`), and a deploy tool the built-in list does not know. Not the database wipes: the hook asks the user about those, and a target that wraps one (`make db-reset`) belongs here only if the owner wants it refused outright; `[]` is a fine answer |

**The values land inside code and JSON literals**, so each has a shape it must keep:

- The four lists each sit in a `` String.raw`...` `` template (`guard.mjs`, `backend-guard.mjs`) and are the JSON array itself, written as it would be in a `.json` file (`["app/clients/[^/]+/generated/", "\\.lock$"]` - a regex backslash doubled once for JSON); no backtick and no `${`. A bare string or a broken array makes the hook throw, and a hook that throws allows every call; a placeholder left unfilled reads as an empty list.
- `<CHECK_COMMAND>` sits in JSON strings in `settings.json`: one plain command - no `;`, `&&`, `|`, redirect, quote, backslash or backtick; chain or quote inside a task-runner target or a script, and its name is the value.
- `<SRC_DIR>` sits in single-quoted strings and regexes (`guard.mjs`, `layer-refs.mjs`): letters, digits, `_`, `-`, `@` and `/` only, plus a `.` inside a name, never leading - and never `.` itself: with the code spread over several folders, the one holding most of it, and the others named in the report.

When the grep above shows no hit in a layer file, the placeholders are done; a `<UPPER_CASE>` token in a file the project wrote itself is not this grep's business. The `[fill]` markers are not placeholders - they stay for `init`.

**`.gitignore`.** The layer is tracked and the personal paths are not. Append this block unless the file already has a `.claude/*` line (then compare its negations with this list and add what is missing, with the user's yes):

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

**A bare `.claude/` (or `/.claude`) line hides the whole layer**: git does not descend into an ignored directory, so no negation after it can rescue the files. Do not append around it - tell the user, and with their yes replace that line with the block. Then prove it:

```bash
git -C PROJECT check-ignore CLAUDE.md .claude/settings.json .claude/agents/hunt.md .claude/hooks/guard.mjs .claude/hooks/backend-guard.mjs .claude/skills/maintain-ai-layer/SKILL.md   # must print nothing
git -C PROJECT check-ignore -q .claude/handoff.md && git -C PROJECT check-ignore -q .claude/.last-maintain && git -C PROJECT check-ignore -q .claude/settings.local.json || echo "NOT IGNORED"   # must print nothing
```

**A real env file that git tracks** (`git -C PROJECT ls-files | grep -i "\.env"` shows more than the example files) is a finding for the report, by name only: the secrets in it are already in the history, and what to do about that is the owner's call. Do not open it and do not change the ignore file for it.

## 7. Ask, once

What the repo could not answer goes to the user in one round: `AskUserQuestion` calls of at most four questions each, every question with the option you recommend first, labelled "(Recommended)", and checked against the repo before you recommend it. Typical items: the check command when the project has none or when it needs a database the session cannot assume; which files are migrations and which are generated; the project's own deploy commands; an env file with no secret in it that the project tracks on purpose (`.env.test`) - the built-in list refuses it until its pattern in `backend-guard.mjs` is narrowed, which is the owner's edit; whether local development drives a local cluster or a cloud emulator through `kubectl`, `aws` or `gcloud` - those pass only when the command itself names the local target (`--context kind-...`, `--endpoint-url http://localhost...`); whether the "never commit" policy, the local-only rules and the punctuation rule stay (each is one section of `CLAUDE.md` plus its guard check - `.claude/hooks/README.md` says how to turn one off); a conflict from step 4 or 5, a name collision from step 2, a `.gitignore` line to replace. An unanswered question keeps its recommended default, marked as assumed.

## 8. Prove it, report, hand over

```bash
for f in $(find PROJECT/.claude -name "*.mjs"); do node --check "$f" || echo "SYNTAX $f"; done
node PROJECT/.claude/hooks/tests/guard-test.mjs
node PROJECT/.claude/hooks/tests/guard-shell-test.mjs
node PROJECT/.claude/hooks/tests/backend-guard-test.mjs
node PROJECT/.claude/hooks/tests/upkeep-nudge-test.mjs
node PROJECT/.claude/skills/maintain-ai-layer/layer-refs.mjs
grep -rn "<[A-Z][A-Z_]\{2,\}>" PROJECT/CLAUDE.md PROJECT/.claude
```

No `SYNTAX` line - a filled value that broke a literal shows here first; every test line must read `ok`; `layer-refs` lists what does not resolve - every hit is explained (a `[fill]` example path is fine) or fixed; the placeholder grep shows no layer file. A failing case is a bad list regex nine times out of ten - fix the value, not the test. **Add one case per entry of the four lists** - `guard-test.mjs` carries two commented lines showing the shape, `backend-guard-test.mjs` two more at the end of its first part: without them nothing proves a list is live, since an empty list passes too. A frozen-path case needs a file git tracks: use a migration the repo already has, expecting a refusal, and beside it the file a new migration must still be able to edit (a master changelog), expecting none. Then run `<CHECK_COMMAND>` once, **only when what it needs is already up** - a check that wants a database or containers the session did not find running is reported as not run, with what it needs; a failure is the project's pre-existing state, reported, never fixed here.

**The report**, in the user's language, short: the case (first install or update); what was read and what was assumed; every file copied, kept, merged or left alone, with what happened to it; the values filled, the four lists entry by entry; the conflicts and collisions with your recommendation; the test results; whether the check command ran.

**End with these two lines, always:**

1. Restart Claude Code: agents, skills and hooks are read when a session starts, and a session that began before the `.claude/agents` folder existed does not see the new agents.
2. Then run `/maintain-ai-layer init` (best on Opus at high effort): it writes the project sections of `CLAUDE.md`, builds the path-scoped rules from the code, and tunes the layer's agents to this project.

## U. Updating a layer installed earlier

The project carries a layer from an older version of this bootstrap, possibly tuned since. The template is the new version of the generic parts; the project owns everything it filled or wrote. **The old layer's guards are live in this session**: they refuse a shell copy or move into the project, any shell delete under `.claude/hooks/` or of `.claude/settings*.json`, and an edit of a committed migration. So every new or changed file is written with `Write` / `Edit` (read the template file, write its content), and a delete a guard refuses is left to the owner and named in the report.

1. **Compare.** For every file of `BOOT/template/`, `diff -u PROJECT/<path> BOOT/template/<path>` (a missing project file is new). For every layer file in the project that the template no longer has, find out whether it was the layer's (it carries the bootstrap's shape) or the project's own.
2. **Generic files** - the hooks and their tests, `layer-refs.mjs`, the skills the project has not tuned: take the template's version, then re-apply the placeholder values the project's copy carries (step 6 - read them from the old copy, the four lists included). A hunk the project changed on purpose (an extra guard case, an added list entry, a `rule(...)` line it deleted to allow its own deploy) is kept and ported onto the new version.
3. **Tuned files - never replaced wholesale:** the filled `CLAUDE.md`, the tuned `hunt.md` (its attack angles), `maintain-ai-layer/references/settled.md`, the project's `.claude/rules/*.md`, and the project's own agents and skills. Port the template's changes to the layer text in them hunk by hunk, keeping the project's filled parts; a template section that replaces one the project filled keeps the project's facts.
4. **Removed units.** A layer file the template dropped is deleted (one path per `rm`) once nothing the project wrote depends on it, and every reference to it is gone (`grep -rn "<name>" PROJECT/CLAUDE.md PROJECT/.claude`); under `.claude/hooks/` the guard refuses the delete, so the owner makes it. A hook removed from the template comes out of `settings.json` too; a hook added to it goes in (step 5).
5. Then steps 5, the `.gitignore` part of 6, 7 and 8 - this version may ask for configuration an older one did not. **The report** adds, per file: taken from the template, ported hunk by hunk, kept as the project's, deleted, or left for the owner to delete - and why. `/maintain-ai-layer init` afterwards brings the project sections and the rules up to date with the new layer; it updates, it never rebuilds.
