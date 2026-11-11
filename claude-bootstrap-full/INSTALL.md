# Installing this layer - instructions for the model

You are Claude Code, running in the user's project. The user unpacked this bootstrap folder somewhere outside the project and asked you to integrate the working layer in `template/` into the project. This file is your procedure. It is not copied into the project, and neither is anything outside `template/` (`examples/` stays here: the user copies an example by hand when one fits).

Three rules hold throughout:

- **Look before writing.** Every value comes from the repo or from the user. A plausible guess in a hook or in `CLAUDE.md` is worse than a question: every later session believes it.
- **Nothing the project already has is destroyed.** An existing `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, agent, skill, command, rule or hook is merged or left alone, never overwritten, and the report names what happened to each.
- **Files only.** No commit, no staging, no push, no package install, no source-code edit - the layer's own rules apply to you from the first minute. The project config edits in step 7 (`.gitignore`, the compiler and linter excludes, the check script) are made only with the user's yes.

Write repo files with the `Edit` / `Write` tools; on a first install the template is copied with the shell (step 3), on an update file by file with `Write` (section U), since the layer's own guard is live there and refuses a shell copy into the project. Never `cd` in a command chain: absolute paths, `git -C <dir>`. Below, `BOOT` is the absolute path of this bootstrap folder, `PROJECT` the project root (`git rev-parse --show-toplevel`), and `<scratchpad>` your session's scratchpad directory (any temporary folder outside the project if you have none). A project that is not a git repository: say so once and skip the git commands - the layer works, only the docs check of the lifecycle loses its file list.

## 1. Which case

```bash
git -C PROJECT rev-parse --show-toplevel && git -C PROJECT status --short | head -20
ls -a PROJECT; ls -a PROJECT/.claude
```

- **An update of this layer** - the project already has it from an earlier version of this bootstrap: `.claude/hooks/guard.mjs` opens with the "PreToolUse guard" header and `.claude/skills/lifecycle/` exists. Go to section U, then come back for steps 5, 7, 8 and 9.
- **The other variant of this bootstrap** - the same guard header, but `.claude/skills/handoff/` and no `.claude/skills/lifecycle/`: the light layer is installed. Stop and ask the user whether to replace it with this one; never merge the two.
- **A first install** - everything else, including a project with Claude config of its own that this bootstrap did not write. Steps 2-9.

A working tree with uncommitted changes is fine, but name them in the report: the owner reviews your changes beside theirs.

## 2. Inventory what is already here

Find the instruction files **by shape, not by a fixed list of names** - the project's own file may have been renamed to anything (`claude_old.md`, `CLAUDE.md.bak`, `docs/claude.md`):

```bash
git -C PROJECT ls-files | grep -i "claude\|agents\.md\|cursorrules\|copilot-instructions"
ls -a PROJECT | grep -i "claude\|agents\.md\|cursorrules"      # untracked ones too
find PROJECT/.claude -maxdepth 3 -type f -not -path "*/sessions/*" 2>/dev/null
```

Classify each hit and write the list down before copying anything:

- **The project's own `CLAUDE.md`** (or the renamed copy of it): merged in step 4.
- **`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, an instructions section in a README**: another tool's rules for the same repo. Read them for project facts worth carrying into `CLAUDE.md`; never rewrite or delete them.
- **An existing `.claude/settings.json`**: merged in step 5. `settings.local.json` is personal - never edited; on an update, see U.4.
- **Existing agents, skills, commands, rules or hooks**: left alone. A name collision with a template file (their `hunt`, `gate`, `debug`) is reported, not resolved: the layer's file is the newcomer, so it is not copied over theirs, and the user decides whether to rename one.
- **Another complete Claude layer** (its own lifecycle, its own review agents): stop and ask the user before going on - two lifecycles in one repo is their decision, not a merge.

## 3. Copy the template, never overwriting

List what would collide first, then copy only what is missing:

```bash
(cd BOOT/template && find . -type f | sort) > <scratchpad>/template-files.txt
while read -r f; do [ -e "PROJECT/$f" ] && echo "EXISTS $f"; done < <scratchpad>/template-files.txt
```

Copy every file that does not exist yet (`mkdir -p` its folder, then `cp`), one path per `cp`, from `BOOT/template/<path>` to `PROJECT/<path>` - **every file but `.claude/settings.json`, which comes last** (step 5): it registers the hooks, and a running session may pick a registration up at once, after which the guard refuses the remaining shell copies and the Stop hook runs a check command still unfilled. A file that exists is not copied: `CLAUDE.md` is merged in step 4, `.claude/settings.json` in step 5, and any other existing file goes into the report as kept, with a one-line note of how it differs from the template (`diff -q`).

