# Installing this layer - instructions for the model

You are Claude Code, running in the user's project. The user unpacked this bootstrap folder somewhere outside the project and asked you to integrate the working layer in `template/` into the project. This file is your procedure. It is not copied into the project, and neither is anything else outside `template/`.

Three rules hold throughout:

- **Look before writing.** Every value comes from the repo or from the user. A plausible guess in a hook or in `CLAUDE.md` is worse than a question: every later session believes it.
- **Nothing the project already has is destroyed.** An existing `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, agent, skill, command, rule or hook is merged or left alone, never overwritten, and the report names what happened to each.
- **Files only.** No commit, no staging, no push, no package install, no source-code edit - the layer's own rules apply to you from the first minute.

Write repo files with the `Edit` / `Write` tools; on a first install the template is copied with the shell (step 3), on an update file by file with `Write` (section U), since the layer's own guard is live there and refuses a shell copy into the project. Never `cd` in a command chain: absolute paths, `git -C <dir>`. Below, `BOOT` is the absolute path of this bootstrap folder, `PROJECT` the project root (`git rev-parse --show-toplevel`), and `<scratchpad>` your session's scratchpad directory (any temporary folder outside the project if you have none). This install runs in the main thread, with no subagents.

## 1. Which case

```bash
git -C PROJECT rev-parse --show-toplevel && git -C PROJECT status --short | head -20
ls -a PROJECT; ls -a PROJECT/.claude
```

- **An update of this layer** - the project already has it from an earlier version of this bootstrap: `.claude/hooks/guard.mjs` opens with the "PreToolUse guard" header and `.claude/skills/handoff/` exists. Go to section U, then come back for steps 5, the `.gitignore` part of 6, 7 and 8.
- **The other variant of this bootstrap** - the same guard header, but `.claude/skills/lifecycle/` and no `.claude/skills/handoff/`: the full layer is installed. Stop and ask the user whether to replace it with this one; never merge the two.
- **A first install** - everything else, including a project with Claude config of its own that this bootstrap did not write. Steps 2-8.

A project that is not a git repository: say so once and skip the git commands - the layer works, only the docs check at lifecycle step 5 loses its file list.

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
- **Another complete Claude layer** (rules, its own lifecycle, its own review agents - the full bootstrap included): stop and ask the user before going on - two lifecycles in one repo is their decision, not a merge.

## 3. Copy the template, never overwriting

List what would collide first, then copy only what is missing:

```bash
(cd BOOT/template && find . -type f | sort) > <scratchpad>/template-files.txt
while read -r f; do [ -e "PROJECT/$f" ] && echo "EXISTS $f"; done < <scratchpad>/template-files.txt
```

Copy every file that does not exist yet (`mkdir -p` its folder, then `cp`), one path per `cp`, from `BOOT/template/<path>` to `PROJECT/<path>` - **every file but `.claude/settings.json`, which comes last** (step 5): it registers the guard, and a running session may pick the registration up at once, after which the guard refuses the remaining shell copies. A file that exists is not copied: `CLAUDE.md` is merged in step 4, `.claude/settings.json` in step 5, and any other existing file goes into the report as kept, with a one-line note of how it differs from the template (`diff -q`). Confirm the layer is complete afterwards: `CLAUDE.md`, `.claude/settings.json`, `.claude/agents/{hunt,drift}.md`, `.claude/hooks/{guard,upkeep-nudge}.mjs`, `.claude/hooks/tests/` (three files), `.claude/hooks/README.md`, `.claude/skills/{debug,handoff,retro,maintain-ai-layer}/SKILL.md`, `.claude/skills/maintain-ai-layer/layer-refs.mjs` and its `references/`.

## 4. CLAUDE.md

- **No `CLAUDE.md` in the project**: the template's copy is now in place. Done.
- **The project has one**: merge, do not concatenate. Read the template's copy from `BOOT/template/CLAUDE.md`. The layer's sections - Working Principles, Surgical Changes, Version Control, Shell and file edits, Development Workflow, Comments, Punctuation - come in verbatim, with the bootstrap note at the top; the project's own facts (commands, architecture, conventions, prohibitions) go into the matching `[fill]` sections of the merged file, in the owner's words. A statement in the old file that contradicts the layer (a different lifecycle, a different review policy, "commit when done") is **not merged silently**: it goes into the report as a conflict with your recommendation, for the user to settle. The `[fill]` sections the old file does not answer stay `[fill]` - `/maintain-ai-layer init` writes them. Mind the 20 KB budget (`wc -c CLAUDE.md`): project detail past it is moved into path-scoped rules by `init`, not trimmed by you.

## 5. settings.json - last, after step 6

Fill the placeholders (step 6) first, so nothing is registered while a value is still unfilled.

- **No `.claude/settings.json` in the project**: write the template's copy with `Write`, with its placeholders filled.
- **The project has one**: add the layer's hook registrations (every entry of the template's `hooks` block, under the same events) and every `deny` and `allow` entry it lacks. Never drop an entry that was there, never move a personal one into the tracked file, and keep the JSON valid (`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" PROJECT/.claude/settings.json` - read-only).

