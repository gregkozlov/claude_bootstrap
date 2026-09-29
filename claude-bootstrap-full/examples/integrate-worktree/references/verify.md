# Mode 3: verify

`WTB-prerebase` exists and `main` is an ancestor of `WTB`, so the rebase happened. Both counts at zero means the merge landed too - check which, and say so, rather than reporting a pending merge as done or a done merge as pending.

## Prove nothing was lost - before anything else, and before the merge

**Both checks below read `main..WTB`, which is empty once the merge has landed** - `main` and `WTB` are then the same commit and the commands compare nothing while exiting 0. Run them in the window between the rebase and the merge. If the merge already happened, substitute `main~<N>..main` for `main..WTB`, where `<N>` is `git rev-list --count $(git merge-base main WTB-prerebase)..WTB-prerebase` - valid only while the merge was a fast-forward and nothing landed on `main` after it.

Every conflict resolved in mode 2 is a hand edit that can drop an intent with the build still green, and nothing downstream catches it. Run both checks whenever any conflict was resolved, and check 1 even when none was.

**1. Did the branch's own commits survive the replay?**

```bash
git range-diff $(git merge-base main WTB-prerebase)..WTB-prerebase main..WTB
```

This pairs each pre-rebase commit with its replayed counterpart. A clean replay marks every pair `=`. Every `!` is a commit whose content changed while being replayed, which is either a conflict resolution that was intended or a change that was lost - the output cannot tell you which, so read each one. This is what `WTB-prerebase` exists for, and why the command block creates it before the rebase rather than after.

All `=` is one facts-block entry (`loss checks clean`). A single `!` is the report: paste the pair, say which hunk moved, and settle whether it was the resolution or a loss.

**2. Did `main`'s work survive the resolution?**

```bash
git diff main..WTB
```

`main` is an ancestor by now, so its commits are present by construction - but a resolution can still have reverted their *content*, and check 1 cannot see that, because it only compares the branch against itself. Every hunk here must be the branch's own work. A hunk that **deletes** something `main` added is a reverted change from the other tree, and in the final diff it will look exactly like an intentional edit. Go file by file through the step-2 intersection, and through every hot file both sides touched.

If either check finds a loss, `git rebase --abort` is gone - the rebase already finished. Recovery starts from `WTB-prerebase`, which still holds the original commits untouched. Report that and let the user choose the route; do not patch the loss by hand and carry on.

## Then the gates

If the rebase brought a `package.json` change from `main` (`git diff --name-only WTB-prerebase WTB -- package.json` prints it), `WT`'s `node_modules` and its gitignored lockfile are stale and `npm ci` refuses the old lockfile - copy main's in first:

```bash
cp MAIN/package-lock.json WT/package-lock.json
(cd WT && npm ci)
```

If `WTB` changed `package.json` too, neither lockfile matches the result: that one takes `(cd WT && npm install)`.

```bash
(cd WT && npm run check)
```

A subshell, never a bare `cd`: the working directory persists across calls and into the other tree. Once the merge has landed the two trees hold the same commit, so running them in the main tree is equivalent - use whichever has `node_modules`, and name which one you used.

**Report per `references/reporting.md`**: `loss checks clean; check 0`, plus whether the merge has landed or is still pending.

Then run the step-5 semantic pass if it has not run yet for this integration, print the guarded `git merge WTB` from step 6 if the merge is still pending, and afterwards:

```bash
git branch -D WTB-prerebase     # the owner runs this, only after the merge is verified
```

**Default to keeping the tree.** After the fast-forward merge `WTB` equals `main`: the tree is clean and ready for whatever comes next with no `npm ci` beyond the one a `package.json` change already took before the gates. Maintenance before the next task starts there is mode 4.

Offer teardown only when no parallel work is expected for a while:

```bash
# the owner runs these
git worktree remove WT
git branch -d WTB
```

**Before `worktree remove`, everything holding a cwd inside the tree must be closed** - the Claude Code session, terminals, a dev server. Windows refuses to delete a live process's working directory and the command fails with Permission denied. Never remove the directory from the file explorer either - it leaves an entry in `.git/worktrees/` that only `git worktree prune` clears.
