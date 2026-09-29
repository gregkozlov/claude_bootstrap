---
name: setup
description: First-run fill of this working layer for the project it was applied to - inspect the repo, merge with whatever Claude config it already had, fill the placeholders, write the [fill] sections, tune the agents and skills to the project, self-test the guard and the rule reach. Use on "/setup", "finish the bootstrap", "set up the layer", or when a file under .claude/ or CLAUDE.md still carries an unfilled placeholder.
---

# setup

`apply.mjs` copied the layer and substituted the answers it was given. This skill does the rest - the steps its closing message lists - by **reading the project** instead of asking the owner to write them. It runs once, in the main thread, with no subagents.

Three rules hold throughout:

- **Look before writing.** Every value is read from the repo or answered by the user. A plausible guess in `CLAUDE.md` is worse than a question: every later session believes it.
- **Nothing the project already had is destroyed.** An existing `CLAUDE.md`, `settings.json`, agent, skill or command is merged or left alone, never overwritten, and what happened to each is named in the report.
- **Measure what the layer measures.** The guard suites, `rules-reach.mjs` and the check command are run here, not assumed.

## 1. Where am I

```bash
git rev-parse --show-toplevel && git branch --show-current && git worktree list
ls -a
git ls-files | head -50
```

Read what the repo answers by itself, and nothing more: the manifest (its scripts and direct dependencies are the stack and the commands - never a lockfile), the build and lint configs at the root, the real source layout from `git ls-files`, and what is generated (grep the manifest scripts for the generator behind a client, a schema, a migration or a minified artifact).

## 2. What Claude config is already here

Find the instruction files by shape, not by a fixed list of names - the layer may have been copied in by hand and the project's own file renamed to anything (`claude_old.md`, `CLAUDE.md.bak`):

```bash
ls -a; ls -a .claude
git ls-files | grep -i "claude\|agents\.md\|cursorrules\|copilot-instructions"
```

Which copy is which is decided by the text, never by the name: the layer's own `CLAUDE.md` opens with the bootstrap note and carries `[fill]` markers; the project's own carries neither.

`apply.mjs` keeps every file that already existed and lists it as kept, so a second copy of anything is **its** copy, not yours to discard:

