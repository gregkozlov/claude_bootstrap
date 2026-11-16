# Installing this layer - instructions for the model

You are Claude Code, running in the user's project. The user unpacked this bootstrap folder somewhere outside the project and asked you to integrate the working layer in `template/` into the project. This file is your procedure. It is not copied into the project, and neither is anything outside `template/` (`examples/` stays here: the user copies an example by hand when one fits).

Three rules hold throughout:

- **Look before writing.** Every value comes from the repo or from the user. A plausible guess in a hook or in `CLAUDE.md` is worse than a question: every later session believes it.
- **Nothing the project already has is destroyed.** An existing `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, agent, skill, command, rule or hook is merged or left alone, never overwritten, and the report names what happened to each.
- **Files only.** No commit, no staging, no push, no package install, no source-code edit - the layer's own rules apply to you from the first minute. In team mode the project config edits of step 6 (`.gitignore`, the compiler and linter excludes, the check script) are made only with the user's yes (step 7); **in a personal mode no tracked file of the project is touched at all.**

**Run every command block with the Bash tool (Git Bash on Windows), never PowerShell.** Write repo files with the `Edit` / `Write` tools; on a first install the template is copied with the shell (step 3), on an update file by file with `Write` (section U), since the layer's own guard is live there and refuses a shell copy into the project. Never `cd` in a command chain: absolute paths, `git -C <dir>`. Below, `BOOT` is the absolute path of this bootstrap folder, `PROJECT` the project root (`git rev-parse --show-toplevel`), `<scratchpad>` your session's scratchpad directory (any temporary folder outside the project if you have none), and **the layer's `CLAUDE.md`** - `LAYER_MD` in commands - is `PROJECT/CLAUDE.md` in team mode and `PROJECT/.claude/CLAUDE.md` in a personal mode; keep every path quoted, since either may hold a space. A project that is not a git repository: say so once and skip the git commands - the layer works, but the docs check loses its file list, `rules-reach.mjs --check` cannot run, and the Stop hook runs the check at every turn end.

**Tell the user before the first copy** that each copy asks for permission once - about 34 for this layer. `--add-dir` saves only the prompts for reading the bootstrap: a session started with `claude --add-dir "<bootstrap folder>"` (or `/add-dir` in a running one) reads it without asking each time.

## 1. Which case, and where the layer lives

```bash
node --version
git -C "PROJECT" rev-parse --show-toplevel && git -C "PROJECT" status --short | head -20
ls -a "PROJECT"; ls -a "PROJECT/.claude" 2>/dev/null || echo "no .claude yet"
git -C "PROJECT" ls-files CLAUDE.md .claude | head -20                  # what the team already tracks
git -C "PROJECT" check-ignore -v CLAUDE.md .claude/x || echo "not ignored"   # what is ignored, and by which file
test -d "PROJECT/.claude/.git" && echo "own repo" || echo "no own repo"
```

**No `node` on the path, or one older than 18: stop and tell the user.** The hooks are Node scripts, and a hook that cannot start guards nothing; installing Node is theirs to do. Below Node 20.17 (or 22.5 on the 22 line) `rules-reach.mjs` cannot run: say so, and leave it out of the check command in step 6.

- **An update of this layer** - the project already has it from an earlier version of this bootstrap: `.claude/hooks/guard.mjs` opens with the "PreToolUse guard" header and `.claude/skills/lifecycle/` exists. Go to section U, then come back for steps 6, 7, 8 and 9.
- **Another variant of this bootstrap** - the same guard header, but `.claude/skills/handoff/` and no `.claude/skills/lifecycle/`: a light layer is installed, the frontend one or, with `.claude/hooks/backend-guard.mjs`, the backend one. Stop and ask the user whether to replace it with this one; never merge two.
- **A first install** - everything else, including a project with Claude config of its own that this bootstrap did not write. Ask the mode below, then steps 2-9, in order.

A working tree with uncommitted changes is fine, but name them in the report: the owner reviews your changes beside theirs.

**The mode - the first question, asked before anything is copied** (`AskUserQuestion`, recommended option first, each with its one-line reason):

| Mode | What happens | Recommend when |
| --- | --- | --- |
| **C. Personal, own git repo** | The whole layer lives in `.claude/` (`CLAUDE.md` goes to `.claude/CLAUDE.md`), `.claude/` is added to `.git/info/exclude`, and `.claude/` becomes the developer's own git repo: the layer gets history and a backup, and `git clean -x` or `git stash -a` in the project cannot delete it. The developer creates a private repo (their own GitHub or GitLab account, or wherever they keep personal repos) and pushes the layer there. | the default |
| **B. Personal, no history** | As C, without the nested repo. | `.claude/` already holds files the team tracks (C cannot nest a repo there) |
| **A. Team, committed with the project** | The layer merges into the root `CLAUDE.md` and `.claude/`, the `.gitignore` block goes in, config edits with the user's yes. | the team already tracks a `.claude/` config, or asked for a shared layer |

Read the detection lines above for the recommendation, and say what you found:

- **`.claude/` is ignored already** (`check-ignore -v` names the project `.gitignore`, `.git/info/exclude` or the global excludes file): recommend C (or B); no new ignore line is needed - say where it is ignored.
- **The team tracks files under `.claude/`**: A is the natural fit. A personal mode is still possible as B only - C would nest a repo inside a tracked folder. Then the layer's own paths are excluded one by one (step 6, an exclude cannot hide tracked files), the hooks and permissions go into `.claude/settings.local.json` (step 8), and no tracked file is modified.
- **`.claude/.git` exists**: an own-repo layer is already there - mode C, nothing to initialise.

**The developer may answer in their own words** (the "Other" option) with any arrangement they want: follow it, and name once any consequence the facts imply - a layer in a parent folder, for one, loads no hooks when Claude Code starts in the repo, since hooks and `.claude/settings.json` load only from the launch directory's `.claude/`. The layer always lives at the repo root. A personal layer does not follow into a new `git worktree` (in C the developer clones the layer repo into the new tree's `.claude/`). No later mode switch is offered.

## 2. Inventory what is already here

Find the instruction files **by shape, not by a fixed list of names** - the project's own file may have been renamed to anything (`claude_old.md`, `CLAUDE.md.bak`, `docs/claude.md`):

```bash
git -C "PROJECT" ls-files | grep -i "claude\|agents\.md\|cursorrules\|copilot-instructions"
ls -a "PROJECT" | grep -i "claude\|agents\.md\|cursorrules"      # untracked ones too
find "PROJECT/.claude" -maxdepth 3 -type f -not -path "*/sessions/*" -not -path "*/.git/*" 2>/dev/null
```

Classify each hit and write the list down before copying anything:

- **The project's own `CLAUDE.md`** (or the renamed copy of it): in team mode merged in step 4; in a personal mode read for project facts and **never edited** - it stays the team's.
- **`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, an instructions section in a README**: another tool's rules for the same repo. Read them for project facts worth carrying into the layer's `CLAUDE.md`; never rewrite or delete them.
- **An existing `.claude/settings.json`**: merged in step 8 (in a personal mode, when the team tracks it, left alone - step 8). `settings.local.json` is personal - edited only where step 8 says; on an update, see U.4.
- **Existing agents, skills, commands, rules or hooks**: left alone. A name collision with a template file (their `hunt`, `gate`, `debug`) is reported, not resolved: the layer's file is the newcomer, so it is not copied over theirs, and the user decides whether to rename one.
- **Another complete Claude layer** (its own lifecycle, its own review agents): stop and ask the user before going on - two lifecycles in one repo is their decision, not a merge.

