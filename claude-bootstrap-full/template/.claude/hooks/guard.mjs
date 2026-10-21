#!/usr/bin/env node
// PreToolUse guard: refuses the tool calls CLAUDE.md forbids outright, before they run.
//   Bash / PowerShell - a git verb that commits, stages, publishes or discards work wherever it sits in the
//                       command (behind `git -C`, `$(...)`, `xargs`, `cmd /c`, a quoted path to the binary, an
//                       interpreter one-liner or a `bash -c` / `iex` body), a read git verb that runs a program
//                       or writes a file (`git grep -O<cmd>`, `--output=<file>`), a `gh` call that writes, a shell
//                       write or in-place edit into the project, a copy or move whose target is inside the
//                       project, a delete beyond the one grant (one non-recursive project path per call, never a
//                       protected path, `.git`, the hooks, the settings or a session ledger), and a `cd` that
//                       moves the working directory for every later call. A Bash variable a leading statement
//                       sets to a literal (`S="<path>"; cp a "$S/b"`) is judged as that literal.
//   Edit / Write      - a path matching PROTECTED_PATHS (generated or externally owned files), any written line
//                       carrying a dash character, for an agent in FENCED_AGENTS (`hunt` / `integration`) any
//                       project path but the ones its entry allows, and a `.claude/sessions/*/agents.md` that
//                       record-activity.mjs keeps (`Write` always, `Edit` until the hook has created it).
// Registered in .claude/settings.json (tracked) - it is repo policy, like the deny list beside it.
// Reads one JSON payload on stdin; exit 2 with the reason on stderr blocks the call, exit 0 allows it.
// A guard that cannot parse its input allows the call: the deny list and the rules still stand behind it.
// Self-test: node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs
import { statSync } from 'node:fs';
import path from 'node:path';

// Paths the agent must never hand-edit, as regex sources tested against the tool's file_path with every
// backslash turned into "/" first - write them with forward slashes, matching the path's tail, e.g.
// "src/api/generated/", "\\.openapi\\.json$". Empty means nothing is protected. Filled by apply.mjs from
// GENERATED_PATHS as a JSON array inside the raw string; edit freely afterwards.
const PROTECTED_PATHS = JSON.parse(String.raw`<GENERATED_PATHS>` || '[]').map((source) => new RegExp(source));

// `stash` is not here: it is judged by an allow list in gitCallWrites.
const GIT_WRITE_VERBS = new Set([
  'commit', 'commit-tree', 'push', 'pull', 'reset', 'rebase', 'merge', 'mergetool', 'tag', 'cherry-pick', 'revert',
  'am', 'checkout', 'checkout-index', 'switch', 'restore', 'clean', 'add', 'stage', 'rm', 'mv', 'filter-branch',
  'update-ref', 'update-index', 'read-tree', 'replace', 'bisect', 'gc', 'maintenance', 'repack', 'prune', 'fast-import',
]);
const GIT_WRITE_SUBCOMMANDS = {
  remote: new Set(['add', 'set-url', 'rename', 'remove', 'rm', 'prune', 'set-head', 'set-branches']),
  reflog: new Set(['delete', 'expire']),
  'sparse-checkout': new Set(['init', 'set', 'add', 'reapply', 'disable']),
  submodule: new Set(['init', 'update', 'add', 'deinit', 'sync', 'foreach', 'set-url', 'set-branch', 'absorbgitdirs']),
  worktree: new Set(['remove', 'prune', 'add', 'move', 'lock', 'unlock', 'repair']),
  notes: new Set(['add', 'append', 'copy', 'edit', 'merge', 'prune', 'remove']),
};
const GIT_READ_VERBS = new Set(['log', 'show', 'diff', 'grep', 'blame', 'shortlog', 'status', 'rev-parse', 'ls-files']);
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);
// A search tool's arguments are patterns and paths: it cannot commit, publish or edit, so its segment skips those tests.
const SEARCH_COMMAND = /^(?:grep|egrep|fgrep|rg|ag|findstr|Select-String|sls)$/i;
const GH_MUTATING =
  /\bgh\s+(?:pr\s+(?:create|merge|close|edit|comment|delete|review|ready|reopen|lock|unlock)|issue\s+(?:create|close|edit|comment|delete|reopen|lock|unlock|pin|unpin|transfer|develop)|release\s+(?:create|delete|edit|upload)|repo\s+(?:create|delete|edit|fork|rename|archive|sync)|pr\s+checkout|gist\s+(?:create|edit|delete)|workflow\s+(?:run|enable|disable)|run\s+(?:rerun|cancel|delete)|(?:secret|variable)\s+(?:set|delete)|label\s+(?:create|edit|delete|clone))\b/;
