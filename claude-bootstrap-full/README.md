# Claude Code project bootstrap

A project-agnostic copy of a Claude Code working layer built and audited on a production web frontend: one task lifecycle, one review ladder, deterministic guards, and agents fenced to a single job each. A model installs it into your project by following `INSTALL.md`, then `/maintain-ai-layer init` fills the project-specific parts from your code - the project-specific pieces of the original are kept under `examples/` for reference, never copied.

```
README.md     this file
INSTALL.md    the install and update procedure - read by the model, not copied into the project
template/     what a project receives (CLAUDE.md, .claude/*)
examples/     project-specific pieces, rewritten onto one invented app, each saying what it depends on
```

## Install

1. Download this repository (Code > Download ZIP, or `git clone`) and unpack it anywhere **outside** your project. You need one folder of it: `claude-bootstrap-full`.
2. Open Claude Code in your project, preferably on Opus at high effort (`claude --model opus --effort high`, or `/model opus` and `/effort high` in a running session): the install reads your repo and merges with whatever Claude config you already have.
3. Paste the prompt below with the path filled in. If Claude Code asks to read the unpacked folder, allow it (or add it first with `/add-dir <path>`).
4. When it is done, restart Claude Code and run `/maintain-ai-layer init`: it writes the project sections of `CLAUDE.md`, builds the path-scoped rules from your code and tunes the agents and skills to the project.

The same prompt updates a layer installed from an older version of this bootstrap.

```text
Integrate the Claude Code working layer I unpacked at <path to claude-bootstrap-full> into this project.

1. Read <path>/INSTALL.md first and follow it - it covers a first install and an update of a layer installed earlier.
2. Never overwrite what this project already has (CLAUDE.md, AGENTS.md, anything under .claude/): merge it, and say what happened to each file.
3. Read every value the layer needs from this repo; ask me in chat only what the repo cannot answer.
4. Change files only - no commits, no pushes.
5. Finish with the report INSTALL.md asks for, then tell me to restart Claude Code and run /maintain-ai-layer init.
```

What is left to you after `init`: the marker endpoint the browser check reads (`examples/tree-marker-plugin.ts` is the Vite version - a source change, so no model writes it unasked), and feeding `hunt.md` the bugs that surface after a review (`examples/hunt-example.md` shows what a fed attack-angle library looks like).

## What the layer is

