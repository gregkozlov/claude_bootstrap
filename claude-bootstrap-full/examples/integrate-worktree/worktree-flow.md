> Example from the example app, Stockroom (.claude/docs/worktree-flow.md). Not copied by apply.mjs. The team's hand-run guide beside the integrate-worktree skill, which is canonical for the mechanics.

# Working in two worktrees

How to run two pieces of work in parallel with two git worktrees, and how to land the second one back into `main`.

**The `integrate-worktree` skill is canonical for the integration mechanics** - topology discovery, the dry-run, the merged-tree checks, conflict resolution, the loss checks and refresh. This document is the human side: setup, what to open, the daily cycle, and the rules. If the two disagree, the skill wins.

Placeholders used throughout:

- `<repo>` - the main clone, which always holds `main`.
- `<worktrees-root>/<name>` - the second tree, **outside** `<repo>` (for example `stockroom-wt/wt1` beside `stockroom`).
- `wt/<name>` - the branch checked out in the second tree.

---

## 1. Why two trees

**Two equal trees, each with its own work; `main` is the trunk and the integration target.**

The size of a task is not known in advance and does not shape the scheme. Either tree can hold one big task, a batch of small ones, or small things in both.

The only asymmetry is direction: the tree's branch is replayed onto `main`, never the reverse. It follows from where the branches point, not from what was done on them. Its consequence is in "Rebase cost" below.

---

## 2. Layout

| Tree        | Path                      | Branch      | What happens there                       |
| ----------- | ------------------------- | ----------- | ---------------------------------------- |
| Main tree   | `<repo>`                  | `main`      | its own work, plus integration and merge |
| Second tree | `<worktrees-root>/<name>` | `wt/<name>` | its own parallel work                    |

`main` stays checked out in the main tree for good. Git refuses to check out one branch in two trees. In `git branch`, a branch held by another tree is marked `+`.

---

## 3. Setup

### Create the tree

Run from `<repo>`, in your own terminal:

```bash
git worktree add "<worktrees-root>/<name>" -b "wt/<name>"
```

Put the tree **outside** `<repo>`. Section 8 says why.

### Copy the gitignored files

A new tree is built from git, so nothing gitignored arrives in it. Copy these by hand:

- `.env` - dev API base and the build-time map token.
- `package-lock.json` - gitignored in this repo, and `npm ci` needs it.
- `.claude/settings.local.json` - your personal allow-list, `additionalDirectories` and the optional Stop gate.
- `.vscode/settings.json` - if you use VS Code; `.vscode/*` is gitignored.

Then install, with the tree as the working directory:

```bash
(cd "<worktrees-root>/<name>" && npm ci)
```

**`npm ci` is also what arms the commit hook.** `core.hooksPath = .husky/_` sits in the shared git config, but only `.husky/pre-commit` is tracked. `.husky/_` is husky's generated, self-ignored folder. Until `npm ci` runs `prepare: husky`, a commit in the new tree silently skips `lint-staged` and `type-check`.

### Fix the copied `settings.local.json`

**The main tree's copy points the wrong way for the second tree.** Edit it after copying:

- **Main tree:** `permissions.additionalDirectories` lists `<worktrees-root>`, the parent folder. The main session can then read and edit every worktree, and a future third tree is covered at once.
- **Second tree:** `permissions.additionalDirectories` lists `<repo>`. Skills that read a file only the main tree has need it. Example: `fix-improvements` reads its backlog from `<repo>/localDocs/`, which is gitignored and never copied.

The backlog cannot be copied instead. Its claim markers work only while every session edits the same file.

Both lists are read at session start.

**The copy does not stay in sync, and a stale copy is worse than none.** A tree left with an old copy runs with no Stop gate and with grants the main tree has since removed. Whenever you change the allow-list or the hooks in the main tree, copy the file again and fix `additionalDirectories` again.

The Stop gate registration is in `.claude/hooks/README.md`. `gate-registered.mjs` warns at session start in a tree that has none.

### Git config, once per clone

Git config is shared by every tree of the clone, so set these once:

```bash
git config merge.conflictStyle zdiff3   # a conflict hunk also shows the common base
git config rerere.enabled true          # when a conflict can recur - see section 8
```

Without `zdiff3` a conflict shows only the two sides, and you often cannot tell who changed what.

### What the second session gets for free