## 3. Copy the template, never overwriting

List what would collide first, then copy only what is missing:

```bash
(cd "BOOT/template" && find . -type f | sort) > "<scratchpad>/template-files.txt"
while read -r f; do [ -e "PROJECT/$f" ] && echo "EXISTS $f"; done < "<scratchpad>/template-files.txt"
```

Copy every file that does not exist yet (`mkdir -p` its folder, then `cp`), one path per `cp`, from `"BOOT/template/<path>"` to `"PROJECT/<path>"` - **every file but `.claude/settings.json`, which comes last** (step 8): it registers the hooks, and a running session may pick a registration up at once, after which the guard refuses the remaining shell copies and the Stop hook runs a check command still unfilled. **In a personal mode the template's `./CLAUDE.md` goes to `"PROJECT/.claude/CLAUDE.md"`**: read it as `./.claude/CLAUDE.md` in the collision list - the team's root file is never a collision. The layer's file list is `template-files.txt` with that substitution, plus `.claude/scripts/check.sh` when step 5 writes it and `.claude/.gitignore` in mode C. A file that exists is not copied: the layer's `CLAUDE.md` is merged in step 4, `.claude/settings.json` in step 8, and any other existing file goes into the report as kept, with a one-line note of how it differs from the template (`diff -q`).