## 6. The placeholders and `.gitignore`

Fill these in every file under `CLAUDE.md` and `.claude/` that carries them (`grep -rln "<[A-Z][A-Z_]\{2,\}>" PROJECT/CLAUDE.md PROJECT/.claude`), with `Edit`. Read each value from the repo; ask only what it cannot answer (step 7). Mark each in the report as **read from `<file>`** or **assumed**.

| Placeholder | What it is | Where to read it |
| --- | --- | --- |
| `<PROJECT>` | the project name | the manifest's `name`, or the repo folder |
| `<STACK>` | the stack in one line - the framework, the language mode, the two or three libraries that shape the code; it opens `hunt`'s first sentence | the manifest's direct dependencies with their major versions (never a lockfile) |
| `<SRC_DIR>` | the source directory, relative, forward slashes, no `./`, no trailing slash | where the code actually lives, from `git ls-files`, not from convention |
| `<CHECK_COMMAND>` | the **one** verification call: every check the project has, in sequence | the manifest's scripts. With several (`typecheck`, `lint`, `test`) and no single entry point, propose a package script that chains them (step 7); never invent a command that does not exist |
| `<GENERATED_PATHS>` | a **JSON array** of regex sources for the files the guard refuses to hand-edit, forward slashes, matching the path's tail | the generators behind the manifest scripts (an API client, a schema, migrations, a minified artifact); `[]` is a fine answer |

**The values land inside code and JSON literals**, so each has a shape it must keep:

- `<GENERATED_PATHS>` sits in a `` String.raw`...` `` template in `guard.mjs` and is the JSON array itself, written as it would be in a `.json` file (`["src/api/generated/", "\\.openapi\\.json$"]` - a regex backslash doubled once for JSON); no backtick and no `${`. A bare string or a broken array makes the hook throw, and a hook that throws allows every call; a placeholder left unfilled reads as an empty list.
- `<CHECK_COMMAND>` sits in JSON strings in `settings.json`: one plain command - no `;`, `&&`, `|`, redirect, quote, backslash or backtick; chain or quote inside a package script, and the script name is the value.
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
git -C PROJECT check-ignore CLAUDE.md .claude/settings.json .claude/agents/hunt.md .claude/hooks/guard.mjs .claude/skills/maintain-ai-layer/SKILL.md   # must print nothing
git -C PROJECT check-ignore -q .claude/handoff.md && git -C PROJECT check-ignore -q .claude/.last-maintain && git -C PROJECT check-ignore -q .claude/settings.local.json || echo "NOT IGNORED"   # must print nothing
```

## 7. Ask, once

What the repo could not answer goes to the user in one round: `AskUserQuestion` calls of at most four questions each, every question with the option you recommend first, labelled "(Recommended)", and checked against the repo before you recommend it. Typical items: the check command when the project has none, which folders are generated, whether the "never commit" policy and the punctuation rule stay (each is one section of `CLAUDE.md` plus its guard check - `.claude/hooks/README.md` says how to turn one off), a conflict from step 4, a name collision from step 2, a `.gitignore` line to replace. An unanswered question keeps its recommended default, marked as assumed.

## 8. Prove it, report, hand over

```bash
for f in $(find PROJECT/.claude -name "*.mjs"); do node --check "$f" || echo "SYNTAX $f"; done
node PROJECT/.claude/hooks/tests/guard-test.mjs
node PROJECT/.claude/hooks/tests/guard-shell-test.mjs
node PROJECT/.claude/hooks/tests/upkeep-nudge-test.mjs
node PROJECT/.claude/skills/maintain-ai-layer/layer-refs.mjs
grep -rn "<[A-Z][A-Z_]\{2,\}>" PROJECT/CLAUDE.md PROJECT/.claude
```

No `SYNTAX` line - a filled value that broke a literal shows here first; every test line must read `ok`; `layer-refs` lists what does not resolve - every hit is explained (a `[fill]` example path is fine) or fixed; the placeholder grep shows no layer file. A failing guard case is a bad `<GENERATED_PATHS>` regex nine times out of ten - fix the value, not the test. Add one `guard-test.mjs` case per entry of `<GENERATED_PATHS>` (two commented lines there show the shape): without them nothing proves the list is live, since an empty list passes too. Then run `<CHECK_COMMAND>` once: a failure is the project's pre-existing state, reported, never fixed here.

**The report**, in the user's language, short: the case (first install or update); what was read and what was assumed; every file copied, kept, merged or left alone, with what happened to it; the values filled; the conflicts and collisions with your recommendation; the test results.

**End with these two lines, always:**

1. Restart Claude Code: agents, skills and hooks are read when a session starts, and a session that began before the `.claude/agents` folder existed does not see the new agents.
2. Then run `/maintain-ai-layer init` (best on Opus at high effort): it writes the project sections of `CLAUDE.md`, builds the path-scoped rules from the code, and tunes the layer's agents to this project.

## U. Updating a layer installed earlier

The project carries a layer from an older version of this bootstrap, possibly tuned since. The template is the new version of the generic parts; the project owns everything it filled or wrote. **The old layer's guard is live in this session**: it refuses a shell copy or move into the project and any shell delete under `.claude/hooks/` or of `.claude/settings*.json`. So every new or changed file is written with `Write` / `Edit` (read the template file, write its content), and a delete the guard refuses is left to the owner and named in the report.

1. **Compare.** For every file of `BOOT/template/`, `diff -u PROJECT/<path> BOOT/template/<path>` (a missing project file is new). For every layer file in the project that the template no longer has, find out whether it was the layer's (it carries the bootstrap's shape and is named in an older version's file list: `skills/setup/`, `maintain-ai-layer/references/efficiency.md`) or the project's own.
2. **Generic files** - the hooks and their tests, `layer-refs.mjs`, the skills the project has not tuned: take the template's version, then re-apply the placeholder values the project's copy carries (step 6 - read them from the old copy). A hunk the project changed on purpose (an extra guard case, an added `PROTECTED_PATHS` entry) is kept and ported onto the new version.
3. **Tuned files - never replaced wholesale:** the filled `CLAUDE.md`, the tuned `hunt.md` (its attack angles), `maintain-ai-layer/references/settled.md`, the project's `.claude/rules/*.md`, and the project's own agents and skills. Port the template's changes to the layer text in them hunk by hunk, keeping the project's filled parts; a template section that replaces one the project filled keeps the project's facts.
4. **Removed units.** A layer file the template dropped is deleted (one path per `rm`) once nothing the project wrote depends on it, and every reference to it is gone (`grep -rn "<name>" PROJECT/CLAUDE.md PROJECT/.claude`); under `.claude/hooks/` the guard refuses the delete, so the owner makes it. A hook removed from the template comes out of `settings.json` too; a hook added to it goes in (step 5).
5. Then steps 5, the `.gitignore` part of 6, 7 and 8 - this version may ask for configuration an older one did not. **The report** adds, per file: taken from the template, ported hunk by hunk, kept as the project's, deleted, or left for the owner to delete - and why. `/maintain-ai-layer init` afterwards brings the project sections and the rules up to date with the new layer; it updates, it never rebuilds.