// An interpreter that takes its script on stdin (`python - <<'EOF'`, `node <<EOF`, `... | node`) runs the lines after it.
const STDIN_INTERPRETER = /(?:^|[\s;&|(])(?:node|python[\d.]*|py|deno|bun)(?:\.exe)?(?:\s+-{1,2}[A-Za-z][\w-]*)*(?:\s+-)?\s*(?:<<|<\s*[^<\s]|[;&|)]|$)/m;
const INTERPRETER_ONE_LINER =
  /\b(?:node(?:\.exe)?(?:\s+-{1,2}\w[\w-]*(?:=\S+)?)*?\s+(?:-e|--eval|-p|--print|-pe)|python[\d.]*(?:\.exe)?(?:\s+-[A-Za-z]+(?:\s+[^-\s]\S*)?)*?\s+-c|py(?:\s+-\S+)*?\s+-c|(?:pwsh|powershell)(?:\.exe)?(?:\s+-\w+(?:\s+[^-\s"']\S*)?)*?\s+-c(?:ommand)?|iex|Invoke-Expression)\b/i;
const SCRIPT_WRITE =
  /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|rmSync|unlinkSync|truncateSync|mkdirSync|rmdirSync|openSync|open|os\.(?:remove|unlink|rmdir|mkdir|makedirs)|shutil\.rmtree|(?<=\.)rm)\s*\(/gi;
const WRITE_MODE = /^\s*(?:mode\s*=\s*)?(['"])[rbt]*[wax+][rbtwax+]*\1\s*$/;
const SCRIPT_COPY = /\b(copyFileSync|copyFile|cpSync|renameSync|rename|shutil\.(?:copy2?|copyfile|copytree|move))\s*\(/gi;
const DOTNET_WRITE = /\[(?:System\.)?IO\.(?:File|Directory)\]::(?:Write\w*|Append\w*|Delete|Create\w*)\s*\(/gi;
const DOTNET_COPY = /\[(?:System\.)?IO\.(?:File|Directory)\]::(Copy|Move|Replace)\s*\(/gi;
const SHELL_HEAD =
  /\b((?:bash|sh|zsh)(?:\.exe)?(?:\s+-{1,2}\w[\w-]*)*?\s+-[a-zA-Z]*c|cmd(?:\.exe)?(?:\s+\/[a-zA-Z](?::\S*)?)*?\s+\/\/?[cCkK]|(?:pwsh|powershell)(?:\.exe)?(?:\s+-\w+(?:\s+[^-\s"']\S*)?)*?\s+-c(?:ommand)?|iex|Invoke-Expression)\s+/;
const MOVER =
  /^(?:cp|mv|install|dd|truncate|patch|shred|rsync|ed|ex|tee|robocopy|xcopy|Copy-Item|Move-Item|Rename-Item|New-Item|Remove-Item|Clear-Content|Tee-Object|cpi|mi|ri|ni|rni|ren|rm|del|erase|rd|rmdir|copy|move|unlink|clc)$/i;
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
const AGENTS_LEDGER = /^\.claude\/sessions\/[^/]+\/agents\.md$/i;
// The delete grant: a file the change itself orphaned may be deleted from the shell, one path per call, with no
// recursive flag, and never inside `.git`, the hooks or the settings files (SHELL_PROTECTED) or a PROTECTED_PATHS match.
const DELETER = /^(?:rm|del|erase|ri|rd|rmdir|Remove-Item|unlink)$/i;
const GIT_DIR = /(?:^|[\\/])\.git(?:[\\/]|$)/;
const SHELL_PROTECTED = /(?:^|[\\/])\.claude[\\/](?:hooks(?:[\\/]|$)|settings(?:\.local)?\.json$)/i;
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
  /^-(?:ErrorAction|EA|WarningAction|WA|InformationAction|IA|ErrorVariable|EV|WarningVariable|WV|InformationVariable|IV|OutVariable|OV|OutBuffer|OB|PipelineVariable|PV|ItemType|Type|Filter|Include|Exclude|Encoding|Value|Target|Credential|Stream|Depth|Variable|Name)$/i;
const PATH_PARAMS = /^-(?:Path|LiteralPath|PSPath|LP|FilePath)$/i;
const DESTINATION_PARAMS = /^-(?:Destination|OutFile)$/i;
const COPIER_DESTINATION = /^(?:-t|--target-directory)$/;
const CURL_DESTINATION = /^(?:-[A-Za-z]*o|--output)$/;
const WGET_DESTINATION = /^(?:-[A-Za-z]*O|--output-document)$/;
const DOWNLOADER = /^(?:curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)$/i;
const IN_PLACE_EDIT =
  /\bg?sed\s+(?:-\S+\s+)*(?:-[a-zA-Z]*i[a-zA-Z]*\b|--in-place)|\bperl\s+(?:-\S+\s+)*-[pnlaws]*i(?:\.\S*|[pnlaeEws]*)?(?=\s|$)|\bg?awk\b[^|]*-i\s*inplace|\b(?:Set-Content|Add-Content|Out-File)\b|\b(?:npx|bunx|pnpm(?:\s+(?:exec|dlx))?|yarn(?:\s+dlx)?|npm\s+exec(?:\s+--)?)(?:\s+-{1,2}\w[\w-]*)*\s+prettier\b[^|;&]*\s(?:--write|-w)\b|\b(?:npx|bunx|pnpm(?:\s+(?:exec|dlx))?|yarn(?:\s+dlx)?|npm\s+exec(?:\s+--)?)(?:\s+-{1,2}\w[\w-]*)*\s+eslint\b[^|;&]*\s--fix(?![\w-])|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint\b[^|;&]*\s--fix(?![\w-])|\bbiome\b[^|;&]*\s--(?:write|fix|apply)\b/i;
// A redirect target: `> file`, `>> file`, `2> file` (`tee` is a mover). The lookbehind keeps `<>`, `||`, `>>` and
// an arrow function's `=>` from reading as a redirect. `>|` forces an overwrite and `>& file` / `&> file` send both
// streams into it; `2>&1` names no file.
const WRITE_TARGET = /(?:(?<![<>|=])[\d&]?>{1,2}\|?(?!&)|(?<![<>|=\d])>&(?![\d-]))\s*["']?([^\s"'|;&)}]+)/g;
// Allowed targets: the null devices, a temp or scratchpad path, or a shell variable that names one ($S, $TMP,
// $TEMP, $SCRATCH, $TMPDIR, $env:TEMP, %TEMP%) or the memory directory ($M). Everything else - a relative path, a
// path under the project, an unknown variable - is a write the Edit / Write tools should make.
const SCRATCH_TARGET = /\/dev\/null|^\$null$|^nul$|\/tmp\/|[\\/]Temp[\\/]|scratchpad|^\$\{?(?:S|TMP|TEMP|SCRATCH|TMPDIR|M)\b|\$env:te?mp\b|%te?mp%/i;
// Built from code points so this file itself carries no dash character.
const DASH = new RegExp(
  `[${String.fromCharCode(0x2014, 0x2013, 0x2012, 0x2015, 0x2011, 0x2010, 0x2212, 0xff0d, 0x2e3a, 0x2e3b, 0xfe58, 0xfe31, 0xfe32, 0xfe63)}]`,
);
// The write fence: an agent named here may write or delete inside the project only the paths its entry allows.
// A project's own writer agent with a narrow job gets an entry of its own (`allowed` is tested against the
// project-relative path with forward slashes, `what` names it in the refusal).
const PROBE_FENCE = { allowed: PROBE_PATH, what: 'its compile probe (<SRC_DIR>/__hunt_probe*.ts)' };
const FENCED_AGENTS = new Map([
  ['hunt', PROBE_FENCE],
  ['integration', PROBE_FENCE],
]);
const MAX_BODY_DEPTH = 3;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function deny(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
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

// Unlike `tokenize`, the words Bash hands the program: escapes resolved, a quoted run glued on (`-"O"cat` is `-Ocat`).
function shellWords(segment) {
  const words = [];
  let word;
  let quote;
  for (let index = 0; index < segment.length; index += 1) {
    const ch = segment[index];
    const next = segment[index + 1];
    if (quote === "'") {
      if (ch === "'") quote = undefined;
      else word += ch;
    } else if (ch === '\\' && next === '\n') {
      index += 1;
    } else if (ch === '\\' && next !== undefined && (quote === undefined || '"\\$`'.includes(next))) {
      word = (word ?? '') + next;
      index += 1;
    } else if (quote === '"') {
      if (ch === '"') quote = undefined;
      else word += ch;
    } else if (ch === "'" || ch === '"') {
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
function unquoted(command, shell) {
  let out = '';
  let quote;
  let keep = false;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (escapedAt(quote, command, index, shell)) {
      out += !quote || keep ? command.slice(index, index + 2) : '  ';
      index += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = undefined;
        out += ' ';
      } else {
        out += keep ? ch : ' ';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      // A quoted span right after a redirect (`>`, `>|`, `>&`) IS the target and has to stay readable.
      keep = />[|&]?\s*$/.test(out);
      out += ' ';
      continue;
    }
    out += ch;
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
    .replace(/\S*[\\/]git(?:\.exe)?(?=\s|$)/gi, 'git')
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
    if (LEADING_KEYWORD.test(token) || /^[A-Za-z_][\w]*=\S*$/.test(token) || /^\[void\]$/i.test(token) || /^\$[\w:]+=$/.test(token)) {
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
  if (rest.some((token) => /^(?:--get|--get-all|--get-regexp|--get-urlmatch|--list|-l)$/.test(token))) return true;
  // git 2.46+ spells the reads as subcommands: `git config get user.name`, `git config list`.
  if (/^(?:get|get-all|get-regexp|get-urlmatch|list)$/.test(rest.find((token) => !token.startsWith('-')) ?? '')) return true;
  return rest.filter((token) => !token.startsWith('-')).length <= 1;
}

function gitCallWrites(tokens, gitIndex) {
  let index = gitIndex + 1;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    index += GIT_GLOBAL_WITH_VALUE.has(tokens[index]) ? 2 : 1;
  }
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
  const subcommands = GIT_WRITE_SUBCOMMANDS[verb];
  if (subcommands) return subcommands.has(rest.find((token) => !token.startsWith('-')) ?? '');
  return false;
}

function gitWrites(text) {
  const tokens = normalizeGit(text).split(/\s+/).filter(Boolean);
  return tokens.some((token, index) => token === 'git' && gitCallWrites(tokens, index));
}

// The allow list's read-only git prefixes pass these with no prompt: grep's `-O<cmd>` (in a cluster or abbreviated too) runs a
// program, and `--output=<file>` writes one. Judged on the words git receives, so a quoted `"-Ocat"` counts.
function gitReadEscapes(segment, shell) {
  const words = stripLeading(shellWords((shell === 'PowerShell' ? segment.replace(/`(.)/g, '$1') : segment).trim()));
  if (!/^(?:\S*[\\/])?git(?:\.exe)?$/i.test(words[0] ?? '')) return false;
  let index = 1;
  while (index < words.length && words[index].startsWith('-')) index += GIT_GLOBAL_WITH_VALUE.has(words[index]) ? 2 : 1;
  const verb = words[index];
  return words.slice(index + 1).some((word) => /^--output(?:=|$)/.test(word) || (verb === 'grep' && /^(?:--op|-[A-Za-z0-9]*O)/.test(word)));
}

function firstGitVerb(text) {
  const tokens = normalizeGit(text).split(/\s+/).filter(Boolean);
  const gitIndex = tokens.indexOf('git');
  if (gitIndex < 0) return undefined;
  let index = gitIndex + 1;
  while (index < tokens.length && tokens[index].startsWith('-')) index += GIT_GLOBAL_WITH_VALUE.has(tokens[index]) ? 2 : 1;
  return tokens[index];
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
        (/^curl$/i.test(verb) && CURL_DESTINATION.test(name)) ||
        (/^wget$/i.test(verb) && WGET_DESTINATION.test(name))
      ) {
        const item = value();
        if (item !== undefined) destinations.push(item);
      } else if ((powershell && VALUE_PARAMS.test(name) && !colon) || (/^truncate$/i.test(verb) && /^-[sr]$/.test(name) && !colon)) {
        index += 1;
      }
      continue;
    }
    positional.push(token.replace(/^(?:if|of)=/, ''));
  }
  return { positional, paths, destinations };
}

function moverTargets(verb, { positional, paths, destinations }) {
  if (/^Tee-Object$/i.test(verb)) return [...paths, ...positional.slice(0, 1)];
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
    if (context.deleted.size > 1 || inTree.some((target) => /[*?[]/.test(target))) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" removes more than one project path in one call. CLAUDE.md, Shell and file edits: an orphaned file is deleted one path at a time.`);
    }
  }
  const recursive = tokens.some((token) => RECURSIVE_FLAG.test(token));
  // Split like the cap above: judged whole, `$env:TEMP\x,<protected>` would pass as scratch.
  for (const target of targets.flatMap((item) => (item.split(',').some(Boolean) ? item.split(',').filter(Boolean) : [item]))) {
    if (unresolvable(target)) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" on "${target}", a variable this check cannot resolve. CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write, and an orphaned file is deleted one named path at a time. Only $S, $TMP, $TEMP, $SCRATCH, $TMPDIR, $M, $env:TEMP and %TEMP% resolve as scratch.`);
    }
    if (isScratchTarget(target)) continue;
    if (context.fence && !fencedPath(target, context.cwd, context.fence.allowed)) {
      deny(`Blocked by .claude/hooks/guard.mjs: ${context.fence.agent} may write or remove only ${context.fence.what} inside the project, not "${target}".`);
    }
    const normal = normalizedPath(target);
    if (MOVER_EXEMPT.test(normal)) continue;
    // cmd's `del` on a directory empties it without any recursive flag.
    if (/^(?:del|erase)$/i.test(verb) && (/[\\/]$/.test(target) || isDirectory(target, context.cwd))) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" on the directory "${target}" deletes every file in it. CLAUDE.md, Shell and file edits: an orphaned file is deleted one path at a time.`);
    }
    // Deleting the ledger wipes the verdicts; the hook rebuilds only the rows.
    if (DELETER.test(verb) && agentsLedgerPath(target, context.cwd)) {
      deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" on "${target}" deletes the rows record-activity.mjs appended to the session ledger. CLAUDE.md, Development Workflow: the hook keeps the rows; a verdict goes in with Edit.`);
    }
    // The one shell operation on a project file that is granted: a single non-recursive delete of an unprotected path.
    if (DELETER.test(verb) && !recursive && !isProtected(normal) && !GIT_DIR.test(normal) && !SHELL_PROTECTED.test(normal)) {
      continue;
    }
    deny(`Blocked by .claude/hooks/guard.mjs: "${verb}" would write or remove "${target}". CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write; scratch output goes under the session scratchpad or /tmp.`);
  }
}

function checkFind(command, shell) {
  for (const match of unquoted(command, shell).matchAll(/(?:^|[\s;&|(])(?:\S*[\\/])?find(\s[^|;&\n]*)/g)) {
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
  const bare = unquoted(command, shell);
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

function checkCommand(command, context, depth = 0) {
  if (typeof command !== 'string') return;
  // Arithmetic `$(( a > b ))` compares, it does not redirect; one holding a `$(` keeps being checked.
  if (context.shell === 'Bash') command = command.replace(/\$\(\((?:[^()$]|\([^()$]*\))*\)\)/g, (match) => ' '.repeat(match.length));
  checkFind(command, context.shell);
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
  if (STDIN_INTERPRETER.test(command)) {
    for (const match of command.matchAll(SCRIPT_WRITE)) {
      const args = callArguments(command, match.index + match[0].length, '\\');
      if (/^open/i.test(match[1]) && !args.slice(1).some((arg) => WRITE_MODE.test(arg))) continue;
      judgeWrite([literalPath(args[0])], `${match[1]} from a script an interpreter reads on stdin`);
    }
    for (const match of command.matchAll(SCRIPT_COPY)) {
      const args = callArguments(command, match.index + match[0].length, '\\').map(literalPath);
      judgeWrite(/rename|move/i.test(match[1]) ? [args[1], args[0]] : [args[1]], `${match[1]} from a script an interpreter reads on stdin`);
    }
  }
  for (const segment of segments(command, context.shell)) {
    const head = stripLeading(tokenize(segment.trim(), context.shell))[0] ?? '';
    const substitution = singleQuotesBlanked(segment, context.shell).includes('$(');
    const search = !substitution && SEARCH_COMMAND.test(head);
    // A one-liner keeps all its code in quotes, so a read before a write must not turn the whole segment into text.
    const readGit = !substitution && !INTERPRETER_ONE_LINER.test(segment) && GIT_READ_VERBS.has(firstGitVerb(segment) ?? '');
    // A search's pattern and a read git verb's quoted argument are text, not commands.
    const text = search || readGit ? unquoted(segment, context.shell) : segment;
    if (!search) {
      if (gitWrites(text)) {
        deny('Blocked by .claude/hooks/guard.mjs: this git verb commits, stages, publishes, rewrites or discards work. CLAUDE.md: apply file changes only and leave them in the working tree - the author commits.');
      }
      if (ghWrites(text)) {
        deny('Blocked by .claude/hooks/guard.mjs: gh must not create, merge, edit or close anything - the author publishes.');
      }
      if (gitReadEscapes(segment, context.shell)) {
        deny('Blocked by .claude/hooks/guard.mjs: git grep -O / --open-files-in-pager starts a program and --output writes a file. Read git without them; a file is changed with Edit or Write.');
      }
      // No scratch exemption: an in-place edit's target cannot be told from the rest of the command, so a `/tmp/`
      // anywhere in the line would wave through a `sed -i` on a source.
      if (IN_PLACE_EDIT.test(normalizeGit(text))) {
        deny('Blocked by .claude/hooks/guard.mjs: an in-place edit from the shell (sed -i, perl -i, awk -i inplace, Set-Content, prettier --write, eslint --fix). CLAUDE.md, Shell and file edits: a repo file is changed with Edit or Write.');
      }
    }
    if (INTERPRETER_ONE_LINER.test(segment)) {
      for (const match of segment.matchAll(SCRIPT_WRITE)) {
        const args = callArguments(segment, match.index + match[0].length, '\\');
        if (/^open/i.test(match[1]) && !args.slice(1).some((arg) => WRITE_MODE.test(arg))) continue;
        judgeWrite([literalPath(args[0])], `${match[1]} from inside an interpreter one-liner`);
      }
      for (const match of segment.matchAll(SCRIPT_COPY)) {
        const args = callArguments(segment, match.index + match[0].length, '\\').map(literalPath);
        judgeWrite(/rename|move/i.test(match[1]) ? [args[1], args[0]] : [args[1]], `${match[1]} from inside an interpreter one-liner`);
      }
    }
    if (!search) checkMovers(segment, context);
  }
  for (const match of unquoted(command, context.shell).matchAll(WRITE_TARGET)) {
    const target = match[1];
    if (!isScratchTarget(target)) {
      deny(`Blocked by .claude/hooks/guard.mjs: a shell write to "${target}". CLAUDE.md, Shell and file edits: repo files are changed with Edit or Write; scratch output goes under the session scratchpad or /tmp. Only $S, $TMP, $TEMP, $SCRATCH, $TMPDIR, $M, $env:TEMP and %TEMP% resolve as scratch.`);
    }
  }
  if (depth < MAX_BODY_DEPTH) {
    for (const { shell, body } of shellBodies(command, context.shell)) {
      for (const view of new Set([body, commentsBlanked(body, shell)])) checkCommand(view, { ...context, shell }, depth + 1);
    }
  }
  // Each body is strictly shorter than the command, so this recursion ends without a depth cap.
  for (const body of substitutionBodies(command, context.shell)) checkCommand(body, context, depth);
  if (context.shell === 'Bash') for (const body of backtickBodies(command)) checkCommand(body, context, depth);
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
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd());
}

function insideProject(filePath, cwd) {
  const root = projectRoot(cwd).toLowerCase();
  const resolved = path.resolve(cwd || process.cwd(), nativePath(filePath)).toLowerCase();
  return resolved === root || resolved.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

function isDirectory(target, cwd) {
  try {
    return statSync(path.resolve(cwd || process.cwd(), nativePath(target))).isDirectory();
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

function agentsLedgerPath(target, cwd) {
  const relative = path.relative(projectRoot(cwd), path.resolve(cwd || process.cwd(), nativePath(target))).replace(/\\/g, '/');
  return AGENTS_LEDGER.test(relative);
}

function fileExists(target, cwd) {
  try {
    return statSync(path.resolve(cwd || process.cwd(), nativePath(target))).isFile();
  } catch {
    return false;
  }
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
  // record-activity.mjs creates the ledger, backfilled with the launches made before the folder existed, and appends
  // every later row: a Write would wipe them, and a ledger any tool creates first stops the backfill.
  if (agentsLedgerPath(filePath, context.cwd) && (context.shell === 'Write' || !fileExists(filePath, context.cwd))) {
    deny(`Blocked by .claude/hooks/guard.mjs: ${filePath} is created and kept by record-activity.mjs - a Write would wipe or pre-empt its rows, and an Edit may only add a verdict once the hook has created it. CLAUDE.md, Development Workflow: the hook keeps the rows; a verdict goes in with Edit.`);
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

try {
  const payload = JSON.parse(await readStdin());
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
    input.command = withLeadingLiterals(input.command, tool);
    // Both views, refused if either refuses: the raw one is never looser than the blanker's guesses about shell grammar.
    for (const command of new Set([input.command, commentsBlanked(input.command, tool)])) {
      checkChdir(command, tool);
      checkCommand(command, context);
    }
  } else if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') checkWrite(input, context);
} catch {
  // Unparseable input: allow. The deny list in settings.json and the rules still apply.
}
process.exit(0);