- **A `CLAUDE.md` that predates the layer** was kept, and the layer's own copy is beside it as **`CLAUDE.bootstrap.md`** - read that file, never the bootstrap folder, which the project has no path to. Do not run `apply.mjs --force`. Merge: the old file's project facts stay, the layer's sections (Working Principles, Surgical Changes, Version Control, Shell and file edits, Development Workflow, Comments, Punctuation) come in verbatim from `CLAUDE.bootstrap.md`, and a statement in the old file that contradicts the layer - a different lifecycle, "commit when done" - goes into the report as a conflict with your recommendation, for the user to settle. When the merge is done and shown, `CLAUDE.bootstrap.md` goes away (one shell delete, one path).
- **`AGENTS.md`, `.cursorrules`, an instructions section in the README** belong to another tool. Read them for project facts worth merging; never rewrite or delete them.
- **An existing `.claude/settings.json`** was kept, so the layer's hook registrations are not in it. Add them and the missing `deny` / `allow` entries by hand, dropping nothing that was there. Leave `settings.local.json` alone.
- **A list of settled decisions the project already keeps** (a won't-fix list, review decisions, known-and-accepted issues) - copy its entries into the matching sections of `.claude/docs/decisions.md`, in that file's entry format, and leave the original where it is.
- **Existing agents, skills, commands or hooks.** Leave them. Report a name collision (their `hunt`, `gate`, `debug` against the layer's) rather than resolving it: the layer's file is the newcomer, so it is the one that gets renamed if the user wants both.

## 3. Ask, in chat, once

Anything the repo could not settle goes to the user as **one numbered list in the chat, in their language** - not `AskUserQuestion`, which holds four questions at most. Each item: the question, the options, the one you recommend, and what you will assume without an answer. Then wait.

Ask only what changes the outcome: the check command when the project has none; which folders are generated; whether the "never commit" policy and the punctuation rule stay; a browser UI or not (it decides whether `verify-live` and `dev-servers.mjs` survive); a conflict found in step 2.

## 4. Fill the text

```bash
grep -rln "<[A-Z][A-Z_]\{2,\}>" CLAUDE.md .claude
grep -rn "\[fill\]" CLAUDE.md .claude
```

Edit tool only, never the shell. In order:

1. **`CLAUDE.md`** - every `[fill]` section, then delete the bootstrap note at the top. Only facts an agent cannot derive from the code in a minute: the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list, each standing decision marked settled and deliberate with its reason. Not an inventory of folders, not a rule the linter enforces. A count or a site list rots - write the grep that finds the sites instead. Keep it under 48 KB (`wc -c CLAUDE.md`); if a section wants more, it goes into a path-scoped rule (step 6).
2. **`.claude/agents/twins.md`** - the known-twins list; **`comments.md`** - the artefacts other agents own; **`.claude/skills/lifecycle/SKILL.md`** - the project's editor agents at step 4; **`.claude/skills/maintain-ai-layer/SKILL.md`** - the three source areas of step D2, and in `layer-refs.mjs` the project's other top-level folders a doc names by path (`PREFIXES`).
3. **`.claude/skills/crosscheck/SKILL.md`** - the signal list. One entry per risk class **this** project has actually produced a runtime bug in; delete the classes it does not have. A signal list copied wholesale is a ladder that always reports tier 3.
4. **`.claude/agents/hunt.md`** - keep the shape of the attack angles, replace the classes the stack cannot produce. `examples/hunt-example.md` in the bootstrap folder shows what a library fed by real bugs looks like.
5. **`.claude/skills/verify-live/SKILL.md`** - every `[fill]`: the known console noise, the forced-state switch, the marker endpoint. **No browser UI:** delete this skill, `.claude/scripts/dev-servers.mjs` and the "running app" block in `CLAUDE.md`, and rewrite step 7 of `lifecycle` as the command that exercises the change. **A browser project still needs the marker endpoint itself** (`examples/tree-marker-plugin.ts` in the bootstrap folder is the Vite version, reporting the *listening* port, not the configured one): it is a source change, so this skill does not write it - name it in the report as the one step left to the owner.

## 5. Prove the machinery

```bash
node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs   # every line "ok"
node .claude/scripts/rules-reach.mjs --check                                               # "0 failed", no SHAPE line
node .claude/skills/maintain-ai-layer/layer-refs.mjs                                       # every hit explained
git check-ignore -v .claude/docs/decisions.md .claude/skills/setup/SKILL.md                # no output: both tracked
grep -rn "<[A-Z][A-Z_]\{2,\}>" CLAUDE.md .claude                                           # no hits left
<CHECK_COMMAND>                                                                            # it exists, and this is its output
```

Add one test case per entry in `PROTECTED_PATHS` (`guard-test.mjs` carries two commented lines showing the shape). A failing guard case is a bad regex nine times out of ten - fix the regex, not the test. A failing check command is reported as the project's pre-existing state, never fixed here.

Then the two things only a build config can give:

- **Exclude the probe path** `<SRC_DIR>/__hunt_probe*.ts` from the compiler's `exclude` and the linter's ignore list, so a probe live while `gate` runs cannot fail the check command and get blamed on the diff. Prove it once with a deliberately broken probe: the repo's project exits 0, a scratchpad project built the way `hunt.md` describes reports the error.
- **The linter may reach the layer's own scripts** (a flat ESLint config lints `.claude/**/*.mjs` too). If the check command fails on a layer file - a line-count limit on `guard.mjs`, say - report it with the fix that keeps the rule: a first-line `/* eslint-disable <rule> -- <why> */` in that one file, never a weakened rule for the whole tree.
- **Add `node .claude/scripts/rules-reach.mjs --check` to the check command** (Node 22.5+ or 20.17+, and git), with the user's yes, since it edits the manifest.

## 6. The first rule, and the gate

Write the project's first path-scoped rule into `.claude/rules/` only if step 4 produced detail that `CLAUDE.md` should not carry (`rules-reach.md` says how a rule loads and what goes in one), with a `must` pair in `.claude/scripts/rules-reach.fixture.json` for the file that needs it. Point its globs at the files that call the thing, then measure with `node .claude/scripts/rules-reach.mjs`: a rule that does not load at the call site is a rule that does not exist, and a glob matching a third of the tree is paid on every read.

Offer the optional Stop gate last: copy `.claude/settings.local.example.json` to `.claude/settings.local.json` (gitignored, per worktree). It is personal, so it is the user's call, not a default.

## 7. Report

In the user's language, short: what was read and what was assumed (marked), what was merged and what was left alone, the values filled, the measured results of step 5, the unanswered questions from step 3, and the last line - **start a new Claude Code session**: agents, skills and hook registrations are read at session start.

## Boundaries

- No commits, no staging - the layer's own rule applies to it from the first minute.
- Never delete a file the project had before the layer arrived. `CLAUDE.bootstrap.md`, which `apply.mjs` wrote, is the one file this skill removes, and only after its merge is done and shown.
- Do not install anything and do not edit source code. Three config edits are permitted, each with the user's yes: the check command in the manifest, the probe path in the compiler's `exclude`, and the probe path in the linter's ignore list (step 5).
