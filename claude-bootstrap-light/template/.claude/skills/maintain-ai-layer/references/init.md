# init mode

Turns a freshly installed layer into **this** project's layer: the project sections of `CLAUDE.md` written from facts found in the repo, a path-scoped rule set built or brought up to date and enriched, and the units the layer ships tuned to the project. It runs right after the install (`INSTALL.md` ends by asking for it), and again whenever the owner wants: a second `init` on a filled layer is the normal case, not an error - it takes the same path, correcting what went stale and adding what is missing, never rewriting from scratch.

How it differs from the other modes: `rules` works on the rule set alone, without `CLAUDE.md` and without tuning the units; `deep` audits every file of the layer as it stands. `init` reads the project first and writes the project-specific parts: `CLAUDE.md`, the rules and the unit tuning. It runs the `rules` steps by reference and does not restate them.

This file is the same in every layer this bootstrap ships, so where the layers differ it says what to do by what exists: run a step on a unit or script only when the layer has it, and skip it with one line in the run file when it does not. A path below that starts with `agents/`, `skills/`, `scripts/` or `docs/` is under `.claude/` and may be absent from this layer. Every standing rule of `SKILL.md` holds, and so does its "Record the run". The survey below is the same size in every layer - a cheap layer saves launches elsewhere, never here, since a rule set built on a thin survey costs every later session.

## I1. Survey

First the current state, in the main thread: `wc -c CLAUDE.md`, `grep -n "\[fill\]" CLAUDE.md`, `grep -rn "\[fill\]" .claude`, the bootstrap note at the top of `CLAUDE.md` (still there, or gone), `ls .claude/rules` (missing or empty means no project rule yet), and whether `scripts/rules-reach.mjs` exists. The answer decides the shape of the run: `CLAUDE.md` sections still `[fill]` are written, filled ones are corrected and completed (I2); no project rule means building the set, existing rules mean updating and enriching them (I3).

Then launch these read-only agents in one message, every one on Sonnet (the standing rule), each told never to edit, never to write a file, and never to `cd` (absolute paths, `git -C <tree>`):

