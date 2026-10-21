---
name: integrate-worktree
description: Integrate the second worktree's branch into main, or refresh an idle worktree; prints every mutating git command. Main-tree session only. Use on "integrate the worktree", "merge the worktree into main", "sync the trees", a question whether two branches will conflict, or a rebase stuck on conflicts.
---

> Example from the example app, Stockroom (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. Depends on: a second git worktree, the guard hook that refuses mutating git, the project's check command, `i18n-merge-check.mjs` beside it, and `.claude/docs/worktree-flow.md` (`worktree-flow.md` here).

# integrate-worktree

Two trees, worked in parallel, neither session aware of the other. This skill exists to find what they did to each other **before** the working tree is in a conflicted state.

**Neither side is assumed to be the big one** - describe each side by its commit counts, never as "the long task" and "the small stuff".

## The human runbook

`.claude/docs/worktree-flow.md` is the hand-run guide plus setup facts; this file is canonical for the mechanics - if they disagree, follow this file and say so.

## Hard boundary

**This skill never runs `git merge`, `git rebase`, `git commit`, `git cherry-pick`, `git push`, `git reset --hard`, `git branch -d` / `-D`, or `git worktree remove`.** Everything here is read-only analysis plus, in resolve mode, file edits. The user runs every mutating command from the block this skill prints.

Never emit `--ours`, `--theirs`, `-X ours` or `-X theirs`. See "The inversion trap" in `references/resolve.md`.

## Reporting

Short on success, long only on trouble. Before writing a mode 1-3 report, read `references/reporting.md` - it carries the line budget and the list of things a passing report must not contain. Mode 4 needs none of it.

## Discover the topology first

Do not hardcode paths or branch names.

```bash
git worktree list --porcelain          # every tree and the branch each holds
git branch --format='%(refname:short) %(worktreepath)'
```

Throughout this file: **`WT`** is the other tree's path, **`WTB`** is the branch checked out there, **`MAIN`** is the path of the tree holding `main` (from the same listing), and `main` is always the integration target.

The tree holding `main` is that target. **Every other tree is a candidate**, so do not assume there is exactly one. Classify each candidate by both counts, never by one:

```bash
git rev-list --count main..<branch>    # what the worktree has that main lacks
git rev-list --count <branch>..main    # what main has that the worktree lacks
```

- exactly one candidate with `main..<branch>` non-zero -> that is `WTB`, its tree is `WT`
- several -> integrate **one at a time** and ask the user which goes first; see "Several worktrees at once"
- none with commits of their own -> nobody is waiting to land; if `main` has moved, the tree is merely stale, which is mode 4

## Where to run this skill

**Always from the main-tree session, in every mode**: `permissions.additionalDirectories` in `.claude/settings.local.json` grants the worktree parent, the analysis reads the shared object database, and the final merge runs where `main` is checked out.

**Because of that, two rules are not optional:**

1. **Never `cd`.** Reach the other tree with `git -C WT` and absolute paths; `npm` gets `WT` as its cwd only through a subshell, `(cd WT && npm run type-check)` - a bare `cd` persists and runs the next gates in the wrong tree.
2. **Every file path in resolve mode is absolute, under `WT`.** Both trees contain the same relative paths, so `src/widgets/Foo/index.tsx` is ambiguous and a relative edit silently lands in the main tree - writing one side's conflict resolution into the other side's code. Verify the path starts with `WT` before every Edit or Write.

The printed command block is the one exception: it is for the user's own terminal and may open with a single `cd WT`.

**Text after the command is the user's goal, not a mode.** The state picks the mode below; the goal shapes the report and the next steps. When the two disagree, say what the state requires first.

Then pick the mode - **check in this order**, first match wins; resolve goes first because a half-finished rebase makes every other reading unreliable:

| #   | Test                                                                                                                             | Mode                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `test -e "$(git -C WT rev-parse --git-path rebase-merge)"` (Bash), same for `rebase-apply` and, on the merge route, `MERGE_HEAD` | **resolve** (`references/resolve.md`)                                   |
| 2   | `git show-ref --verify --quiet refs/heads/WTB-prerebase` **and** `git merge-base --is-ancestor main WTB` both succeed            | **verify** (`references/verify.md`; rebase done, merge pending or done) |
| 3   | `main..WTB` == 0 **and** `WTB..main` == 0                                                                                        | in sync - nothing to do, say so                                         |
| 4   | `main..WTB` == 0 (so `main` is ahead)                                                                                            | **refresh** (`references/refresh.md`)                                   |
| 5   | otherwise, including `WTB` ahead with `main` unmoved                                                                             | **preflight**                                                           |

Test 2 cannot tell this cycle's `WTB-prerebase` from one an earlier cycle left behind. A replay keeps each commit's author, author date and subject, so compare those (not `git cherry`: a resolved conflict changes the patch; the subject keeps two commits made in the same second apart): when `main..WTB` is non-empty and every line of `git log --format='%an %ad %s' $(git merge-base main WTB-prerebase)..WTB-prerebase` also appears in `git log --format='%an %ad %s' $(git merge-base main WTB-prerebase)..main` and none in `git log --format='%an %ad %s' main..WTB`, the ref is from a landed cycle - report it and continue from test 3; deleting it is the owner's step. A line found in `main..WTB`, or missing from `main`, is this cycle's rebase, and a squash-landed cycle reads the same way, which only ends in asking the owner. An empty `main..WTB` is either verify after this cycle's merge or a ref a landed cycle left behind: `references/verify.md` then substitutes the range the merge brought, and a range-diff there that pairs nothing is the leftover - report it.

---

## Mode 1: preflight

### 1. Preconditions - stop on any failure

```bash
git -C WT status --porcelain     # the other tree
git status --porcelain           # main tree
git rev-list --count main..WTB   # commits the worktree produced
git rev-list --count WTB..main   # commits main produced
```

- **`WT` dirty** -> stop. `git rebase` refuses to start on a dirty tree, and uncommitted work is invisible to every check below. The user reviews and commits inside the worktree first.
- **main tree dirty** -> stop. The final merge needs a clean tree, and a half-finished change means integrating is premature.
- **`main..WTB` == 0** -> nothing to land; go to mode 4.
- **`WTB..main` == 0** -> `main` never moved, so no conflict is possible. Skip to the command block; the merge is a plain fast-forward.

### 2. File-level overlap

```bash
git diff --name-only main...WTB   # files the worktree branch touched
git diff --name-only WTB...main   # files main touched
```

The **intersection** goes in the facts block - `none` is the whole entry when it is empty, and an empty intersection means no textual conflict is possible. Then check both lists against the hot files:

`public/locales/{en,de}/translation.json`, barrel `index.ts` files, `src/routes/{routes.ts,lazyPages.ts}`, `src/theme/chartPalette.ts`, `CLAUDE.md`, `.claude/**` (the documentation-drift rule makes most tasks touch one of them).

**A hot file touched by both sides is the finding** (one side alone is a note, never a process violation): a clean `merge-tree` on it means the edits landed far apart, not that they agree - check it semantically in step 5 even when the dry-run is clean.

### 3. Real dry-run

```bash
git merge-tree --write-tree --name-only main WTB
```

In memory: it writes objects but touches no working tree, index, branch or ref, so it is safe at any time. Exit 0 is clean, 1 is conflicts (the paths come first), anything else is an error - report it verbatim.

**Know the limit; report it only when it bites.** `merge-tree` simulates a **merge**, not a rebase. A rebase replays each commit separately, so it can conflict where a single combined merge does not. So:

- `merge-tree` clean -> the `git merge main` route is **guaranteed** clean; the rebase route is very likely clean but not proven.
- `merge-tree` conflicted -> the listed paths are real and the rebase will hit them too, possibly more than once.

Keep the printed tree sha - step 4 compiles it.

### 4. Compile the merged tree - mandatory

`merge-tree` said the merge is textually clean. That is not the same as saying it builds. Build it and find out, before anyone touches a working tree:

```bash
git archive <tree-sha> | tar -x -C "<scratchpad>/merged"
```

Then link the repo's `node_modules` into that directory from the PowerShell tool (Git Bash `ln -s` makes a full copy instead):

```powershell
New-Item -ItemType Junction -Path "<scratchpad>/merged/node_modules" -Target "MAIN/node_modules"
```

and run the checks from Bash in a subshell, with a `timeout` of 600000, awaited to its exit - the chain outlives the default 120 s:

```bash
(cd "<scratchpad>/merged" && npm run type-check -- --force && npm run lint)
```

Both exit codes go in the facts block - and only the codes, unless one is non-zero, in which case the failing output is the report. **When `package.json` is in either step-2 list, the linked `node_modules` is wrong for the merged tree**: a dependency one side added compiles against main's `node_modules` and fails with nothing actually wrong. Say so in the report instead of trusting that result.

**Three hazards, all real.** Remove the link before anything cleans the scratchpad, or a recursive delete follows it into the real `node_modules` - and delete `<repo>/node_modules/.tmp/tsconfig.*.tsbuildinfo` as soon as the two checks report, because the run above leaves the **merged** tree's state in the repo's own cache and the repo's next `type-check` then answers "up to date" against it. Nothing in this step may touch either working tree: the extraction target is the scratchpad, never `WT` and never the main tree. And **`--force` is load-bearing**: through the link both trees share one `tsBuildInfoFile` and `tsc -b` decides by mtime, so without it an older merged tree compiles nothing and still exits 0.

**Then the i18n checks - also mandatory, also deterministic:**

```bash
node .claude/skills/integrate-worktree/i18n-merge-check.mjs <merge-base> main WTB <tree-sha>
```

Reads git objects only, writes nothing, exits 1 listing every failure: en/de parity, leaf/node clashes between the two files, the same key added by both sides with different text (git keeps one in silence), and a key one side added that the merge lost.

It reads the JSON, never the code that calls it, so a key one side deleted while the other side's new code calls it passes. Run the repo's own checker against the extracted tree too, **by absolute path** - it takes its repo root from its own file location, so the main tree's copy would check `main`, not the merge:

```bash
node "<scratchpad>/merged/.claude/scripts/i18n-check.mjs"
wc -c < "<scratchpad>/merged/CLAUDE.md"    # budget: under 48 000 bytes
```

`rules-reach` cannot run on the extracted tree - it reads `git ls-files`, and the archive is not a repository - so it runs from WT after the rebase, together with `npm run check`, and a merge that touched `.claude/rules/` or its fixture waits for that result. In the facts block `i18n` is the worse of the merge check's and `i18n-check`'s exits. A merged `CLAUDE.md` over budget is a finding even when each side alone was under it.

If step 3 reported conflicts, the tree it wrote carries conflict markers - do not compile it and do not run the other checks against it. Say so, and let step 5 work from the diffs.

### 5. Semantic pass - always run it

The dangerous case is not the conflict, it is the **clean** merge: both sides edited different files, git says nothing, and something is broken. Delegate this to a subagent so a large diff does not eat the main context.

**Spawn one `general-purpose` agent with no `model` override** - it inherits the session's model, unlike the pinned reviewers - read-only, with both diffs available to it. Never downgrade it: this step exists to catch what nobody read, such as a compiler-setting change inside a commit labelled a formatting sweep, and a smaller model misses exactly that.

**Hand it facts, not a story about the shape of the work.** Paste in the merge-base sha, `git log --oneline` for both directions, and the step-2 intersection. Never say which side is a feature and which is small changes: that is a guess, and a guess in the prompt is a blind spot in the answer.

> Read-only analysis, do not modify any file and do not run any git command that writes.
> Branch `WTB` and branch `main` diverged at `<merge-base>`. Neither side's shape is assumed - here is what each actually contains:
> `main..WTB`: `<git log --oneline main..WTB>`
> `WTB..main`: `<git log --oneline WTB..main>`
> Files touched by both sides: `<intersection, or "none">`.
> The merged tree has already been extracted and checked mechanically: `type-check` `<exit>`, `lint` `<exit>`, i18n merge checks `<exit>`, `i18n-check` `<exit>`. Do not re-derive anything those cover. If they passed, renamed symbols, changed signatures, missing barrel exports and stale call sites are proven clean against the merged content itself - skip them entirely and hunt only what neither a compiler nor a set comparison can see.
> Git will merge these without conflict wherever they touched different files. Find every place where that clean merge would still be **wrong**. Check both directions for each item - either side may be the one that moved something. Specifically hunt for:
>
> - a symbol renamed, moved or deleted on one side, still referenced on the other (grep the whole `src/` tree for the old name, not just the diff);
> - the same constant, helper, type or i18n key introduced independently by both sides;
> - a barrel export or a route path removed on one side and referenced on the other;
> - a changed function signature, prop type or Zod schema whose other-side call sites were not updated;
> - an i18n key whose *English text* one side rewrote while the other side's code still relies on the old wording, or a key both sides worded differently for the same concept under two different paths - the mechanical check above already covers parity, duplicates and outright losses, so only meaning is left here;
> - a shared theme token or color changed on one side and consumed by new code on the other;
> - rule or doc text (`CLAUDE.md`, `.claude/**`) on one side that contradicts code changed on the other side.
>   Report each risk as `file:line` + what breaks + which side to keep. If you find nothing, say so plainly - do not manufacture findings.

### 6. Print the command block

**Symmetric work, asymmetric replay cost.** A rebase replays every commit on `WTB` onto `main`; `main`'s own commits are replayed never - they are just the new base. So the cost of the rebase route tracks `main..WTB` alone, and a conflicted file can resurface once per replayed commit. Twenty commits on `main` and three on `WTB` is a cheap rebase; the reverse is not.

**In this repo that makes rebase the default route.** Integrations are run promptly and branches are not left to accumulate, so `main..WTB` stays small and the replay cost stays near zero. Recommend rebase unless the two numbers in front of you say otherwise:

- **clean dry-run** -> rebase, for linear history, whatever the counts.
- **conflicts, few commits on `WTB`** -> rebase still. The rebase stops on those paths at most once per commit of `git log --oneline main..WTB -- <conflicted paths>` (step 3's limit can add stops elsewhere), so that count, not `main..WTB`, is what "few" measures.
- **conflicts and many commits on `WTB`** -> the branch ran longer than this flow intends; say that plainly rather than only routing around it, then recommend `git merge main` instead: a merge resolves each conflict exactly once, at the cost of a merge commit in the branch - and mode 3's range-diff skips that commit, so on this route the resolution is read with `git show --remerge-diff` (`references/verify.md`).

Treat "few" as a judgement. Explain the route only when you steer away from rebase, in one line naming the counts.

Emit exactly this, with `WT` and `WTB` substituted, and nothing extra - a line that does not fit the owner's terminal goes over as a script with its step list (`references/reporting.md`):

```bash
cd WT
git branch WTB-prerebase          # survives a botched --continue; git rebase --abort does not
git rebase main && npm run check    # or: git merge main
# on conflict: resolve (mode 2), git add + git rebase --continue (merge route: git merge --continue), then re-run the checks
```

The `&&` chain is deliberate: if the rebase stops on a conflict, the checks must not run against a half-rebased tree. If `WTB-prerebase` already exists (a tree kept from a previous cycle, or an aborted attempt), the first line becomes `git branch -f WTB-prerebase` - safe only before the rebase starts, while HEAD still equals the branch tip, and only while every commit of the ref is found on `main` by author, date and subject (the comparison in the note after the mode table) or `git merge-base --is-ancestor WTB-prerebase HEAD` succeeds (an aborted attempt leaves the ref inside the branch). **When every commit of the ref is found in `main..WTB` instead**, this cycle already rebased once and `main` moved again: keep the ref as it is and drop the first line - it holds the original commits, so mode 3's range-diff from it covers both rebases. Otherwise the ref still holds commits `main` lacks - stop and ask the owner.

Then, from the main tree, only after the checks are green:

```bash
git merge-base --is-ancestor main WTB && git merge WTB
# printed nothing? main moved since the rebase - the fast-forward is gone, rebase again
```

The guard turns a `main` that moved after the rebase into a no-op instead of a merge commit nobody intended. Tell the user to merge promptly and keep `main` still until it lands; for UI work, to check the dev server first. When the rebase finishes, go to mode 3 and run its loss checks before the merge.

**No rebase and no merge while a task is running in either tree.** Both trees are clean at this point by precondition and stay that way for the whole cycle: no mid-flight sync into the branch, in either direction. Syncing happens between tasks, which is mode 4. A branch that is not ready to land simply waits.

---

## Mode 2: resolve

A rebase is in progress and stopped on a conflict. **Read `references/resolve.md` and follow it** - the inversion trap (`--ours` is `main`, `--theirs` is the branch being replayed), the per-file procedure, and the commands handed back to the user.

## Mode 3: verify

`WTB-prerebase` exists and `main` is an ancestor of `WTB`, so the rebase (or `git merge main`) happened. **Read `references/verify.md` and follow it** - the two loss checks that must run in the window between the rebase and the merge, the gates, the merge, and when to tear the tree down.

## Mode 4: refresh

`WTB` has no commits of its own and `main` has moved. **Read `references/refresh.md` and follow it** - one printed fast-forward, then the tree starts green.

---

## Several worktrees at once

If more than one candidate tree is in play, read `references/several-worktrees.md` before printing anything: integration order matters and the conflict surfaces grow faster than the tree count.