Tracked files arrive with the tree: `CLAUDE.md`, `.claude/rules/`, `.claude/agents/`, `.claude/skills/`, `.claude/settings.json`, `.claude/docs/`.

What it does not get:

- **Claude Code memory.** It is keyed by the project path, so the second tree has its own, empty memory folder.
- **Skills and rules changed on `main` since the branch point.** They arrive only when the branch absorbs `main` (step 3 or refresh).

---

## 4. What to open

**Two Claude Code sessions, one per tree.** The form does not matter; the binding to the directory does.

The minimum is two terminals:

```
terminal 1:  cd <repo>                      -> claude
terminal 2:  cd <worktrees-root>/<name>     -> claude
```

**Start the second session in the tree's own directory.** Never call `EnterWorktree` from the main session. It moves that session's working directory, and the main tree is left with no session at all.

**If you read diffs in an IDE, open two windows, one per folder.** Git integration, the file tree and search are all bound to the folder root. One window does not cover two trees properly.

**Each tree needs its own dev server.** A server started in the main tree does not see the second tree's changes. The Vite config sets port `5173` without `strictPort`, so a second server takes the next free port. `node .claude/scripts/dev-servers.mjs` lists which port serves which tree (Windows only).

**Give each window a distinct colour** (for example with a workspace colour extension), so a glance tells the trees apart.

### VS Code: a foreign repository in Source Control

**By default VS Code can show the other tree's repository in the Source Control panel, with its own Commit button.** `git.autoRepositoryDetection: true` also detects repositories from open editors. Open one file from the other tree, and you can commit into the wrong branch from the wrong window.

This is not worktree detection: `git.detectWorktrees` is `false` by default.

One setting is not enough. It stops only *new* detection. A repository already registered in a window survives a reload, because it lives in that window's saved state. So do both:

1. Once in each window: command palette, `Git: Close Other Repositories` (undo with `Git: Reopen Closed Repositories`).
2. In each tree's `.vscode/settings.json`:

```json
{
  "git.autoRepositoryDetection": "subFolders",
  "git.ignoredRepositories": ["<path of the other tree>"]
}
```

When you add a tree, add its path to every other tree's `ignoredRepositories`. `.vscode/` is gitignored and does not travel.

---

## 5. The daily cycle

The cheat sheet in section 12 lists each command with the directory it runs from.

### Step 0. Check the state (from the main tree)

```bash
git worktree list                                          # both trees, both branches
git status -sb                                             # main tree clean
git -C "<worktrees-root>/<name>" status --porcelain        # empty = second tree clean
```

### Step 1. Assign the tasks

**Split by files, not by topic.** Hot files (section 9) conflict almost every time.

There is no fixed rule about which tree gets a hot file. The tree is chosen before anyone knows what the task will touch.

One fact helps when choosing. `main`'s commits are never replayed, while a hot-file conflict on the branch side can resurface on every replayed commit. So, all else equal, a hot-file edit is cheaper on `main`.

### Step 2. Work in parallel

- **Main session:** one task at a time. You review and commit on `main`. The tree is clean between tasks.
- **Second session:** one task at a time. You commit on `wt/<name>`. WIP commits are fine.

Neither tree is "for small things" or "for the big one". What matters is that **branches do not pile up commits**: integration runs promptly, so `main..wt/<name>` stays short. That is what keeps the rebase cost near zero.

**Committing is mandatory, not optional.** Every integration check reads commits only. Uncommitted work does not exist for `merge-tree`, `git diff main...wt/<name>` or `rev-list`, so the skill reports "clean" while your edit conflicts. And `git rebase` refuses to start on a dirty tree.

Sessions never commit (see `CLAUDE.md`). You review and commit in each tree yourself.

The `pre-commit` hook runs `lint-staged` plus a full `npm run type-check` in both trees, so a commit is not instant.

**No merge and no rebase while a task is running, in either direction.** Merging `main` into the branch mid-task changes files under a working agent - exactly the interference the scheme exists to avoid. `main`'s commits wait until step 3. The tree is synced only **between** tasks (step 6).

### Step 3. Integrate (from the main session)

Both trees clean, both tasks committed. In the main session, invoke the skill:

```
/integrate-worktree
```

It finds the topology, picks the mode, runs the dry-run and the checks on the merged result, and prints a command block. **It never runs a merge, a rebase or a commit itself.** You run the block in the second tree's terminal.

