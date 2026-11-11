# Claude Code bootstraps

Two project-agnostic working layers for [Claude Code](https://docs.claude.com/en/docs/claude-code/overview): a `CLAUDE.md`, agents, skills and hooks that give every task the same lifecycle, review and guard rails. Unpack this repository outside your project, paste one prompt into Claude Code in the project, and the model installs the layer by following the folder's `INSTALL.md`; `/maintain-ai-layer init` then fills the project-specific parts by reading the repo.

| | `claude-bootstrap-full` | `claude-bootstrap-light` |
| --- | --- | --- |
| Built for | a budget where review depth matters more than tokens | a small plan, where every turn and every subagent is counted |
| Lifecycle | nine steps; steps 3-9 in a `lifecycle` skill | six steps, all in `CLAUDE.md` |
| Review | a ladder by triggers: `gate`, then `hunt`, then `drift`, plus `twins` and `comments`; a reachability bar for every finding | one reviewer, `hunt`, on the plan and on the diff, plus `drift` on the docs when a doc names what changed or a bug was fixed |
| Hooks | `guard`, a Stop hook running the check command, session pointers, an upkeep reminder | `guard`, an upkeep reminder |
| Extras | session artifact folders, rule-reach measurement, a browser-check ritual, periodic upkeep of the layer | the same upkeep modes (`maintain-ai-layer`: a cheap `weekly` with `drift` on the hotspots only, `deep` and `rules` on request), rule reach measured with git; each dropped part is named in its README |
| After the install | `/maintain-ai-layer init` - the project sections of `CLAUDE.md`, the rules, the units tuned | the same `init`, with the same thorough survey |
| `CLAUDE.md` budget | 32 KB | 20 KB |
| Install | download, then paste the prompt from `claude-bootstrap-full/README.md` | download, then paste the prompt from `claude-bootstrap-light/README.md` |

Each folder's own `README.md` is the manual: what the layer does, the install prompt, what is left to fill, and how to prove it works. The same prompt updates a layer installed from an older version. Both need Node 18+ and git; full's rule-reach script needs Node 22.5+ or 20.17+.
