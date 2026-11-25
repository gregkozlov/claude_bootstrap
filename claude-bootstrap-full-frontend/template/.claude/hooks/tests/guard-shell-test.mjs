// Self-test for guard.mjs, Bash / PowerShell payloads: git verbs, read git that runs or writes, gh, movers and the
// delete grant, in-place edits, redirect targets, leading-literal variables, the working directory and comments;
// then the same guard under `--harness codex`, where every shell call is `Bash` and a refusal is JSON on stdout.
//   node .claude/hooks/tests/guard-shell-test.mjs
// Every line must read "ok".
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, '..', 'guard.mjs');
const root = resolve(here, '..', '..', '..');
// Paths outside any project, spelled as this platform spells them: a drive-letter path reads as relative on POSIX.
const WIN = process.platform === 'win32';
const home = WIN ? 'C:/Users/x' : '/home/x';
const temp = WIN ? `${home}/AppData/Local/Temp` : '/tmp';
const S = `${temp}/claude/x/scratchpad`;
// A backslash, built here so no shell or editor mangles the alternation it goes into.
const BS = String.fromCharCode(92);
const rootPath = root.split(BS).join('/');
const parentPath = dirname(root).split(BS).join('/');
const drive = /^([A-Za-z]):/.exec(rootPath)?.[1]?.toLowerCase();
const firstDir = rootPath.replace(/^[A-Za-z]:/, '').split('/').find(Boolean);
const hasParent = dirname(root) !== root;
// A path that climbs back into the project through a folder with a space in its name: cut at the space it reads
// as a sibling of the project, so these cases bite whether or not the root itself holds a space.
const viaSpace = `${parentPath}/a b/../${basename(root)}`;
// A temp tree with two bracketed names, the cwd of the cases that delete them: relative paths, so project paths.
const brackets = mkdtempSync(join(tmpdir(), 'guard-shell-test-'));
mkdirSync(join(brackets, 'blog', '[slug]'), { recursive: true });
writeFileSync(join(brackets, 'blog', '[slug]', 'page.tsx'), '');
writeFileSync(join(brackets, '[id].tsx'), '');