The block creates a safety ref first, `wt/<name>-prerebase`. Two reasons:

- During a rebase, `git rebase --abort` restores the exact starting state. After the rebase completes it no longer can; `git reset --hard wt/<name>-prerebase` still can.
- The loss checks in step 5 compare the replayed commits against it. Without it there is nothing to compare with.

The rebase and the checks are chained with `&&` deliberately. If the rebase stops on a conflict, the checks must not run against a half-rebased tree.

#### Rebase cost

**The work is symmetric; the replay cost is not.** A rebase replays only the branch's commits. `main`'s commits are never replayed - they are simply the new base.

So the cost depends on `main..wt/<name>` and nothing else. One big task in one commit rebases **more cheaply** than five small ones in the same tree. Five small ones on `main` cost nothing.

That is why rebase is the default route. The skill recommends `git merge main` only when conflicts meet a long branch, and says so plainly. A merge resolves each conflict once; a rebase can present the same conflict on every replayed commit.

### Step 4. If the rebase stops on a conflict

**From the same main session**, invoke `/integrate-worktree` again. It sees the unfinished rebase, enters resolve mode, and edits the conflicted files in the second tree by absolute path.

You then run the commands it prints, typically:

```bash
git -C "<worktrees-root>/<name>" add <absolute path>
git -C "<worktrees-root>/<name>" rebase --continue
```

`--continue` creates a commit, so it is yours to run. With `-C` you need no shell inside the tree.

**The main trap: the sides are inverted during a rebase.** `--ours` is `main`, the integration target. `--theirs` is the branch commit being replayed. That is the opposite of what the names suggest.

**So never use `--ours`, `--theirs`, `-X ours` or `-X theirs`.** Two independent pieces of work almost always need both edits. Each flag takes one side wholesale and silently drops the other.

Resolve by keeping **both** intents. Some files are never resolved by hand (generated API clients, the OpenAPI specs, the translation files); the skill routes them to their generator or to the `i18n` agent.

If the ref `wt/<name>-prerebase` was never created, git keeps `ORIG_HEAD` (the tip before the rebase) during a rebase. Use it in its place.

### Step 5. Prove nothing was lost, then land (from the main session)

**The loss checks run before the merge, never after.** When the rebase finishes, invoke `/integrate-worktree` again; it enters verify mode and runs them.

A finished rebase is not the same as a rebase that kept both sides. Each resolved conflict is a hand edit, and a hand edit can drop an intent silently. The build stays green, no test is guaranteed to cover the dropped intent, and the feature is simply gone.

Nothing downstream catches that - not `type-check`, not `lint`, not a semantic pass that reads the two sides rather than the result.

**Both loss checks read `main..wt/<name>`, which is empty once the merge lands.** Run afterwards, they compare nothing and exit 0 - a false green.

If a check finds a loss, `git rebase --abort` is gone, because the rebase finished. The recovery point is `wt/<name>-prerebase`, which still holds the original commits.

**Then land it.** After green checks, the loss checks, and for UI work a look at the second tree's dev server, run from the main tree:

```bash
git merge-base --is-ancestor main wt/<name> && git merge wt/<name>
# printed nothing? main moved after the rebase - the fast-forward is gone, rebase again
git branch -D wt/<name>-prerebase   # only after the merge is verified
```

**The merge is a fast-forward only while `main` has not moved since the rebase.** So merge at once, and do not start a new task on `main` between step 3 and step 5.

The guard in front is not decoration. With both trees active, a commit landing on `main` inside that window is normal. The guard turns it into a no-op instead of an unplanned merge commit.

The main tree must be clean for the merge.

After the rebase the safety ref shows up as a separate line in a graph view: same message, different commit. That is expected. It needs `-D`, not `-d`, because its commits are not ancestors of `main`.

### Step 6. Between tasks: keep the tree

**Leave the second tree in place by default.** After the fast-forward, `wt/<name>` equals `main`. The tree is clean and ready for the next task, with no new install and no copying.

Before the next task starts there, bring it up to date if `main` has moved. Invoke `/integrate-worktree` from the main session; on a tree with no commits of its own it enters refresh mode and prints the fast-forward:

```bash
git -C "<worktrees-root>/<name>" merge main
```

`git branch -f wt/<name> main` from the main tree does **not** work here. Git refuses to force a branch that is checked out in another tree.

