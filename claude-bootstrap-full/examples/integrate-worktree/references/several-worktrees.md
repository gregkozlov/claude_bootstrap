> Example from the example app, Stockroom (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. Reference for integrate-worktree.

# Several worktrees at once

Two or more candidates waiting to land is a different problem, not a bigger one.

**Integrate strictly one at a time**, running the whole preflight -> rebase -> checks -> merge cycle to completion before starting the next. Merging the first one moves `main`, so every remaining branch is then based on a stale `main` and its rebase has to absorb both `main`'s own commits **and** the branch already merged. Rebasing them all first and merging afterwards puts each branch's checks on a `main` that no longer exists by the time it lands.

**Order them by overlap, smallest first.** Run step 2 for each candidate against `main` and against each other (`git diff --name-only <a>...<b>`). The branch with the least overlap goes first: it merges cheaply and the expensive one then rebases once, onto a `main` that is already final. Where overlap ties, the branch with fewer commits goes first - it is the cheaper rebase, per step 6.

**Recommend `git config rerere.enabled true` whenever a conflict can recur - and two situations produce that, not one.** The obvious one is several candidates: merge one branch, rebase the rest, and the same conflict resurfaces on every remaining branch. The less obvious one needs only a single worktree: a rebase replays each commit separately, so a file that conflicts while replaying commit 2 conflicts again while replaying commit 5, and rerere replays the resolution instead of asking twice. Git config is shared across all worktrees of the repository, so setting it once covers every tree. It earns nothing only when `main..WTB` is a single commit and there is a single candidate.

**Say plainly when two candidates overlap heavily.** If step 2 shows them rewriting the same files, the parallelism was a mistake rather than a merge problem, and the honest report is that one should have been sequenced after the other. Report it; do not try to resolve your way out of it.