## 4. CLAUDE.md

- **No layer `CLAUDE.md` existed**: the template's copy is now in place.
- **Team mode, and the project has a root `CLAUDE.md`**: merge, do not concatenate. Read the template's copy from `BOOT/template/CLAUDE.md`. The layer's sections - Working Principles, Surgical Changes, Version Control, Shell and file edits, the layer paragraphs of Commands (the check-command timeout, the running app, the `Browser check:` line, the Stop hook), Development Workflow, Comments, Punctuation - come in verbatim, with the bootstrap note at the top; the project's own facts (commands, architecture, conventions, prohibitions) go into the matching `[fill]` sections of the merged file, in the owner's words. A statement in the old file that contradicts the layer (a different lifecycle, a different review policy, "commit when done") is **not merged silently**: it goes into the report as a conflict with your recommendation, for the user to settle. The `[fill]` sections the old file does not answer stay `[fill]` - `/maintain-ai-layer init` writes them.
- **A personal mode, and `.claude/CLAUDE.md` existed already**: merge into it the same way. The team's root `CLAUDE.md` is not touched; each conflict between it and the layer goes into the report.

Then, in every mode, replace the `Layer tracking` line of the layer's `CLAUDE.md` (Version Control) with exactly one of these, `<where>` naming the file that keeps the layer out of git (`.git/info/exclude`, the project `.gitignore`, the global excludes file):

```markdown
- **Layer tracking: team.** The layer is committed with the project; a change to it is reviewed like code.
- **Layer tracking: personal.** The layer lives in `.claude/` (`CLAUDE.md` is `.claude/CLAUDE.md`), kept out of the project's git by <where>: never stage it or suggest committing it there; `git clean -x` / `-X` and `git stash -a` would delete it.
- **Layer tracking: own repo.** `.claude/` (`CLAUDE.md` is `.claude/CLAUDE.md`) is the owner's own git repo, kept out of the project's git by <where>: never stage it in the project, and before a branch operation in the project ask the owner to commit the layer repo.
```

In a personal mode where the project has its own root `CLAUDE.md`, add right after it:

```markdown
- The team's root `CLAUDE.md` holds the project facts; where it disagrees with this file on process (commits, review, the lifecycle), this file wins.
```

## 5. The placeholders

Fill these in the layer's `CLAUDE.md` and every file under `.claude/` that carries them (`grep -rln "<[A-Z][A-Z_]\{2,\}>" "LAYER_MD" "PROJECT/.claude" --exclude-dir=sessions`), with `Edit`. Read each value from the repo; what it cannot answer waits for step 7 and is filled there. Mark each in the report as **read from `<file>`** or **assumed**.