If `package.json` changed, the refresh also needs a reinstall. The lockfile is gitignored, so the tree keeps its old copy and `npm ci` refuses it. Copy `main`'s lockfile in first; the skill prints the exact commands.

---

## 6. Rules that must not be broken

1. **Start the second session in its own directory.** `EnterWorktree` moves the current session and leaves `main` without one.
2. **Commit before integrating.** Otherwise every check lies and the rebase does not start.
3. **Both trees clean before step 3.** A dirty `main` means an unfinished task; integrating is premature.
4. **Never `--ours`, `--theirs`, `-X ours` or `-X theirs`.** During a rebase they mean the opposite of their names, and each drops one side.
5. **`/integrate-worktree` runs only from the main session, in every mode.** Its permissions reach the other tree, and the final merge runs where `main` is checked out.
6. **Loss checks before the merge.** After it they compare nothing and report green.
7. **Merge right after green checks.** Otherwise the fast-forward is lost.
8. **No sync while a task runs.** The tree is refreshed only between tasks.
9. **Never `git push` a `wt/*` branch.** These branches are local and never leave the machine.
10. **Never `cd` in a session's command chain.** The working directory persists across calls and into the other tree, so one `cd` retargets every later relative path. Sessions use absolute paths, `git -C <tree>`, or a subshell `(cd <tree> && ...)`.

---

## 7. How a worktree works

A worktree is a directory whose `.git` is a file, not a folder. It holds one line: `gitdir: <repo>/.git/worktrees/<name>`. The object database is shared.

- **Per tree:** working files, `HEAD`, the index, `git status`.
- **Shared by the clone:** objects, branches and tags, `git config` (so `rerere.enabled` and a repo-level `merge.conflictStyle` too), stash, the `rerere` cache, hooks.
- One branch cannot be checked out in two trees.
- Gitignored files do not carry over - a tree is created from git.

**A commit on `main` is not "pushed" into the tree.** There is no exchange between trees at all.

Because the object database is shared, a fresh `main` commit is visible in the second tree at once - `git log main` works there. But it does not reach that tree's working files; those come from `wt/<name>`. The file arrives in step 3, when the branch absorbs `main`.

**Only two kinds of command care about the directory:**

- `npm` needs the tree as its working directory.
- `git merge` and `git rebase` run where the target branch is checked out.

Everything else runs from anywhere. `git -C <path>` behaves as if git were started in that directory.

---

## 8. Deliberately not done

- **The second tree does not live inside the repo.** A nested tree would resolve `node_modules` upward and save an install. But `npm run lint` in `main` would then fail on the other task's code (`--max-warnings 0`), `git status` would show the tree as untracked, and one shared dependency tree means a dependency task in `main` shifts versions under the running work. Avoiding that needs edits to the team's `eslint.config.mjs` and `.gitignore`.
- **The built-in `.claude/worktrees/` location is not used either.** It saves the `.gitignore` edit (the `.claude/*` rule covers it) but not the eslint one: eslint does descend into dot folders.
- **Nothing to "share" by nesting.** `CLAUDE.md`, skills, agents, rules and `settings.json` are tracked and already in every tree.
- **`rerere` is enabled wherever a conflict can recur - and that is two cases, not one.**
  - Several trees: merge one, rebase the others, and the same conflict resurfaces on each remaining branch.
  - One tree: a rebase replays commits one by one, so a file that conflicts on commit 2 conflicts again on commit 5. `rerere` replays your earlier resolution instead of asking twice.
  - It pays nothing only with one tree and one commit on the branch.
- **`eslint.config.mjs` is not edited.** That is needed only for a tree inside the repo.
- **`worktree.baseRef` is not touched.** Trees branch by hand from the main tree's `HEAD`. The setting affects only `EnterWorktree`, which by default branches from `origin/main`.
- **No wrapper script over the cycle.** The skill prints the commands; you run them.
- **A long task is not given to a subagent with `isolation: "worktree"`.** It cannot ask a clarifying question an hour into the work. And its result stays in a foreign tree, where new files are untracked and `git diff` does not show them.

---

## 9. Hot files

These conflict almost every time:

- `public/locales/{en,de}/translation.json`
- barrel `index.ts` files
- `src/routes/{routes.ts,lazyPages.ts}`
- `src/theme/chartPalette.ts`
- `CLAUDE.md` and `.claude/**` - the documentation-drift rule makes most tasks touch one of them

