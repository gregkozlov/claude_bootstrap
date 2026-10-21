> Example from the example app, Stockroom (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. Reference for integrate-worktree.

# Reporting shape for integrate-worktree

Loaded from `SKILL.md` when a run reaches modes 1-3. Mode 4 (refresh) does not need it.


This section governs what reaches the user; it never governs what gets verified. Every check in every mode still runs in full. **Brevity is never bought by skipping a step**, and a check that did not run is never described as one that passed.

**Two shapes, chosen by the result - not by how much work went into producing it.** A long report is what trouble looks like, so a clean integration that reads long trains the user to skim the one that isn't.

**Success** - no conflicts, every gate green, semantic pass empty. The entire report is a verdict line, a facts block, the command block, and any follow-up the user must act on. **Target 15 lines; past ~25 it has failed this rule.**

```
Integration clean. <N> commit(s) on WTB, <M> on main, diverged at <sha>.
Overlap: <files, or "none">. Dry-run clean; type-check 0, lint 0, i18n 0; semantic pass: no findings.
```

Then the command block, then stop.

**Trouble** - a conflict, a non-zero gate, a semantic finding, or a precondition that stopped the run. The facts block stays exactly this compact; every extra line goes into the problem itself. Per finding: `file:line`, what breaks at runtime, which side to keep and why, then the resolution commands in the order they must run. Name what the evidence does *not* settle rather than rounding it off. Nothing is too long here.

**Never in a passing report:**

- what a check would have caught, or what green proves - the reader is asking whether it is safe to merge, not how the machinery works;
- a limit that did not bite. That `merge-tree` simulates a merge rather than a rebase matters when it conflicted or when it changes the route you recommend; on a clean rebase it is noise;
- methodology narration, per-step recaps, or re-listing what each command did;
- the same fact restated in prose after it already appeared in the facts block;
- commentary on how the parallel split went, or on the quality of either side's work.

**A command block that does not fit one terminal line goes over as a script with its step list** - one command per step, each stopping the script on failure, the numbered steps plus the line that runs it - and the run line names the terminal: in PowerShell `& "<Git>/bin/bash.exe" "<script>"`, since a bare `bash` there is WSL.

**One exception, kept to a line and placed last:** anything the user must act on that the facts block cannot carry - a follow-up they own, a check you did not run, a state that expires (a fast-forward that only holds while `main` is still). Honesty about an unrun check outranks the line budget.