## 4. CLAUDE.md

- **No `CLAUDE.md` in the project**: the template's copy is now in place. Done.
- **The project has one**: merge, do not concatenate. Read the template's copy from `BOOT/template/CLAUDE.md`. The layer's sections - Working Principles, Surgical Changes, Version Control, Shell and file edits, the layer paragraphs of Commands (the check-command timeout, the running app, the Stop hook), Development Workflow, Comments, Punctuation - come in verbatim, with the bootstrap note at the top; the project's own facts (commands, architecture, conventions, prohibitions) go into the matching `[fill]` sections of the merged file, in the owner's words. A statement in the old file that contradicts the layer (a different lifecycle, a different review policy, "commit when done") is **not merged silently**: it goes into the report as a conflict with your recommendation, for the user to settle. The `[fill]` sections the old file does not answer stay `[fill]` - `/maintain-ai-layer init` writes them.

## 5. settings.json - last, after step 6

Fill the placeholders (step 6) first, so no hook is registered while its command or paths are still unfilled.

- **No `.claude/settings.json` in the project**: write the template's copy with `Write`, with its placeholders filled.
- **The project has one**: add the layer's hook registrations (every entry of the template's `hooks` block, under the same events) and every `deny` and `allow` entry it lacks. Never drop an entry that was there, never move a personal one into the tracked file, and keep the JSON valid (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" PROJECT/.claude/settings.json` - read-only).

## 6. The placeholders

Fill these in every file under `CLAUDE.md` and `.claude/` that carries them (`grep -rln "<[A-Z][A-Z_]\{2,\}>" PROJECT/CLAUDE.md PROJECT/.claude --exclude-dir=sessions`), with `Edit`. Read each value from the repo; ask only what it cannot answer (step 8). Mark each in the report as **read from `<file>`** or **assumed**.

| Placeholder | What it is | Where to read it |
| --- | --- | --- |
| `<PROJECT>` | the project name | the manifest's `name`, or the repo folder |
| `<STACK>` | the stack in one line - the framework, the language mode, the two or three libraries that shape the code; it opens the agents' first sentence | the manifest's direct dependencies with their major versions (never a lockfile) |
| `<SRC_DIR>` | the source directory, relative, forward slashes, no `./`, no trailing slash, **never `.`** - with the code spread over several folders, the one holding most of it, and the others named in the report | where the code actually lives, from `git ls-files`, not from convention |
| `<CHECK_COMMAND>` | the **one** verification call: every check the project has, in sequence | the manifest's scripts. With several (`typecheck`, `lint`, `test`) and no single entry point, propose a package script that chains them (step 8); never invent a command that does not exist |
| `<DEV_PORT_RANGE>` | ports `dev-servers.mjs` scans, `from-to` | the dev server config (`vite.config.*`, the dev script's `--port`), its default port plus the next few |
| `<DEV_BASE_PATH>` | the app's base path with both slashes (`/` at the root); the marker lives at `<DEV_BASE_PATH>__tree` | the build config's base path setting, the router's basename |
| `<GENERATED_PATHS>` | a **JSON array** of regex sources for the files the guard refuses to hand-edit, forward slashes, matching the path's tail | the generators behind the manifest scripts (an API client, a schema, migrations, a minified artifact); `[]` is a fine answer |

**The values land inside code and JSON literals**, so each has a shape it must keep:

- `<GENERATED_PATHS>` sits in a `` String.raw`...` `` template in `guard.mjs` and is the JSON array itself, written as it would be in a `.json` file (`["src/api/generated/", "\\.openapi\\.json$"]` - a regex backslash doubled once for JSON); no backtick and no `${`. A bare string or a broken array makes the hook throw, and a hook that throws allows every call; a placeholder left unfilled reads as an empty list.
- `<CHECK_COMMAND>` sits in a `` String.raw`...` `` template in `stop-check.mjs` and in JSON strings in `settings.json`: one plain command - no `;`, `&&`, `|`, redirect, quote, backslash or backtick; chain or quote inside a package script, and the script name is the value.
- `<SRC_DIR>` sits in single-quoted strings and regexes (`guard.mjs`, `rules-reach.mjs`, `layer-refs.mjs`, `stop-check.mjs`): letters, digits, `_`, `-`, `@` and `/` only, plus a `.` inside a name, never leading.
- `<DEV_PORT_RANGE>` sits in a single-quoted string in `dev-servers.mjs`: exactly `<digits>-<digits>`, the first not above the second.
- `<DEV_BASE_PATH>` sits in single-quoted strings in `dev-servers.mjs` and in docs: starts and ends with `/`, no quote, backslash, backtick or space.

When the grep above shows no hit in a layer file, the placeholders are done; a `<UPPER_CASE>` token in a file the project wrote itself is not this grep's business. The `[fill]` markers are not placeholders - they stay for `init`.

## 7. Configuration the layer needs from the project

- **`.gitignore`.** The layer is tracked and the personal paths are not. Append this block unless the file already has a `.claude/*` line (then compare its negations with this list and add what is missing, with the user's yes):

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

  **A bare `.claude/` (or `/.claude`) line hides the whole layer**: git does not descend into an ignored directory, so no negation after it can rescue the files. Do not append around it - tell the user, and with their yes replace that line with the block. Then prove it:

  ```bash
  git -C PROJECT check-ignore CLAUDE.md .claude/settings.json .claude/agents/hunt.md .claude/hooks/guard.mjs .claude/skills/lifecycle/SKILL.md .claude/docs/decisions.md   # must print nothing
  git -C PROJECT check-ignore -q .claude/sessions/x/task-x.md && git -C PROJECT check-ignore -q .claude/settings.local.json && git -C PROJECT check-ignore -q .claude/.last-maintain || echo "NOT IGNORED"   # must print nothing
  ```

- **The compile probe.** `hunt` writes `<SRC_DIR>/__hunt_probe*.ts` to compile a scenario. Exclude that path from the compiler's `exclude` and the linter's ignore list (with the user's yes - it edits project config), so a probe that is live while a turn ends cannot fail the check command. Then prove `hunt.md`'s own recipe still compiles it: with a deliberately broken probe, the repo's own type-check exits 0 and the scratchpad project `hunt.md` describes reports the error. Delete the probe.
- **The linter may reach the layer's own scripts** (a flat ESLint config lints `.claude/**/*.mjs` too). If the check command fails on a layer file, report it with the fix that keeps the rule: a first-line `/* eslint-disable <rule> -- <why> */` in that one file, never a weakened rule for the whole tree.
- **`rules-reach.mjs --check`** belongs in the check command (it needs Node 22.5+ or 20.17+ for `path.matchesGlob`, and git). Propose adding `node .claude/scripts/rules-reach.mjs --check` to the package script behind `<CHECK_COMMAND>`, with the user's yes, since it edits the manifest.
- **A browser project** needs the marker endpoint `verify-live` reads: `BOOT/examples/tree-marker-plugin.ts` is the Vite version, and it must report the **listening** port, not the configured one. It is a source change, so you do not write it - name it in the report as the step left to the owner. **A project without a browser UI**: say so in the report and leave `verify-live` and `dev-servers.mjs` in place - `init` deletes them together with every step and allow entry that points at them.
- **A check command longer than 150 s** overruns the Stop hook on every turn: point the `CHECK` constant in `.claude/hooks/stop-check.mjs` at a faster subset (type-check and lint) and say so in the report.

## 8. Ask, once

What the repo could not answer goes to the user in one round: `AskUserQuestion` calls of at most four questions each, every question with the option you recommend first, labelled "(Recommended)", and checked against the repo before you recommend it. Typical items: the check command when the project has none, which folders are generated, whether the "never commit" policy and the punctuation rule stay (each is one section of `CLAUDE.md` plus its guard check - `.claude/hooks/README.md` says how to turn one off), a conflict from step 4, a name collision from step 2, the config edits of step 7. An unanswered question keeps its recommended default, marked as assumed.

## 9. Prove it, report, hand over

```bash
for f in $(find PROJECT/.claude -name "*.mjs" -not -path "*/sessions/*"); do node --check "$f" || echo "SYNTAX $f"; done
node PROJECT/.claude/hooks/tests/guard-test.mjs
node PROJECT/.claude/hooks/tests/guard-shell-test.mjs
node PROJECT/.claude/hooks/tests/upkeep-nudge-test.mjs
node PROJECT/.claude/skills/maintain-ai-layer/layer-refs.mjs
node PROJECT/.claude/scripts/rules-reach.mjs --check
grep -rn "<[A-Z][A-Z_]\{2,\}>" PROJECT/CLAUDE.md PROJECT/.claude --exclude-dir=sessions
```

No `SYNTAX` line - a filled value that broke a literal shows here first; every test line must read `ok` and `--check` must end with `0 over budget, 0 rule shape problems`; `layer-refs` lists what does not resolve - every hit is explained (a `[fill]` example path is fine) or fixed; the placeholder grep shows no layer file. A failing guard case is a bad `<GENERATED_PATHS>` regex nine times out of ten - fix the value, not the test. Add one `guard-test.mjs` case per entry of `<GENERATED_PATHS>` (two commented lines there show the shape; `guard-shell-test.mjs` carries one). Then run `<CHECK_COMMAND>` once: a failure is the project's pre-existing state, reported, never fixed here.

**The report**, in the user's language, short: the case (first install or update); what was read and what was assumed; every file copied, kept, merged or left alone, with what happened to it; the values filled; the conflicts and collisions with your recommendation; the test results; the steps left to the owner (the marker endpoint, an unanswered config edit, a deletion only they may make).

**End with these two lines, always:**

1. Restart Claude Code: agents, skills and hooks are read when a session starts, and a session that began before the `.claude/agents` folder existed does not see the new agents.
2. Then run `/maintain-ai-layer init` (best on Opus at high effort): it writes the project sections of `CLAUDE.md`, builds the path-scoped rules from the code, and tunes the layer's agents and skills to this project.

## U. Updating a layer installed earlier

The project carries a layer from an older version of this bootstrap, possibly tuned since. The template is the new version of the generic parts; the project owns everything it filled or wrote. **The old layer's guard is live in this session**: it refuses a shell copy or move into the project and any shell delete under `.claude/hooks/` or of `.claude/settings*.json`. So every new or changed file is written with `Write` / `Edit` (read the template file, write its content), and a delete the guard refuses is left to the owner and named in the report.

1. **Compare.** For every file of `BOOT/template/`, `diff -u PROJECT/<path> BOOT/template/<path>` (a missing project file is new). For every layer file in the project that the template no longer has, find out whether it was the layer's (it carries the bootstrap's shape and is named in an older version's file list: `agents/integration.md`, `hooks/verify-gate.mjs`, `hooks/record-activity.mjs`, `hooks/record-loads.mjs`, `hooks/gate-registered.mjs`, `settings.local.example.json`, `scripts/rules-reach.fixture.json`, `rules/session-artifacts.md`, `rules/rules-reach.md`, `skills/setup/`, `skills/maintain-ai-layer/references/efficiency.md`) or the project's own.
2. **Generic files** - the hooks and their tests, the scripts, `layer-refs.mjs`, the agents and skills the project has not tuned: take the template's version, then re-apply the placeholder values the project's copy carries (step 6 - read them from the old copy). A hunk the project changed on purpose (an extra guard case, a project path in `MOVER_EXEMPT`, an added `PROTECTED_PATHS` entry) is kept and ported onto the new version.
3. **Tuned files - never replaced wholesale:** the filled `CLAUDE.md`, the tuned `hunt.md` (its attack angles), `twins.md` (its known twins), `comments.md` (its ownership list), `crosscheck` (its triggers), `lifecycle` (its editors), `verify-live` (its filled lines), `maintain-ai-layer/references/rules.md` (its R5 areas), `settled.md`, `.claude/docs/decisions.md`, the project's own `.claude/rules/*.md` (the two old layer rules named in U.1 are not the project's), and the project's own agents and skills. Port the template's changes to the layer text in them hunk by hunk, keeping the project's filled parts; a template section that replaces one the project filled keeps the project's facts.
4. **Removed units.** A layer file the template dropped is deleted (one path per `rm`) once nothing the project wrote depends on it, and every reference to it is gone (`grep -rn "<name>" PROJECT/CLAUDE.md PROJECT/.claude`); under `.claude/hooks/` the guard refuses the delete, so the owner makes it. A hook removed from the template comes out of `settings.json` too; a hook added to it goes in (step 5). **`settings.local.json`** may register the old `verify-gate.mjs` (an older version had it copied there from `settings.local.example.json`): name that registration in the report - with the hook deleted it fails on every Stop, and beside `stop-check.mjs` it checks twice - and remove it only with the user's yes, since the file is personal.
5. Then steps 5, 7, 8 and 9 - step 7 because this version may ask for configuration an older one did not. **The report** adds, per file: taken from the template, ported hunk by hunk, kept as the project's, deleted, or left for the owner to delete - and why. `/maintain-ai-layer init` afterwards brings the project sections and the rules up to date with the new layer; it updates, it never rebuilds.
