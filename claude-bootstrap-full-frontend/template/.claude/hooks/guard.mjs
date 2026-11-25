#!/usr/bin/env node
// PreToolUse guard: refuses the tool calls CLAUDE.md forbids outright, before they run.
//   Bash / PowerShell - a git verb that commits, stages, publishes or discards work where a shell runs git (at
//                       command position behind `git -C`, `$(...)`, `xargs`, `cmd /c`, a quoted path to the
//                       binary, a `bash -c` / `iex` body; anywhere inside an interpreter's code), a tool that
//                       commits or tags through git (`npm version`, `release-it`), a read git verb that runs a
//                       program or writes a file (`git grep -O<cmd>`, `--output=<file>`), a `gh` call that writes,
//                       a shell write or in-place edit into the project (formatters included), a copy or move
//                       whose target is inside the project, a delete beyond the one grant (one non-recursive
//                       project path per call, never a protected path, `.git`, the hooks or the settings), and a
//                       `cd` that moves the working directory for every later call. A Bash variable a leading
//                       statement sets to a literal (`S="<path>"; cp a "$S/b"`) is judged as that literal, and one
//                       set from `mktemp` as scratch.
//   Edit / Write      - a path matching PROTECTED_PATHS (generated or externally owned files), any written line
//                       carrying an en or em dash, and for an agent in FENCED_AGENTS (`hunt`) any project path
//                       but the ones its entry allows. NotebookEdit is judged the same.
// Registered in .claude/settings.json (tracked) - it is repo policy, like the deny list beside it.
// Reads one JSON payload on stdin; exit 2 with the reason on stderr blocks the call, exit 0 allows it.
// A guard that cannot parse its input allows the call: the deny list and the rules still stand behind it.
// With `--harness codex` on its command line it reads OpenAI Codex's payloads instead - `Bash` whatever the shell,
// `apply_patch` with the patch text - and refuses with JSON on stdout, exit 0. Every such branch tests CODEX; without
// the flag nothing changes, and no Claude Code layer registers it that way.
// Self-test: node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Codex switch: `--harness codex` or `--harness=codex`. Stderr reaches nobody there, so a list that failed to parse
// is kept in LIST_ERROR and refuses every call until it is fixed.
const CODEX = process.argv.slice(2).some((arg, index, args) => /^--harness=codex$/i.test(arg) || (arg === '--harness' && /^codex$/i.test(args[index + 1] ?? '')));
// Under Codex no variable carries the project root and the cwd may be a subfolder: the root is where this file is installed.
const HOOK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let LIST_ERROR;

// Paths the agent must never hand-edit, as regex sources tested against the tool's file_path with every
// backslash turned into "/" first - write them with forward slashes, matching the path's tail, e.g.
// ["src/api/generated/", "\\.openapi\\.json$"]. An empty list protects nothing. Filled at install as a JSON array
// inside the raw string (INSTALL.md); edit freely afterwards. The unfilled placeholder and an empty string read as
// an empty list. A misfill (a bare string, a broken array, a bad regex) is named in one stderr line and also reads as
// an empty list, so every other check stays live - run the self-tests after filling it.
const PROTECTED_RAW = String.raw`<GENERATED_PATHS>`;
// Windows and macOS file systems ignore case: there `SRC/API/x.ts` is the same file as `src/api/x.ts`.
const PATH_FLAGS = process.platform === 'win32' || process.platform === 'darwin' ? 'i' : '';
const PROTECTED_PATHS = regexList('PROTECTED_PATHS', PROTECTED_RAW);

// A hook that throws at load exits 1, which allows every call, so a misfilled list costs only itself.
function regexList(name, raw) {
  if (raw.startsWith('<') || !raw.trim()) return [];
  try {
    const sources = JSON.parse(raw);
    if (!Array.isArray(sources) || !sources.every((source) => typeof source === 'string')) throw new Error('not an array of strings');
    return sources.map((source) => new RegExp(source, PATH_FLAGS));
  } catch (error) {
    if (CODEX) LIST_ERROR = `${name} is not a JSON array of regex sources (${error.message})`;
    else process.stderr.write(`guard.mjs: ${name} is not a JSON array of regex sources (${error.message}); it protects nothing until it is fixed.\n`);
    return [];
  }
}

// `stash` is not here: it is judged by an allow list in gitCallWrites.
const GIT_WRITE_VERBS = new Set([
  'commit', 'commit-tree', 'push', 'pull', 'reset', 'rebase', 'merge', 'mergetool', 'tag', 'cherry-pick', 'revert',
  'am', 'checkout', 'checkout-index', 'switch', 'restore', 'clean', 'add', 'stage', 'rm', 'mv', 'filter-branch',
  'update-ref', 'update-index', 'read-tree', 'replace', 'bisect', 'gc', 'maintenance', 'repack', 'prune', 'fast-import',
  'send-email',
]);
const GIT_WRITE_SUBCOMMANDS = {
  remote: new Set(['add', 'set-url', 'rename', 'remove', 'rm', 'prune', 'set-head', 'set-branches']),
  reflog: new Set(['delete', 'expire']),
  'sparse-checkout': new Set(['init', 'set', 'add', 'reapply', 'disable']),
  submodule: new Set(['init', 'update', 'add', 'deinit', 'sync', 'foreach', 'set-url', 'set-branch', 'absorbgitdirs']),
  worktree: new Set(['remove', 'prune', 'add', 'move', 'lock', 'unlock', 'repair']),
  notes: new Set(['add', 'append', 'copy', 'edit', 'merge', 'prune', 'remove']),
  subtree: new Set(['add', 'merge', 'pull', 'push', 'split']),
  // `lfs pull` / `fetch` / `install` are the ordinary steps after a clone; `migrate` rewrites history.
  lfs: new Set(['push', 'migrate']),
};
const GIT_READ_VERBS = new Set(['log', 'show', 'diff', 'grep', 'blame', 'shortlog', 'status', 'rev-parse', 'ls-files']);
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);
const GIT_BINARY = /^(?:.*[\\/])?git(?:\.exe)?$/i;
// Commands that run their arguments as a command, so a git word among them is at command position.
const GIT_LAUNCHER = /^(?:xargs|parallel|watch|find|wsl|doas|ionice|chrt|taskset|flock|cross-env|dotenv|Start-Process|saps|start)$/i;
// Inside code an interpreter runs from its arguments (`perl -e`, `ruby -e`, `php -r`, `deno eval`, `eval`) a git call has no
// command position: `system('git commit')`, `['git', 'stash']`. A script file's arguments are data.
const SCRIPT_HEAD = /^(?:node|python[\d.]*|py|perl|ruby|php|deno|bun|pwsh|powershell|Rscript|lua|eval)(?:\.exe)?$/i;
// Tools that commit, tag or push through git themselves.
const RELEASE_TOOL = /^(?:release-it|standard-version|commit-and-tag-version|semantic-release|lerna|changeset|@changesets\/cli)$/;
// A search tool's arguments are patterns and paths: it cannot commit, publish or edit, so its segment skips those tests.
const SEARCH_COMMAND = /^(?:grep|egrep|fgrep|rg|ag|findstr|Select-String|sls)$/i;
const GH_MUTATING =
  /\bgh\s+(?:pr\s+(?:create|merge|close|edit|comment|delete|review|ready|reopen|lock|unlock)|issue\s+(?:create|close|edit|comment|delete|reopen|lock|unlock|pin|unpin|transfer|develop)|release\s+(?:create|delete|edit|upload)|repo\s+(?:create|delete|edit|fork|rename|archive|sync)|pr\s+(?:checkout|update-branch)|co|gist\s+(?:create|edit|delete)|workflow\s+(?:run|enable|disable)|run\s+(?:rerun|cancel|delete)|(?:secret|variable)\s+(?:set|delete|remove)|label\s+(?:create|edit|delete|clone)|cache\s+delete)\b/;
// The head of a command whose script may come on stdin (`python - <<'EOF'`, `node <<EOF`, `... | node`, `... | bash`).
const STDIN_INTERPRETER = /^(?:node|python[\d.]*|py|deno|bun|bash|sh|zsh|dash|ksh|pwsh|powershell)(?:\.exe)?$/i;
const ARITHMETIC = /\$\(\((?:[^()$`]|\$(?!\()|\((?:[^()$`]|\$(?!\())*\))*\)\)/g;
// Interpreter flags whose value is the next word, so it is not the script operand (`node -r ./pre.cjs <<EOF`).
const STDIN_VALUE_FLAG =
  /^(?:-r|--require|--import|--loader|--experimental-loader|--env-file|--env-file-if-exists|-C|--conditions|--input-type|--title|-X|-W)$/;
