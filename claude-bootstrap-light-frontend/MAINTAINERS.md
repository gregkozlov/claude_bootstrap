# Maintaining the light frontend layer

For whoever changes this bootstrap. An adopter needs only `README.md`; the model installing it reads `INSTALL.md`.

## How it relates to the other layers

- It was cut from [full-frontend](../claude-bootstrap-full-frontend/README.md) for a ~20 USD plan. [light-backend](../claude-bootstrap-light-backend/README.md) is this layer retargeted at a server codebase.
- **Byte-identical files - change them in every copy and confirm with `cmp`:**
  - `template/.claude/skills/maintain-ai-layer/references/init.md` and `references/settled.md`, with the full layer. `init.md` names units this layer lacks (`lifecycle`, `crosscheck`, `verify-live`) on purpose: it runs a step only when the unit exists.
  - `template/.claude/skills/handoff/SKILL.md` and `retro/SKILL.md`, with the light backend layer.
- `guard.mjs` and its two test suites follow the full layer's; the hook differs only in a comment about the write fence (below). The guard costs no tokens - it runs locally - so it is the one part that was not trimmed.

## The numbers that must agree

- **The launch count per task**, "usually 1-2, at most 5" (`hunt` on the plan, `hunt` on the diff, a second `hunt` round, `drift`, `Explore`). It is stated in `template/CLAUDE.md` "Development Workflow", in `README.md` "What it costs" and checked by `maintain-ai-layer/references/deep.md` D6. Change all three together.
- **The `CLAUDE.md` budget**: 20 KB by `wc -c`. The layer's own text is about 11.4 KB (`grep -v "^\[fill\]" template/CLAUDE.md | wc -c`), which leaves the project about 8 KB. Keep the template near 12 KB.
- **The upkeep pace**: `upkeep-nudge.mjs` asks after 30 days, and `deep` is the default mode it points to.

## What it drops, against the full layer

| Dropped | Why, and what carries the obligation instead |
| --- | --- |
| `gate` (static review agent) | the main thread runs the check command itself - one Bash call instead of a whole agent context |
| `twins`, `comments` | the sibling question is the `debug` skill's "who else does this", and `hunt` re-greps the consumers; comments are a `CLAUDE.md` rule |
| The review ladder (`crosscheck`) | one rule: a non-trivial change gets `hunt`, a trivial one gets nothing |
| Session artifact folders, `compact-pointer.mjs` | a verdict written into the chat, and `handoff.md` when the session must survive |
| The Stop hook (`stop-check.mjs`) | it can cost an extra turn per block; lifecycle steps 3 and 6 run the check command |
| `rules-reach.mjs`, `dev-servers.mjs`, `run-pure.mjs`, `verify-live` | project-specific machinery; `maintain-ai-layer` measures a rule's reach with `git ls-files` instead, with no glob-shape check |
| A browser check | the dev server is the user's; `debug` takes the user's screenshot, console or network paste as the observation |
| `maintain-ai-layer`'s session-folder record and `crosscheck` review | a run keeps its findings in a scratchpad file and runs `handoff` when it may outlive the session; hooks and settings are reported, never edited |
| `drift`'s `decisions.md`, its `opus` / `high` default | light has no such file - a settled decision lives in `CLAUDE.md` Architecture; `sonnet` at medium effort is enough for claim-by-claim checks |
| `drift`'s gap check | the main thread runs it after a bug fix by the five conditions in `drift.md` "Gaps", so a fix with no doc hit launches nothing |
| `.claude/docs/decisions.md` | a decision a reviewer would re-file goes into `CLAUDE.md` Architecture as settled and deliberate, which `hunt` reads anyway |
| Probe compiling in the reviewer | it needs per-project build config, allow-listed probe paths and a scratchpad project; the reviewer reads and reasons instead |

## The write fence in `guard.mjs`

`FENCED_AGENTS` keeps an agent's writes to the paths its entry allows. In the full layer it holds `hunt` to its compile probe (`<SRC_DIR>/__hunt_probe*.ts`). Here `hunt` has no Edit or Write tool, so the fence only narrows `hunt`'s Bash movers, and the probe path it allows has no use. It stays so `guard.mjs` remains diffable against the full layer's.

## Why the reachability bar matters most here

It names what is out of scope - two tabs at once, an unmount mid-await, a backend answer outside its contract - so neither the main thread nor `hunt` spends tokens coding for it or reporting it. On a small plan that is the cheapest saving in the layer: a review round that chases an unreachable bug costs a whole launch.

## Before publishing a change

- Run the template's self-tests and `layer-refs.mjs` inside a filled copy of the template (`INSTALL.md` step 8).
- Grep the folder for every skill, agent, step number and file name you changed, so nothing dangles.
- Plain hyphens only; no project, employer, customer, person, host or ticket names anywhere.