- **One lifecycle** - steps 1-2 in `CLAUDE.md` (Development Workflow), because they run before and inside plan mode; steps 3-9, the session folder and the re-entry rules in the `lifecycle` skill, loaded once step 2 closes: investigate and classify, the consumer walk plus `hunt` on a plan that changes a contract, implement and pick the tier, `twins` + `comments` + the project's editor agents in one message, review, browser check, the docs pass, name the unverified, one verification call and three suggested commit subjects. The skip rule is stated once, in `CLAUDE.md`; re-entry once, in the skill.
- **One review ladder** (`.claude/skills/crosscheck/SKILL.md`), by triggers, not by counting: tier 0 no reviewer (literals, styles, copy), tier 1 `gate`, tier 2 `gate` + `hunt` (a form with its mutation, caching, a date boundary, displayed arithmetic, a shared surface, the layer's own hooks and scripts), tier 3 `hunt` on the plan, then `gate` + `hunt`, then `drift` (auth, permissions, build and deploy config, a contract change). At most two rounds. `init` tunes the triggers to the classes that produced a bug in the project.
- **The reachability bar** (`CLAUDE.md`, Working Principles): a defect counts only when one real user reaches it through the interface in ordinary work, and every finding states its click path. What is out of scope - two tabs at once, an unmount mid-await, a backend answer outside its contract - is named, so reviewers stop spending rounds on it; a borderline case is one "Not pursued" line.
- **One browser ritual** (`.claude/skills/verify-live/SKILL.md`): the port by fact (`dev-servers.mjs`, Windows as shipped - its header names the `lsof` / `ps` swap), the machine by a marker endpoint, then a read-first pass.
- **The session's own artifact folder** (`.claude/sessions/<start>-<session id prefix>/`, gitignored): one `task-<slug>.md` per task - the Brief, the file list, the consumer list, each finding with its decision, the decisions taken on the user's behalf, the open risks - and the `precompact` handoff. `compact-pointer.mjs` names the session id prefix and the folder at session start - the model has no other source for its session id - and carries the path across a compaction. A session never reads another session's folder unless the owner names one to continue.
- **Deterministic guards** (`.claude/hooks/`): `guard.mjs` refuses mutating git (however the binary is spelled, `git stash` by an allow list of `list` / `show`, and a read verb that runs a program or writes a file), `gh` writes, in-place shell edits, shell writes into the tree, a copy or move into the tree, a delete beyond the one grant (a single non-recursive project path per call, never a protected path, `.git`, the hooks or settings), a `cd` outside a Bash subshell, an interpreter one-liner that writes a file, protected paths and dash characters, before the call runs - judging every command both as written and with its shell comments blanked; `hunt` it fences to its own compile probe. `stop-check.mjs` runs the check command at the end of a turn that moved the tree off the session's start state and blocks once on a failure; an overrun is "nothing was verified", never a block. `upkeep-nudge.mjs` says when the `maintain-ai-layer` pass is 14 days overdue. The deny list in `settings.json` is the backstop behind the guard.
- **Agents with fences**: `gate` (static review against the Brief and the conventions, read-only, never runs the check), `hunt` (runtime defects only, every finding a traced scenario with its click path, an attack-angle library, compile probes, a plan-review mode, the questions beyond the diff - bundle reach, invalidation across screens, the read point of a stored value - plus an `area` audit of a path scope and a `refute` pass over its findings, both in `.claude/docs/hunt-modes.md`), `twins` (same pattern elsewhere, read-only), `drift` (doc claims against the code, read-only, after the last round at tier 3, and after a fix the one missing rule line for a defect class no doc warned about - zero is the normal result), `comments` (edits comment text only, once per task, deletes by default). An editor that owns one artefact (translations, generated notes) follows the model in `examples/i18n.md`. Every editing agent carries the same rule: a refused `Edit` is re-read and retried once, then reported as **not applied** - never as done.
- **Rule reach** (`.claude/scripts/rules-reach.mjs`, mechanics in `maintain-ai-layer`'s `references/rules.md`): a path-scoped rule that does not load where its code lives is a rule that does not exist, so the globs are measured, not trusted. `--check` refuses the glob shapes where the loader and `matchesGlob` disagree and fails a rule over its 20 KiB budget; `--files <rule>` lists what a rule reaches; without arguments it reports the rule bytes each source-file read pulls in. The template ships no rule: `init` builds the set from the code.
- **Settled decisions** (`.claude/docs/decisions.md`, tracked - `.claude/docs/` is the folder for team docs that load nowhere by themselves, this one and `hunt-modes.md`): the won't-dos, out-of-scope items, rejected fixes and verified-clean claims about single sites. Every reviewer greps it by the diff, and a match is reported as `settled (decisions.md)` under "Not pursued" instead of re-filed. Project-wide decisions stay in `CLAUDE.md`. Entries are the owner's.
- **Skills**: `lifecycle` (steps 3-9), and for the two moments the lifecycle branches, `debug` (root cause before any fix) and `precompact` (the handoff file). `retro`, on the owner's request after a task, turns the session's record and every correction the user had to make into numbered improvements, each fixed at the cheapest layer that would have caught it, each with a default; nothing changes until the user answers. `maintain-ai-layer` keeps the layer true to the code, one `references/<mode>.md` per mode: `weekly` runs the mechanical checks (`layer-refs.mjs` for dead paths, scripts, skill and agent names; `rules-reach`; the counts) plus `drift` on the rules the last two weeks of code reached, `deep` a `drift` pass over every unit, the `rules` steps, the memory folder and a walk of whole tasks through the lifecycle, `rules` the rule set alone, and `init` the project-specific parts after an install - the `[fill]` sections of `CLAUDE.md` from facts found in the repo, the rule set built (or updated and enriched, on a second run) with evidence for every line, and the agents and skills tuned to the project.

## Placeholders

`INSTALL.md` has the model fill these in every file of the template that carries them, reading each from the repo; its table says where.

| Placeholder | Meaning | Example value |
| --- | --- | --- |
| `<PROJECT>` | project name | `stockroom` |
| `<STACK>` | the stack in one line, goes into the agents' first sentence | `React 19 + TypeScript strict on Vite, MUI, ...` |
| `<SRC_DIR>` | source directory, no trailing slash; also the import alias `run-pure.mjs` resolves | `src` |
| `<CHECK_COMMAND>` | the one verification call; the lifecycle, the Stop hook and the allow list use it | `npm run check` |
| `<DEV_PORT_RANGE>` | ports `dev-servers.mjs` scans | `5173-5179` |
| `<DEV_BASE_PATH>` | the app's base path with both slashes; the marker lives at `<DEV_BASE_PATH>__tree` | `/stockroom/` |
| `<GENERATED_PATHS>` | JSON array of regex sources the guard refuses to edit, forward slashes | `["src/api/[^/]+/generated/", "\\.openapi\\.json$"]` |

## Verify the layer works

- Guard: `node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs` - git verbs behind `-C` / `-c`, `git stash`, a read-only git verb that runs or writes (`git grep -O`, `--output`), a variable set to a literal path before it is used, the agents' write fence, interpreter one-liners, `gh`, `sed -i`, heredocs and `tee` by target, a copier's source versus its destination, the delete grant and its cap, `cd` outside a subshell, a `# it's` comment hiding a later line, dashes in `Edit` / `Write` / `MultiEdit`, files outside the project. The shell suite needs `<SRC_DIR>` filled: an unfilled `<...>` reads as a redirect.
- Upkeep reminder: `node .claude/hooks/tests/upkeep-nudge-test.mjs`.
- Rule reach: `node .claude/scripts/rules-reach.mjs --check` ends with `0 over budget, 0 rule shape problems`.
- References: `node .claude/skills/maintain-ai-layer/layer-refs.mjs` - every hit explained.
- Stop hook: edit a source file, end the turn with the check command failing - the turn is blocked once with the output, and a second Stop on the same tree state stays quiet.
- `run-pure.mjs`: a probe importing `<SRC_DIR>/<module>` runs under Node with the alias resolved and `window` shimmed.

## Writing rules for the layer

These are what the layer's own audits paid for; the files follow them and additions should too.

- **A skill or agent description is a trigger, never a summary.** A description that summarizes the workflow makes the agent skip the skill body and work from the summary. Say when to load it and what the user says; keep the how inside.
- **Each mechanic lives in exactly one file.** The lifecycle in `CLAUDE.md` (steps 1-2) and the `lifecycle` skill (steps 3-9), the ladder in `crosscheck`, the browser ritual in `verify-live`. Another file may point, never restate.
- **A count or a site list rots.** Write the grep that finds the sites.
- **Delete what is true but dead**: a status, an instruction for a change already applied, an alternative nothing uses, a paragraph another loaded file already says. A fact-check alone leaves it standing; `drift` reports dead text too.
- **Where text lives**: a prohibition that must be known before any file is read stays in `CLAUDE.md`; one about code in files a rule covers lives in that rule alone. Point rule globs at what the rule describes, not at everything it governs, and measure bytes-of-rules-per-file-read.
- **Form matches the failure.** A prohibition the model keeps rationalizing past gets a hook, not a stronger adjective; a step it skips gets "name each skill and agent the task ran" so the skip is visible.
- **Reviewers get "deliberate - here is why", never "do not flag".** A no-flag list inherits the implementer's blind spots.
- **Every agent pins a model and an effort.** Inheriting the session's means the review gets quietly cheaper exactly when the session is running cheap - which is when it is needed most.
- **An instruction that can be verified by a command is verified by the command, not believed.** Two of the bugs this layer's own audit found were invisible to reading and obvious to one run: a dev-server marker that printed the configured port rather than the listening one, and a build-config exclusion that hid a compile probe from the very command the probing agent was told to run. Write the check next to the claim.
- **Agents never see images.** Whatever a screenshot showed is transcribed into the Brief that every agent prompt carries.
- **Every file of the layer is in one language**, trigger phrases in descriptions included - the model matches a request written in another language by meaning. The reply follows the user's language by the Working Principles rule, which names no language itself.
- Plain hyphens everywhere; the guard refuses a dash in any file under the project (delete the check together with the Punctuation section if the project does not want it).

## Facts about Claude Code this layer relies on

- A hook script is read on every call, so an edit to it applies at once; a changed registration in `settings.json` is not guaranteed to reach a running session. Agents and skills in an existing `.claude/agents` / `.claude/skills` folder are picked up live, but a session that started before the folder existed does not see it - which is why the install ends with a restart.
- `PreToolUse`: exit 2 + stderr blocks the call and shows the reason to the model. `SessionStart`: `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}` on stdout injects context. `Stop`: `{"decision":"block","reason":"..."}`; `stop_hook_active: true` means it already fired this turn - never block again.
- A subagent's own tool call carries the parent session's `session_id` plus its `agent_type`, which is what the guard's write fence reads; a payload without it fails open.
- The public hooks reference documents no output fields for `PreCompact` or `PostCompact`. Send `systemMessage` alongside whatever else you try, so a pointer is not lost to an unsupported channel.
- The browser tools record nothing before their own first call: `read_console_messages` and `read_network_requests` answer "none found" for everything that happened earlier, which is indistinguishable from a clean run. Arm them right after the marker navigation, before navigating to the app.
- `${CLAUDE_PROJECT_DIR}` in a hook command resolves per tree; `settings.local.json` is not carried into a new worktree.
- A deny in `permissions` outranks every allow at every scope and matches the raw command string only.
- `CLAUDE.md` is read up to 4 MiB; the 32 KB budget is the layer's own. `MEMORY.md` is read up to 200 lines / 25 KB.
- The Bash tool eats backslashes in its arguments; a regex or path with backslashes is built in a script file, or with `String.fromCharCode`. The working directory persists across calls, so a `cd` in a chain retargets every later relative path.
- The Grep tool skips gitignored paths unless the folder is passed as its path, and misses files when its `path` is `.claude` itself - ripgrep misapplies the `.claude/*` ignore-plus-negation lines at that root, so a zero- or low-hit answer there proves nothing. Search `.claude` from the repo root with `glob: '.claude/**'`, or pass a subfolder.
- A path-scoped rule loads in full when the Read tool opens a matching file, once per context - after `/compact` it loads again on the next matching Read. Glob, Grep, Write and Edit load nothing, a Bash command that reads the file (`head`) does, a subagent's Read loads into that subagent only, and a rule whose own file was already Read is not injected again. Only the Read trigger is documented; the rest is observed. A rules file without `paths:` loads on every session. The loader expands every brace group, strips a trailing `/**` and matches with gitignore semantics: a glob with an inner slash is anchored at the root, a slash-less one (a folder glob such as `nginx/**` included, once stripped) matches at any depth; there is no negation.

## examples/

Reference only - not part of the template; copy one by hand when it fits. They come from a real project and are rewritten onto one invented app - Stockroom, an inventory analytics frontend (React + TypeScript on Vite, en / de) - so the names, endpoints and decisions in them are illustrations, not facts to copy. `i18n.md` (an editor agent fenced to one artefact, with its checker `i18n-check.mjs`), `hunt-example.md` (the fed attack-angle list), `rule-queries.md` (a path-scoped rule written by class, with narrowed globs), `decisions-example.md` (a filled `.claude/docs/decisions.md`), `verify-live-example.md` (the ritual with real endpoints), and `tree-marker-plugin.ts` (the Vite marker).
