# Mode 2: resolve

A rebase is in progress and stopped on a conflict. The boundary in `SKILL.md` holds here too: this mode edits files, and the user runs every git command.

## The inversion trap - state it before anything else

During a rebase git checks out the upstream and replays the branch on top. Therefore:

- `--ours` is **`main`** - the integration target
- `--theirs` is **the `WTB` commit** currently being replayed

The opposite of what the names suggest. This is why the skill never emits those flags: two independent pieces of work almost always need **both** changes, and each flag discards one side wholesale.

## Procedure, per conflicted file

```bash
git -C WT status                                  # conflicted paths
git -C WT diff -- <file>                          # the hunks
git -C WT merge-base main WTB-prerebase          # <merge-base>
git -C WT log -p <merge-base>..main -- <file>                   # what main did
git -C WT log -p <merge-base>..WTB-prerebase -- <file>          # what the worktree branch did
```

With `merge.conflictStyle = zdiff3` (a per-clone setting, `.claude/docs/worktree-flow.md` setup) each hunk also shows the common ancestor between the two sides. Use it: without the base you cannot tell which side changed what. If a hunk shows no `|||||||` base section, the setting is off - read the base with `git show :1:<file>`.

If `WTB-prerebase` was never created, git maintains two refs of its own during a rebase: `ORIG_HEAD` (the pre-rebase tip) and `REBASE_HEAD` (the commit currently being replayed). Substitute `ORIG_HEAD` in the commands above.

Resolve by keeping **both** intents, not by picking a side. Apply the edit with Edit/Write **at the absolute path under `WT`** - except the file types under "Never hand-resolved" below - then hand back:

```bash
git -C WT add <absolute path>
git -C WT rebase --continue
```

`git add` and `git rebase --continue` are the user's to run - `--continue` creates a commit, and the guard hook refuses both from here. The `-C WT` form means they never need a shell inside the worktree. `git rebase --abort` is always available and returns the tree to exactly its pre-rebase state; say so whenever the resolution looks doubtful.

## Never hand-resolved

The guard refuses an Edit of the generated clients and the specs, and the translation files have their own owner. Hand back `git -C WT add` for whatever the step below rewrote.

- **`src/api/<domain>/generated/**`** - `(cd WT && npm run gen:api:<domain>)`, which regenerates one domain from the spec on disk. **`src/api/specs/*.openapi.json`** - `(cd WT && npm run gen:api)`, which first downloads all five specs from the backend (its URL from `WT`'s gitignored `.env`) and then regenerates every client; the result is the backend's current spec, not either side's, and it can move specs neither side touched - check `git -C WT diff --stat` and name every file it changed.
- **`public/locales/{en,de}/translation.json`** - launch the `i18n` agent in `conflict` mode with the absolute `WT` paths of the conflicted files and both sides' hunks; it keeps both sides' keys. The main thread does not resolve them itself.

**When the rebase finishes, go straight to mode 3** - resolve is finished when its loss checks come back clean, not when the rebase completes.