- (a) **`Explore`, the toolchain:** the package manifest and its scripts (the real check, build, dev, generation and lint commands - never a lockfile), the build, type-check and lint configs, and **what the linter and the type checker already enforce** - their rule lists and ignore lists - since a rule that restates an enforced check is dead text.
- (b) **`Explore`, the layout:** `git ls-files` per top-level folder with counts, the real source directory, the naming and folder conventions visible in the code (three sites each), the shared modules other code imports most (`git grep -l` by import), and what is generated - a folder or file a generator in the manifest rewrites (an API client, protobuf output, migrations, a minified config) - with the command that regenerates it.
- (c) **`Explore`, the written knowledge:** `README*`, `CONTRIBUTING*`, `docs/`, ADRs, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, a decisions or won't-fix list, and whatever the install merged from an earlier `CLAUDE.md` (its project facts, its prohibitions); plus the current `CLAUDE.md` and every `.claude/rules/*.md`. It returns the facts, the stated conventions, the deliberate exceptions with their reasons, and every statement that contradicts the code.
- (d) **`general-purpose`, the fix history:** `git log --since=12.months --no-merges -i --grep='^fix' --format='%h %s' --name-only` (widen the `--grep` to the project's own fix-subject convention after a look at `git log --format='%s' -50`), each commit's diff read with `git show`; it names each defect class, and returns the classes fixed twice or once in a shared module, with the commits and the files they touched.

Each prompt names the folders it may read. Write the four answers' substance into the run file before the next step: they are the evidence every later step cites.

## I2. CLAUDE.md

- **Every `[fill]` section is written from I1's facts alone**: the stack, the commands, the folder conventions, the generated code, the architecture facts an agent cannot derive from the code in a minute (the deliberate exceptions, the traps with a history, the "looks like a bug and is not" list), the code-style rules no linter enforces. Not an inventory of folders, not a restatement of a framework's docs, not a rule the linter already enforces.
- **A command goes in only once it was found in the manifest**; a read-only check among them (type-check, lint, build, test) is also run once, and its output is the evidence. Never run a command that writes tracked files or reaches outside the machine (a generator, a migration, a deploy, a publish) or a dev server - document it from the manifest, or ask in I5. A check command that fails is written down as the project's pre-existing state, never fixed here.
- **Each standing decision a reviewer would otherwise flag** is marked settled and deliberate, with its reason.
- **Where text lives:** a prohibition that must be known before any file is read (never create X, which tool to pick) goes into `CLAUDE.md`; a convention, a mechanic or a prohibition about code in certain files is rule text (I3). Keep `CLAUDE.md` under the budget its "Surgical Changes" section states (`wc -c CLAUDE.md`); more is a signal to move detail into a rule, not to pad.
- **A section already filled is not rewritten**: a statement the code contradicts is corrected, a missing project fact is added, the rest stays in the owner's words.
- A `[fill]` the repo cannot answer becomes a question (I5), never a guess; a section that has nothing to say yet keeps one line saying so.
- When nothing is `[fill]` any more, delete the bootstrap note at the top of `CLAUDE.md`.

## I3. Rules

Read `references/rules.md` "Writing a rule" first, and measure every rule the way this layer measures one: with `node .claude/scripts/rules-reach.mjs --files <rule>` and `--check` when that script exists, otherwise with `git ls-files` per glob as `SKILL.md` "Measuring a rule" says.

- **No project rule:** run `references/rules.md` R7, handing its candidate agents I1's answers so they do not survey again.
- **Rules already there - update and enrich them, never rebuild:** run `references/rules.md` R1-R5. Every existing rule is checked against the code: stale facts corrected, dead lines removed, `paths:` fitted to the real call sites both ways, a rule whose sections serve different files split. Then **enrich**: the useful project knowledge the rules do not hold yet - conventions the code shows, traps from the fix history (I1 d), protected paths, the contracts of shared modules (I1 b).
- **What may become rule text**, on top of R5's five conditions: every statement carries its evidence - three or more real sites, or a fix commit - in the run file; it does not repeat the linter, the type checker or `CLAUDE.md`; and it helps whoever edits the files under its glob. A statement with no evidence is a question for the owner (I5), never a rule.
- Every rule is path-scoped, its globs point at the files that really call what it describes, its reach is measured before and after, and it stays within the per-rule budget `references/rules.md` states.
- **The project's own style and decisions are kept**: the wording of an existing rule, an entry of `references/settled.md`, of `docs/decisions.md` when the layer has one, and anything `CLAUDE.md` marks settled.

## I4. Tune the units

The units the layer ships carry `[fill]` lines and generic defaults that only the project can settle. For each one below that exists in this layer, write it from I1's facts; skip it, with one line in the run file, when it does not exist:

- `agents/hunt.md` - keep the shape of the attack angles; delete the classes the stack cannot produce, and add one per defect class I1 (d) found fixed twice, each as a concrete check.
- `agents/twins.md` - the known twins: code that exists in two or more places on purpose and must change together (I1 b).
- `agents/comments.md` - the artefacts other agents own.
- `skills/lifecycle/SKILL.md` - the project's own editor agents at step 4 with their conditions, or the clause deleted; the source and config paths in its re-entry rule.
- `skills/crosscheck/SKILL.md` - the tier triggers, tuned to the classes that produced a runtime bug here (I1 d); a class the project cannot have is deleted. A trigger list copied wholesale sends every change to the top tier.
- `skills/verify-live/SKILL.md` - every `[fill]` line. **No browser UI:** delete this skill and `scripts/dev-servers.mjs`, the "running app" paragraph of `CLAUDE.md`, and rewrite the browser-check step of the lifecycle and the reproduction step of `debug` as the command that exercises the change; fix every other reference `layer-refs` then reports, and name the `settings.json` allow entries for `dev-servers.mjs` in the report (settings are the owner's). A browser project still needs the marker endpoint the skill reads, a source change the owner makes - name it in the report.
- `scripts/run-pure.mjs` and `scripts/run-pure-hooks.mjs` - they run a TypeScript or JavaScript module under Node; a project in another language deletes both, with the sentences of `hunt` and `debug` that call them.
- `references/rules.md` - R5's three source areas, where they are a `[fill]`.
- `layer-refs.mjs` - `PREFIXES`: the project's other top-level folders a doc names by path.
- Every other `[fill]` the step-I1 grep found under `.claude/`.

## I5. Questions - one round

What the repo could not answer goes to the owner once, after I2-I4, as `AskUserQuestion` calls of at most four questions each. Every question carries a recommendation checked against the code first, as the first option, labelled "(Recommended)". Typical items: a check command when the project has none (propose the package script that would chain the checks; never invent a command), a candidate rule with too little evidence, a contradiction between an old doc and the code, whether a policy the layer ships (never commit, the punctuation rule) stays. Apply the answers; a question left unanswered keeps its recommended default, marked as assumed in the report.

## I6. Verify, report, stamp

```bash
grep -n "\[fill\]" CLAUDE.md; grep -rn "\[fill\]" .claude          # none left but the ones I5 left open, and the mentions of the marker in maintain-ai-layer's own SKILL.md and init.md
grep -rn "<[A-Z][A-Z_]\{2,\}>" CLAUDE.md .claude --exclude-dir=sessions   # no unfilled placeholder
node .claude/skills/maintain-ai-layer/layer-refs.mjs                # every hit explained
wc -c CLAUDE.md                                                      # inside the budget
```

Plus `node .claude/scripts/rules-reach.mjs --check` and its report when the script exists, otherwise every rule's reach measured once more by git; and the project's check command, run once - a failure in a file this run did not touch is the project's own state.

The report, in the user's language: what the survey read; the `CLAUDE.md` sections written and the ones corrected; the rules created, updated, split and deleted, and the knowledge added, each with the evidence it stands on (sites or a commit); the candidates rejected, each with the condition it failed; the units tuned and the ones skipped; the questions with their answers or assumed defaults; the numbers before and after (`CLAUDE.md` bytes, rule count and bytes, reach); and what is left to the owner (the marker endpoint, a hook or settings change).

Last, write today's date (`YYYY-MM-DD`, the only line) into the gitignored `.claude/.last-maintain` with `Write`: the layer was just checked against the repo, and `upkeep-nudge.mjs` counts the days to the next pass from it.
