# Maintaining the light backend layer

Notes for whoever changes this bootstrap. An adopter needs `README.md` only, and the model installing the layer reads `INSTALL.md`.

## Where it comes from

This layer is the light frontend layer (`../claude-bootstrap-light-frontend`) retargeted at a server codebase in any language. It keeps that layer's budget and shape: one lifecycle, `hunt` and `drift` as the only agents, a `CLAUDE.md` under 20 KB. What changes is what the layer guards against: not a stale closure or a form that loses its input, but a dropped table, an edited migration, a leaked key, a request two callers send at once.

## What it changes, against the light frontend layer

| Unit | Light frontend | Here |
| --- | --- | --- |
| `CLAUDE.md` | generic rules; a contract is "a signature, schema, props" | the same rules plus "Data, secrets and the outside world"; a contract is an endpoint, a schema, a payload, a config key; `[fill]` sections for tests, data and migrations, configuration and environments |
| `hunt` | angles of a UI: state and effects, stale closures, a cache in the browser | angles of a server; it never connects to anything, and on the JVM and .NET it reads a `-sources.jar` or flags a docs-based conclusion |
| `debug` | boundaries from the input to what was rendered | boundaries from the request to the response, local reproduction only, damaged data named |
| `backend-guard.mjs` and its suite | none | new |
| `maintain-ai-layer` | `deep`, `rules`, `init` | the same three; `init` surveys data, configuration and the deploy manifests too, and reports stale hook lists |
| Reachability bar | one user, one tab, human speed: two sessions at once and a backend answer outside its contract are out of scope | a real caller through the service's own entry points: two requests at once, a retry, hostile input and several instances are in; a dependency outside its contract and data no code path can produce are out |
| `CLAUDE.md` budget | 20 KB | 20 KB, about 16 of it the layer's and 4 the project's - the server rules and the server's own reachability bar take the difference, so project detail belongs in path-scoped rules |

## What it drops, against the full layer

The same units the light frontend layer drops, for the same reasons - that folder gives them unit by unit: `gate`, `twins`, `comments`, the review ladder (`crosscheck`), session folders, the Stop hook, the reach checker and the browser check.

## Files shared byte for byte with the light frontend layer

`guard.mjs`, `tests/guard-test.mjs`, `tests/guard-shell-test.mjs`, `upkeep-nudge.mjs`, `tests/upkeep-nudge-test.mjs`, `skills/handoff/SKILL.md`, `skills/retro/SKILL.md`, `skills/maintain-ai-layer/layer-refs.mjs` and `skills/maintain-ai-layer/references/settled.md`. A change to one goes into both layers in the same commit; `cmp` proves it.

`guard.mjs` is also the full layer's guard, so two things in it do little here. The write fence that keeps `hunt` to a compile probe (`FENCED_AGENTS`) only narrows `hunt`'s Bash movers, since `hunt` has no Edit or Write in this layer. The one dependency folder a shell mover may touch is the JavaScript one. They stay so the file remains diffable against the full layer's.

## Install modes

The install asks first whether the layer is the team's (committed, root `CLAUDE.md`), personal or an own repo (both in `.claude/`, with `.claude/CLAUDE.md`, excluded from the project's git). The layer's `CLAUDE.md` is whichever file carries the `Layer tracking` line, and every doc that names a `CLAUDE.md` command must work in both layouts. `layer-refs.mjs` reads the layer's Markdown from disk, so it covers a personal layer that git ignores. `backend-guard`'s frozen check reads the project's git and is the same in every mode.

## Budgets to keep

- `template/CLAUDE.md` under 20 480 bytes by `wc -c`. The Surgical Changes bullet states the layer/project split; re-measure it with `grep -v "^\[fill\]" template/CLAUDE.md | wc -c` after every edit.
- `hunt`'s "Attack angles" section under 6 KB (`wc -c` of the section).
- The README's launch counts ("usually 1-2, at most 5") match `CLAUDE.md` Development Workflow and `deep.md` D9.
