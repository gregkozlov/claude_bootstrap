# hooks

One hook: `guard.mjs`, registered as `PreToolUse` in `.claude/settings.json` (tracked - it is repo policy, like the deny list beside it). It reads one JSON payload on stdin and exits 2 with the reason on stderr to block the call, 0 to allow it. **A guard that cannot parse its input allows the call**: it is a backstop, never a security boundary. Node 18+, no dependencies.

## What it refuses

**Bash / PowerShell**

- A git verb that commits, stages, publishes or discards work - wherever it sits in the command: behind `git -C` or `git -c`, inside `$(...)`, `xargs`, `cmd /c`, a quoted full path to the binary, an interpreter one-liner or a `bash -c` / `iex` body. `git stash` is judged by an allow list (`list`, `show` pass). A `gh` call that writes.
- A write into the tree from the shell: an in-place edit (`sed -i`, `Set-Content`), a redirect whose target is a project path, a copy or move whose destination is inside the project, an interpreter one-liner that opens a file for writing.
- A delete beyond the one grant: one non-recursive project path per call, never a `PROTECTED_PATHS` match, `.git`, `.claude/hooks/**` or `.claude/settings*.json`.
- A `cd` outside a Bash subshell - the working directory persists across calls, so one `cd` retargets every later relative path.
- Every command is judged twice, as written and with its shell comments blanked, so a `# it's` comment cannot hide a later line.

**Edit / Write / MultiEdit**

- A `file_path` matching `PROTECTED_PATHS` (top of `guard.mjs`): the generated and externally owned files, filled by the `setup` skill. Before it runs, the unfilled placeholder reads as an empty list and protects nothing - the other checks still work.
- Any written line carrying an em dash, en dash or their relatives (`DASH`).
- Files outside the project are never checked: a scratchpad script or a memory file may contain anything.

Two checks are inert in this layer and kept only so the file stays diffable against the full one: the `hunt` / `integration` probe fence (here `hunt` has no edit tool at all) and the session-ledger rule (no hook writes one).

## Self-test

```bash
node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs
```

Every line must read `ok`. **The shell suite needs the source-directory placeholder filled first** (the `setup` skill does it): it builds its paths from that value, so an unfilled copy fails eight cases that have nothing wrong with them. `guard-test.mjs` carries no placeholders and is meaningful from the first minute. The suites cover the git verbs behind `-C` / `-c`, `git stash`, interpreter one-liners, `gh`, `sed -i`, heredocs and `tee` by target, a copier's source versus its destination, the delete grant and its cap, `cd` outside a subshell, a comment hiding a later line, and dashes in `Edit` / `Write` / `MultiEdit`. Add one case per entry in `PROTECTED_PATHS` - `guard-test.mjs` carries two commented lines showing the shape.

Run them after every change to `guard.mjs` or to `PROTECTED_PATHS`. A regex that does not compile takes the whole hook down, and a hook that crashes lets every call through.

## Turning a rule off

- **The commit ban**: delete the `deny` block in `.claude/settings.json`, the `GIT_WRITE_VERBS` / `GIT_WRITE_SUBCOMMANDS` block in `guard.mjs` (and the `ghWrites` check with it), and the "Never Commit or Push" section of `CLAUDE.md` - all three, or the rule half-holds and the agent argues with it.
- **The punctuation rule**: the `DASH` constant and its use, plus the `Punctuation` section of `CLAUDE.md`.
- **The whole hook**: remove the `PreToolUse` block from `.claude/settings.json`. What remains is the deny list, which matches the **raw command string** only: `git -C <path> commit`, a quoted full path to the binary and a git call inside an interpreter one-liner all walk past it, and nothing at all is left against shell writes into the tree.

A new rule goes in with a test case in the same change. The guard is regex over shell text: a rule with no test is a rule that works until the first quoted path.
