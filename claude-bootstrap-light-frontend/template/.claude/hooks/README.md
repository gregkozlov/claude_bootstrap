# hooks

Two hooks, both registered in `.claude/settings.json` beside the deny list - or in `.claude/settings.local.json` when a personal layer sits beside a tracked team `settings.json`: `guard.mjs` below, and `upkeep-nudge.mjs` (end of this file). `guard.mjs`, registered as `PreToolUse`, reads one JSON payload on stdin and exits 2 with the reason on stderr to block the call, 0 to allow it. **A guard that cannot parse its input allows the call**: it is a backstop, never a security boundary. Node 18+, no dependencies.

## What it refuses

**Bash / PowerShell**

- A git verb that commits, stages, publishes or discards work - wherever a shell runs git, judged on the words it receives (a quoted `-C "D:/Work Projects/x"` is one word): at command position behind `git -C` or `git -c`, a wrapper, `npx` or a launcher (`xargs`, `find -exec`, `Start-Process`), inside `$(...)`, `cmd /c`, a `bash -c` / `iex` body, as a quoted full path to the binary; and anywhere inside code an interpreter runs (a `node -e` / `python -c` / `perl -e` one-liner, a script fed on stdin or piped into `bash`). Git words in an argument are text (`echo "never git push"`). `git stash` is judged by an allow list (`list`, `show` pass); `git send-email`, `subtree` writes, `lfs push` / `migrate` (not `lfs pull`) and a `fetch` into a local branch count too. A tool that commits or tags through git: `npm` / `pnpm` / `yarn version` (unless `--no-git-tag-version`), `release-it`, `standard-version`, `semantic-release`, `lerna version` / `publish`, `changeset publish`. A read git verb that runs a program or writes a file - `git grep -O<cmd>` / `--open-files-in-pager`, any verb's `--output=<file>` - which the read-only `git diff:*` / `git log:*` / `git show:*` allow entries would otherwise approve with no prompt. A `gh` call that writes.
- A write into the tree from the shell: an in-place edit (`sed -i`, `prettier --write`, and other stacks' formatters - `black`, `ruff format`, `gofmt -w`, `go fmt`, `dotnet format`, `cargo fmt` and the like, unless a check flag keeps them read-only; a project's own task such as `./gradlew spotlessApply` passes), sed's `w` command, a redirect, `Set-Content` / `Add-Content` / `Out-File` (or, in PowerShell, `sc` / `ac`) whose target is a project path, a copy or move whose destination is inside the project, an interpreter one-liner, or a script an interpreter reads on stdin (`python - <<'EOF'`), that opens a file for writing (pathlib's `write_text` included). sed's `e` command runs a shell and is always refused. A Bash variable a leading statement sets to a literal (`O="/tmp/out"; cp a "$O/b"`) is judged as that literal, and one set from `mktemp` (`T=$(mktemp); npm ls > $T`) or PowerShell's `New-TemporaryFile` as scratch; one the rest of the command may rebind stays unresolved and is refused. A heredoc body no shell reads (`cat > /tmp/x <<'EOF'`, `python3 - <<'EOF'`, `psql <<'SQL'`) is not judged as commands; one a shell reads is.
- A delete beyond the one grant: one non-recursive project path per call (cmd's `/s` counts as recursive, clustered as `/s/q` too), never a `PROTECTED_PATHS` match, `.git`, `.claude/hooks/**` or `.claude/settings*.json`.
- A `cd` outside a Bash subshell - the working directory persists across calls, so one `cd` retargets every later relative path. The refusal names the retry form for its shell.
- Every command is judged twice, as written and with its shell comments blanked, so a `# it's` comment cannot hide a later line.

**Edit / Write / MultiEdit / NotebookEdit**

- A `file_path` matching `PROTECTED_PATHS` (top of `guard.mjs`; case-insensitive on Windows and macOS): the generated and externally owned files, filled at install (`INSTALL.md`). A placeholder left unfilled reads as an empty list and protects nothing, and a misfilled one is named in one stderr line and reads as empty too - the other checks still work.
- Any written line carrying an en dash (U+2013) or an em dash (U+2014) (`DASH`); every other dash-like character passes.
- Files outside the project are never checked: a scratchpad script or a memory file may contain anything.

**Why both a deny list and a hook.** The `deny` list in `.claude/settings.json` matches the raw command string only: `git -C <path> commit`, a quoted full path to the binary and a git call inside an interpreter one-liner all walk past it. The guard catches those forms. Both are backstops behind the rule in `CLAUDE.md`, which is why no `node -e` / `python -c` grant may go into an allow list - it would open the one-liner door the guard has to close.

## Self-test

```bash
node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs
```

Every case line must read `ok`, and each suite ends with `N passed, 0 failed`. **The shell suite needs the source-directory placeholder filled first** (the install does it): it builds its paths from that value, and an unfilled `<...>` reads as a redirect, so an unfilled copy fails the cases built from it, with nothing wrong with them. `guard-test.mjs` is meaningful from the first minute: its only placeholder paths are the fence cases, and the unfilled guard carries the same placeholder, so they still match. Once the source directory is filled in `guard.mjs`, it is filled in those cases too, or the probe case fails. The suites cover the git verbs behind `-C` / `-c`, `git stash`, read git that runs or writes, interpreter one-liners, `gh`, leading-literal variables, `sed -i`, heredocs and `tee` by target, a copier's source versus its destination, the delete grant and its cap, `cd` outside a subshell, a comment hiding a later line, and dashes in `Edit` / `Write` / `MultiEdit` / `NotebookEdit`. Add one case per entry in `PROTECTED_PATHS` - `guard-test.mjs` carries two commented lines showing the shape; the matching itself, case folding and a misfilled list are tested on two temp copies of the guard with a known list.

Run them after every change to `guard.mjs` or to `PROTECTED_PATHS`. A misfilled `PROTECTED_PATHS` only empties that list, but any other regex that does not compile takes the whole hook down, and a hook that crashes lets every call through.

## Switching a rule off

A rule lives in up to four places - the `CLAUDE.md` text, a `guard.mjs` check, `settings.json` entries and the test cases. Remove all of them together, or the rule half-holds and the agent argues with it.

- **The never-commit policy** (the one the install asks about):
  - The layer's `CLAUDE.md` (at the root, or inside `.claude/` in a personal layer): the "Version Control - Never Commit or Push" section, all but its `Layer tracking` line.
  - `.claude/settings.json` (or `settings.local.json`, wherever the install registered the layer): every `Bash(git ...)` and `PowerShell(git ...)` entry under `permissions.deny`.
  - `guard.mjs`: the `deny(...)` calls behind the `gitWrites`, `releaseWrites` and `ghWrites` checks in the per-segment loop, and behind `gitWritesAnywhere` for a script read on stdin; the lists they read (`GIT_WRITE_VERBS`, `GIT_WRITE_SUBCOMMANDS`, `RELEASE_TOOL`, `GH_MUTATING`) can go once nothing else reads them. Keep the `gitReadEscapes` check: it stops `git grep -O<cmd>` from running a program, which has nothing to do with committing.
  - `tests/guard-shell-test.mjs`: the git, release-tool and `gh` cases marked `(deny)`, which now fail.
- **The `cd` rule:**
  - `CLAUDE.md`: the "Never `cd` in a command chain" bullet.
  - `guard.mjs`: the `if (CHDIR.test(head))` block and the `CHDIR` constant. No `settings.json` entry belongs to it.
  - `tests/guard-shell-test.mjs`: the `cd`, `Set-Location` and `pushd` cases marked `(deny)`.
- **The dash rule has no off-switch.** The layer's own files and the guard's messages rely on plain hyphens, so it stays on in every install.
- **The whole hook**: remove the `PreToolUse` block from `.claude/settings.json`. What remains is the deny list, which matches the raw command string only (see "Why both a deny list and a hook"), and nothing at all is left against shell writes into the tree.

A new rule goes in with a test case in the same change. The guard is regex over shell text: a rule with no test is a rule that works until the first quoted path.

## upkeep-nudge.mjs - the upkeep reminder

Registered as `SessionStart` (startup, clear). Reads the date in `.claude/.last-maintain` (gitignored, one `YYYY-MM-DD` line, written by `maintain-ai-layer`, its `init` run included) and, when it is 30 days old or more, more than a day ahead, missing or unreadable, hands the model a line telling it to tell the user once that `/maintain-ai-layer` (its default `deep` mode) is due - never to start it. Silent in a linked worktree (the nearest `.git` is a file), since the pass runs in the main tree. It reports and never blocks, and costs tokens only on the day it speaks. Self-test: `node .claude/hooks/tests/upkeep-nudge-test.mjs`, every line `ok`.