| Placeholder | What it is | Where to read it |
| --- | --- | --- |
| `<PROJECT>` | the project name | the manifest's `name`, or the repo folder |
| `<STACK>` | the stack in one line - the framework, the language mode, the two or three libraries that shape the code; it opens the agents' first sentence | the manifest's direct dependencies with their major versions (never a lockfile) |
| `<SRC_DIR>` | the source directory, relative, forward slashes, no `./`, no trailing slash, **never `.`** - with the code spread over several folders, the one holding most of it, and the others named in the report | where the code actually lives, from `git ls-files`, not from convention |
| `<CHECK_COMMAND>` | the **one** verification call: every check the project has, in sequence | the manifest's scripts. With several (`typecheck`, `lint`, `test`) and no single entry point: in team mode propose a package script that chains them (step 7); in a personal mode see below. Never invent a command that does not exist |
| `<DEV_PORT_RANGE>` | ports `dev-servers.mjs` scans, `from-to` | the dev server config (`vite.config.*`, the dev script's `--port`), its default port plus the next few |
| `<DEV_BASE_PATH>` | the app's base path with both slashes (`/` at the root); the marker lives at `<DEV_BASE_PATH>__tree` | the build config's base path setting, the router's basename |
| `<GENERATED_PATHS>` | a **JSON array** of regex sources for the files the guard refuses to hand-edit, forward slashes, matching the path's tail | the generators behind the manifest scripts (an API client, a schema, migrations, a minified artifact); `[]` is a fine answer |

**The values land inside code and JSON literals**, so each has a shape it must keep:

- `<GENERATED_PATHS>` sits in a `` String.raw`...` `` template in `guard.mjs` and is the JSON array itself, written as it would be in a `.json` file (`["src/api/generated/", "\\.openapi\\.json$"]` - a regex backslash doubled once for JSON); no backtick and no `${`. A bare string or a broken array makes the hook throw, and a hook that throws allows every call; a placeholder left unfilled reads as an empty list.
- `<CHECK_COMMAND>` sits in a `` String.raw`...` `` template in `stop-check.mjs` and in JSON strings in `settings.json`: one plain command - no `;`, `&&`, `|`, redirect, quote, backslash or backtick. In team mode, chain or quote inside a package script, and the script name is the value. **In a personal mode no package script is added**: one plain command when it is enough; otherwise the commands, with whatever flags keep the layer out of them (`npx eslint . --ignore-pattern ".claude/**"` when the linter reaches dot-folders), go into a layer-owned `.claude/scripts/check.sh` written with `Write` (`set -e`, one command per line), and the value is `bash .claude/scripts/check.sh`.
- `<SRC_DIR>` sits in single-quoted strings and regexes (`guard.mjs`, `rules-reach.mjs`, `layer-refs.mjs`, `stop-check.mjs`): letters, digits, `_`, `-`, `@` and `/` only, plus a `.` inside a name, never leading.
- `<DEV_PORT_RANGE>` sits in a single-quoted string in `dev-servers.mjs`: exactly `<digits>-<digits>`, the first not above the second.
- `<DEV_BASE_PATH>` sits in single-quoted strings in `dev-servers.mjs` and in docs: starts and ends with `/`, no quote, backslash, backtick or space.

When the grep above shows no hit in a layer file, the placeholders are done; a `<UPPER_CASE>` token in a file the project wrote itself (the team's root `CLAUDE.md` in a personal mode) is not this grep's business. The `[fill]` markers are not placeholders - they stay for `init`, except the `Layer tracking` line (step 4) and the `Browser check:` line (step 7).

## 6. Configuration the layer needs from the project

Work out each item below. In team mode an edit to project config waits for the user's yes in step 7; **in a personal mode every edit to a tracked file is skipped**, and the report names each one with what skipping it costs.

- **Keeping the layer in or out of git.**
  - **Team mode: the `.gitignore` block.** The layer becomes visible to git - committing it is the team's call - and the personal paths stay ignored. First list what the project already tracks under `.claude/`:

    ```bash
    git -C "PROJECT" ls-files .claude | cut -d/ -f2 | sort -u
    ```

    Every name it prints that the block below lacks gets a negation of its own - `!.claude/<name>/` for a folder (`commands`, say), `!.claude/<name>` for a file - or `.claude/*` would hide the project's own files there from every later `git add`. Then append the block, unless the file already has a `.claude/*` line (then compare its negations with this list and add what is missing):

    ```gitignore
    # Ignore .claude contents, not the dir itself - git will not descend into an ignored directory, so the
    # negations only work against `.claude/*`. Deny-by-default: add a line when you add a directory.
    .claude/*
    !.claude/rules/
    !.claude/agents/
    !.claude/skills/
    !.claude/hooks/
    !.claude/scripts/
    !.claude/docs/
    !.claude/settings.json
    # .claude/sessions/ is deliberately not negated: one folder per session holding its own task file and
    # handoff, personal and temporary, pruned by hand.
    CLAUDE.local.md
    ```

    Then prove it:

    ```bash
    git -C "PROJECT" check-ignore CLAUDE.md .claude/settings.json .claude/agents/hunt.md .claude/hooks/guard.mjs .claude/skills/lifecycle/SKILL.md .claude/docs/decisions.md   # must print nothing
    git -C "PROJECT" check-ignore -q .claude/sessions/x/task-x.md && git -C "PROJECT" check-ignore -q .claude/settings.local.json && git -C "PROJECT" check-ignore -q .claude/.last-maintain || echo "NOT IGNORED"   # must print nothing
    ```

  - **Personal modes: `.git/info/exclude`.** Add one `/.claude/` line with `Edit` / `Write` (the file sits under `.git/`, so Claude Code asks once). When `.claude/` is ignored already, add nothing and name the file that ignores it. When the team tracks files under `.claude/`, add one line per layer folder and personal path instead, never `.claude/` wholesale and never a list taken from `git status` now - files the layer writes later (session folders, `.last-maintain`, `settings.local.json`, rules `init` adds) would stay visible:

    ```gitignore
    /.claude/CLAUDE.md
    /.claude/agents/comments.md
    /.claude/agents/drift.md
    /.claude/agents/gate.md
    /.claude/agents/hunt.md
    /.claude/agents/twins.md
    /.claude/hooks/
    /.claude/skills/
    /.claude/rules/
    /.claude/scripts/
    /.claude/docs/
    /.claude/sessions/
    /.claude/settings.local.json
    /.claude/.last-maintain
    /CLAUDE.local.md
    ```

    An exclude never hides a tracked file, so the team's own files in those folders stay visible.
  - **Mode C also: `.claude/.gitignore`** for the nested repo's per-machine paths, written with `Write`:

    ```gitignore
    sessions/
    handoff.md
    .last-maintain
    settings.local.json
    ```

    Prove a personal mode with `git -C "PROJECT" check-ignore -q .claude/CLAUDE.md && git -C "PROJECT" check-ignore -q .claude/hooks/guard.mjs || echo "NOT IGNORED"` (must print nothing; the per-path variant checks two of its own lines).

- **The compile probe.** `hunt` writes `<SRC_DIR>/__hunt_probe*.ts` to compile a scenario. In team mode, exclude that path from the compiler's `exclude` and the linter's ignore list (it edits project config), so a probe that is live while a turn ends cannot fail the check command; the proof that `hunt.md`'s own recipe still compiles it runs in step 7, after the yes. In a personal mode this is skipped: the report says that a probe live during a check run can fail it.
- **The linter may reach the layer's own scripts** (a flat ESLint config lints `.claude/**/*.mjs` too). In team mode, if the check command fails on a layer file, report it with the fix that keeps the rule: a first-line `/* eslint-disable <rule> -- <why> */` in that one file, never a weakened rule for the whole tree. In a personal mode the check command's own flags keep the layer out (step 5).
- **`rules-reach.mjs --check`** belongs in the check command. It needs git and Node 22.5+ or 20.17+ for `path.matchesGlob`; on an older Node it exits 1 and names the version it found. In team mode propose adding `node .claude/scripts/rules-reach.mjs --check` to the package script behind `<CHECK_COMMAND>` - it edits the manifest; in a personal mode it goes into `.claude/scripts/check.sh`.
- **A browser project** needs the marker endpoint `verify-live` reads: `BOOT/examples/tree-marker-plugin.ts` is the Vite version, and it must report the **listening** port, not the configured one. It is a source change, so you do not write it - name it in the report as the step left to the owner; until it answers, the browser check stays `off`. **A project without a browser UI**: say so in the report and leave `verify-live` and `dev-servers.mjs` in place - `init` deletes them together with every step and allow entry that points at them.
- **A check command longer than 150 s** overruns the Stop hook on every turn: point the `CHECK` constant in `.claude/hooks/stop-check.mjs` at a faster subset (type-check and lint) and say so in the report.

## 7. Ask, once

What the repo could not answer goes to the user in one round: `AskUserQuestion` calls of at most four questions each, every question with the option you recommend first, labelled "(Recommended)", and checked against the repo before you recommend it. A question with more than four possible answers goes into the reply as a numbered list with `default: <answer>` instead. The mode was asked in step 1. Typical items:

- the check command when the project has none, and which folders are generated;
- whether the never-commit policy stays - one section of `CLAUDE.md` plus its guard checks and deny entries; `.claude/hooks/README.md`, "Switching a rule off", says how to turn it off. The plain-hyphen rule is always on and is not asked;
- **the browser check** - `on` or `off` for the `Browser check:` line of the layer's `CLAUDE.md`; recommend `off` unless the Claude in Chrome extension is installed and the dev server's marker endpoint already answers;
- a conflict from step 4, a name collision from step 2, and in team mode the config edits of step 6.

An unanswered question keeps its recommended default, marked as assumed. Then apply the answers: the remaining placeholders (step 5), the config edits the user approved (step 6), and `on` or `off` in place of `[fill] on or off` in the `Browser check:` line. A user who lifts the never-commit policy gets it removed in every place `.claude/hooks/README.md` "Switching a rule off" lists, and step 8 then leaves out the git `deny` entries.

Team mode, once the user approves the compile-probe exclude, prove it: `Write` a deliberately broken `<SRC_DIR>/__hunt_probe_install.ts`, run the repo's type-check (expect exit 0) and the scratchpad project `hunt.md` describes (expect the error), then delete the probe. Without that yes, skip the proof and list it under the steps left to the owner.

## 8. settings.json - the last copy

Every placeholder is filled by now, so no hook is registered while its command or paths are still unfilled.

- **No `.claude/settings.json` in the project**: write the template's copy with `Write`, with its placeholders filled.
- **The project has one, in team mode or untracked**: add the layer's hook registrations (every entry of the template's `hooks` block, under the same events) and every `deny` and `allow` entry it lacks (the git `deny` entries only while the never-commit policy stays). Never drop an entry that was there, never move a personal one into the tracked file, and keep the JSON valid (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "PROJECT/.claude/settings.json"` - read-only).
- **A personal mode and a `.claude/settings.json` the team tracks**: leave it alone. The registrations and permissions go into `.claude/settings.local.json` instead, merged the same way (Claude Code keeps that file out of git through its global excludes).

## 9. Prove it, report, hand over

```bash
find "PROJECT/.claude" -name "*.mjs" -not -path "*/sessions/*" -exec node --check {} \;
node "PROJECT/.claude/hooks/tests/guard-test.mjs"
node "PROJECT/.claude/hooks/tests/guard-shell-test.mjs"
node "PROJECT/.claude/hooks/tests/upkeep-nudge-test.mjs"
node "PROJECT/.claude/skills/maintain-ai-layer/layer-refs.mjs"
node "PROJECT/.claude/scripts/rules-reach.mjs" --check
grep -rn "<[A-Z][A-Z_]\{2,\}>" "LAYER_MD" "PROJECT/.claude" --exclude-dir=sessions
git -C "PROJECT" status --short                                        # personal mode: nothing new from the layer
```

`node --check` prints nothing for a sound file - a filled value that broke a literal shows here first; each case line reads `ok` and each suite ends with `N passed, 0 failed`, and `--check` with `0 over budget, 0 rule shape problems`; `layer-refs` lists what does not resolve - every hit is explained (a `[fill]` example path is fine) or fixed; the placeholder grep shows no layer file. In a personal mode `git status` lists nothing the install added - the proof that no tracked file changed and the layer is excluded. A failing guard case is a bad `<GENERATED_PATHS>` regex nine times out of ten - fix the value, not the test. Add one `guard-test.mjs` case per entry of `<GENERATED_PATHS>` (two commented lines there show the shape; `guard-shell-test.mjs` carries one), then run that suite again. Then run `<CHECK_COMMAND>` once: a failure is the project's pre-existing state, reported, never fixed here.

**Mode C: print these commands for the developer** - you never run them; the guard refuses them anyway. Needs git 2.28+ (for `init -b`) and a configured `user.name` / `user.email`.

```bash
git -C "PROJECT/.claude" init -b main
git -C "PROJECT/.claude" add -A
git -C "PROJECT/.claude" commit -m "add: AI layer"
git -C "PROJECT/.claude" remote add origin <private repo url>
git -C "PROJECT/.claude" push -u origin main
```

**The report**, in the user's language, short: the case (first install or update) and the mode, with where the layer is kept out of git; what was read and what was assumed; every file copied, kept, merged or left alone, with what happened to it; the values filled; the browser-check setting; the conflicts and collisions with your recommendation; in a personal mode, every config edit skipped and what it costs; the test results; the steps left to the owner (the marker endpoint, an unanswered config edit, a deletion only they may make, in C the printed commands).

**End with these two lines, always:**

1. Restart Claude Code: agents, skills and hooks are read when a session starts, and a session that began before the `.claude/agents` folder existed does not see the new agents.
2. Then run `/maintain-ai-layer init` (best on Opus at high effort): it writes the project sections of the layer's `CLAUDE.md`, builds the path-scoped rules from the code, and tunes the layer's agents and skills to this project.

## U. Updating a layer installed earlier

The project carries a layer from an older version of this bootstrap, possibly tuned since. The template is the new version of the generic parts; the project owns everything it filled or wrote. **The old layer's guard is live in this session**: it refuses a shell copy or move into the project and any shell delete under `.claude/hooks/` or of `.claude/settings*.json`. So every new or changed file is written with `Write` / `Edit` (read the template file, write its content), and a delete the guard refuses is left to the owner and named in the report.

**Keep the mode.** `grep -l "Layer tracking" "PROJECT/CLAUDE.md" "PROJECT/.claude/CLAUDE.md"` names the layer's `CLAUDE.md`, and its line names the mode. An older layer without the line is detected as in step 1 (a root `CLAUDE.md` with the layer's sections and the `.gitignore` block is team mode) and gets the line in U.3; nothing moves between modes.