const ONE_LINER_FLAG = /^(?:-[ecpm]|-pe|--eval|--print)$/;
// A shell, `eval`, `source` or `.` runs a heredoc body as a script, so with one in the command no body is blanked.
const SHELL_READER = /(?:^|[\s;&|(`])(?:(?:[^\s#'";&|(`]*\/)?(?:bash|sh|zsh|dash|ksh|eval|source)(?:\.exe)?(?=[\s;&|)<>]|$)|\.(?=\s))/;
const INTERPRETER_ONE_LINER =
  /\b(?:node(?:\.exe)?(?:\s+-{1,2}\w[\w-]*(?:=\S+)?)*?\s+(?:-e|--eval|-p|--print|-pe)|python[\d.]*(?:\.exe)?(?:\s+-[A-Za-z]+(?:\s+[^-\s]\S*)?)*?\s+-c|py(?:\s+-\S+)*?\s+-c|(?:pwsh|powershell)(?:\.exe)?(?:\s+-\w+(?:\s+[^-\s"']\S*)?)*?\s+-c(?:ommand)?|iex|Invoke-Expression)\b/i;
const SCRIPT_WRITE =
  /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|rmSync|unlinkSync|truncateSync|mkdirSync|rmdirSync|openSync|open|os\.(?:remove|unlink|rmdir|mkdir|makedirs)|shutil\.rmtree|(?<=\.)rm|(?<=\.)write_(?:text|bytes))\s*\(/gi;
const WRITE_MODE = /^\s*(?:mode\s*=\s*)?(['"])[rbt]*[wax+][rbtwax+]*\1\s*$/;
// `rename` only as a file API - bare, or on `os.`, `fs.`, `Path(...).`, `require(...).`: `df.rename(columns=...)` renames no file.
const SCRIPT_COPY =
  /\b(copyFileSync|copyFile|cpSync|renameSync|(?:(?<![\w.$])|(?<=\b(?:os|fs|fsp|fsPromises|promises)\.)|(?<=\b(?:Path|require)\([^()]*\)\.))rename|shutil\.(?:copy2?|copyfile|copytree|move))\s*\(/gi;
const DOTNET_WRITE = /\[(?:System\.)?IO\.(?:File|Directory)\]::(?:Write\w*|Append\w*|Delete|Create\w*)\s*\(/gi;
const DOTNET_COPY = /\[(?:System\.)?IO\.(?:File|Directory)\]::(Copy|Move|Replace)\s*\(/gi;
const SHELL_HEAD =
  /\b((?:bash|sh|zsh)(?:\.exe)?(?:\s+-{1,2}\w[\w-]*)*?\s+-[a-zA-Z]*c|cmd(?:\.exe)?(?:\s+\/[a-zA-Z](?::\S*)?)*?\s+\/\/?[cCkK]|(?:pwsh|powershell)(?:\.exe)?(?:\s+-\w+(?:\s+[^-\s"']\S*)?)*?\s+-c(?:ommand)?|iex|Invoke-Expression)\s+/;
const MOVER =
  /^(?:cp|mv|install|dd|truncate|patch|shred|rsync|ed|ex|tee|robocopy|xcopy|Copy-Item|Move-Item|Rename-Item|New-Item|Remove-Item|Clear-Content|Tee-Object|Set-Content|Add-Content|Out-File|cpi|mi|ri|ni|rni|ren|rm|del|erase|rd|rmdir|copy|move|unlink|clc)$/i;
const LEADING_KEYWORD = /^(?:if|then|do|else|elif|while|until|!|foreach|ForEach-Object|%|nohup)$/i;
const WRAPPER_VALUE_FLAGS = {
  env: /^-[uC]$/,
  timeout: /^-[sk]$/,
  nice: /^-n$/,
  stdbuf: /^-[ioe]$/,
  sudo: /^-[ugpChDrtU]$/,
  time: /^-[fo]$/,
  command: /^$/,
  exec: /^-a$/,
};
const REDIRECT_TOKEN = /^(?:\d|\*|&)?(?:>{1,2}\|?|>&|<)/;
// The source directory escaped for a regex: a nested one (`apps/web/src`) carries slashes and dots.
const SRC_RE = '<SRC_DIR>'.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Paths a mover may still touch inside the project: dependencies, and the compile probe a review agent is
// required to delete and cannot delete any other way. Add project-specific exemptions here.
const MOVER_EXEMPT = new RegExp(
  String.raw`(?:^|[\\/])node_modules(?:[\\/]|$)|(?:^|[\\/])${SRC_RE.replace(/\\\//g, String.raw`[\\/]`)}[\\/]__hunt_probe[^\\/]*\.ts$`,
);
const NODE_MODULES = /(?:^|[\\/])node_modules(?:[\\/]|$)/;
const PROBE_PATH = new RegExp(String.raw`^${SRC_RE}\/__hunt_probe[^/]*\.ts$`);
// The delete grant: a file the change itself orphaned may be deleted from the shell, one path per call, with no
// recursive flag, and never inside `.git`, the hooks or the settings files (SHELL_PROTECTED) or a PROTECTED_PATHS match.
const DELETER = /^(?:rm|del|erase|ri|rd|rmdir|Remove-Item|unlink)$/i;
const GIT_DIR = /(?:^|[\\/])\.git(?:[\\/]|$)/;
const SHELL_PROTECTED = /(?:^|[\\/])\.claude[\\/](?:hooks(?:[\\/]|$)|settings(?:\.local)?\.json$)/i;
// Under Codex the layer's own files, tested on a path with forward slashes: the hooks, their registration, the command
// rules, the agents, and the project's Codex config, which can switch hooks off.
const CODEX_LAYER = /(?:^|\/)\.codex\/(?:hooks(?:\/|$)|hooks\.json$|rules(?:\/|$)|agents(?:\/|$)|config\.toml$)/i;
// rm's own short flags, so `-Rf` counts and PowerShell's `-Force` does not; `-Re...` is -Recurse, and `//s` is cmd's `/s`
// from Git Bash, which strips one slash; cmd also takes its switches clustered, `/s/q` or `/q//s`.
const RECURSIVE_FLAG =
  /^(?:--recursive|-[Rr][Ee][A-Za-z]*(?::\S*)?|-[fivdIrR]*[rR][fivdIrR]*|(?:\/{1,2}[A-Za-z])*\/{1,2}[sS](?:\/{1,2}[A-Za-z])*)$/;
// The working directory persists across calls (and into another worktree), so only a Bash subshell may change it.
const CHDIR = /^(?:cd|cd\.\.|cd\\|chdir|pushd|popd|Set-Location|sl|Push-Location|Pop-Location)$/i;
// A copier's only write is its destination; `mv` is not one, because it removes the source.
const COPIER = /^(?:cp|copy|rsync|install|Copy-Item|cpi|robocopy|xcopy)$/i;
// cmd's own movers take `/x` switches (`//x` from Git Bash), never a path that short.
const CMD_MOVER = /^(?:rd|rmdir|del|erase|copy|move|robocopy|xcopy)$/i;
const VALUE_PARAMS =
  /^-(?:ErrorAction|EA|WarningAction|WA|InformationAction|IA|ErrorVariable|EV|WarningVariable|WV|InformationVariable|IV|OutVariable|OV|OutBuffer|OB|PipelineVariable|PV|ItemType|Type|Filter|Include|Exclude|Encoding|Value|Target|Credential|Stream|Depth|Variable|Name|Width|InputObject)$/i;
const PATH_PARAMS = /^-(?:Path|LiteralPath|PSPath|LP|FilePath)$/i;
const DESTINATION_PARAMS = /^-(?:Destination|OutFile)$/i;
const COPIER_DESTINATION = /^(?:-t|--target-directory)$/;
const CURL_DESTINATION = /^(?:-[A-Za-z]*o|--output)$/;
const WGET_DESTINATION = /^(?:-[A-Za-z]*O|--output-document)$/;
// Their only write is the file an output flag names; `sort -o` is one of them.
const DOWNLOADER = /^(?:curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|sort)$/i;
// The tools the gh and in-place checks name read their own quoted arguments: `gh api graphql -f query='mutation ...'`.
const READS_OWN_QUOTES = /^(?:gh|g?sed|perl|g?awk)$/i;
const IN_PLACE_EDIT =
  /\bg?sed\s+(?:-\S+\s+)*(?:-[a-zA-Z]*i[a-zA-Z]*\b|--in-place)|\bperl\s+(?:-\S+\s+)*-[pnlaws]*i(?:\.\S*|[pnlaeEws]*)?(?=\s|$)|\bg?awk\b[^|]*-i\s*inplace|\b(?:npx|bunx|pnpm(?:\s+(?:exec|dlx))?|yarn(?:\s+dlx)?|npm\s+exec(?:\s+--)?)(?:\s+-{1,2}\w[\w-]*)*\s+prettier\b[^|;&]*\s(?:--write|-w)\b|\b(?:npx|bunx|pnpm(?:\s+(?:exec|dlx))?|yarn(?:\s+dlx)?|npm\s+exec(?:\s+--)?)(?:\s+-{1,2}\w[\w-]*)*\s+eslint\b[^|;&]*\s--fix(?![\w-])|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint\b[^|;&]*\s--fix(?![\w-])|\bbiome\b[^|;&]*\s--(?:write|fix|apply)\b/i;
// A redirect target: `> file`, `>> file`, `2> file` (`tee` is a mover). The lookbehind keeps `<>`, `||`, `>>` and
// an arrow function's `=>` from reading as a redirect. `>|` forces an overwrite and `>& file` / `&> file` send both
// streams into it; `2>&1` names no file.
const WRITE_TARGET = /(?:(?<![<>|=])[\d&]?>{1,2}\|?(?!&)|(?<![<>|=\d])>&(?![\d-]))\s*["']?([^\s"'|;&)}]+)/g;
// Allowed targets: the null devices, a temp or scratchpad path, or a shell variable that names one ($S, $TMP,
// $TEMP, $SCRATCH, $TMPDIR, $env:TEMP, %TEMP%) or the memory directory ($M). Everything else - a relative path, a
// path under the project, an unknown variable - is a write the Edit / Write tools should make.
const SCRATCH_TARGET = /\/dev\/null|^\$null$|^nul$|\/tmp\/|[\\/]Temp[\\/]|scratchpad|^\$\{?(?:S|TMP|TEMP|SCRATCH|TMPDIR|M)\b|\$\{?env:te?mp\b|%te?mp%/i;
// The two long dashes, en (U+2013) and em (U+2014); every other dash-like character passes. Built from code points so
// this file itself carries neither.
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// The write fence: an agent named here may write or delete inside the project only the paths its entry allows.
// A project's own writer agent with a narrow job gets an entry of its own (`allowed` is tested against the
// project-relative path with forward slashes, `what` names it in the refusal).
const PROBE_FENCE = { allowed: PROBE_PATH, what: 'its compile probe (<SRC_DIR>/__hunt_probe*.ts)' };
const FENCED_AGENTS = new Map([['hunt', PROBE_FENCE]]);
// Under Codex an agent has no tool list, so the fence is what keeps a read-only agent read-only: no project path for the
// reviewers and the built-in explorer, and for an editor agent a plain `*** Update File` only. An entry with `says`
// words its own refusal; a project's own editor agent gets an UPDATE_ONLY_FENCE entry.
const READ_ONLY_FENCE = { allowed: /^(?!)/, says: 'is read-only here: it may not write or remove anything inside the project' };
const UPDATE_ONLY_FENCE = { allowed: /^(?!)/, updates: true, says: 'may only change an existing file with a plain `*** Update File` patch inside the project' };
const CODEX_FENCED_AGENTS = new Map([
  ['hunt', PROBE_FENCE],
  ['drift', READ_ONLY_FENCE],
  ['gate', READ_ONLY_FENCE],
  ['twins', READ_ONLY_FENCE],
  ['explorer', READ_ONLY_FENCE],
  ['comments', UPDATE_ONLY_FENCE],
]);
// Under Codex path-scoped rules are the guard's own: the rule files, and where it notes which ones a session was shown.
const RULES_DIR = '.ai-layer/rules';
const RULE_MARKERS = path.join(os.tmpdir(), 'ai-layer-rules');
const MAX_BODY_DEPTH = 3;
const GIT_REFUSAL =
  'Blocked by .claude/hooks/guard.mjs: this git verb commits, stages, publishes, rewrites or discards work. CLAUDE.md: apply file changes only and leave them in the working tree - the author commits.';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function deny(reason) {
  if (CODEX) {
    const said = codexWording(reason);
    try {
      writeSync(1, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: said } })}\n`);
    } catch {
      // Stdout is gone: exit 2 with the reason on stderr is Codex's second refusal form, where the hook's shell keeps the code.
      process.stderr.write(`${said}\n`);
      process.exit(2);
    }
    process.exit(0);
  }
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

// The refusals are written once, in Claude Code's words; under Codex the same sentence names that tool's files.
function codexWording(reason) {
  return reason
    .split('.claude/hooks/guard.mjs')
    .join('.codex/hooks/guard.mjs')
    .split('CLAUDE.md')
    .join('AGENTS.md')
    .split('with Edit or Write')
    .join('with apply_patch')
    .split('the session scratchpad or /tmp')
    .join('the temp directory')
    .split('under the scratchpad')
    .join('under the temp directory');
}

function fenceRefusal(fence, target) {
  if (fence.says) return `Blocked by .claude/hooks/guard.mjs: ${fence.agent} ${fence.says}, not ${target}.`;
  return `Blocked by .claude/hooks/guard.mjs: ${fence.agent} may write or remove only ${fence.what} inside the project, not ${target}.`;
}

function escapeChar(shell) {
  return shell === 'Bash' ? '\\' : shell === 'PowerShell' ? '`' : undefined;
}

function doubleQuotedSource(shell) {
  const escape = escapeChar(shell);
  return escape ? `"((?:[^"${escape === '\\' ? '\\\\' : escape}]|\\${escape}[\\s\\S])*)"` : '"([^"]*)"';
}

function tokenize(segment, shell) {
  return [...segment.matchAll(new RegExp(`${doubleQuotedSource(shell)}|'([^']*)'|(\\S+)`, 'g'))].map((match) => match[1] ?? match[2] ?? match[3]);
}

// Unlike `tokenize`, the words the shell hands the program: escapes resolved, a quoted run glued on (`-"O"cat` is
// `-Ocat`). PowerShell escapes with a backtick and doubles an apostrophe inside single quotes; cmd has neither.
function shellWords(segment, shell = 'Bash') {
  const escape = shell === 'PowerShell' ? '`' : shell === 'cmd' ? undefined : '\\';
  const words = [];
  let word;
  let quote;
  for (let index = 0; index < segment.length; index += 1) {
    const ch = segment[index];
    const next = segment[index + 1];
    if (quote === "'") {
      if (ch === "'" && shell === 'PowerShell' && next === "'") {
        word += ch;
        index += 1;
      } else if (ch === "'") quote = undefined;
      else word += ch;
    } else if (ch === escape && next === '\n') {
      index += 1;
    } else if (ch === escape && next !== undefined && (quote === undefined || escape === '`' || '"\\$`'.includes(next))) {
      word = (word ?? '') + next;
      index += 1;
    } else if (quote === '"') {
      if (ch === '"') quote = undefined;
      else word += ch;
    } else if ((ch === "'" && shell !== 'cmd') || ch === '"') {
      quote = ch;
      word ??= '';
    } else if (/\s/.test(ch)) {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else {
      word = (word ?? '') + ch;
    }
  }
  if (word !== undefined) words.push(word);
  return words;
}

function escapedAt(quote, command, index, shell) {
  return quote !== "'" && command[index] === escapeChar(shell) && index + 1 < command.length;
}

function shellBodies(command, shell) {
  const singleQuoted = shell === 'PowerShell' ? "'((?:[^']|'')*)'" : "'([^']*)'";
  const pattern = new RegExp(`${SHELL_HEAD.source}(?:${doubleQuotedSource(shell)}|${singleQuoted})`, 'gi');
  const unescape = shell === 'Bash' ? /\\(["\\$`])/g : shell === 'PowerShell' ? /`(["`$])/g : undefined;
  const visible = singleQuotesBlanked(command, shell);
  return [...command.matchAll(pattern)]
    .filter((match) => visible[match.index] === command[match.index])
    .map((match) => ({
      shell: /^(?:pwsh|powershell|iex|Invoke-Expression)/i.test(match[1]) ? 'PowerShell' : /^cmd/i.test(match[1]) ? 'cmd' : 'Bash',
      body:
        match[2] !== undefined
          ? unescape
            ? match[2].replace(unescape, '$1')
            : match[2]
          : shell === 'PowerShell'
            ? match[3].replace(/''/g, "'")
            : match[3],
    }));
}

function backtickBodies(command) {
  const bodies = [];
  let quote;
  let open = -1;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote === "'") {
      if (ch === "'") quote = undefined;
    } else if (ch === '\\' && index + 1 < command.length) {
      index += 1;
    } else if (ch === '`') {
      if (open < 0) open = index;
      else {
        bodies.push(command.slice(open + 1, index));
        open = -1;
      }
    } else if (open < 0 && ch === '"') {
      quote = quote === '"' ? undefined : '"';
    } else if (open < 0 && ch === "'" && !quote) {
      quote = "'";
    }
  }
  return bodies;
}

// Quoted spans become spaces of the same length: callers index the result with offsets into the original.
// A blank the shell does not split at - escaped, or inside a kept span - becomes HELD_BLANK, so a path with a space
// stays one word. No caller reads it back: the redirect check takes its target from the command at the same offsets.
const HELD_BLANK = '\u0001';
function unquoted(command, shell) {
  let out = '';
  let quote;
  let keep = false;
  // Whether `out` ends in a redirect and blanks (`>`, `>|`, `>&`): 1 right behind the `>`, 2 further on. Kept per
  // character - a regex at every quote would rescan the text, quadratic in a command with many of them.
  let redirect = 0;
  const add = (text) => {
    out += text;
    for (const ch of text) redirect = ch === '>' ? 1 : /\s/.test(ch) ? Math.min(redirect * 2, 2) : redirect === 1 && (ch === '|' || ch === '&') ? 2 : 0;
  };
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (escapedAt(quote, command, index, shell)) {
      const pair = /[ \t]/.test(command[index + 1]) ? ch + HELD_BLANK : command.slice(index, index + 2);
      add(!quote || keep ? pair : '  ');
      index += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = undefined;
        add(' ');
      } else {
        add(keep ? (/[ \t]/.test(ch) ? HELD_BLANK : ch) : ' ');
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      // A quoted span right after a redirect IS the target and has to stay readable.
      keep = redirect > 0;
      add(' ');
      continue;
    }
    add(ch);
  }
  return out;
}

// Only single-quoted spans blanked: a double-quoted `$(...)` or backtick still runs.
function singleQuotesBlanked(command, shell) {
  let out = '';
  let quote;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote === "'") {
      if (ch === "'") quote = undefined;
      out += ' ';
    } else if (escapedAt(quote, command, index, shell)) {
      out += command.slice(index, index + 2);
      index += 1;
    } else if (quote === '"') {
      if (ch === '"') quote = undefined;
      out += ch;
    } else if (ch === "'") {
      quote = ch;
      out += ' ';
    } else {
      if (ch === '"') quote = ch;
      out += ch;
    }
  }
  return out;
}

function substitutionBodies(command, shell) {
  const visible = singleQuotesBlanked(command, shell);
  const bodies = [];
  for (let start = visible.indexOf('$('), next; start >= 0; start = visible.indexOf('$(', next)) {
    let depth = 1;
    let quote;
    let index = start + 2;
    for (; index < command.length; index += 1) {
      const ch = command[index];
      if (escapedAt(quote, command, index, shell)) index += 1;
      else if (quote) {
        if (ch === quote) quote = undefined;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')' && --depth === 0) break;
    }
    // An unclosed `$(` is a syntax error the shell refuses, and its text is judged as part of this command already.
    // Recursing into it would rescan every later `$(` once per level, super-quadratically: a hook killed at its timeout allows.
    if (index >= command.length) break;
    bodies.push(command.slice(start + 2, index));
    next = index + 1;
  }
  return bodies;
}

function callArguments(text, index, escape) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote;
  for (; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === escape && index + 1 < text.length) {
      current += text.slice(index, index + 2);
      index += 1;
    } else if (quote) {
      if (ch === quote) quote = undefined;
      current += ch;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
    } else if ('([{'.includes(ch)) {
      depth += 1;
      current += ch;
    } else if (')]}'.includes(ch)) {
      if (depth === 0) break;
      depth -= 1;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  args.push(current);
  return args;
}

// A quote the shell escaped (`\"` inside a bash double-quoted one-liner) is still the code's quote.
function literalPath(arg) {
  const match = /^\s*([rRbBuUfF]{0,2})(['"`])([^'"`]*)\2\s*$/.exec((arg ?? '').replace(/[\\`](["'`])/g, '$1'));
  if (!match) return undefined;
  if ((/f/i.test(match[1]) && match[3].includes('{')) || (match[2] === '`' && match[3].includes('${'))) return undefined;
  return match[3];
}

// The path a script write API names: its first argument, or for pathlib's `Path('x').write_text(...)` the receiver.
function scriptWriteTarget(text, match, args) {
  if (!/^write_/i.test(match[1])) return literalPath(args[0]);
  return literalPath(/\bPath\(([^()]*)\)\s*\.$/.exec(text.slice(0, match.index))?.[1]);
}

function segments(command, shell) {
  const out = [];
  let current = '';
  let quote;
  let wordDepth = 0;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (escapedAt(quote, command, index, shell)) {
      current += command.slice(index, index + 2);
      index += 1;
    } else if (quote) {
      if (ch === quote) quote = undefined;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '{' && (command[index - 1] === '$' || command[index - 1] === '@')) {
      wordDepth += 1;
      current += ch;
    } else if (ch === '}' && wordDepth > 0) {
      wordDepth -= 1;
      current += ch;
    } else if (';|&\n(){}'.includes(ch)) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function normalizeGit(text) {
  return text
    .replace(/\\?["'`,[\]]/g, ' ')
    .replace(/\$\(|[(){}]/g, ' ')
    // Anchored at a word start: unanchored, one long word costs quadratic time, and a hook killed at its timeout allows.
    .replace(/(?<!\S)\S*[\\/]git(?:\.exe)?(?=\s|$)/gi, 'git')
    .replace(/\bgit\.exe\b/gi, 'git');
}

function stripLeading(input) {
  const tokens = [...input];
  let start = 0;
  for (;;) {
    const token = tokens[start];
    if (token === undefined) break;
    const glued = /^\$[\w:]+=(.+)$/.exec(token);
    const wrapper = Object.hasOwn(WRAPPER_VALUE_FLAGS, token) ? WRAPPER_VALUE_FLAGS[token] : undefined;
    if (token === 'command' && /^-[vV]$/.test(tokens[start + 1] ?? '')) break;
    if (LEADING_KEYWORD.test(token) || /^[A-Za-z_][\w]*=/.test(token) || /^\[void\]$/i.test(token) || /^\$[\w:]+=$/.test(token)) {
      start += 1;
    } else if (glued) {
      tokens[start] = glued[1];
    } else if (/^\$[\w:]+$/.test(token) && tokens[start + 1] === '=') {
      start += 2;
    } else if (wrapper) {
      const name = token;
      start += 1;
      while (tokens[start]?.startsWith('-')) {
        const split = name === 'env' && /^(?:-S|--split-string)$/.test(tokens[start]) ? tokens[start + 1] : undefined;
        if (split !== undefined) {
          tokens.splice(start, 2, ...split.split(/\s+/).filter(Boolean));
          break;
        }
        start += wrapper.test(tokens[start]) ? 2 : 1;
      }
      if (name === 'timeout' && /^\d/.test(tokens[start] ?? '')) start += 1;
    } else if (/^cmd(?:\.exe)?$/i.test(token)) {
      let next = start + 1;
      while (/^\/\/?[a-zA-Z](?::\S*)?$/.test(tokens[next] ?? '') && !/^\/\/?[cCkK]$/.test(tokens[next])) next += 1;
      if (!/^\/\/?[cCkK]$/.test(tokens[next] ?? '')) break;
      start = next + 1;
    } else {
      break;
    }
  }
  return tokens.slice(start);
}

function isConfigRead(rest) {
  if (rest.some((token) => /^(?:--add|--unset|--unset-all|--replace-all|--rename-section|--remove-section|--edit|-e)$/.test(token))) return false;
  // git 2.46+ spells both as subcommands: `git config get user.name`, `git config list`, `git config edit`.
  const subcommand = rest.find((token, index) => !token.startsWith('-') && !/^(?:-f|--file|--blob|--type|--default|--comment)$/.test(rest[index - 1] ?? '')) ?? '';
  if (/^(?:set|unset|rename-section|remove-section|edit)$/.test(subcommand)) return false;
  if (rest.some((token) => /^(?:--get|--get-all|--get-regexp|--get-urlmatch|--list|-l)$/.test(token))) return true;
  if (/^(?:get|get-all|get-regexp|get-urlmatch|list)$/.test(subcommand)) return true;
  return rest.filter((token) => !token.startsWith('-')).length <= 1;
}

function gitVerbIndex(tokens, gitIndex) {
  let index = gitIndex + 1;
  while (index < tokens.length && tokens[index].startsWith('-')) index += GIT_GLOBAL_WITH_VALUE.has(tokens[index]) ? 2 : 1;
  return index;
}

function gitCallWrites(tokens, gitIndex) {
  const index = gitVerbIndex(tokens, gitIndex);
  const verb = tokens[index];
  const rest = tokens.slice(index + 1);
  if (verb === undefined) return false;
  if (GIT_WRITE_VERBS.has(verb)) return true;
  // An allow list, not a write list: bare `git stash -m <msg>` pushes, and its first non-flag token is the message.
  if (verb === 'stash') return !/^(?:list|show)$/.test(rest[0] ?? '');
  if (verb === 'apply') return !rest.some((token) => /^--(?:check|stat|numstat|summary)$/.test(token));
  if (verb === 'merge-file') return !rest.some((token) => /^(?:-p|--stdout)$/.test(token));
  if (verb === 'config') return !isConfigRead(rest);
  if (verb === 'branch') return rest.some((token) => /^(?:-[a-zA-Z]*[dDmMfcC][a-zA-Z]*|--delete|--move|--force|--copy|--set-upstream-to(?:=\S*)?|-u|--unset-upstream|--edit-description)$/.test(token));
  if (verb === 'symbolic-ref') return rest.filter((token) => !token.startsWith('-')).length >= 2;
  // A refspec with a local destination moves a branch (`git fetch . HEAD:main`); a remote-tracking one does not.
  if (verb === 'fetch') return rest.filter((token) => !token.startsWith('-')).slice(1).some((token) => /^\+?[^:]*:(?!refs\/remotes\/)\S/.test(token));
  const subcommands = GIT_WRITE_SUBCOMMANDS[verb];
  if (subcommands) return subcommands.has(rest.find((token) => !token.startsWith('-')) ?? '');
  return false;
}

// The words the program receives, the leading assignments and wrappers stripped: a quoted `-C "a b"` stays one word.
function commandWords(segment, shell) {
  return stripLeading(shellWords(segment.trim(), shell));
}

// Git is judged where a shell runs it: at command position or after a launcher, so `echo "never git push"` and
// `npm test -- -t 'git checkout flow'` are text. Inside an interpreter's code every git word counts.
function gitWrites(segment, shell) {
  const words = commandWords(segment, shell);
  const head = words[0] ?? '';
  if (GIT_BINARY.test(head)) return gitCallWrites(words, 0);
  const run = unwrapRunner(words);
  if (GIT_BINARY.test(run[0] ?? '')) return gitCallWrites(run, 0);
  const launched = (list) => list.some((word, index) => GIT_BINARY.test(word) && gitCallWrites(list, index));
  // PowerShell hands `Start-Process git 'commit','-m','x'` its arguments as one comma or space list. Only there:
  // split for every launcher, the pattern of `xargs grep -n "git commit"` would read as a git call.
  if (GIT_LAUNCHER.test(head)) {
    return launched(words.slice(1)) || (/^(?:Start-Process|saps|start)$/i.test(head) && launched(words.slice(1).flatMap((word) => word.split(/[\s,]+/).filter(Boolean))));
  }
  return runsCode(segment, words) && gitWritesAnywhere(segment);
}

function runsCode(segment, words) {
  const head = words[0] ?? '';
  const code = SCRIPT_HEAD.test(toolName(head)) && (/^eval$/.test(head) || words.some((word) => /^(?:-[a-zA-Z]*[eEr]|--eval|eval|-c|-Command)$/i.test(word)));
  return INTERPRETER_ONE_LINER.test(segment) || code;
}

// A quoted argument is data to the program that gets it (`echo "next: gh pr create"`, `npm test -- -t "sed -i"`), so the
// gh and in-place checks read it only where it can run or is the tool's own: an interpreter's code, a launcher's
// command unless that is a search, the tools in READS_OWN_QUOTES, and a bare assignment, whose value may run later.
function quotedRuns(segment, words) {
  if (words.length === 0) return true;
  if (GIT_LAUNCHER.test(words[0])) return !words.some((word) => SEARCH_COMMAND.test(word));
  return runsCode(segment, words) || READS_OWN_QUOTES.test(toolName(unwrapRunner(words)[0]));
}

function gitWritesAnywhere(text) {
  const tokens = normalizeGit(text).split(/\s+/).filter(Boolean);
  return tokens.some((token, index) => token === 'git' && gitCallWrites(tokens, index));
}

// The allow list's read-only git prefixes pass these with no prompt: grep's `-O<cmd>` (in a cluster or abbreviated too) runs a
// program, and `--output=<file>` writes one. Judged on the words git receives, so a quoted `"-Ocat"` counts.
function gitReadEscapes(segment, shell) {
  const words = commandWords(segment, shell);
  if (!GIT_BINARY.test(words[0] ?? '')) return false;
  const index = gitVerbIndex(words, 0);
  const verb = words[index];
  return words.slice(index + 1).some((word) => /^--output(?:=|$)/.test(word) || (verb === 'grep' && /^(?:--op|-[A-Za-z0-9]*O)/.test(word)));
}

function firstGitVerb(segment, shell) {
  const words = commandWords(segment, shell);
  return GIT_BINARY.test(words[0] ?? '') ? words[gitVerbIndex(words, 0)] : undefined;
}

const toolName = (word) => (word ?? '').replace(/^.*[\\/]/, '').replace(/\.(?:exe|cmd)$/i, '');

// The tool a runner starts: `npx x`, `pnpm exec x`, `yarn dlx x`, `npm exec -- x`, `bun x x`, `python -m x`, `uv run x`, `uvx x`.
function unwrapRunner(words) {
  let rest = words;
  for (let round = 0; round < 3; round += 1) {
    const name = toolName(rest[0]);
    const second = rest[1] ?? '';
    let skip = 0;
    if (/^(?:npx|bunx|uvx)$/i.test(name)) skip = 1;
    else if ((/^(?:pnpm|yarn)$/i.test(name) && /^(?:exec|dlx)$/.test(second)) || (/^npm$/i.test(name) && second === 'exec') || (/^bun$/i.test(name) && second === 'x')) skip = 2;
    else if (/^(?:uv|poetry|pdm|hatch|rye|pipenv|pipx)$/i.test(name) && second === 'run') skip = 2;
    else if (/^(?:python[\d.]*|py)$/i.test(name)) {
      const module = rest.findIndex((word, index) => index > 0 && (word === '-m' || !word.startsWith('-')));
      if (rest[module] === '-m') skip = module + 1;
    }
    if (skip === 0) return rest;
    rest = rest.slice(skip);
    while (rest[0]?.startsWith('-')) rest = rest.slice(/^(?:-p|--package|--with|--python|--from|--spec|--directory|--project)$/.test(rest[0]) ? 2 : 1);
  }
  return rest;
}

// `npm version patch` commits and tags; `--no-git-tag-version` only bumps the files. Bare `npm version` lists versions.
function releaseWrites(words) {
  const head = toolName(words[0]);
  if (/^(?:npm|pnpm|yarn)$/i.test(head)) {
    let index = 1;
    while (words[index]?.startsWith('-')) index += /^(?:--prefix|-C|--cwd|--dir|--filter|-F|-w|--workspace)$/.test(words[index]) ? 2 : 1;
    if (words[index] === 'version') {
      const rest = words.slice(index + 1);
      if (rest.some((word) => /^(?:--no-git-tag-version|--git-tag-version=false)$/.test(word))) return false;
      return /^yarn$/i.test(head) || rest.some((word) => !word.startsWith('-'));
    }
  }
  const [tool = '', ...args] = /^(?:yarn|pnpm|bun)$/i.test(head) && RELEASE_TOOL.test(words[1] ?? '') ? words.slice(1) : unwrapRunner(words);
  const name = tool.startsWith('@') ? tool.replace(/(?<=.)@[^/]*$/, '') : toolName(tool).replace(/@.*$/, '');
  if (!RELEASE_TOOL.test(name)) return false;
  const first = args.find((arg) => !arg.startsWith('-'));
  if (name === 'lerna') return first === 'version' || first === 'publish';
  // `changeset publish` publishes and tags; `changeset version` only rewrites the files, like the bump above.
  if (/changeset/.test(name)) return first === 'publish' || first === 'tag';
  return !args.some((arg) => /^(?:--dry-run|-d|--help|-h|--version|-v|-V)$/.test(arg));
}

// A formatter or fixer rewrites its operands unless a check flag keeps it read-only, and a few everyday tools edit a
// file in place on one flag. A project's own task (`./gradlew spotlessApply`, `make fmt`, `npm run format`) is its own
// script and passes. A formatter this project runs that is not here: add a case, and one in the shell suite.
function formatterWrites(words) {
  let [tool, ...args] = unwrapRunner(words);
  // `yarn prettier`, `pnpm eslint` and `bun stylelint` start the package's binary with no `exec`.
  if (/^(?:yarn|pnpm|bun)$/i.test(toolName(tool)) && /^(?:prettier|eslint|stylelint)(?:@|$)/.test(args[0] ?? '')) [tool, ...args] = args;
  let name = toolName(tool).replace(/(?<=.)@.*$/, '');
  if (/^java$/i.test(name) && /google-java-format/.test(args[args.indexOf('-jar') + 1] ?? '')) {
    name = 'google-java-format';
    args = args.slice(args.indexOf('-jar') + 2);
  }
  const has = (pattern) => args.some((arg) => pattern.test(arg));
  const subcommand = args.find((arg) => !arg.startsWith('-') && !arg.startsWith('+'));
  const help = /^(?:--help|-h|--version|-V)$/;
  // `dotnet csharpier .` and `csharpier format .` write; `--check` and the `check` command only read.
  const csharpierWrites = (rest) => !rest.some((arg) => /^(?:check|--check|--write-stdout|--help|-h|--version)$/.test(arg));
  switch (name) {
    case 'prettier':
      return has(/^(?:--write|-w)$/);
    case 'eslint':
    case 'stylelint':
      return has(/^--fix(?:=\S*)?$/);
    case 'black':
      return !has(/^(?:--check|--diff|--code|-c)$/) && !has(help) && !args.includes('-');
    case 'isort':
      return !has(/^(?:--check-only|--check|-c|--diff|-d|--show-files|--show-config)$/) && !has(help) && !args.includes('-');
    case 'ruff':
      return (subcommand === 'format' && !has(/^(?:--check|--diff)$/) && !has(help)) || (has(/^--fix(?:-only)?$/) && !has(/^--diff$/));
    case 'gofmt':
    case 'goimports':
      return has(/^--?w(?:=true)?$/);
    case 'go':
      return subcommand === 'fmt' && !has(/^-n$/);
    case 'golangci-lint':
      return has(/^--fix(?:=true)?$/) || (subcommand === 'fmt' && !has(/^(?:-d|--diff|--diff-colored|--stdin)$/) && !has(help));
    case 'dotnet':
      if (subcommand === 'csharpier') return csharpierWrites(args.slice(args.indexOf('csharpier') + 1));
      return subcommand === 'format' && !has(/^(?:--verify-no-changes|--check|--help|-h|-\?)$/);
    case 'dotnet-format':
      return !has(/^(?:--verify-no-changes|--check|--dry-run|--help|-h)$/);
    case 'csharpier':
    case 'dotnet-csharpier':
      return csharpierWrites(args);
    case 'cargo':
      return subcommand === 'fmt' && !has(/^--check$/) && !has(help);
    case 'rustfmt': {
      const operands = args.filter((arg, index) => !arg.startsWith('-') && !/^(?:--emit|--edition|--config|--config-path|--color|--style-edition)$/.test(args[index - 1] ?? ''));
      return operands.length > 0 && !has(/^(?:--check|--emit=stdout)$/) && args[args.indexOf('--emit') + 1] !== 'stdout' && !has(help);
    }
    case 'ktlint':
      return has(/^(?:-F|--format)$/);
    case 'google-java-format':
      return has(/^(?:-i|-r|--?replace)$/);
    case 'clang-format':
      return has(/^--?i$/);
    case 'rubocop':
      return has(/^(?:-a|-A|-x|--auto-?correct(?:-all)?|--fix-layout)$/);
    case 'yq':
      return has(/^(?:-[a-zA-Z]*i|--inplace|--in-place)$/);
    case 'ruby':
      // Only ruby's own flags, before the script: `-i` in a cluster, never `-I <dir>` or the glued value of `-r`.
      for (let index = 0; index < args.length && args[index].startsWith('-'); index += /^-(?![rI].)[a-zA-Z]*[eIrCEF]$/.test(args[index]) ? 2 : 1) {
        if (/^-[pnlaws]*i(?:\.\S*|[pnlaeEws]*)$/.test(args[index])) return true;
      }
      return false;
    default:
      return false;
  }
}

// GNU sed's `w` / `W` command and the `w` flag of `s` write a file: `sed -n 'w out' x`, `sed 's/a/b/w out' x`. Its `e`
// command and the `e` flag of `s` run a shell command, reported as SED_EXEC.
const SED_EXEC = Symbol('sed e');

function sedWriteTargets(words) {
  if (!/^g?sed$/i.test(toolName(words[0]))) return [];
  const scripts = [];
  let implicit;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (/^(?:-[a-zA-Z]*e|--expression)$/.test(word)) scripts.push(words[(index += 1)] ?? '');
    else if (word.startsWith('--expression=')) scripts.push(word.slice('--expression='.length));
    else if (/^(?:-[a-zA-Z]*[fl]|--file|--line-length)$/.test(word)) index += 1;
    else if (!word.startsWith('-') && implicit === undefined) implicit = word;
  }
  if (scripts.length === 0 && implicit !== undefined) scripts.push(implicit);
  return scripts.flatMap(sedScriptWrites);
}

function sedScriptWrites(script) {
  const targets = [];
  let index = 0;
  const lineEnd = () => (script.indexOf('\n', index) < 0 ? script.length : script.indexOf('\n', index));
  // From an opening delimiter to just past its unescaped closing one.
  const pastDelimited = () => {
    const delimiter = script[index];
    for (index += 1; index < script.length && script[index] !== delimiter; index += 1) if (script[index] === '\\') index += 1;
    index += 1;
  };
  while (index < script.length) {
    // Separators and an address: line numbers, `$`, `/re/` or `\cREc` with its flags, a range, a step, `!`.
    for (;;) {
      const ch = script[index];
      if (ch !== undefined && /[\s;{}!,~+$0-9]/.test(ch)) index += 1;
      else if (ch === '/' || (ch === '\\' && script[index + 1] !== undefined)) {
        if (ch === '\\') index += 1;
        pastDelimited();
        while (/[IM]/.test(script[index] ?? '')) index += 1;
      } else break;
    }
    const command = script[index];
    if (command === undefined) break;
    index += 1;
    if (command === 'w' || command === 'W') {
      targets.push(script.slice(index, lineEnd()).trim());
      index = lineEnd();
    } else if (command === 's' || command === 'y') {
      if (script[index] === undefined || /[\n\\]/.test(script[index])) break;
      pastDelimited();
      index -= 1;
      pastDelimited();
      while (command === 's' && /[gpiImMe0-9w]/.test(script[index] ?? '')) {
        if (script[index] === 'e') targets.push(SED_EXEC);
        if (script[index] === 'w') {
          targets.push(script.slice(index + 1, lineEnd()).trim());
          index = lineEnd();
          break;
        }
        index += 1;
      }
    } else if (command === 'e') {
      targets.push(SED_EXEC);
      index = lineEnd();
    } else if ('aicrR:#'.includes(command)) {
      index = lineEnd();
    } else if ('btT'.includes(command)) {
      while (index < script.length && !/[;\n]/.test(script[index])) index += 1;
    }
  }
  return targets.filter(Boolean);
}

function ghWrites(text) {
  const flat = normalizeGit(text);
  if (GH_MUTATING.test(flat)) return true;
  if (!/\bgh\s+api\b/.test(flat)) return false;
  const method = /\s(?:-X\s*|--method(?:\s+|=))(\w+)/.exec(flat);
  if (method) return method[1].toUpperCase() !== 'GET';
  if (!/\s(?:-f|-F|--field|--raw-field|--input)(?:\s|=)/.test(flat)) return false;
  // `gh api graphql` sends fields as POST for a read as well; only a mutation writes.
  return !(/\bgh\s+api\s+graphql\b/.test(flat) && !/\bmutation\b/.test(text));
}

function moverArguments(tokens, context) {
  const verb = tokens[0];
  const powershell = context.shell === 'PowerShell' || verb.includes('-');
  const positional = [];
  const paths = [];
  const destinations = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (REDIRECT_TOKEN.test(token)) {
      // A bare operator takes the next token as its target; the redirect check judges it, not this one.
      if (/^(?:\d|\*|&)?(?:>{1,2}\|?|>&|<)$/.test(token)) index += 1;
      continue;
    }
    if (CMD_MOVER.test(verb) && /^(?:\/\/?[A-Za-z](?::\S*)?)+$/.test(token)) continue;
    const colon = /^(-[A-Za-z-]+)[:=](.*)$/.exec(token);
    const name = colon ? colon[1] : token;
    if (name.startsWith('-') && name.length > 1 && !/^-\d/.test(name)) {
      const value = () => (colon ? colon[2] : tokens[++index]);
      if (powershell && PATH_PARAMS.test(name)) {
        const item = value();
        if (item !== undefined) paths.push(item);
      } else if (
        (powershell && DESTINATION_PARAMS.test(name)) ||
        (COPIER.test(verb) && COPIER_DESTINATION.test(name)) ||
        (/^(?:curl|sort)$/i.test(verb) && CURL_DESTINATION.test(name)) ||
        (/^wget$/i.test(verb) && WGET_DESTINATION.test(name))
      ) {
        const item = value();
        if (item !== undefined) destinations.push(item);
      } else if ((powershell && VALUE_PARAMS.test(name) && !colon) || (/^truncate$/i.test(verb) && /^(?:-[sr]|--size|--reference)$/.test(name) && !colon)) {
        index += 1;
      }
      continue;
    }
    positional.push(token.replace(/^(?:if|of)=/, ''));
  }
  return { positional, paths, destinations };
}

function moverTargets(verb, { positional, paths, destinations }) {
  if (/^(?:Tee-Object|Set-Content|Add-Content|Out-File)$/i.test(verb)) return [...paths, ...positional.slice(0, 1)];
  if (DOWNLOADER.test(verb)) return destinations.filter((target) => target !== '-');
  if (COPIER.test(verb)) {
    if (destinations.length > 0) return destinations;
    if (/^(?:robocopy|xcopy)$/i.test(verb)) return positional.slice(1, 2);
    const all = [...paths, ...positional];
    return all.length > 1 ? all.slice(-1) : all;
  }
  return [...paths, ...destinations, ...positional];
}

function unresolvable(target) {
  return /^[$@]/.test(target) && !SCRATCH_TARGET.test(target);
}

// `node_modules/../src` is not under node_modules.
function normalizedPath(target) {
  return path.posix.normalize(target.replace(/\\/g, '/'));
}

function checkMovers(segment, context) {
  const tokens = stripLeading(tokenize(segment.trim(), context.shell));
  if (tokens.length === 0) return;
  if (context.shell === 'PowerShell') {
    // `sc` and `ac` are PowerShell's aliases for Set-Content and Add-Content (under Bash they are other programs).
    if (/^(?:sc|ac)$/i.test(tokens[0])) tokens[0] = /^sc$/i.test(tokens[0]) ? 'Set-Content' : 'Add-Content';
    // A comma list spread over words (`a, b`) is one argument naming several paths.
    for (let index = tokens.length - 1; index > 0; index -= 1) {
      if (tokens[index - 1].endsWith(',') || tokens[index].startsWith(',')) tokens.splice(index - 1, 2, tokens[index - 1] + tokens[index]);
    }
  }
  const xargs = tokens.findIndex((token) => /^xargs$/i.test(token));
  if (xargs >= 0 && tokens.slice(xargs + 1).some((token) => MOVER.test(token))) {
    deny('Blocked by .claude/hooks/guard.mjs: a mover behind xargs, whose targets cannot be judged. CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write, and an orphaned file is deleted one path at a time.');
  }
  if (!MOVER.test(tokens[0]) && !DOWNLOADER.test(tokens[0])) return;
  const verb = tokens[0];
  const targets = moverTargets(verb, moverArguments(tokens, context));
  if (targets.length === 0) {
    if (/^(?:tee|Tee-Object)$/i.test(verb) || DOWNLOADER.test(verb)) return;
    deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" with no resolvable target. CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write.`);
  }
  // The delete cap counts project paths across the whole call (`rm a; rm b` is two). A glob or a PowerShell comma
  // list is one token naming several paths. The probe counts toward the cap, or it could carry a second path along
  // with it; node_modules is the owner's own grant and does not.
  const inTree = targets
    .flatMap((target) => target.split(','))
    .filter((target) => target && !isScratchTarget(target) && !NODE_MODULES.test(normalizedPath(target)));
  if (DELETER.test(verb)) {
    for (const target of inTree) context.deleted.add(normalizedPath(target).toLowerCase());
    // A bracketed name that exists as written (`app/[slug]/page.tsx`) is that one file, not a glob.
    if (context.deleted.size > 1 || inTree.some((target) => /[*?]/.test(target) || (target.includes('[') && !existsAsWritten(target, context.cwd)))) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" removes more than one project path in one call. CLAUDE.md, Shell and file edits: an orphaned file is deleted one path at a time.`);
    }
  }
  const recursive = tokens.some((token) => RECURSIVE_FLAG.test(token));
  // Split like the cap above: judged whole, `$env:TEMP\x,<protected>` would pass as scratch.
  for (const target of targets.flatMap((item) => (item.split(',').some(Boolean) ? item.split(',').filter(Boolean) : [item]))) {
    if (unresolvable(target)) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" on "${target}", a variable this check cannot resolve. CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write, and an orphaned file is deleted one named path at a time. Only $S, $TMP, $TEMP, $SCRATCH, $TMPDIR, $M, $env:TEMP, %TEMP% and a name set from mktemp resolve as scratch.`);
    }
    if (isScratchTarget(target)) continue;
    if (context.fence && !fencedPath(target, context.cwd, context.fence.allowed)) {
      deny(fenceRefusal(context.fence, `"${target}"`));
    }
    const normal = normalizedPath(target);
    if (MOVER_EXEMPT.test(normal)) continue;
    // cmd's `del` on a directory empties it without any recursive flag.
    if (/^(?:del|erase)$/i.test(verb) && (/[\\/]$/.test(target) || isDirectory(target, context.cwd))) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" on the directory "${target}" deletes every file in it. CLAUDE.md, Shell and file edits: an orphaned file is deleted one path at a time.`);
    }
    // The one shell operation on a project file that is granted: a single non-recursive delete of an unprotected path.
    if (DELETER.test(verb) && !recursive && !guardedPath(target, context.cwd)) {
      continue;
    }
    deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" would write or remove "${target}". CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write; scratch output goes under the session scratchpad or /tmp.`);
  }
}

function checkFind(command, shell) {
  for (const match of unquoted(command, shell).matchAll(/(?:^|[\s;&|(])(?:[^\s;&|(]*[\\/])?find(\s[^|;&\n]*)/g)) {
    const start = match.index + match[0].length - match[1].length;
    const rest = command.slice(start, start + match[1].length);
    if (!/\s-delete\b|\s-exec(?:dir)?\s+["']?(?:rm|del|Remove-Item|unlink|shred)\b/i.test(` ${rest}`)) continue;
    const roots = [];
    for (const token of tokenize(rest, shell)) {
      if (/^[-(!]/.test(token)) break;
      roots.push(token);
    }
    if (roots.length > 0 && roots.every((root) => isScratchTarget(root))) continue;
    deny('Blocked by .claude/hooks/guard.mjs: find with -delete or -exec rm inside the project. CLAUDE.md, Shell and file edits: an orphaned file is deleted one path at a time.');
  }
}

// The second view every command check judges: outside quotes, an apostrophe in a `# it's` comment would open a
// quote and hide every later line. Blanking can only add a refusal, since the as-written view is judged too.
function commentsBlanked(command, shell) {
  if (shell !== 'Bash' && shell !== 'PowerShell') return command;
  const escape = escapeChar(shell);
  // Only a whole word is a comment: `{#`, `$(pwd)#`, `a\ #b` and `a<#b` are text to the shell, and blanking them would hide what follows.
  const wordStart = (index) => index === 0 || (/[\s;&|]/.test(command[index - 1]) && command[index - 2] !== escape);
  let out = '';
  let quote;
  let braces = 0;
  let backtick = false;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    const block = shell === 'PowerShell' && command.startsWith('<#', index);
    if (escapedAt(quote, command, index, shell)) {
      out += command.slice(index, index + 2);
      index += 1;
    } else if (quote) {
      if (ch === quote) quote = undefined;
      out += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
    } else if (shell === 'Bash' && ch === '`') {
      backtick = !backtick;
      out += ch;
    } else if (shell === 'Bash' && ch === '$' && command[index + 1] === '{') {
      braces += 1;
      out += '${';
      index += 1;
    } else if (braces > 0 && ch === '}') {
      braces -= 1;
      out += ch;
    } else if (braces === 0 && (ch === '#' || block) && wordStart(index)) {
      const close = block ? command.indexOf('#>', index + 2) : command.indexOf('\n', index);
      let stop = close < 0 ? command.length : block ? close + 2 : close;
      const tick = backtick ? command.indexOf('`', index) : -1;
      if (tick >= 0 && tick < stop) stop = tick;
      out += command.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop - 1;
    } else {
      out += ch;
    }
  }
  return out;
}

// A `cd` at the head of a top-level command moves the cwd for every later call. Bash subshells are exempt, since a
// child's cwd dies with it; PowerShell's parentheses and script blocks move the session's own, so they are not.
function checkChdir(command, shell) {
  const bare = unquoted(heredocBodiesBlanked(command, shell), shell);
  let depth = 0;
  let start = 0;
  const pieces = [];
  for (let index = 0; index <= bare.length; index += 1) {
    const ch = bare[index];
    const opens = shell === 'Bash' && ch === '(';
    const closes = shell === 'Bash' && ch === ')';
    if (index === bare.length || opens || closes || ';|&\n{}()'.includes(ch)) {
      pieces.push({ text: bare.slice(start, index), depth });
      start = index + 1;
      if (opens) depth += 1;
      if (closes) depth = Math.max(0, depth - 1);
    }
  }
  for (const piece of pieces) {
    if (shell === 'Bash' && piece.depth > 0) continue;
    const head = stripLeading(tokenize(piece.text.trim(), shell))[0] ?? '';
    if (CHDIR.test(head)) {
      const retry =
        shell === 'Bash'
          ? 'Retry as (cd <abs tree> && your command) - the outer parentheses make a subshell and are required - or with absolute paths, git -C <tree>, npm --prefix <tree> run ...'
          : 'Retry with absolute paths, git -C <tree> or npm --prefix <tree> run ... - PowerShell has no subshell that keeps the cwd.';
      deny(`Blocked by .claude/hooks/guard.mjs: "${head}" at the top level moves the working directory for every later call, into the other worktree too. ${retry} (CLAUDE.md, Shell and file edits.)`);
    }
  }
}

// An interpreter heading a command reads its script on stdin when it is given `-`, or when a pipe, a heredoc or `<`
// feeds it and it names no script file (`node`, `node --input-type module`). `node -v` alone reads nothing, and a
// one-liner or `-m` runs its own code. A heredoc body is the fed script or data, never a command head.
function readsScriptFromStdin(command, shell) {
  const text = heredocBodiesBlanked(command, shell);
  let from = 0;
  return segments(text, shell).some((segment) => {
    const at = text.indexOf(segment, from);
    if (at >= 0) from = at + segment.length;
    const [head, ...rest] = stripLeading(tokenize(segment.trim(), shell));
    if (!STDIN_INTERPRETER.test((head ?? '').replace(/^.*[\\/]/, ''))) return false;
    // Read up to the command's own end, not the segment's: `segments` also splits at the `&` of `2>&1`.
    const own = text.slice(Math.max(at, 0)).split('\n')[0].split(/;|&&|\|/)[0];
    const fed = (at > 0 && /(?:^|[^|])\|[&\s({]*$/.test(text.slice(0, at))) || /<<|(?:^|\s)\d?<\s*[^<\s(]/.test(own);
    const words = [];
    for (let index = 0; index < rest.length; index += 1) {
      const redirect = /^\d*(<<<|<<-?|<|>>?|&>>?|>&)(.*)$/.exec(rest[index]);
      if (redirect) {
        if (!redirect[2]) index += 1;
      } else {
        words.push(rest[index]);
        if (STDIN_VALUE_FLAG.test(rest[index])) index += 1;
      }
    }
    // Only the interpreter's own flags, before `-` or the first operand: what follows is the script's arguments.
    const end = words.findIndex((word) => word === '-' || !word.startsWith('-'));
    if (words.slice(0, end < 0 ? words.length : end).some((word) => ONE_LINER_FLAG.test(word))) return false;
    if (words.includes('-')) return true;
    const operand = words.find((word) => !word.startsWith('-'));
    return fed && (operand === undefined || !/[\\/]|\.(?:[cm]?[jt]sx?|py|sh|ps1)$/i.test(operand));
  });
}

// Each heredoc body and its terminator blanked line by line, so no body line is read as a command. Only a `<<`
// outside quotes and comments opens one; a body that never ends, or one a shell reads, leaves the command as it is.
// `quotedOnly` blanks only the bodies the shell does not expand (`<<'EOF'`, `<<\EOF`): an unquoted one runs its `$(...)`.
function heredocBodiesBlanked(command, shell, quotedOnly = false) {
  if (shell !== 'Bash') return command;
  const pending = [];
  const blanked = command
    .split('\n')
    .map((line) => {
      if (pending.length > 0) {
        const { word, quoted } = pending[0];
        if (line.replace(/\r$/, '').replace(/^\t+/, '') === word) pending.shift();
        return quotedOnly && !quoted ? line : '';
      }
      const bare = unquoted(commentsBlanked(line, shell), shell);
      for (const match of line.matchAll(/<<-?\s*(\\?)(['"]?)([\w.-]+)\2/g)) {
        if (bare.startsWith('<<', match.index) && line[match.index - 1] !== '<') pending.push({ word: match[3], quoted: Boolean(match[1] || match[2]) });
      }
      return line;
    })
    .join('\n');
  return pending.length > 0 || SHELL_READER.test(blanked) ? command : blanked;
}

function checkCommand(command, context, depth = 0) {
  if (typeof command !== 'string') return;
  // Arithmetic `$(( $a > b ))` compares, it does not redirect; one holding a `$(` or a backtick keeps being checked.
  if (context.shell === 'Bash') command = command.replace(ARITHMETIC, (match) => ' '.repeat(match.length));
  // A heredoc body no shell reads is data or another program's code (`python3 - <<'X'`, `psql <<'SQL'`, notes into
  // /tmp): its `>`, `cd` and `git push` lines are not commands. An interpreter's body is judged as its code below.
  const code = heredocBodiesBlanked(command, context.shell);
  checkFind(code, context.shell);
  const bare = unquoted(command, context.shell);
  const escape = escapeChar(context.shell);
  for (const match of command.matchAll(DOTNET_WRITE)) {
    if (bare[match.index] !== '[') continue;
    judgeWrite([literalPath(callArguments(command, match.index + match[0].length, escape)[0])], 'a .NET file write');
  }
  for (const match of command.matchAll(DOTNET_COPY)) {
    if (bare[match.index] !== '[') continue;
    const args = callArguments(command, match.index + match[0].length, escape).map(literalPath);
    judgeWrite(match[1].toLowerCase() === 'copy' ? [args[1]] : [args[1], args[0]], `a .NET ${match[1]}`);
  }
  const stdinScript = readsScriptFromStdin(command, context.shell);
  // Text a later program runs, so no quoted argument in the command is data: a script fed on stdin, a string piped into iex.
  const fed = stdinScript || /\|\s*(?:iex|Invoke-Expression)\b/i.test(command);
  if (stdinScript) {
    for (const match of command.matchAll(SCRIPT_WRITE)) {
      const args = callArguments(command, match.index + match[0].length, '\\');
      if (/^open/i.test(match[1]) && !args.slice(1).some((arg) => WRITE_MODE.test(arg))) continue;
      judgeWrite([scriptWriteTarget(command, match, args)], `${match[1]} from a script an interpreter reads on stdin`);
    }
    for (const match of command.matchAll(SCRIPT_COPY)) {
      const args = callArguments(command, match.index + match[0].length, '\\').map(literalPath);
      judgeWrite(/rename|move/i.test(match[1]) ? [args[1], args[0]] : [args[1]], `${match[1]} from a script an interpreter reads on stdin`);
    }
    if (gitWritesAnywhere(command)) deny(GIT_REFUSAL);
  }
  for (const segment of segments(code, context.shell)) {
    const head = stripLeading(tokenize(segment.trim(), context.shell))[0] ?? '';
    const substitution = singleQuotesBlanked(segment, context.shell).includes('$(');
    const search = !substitution && SEARCH_COMMAND.test(head);
    // A one-liner keeps all its code in quotes, so a read before a write must not turn the whole segment into text.
    const readGit = !substitution && !INTERPRETER_ONE_LINER.test(segment) && GIT_READ_VERBS.has(firstGitVerb(segment, context.shell) ?? '');
    const words = commandWords(segment, context.shell);
    // A search's pattern, a read git verb's quoted argument and a quoted argument nothing runs are text, not commands.
    const text = search || readGit || !(substitution || fed || quotedRuns(segment, words)) ? unquoted(segment, context.shell) : segment;
    if (!search) {
      if (gitWrites(segment, context.shell)) deny(GIT_REFUSAL);
      if (ghWrites(text)) {
        deny('Blocked by .claude/hooks/guard.mjs: gh must not create, merge, edit or close anything - the author publishes.');
      }
      if (gitReadEscapes(segment, context.shell)) {
        deny('Blocked by .claude/hooks/guard.mjs: git grep -O / --open-files-in-pager starts a program and --output writes a file. Read git without them; a file is changed with Edit or Write.');
      }
      if (releaseWrites(words)) {
        deny('Blocked by .claude/hooks/guard.mjs: this tool commits, tags or pushes through git (npm / pnpm / yarn version, release-it, standard-version, semantic-release, lerna version / publish, changeset publish). CLAUDE.md: apply file changes only - the author commits; `npm version <v> --no-git-tag-version` only bumps the files.');
      }
      // No scratch exemption: an in-place edit's target cannot be told from the rest of the command, so a `/tmp/`
      // anywhere in the line would wave through a `sed -i` on a source.
      if (IN_PLACE_EDIT.test(normalizeGit(text)) || formatterWrites(words)) {
        deny('Blocked by .claude/hooks/guard.mjs: an in-place edit from the shell (sed -i, perl -i, ruby -i, awk -i inplace, yq -i, prettier --write, eslint --fix, stylelint --fix, black, isort, ruff format / --fix, gofmt -w, goimports -w, go fmt, golangci-lint --fix, dotnet format, csharpier, cargo fmt, rustfmt, ktlint -F, google-java-format -i, clang-format -i, rubocop -a). CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write; a check flag (--check, --diff, --verify-no-changes) only reads.');
      }
      for (const target of sedWriteTargets(words)) {
        if (target === SED_EXEC) {
          deny("Blocked by .claude/hooks/guard.mjs: sed's e command (or the e flag of s) runs a shell command no check reads. Run the command itself.");
        }
        if (!/^\/dev\/(?:stdout|stderr)$/.test(target) && !isScratchTarget(target)) {
          deny(`Blocked by .claude/hooks/guard.mjs: sed's w command writes "${target}". CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write; scratch output goes under the session scratchpad or /tmp.`);
        }
      }
    }
    if (INTERPRETER_ONE_LINER.test(segment)) {
      for (const match of segment.matchAll(SCRIPT_WRITE)) {
        const args = callArguments(segment, match.index + match[0].length, '\\');
        if (/^open/i.test(match[1]) && !args.slice(1).some((arg) => WRITE_MODE.test(arg))) continue;
        judgeWrite([scriptWriteTarget(segment, match, args)], `${match[1]} from inside an interpreter one-liner`);
      }
      for (const match of segment.matchAll(SCRIPT_COPY)) {
        const args = callArguments(segment, match.index + match[0].length, '\\').map(literalPath);
        judgeWrite(/rename|move/i.test(match[1]) ? [args[1], args[0]] : [args[1]], `${match[1]} from inside an interpreter one-liner`);
      }
    }
    if (!search) checkMovers(segment, context);
  }
  for (const match of unquoted(code, context.shell).matchAll(WRITE_TARGET)) {
    // Read from the command at the match's offsets, where a held blank is still the blank it was (`> "<root>/a b.log"`).
    const start = match.index + match[0].length - match[1].length;
    const written = code.slice(start, start + match[1].length);
    const target = escape ? written.split(`${escape} `).join(' ') : written;
    if (!isScratchTarget(target)) {
      deny(`Blocked by .claude/hooks/guard.mjs: a shell write to "${target}". CLAUDE.md, Shell and file edits: repo files are changed with Edit or Write; scratch output goes under the session scratchpad or /tmp. Only $S, $TMP, $TEMP, $SCRATCH, $TMPDIR, $M, $env:TEMP, %TEMP% and a name set from mktemp resolve as scratch.`);
    }
  }
  if (depth < MAX_BODY_DEPTH) {
    for (const { shell, body } of shellBodies(code, context.shell)) {
      for (const view of new Set([body, commentsBlanked(body, shell)])) checkCommand(view, { ...context, shell }, depth + 1);
    }
  }
  // Each body is strictly shorter than the command, so this recursion ends without a depth cap. A quoted heredoc's
  // `$(...)` is text; an unquoted one's runs.
  const expanded = heredocBodiesBlanked(command, context.shell, true);
  for (const body of substitutionBodies(expanded, context.shell)) checkCommand(body, context, depth);
  if (context.shell === 'Bash') for (const body of backtickBodies(expanded)) checkCommand(body, context, depth);
}

function judgeWrite(targets, what) {
  for (const target of targets) {
    if (target !== undefined && isScratchTarget(target)) continue;
    deny(`Blocked by .claude/hooks/guard.mjs: ${what} (${target ? `"${target}"` : 'a computed path'}). CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write, and a script that writes goes in a file under the scratchpad.`);
  }
}

function nativePath(target) {
  return target.replace(/^\/([A-Za-z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`);
}

function projectRoot(cwd) {
  if (CODEX) return path.resolve(process.env.CLAUDE_PROJECT_DIR || HOOK_ROOT);
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd());
}

// The path with its deepest existing ancestor resolved through links: Node realpaths this file's own location, while
// the harness may spell the same folder through a link or a junction.
function canonical(target) {
  let head = path.resolve(target);
  const tail = [];
  for (;;) {
    try {
      return path.join(realpathSync.native(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return path.resolve(target);
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

function within(base, target) {
  return target === base || target.startsWith(base.endsWith(path.sep) ? base : `${base}${path.sep}`);
}

function insideProject(filePath, cwd) {
  const root = projectRoot(cwd).toLowerCase();
  const resolved = path.resolve(cwd || process.cwd(), nativePath(filePath)).toLowerCase();
  if (within(root, resolved)) return true;
  return CODEX && within(canonical(projectRoot(cwd)).toLowerCase(), canonical(path.resolve(cwd || process.cwd(), nativePath(filePath))).toLowerCase());
}

// The path from the project root, forward slashes; under Codex a relative path starts at a cwd that may be a subfolder.
function projectRelative(target, cwd) {
  const absolute = path.resolve(cwd || process.cwd(), nativePath(target));
  const lexical = path.relative(projectRoot(cwd), absolute);
  const relative = lexical.startsWith('..') || path.isAbsolute(lexical) ? path.relative(canonical(projectRoot(cwd)), canonical(absolute)) : lexical;
  return relative.replace(/\\/g, '/');
}

// What neither the delete grant nor a patch may touch: a PROTECTED_PATHS match, `.git`, the hooks and the settings.
// Under Codex also the layer's own files, each judged as typed and as the path resolves from the project root.
function guardedPath(target, cwd) {
  const normal = normalizedPath(target);
  if (isProtected(normal) || GIT_DIR.test(normal) || SHELL_PROTECTED.test(normal)) return true;
  if (!CODEX) return false;
  const relative = projectRelative(target, cwd);
  const absolute = path.resolve(cwd || process.cwd(), nativePath(target));
  return CODEX_LAYER.test(normal) || CODEX_LAYER.test(relative) || isProtected(absolute) || GIT_DIR.test(relative) || SHELL_PROTECTED.test(relative);
}

function isDirectory(target, cwd) {
  try {
    return statSync(path.resolve(cwd || process.cwd(), nativePath(target))).isDirectory();
  } catch {
    return false;
  }
}

function existsAsWritten(target, cwd) {
  try {
    statSync(path.resolve(cwd || process.cwd(), nativePath(target)));
    return true;
  } catch {
    return false;
  }
}

function isProtected(target) {
  const slashed = target.replace(/\\/g, '/');
  return PROTECTED_PATHS.some((pattern) => pattern.test(slashed));
}

function fencedPath(target, cwd, allowed) {
  const relative = path.relative(projectRoot(cwd), path.resolve(cwd || process.cwd(), nativePath(target))).replace(/\\/g, '/');
  return allowed.test(relative);
}

function isOutsideProject(target) {
  // `\\?\` (normalized to `/?/`) is the Win32 long-path prefix, not part of the path.
  const plain = target.replace(/^\/\?\//, '');
  if (!/^(?:[A-Za-z]:[\\/]|\/[A-Za-z]\/|\/)/.test(plain)) return false;
  // An ancestor holds the project, so a recursive delete there removes it too.
  const resolved = path.resolve(nativePath(plain.replace(/\/[^/]*[*?[].*$/, '/'))).toLowerCase();
  const root = projectRoot(undefined).toLowerCase();
  if (root.startsWith(resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`)) return false;
  if (CODEX) {
    const real = canonical(nativePath(plain.replace(/\/[^/]*[*?[].*$/, '/'))).toLowerCase();
    if (canonical(projectRoot(undefined)).toLowerCase().startsWith(real.endsWith(path.sep) ? real : `${real}${path.sep}`)) return false;
  }
  return !insideProject(nativePath(plain), undefined);
}

// `S="<path>"; cp a "$S/b"`: a variable a leading statement sets to a literal reads as that literal, so the path is judged, not refused unseen.
// Leading only, and never a name the rest assigns, loops over, reads into or unsets: elsewhere its value at the use is not known here.
const LEADING_ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_]\w*)=("[^"'$`\\]*"|'[^"'$`\\]*'|[^\s;&|$`"'()<>\\]*)[ \t]*(?:;|&&|\n)/;
const SHELL_MANAGED =
  /^(?:_|IFS|PWD|OLDPWD|REPLY|MAPFILE|RANDOM|SRANDOM|SECONDS|LINENO|BASHPID|EPOCHSECONDS|EPOCHREALTIME|BASH_REMATCH|BASH_COMMAND|PIPESTATUS|OPTARG|OPTIND|HISTCMD)$/;

function withLeadingLiterals(command, shell) {
  if (shell !== 'Bash') return command;
  const values = new Map();
  const raws = new Map();
  let rest = command;
  for (let match = rest.match(LEADING_ASSIGNMENT); match; match = rest.match(LEADING_ASSIGNMENT)) {
    values.set(match[1], match[2].replace(/^(["'])(.*)\1$/, '$2'));
    raws.set(match[1], match[2]);
    rest = rest.slice(match[0].length);
  }
  // Pasted back, a value with shell syntax or a quoted `~` reads unlike the data Bash expands, and Bash rewrites its own variables (`cd` sets PWD).
  for (const [name, value] of values) {
    if (/[;&|<>(){}#\n]/.test(value) || /^["']~/.test(raws.get(name)) || SHELL_MANAGED.test(name)) return unresolvedScratchNames(command, values, raws);
  }
  // Grammar the scan below does not follow, or that can rebind a name unseen: no substitution, the old refusal stands.
  if (/(?:^|[\s;&|(])#|<<|\$'|\(\(|(?:^|[\s;&|(])(?:eval|source|\.|getopts)(?=\s)/.test(rest)) return unresolvedScratchNames(command, values, raws);
  const rebound = new Map();
  for (const name of values.keys()) {
    const rebinds = new RegExp(`(?:^|[^\\w$])(?:${name}(?:\\[[^\\]]*\\])?\\+?=|(?:for|select)\\s+${name}\\b|(?:read|unset|declare|typeset|local|mapfile|readarray)\\b[^;&|\\n]*\\b${name}\\b|printf\\s+-v\\s+${name}\\b|\\$\\{${name}:?=|\\{${name}\\}[<>])`);
    if (rebinds.test(rest)) {
      rebound.set(name, values.get(name));
      values.delete(name);
    }
  }
  if (values.size === 0) return unresolvedScratchNames(command, rebound, raws);
  let out = command.slice(0, command.length - rest.length);
  let single = false;
  let double = false;
  for (let index = 0; index < rest.length; index += 1) {
    const ch = rest[index];
    if (ch === "'" && !double && (single || rest[index - 1] !== '\\')) single = !single;
    if (ch === '"' && !single && rest[index - 1] !== '\\') double = !double;
    const use = !single && ch === '$' && rest[index - 1] !== '\\' ? rest.slice(index).match(/^\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*)(?!\w))/) : null;
    const name = use && (use[1] ?? use[2]);
    if (name && values.has(name)) {
      out += values.get(name);
      index += use[0].length - 1;
      continue;
    }
    out += ch;
  }
  // The scan substitutes only `$S` and `${S}`; `${S%/}` is left for the rename below.
  return unresolvedScratchNames(single || double ? command : out, new Map([...values, ...rebound]), raws);
}

// `T=$(mktemp)` names a fresh temp path, so each later `$T` / `${T}` reads as a scratch variable - unless the name is
// bound any other way in the command, or the template or `-p` directory lies inside the project (`mktemp x.XXXX` is the cwd).
const MKTEMP_ASSIGNMENT = /(?:^|[;&|\n({])\s*(?:export\s+)?([A-Za-z_]\w*)=(?:"\$\(\s*mktemp\b([^()`;&|]*)\)"|\$\(\s*mktemp\b([^()`;&|"]*)\)|`\s*mktemp\b([^()`;&|]*)`)(?=[\s;&|)]|$)/g;

function mktempScratch(args) {
  const words = shellWords(args.trim());
  let rooted = false;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const dir = /^(?:-p|--tmpdir)$/.test(word) ? words[(index += 1)] : (/^--tmpdir=(.*)$/.exec(word) ?? /^-p(.+)$/.exec(word))?.[1];
    if (dir !== undefined || /^(?:-[a-zA-Z]*t[a-zA-Z]*|--tmpdir)$/.test(word)) {
      if (dir !== undefined && !isScratchTarget(dir)) return false;
      rooted = true;
    } else if (!word.startsWith('-') && (!rooted || /[\\/]/.test(word)) && !isScratchTarget(word)) return false;
  }
  return true;
}

// PowerShell's own: `$t = New-TemporaryFile`, `(New-TemporaryFile).FullName`, `[IO.Path]::GetTempFileName()`.
const TEMPFILE_ASSIGNMENT =
  /(?:^|[;\n{(|])\s*\$([A-Za-z_]\w*)\s*=\s*(?:New-TemporaryFile|\(\s*New-TemporaryFile\s*\)\.FullName|\[(?:System\.)?IO\.Path\]::GetTempFileName\(\s*\))\s*(?=[;\n})|]|$)/gi;

function withMktempNames(command, shell) {
  const powershell = shell === 'PowerShell';
  if (shell !== 'Bash' && !powershell) return command;
  // PowerShell's variable names ignore case.
  const key = (name) => (powershell ? name.toLowerCase() : name);
  const assigned = new Map();
  for (const match of command.matchAll(powershell ? TEMPFILE_ASSIGNMENT : MKTEMP_ASSIGNMENT)) {
    const entry = assigned.get(key(match[1])) ?? { name: match[1], count: 0, scratch: true, at: match.index + match[0].length };
    entry.count += 1;
    entry.scratch &&= powershell || mktempScratch(match[2] ?? match[3] ?? match[4] ?? '');
    assigned.set(key(match[1]), entry);
  }
  for (const [id, { name, count, scratch }] of assigned) {
    const assignments = powershell
      ? (command.match(new RegExp(`\\$${name}\\s*[-+*/]?=(?!=)`, 'gi'))?.length ?? 0)
      : (command.match(new RegExp(`(?:^|[^\\w$])${name}(?:\\[[^\\]]*\\])?\\+?=`, 'g'))?.length ?? 0);
    const binds = powershell
      ? new RegExp(`foreach\\s*\\(\\s*\\$${name}\\b|-(?:OutVariable|ov|ErrorVariable|ev|WarningVariable|wv|InformationVariable|iv|PipelineVariable|pv|Variable|Name)\\s*:?\\s*['"]?${name}\\b|\\[ref\\]\\s*\\$${name}\\b`, 'i')
      : new RegExp(`(?:^|[^\\w$])(?:(?:for|select)\\s+${name}\\b|(?:read|unset|declare|typeset|local|mapfile|readarray)\\b[^;&|\\n]*\\b${name}\\b|printf\\s+-v\\s*${name}\\b|\\$\\{${name}:?=|\\{${name}\\}[<>])`);
    if (!scratch || assignments !== count || binds.test(command)) assigned.delete(id);
  }
  if (assigned.size === 0) return command;
  const visible = singleQuotesBlanked(command, shell);
  return command.replace(/\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*)(?![\w:]))/g, (whole, braced, bare, offset) => {
    const entry = assigned.get(key(braced ?? bare));
    return entry && offset >= entry.at && visible[offset] === '$' ? `$TMP/__mktemp_${entry.name}` : whole;
  });
}

// Unsubstituted, `$S` would pass as scratch by its name alone, whatever the command set it to.
function unresolvedScratchNames(command, values, raws) {
  let out = command;
  for (const [name, value] of values) {
    if (/^(?:S|TMP|TEMP|SCRATCH|TMPDIR|M)$/i.test(name) && (!isScratchTarget(value) || /^["']~/.test(raws.get(name)))) {
      out = out.replace(new RegExp(`\\$(\\{?)${name}(?!\\w)`, 'g'), `$$$1__unresolved_${name}`);
    }
  }
  return out;
}

function isScratchTarget(target) {
  // A scratch variable is read as written; a literal path is scratch only outside the project, after `..` is
  // resolved, so `./tmp/x` and `<root>/tmp/../src` are not. The cwd forms name the project.
  const cwdRooted = target.replace(/^(?:\$\{?PWD\}?|%CD%|\$\(\s*(?:pwd|Get-Location)\s*\))(?=[\\/]|$)/i, '.');
  if (/^[$%]/.test(cwdRooted)) return SCRATCH_TARGET.test(cwdRooted);
  const normal = normalizedPath(cwdRooted);
  if (/^(?:nul|\/dev\/null)$/i.test(normal)) return true;
  if (normal.startsWith('~/')) return SCRATCH_TARGET.test(normal);
  return isOutsideProject(normal);
}

function checkWrite(input, context) {
  const filePath = input.file_path;
  if (typeof filePath !== 'string') return;
  if (isProtected(filePath)) {
    deny(`Blocked by .claude/hooks/guard.mjs: ${filePath} is generated or externally owned (PROTECTED_PATHS). CLAUDE.md: never hand-edit it - regenerate, or report the problem at its source.`);
  }
  if (!insideProject(filePath, context.cwd)) return;
  if (context.fence && !fencedPath(filePath, context.cwd, context.fence.allowed)) {
    deny(`Blocked by .claude/hooks/guard.mjs: ${context.fence.agent} may write only ${context.fence.what} inside the project, not ${filePath}.`);
  }
  const texts = [];
  if (typeof input.content === 'string') texts.push(input.content);
  if (typeof input.new_string === 'string') texts.push(input.new_string);
  if (Array.isArray(input.edits)) for (const edit of input.edits) if (typeof edit?.new_string === 'string') texts.push(edit.new_string);
  for (const text of texts) {
    // A line that states the rule ("plain hyphen") may spell the banned characters, so the exemption is per line.
    for (const line of text.split(/\r?\n/)) {
      if (DASH.test(line) && !/plain hyphen/.test(line)) {
        deny(`Blocked by .claude/hooks/guard.mjs: a line written to ${filePath} contains a dash character. CLAUDE.md, Punctuation: plain hyphens only, everywhere. The line: ${line.trim().slice(0, 120)}`);
      }
    }
  }
}

// ---- OpenAI Codex: everything from here to the main block runs only under the switch. ----

// The grammar a Codex `Bash` call is judged by: the shell the call names when it names one, otherwise the platform's.
function codexShell(tool, named) {
  const name = toolName(Array.isArray(named) ? named[0] : typeof named === 'string' ? named : '').toLowerCase();
  if (/^(?:bash|sh|zsh|dash|ksh)$/.test(name)) return 'Bash';
  if (/^(?:pwsh|powershell)$/.test(name)) return 'PowerShell';
  if (name === 'cmd') return 'cmd';
  return tool === 'PowerShell' || process.platform === 'win32' ? 'PowerShell' : 'Bash';
}

// A command handed over as an argument list, written back as the one line a shell would get: every word that is not
// plain goes into double quotes, so `node -e <code>` and `bash -lc <script>` are read as they run.
function commandLine(parts, shell) {
  const escape = shell === 'PowerShell' ? '`' : '\\';
  const special = shell === 'PowerShell' ? /[`"$]/g : /[\\"$`]/g;
  return parts
    .filter((part) => typeof part === 'string')
    .map((part) => (/^[\w@%+=:,./\\-]+$/.test(part) ? part : `"${part.replace(special, (ch) => escape + ch)}"`))
    .join(' ');
}

// Every file a patch names. Headers are read with padding and in any case, wider than the grammar, so a path the
// engine would accept is never missed; a `Move to` belongs to the `Update File` above it.
function patchOps(text) {
  const ops = [];
  let current;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const head = /^\s*\*\*\* (Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/i.exec(line);
    if (head && /^move to$/i.test(head[1])) {
      if (current?.kind === 'update' && current.moveTo === undefined) current.moveTo = head[2];
      else ops.push((current = { kind: 'add', path: head[2], added: [] }));
    } else if (head) {
      ops.push((current = { kind: head[1].split(' ')[0].toLowerCase(), path: head[2], added: [] }));
    } else if (current && line.startsWith('+')) {
      current.added.push(line.slice(1));
    }
  }
  return ops;
}

// A patch is judged file by file: a written path as Edit / Write are, a removed one (Delete File, the source of a
// Move) as the shell delete grant is. Returns the project paths it writes, for the path rules.
function checkPatch(text, context) {
  const ops = typeof text === 'string' ? patchOps(text) : [];
  if (ops.length === 0) {
    deny('Blocked by .claude/hooks/guard.mjs: no `*** Add File:`, `*** Update File:` or `*** Delete File:` header was found in this patch, so it cannot be judged. Send the patch in that form.');
  }
  const inside = (target) => insideProject(target, context.cwd);
  const written = ops.filter((op) => op.kind !== 'delete').map((op) => ({ target: op.moveTo ?? op.path, plain: op.kind === 'update' && op.moveTo === undefined }));
  const removed = ops.filter((op) => op.kind === 'delete' || op.moveTo !== undefined).map((op) => op.path);
  for (const { target, plain } of written) {
    if (isProtected(target) || isProtected(path.resolve(context.cwd || process.cwd(), nativePath(target)))) {
      deny(`Blocked by .claude/hooks/guard.mjs: ${target} is generated or externally owned (PROTECTED_PATHS). CLAUDE.md: never hand-edit it - regenerate, or report the problem at its source.`);
    }
    if (!inside(target)) continue;
    if (guardedPath(target, context.cwd)) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${target}" is under .git or is one of the layer's own files (.codex/hooks, hooks.json, rules, agents, config.toml). The developer changes those, not a session - say what should change.`);
    }
    if (context.fence && !(context.fence.updates ? plain : fencedPath(target, context.cwd, context.fence.allowed))) {
      deny(fenceRefusal(context.fence, `"${target}"`));
    }
  }
  for (const target of removed) {
    if (!inside(target)) continue;
    if (!NODE_MODULES.test(normalizedPath(target))) context.deleted.add(projectRelative(target, context.cwd).toLowerCase());
    if (context.deleted.size > 1) {
      deny('Blocked by .claude/hooks/guard.mjs: this patch removes more than one project path. CLAUDE.md, Shell and file edits: an orphaned file is deleted one path at a time.');
    }
    if (guardedPath(target, context.cwd)) {
      deny(`Blocked by .claude/hooks/guard.mjs: this patch would remove "${target}", a generated or externally owned path, a path under .git or one of the layer's own files. The developer removes those, not a session.`);
    }
    if (context.fence && !fencedPath(target, context.cwd, context.fence.allowed)) {
      deny(fenceRefusal(context.fence, `"${target}"`));
    }
  }
  const projectWrites = written.filter(({ target }) => inside(target)).map(({ target }) => target);
  // Every added line of the patch, whichever header it follows: a padded header look-alike must not take lines out of the check.
  if (projectWrites.length > 0) {
    for (const op of ops) {
      for (const line of op.added) {
        if (DASH.test(line) && !/plain hyphen/.test(line)) {
          deny(`Blocked by .claude/hooks/guard.mjs: a line written to ${op.moveTo ?? op.path} contains a dash character. CLAUDE.md, Punctuation: plain hyphens only, everywhere. The line: ${line.trim().slice(0, 120)}`);
        }
      }
    }
  }
  return projectWrites;
}

function expandBraces(glob) {
  const open = glob.indexOf('{');
  const close = open < 0 ? -1 : glob.indexOf('}', open);
  if (close < 0 || glob.slice(open + 1, close).includes('{')) return [glob];
  return glob
    .slice(open + 1, close)
    .split(',')
    .flatMap((alternative) => expandBraces(glob.slice(0, open) + alternative + glob.slice(close + 1)));
}

// A rule glob as Claude Code's rule loader reads one, so a rule file reaches the same files under both tools: a
// trailing `/**` is stripped first; what is left matches from the root when it holds a slash and at any depth when it
// does not; a match on a folder covers everything under it.
function globRegex(glob) {
  const rooted = glob.startsWith('/');
  let body = glob.replace(/^\.?\//, '').replace(/\/+$/, '');
  if (body.endsWith('/**')) body = body.slice(0, -3);
  let source = '';
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index];
    if (ch === '*' && body[index + 1] === '*') {
      const slash = body[index + 2] === '/';
      source += slash ? '(?:.*/)?' : '.*';
      index += slash ? 2 : 1;
    } else if (ch === '*') source += '[^/]*';
    else if (ch === '?') source += '[^/]';
    else if (ch === '[' && body.indexOf(']', index + 2) > 0) {
      const close = body.indexOf(']', index + 2);
      source += `[${body.slice(index + 1, close).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
      index = close;
    } else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${rooted || body.includes('/') ? '' : '(?:.*/)?'}${source}(?:/.*)?$`, PATH_FLAGS);
}

// Every `*.md` in RULES_DIR is a rule. Its globs are the items of the `paths:` block list in its frontmatter; with no
// such list it reaches every path, as a rule without `paths:` loads in every session.
function loadRules(root) {
  let files;
  try {
    files = readdirSync(path.join(root, RULES_DIR)).filter((file) => file.endsWith('.md')).sort();
  } catch {
    return [];
  }
  return files.flatMap((file) => {
    let text;
    try {
      text = readFileSync(path.join(root, RULES_DIR, file), 'utf8');
    } catch {
      return [];
    }
    const lines = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1].split(/\r?\n/) ?? [];
    const at = lines.findIndex((line) => /^paths\s*:/.test(line));
    const globs = [];
    for (const line of at < 0 ? [] : lines.slice(at + 1)) {
      if (/^[^\s#-]/.test(line)) break;
      const item = /^\s*-\s+(['"]?)(.+?)\1\s*$/.exec(line)?.[2];
      if (item) globs.push(item);
    }
    return [{ file: `${RULES_DIR}/${file}`, marker: file.replace(/[^\w.-]/g, '_'), globs: globs.length > 0 ? globs : undefined }];
  });
}

function rulesFor(relatives, root) {
  const reaches = (rule, file) => rule.globs === undefined || rule.globs.some((glob) => expandBraces(glob).some((alternative) => globRegex(alternative).test(file)));
  return loadRules(root).filter((rule) => relatives.some((file) => reaches(rule, file)));
}

// A session id or agent id becomes a folder name: anything but a plain token is treated as absent.
function markerId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) ? value : undefined;
}

// Codex scopes instructions by directory only, so the guard carries the path rules: once every other check has
// passed, the first patch that writes a path a rule reaches is refused with the rule file to read - once per session
// and agent. Where that cannot be noted, nothing is refused and the same sentence rides along as context.
function ruleGate(targets, payload, context) {
  if (targets.length === 0) return;
  const relatives = targets.map((target) => projectRelative(target, context.cwd));
  const session = markerId(payload.session_id);
  const folder = session ? path.join(RULE_MARKERS, session, markerId(payload.agent_id) ?? 'main') : undefined;
  const fresh = rulesFor(relatives, projectRoot(context.cwd)).filter((rule) => !folder || !existsSync(path.join(folder, rule.marker)));
  if (fresh.length === 0) return;
  const sentence = `Path rules apply to ${relatives.join(', ')}: read ${fresh.map((rule) => rule.file).join(', ')} in full, then retry this patch.`;
  let noted = folder !== undefined;
  try {
    if (folder) {
      mkdirSync(folder, { recursive: true });
      for (const rule of fresh) writeFileSync(path.join(folder, rule.marker), '');
    }
  } catch {
    noted = false;
  }
  if (noted) deny(`Blocked by .claude/hooks/guard.mjs: ${sentence} A rule file is named once per session.`);
  try {
    writeSync(1, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: sentence } })}\n`);
  } catch {
    // Nothing left to say it through.
  }
}

// A compacted or cleared session has lost the rule text it read: its notes go, and so do folders nobody used for two weeks.
function forgetRules(payload) {
  try {
    const session = markerId(payload.session_id);
    if (session && (payload.source === 'compact' || payload.source === 'clear')) rmSync(path.join(RULE_MARKERS, session), { recursive: true, force: true });
    const stale = Date.now() - 14 * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(RULE_MARKERS)) {
      if (statSync(path.join(RULE_MARKERS, name)).mtimeMs < stale) rmSync(path.join(RULE_MARKERS, name), { recursive: true, force: true });
    }
  } catch {
    // No notes yet, or a folder in use: nothing to forget.
  }
}

function codexCall(payload) {
  if (payload.hook_event_name === 'SessionStart') {
    forgetRules(payload);
    return;
  }
  if (payload.hook_event_name !== undefined && payload.hook_event_name !== 'PreToolUse') return;
  if (LIST_ERROR) {
    deny(`Blocked by .claude/hooks/guard.mjs: ${LIST_ERROR} in .claude/hooks/guard.mjs. Until the developer fixes that list the guard refuses every call - tell them, and do not work around it.`);
  }
  // The guard of one tree run for a session in another would call that tree's files outside the project and pass them.
  if (typeof payload.cwd === 'string' && !insideProject(payload.cwd, payload.cwd)) {
    deny(`Blocked by .claude/hooks/guard.mjs: this guard protects ${projectRoot()} and the session runs in ${payload.cwd}, outside it. Start the session inside that project, or install the layer in this one.`);
  }
  const tool = payload.tool_name;
  const input = payload.tool_input ?? {};
  const workdir = [input.workdir, input.cwd].find((value) => typeof value === 'string' && value);
  const fence = CODEX_FENCED_AGENTS.get(payload.agent_type);
  const context = {
    cwd: workdir ? path.resolve(payload.cwd || process.cwd(), nativePath(workdir)) : payload.cwd,
    shell: codexShell(tool, input.shell),
    fence: fence ? { agent: payload.agent_type, ...fence } : undefined,
    deleted: new Set(),
  };
  if (tool === 'apply_patch' || tool === 'Edit' || tool === 'Write') {
    const patch = [input.command, input.patch, input.input].find((value) => typeof value === 'string');
    ruleGate(checkPatch(patch, context), payload, context);
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    const { shell } = context;
    const typed = typeof input.command === 'string' ? input.command : Array.isArray(input.command) ? commandLine(input.command, shell) : undefined;
    if (typed === undefined) return;
    // First, so its own reason is the one given: a patch through the shell is a write no check below can read.
    if (segments(typed, shell).some((segment) => /^(?:apply_patch|applypatch)$/i.test(toolName(commandWords(segment, shell)[0])))) {
      deny('Blocked by .claude/hooks/guard.mjs: a patch sent through the shell, which this guard cannot read. Send it with the apply_patch tool itself.');
    }
    const command = withLeadingLiterals(withMktempNames(typed, shell), shell);
    for (const view of new Set([command, commentsBlanked(command, shell)])) {
      checkChdir(view, shell);
      checkCommand(view, context);
    }
  }
}

// `node guard.mjs --harness codex --rules-for <file>...` prints the rule files that reach those paths: a reviewer
// never patches, so whoever briefs it reads the rules for the changed files here.
if (CODEX && process.argv.includes('--rules-for')) {
  const files = process.argv.slice(process.argv.indexOf('--rules-for') + 1).filter((arg) => !arg.startsWith('--'));
  for (const rule of rulesFor(files.map((file) => projectRelative(file, process.cwd())), projectRoot())) console.log(rule.file);
  process.exit(0);
}

try {
  const payload = JSON.parse(await readStdin());
  if (CODEX) {
    codexCall(payload);
    process.exit(0);
  }
  const tool = payload.tool_name;
  const input = payload.tool_input ?? {};
  // Without an agent type in the payload the fence does not apply - fail open, the prompt still carries it.
  // `deleted` collects the project paths deleted across the whole call, for the one-path delete cap.
  const context = {
    cwd: payload.cwd,
    shell: tool,
    fence: FENCED_AGENTS.has(payload.agent_type) ? { agent: payload.agent_type, ...FENCED_AGENTS.get(payload.agent_type) } : undefined,
    deleted: new Set(),
  };
  if ((tool === 'Bash' || tool === 'PowerShell') && typeof input.command === 'string') {
    input.command = withLeadingLiterals(withMktempNames(input.command, tool), tool);
    // Both views, refused if either refuses: the raw one is never looser than the blanker's guesses about shell grammar.
    for (const command of new Set([input.command, commentsBlanked(input.command, tool)])) {
      checkChdir(command, tool);
      checkCommand(command, context);
    }
  } else if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') checkWrite(input, context);
  else if (tool === 'NotebookEdit') checkWrite({ file_path: input.notebook_path, new_string: input.new_source }, context);
} catch {
  // Unparseable input: allow. The deny list in settings.json and the rules still apply.
}
process.exit(0);
