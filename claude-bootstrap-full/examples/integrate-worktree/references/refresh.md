# Mode 4: refresh

`WTB` has no commits of its own and `main` has moved. Nothing to integrate - the tree is just behind, which is where an idle second tree sits after every completed cycle. Starting a task on a stale base is how an avoidable rebase gets created later.

The command goes in the printed block like every other mutating one; the guard hook refuses it from here, and the boundary in `SKILL.md` says why:

```bash
git -C WT merge main            # fast-forward: the branch holds no commits of its own
```

**`git branch -f WTB main` from the main tree does not work here** - git refuses to force a branch that is checked out in another worktree. The merge above is the way, and with `-C WT` the user still needs no shell inside the tree.

**Only if `package.json` moved with it**, reinstall first. The lockfile is gitignored, so the fast-forward leaves `WT`'s old copy behind and `npm ci` refuses it as out of sync - copy main's in, then install:

```bash
cp MAIN/package-lock.json WT/package-lock.json
(cd WT && npm ci)
```

Then `(cd WT && npm run check)` so the idle tree starts green and a later failure is attributable to the task, not to the refresh.

If `WT` is dirty, stop and say so - the fast-forward would fail anyway, and uncommitted work in an "idle" tree is worth surfacing before it is overwritten.

Mode 4 needs no report from `references/reporting.md`: the printed block and one line of outcome are the whole deliverable.
