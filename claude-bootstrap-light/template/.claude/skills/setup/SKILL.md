---
name: setup
description: First-run fill of this working layer for the project it was just copied into - inspect the repo, merge with whatever Claude config it already had, fill the placeholders and the [fill] sections, self-test the guard. Use on /setup, or when CLAUDE.md or .claude/ still carries an unfilled placeholder.
---

# setup

The layer arrived as a copy of a template. This skill turns it into **this** project's layer. It runs once, in the main thread, with no subagents.

Two rules hold throughout:

- **Look before writing.** Every value you fill is read from the repo or answered by the user. A plausible guess in `CLAUDE.md` is worse than a question: it is believed by every later session.
- **Nothing the project already had is destroyed.** An existing `CLAUDE.md`, `.claude/settings.json`, agent, skill or command is merged or left alone, never overwritten, and what you did with each is named in the report.

## 1. Where am I

```bash
git rev-parse --show-toplevel && git branch --show-current
ls -a                                  # the manifests and config files at the root
git ls-files | head -50                # the shape of the tree, without reading it
```

Then read what the repo answers by itself, and nothing more:

- **The manifest** - `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `*.csproj`, `composer.json`. Its scripts and dependencies are the stack and the commands; do not Read a lockfile.
- **The build and lint configs** at the root (`tsconfig*.json`, `vite.config.*`, `eslint.config.*`, `ruff.toml`, `Makefile`).
- **The source layout** - which directory actually holds the code, from `git ls-files`, not from convention.
- **What is generated** - a folder or file the repo regenerates from a schema or a spec (an OpenAPI client, protobuf output, a migrations file, a minified config). Grep the manifest scripts for the generator.

## 2. What Claude config is already here

**Find the instruction files by shape, not by a fixed list of names** - the layer may have been copied in by hand and the project's own file renamed to anything (`claude_old.md`, `CLAUDE.old.md`, `CLAUDE.md.bak`, `docs/claude.md`):

```bash
ls -a; ls -a .claude 2>/dev/null
git ls-files | grep -i "claude\|agents\.md\|cursorrules\|copilot-instructions"
ls -a | grep -i "claude\|agents\.md\|cursorrules"      # untracked ones too
```

**Which copy is which** is decided by the text, never by the name: the layer's own `CLAUDE.md` opens with the bootstrap note and carries `[fill]` markers and unfilled placeholder tokens in angle brackets; the project's own carries neither. Read the first 40 lines of each candidate before deciding.

**How the layer arrived** changes only one thing - whether `.gitignore` was handled. `install.mjs` appends the block; a hand copy does not, so step 6's `git check-ignore` is the check that matters. Confirm the layer is complete either way: `CLAUDE.md`, `.claude/settings.json`, `.claude/agents/hunt.md`, `.claude/hooks/guard.mjs`, `.claude/hooks/tests/` (two files), `.claude/hooks/README.md`, `.claude/skills/{setup,debug,handoff,retro,maintain-ai-layer}/SKILL.md`, `.claude/skills/maintain-ai-layer/layer-refs.mjs`. Name anything missing in the report rather than writing it from memory.

Then classify each hit before touching anything:

- **The project's own instructions file, whatever it is called now** - the `CLAUDE.md` that predates the layer, or the `claude_old.md` / `CLAUDE.light.md` / `CLAUDE.bootstrap.md` the rename or the installer produced. Merge, do not concatenate: the old file's **project facts** (commands, architecture, conventions, prohibitions) move into the matching `[fill]` sections of the layer's copy, and the layer's process sections stay as they are. A statement in the old file that contradicts the layer (a different lifecycle, a different review policy, "commit when done") is **not merged silently**: list it in the report as a conflict with your recommendation, and let the user settle it. When the merge is done and the user has seen it, the merged text is what lives in `CLAUDE.md`. **The leftover file is deleted only if the layer created it** (`CLAUDE.light.md`, `CLAUDE.bootstrap.md`) - a file the user renamed by hand is theirs: say it can go, and leave it.
- **`AGENTS.md`, `.cursorrules`, a `README` section of instructions** - another tool's rules for the same repo. Read them for project facts worth merging, but never delete or rewrite them; they belong to that tool.
- **`.claude/settings.json` that already exists.** The installer kept it. Merge by hand: add the layer's `PreToolUse` guard registration to its `hooks`, and the `deny` / `allow` entries it lacks. Never drop an entry that was there, and never move a personal one into the tracked file - if it has a `settings.local.json`, leave it untouched.
- **Existing agents, skills, commands or hooks.** Leave them. Report a name collision (their `hunt`, `debug`, `handoff`, `retro`, `maintain-ai-layer` or `setup` against the layer's) instead of resolving it yourself - the layer's file is the newcomer, so it is the one that gets renamed if the user wants both.
- **A different Claude layer entirely** (a full bootstrap, a team layer with rules and its own lifecycle). Stop and say so: two lifecycles in one repo is a decision for the user, not a merge.

## 3. The values

Fill these from what you read; mark each as **read from `<file>`** or **assumed**:

The placeholder names are written here without their angle brackets on purpose - this file must never itself be a hit of the grep in step 5.

| Placeholder | What it is | How to settle it |
| --- | --- | --- |
| PROJECT | project name | the manifest's `name`, or the repo folder |
| STACK | one line, the stack an agent needs to know | the manifest's direct dependencies and their major versions - the framework, the language mode, the two or three libraries that shape the code |
| SRC_DIR | source directory, no trailing slash | where the code actually lives |
| CHECK_COMMAND | the **one** verification call | a script that runs every check the project has. If the project has several (`typecheck`, `lint`, `test`) and no single entry point, propose adding one to the manifest and say what it would chain - do not invent a command that does not exist |
| GENERATED_PATHS | the guard's `PROTECTED_PATHS`: regex sources, forward slashes, for files that must never be hand-edited | the generated paths from step 1, e.g. `["src/api/generated/", "\\.openapi\\.json$"]` - **a JSON array, always**, since a bare string there crashes the hook on every call. An empty array is a fine answer |

## 4. Ask, in chat, once

Anything the repo could not answer goes to the user as **one numbered list in the chat, in their language** - not `AskUserQuestion` (it holds four questions at most, and there are usually more). Each item: the question, the options, the one you recommend, and what you will assume if they do not answer. Then wait.

Ask only what changes the outcome. Typical items: the check command when the project has none; whether the "never commit" policy stays (it is on by default - the `deny` block plus the guard's git checks); whether the punctuation rule stays; which folders are generated; a conflict found in step 2.

## 5. Fill

**Seven files carry placeholders, and this skill is not one of them.** Fill exactly these, with the Edit tool, never from the shell:

1. `CLAUDE.md`
2. `.claude/settings.json` - the check command in `allow`
3. `.claude/hooks/guard.mjs` - the generated paths, and the source directory in two regexes and one refusal message
4. `.claude/agents/hunt.md` - project and stack
5. `.claude/hooks/tests/guard-shell-test.mjs` - the source directory, in every case that names a path. Left unfilled, that suite fails the cases built from it, with nothing wrong with them.
6. `.claude/skills/maintain-ai-layer/layer-refs.mjs` - the source directory in `PREFIXES`; add the project's other top-level folders a doc names by path.
7. `.claude/hooks/tests/guard-test.mjs` - the source directory in the two write-fence cases. Left unfilled once `guard.mjs` is filled, `hunt Write of its probe (allow)` fails.

```bash
grep -rln "<[A-Z][A-Z_]\{2,\}>" CLAUDE.md .claude --exclude-dir=skills .claude/skills/maintain-ai-layer/layer-refs.mjs   # the seven, to confirm the list
```

Then the `[fill]` sections of `CLAUDE.md` (`grep -n "\[fill\]" CLAUDE.md`), written from the repo, and finally **delete the bootstrap note at the top of `CLAUDE.md`** - it is an instruction to run this skill, and every later session would pay for it on every turn:

- **Only facts an agent cannot derive from the code in a minute.** Not an inventory of folders, not a restatement of the framework's docs, not a rule the linter already enforces.
- A deliberate exception, a trap with a history, a "looks like a bug and is not" - these are the entries worth their bytes. If the repo has none you can prove, write "[fill] none found yet" and say so in the report rather than padding.
- A count or a site list rots. Write the grep that finds the sites instead.
- **The budget is 20 KB (`wc -c CLAUDE.md`), and the layer's own text is about 13 KB of it**, so the project's facts fit in roughly 7 KB. More than that is a signal to move detail into `.claude/rules/<name>.md` with a `paths:` frontmatter, not to pad the budget.

Finally, tune `.claude/agents/hunt.md`: delete the attack-angle classes the stack cannot produce, and keep the shape (one class per heading, one failing input per bullet).

## 6. Prove it

```bash
node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs   # every line "ok"
grep -rn "<[A-Z][A-Z_]\{2,\}>" CLAUDE.md .claude --exclude-dir=skills .claude/skills/maintain-ai-layer/layer-refs.mjs   # no hits left
node .claude/skills/maintain-ai-layer/layer-refs.mjs                                       # every hit explained
git check-ignore CLAUDE.md .claude/settings.json .claude/agents/hunt.md .claude/hooks/guard.mjs .claude/skills/setup/SKILL.md   # must print nothing
```

Then run the project's check command once, so its output is a fact and not an assumption.

A failing guard case is a bad generated-path regex nine times out of ten - fix the regex, not the test. Add one case per generated path (`guard-test.mjs` carries two commented lines showing the shape); without them nothing proves the list is live, since an empty list also passes. A failing check command is reported as the project's pre-existing state, never fixed here.

`git check-ignore` printing a path means that part of the layer is invisible to git - a `.gitignore` line like `.claude/` keeps git from descending into the folder, so no negation after it can rescue the files, and a `.claude/*` without the negations below hides every folder it does not negate. Tell the user, and propose replacing that line with:

```
.claude/*
!.claude/agents/
!.claude/skills/
!.claude/hooks/
!.claude/rules/
!.claude/settings.json
```

A project that is not a git repository at all: say so once, and skip the git checks here and in step 1 - the layer works, only the doc-drift grep at lifecycle step 5 loses its file list.

## 7. Report

In the user's language, short: what was read and what was assumed (marked), what was merged and what was left alone, the values filled, the test results, the open questions from step 4 that are still unanswered, and the last line - **start a new Claude Code session**: agents, skills and hook registrations are read at session start.

## Boundaries

- No commits, no staging - this layer's own rule applies to it from the first minute.
- Never delete a file the project had before. The only removable leftover is the layer's own spare copy (`CLAUDE.light.md`, `CLAUDE.bootstrap.md`), and only after its merge is done and shown; a file the user renamed by hand stays until they say otherwise.
- Do not install anything, do not add a dependency, do not edit source code. The one manifest edit this skill may propose is a `check` script, and only with the user's yes.