const cases = [
  // git and gh
  ['git status (allow)', 0, 'git status --short'],
  ['git diff piped (allow)', 0, 'git diff --stat | tail -1'],
  ['git commit (deny)', 2, 'git commit -m "x"'],
  ['git -C path commit (deny)', 2, 'git -C D:/other/tree commit -m "x"'],
  ['git -c key commit (deny)', 2, 'git -c user.name=x commit -m "x"'],
  ['git add (deny)', 2, 'git add -A'],
  ['git checkout (deny)', 2, 'git checkout -- src/App.ts'],
  ['git stash (deny)', 2, 'git stash'],
  ['git stash -m pushes (deny)', 2, 'git stash -m x'],
  ['git stash list (allow)', 0, 'git stash list'],
  ['git stash show (allow)', 0, 'git stash show -p'],
  ['git stash pop (deny)', 2, 'git stash pop'],
  ['git merge-base (allow)', 0, 'git merge-base HEAD HEAD'],
  ['git merge-tree (allow)', 0, 'git merge-tree --write-tree --name-only main x'],
  ['git merge (deny)', 2, 'git merge main'],
  ['git merge-file (deny)', 2, 'git merge-file a b c'],
  ['git mergetool (deny)', 2, 'git mergetool'],
  ['git worktree list (allow)', 0, 'git worktree list'],
  ['git worktree remove (deny)', 2, 'git worktree remove ../other-tree'],
  ['git branch listing (allow)', 0, 'git branch --show-current'],
  ['git branch -D (deny)', 2, 'git branch -D feature'],
  ['git push after && (deny)', 2, 'npm run check && git push'],
  ['node -e mentioning git (deny)', 2, 'node -e "require(\'child_process\').execSync(\'git commit -m x\')"'],
  // A one-liner is judged on its git verbs like any command, so a read passes.
  ['python -c running git status (allow)', 0, 'python -c "import subprocess; subprocess.run([\'git\',\'status\'])"'],
  ['node -e git read then write (deny)', 2, 'node -e "const cp = require(\'child_process\'); cp.execSync(\'git status\'); cp.execSync(\'git stash\')"'],
  ['python -c argv read then write (deny)', 2, 'python -c "import subprocess; subprocess.run([\'git\',\'log\']); subprocess.run([\'git\',\'commit\'])"'],
  ['python -c escaped-quote argv (deny)', 2, 'python -c "import subprocess; subprocess.run([\\"git\\", \\"stash\\"])"'],
  ['node -e without git (allow)', 0, 'node -e "console.log(1)"'],
  ['arrow function in inline node (allow)', 0, 'node -e "console.log([1,2].map(x=>x*2))"'],
  ['git.exe commit (deny)', 2, 'git.exe commit -m "x"'],
  ['quoted full path to git (deny)', 2, '"C:/Program Files/Git/cmd/git.exe" commit -m "x"'],
  ['git pull (deny)', 2, 'git pull --rebase origin main'],
  ['git branch -f (deny)', 2, 'git branch -f WTB main'],
  // A known gap in README.md: an alias defined with `-c alias.` is not refused.
  ['git alias smuggling commit (allow, known gap)', 0, 'git -c alias.co=commit co'],
  ['git config write (deny)', 2, 'git config user.name Someone'],
  ['git config read (allow)', 0, 'git config --get user.name'],
  ['git fetch (allow)', 0, 'git fetch'],
  ['git branch --format (allow)', 0, 'git branch --format=%(refname)'],
  ['node -e writing a repo file (deny)', 2, `node -e "require('fs').writeFileSync('<SRC_DIR>/x.ts', 'a')"`],
  ['node -e writing a computed path (deny)', 2, `node -e "fs.writeFileSync(path.join(root, 'a.ts'), body)"`],
  ['node -e writing to Temp (allow)', 0, `node -e "require('fs').writeFileSync('${temp}/a.json', 'a')"`],
  // read git that runs a program or writes a file, judged on the words git receives
  ['git grep -O runs a program (deny)', 2, 'git grep -Ocat x'],
  ['git grep -O in a cluster (deny)', 2, 'git grep -nOcat x'],
  ['git grep -O split by quotes (deny)', 2, 'git grep -"O"cat x'],
  ['git grep --open-files-in-pager abbreviated (deny)', 2, 'git grep --op=cat x'],
  ['git diff --output into the tree (deny)', 2, 'git diff --output=<SRC_DIR>/x.diff'],
  ['git log --output (deny, PowerShell)', 2, 'git log --output <SRC_DIR>/x.txt'],
  ['git grep -n (allow)', 0, 'git grep -n "x" -- <SRC_DIR>'],
  ['gh pr create (deny)', 2, 'gh pr create --title x'],
  ['gh pr view (allow)', 0, 'gh pr view 12'],
  // movers: matched at command position, judged on their arguments
  ['cp into the tree (deny)', 2, 'cp /tmp/a.ts <SRC_DIR>/a.ts'],
  ['cp out of the tree (allow, the source is only read)', 0, 'cp <SRC_DIR>/a.ts /tmp/a.ts'],
  ['mv out of the tree (deny, the source is removed)', 2, 'mv <SRC_DIR>/a.ts /tmp/a.ts'],
  ['mv inside the tree (deny)', 2, 'mv <SRC_DIR>/a.ts <SRC_DIR>/b.ts'],
  // the delete grant: one non-recursive, unprotected project path per call
  ['rm a single orphaned file (allow)', 0, 'rm <SRC_DIR>/a.ts'],
  ['rm two project paths (deny)', 2, 'rm <SRC_DIR>/a.ts <SRC_DIR>/b.ts'],
  ['rm one path per command, chained (deny)', 2, 'rm <SRC_DIR>/a.ts; rm <SRC_DIR>/b.ts'],
  ['rm the probe plus a source (deny)', 2, 'rm <SRC_DIR>/__hunt_probe.ts <SRC_DIR>/a.ts'],
  ['rm -rf a folder (deny)', 2, 'rm -rf <SRC_DIR>/x'],
  ['rm a glob in the tree (deny)', 2, 'rm <SRC_DIR>/*.ts'],
  ['rm a hook (deny)', 2, 'rm .claude/hooks/guard.mjs'],
  ['rm a settings file (deny)', 2, 'rm .claude/settings.json'],
  ['rm inside .git (deny)', 2, 'rm .git/config'],
  ['unlink a single orphaned file (allow)', 0, 'unlink <SRC_DIR>/a.ts'],
  ['Remove-Item a single file (allow, PowerShell)', 0, 'Remove-Item <SRC_DIR>/a.ts'],
  ['Remove-Item a comma list (deny, PowerShell)', 2, 'Remove-Item <SRC_DIR>/a.ts,<SRC_DIR>/b.ts'],
  ['del a directory (deny, PowerShell)', 2, 'del <SRC_DIR>/'],
  ['rd with clustered /s/q switches (deny, PowerShell)', 2, 'rd /s/q <SRC_DIR>\\a'],
  ['rd with clustered /q/s switches (deny)', 2, 'rd //q//s <SRC_DIR>/a'],
  // PROTECTED_PATHS - replace with the project's own pattern; with an empty list this is "allow".
  // ['rm a generated client (deny)', 2, 'rm <SRC_DIR>/api/generated/client.ts'],
  ['rm -rf the source dir (deny)', 2, 'rm -rf <SRC_DIR>'],
  ['Remove-Item recursive (deny, PowerShell)', 2, 'Remove-Item -Recurse -Force <SRC_DIR>'],
  ['New-Item with a value (deny, PowerShell)', 2, 'New-Item -Path <SRC_DIR>/a.ts -Force -Value "x"'],
  ['mover with no target (deny, PowerShell)', 2, 'Get-ChildItem <SRC_DIR> | Remove-Item'],
  ['dd into the tree (deny)', 2, 'dd of=<SRC_DIR>/a.ts if=/tmp/a.ts'],
  ['rm node_modules (allow)', 0, 'rm -rf node_modules'],
  ['rm the hunt probe (allow)', 0, 'rm <SRC_DIR>/__hunt_probe.ts'],
  ['rm a numbered probe (allow)', 0, 'rm <SRC_DIR>/__hunt_probe2.ts'],
  ['cp between temp paths (allow)', 0, 'cp /tmp/a.ts /tmp/b.ts'],
  ['npm rm a package (allow)', 0, 'npm rm lodash'],
  // npm version commits and tags unless told not to.
  ['npm version patch (deny)', 2, 'npm version patch'],
  ['a mover word inside a quoted pattern (allow)', 0, `grep -rn "rm ${BS}|mv ${BS}|cp " <SRC_DIR>/`],
  ['a redirect character inside a pattern (allow)', 0, 'grep -n "a>b" <SRC_DIR>/x.ts'],
  // in-place edits and shell writes
  ['sed -i on repo file (deny)', 2, 'sed -i "s/a/b/" CLAUDE.md'],
  ['sed -ie combined (deny)', 2, 'sed -ie s/a/b/ .claude/rules/theme.md'],
  ['sed -n print (allow)', 0, 'sed -n "1,20p" CLAUDE.md'],
  ['perl -pi (deny)', 2, 'perl -pi -e "s/a/b/" src/App.ts'],
  ['awk inplace (deny)', 2, 'gawk -i inplace "{print}" file.md'],
  ['awk to repo tmp (deny)', 2, 'awk "/x/" a.md > .claude/rules/a.tmp && mv .claude/rules/a.tmp .claude/rules/a.md'],
  ['heredoc to repo (deny)', 2, "cat > .claude/scripts/x.mjs <<'EOF'\nconsole.log(1)\nEOF"],
  ['heredoc to scratchpad var (allow)', 0, `cat > "$S/probe.mjs" <<'EOF'\nconsole.log(1)\nEOF`],
  ['heredoc to Temp path (allow)', 0, `cat > "${S}/probe.mjs" <<'EOF'\nconsole.log(1)\nEOF`],
  ['append to file outside repo (allow)', 0, `cat >> "${home}/.claude/projects/x/memory/a.md" <<EOF\nx\nEOF`],
  ['redirect to /dev/null (allow)', 0, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null'],
  ['stderr to stdout + pipe (allow)', 0, 'node x.mjs 2>&1 | head -3'],
  ['tee to repo (deny)', 2, 'echo x | tee src/a.ts'],
  ['tee to tmp (allow)', 0, 'echo x | tee /tmp/a.txt'],
  ['git diff > scratch (allow)', 0, `git diff > "$S/diff.txt"`],
  ['Set-Content (deny, PowerShell)', 2, 'Set-Content -Path CLAUDE.md -Value "x"'],
  ['grep -rn (allow)', 0, 'grep -rn "x" src | head'],
  ['check command (allow)', 0, 'npm run check 2>&1 | tail -3'],
  // quoting per shell, command bodies, substitutions and wrappers
  ['bash -c body with escaped quotes (deny)', 2, 'bash -c "echo \\"x\\" > <SRC_DIR>/a.ts"'],
  ['nested substitution rm (deny)', 2, 'echo "$(rm -rf "$(pwd)/<SRC_DIR>")"'],
  ['substitution inside single quotes is text (allow)', 0, "grep -rn '$(git stash)' .claude"],
  ['trailing backslash then redirect (deny, PowerShell)', 2, 'Get-ChildItem "C:\\x\\" | Select-Object Name > <SRC_DIR>\\list.txt'],
  ['cmd body ending in a backslash (deny, PowerShell)', 2, 'cmd /c "rd /s /q <SRC_DIR>\\a\\"'],
  ['glued assignment in front (deny, PowerShell)', 2, '$null=Remove-Item -Recurse -Force <SRC_DIR>'],
  ['wrapper with options (deny)', 2, 'nice -n 10 rm -rf <SRC_DIR>'],
  ['timeout wrapper (deny)', 2, 'timeout 60 rm -rf <SRC_DIR>'],
  ['copyFileSync into the tree (deny)', 2, `node -e "require('fs').copyFileSync('/tmp/a.ts', '<SRC_DIR>/a.ts')"`],
  ['copyFileSync out of the tree (allow)', 0, `node -e "require('fs').copyFileSync('<SRC_DIR>/a.ts', '/tmp/a.ts')"`],
  ['python open a computed path for write (deny)', 2, `python -c "open(p, 'w').write(x)"`],
  ['.NET copy into the tree (deny, PowerShell)', 2, '[IO.File]::Copy("$env:TEMP\\x.ts", "<SRC_DIR>\\x.ts")'],
  // A known gap in README.md: a scratch variable is read as written, `..` included.
  ['redirect climbing out of scratch (allow, known gap)', 0, 'echo x > $TMP/../../<SRC_DIR>/a.ts'],
  ['redirect to a relative tmp dir (deny)', 2, 'echo x > ./tmp/out.txt'],
  ['redirect to $PWD/tmp (deny)', 2, 'echo x > $PWD/tmp/x'],
  ...(/\s/.test(root) ? [] : [['redirect to <root>/tmp (deny)', 2, `echo x > ${root.split(BS).join('/')}/tmp/out.json`]]),
  // An ancestor of the project holds it, so it counts as inside; a sibling stays outside.
  ...(/\s/.test(root) ? [] : [['rm -rf the parent of the project (deny)', 2, `rm -rf ${rootPath}/..`]]),
  ['rm -rf the root of the project volume (deny)', 2, drive ? `rm -rf /${drive}/` : 'rm -rf /'],
  ...(drive ? [['rm -rf a bare drive (deny)', 2, `rm -rf /${drive}`]] : []),
  ...(firstDir && !/\s/.test(firstDir) ? [['find -delete under an ancestor (deny)', 2, `find ${drive ? `/${drive}` : ''}/${firstDir} -name '*.ts' -delete`]] : []),
  ...(/\s/.test(parentPath) || dirname(root) === root ? [] : [['redirect to a sibling of the project (allow)', 0, `echo x > ${parentPath}/out.json`]]),
  // A glob is judged by the directory it expands in; a `\\?\` long-path prefix (Windows only) is not a glob.
  ...(/\s/.test(parentPath) || dirname(root) === root ? [] : [['rm -rf a glob in the parent of the project (deny)', 2, `rm -rf ${parentPath}/*`]]),
  ['rm -f a glob in /tmp (allow)', 0, 'rm -f /tmp/*.log'],
  ...(WIN ? [['redirect to a long-path scratch file (allow, PowerShell)', 0, 'node x.mjs > \\\\?\\C:\\Windows\\Temp\\x.txt']] : []),
  ['gh api GET with fields (allow)', 0, 'gh api --method GET search/issues -f q=x'],
  ['gh api DELETE (deny)', 2, 'gh api -XDELETE repos/x/y'],
  ['find -delete in the tree (deny)', 2, 'find <SRC_DIR> -name "*.tmp" -delete'],
  ['find -delete under a quoted scratch root (allow)', 0, 'find "$TMP/x" -name "*.tmp" -delete'],
  // a Bash variable a leading statement sets to a literal is judged as that literal
  ['leading literal scratch target (allow)', 0, `O="${S}/out"; cp <SRC_DIR>/a.ts "$O/a.ts"`],
  ['leading literal tree target (deny)', 2, 'D=<SRC_DIR>; cp /tmp/a.ts "$D/a.ts"'],
  ['scratch name set to a project path (deny)', 2, 'S=<SRC_DIR>; echo x > "$S/a.ts"'],
  ['scratch name set to a project path, with a comment (deny)', 2, 'S=<SRC_DIR>; echo x > "$S/a.ts" # note'],
  ['leading literal rebound later (deny)', 2, `O="${S}/o"; cp a "$O/x"; O=<SRC_DIR>; rm -r "$O"`],
  ['leading literal holding shell syntax (deny)', 2, 'O="/tmp/a;b"; cp a "$O"'],
  // the working directory: only a Bash subshell may move it
  ['cd then a command (deny)', 2, 'cd x && ls'],
  ['cd then a command (deny, PowerShell)', 2, 'cd x; ls'],
  ['cd inside a subshell (allow)', 0, '(cd x && ls)'],
  ['Set-Location (deny, PowerShell)', 2, 'Set-Location x'],
  ['pushd (deny)', 2, 'pushd x && ls'],
  // comments: judged as written and with comments blanked, so an apostrophe in a comment hides nothing
  ["git commit after a # it's comment (deny)", 2, "echo x # it's here\ngit commit -m x"],
  ["rm -rf after a # it's comment (deny)", 2, "echo x # it's here\nrm -rf <SRC_DIR>"],
  ['a # inside quotes is not a comment (allow)', 0, 'grep -n "a # b" <SRC_DIR>/x.ts'],
  // git's synonyms and housekeeping, newer read syntax, and gh verbs that switch, publish or run
  ['git stage (deny)', 2, 'git stage -A'],
  ['git maintenance run (deny)', 2, 'git maintenance run'],
  ['git submodule init (deny)', 2, 'git submodule init'],
  ['git config get (allow)', 0, 'git config get user.name'],
  ['gh pr checkout (deny)', 2, 'gh pr checkout 12'],
  ['gh gist create (deny)', 2, 'gh gist create --public <SRC_DIR>/a.ts'],
  ['gh workflow run (deny)', 2, 'gh workflow run ci.yml'],
  // formatters through other runners
  ['pnpm exec prettier --write (deny)', 2, 'pnpm exec prettier --write <SRC_DIR>'],
  ['yarn eslint --fix (deny)', 2, 'yarn eslint --fix <SRC_DIR>'],
  ['pnpm lint --fix (deny)', 2, 'pnpm lint --fix'],
  ['biome check --write (deny)', 2, 'npx biome check --write <SRC_DIR>'],
  // an interpreter reading its script on stdin
  ['python heredoc writing a repo file (deny)', 2, "python - <<'EOF'\nopen('<SRC_DIR>/a.ts','w').write('x')\nEOF"],
  ['node heredoc writing a repo file (deny)', 2, "node <<'EOF'\nrequire('fs').writeFileSync('<SRC_DIR>/a.ts','x')\nEOF"],
  ['script piped into node (deny)', 2, `echo "require('fs').writeFileSync('<SRC_DIR>/a.ts','x')" | node`],
  ['node heredoc that only prints (allow)', 0, "node <<'EOF'\nconsole.log(1)\nEOF"],
  // not writes
  ['truncate -s takes a size, not a path (allow)', 0, 'truncate -s 0 /tmp/log.txt'],
  ['arithmetic comparison (allow)', 0, 'echo $(( 3 > 2 ))'],
  ['arithmetic with a variable (allow)', 0, 'echo $(( $a > 0 ))'],
  ['arithmetic hiding a backtick rm (deny)', 2, 'echo $(( `rm -rf <SRC_DIR>` + 1 ))'],
  // the stdin check reads only an interpreter that heads a command and gets its script on stdin
  ['node --input-type module heredoc (deny)', 2, "node --input-type module <<'EOF'\nimport fs from 'node:fs'; fs.writeFileSync('<SRC_DIR>/a.ts','x')\nEOF"],
  ['py -3 - heredoc (deny)', 2, "py -3 - <<'EOF'\nopen('<SRC_DIR>/a.ts','w').write('x')\nEOF"],
  ['scratch heredoc naming node, then run (allow)', 0, `cat > ${S}/a.mjs <<'EOF'\nwalk(node);\nfs.writeFileSync(out, 'x');\nEOF\nnode ${S}/a.mjs`],
  ['search filtered by grep -v node (allow)', 0, 'grep -rn "rmSync(" .claude/scripts | grep -v node'],
  ['search, then node -v (allow)', 0, 'git log -S "writeFileSync(" --oneline | head; node -v'],
  ['heredoc body line headed by node (allow)', 0, `cat > ${S}/b.mjs <<'EOF'\nconst deep = nodes.filter((node) => node.depth < 3);\nfs.writeFileSync(process.argv[2], 'x');\nEOF`],
  ['node -r preload heredoc (deny)', 2, "node -r ./x.cjs <<'EOF'\nrequire('fs').writeFileSync('<SRC_DIR>/a.ts','x')\nEOF"],
  ['search piped into python -c (allow)', 0, 'grep -rn "rmSync(" .claude | python -c "import sys; print(len(sys.stdin.read().splitlines()))"'],
  ['a quoted << before a node heredoc (deny)', 2, `echo "feed it via <<EOF"\nnode <<'X'\nrequire('fs').writeFileSync('<SRC_DIR>/a.ts','x')\nX`],
  ['a heredoc a shell reads, holding a node heredoc (deny)', 2, `bash <<'EOF'\nnode <<'X'\nrequire('fs').writeFileSync('<SRC_DIR>/a.ts','x')\nX\nEOF`],
  ['a -c among the stdin script arguments (deny)', 2, "python - -c cfg.json <<'EOF'\nopen('<SRC_DIR>/a.ts','w').write('x')\nEOF"],
  ['gh co (deny)', 2, 'gh co 12'],
  ['git config edit (deny)', 2, 'git config edit --global'],
  // git judged on the words it receives: a quoted or escaped value with a space is one word
  ['git -C quoted path with a space, reset (deny)', 2, 'git -C "D:/Work Projects/proj" reset --hard'],
  ['git -C escaped space, restore (deny)', 2, 'git -C D:/My\\ Projects/app restore .'],
  ['git -c quoted value with a space, commit (deny)', 2, 'git -c "user.email=a b" commit -m x'],
  ['git -C quoted path, reset (deny, PowerShell)', 2, "git -C 'D:\\Work Projects\\proj' reset --hard HEAD"],
  ['git -C quoted path with a space, status (allow)', 0, 'git -C "D:/Work Projects/proj" status'],
  ['git -C a braced variable, commit (deny)', 2, 'git -C ${ROOT} commit -m x'],
  // git only where a shell runs it: text in an argument is not a command
  ['git words in a script argument (allow)', 0, "npm run docs -- --title 'git checkout flow'"],
  ['git words in echo text (allow)', 0, 'echo "Remember: never git push"'],
  ['git commit behind env (deny)', 2, 'env git commit -m x'],
  ['git commit behind xargs (deny)', 2, 'echo x | xargs git commit -m'],
  ['git commit behind eval (deny)', 2, "eval 'git commit -m x'"],
  ['git commit piped into bash (deny)', 2, "echo 'git commit -m x' | bash"],
  ['git commit through Start-Process (deny, PowerShell)', 2, "Start-Process git -ArgumentList 'commit','-m','x'"],
  // tools that commit, tag or push through git
  ['npm version --no-git-tag-version (allow)', 0, 'npm version patch --no-git-tag-version'],
  ['npm version alone lists versions (allow)', 0, 'npm version'],
  ['npm view a version (allow)', 0, 'npm view react version'],
  ['pnpm version (deny)', 2, 'pnpm version minor'],
  ['yarn version (deny)', 2, 'yarn version'],
  ['npx release-it (deny)', 2, 'npx release-it --ci'],
  ['npx standard-version (deny)', 2, 'npx standard-version'],
  ['npx lerna publish (deny)', 2, 'npx lerna publish from-git'],
  ['npx semantic-release (deny)', 2, 'npx semantic-release'],
  ['npx changeset publish (deny)', 2, 'npx changeset publish'],
  ['npx changeset version (allow)', 0, 'npx changeset version'],
  ['git subtree push (deny)', 2, 'git subtree push --prefix x origin y'],
  ['git lfs push (deny)', 2, 'git lfs push origin main'],
  ['git send-email (deny)', 2, 'git send-email x.patch'],
  ['git fetch into a local branch (deny)', 2, 'git fetch . HEAD:refs/heads/main'],
  ['git fetch a remote branch (allow)', 0, 'git fetch origin main'],
  // other ecosystems' formatters; the project's own tasks pass
  ['black (deny)', 2, 'black .'],
  ['black --check (allow)', 0, 'black --check .'],
  ['python -m black (deny)', 2, 'python -m black .'],
  ['ruff format (deny)', 2, 'ruff format .'],
  ['ruff format --diff (allow)', 0, 'ruff format --diff .'],
  ['ruff check --fix (deny)', 2, 'ruff check --fix .'],
  ['uv run ruff check (allow)', 0, 'uv run ruff check .'],
  ['gofmt -w (deny)', 2, 'gofmt -l -w .'],
  ['gofmt -l (allow)', 0, 'gofmt -l .'],
  ['go fmt (deny)', 2, 'go fmt ./...'],
  ['dotnet format (deny)', 2, 'dotnet format'],
  ['dotnet format --verify-no-changes (allow)', 0, 'dotnet format --verify-no-changes'],
  ['cargo fmt (deny)', 2, 'cargo fmt'],
  ['cargo fmt --check (allow)', 0, 'cargo fmt --check'],
  ['rustfmt a file (deny)', 2, 'rustfmt main.rs'],
  ['ktlint -F (deny)', 2, 'ktlint -F "**/*.kt"'],
  ['google-java-format -i (deny)', 2, 'google-java-format -i A.java'],
  ['clang-format -i (deny)', 2, 'clang-format -i a.cpp'],
  ['rubocop -a (deny)', 2, 'rubocop -a'],
  ['gradle spotlessApply, the project task (allow)', 0, './gradlew spotlessApply'],
  ['npm run format, the project script (allow)', 0, 'npm run format'],
  ["sed's w command into the tree (deny)", 2, "sed -n 'w <SRC_DIR>/a.ts' /tmp/x"],
  ["sed's s///w flag (deny)", 2, "sed 's/a/b/w out.txt' x.txt"],
  ['sed address then w (deny)', 2, "sed -n '1,5w out.txt' a.txt"],
  ['sed w to /dev/stdout (allow)', 0, "sed -n '/x/w /dev/stdout' a.txt"],
  // heredoc bodies no shell reads are data or another program's code
  ['python heredoc comparing with > (allow)', 0, "python3 - <<'X'\nprint(1 if 2 > 1 else 0)\nX"],
  ['python heredoc return annotation (allow)', 0, "python3 - <<'EOF'\ndef f(a: int) -> int:\n    return a\nEOF"],
  ['node heredoc arrow and > (allow)', 0, "node <<'EOF'\nconsole.log([1, 2].filter((x) => x > 1));\nEOF"],
  ['psql heredoc with > (allow)', 0, "psql -d app <<'SQL'\nSELECT count(*) FROM orders WHERE total > 100;\nSQL"],
  ['heredoc into /tmp with > in the body (allow)', 0, "cat <<'EOF' > /tmp/q.sql\nSELECT a FROM t WHERE a > 3;\nEOF"],
  ['notes heredoc naming cd and git push (allow)', 0, "cat > /tmp/notes.md <<'EOF'\nthen cd backend\nsteps: git push origin main\nEOF"],
  ['heredoc a shell reads, git push in it (deny)', 2, "bash <<'EOF'\ngit push\nEOF"],
  ['unquoted heredoc running a substitution (deny)', 2, 'cat > /tmp/n.md <<EOF\n$(git push)\nEOF'],
  ['python heredoc running git commit (deny)', 2, "python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['git', 'commit', '-m', 'x'])\nEOF"],
  // scratch targets: a name set from mktemp, and PowerShell's writers judged by their target
  ['mktemp name as a redirect target (allow)', 0, 'T=$(mktemp); npm ls > $T'],
  ['mktemp name after && (allow)', 0, 'OUT=$(mktemp) && npm ls --json > $OUT && jq .name $OUT'],
  ['mktemp with a template in the tree (deny)', 2, 'T=$(mktemp <SRC_DIR>/x.XXXX); echo x > $T'],
  ['mktemp name assigned again (deny)', 2, 'T=$(mktemp); T=<SRC_DIR>/a.ts; echo x > $T'],
  ['Out-File to TEMP (allow, PowerShell)', 0, 'npm ls | Out-File "$env:TEMP\\out.txt"'],
  ['Set-Content -Path TEMP (allow, PowerShell)', 0, 'npm ls | Set-Content -Path $env:TEMP\\x'],
  ['Out-File into the tree (deny, PowerShell)', 2, "'x' | Out-File <SRC_DIR>/a.ts"],
  ['Add-Content into the tree (deny, PowerShell)', 2, 'Add-Content -Path <SRC_DIR>/a.ts -Value x'],
  ['Set-Content with no target (deny, PowerShell)', 2, 'Get-Content a.txt | Set-Content'],
  ["sed's e command (deny)", 2, "sed -n '1e git push' x"],
  ["sed's s///e flag (deny)", 2, "sed 's/x/date/e' a.txt"],
  ['git lfs pull after a clone (allow)', 0, 'git lfs pull'],
  ['git lfs install (allow)', 0, 'git lfs install'],
  ['git lfs migrate (deny)', 2, "git lfs migrate import --include='*.bin'"],
  ['Out-File to ${env:TEMP} (allow, PowerShell)', 0, "'x' | Out-File ${env:TEMP}\\a.txt"],
  ['New-TemporaryFile name as a target (allow, PowerShell)', 0, '$t = New-TemporaryFile; npm ls > $t'],
  ['GetTempFileName name as a target (allow, PowerShell)', 0, '$T = [IO.Path]::GetTempFileName(); npm ls | Out-File $t'],
  ['temp-file name assigned again (deny, PowerShell)', 2, "$t = New-TemporaryFile; $t = 'src/a.ts'; npm ls > $t"],
  ['Set-Content comma list with a tree path (deny, PowerShell)', 2, "'x' | Set-Content $env:TEMP\\a, <SRC_DIR>\\b.ts"],
  ['sc alias into the tree (deny, PowerShell)', 2, "'x' | sc <SRC_DIR>\\a.ts"],
  ['ac alias into the tree (deny, PowerShell)', 2, "'x' | ac <SRC_DIR>\\a.ts"],
  ['sc under Bash is another program (allow)', 0, 'sc query wuauserv'],
  ['pathlib write_text in a one-liner (deny)', 2, `python -c "import pathlib; pathlib.Path('<SRC_DIR>/a.ts').write_text('x')"`],
  ['pathlib write_text to /tmp (allow)', 0, `python -c "import pathlib; pathlib.Path('/tmp/a.txt').write_text('x')"`],
  ['pathlib write_text from a stdin heredoc (deny)', 2, "python3 - <<'EOF'\nfrom pathlib import Path\nPath('<SRC_DIR>/a.ts').write_text('x')\nEOF"],
  // pathological input finishes inside the hook timeout, so the write in it is still refused
  ['unclosed $(( repeated, then a write (deny)', 2, `echo ${'$((1+(2*3)) '.repeat(3000)}> <SRC_DIR>/a.ts`],
  ['one long word, then git commit (deny)', 2, `echo ${'QUJDREVG'.repeat(20000)}; git commit -m x`],
  ['one long path word, then gh pr create (deny)', 2, `echo ${'a/'.repeat(80000)}; gh pr create`],
  ['a long run of separators, then git push (deny)', 2, `echo ${'a;'.repeat(80000)} git push`],
  ['many quoted words, then a write (deny)', 2, `echo ${"'a' ".repeat(60000)}> <SRC_DIR>/a.ts`],
  // a quoted or escaped redirect target keeps its blanks: judged whole, not cut at the first one
  ['quoted redirect into the project root (deny)', 2, `npm test > "${rootPath}/test.log" 2>&1`],
  ...(hasParent ? [['quoted redirect through a folder with a space (deny)', 2, `echo done >> "${viaSpace}/notes.txt"`]] : []),
  ...(hasParent ? [['single-quoted redirect through a folder with a space (deny)', 2, `echo x > '${viaSpace}/notes.txt'`]] : []),
  ...(hasParent ? [['quoted redirect through a folder with a space (deny, PowerShell)', 2, `npm test > "${viaSpace.split('/').join(BS)}${BS}test.log"`]] : []),
  ...(hasParent ? [['escaped-space redirect into the project (deny)', 2, `echo x > ${viaSpace.split(' ').join(`${BS} `)}/notes.txt`]] : []),
  ...(hasParent ? [['quoted redirect to a sibling named like the project (allow)', 0, `echo x > "${rootPath} notes/out.txt"`]] : []),
  ['quoted redirect to a scratch path with a space (allow)', 0, `git diff > "${S}/my notes/diff.txt"`],
  // a search behind a launcher is text; git behind one is still git
  ['a search behind xargs naming git commit (allow)', 0, 'git ls-files | xargs grep -n "git commit"'],
  ['a search behind find -exec naming git push (allow)', 0, 'find . -name "*.md" -exec grep -l "git push" {} +'],
  ['a search behind xargs naming gh and sed -i (allow)', 0, 'git ls-files | xargs grep -n "gh pr create" | grep -v "sed -i"'],
  ['git add behind xargs (deny)', 2, 'git ls-files -m | xargs git add'],
  ['git add behind find -exec (deny)', 2, 'find . -name "*.ts" -exec git add {} +'],
  ['git push through Start-Process, one string (deny, PowerShell)', 2, "Start-Process git -ArgumentList 'push origin main'"],
  // gh and the in-place tools only where a shell runs them: a quoted argument of another command is text
  ['gh words in echo text (allow)', 0, 'echo "next: gh pr create"'],
  ['gh words in a test name (allow)', 0, 'npm test -- -t "gh release create"'],
  ['gh words in Write-Host text (allow, PowerShell)', 0, 'Write-Host "then run gh pr merge"'],
  ['sed -i in echo text (allow)', 0, 'echo "use sed -i to fix"'],
  ['gh pr create with a quoted title (deny)', 2, 'gh pr create --title "a b"'],
  ['gh graphql mutation in quotes (deny)', 2, "gh api graphql -f query='mutation { x }'"],
  ['gh behind xargs (deny)', 2, 'echo 3 | xargs gh pr close'],
  ['gh inside node -e (deny)', 2, `node -e "require('child_process').execSync('gh pr create')"`],
  ['gh text piped into bash (deny)', 2, "echo 'gh pr create' | bash"],
  ['sed -i text piped into sh (deny)', 2, 'echo "sed -i s/a/b/ x.md" | sh'],
  ['gh held in a variable (deny)', 2, 'true; C="gh pr create"; $C'],
  ['sed -i with a quoted script (deny)', 2, "sed -i 's/a/b/' <SRC_DIR>/a.ts"],
  // rename only as a file API
  ['pandas rename in a one-liner (allow)', 0, `python -c "import pandas as pd; df = pd.DataFrame().rename(columns={'a': 'b'}); print(df)"`],
  ['fs.renameSync in a one-liner (deny)', 2, `node -e "require('fs').renameSync('<SRC_DIR>/a.ts', '<SRC_DIR>/b.ts')"`],
  ['os.rename in a one-liner (deny)', 2, `python -c "import os; os.rename('<SRC_DIR>/a.ts', '<SRC_DIR>/b.ts')"`],
  ['Path(...).rename in a one-liner (deny)', 2, `python -c "from pathlib import Path; Path('<SRC_DIR>/a.ts').rename('<SRC_DIR>/b.ts')"`],
  // a bracketed name that exists as written is one file, not a glob
  ['rm a file under a bracketed folder (allow)', 0, 'rm "blog/[slug]/page.tsx"', brackets],
  ['Remove-Item -LiteralPath a bracketed file (allow, PowerShell)', 0, 'Remove-Item -LiteralPath "[id].tsx"', brackets],
  ['rm a bracket glob that names no file (deny)', 2, 'rm "blog/[ab].ts"', brackets],
  ['rm -r a bracketed folder (deny)', 2, 'rm -r "blog/[slug]"', brackets],
  ['rm a bracketed file and a second path (deny)', 2, 'rm "blog/[slug]/page.tsx" "[id].tsx"', brackets],
  // everyday formatters and in-place tools, at command position whatever starts them; their check forms pass
  ['bare prettier --write (deny)', 2, 'prettier --write .'],
  ['bare prettier --check (allow)', 0, 'prettier --check .'],
  ['prettier from node_modules/.bin (deny)', 2, './node_modules/.bin/prettier --write .'],
  ['bun x prettier --write (deny)', 2, 'bun x prettier --write .'],
  ['bare eslint --fix (deny)', 2, 'eslint --fix .'],
  ['bare eslint (allow)', 0, 'eslint .'],
  ['npx stylelint --fix (deny)', 2, 'npx stylelint --fix "**/*.css"'],
  ['npx stylelint (allow)', 0, 'npx stylelint "**/*.css"'],
  ['isort (deny)', 2, 'isort .'],
  ['isort --check-only (allow)', 0, 'isort --check-only .'],
  ['isort --diff (allow)', 0, 'isort --diff .'],
  ['goimports -w (deny)', 2, 'goimports -w .'],
  ['goimports -l (allow)', 0, 'goimports -l .'],
  ['goimports -d (allow)', 0, 'goimports -d .'],
  ['golangci-lint run --fix (deny)', 2, 'golangci-lint run --fix'],
  ['golangci-lint run (allow)', 0, 'golangci-lint run ./...'],
  ['dotnet csharpier (deny)', 2, 'dotnet csharpier .'],
  ['dotnet csharpier --check (allow)', 0, 'dotnet csharpier --check .'],
  ['yq -i (deny)', 2, "yq -i '.a = 1' x.yml"],
  ['yq read (allow)', 0, "yq '.a' x.yml"],
  ['sort -o into the tree (deny)', 2, 'sort -o x.txt x.txt'],
  ['sort -o to /tmp (allow)', 0, 'sort -o /tmp/x.txt x.txt'],
  ['ruby -pi (deny)', 2, `ruby -pi -e 'gsub(/a/, "b")' x.rb`],
  ['ruby -I lib running a script (allow)', 0, 'ruby -I lib test/x_test.rb'],
  ['make fmt, the project task (allow)', 0, 'make fmt'],
];

let failed = 0;
for (const [name, want, command, cwd = root] of cases) {
  const tool = name.includes('PowerShell') ? 'PowerShell' : 'Bash';
  // The hook's own timeout: a guard killed there allows the call.
  const r = spawnSync('node', [guard], {
    input: JSON.stringify({ tool_name: tool, tool_input: { command }, cwd }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    timeout: 10000,
  });
  const ok = r.status === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${r.status}  ${(r.stderr ?? '').trim().slice(0, 50)}`);
}

// The Codex form: the same guard started with `--harness codex`. Every shell call arrives as `Bash` whatever the
// shell, so the grammar is the platform's - PowerShell on Windows, Bash elsewhere - unless the call names its shell.
// A refusal is JSON on stdout with exit 0. [name, 'deny' | 'allow', a command or the whole tool_input, extra payload, reason]
const rm = WIN ? 'Remove-Item' : 'rm';
const as = (agent_type) => ({ agent_type, agent_id: `agent-${agent_type}` });
const codexCases = [
  ['codex: git status (allow)', 'allow', 'git status --short'],
  ['codex: git commit (deny)', 'deny', 'git commit -m "x"', {}, /AGENTS\.md: apply file changes only/],
  ['codex: git -C . commit (deny)', 'deny', 'git -C . commit -m x'],
  ['codex: git commit with stderr folded in (deny)', 'deny', 'git commit -m x 2>&1'],
  ['codex: gh pr create (deny)', 'deny', 'gh pr create --title x'],
  ['codex: the check command (allow)', 'allow', 'npm run check 2>&1'],
  // the platform's grammar, and the shell a call names
  ['codex: a subshell cd, by the platform grammar', WIN ? 'deny' : 'allow', '(cd x && ls)'],
  ['codex: a subshell cd in a call that names bash (allow)', 'allow', { command: '(cd x && ls)', shell: '/usr/bin/bash' }],
  ['codex: a subshell cd in a call that names pwsh (deny)', 'deny', { command: '(cd x && ls)', shell: 'C:/Program Files/PowerShell/7/pwsh.exe' }],
  ['codex: Set-Location (deny)', 'deny', 'Set-Location x'],
  ...(WIN
    ? [
        ['codex: a quoted path ending in a backslash hides nothing (deny)', 'deny', 'Get-ChildItem "C:\\x\\"; git commit -m "x"'],
        ['codex: reading a file (allow)', 'allow', "Get-Content -LiteralPath '.agents/skills/debug/SKILL.md'"],
        ['codex: a read-back pipeline (allow)', 'allow', "Get-Item -LiteralPath 'notes/a.txt','notes/b.txt' | ForEach-Object { '{0}: {1}' -f $_.Name, ((Get-Content -LiteralPath $_.FullName) -join ' | ') }"],
        ['codex: a redirect to $null (allow)', 'allow', 'npm ls > $null'],
      ]
    : [['codex: a redirect to /dev/null (allow)', 'allow', 'npm ls > /dev/null']]),
  ['codex: Set-Content into the tree (deny)', 'deny', 'Set-Content -Path AGENTS.md -Value "x"', {}, /changed with apply_patch/],
  ['codex: a redirect into the tree (deny)', 'deny', 'npm ls > deps.txt', {}, /the temp directory/],
  // the layer's own files, as typed and as the path resolves from a subfolder or a named working directory
  ['codex: delete a hook (deny)', 'deny', `${rm} .codex/hooks/guard.mjs`],
  ['codex: delete hooks.json (deny)', 'deny', `${rm} .codex/hooks.json`],
  ['codex: delete the command rules (deny)', 'deny', `${rm} .codex/rules/git.rules`],
  ['codex: delete an agent (deny)', 'deny', `${rm} .codex/agents/hunt.toml`],
  ['codex: delete the Codex config (deny)', 'deny', `${rm} .codex/config.toml`],
  ['codex: delete a hook from inside its folder (deny)', 'deny', `${rm} guard.mjs`, { cwd: `${rootPath}/.codex/hooks` }],
  ['codex: delete a hook through a working directory (deny)', 'deny', { command: `${rm} guard.mjs`, workdir: '.codex/hooks' }],
  ['codex: delete inside .git from inside it (deny)', 'deny', `${rm} config`, { cwd: `${rootPath}/.git` }],
  ['codex: copy over a hook (deny)', 'deny', 'cp /tmp/guard.mjs .codex/hooks/guard.mjs'],
  ['codex: delete one skill note (allow)', 'allow', `${rm} .agents/skills/x/notes.md`],
  ['codex: delete one source file (allow)', 'allow', `${rm} <SRC_DIR>/a.ts`],
  // a patch belongs to the apply_patch tool, where the guard reads it
  ['codex: apply_patch behind a pipe (deny)', 'deny', 'echo x | apply_patch', {}, /apply_patch tool itself/],
  ['codex: apply_patch fed a heredoc (deny)', 'deny', "apply_patch <<'EOF'\n*** Begin Patch\n*** Add File: a.md\n+b => c > d\n*** End Patch\nEOF", {}, /apply_patch tool itself/],
  ['codex: apply_patch as an argument list (deny)', 'deny', { command: ['apply_patch', '*** Begin Patch\n*** Add File: a.md\n+x\n*** End Patch'] }, {}, /apply_patch tool itself/],
  // a command handed over as an argument list is read as the line a shell would get
  ['codex: an argument list running git commit (deny)', 'deny', { command: ['bash', '-lc', 'git commit -m x'] }],
  ['codex: an argument list with a one-liner write (deny)', 'deny', { command: ['node', '-e', "require('fs').writeFileSync('<SRC_DIR>/a.ts','x')"] }],
  ['codex: an argument list search naming git commit (allow)', 'allow', { command: ['rg', 'git commit', '<SRC_DIR>'] }],
  // the write fence by agent type
  ['codex: drift deletes a project file (deny)', 'deny', `${rm} <SRC_DIR>/a.ts`, as('drift'), /drift is read-only here/],
  ['codex: explorer deletes a project file (deny)', 'deny', `${rm} <SRC_DIR>/a.ts`, as('explorer')],
  ['codex: comments deletes a project file (deny)', 'deny', `${rm} <SRC_DIR>/a.ts`, as('comments')],
  ['codex: hunt deletes its probe (allow)', 'allow', `${rm} <SRC_DIR>/__hunt_probe.ts`, as('hunt')],
  ['codex: hunt deletes a source file (deny)', 'deny', `${rm} <SRC_DIR>/a.ts`, as('hunt')],
  ['codex: drift copies out of the tree (allow)', 'allow', `cp <SRC_DIR>/a.ts ${temp}/a.ts`, as('drift')],
  ['codex: an unfenced agent deletes one file (allow)', 'allow', `${rm} <SRC_DIR>/a.ts`, as('worker')],
];
const CLAUDE_WORDS = /CLAUDE|\.claude[\\/]|Edit or Write|scratchpad/;
for (const [name, want, input, extra = {}, reason] of codexCases) {
  const r = spawnSync('node', [guard, '--harness', 'codex'], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'suite', tool_name: 'Bash', tool_input: typeof input === 'string' ? { command: input } : input, cwd: root, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    timeout: 10000,
  });
  let said = {};
  try {
    said = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : {};
  } catch {
    said = { permissionDecision: 'unreadable' };
  }
  const text = said.permissionDecisionReason ?? '';
  const verdict = said.permissionDecision ?? 'allow';
  // The wording check reads the sentence, not the paths in it.
  const sentence = [root, rootPath].reduce((rest, folder) => rest.split(folder).join(''), text);
  const ok = r.status === 0 && verdict === want && (!reason || reason.test(text)) && !CLAUDE_WORDS.test(sentence);
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${r.status}  ${verdict}  ${text.slice(0, 50)}`);
}
rmSync(brackets, { recursive: true, force: true });
console.log(`${cases.length + codexCases.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
