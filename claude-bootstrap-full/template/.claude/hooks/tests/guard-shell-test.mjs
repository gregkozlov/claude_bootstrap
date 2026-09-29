// Self-test for guard.mjs, Bash / PowerShell payloads: git verbs, gh, movers and the delete grant, in-place edits,
// redirect targets, the working directory and comments.
//   node .claude/hooks/tests/guard-shell-test.mjs
// Every line must read "ok".
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, '..', 'guard.mjs');
const root = resolve(here, '..', '..', '..');
const S = 'C:/Users/x/AppData/Local/Temp/claude/x/scratchpad';
// A backslash, built here so no shell or editor mangles the alternation it goes into.
const BS = String.fromCharCode(92);
const rootPath = root.split(BS).join('/');
const parentPath = dirname(root).split(BS).join('/');
const drive = /^([A-Za-z]):/.exec(rootPath)?.[1]?.toLowerCase();
const firstDir = rootPath.replace(/^[A-Za-z]:/, '').split('/').find(Boolean);

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
  ['git worktree remove (deny)', 2, 'git worktree remove ../wt1'],
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
  ['node -e writing to Temp (allow)', 0, `node -e "require('fs').writeFileSync('C:/Users/x/AppData/Local/Temp/a.json', 'a')"`],
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
  ['rm a session ledger (deny)', 2, 'rm .claude/sessions/1999-01-01T00-00-guardtst/agents.md'],
  ['unlink a single orphaned file (allow)', 0, 'unlink <SRC_DIR>/a.ts'],
  ['Remove-Item a single file (allow, PowerShell)', 0, 'Remove-Item <SRC_DIR>/a.ts'],
  ['Remove-Item a comma list (deny, PowerShell)', 2, 'Remove-Item <SRC_DIR>/a.ts,<SRC_DIR>/b.ts'],
  ['del a directory (deny, PowerShell)', 2, 'del <SRC_DIR>/'],
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
  ['npm version patch (allow)', 0, 'npm version patch'],
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
  ['append to file outside repo (allow)', 0, 'cat >> "C:/Users/x/.claude/projects/x/memory/a.md" <<EOF\nx\nEOF'],
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
  // A glob is judged by the directory it expands in; a `\\?\` long-path prefix is not a glob.
  ...(/\s/.test(parentPath) || dirname(root) === root ? [] : [['rm -rf a glob in the parent of the project (deny)', 2, `rm -rf ${parentPath}/*`]]),
  ['rm -f a glob in /tmp (allow)', 0, 'rm -f /tmp/*.log'],
  ['redirect to a long-path scratch file (allow, PowerShell)', 0, 'node x.mjs > \\\\?\\C:\\Windows\\Temp\\x.txt'],
  ['gh api GET with fields (allow)', 0, 'gh api --method GET search/issues -f q=x'],
  ['gh api DELETE (deny)', 2, 'gh api -XDELETE repos/x/y'],
  ['find -delete in the tree (deny)', 2, 'find <SRC_DIR> -name "*.tmp" -delete'],
  ['find -delete under a quoted scratch root (allow)', 0, 'find "$TMP/x" -name "*.tmp" -delete'],
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
];

let failed = 0;
for (const [name, want, command] of cases) {
  const tool = name.includes('PowerShell') ? 'PowerShell' : 'Bash';
  const r = spawnSync('node', [guard], {
    input: JSON.stringify({ tool_name: tool, tool_input: { command }, cwd: root }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const ok = r.status === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${r.status}  ${r.stderr.trim().slice(0, 50)}`);
}
process.exit(failed ? 1 : 0);