They are not pinned to a tree by rule; step 1 explains why `main` is the cheaper side, all else equal.

**A hot file touched by one side is a note; touched by both sides, it is a finding.** The skill checks the second case semantically even when the dry-run is clean.

A clean merge of a hot file usually means the edits landed far apart, not that they agree. Example: both sides added keys to both translation files, in different namespaces hundreds of lines apart, and git merged them silently. That was distance, not compatibility.

---

## 10. More than one extra tree

**Do not add one by default.** The bottleneck is your review, not compute: you read two hour-long diffs one after another anyway.

And the integration cost grows faster than the tree count. Two branches give three conflict surfaces (each with `main`, and with each other), and the third appears only after the first merge.

**When it is justified:**

- **Competing variants.** Several implementations of one thing; you keep the best and delete the other trees. No merge at all, nothing fragile. The best use of worktrees.
- **Provably disjoint areas.** Checked against section 9 and by directory before starting.
- **A parked task.** Blocked on the backend or a customer answer; an idle branch costs nothing.

**When it does harm:** a sweeping edit, such as a reformat across hundreds of files. Do that alone, in `main`, when nothing else is in progress.

**If you add one,** repeat section 3 for it, and add its path to every other tree's `git.ignoredRepositories`.

**Integrate strictly one branch at a time**, each through the full cycle, smallest overlap first. The skill orders them when it finds several.

`rerere` ("reuse recorded resolution") records a conflict's fingerprint and **your** resolution, and replays it on an identical conflict. Notes:

- The cache is in `.git/rr-cache/`, shared by every tree.
- It fires only on an **identical** conflict; one changed context line is a miss.
- Keep `rerere.autoUpdate` at its default `false`. The content is filled in but left unstaged, so you look at it before adding.
- Inspect with `git rerere diff`; drop a bad one with `git rerere forget <path>`.
- The risk: it can replay a resolution that was right last time and wrong now. `autoUpdate: false` exists for exactly that.

---

## 11. Teardown

Remove a tree only when no parallel work is expected for a while. You run these, from the main tree:

```bash
git worktree remove "<worktrees-root>/<name>"
git branch -d wt/<name>
```

**Before `worktree remove`, close everything whose working directory is inside the tree** - the Claude Code session, terminals, the dev server. Windows refuses to delete a live process's working directory, and the command fails with Permission denied.

**Never delete the folder from the file explorer.** That leaves an entry in `.git/worktrees/`, which only `git worktree prune` clears.

---

## 12. Cheat sheet

Every command here is yours to run. A session only analyses and prints them.

| When                                | Command                                                                                                         | From                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------- |
| check both trees are clean          | `git status -sb`<br>`git -C "<worktrees-root>/<name>" status --porcelain`                                       | main tree               |
| before a new task in the tree       | `git -C "<worktrees-root>/<name>" merge main`                                                                   | main tree               |
| integrate, resolve, verify, refresh | `/integrate-worktree`                                                                                           | main-tree session       |
| safety ref before the rebase        | `git branch wt/<name>-prerebase`                                                                                | **inside the tree**     |
| rebase and checks                   | `git rebase main && npm run check`                                                                              | **inside the tree**     |
| conflict: continue                  | `git -C "<worktrees-root>/<name>" add <absolute path>`<br>`git -C "<worktrees-root>/<name>" rebase --continue` | main tree               |
| conflict: back out                  | `git -C "<worktrees-root>/<name>" rebase --abort`                                                               | main tree               |
| land                                | `git merge-base --is-ancestor main wt/<name> && git merge wt/<name>`                                            | **main tree**           |
| drop the safety ref                 | `git branch -D wt/<name>-prerebase`                                                                             | any tree, after landing |

Two traps in this table:

- **`git branch wt/<name>-prerebase` takes the `HEAD` of the directory it runs in.** Run from the main tree, the ref lands on `main`, and a reset to it destroys the tree's work instead of saving it. From the main tree you would have to name the start point: `git branch -f wt/<name>-prerebase wt/<name>`. If the ref already exists from an earlier cycle, let the skill decide whether `-f` is safe.
- **The loss checks read `main..wt/<name>`, which is empty after landing.** Run after the merge, they compare nothing and exit 0.

Rarer operations are elsewhere: adding a tree in section 3, removing one in section 11. The skill runs the diagnostic `diff`, `merge-tree` and loss checks for you.