1. **Compare.** For every file of `BOOT/template/`, `diff -u "PROJECT/<path>" "BOOT/template/<path>"` (a missing project file is new; the template's `CLAUDE.md` is compared with the layer's). For every layer file in the project that the template no longer has, find out whether it was the layer's (it carries the bootstrap's shape and is named in an older version's file list: `agents/integration.md`, `hooks/verify-gate.mjs`, `hooks/record-activity.mjs`, `hooks/record-loads.mjs`, `hooks/gate-registered.mjs`, `settings.local.example.json`, `scripts/rules-reach.fixture.json`, `rules/session-artifacts.md`, `rules/rules-reach.md`, `skills/setup/`, `skills/maintain-ai-layer/references/efficiency.md`, `skills/maintain-ai-layer/references/weekly.md`) or the project's own.
2. **Generic files** - the hooks and their tests, the scripts, `layer-refs.mjs`, the agents and skills the project has not tuned: take the template's version, then re-apply the placeholder values the project's copy carries (step 5 - read them from the old copy). A hunk the project changed on purpose (an extra guard case, a project path in `MOVER_EXEMPT`, an added `PROTECTED_PATHS` entry) is kept and ported onto the new version.
3. **Tuned files - never replaced wholesale:** the layer's filled `CLAUDE.md`, the tuned `hunt.md` (its attack angles), `twins.md` (its known twins), `comments.md` (its ownership list), `crosscheck` (its triggers), `lifecycle` (its editors), `verify-live` (its filled lines), `maintain-ai-layer/references/rules.md` (its R5 areas), `maintain-ai-layer/references/settled.md`, `.claude/docs/decisions.md`, the project's own `.claude/rules/*.md` (the two old layer rules named in U.1 are not the project's), and the project's own agents and skills. Port the template's changes to the layer text in them hunk by hunk, keeping the project's filled parts; a template section that replaces one the project filled keeps the project's facts. A layer `CLAUDE.md` without a `Layer tracking` line gets it (step 4), one without a `Browser check:` line gets it, set in step 7.
4. **Removed units.** A layer file the template dropped is deleted (one path per `rm`) once nothing the project wrote depends on it, and every reference to it is gone (`grep -rn "<name>" "LAYER_MD" "PROJECT/.claude"`); under `.claude/hooks/` the guard refuses the delete, so the owner makes it. A hook removed from the template comes out of `settings.json` too; a hook added to it goes in (step 8). **`settings.local.json`** may register the old `verify-gate.mjs` (an older version had it copied there from `settings.local.example.json`): name that registration in the report - with the hook deleted it fails on every Stop, and beside `stop-check.mjs` it checks twice - and remove it only with the user's yes, since the file is personal.
5. Then steps 6, 7, 8 and 9 for the mode the layer has - step 6 because this version may ask for configuration an older one did not. **The report** adds, per file: taken from the template, ported hunk by hunk, kept as the project's, deleted, or left for the owner to delete - and why. `/maintain-ai-layer init` afterwards brings the project sections and the rules up to date with the new layer; it updates, it never rebuilds.
