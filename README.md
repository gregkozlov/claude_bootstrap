# Claude Code bootstraps

Two project-agnostic working layers for [Claude Code](https://docs.claude.com/en/docs/claude-code/overview): a `CLAUDE.md`, agents, skills and hooks that give every task the same lifecycle, review and guard rails. Copy one into a project, run `/setup` in Claude Code, and it fills the project-specific parts by reading the repo.

| | `claude-bootstrap-full` | `claude-bootstrap-light` |
| --- | --- | --- |
| Built for | a budget where review depth matters more than tokens | a small plan, where every turn and every subagent is counted |
| Lifecycle | ten steps; steps 3-10 in a `lifecycle` skill | six steps, all in `CLAUDE.md` |
| Review | a ladder by risk signals: `gate`, `hunt`, `integration`, plus `twins`, `comments`, `drift` | one reviewer, `hunt`, on the plan and on the diff |
| Hooks | `guard`, an opt-in Stop gate, an activity recorder, a rule-load log, session pointers | `guard` only |
| Extras | session artifact folders, rule-reach measurement, a browser-check ritual, periodic upkeep of the layer | none - each dropped part is named in its README |
| `CLAUDE.md` budget | 48 KB | 20 KB |
| Install | `node claude-bootstrap-full/apply.mjs <project> --config <answers.json>` | `node claude-bootstrap-light/install.mjs <project>` |

Each folder's own `README.md` is the manual: what the layer does, how to apply it, what is left to fill, and how to prove it works. Both need Node 18+ and git; full's rule-reach script needs Node 22.5+ or 20.17+.
