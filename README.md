# Claude Code bootstraps

Three ready-made working layers for [Claude Code](https://code.claude.com/docs): a `CLAUDE.md`, agents, skills and hooks that give every task the same lifecycle, review and guard rails. Pick one, install it with one prompt, and Claude Code follows it in your project from the next session on.

> [!IMPORTANT]
> **Install in three steps:**
> 1. Download this repository (Code > Download ZIP, or `git clone`) and unpack it **outside** your project.
> 2. Start Claude Code in your project on **Opus at high effort**: `claude --model opus --effort high --add-dir <path to the chosen folder>`.
> 3. Paste the install prompt from the **top of the chosen folder's `README.md`**. When it is done, restart Claude Code and run `/maintain-ai-layer init`.

## Which one

| Your project | Take |
| --- | --- |
| A web UI, on a ~20 USD plan | [`claude-bootstrap-light-frontend`](claude-bootstrap-light-frontend/README.md) |
| A service, an API or a worker, in any language | [`claude-bootstrap-light-backend`](claude-bootstrap-light-backend/README.md) |
| A web UI, on a plan where review depth matters more than tokens (Max) | [`claude-bootstrap-full-frontend`](claude-bootstrap-full-frontend/README.md) |
| A UI and a server in one repo | the one that matches where the risk is - one layer per repo, never two |
| A mobile app, a library, a CLI, a data or infra repo | not designed for; light-backend is the closest fit - after `init`, rewrite its reachability bar's entry points (endpoint, consumer, job) to your public API or commands |

## How they differ

| | full-frontend | light-frontend | light-backend |
| --- | --- | --- | --- |
| Lifecycle | nine steps, steps 3-9 in a skill | six steps, all in `CLAUDE.md` | the same six; the changed path is exercised locally |
| Review | graded review, tiers 0-3, by up to five agents, four of them on Opus | one reviewer, `hunt`, on the plan and the diff; `drift` when a doc names what changed; on Sonnet | the same two agents with a server's attack angles |
| Agent launches per task | 0 for a trivial edit, usually 3-6 by review tier, at most 9 | 0 for a trivial edit, usually 1-2, at most 5 | 0 for a trivial edit, usually 1-2, at most 5 |
| Hooks | `guard`, a Stop hook running your check command, session pointers, a monthly upkeep reminder | `guard`, the upkeep reminder | `guard`, the upkeep reminder, and `backend-guard`: no secrets, no edits of merged migrations, no deploys, a question before data is destroyed |
| Always-on `CLAUDE.md` | about 15 KB | about 12 KB | about 18 KB with its `[fill]` prompts |

Each folder's `README.md` is its manual: the install prompt, what it costs, what to do when a hook stops you, and how to check it works.

> [!TIP]
> **Where the layer lives** - the install asks first. **Own repo** (recommended): the whole layer in `.claude/`, kept out of the project's git and versioned in a private repo of your own. **Personal**: the same without a repo. **Team**: committed with the project - then its rules (no commits, no branch switches, no long dashes) apply to everyone who uses Claude Code there, so agree it with the team first. Any other arrangement: just say it in your own words.

> [!NOTE]
> **All three need** Node 18+ (the hooks are Node scripts, whatever language the project is written in), git, and Git Bash on Windows. The full layer's rule-reach script needs Node 20.17+ or 22.5+.
