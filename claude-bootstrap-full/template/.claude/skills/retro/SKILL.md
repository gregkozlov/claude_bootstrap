---
name: retro
description: Retrospective of the task this session just ran, ending in numbered improvements with recommended defaults.
disable-model-invocation: true
---

# retro

The owner asks for this after a task: an honest look at how the pass went and what to change so the next one goes better. It is a proposal, never an action - **nothing is changed until the user answers.** Reply in the user's language; any file content written later stays in the project's own language.

No praise padding and no self-flagellation. "I should be more careful" is not a finding; a named moment, its cost and the cheapest thing that would have caught it is.

## 1. Collect the evidence - from the record, not from memory

- This session's artifact folder: `task-<slug>.md` (findings with decisions, one line per round) and `agents.md` (every launch and its verdict).
- The conversation, oldest first. **The strongest signal is every time the user caught something** - pointed at a defect, asked "why didn't you", had to repeat or correct an instruction. Quote each.
- Rework: a file or a concern edited in more than one round, a decision reversed, a change undone.
- Friction: Stop-hook blocks and the waivers written for them, denied tool calls, commands that failed or had to be retried, guard refusals.
- Cost against value: agents launched against findings accepted, the tier picked against what the diff actually was.
- What stayed unverified at the end, and why.

## 2. Sort it

- **Worked** - only what has evidence: what it caught, prevented or settled. A step that ran and found nothing is not an entry.
- **Went badly** - each item with the moment (a quote, a `file:line`, a round), what it cost (a round, a user correction, a waiver, wasted launches) and the root cause: a knowledge gap, a skipped or mis-ordered step, an unchecked assumption, a gap in the tooling or the docs.

Settled user decisions are context, not mistakes - do not relitigate them.

## 3. Propose improvements - one per bad item, each with a default

Fix each at the cheapest layer that would have caught it, in this order of preference:

1. a tool that fails - a lint rule, a check script, a `rules-reach` fixture pair, a hook;
2. a prohibition in `CLAUDE.md`;
3. detail in the path-scoped rule that loads on the code;
4. a step in a skill;
5. a memory entry - for a habit with no file to change.

**Check feasibility before proposing**: read the config, script or rule the change would touch and say what you found (a lint rule that needs typed linting the project does not run is not a proposal, its cheaper variant is). Never propose changing what worked.

Numbered list, each entry: **the problem** in one line, **the proposal** (what, which file), **cost or risk**, and **Default: do / don't / variant** with its reason. Close with one line naming what answering "go with the defaults" would do, so the user can answer per number or all at once.

## 4. After the answer

Apply the chosen items through the normal lifecycle - the change's class decides the steps, and a `.claude/` or `CLAUDE.md` change still gets `drift`. A habit goes into memory as a `feedback` entry. Record the retro's outcome as one line in the task file.
