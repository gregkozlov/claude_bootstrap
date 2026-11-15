# hooks

Three hooks, all registered in `.claude/settings.json` (tracked - repo policy, like the deny list beside them): `guard.mjs` and `backend-guard.mjs` as `PreToolUse`, and `upkeep-nudge.mjs` (end of this file). A `PreToolUse` hook reads one JSON payload on stdin and exits 2 with the reason on stderr to block the call, 0 to allow it; `backend-guard.mjs` has a third answer, a question to the user (below). **A guard that cannot parse its input allows the call**: each is a backstop, never a security boundary. Node 18+, no dependencies - the hooks are Node scripts whatever language the service is written in.

`guard.mjs` is the same file in every layer of this bootstrap and knows nothing about servers; `backend-guard.mjs` holds what a server codebase adds. Keep them apart: a new check about files and git goes into the first, one about data, secrets or the outside world into the second.

## guard.mjs - what it refuses

**Bash / PowerShell**

- A git verb that commits, stages, publishes or discards work - wherever it sits in the command: behind `git -C` or `git -c`, inside `$(...)`, `xargs`, `cmd /c`, a quoted full path to the binary, an interpreter one-liner or a `bash -c` / `iex` body. `git stash` is judged by an allow list (`list`, `show` pass). A read git verb that runs a program or writes a file - `git grep -O<cmd>` / `--open-files-in-pager`, any verb's `--output=<file>` - which the read-only `git diff:*` / `git log:*` / `git show:*` allow entries would otherwise approve with no prompt. A `gh` call that writes.
- A write into the tree from the shell: an in-place edit (`sed -i`, `Set-Content`), a redirect whose target is a project path, a copy or move whose destination is inside the project, an interpreter one-liner, or a script an interpreter reads on stdin (`python - <<'EOF'`), that opens a file for writing. A Bash variable a leading statement sets to a literal (`O="/tmp/out"; cp a "$O/b"`) is judged as that literal; one the rest of the command may rebind stays unresolved and is refused.
- A delete beyond the one grant: one non-recursive project path per call (cmd's `/s` counts as recursive, clustered as `/s/q` too), never a `PROTECTED_PATHS` match, `.git`, `.claude/hooks/**` or `.claude/settings*.json`.
- A `cd` outside a Bash subshell - the working directory persists across calls, so one `cd` retargets every later relative path. The refusal names the retry form for its shell.
- Every command is judged twice, as written and with its shell comments blanked, so a `# it's` comment cannot hide a later line.

**Edit / Write / MultiEdit**

- A `file_path` matching `PROTECTED_PATHS` (top of `guard.mjs`): the generated and externally owned files, filled at install (`INSTALL.md`). A placeholder left unfilled reads as an empty list and protects nothing - the other checks still work.
- Any written line carrying an em dash, en dash or their relatives (`DASH`).
- Files outside the project are never checked: a scratchpad script or a memory file may contain anything.

Three things in it come from the layers it is shared with and do nothing useful here: the write fence that keeps `hunt` to a compile probe (`FENCED_AGENTS`) only narrows `hunt`'s Bash movers, since `hunt` has no Edit or Write in this layer; the one dependency folder a shell mover may touch is the JavaScript one; and the in-place formatters it refuses are the JavaScript ones. A formatter of another stack that rewrites files passes it - `CLAUDE.md` Code Style says who runs the formatter.

## backend-guard.mjs - what it refuses, and what it asks about

It answers a call in one of three ways: it allows it, it refuses it (exit 2), or it **asks the user** - it prints a `permissionDecision` of `ask`, and the user sees a permission prompt with the reason. A refusal anywhere in a call outranks a question.

**Secret files - refused.** An env file (`.env`, `.env.local`, `.env-production`, `prod.env`), a private key or keystore, an ssh key, cloud, registry and git credentials, a `secrets` or `credentials` file, terraform state, plus the project's own list (`SECRET_RAW`). What stays readable: a name that says it is an example (`.env.example`, `.env.local.example`, `.env.sample`, `.env.template`, `.env.dist`, `example.env`), a `.pem` or `.key` whose name says it is public (`ca.pem`, `jwt_public.pem`, `fullchain.pem`), a `.pub` key, `known_hosts`, and a `secrets.yaml` under a chart's `templates/`. An env file with no secret in it that the project tracks on purpose (`.env.test`) is still refused until its line in `SECRET_PATHS` is narrowed.

- `Read` of one, `Grep` with one as its `path` or `glob` (a wildcard or a brace that reaches one counts: `.env*`), and `Edit` / `Write` / `MultiEdit` of one - inside the project or outside it.
- A shell command that prints or copies one: a reader (`cat`, `head`, `grep`, `sed`, `Get-Content`, `tar`, `cp`, ...) with the file or a glob that reaches it after it, at any depth - inside `$(...)`, a `bash -c` body, a `find -exec` - and `git show` / `git diff` / `git log -p` of one. A searcher's pattern, an `--exclude` and a copy's destination are not reads: `grep "\.env" app`, `rsync --exclude .env`, `cp .env.example .env` (which `guard.mjs` refuses for its own reason, as a shell write into the tree). `< file` on stdin counts.
- **A recursive `grep` over a folder that holds one** (`grep -rn KEY .`): it does not read the ignore file and would print the env file's lines. `git grep`, the Grep tool, a named sub-folder and an `--exclude` pass.
- Loading one into a process prints nothing and passes: `. ./.env`, `docker compose --env-file .env`.

**Frozen files - refused.** A path matching the frozen list (`FROZEN_RAW`: the migration files) **that git already tracks**:

- `Edit` / `Write` / `MultiEdit` of it, and a shell delete or move of it, of its folder or of a glob that reaches it. The agent neither commits nor stages, so whatever git tracks the owner put there; a migration the task itself created is not tracked yet and stays editable, and a new file in the folder is always allowed.
- A migration committed on the working branch and never applied anywhere reads as frozen too: the owner changes that one.

**Commands that leave the machine - refused.** One built-in list (`FORBIDDEN`), plus the project's own (`FORBIDDEN_RAW`):

- **deploy and infrastructure**: `kubectl` and `helm` verbs that change a cluster, `terraform` / `pulumi` apply and destroy, `ansible-playbook` without `--check`, the write verbs of the cloud CLIs (an upload to a bucket included, a download not), and the deploys of the common deploy and hosting tools.
- **publish**: an image push, a package publish (npm, PyPI, crates, gems, Maven, Gradle, sbt, NuGet, Hex), a release.
- **What passes**: a command carrying `--dry-run`, and a command aimed at this machine by its own words - `--endpoint-url` on localhost (an emulator), the `gcloud` emulators, `--context` naming a local cluster (`kind-*`, `k3d-*`, `minikube`, `docker-desktop`), an image push to a registry on localhost. A `kubectl apply` that names no context is not known to be local and is refused.
- The lists are closed: a deploy tool they do not name, and a task-runner target that wraps one, go into the project's forbidden list.

**Commands that destroy data - the user is asked.** `docker compose down -v`, a volume or system prune, `DROP` / `TRUNCATE` / a `DELETE` or `UPDATE` with no `WHERE` handed to a database client (`-c`, a pipe from `echo`, a heredoc), a cache flush, and the migration tools' wipe commands (`migrate reset`, `migrate:fresh`, `db:reset`, `flush`, `downgrade base`, `database drop`, `database update 0`, `down -all`, `clean`). A step back by one migration passes with no question. The prompt is the owner's "yes, I asked for exactly that" - and with nobody to answer it (a headless run), the call is refused. `--dry-run` does not skip the question.

**What is not judged.** A segment whose head only searches or prints (`grep`, `echo`, `git`, `cat`, ...), so `grep -n "terraform apply" README.md` is a search; a quoted argument with spaces in it, which is a message, a filter or a name (`-m "drop unused column"`, `-k "publish and not slow"`) unless a shell runs it; a heredoc body, unless a shell or a database client reads it.

**What it cannot see** - it reads the text of the call, so it misses a script file that runs the same command, SQL in a file handed to a client (`-f wipe.sql`), a secret printed from the process environment (`printenv`), a secret reached through a variable or a loop, a tool that parses a key (`openssl rsa -in ... -text`), and a request sent to a shared host. It cannot know which database a connection string points at. Those are `CLAUDE.md` "Data, secrets and the outside world".

## The project lists

`PROTECTED_PATHS` in `guard.mjs`, and `FROZEN_RAW`, `SECRET_RAW` and `FORBIDDEN_RAW` in `backend-guard.mjs`: each a JSON array of regex sources inside a raw string, filled at install, with a regex backslash doubled once as in a `.json` file. An unfilled or empty one reads as an empty list. **The path lists are tested against the absolute path with forward slashes, so an entry matches the path's tail and never starts with `^`** (`"db/migrations/[^/]+\\.sql$"`); a frozen entry names the numbered files only, never a file a new migration has to edit - a master changelog, an include list, a repeatable script. The forbidden list is tested against one command segment with its words joined by single spaces (`"\\bmake\\s+deploy\\b"`) and always refuses - a dry run does not pass it. A list that does not parse makes the hook throw, and a hook that throws allows every call - run the self-tests after every edit.

## Self-test

```bash
node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs && node .claude/hooks/tests/backend-guard-test.mjs
```

Every line must read `ok`. **The guard shell suite needs the source-directory placeholder filled first** (the install does it): it builds its paths from that value, and an unfilled `<...>` reads as a redirect, so an unfilled copy fails the cases built from it, with nothing wrong with them. `guard-test.mjs` is meaningful from the first minute: its only placeholder paths are the fence cases, and the unfilled guard carries the same placeholder, so they still match. Once the source directory is filled in `guard.mjs`, it is filled in those cases too, or the probe case fails.

`backend-guard-test.mjs` runs in three parts: the built-in checks against the installed hook, the three project lists against a copy of the hook with sample values in a throwaway git repo in the temp directory (a frozen file is one git tracks, so the case makes a commit of its own there, never in this tree), and the same copy with the lists unfilled. A case expects `0` (allowed, nothing printed), `2` (refused) or `'ask'` (the user is prompted). It needs `git` on the path.

Add one case per entry of each project list - `guard-test.mjs` carries two commented lines showing the shape, `backend-guard-test.mjs` two more at the end of its first part. Run the suites after every change to a hook or to a list. A regex that does not compile takes the whole hook down, and a hook that crashes lets every call through.

## Turning a rule off

- **The commit ban**: delete the `deny` block in `.claude/settings.json`, the `GIT_WRITE_VERBS` / `GIT_WRITE_SUBCOMMANDS` block in `guard.mjs` (and the `ghWrites` check with it), and the "Never Commit or Push" section of `CLAUDE.md` - all three, or the rule half-holds and the agent argues with it. **With the ban gone the frozen check loses its footing** - it trusts that only the owner commits - so narrow it or drop it too.
- **The punctuation rule**: the `DASH` constant and its use, plus the `Punctuation` section of `CLAUDE.md`.
- **One backend check**: empty its project list and delete its entries from `SECRET_PATHS` or `FORBIDDEN` (one `rule(...)` line each), and the matching bullet of `CLAUDE.md` "Data, secrets and the outside world". To let a file the list calls secret be read (a tracked `.env.test`, a fixture key), narrow that one pattern. To stop the question on data commands, delete the `data` rules; to make them refusals instead, change `ask(label)` into a `deny(...)` in `checkSegment`. A project that deploys from the agent's session on purpose deletes the `deploy` rules it uses, not the kind.
- **A whole hook**: remove its `PreToolUse` block from `.claude/settings.json`. Without `guard.mjs` what remains is the deny list, which matches the **raw command string** only: `git -C <path> commit`, a quoted full path to the binary and a git call inside an interpreter one-liner all walk past it, and nothing at all is left against shell writes into the tree.

A new rule goes in with a test case in the same change. Both guards are regex over shell text: a rule with no test is a rule that works until the first quoted path.

## upkeep-nudge.mjs - the upkeep reminder

Registered as `SessionStart` (startup, clear). Reads the date in `.claude/.last-maintain` (gitignored, one `YYYY-MM-DD` line, written by `maintain-ai-layer`, its `init` run included) and, when it is 30 days old or more, more than a day ahead, missing or unreadable, hands the model a line telling it to tell the user once that `/maintain-ai-layer` is due - never to start it. Silent in a linked worktree (the nearest `.git` is a file), since the pass runs in the main tree. It reports and never blocks, and costs tokens only on the day it speaks. Self-test: `node .claude/hooks/tests/upkeep-nudge-test.mjs`, every line `ok`.
