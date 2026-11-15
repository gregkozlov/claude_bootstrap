#!/usr/bin/env node
// PreToolUse guard for a server codebase, registered beside guard.mjs. It refuses what a backend adds to that list:
//   Read / Grep                - a secret file: an env file, a private key, a credentials file (SECRET_PATHS).
//   Edit / Write / MultiEdit   - a secret file; and a frozen file, one matching FROZEN_PATHS that git already
//                                tracks: a committed migration is never edited, the change is a new migration.
//   Bash / PowerShell          - a command that prints or copies a secret file, one that deletes or moves a frozen
//                                file, and one that deploys, changes infrastructure or publishes (FORBIDDEN, plus the
//                                project's own list). A command that destroys data is not refused: the user is asked.
// It is a separate file so that guard.mjs stays the same file in every layer of this bootstrap.
// Reads one JSON payload on stdin. Exit 2 with the reason on stderr blocks the call; exit 0 allows it; exit 0 with
// a permissionDecision of "ask" on stdout hands the call to the user's permission prompt.
// A backstop, never a security boundary: it reads the command text, so a script file that runs the same command,
// or a value read from the process environment, walks past it. It allows whatever it cannot parse.
// Self-test: node .claude/hooks/tests/backend-guard-test.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

// The three project lists, filled at install as JSON arrays of regex sources inside the raw strings (INSTALL.md);
// edit freely afterwards. An unfilled placeholder and an empty string read as an empty list, so a missed fill
// leaves the built-in checks working; anything else is parsed for real, and a hook that throws allows every call -
// run the self-test after editing one.
//   frozen    - tested against the absolute file path with every backslash turned into "/", so it matches the
//               path's tail and never starts with "^", e.g. ["db/migrations/[^/]+\\.sql$"].
//   secret    - the same, case-insensitive, on top of SECRET_PATHS below, e.g. ["config/local\\.settings\\.json$"].
//   forbidden - tested against one command segment, words joined by single spaces, e.g. ["\\bmake\\s+deploy\\b"].
const FROZEN_RAW = String.raw`<FROZEN_PATHS>`;
const SECRET_RAW = String.raw`<SECRET_PATHS>`;
const FORBIDDEN_RAW = String.raw`<FORBIDDEN_COMMANDS>`;
const sources = (raw) => (raw.startsWith('<') || !raw.trim() ? [] : JSON.parse(raw));
const FROZEN_PATHS = sources(FROZEN_RAW).map((source) => new RegExp(source));

// Files whose content is a secret. A name that says it is an example (example, sample, template, dist, defaults)
// holds names and placeholders and stays readable; so does a key or certificate whose name says it is public, a
// known_hosts or authorized_keys file, and a chart's templates folder. Delete or narrow a line the project does not
// want - a tracked `.env.test` with no secret in it is the usual one.
const EXAMPLE = String.raw`(?![^/]*\b(?:example|sample|template|dist|defaults?)\b)`;
const SECRET_PATHS = [
  new RegExp(String.raw`(?:^|\/)\.env(?:[.\-_]${EXAMPLE}[^/]+)?$`, 'i'),
  new RegExp(String.raw`(?:^|\/)${EXAMPLE}[^/]+\.env$`, 'i'),
  /(?:^|\/)\.envrc$/i,
  /\.(?:p12|pfx|jks|keystore)$/i,
  /(?<!(?:^|[\/._-])(?:pub(?:lic)?|cert(?:ificate)?s?|ca|cacert|(?:full)?chain|bundle))\.(?:pem|key)$/i,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/i,
  /(?:^|\/)\.(?:netrc|pgpass|pypirc|htpasswd|git-credentials)$/i,
  /(?:^|\/)\.(?:aws\/credentials|docker\/config\.json|kube\/config)$/i,
  /(?:^|\/)\.ssh\/(?!known_hosts$|authorized_keys$|config$|[^/]*\.pub$)[^/]+$/i,
  /(?:^|\/)(?<!(?:^|\/)templates\/)(?:secrets?|credentials)\.(?:ya?ml|json|toml)$/i,
  /(?:^|\/)service[-_]?account[^/]*\.json$/i,
  /\.tfstate(?:\.backup)?$/i,
  /(?:^|\/)terraform\.tfvars(?:\.json)?$/i,
  ...sources(SECRET_RAW).map((source) => new RegExp(source, 'i')),
];

// A command name at a word start; `then` finds a verb anywhere among the words that follow it, `first` only where
// the verb is the tool's own subcommand - nothing but options, each with at most one value, sits between the two.
const tool = (names) => String.raw`(?<![\w.-])(?:${names})(?:\.exe|\.cmd|\.bat)?(?![\w.:-])`;
const then = (verbs) => String.raw`(?:\s+\S+)*?\s+(?:${verbs})(?=\s|$)`;
const first = (verbs) => String.raw`(?:\s+[-+]\S+(?:\s+(?![-+])\S+)??)*?\s+(?:${verbs})(?=\s|$)`;
const without = (flags) => String.raw`(?!.*\s(?:${flags})(?=\s|$))`;
// The start of a segment up to the tool's own name, for the tools that act when run with no verb at all: only
// there is `vercel` a deploy - after `npm install` it is a package name.
const HEAD = String.raw`^(?:[A-Za-z_]\w*=\S*\s+)*(?:(?:npx|bunx|pnpm\s+(?:dlx|exec)|yarn(?:\s+dlx)?|npm\s+exec(?:\s+--)?)\s+(?:-\S+\s+)*)?(?:\S*[\\/])?`;
// scope: what the pattern is tested against - 'bare' (a quoted argument with spaces is blanked: it is a message, a
// filter or a name, never the verb) or 'sql' (the whole segment but its SQL string literals).
const rule = (kind, label, source, scope = 'bare') => ({ kind, label, scope, pattern: new RegExp(source, 'i') });
const SQL_CLIENTS = 'psql|mysql|mariadb|sqlcmd|sqlite3|clickhouse-client|cockroach|usql|pgcli|mycli|bq|snowsql';
const SQL_DROP = String.raw`\b(?:DROP\s+(?:DATABASE|SCHEMA|TABLE|COLUMN|INDEX|VIEW|ROLE|USER|OWNED)|TRUNCATE)\b`;
const SQL_UNBOUNDED = String.raw`\b(?:DELETE\s+FROM|UPDATE\s+\S+(?:\s+(?:AS\s+)?\w+)?\s+SET)\b(?![^;]*\bWHERE\b)`;
const SQL_CLIENT = new RegExp(tool(SQL_CLIENTS), 'i');
const SQL_WIPE = new RegExp(`${SQL_DROP}|${SQL_UNBOUNDED}`, 'i');
// A read (`start-query`, `update-kubeconfig`) and a download (`sync s3://bucket ./local`) are not writes.
const AWS_WRITE =
  String.raw`(?:delete|terminate|remove|put|create|run|stop|reboot|modify|deregister|register|attach|detach|publish|send|invoke|deploy|restore|purge|reset|revoke|authorize|associate|disassociate|import|execute)-[\w-]+|start-(?!query|live-tail)[\w-]+|update-(?!kubeconfig)[\w-]+|batch-(?:write|delete|execute)-[\w-]+|rm|rb|mb|mv|deploy|invoke|publish|(?:cp|sync)\s+(?:-\S+\s+)*(?!s3:)[^-\s]\S*\s+(?:-\S+\s+)*s3://\S*`;
const FORBIDDEN = [
  rule('deploy', 'kubectl', tool('kubectl|oc') + String.raw`(?!\s+auth\s+can-i(?=\s|$))` + then(String.raw`apply|delete|patch|replace|scale|rollout\s+(?:restart|undo|pause|resume)|drain|cordon|uncordon|taint|edit|set|create|annotate|label|exec|debug|cp|run|expose|autoscale|use-context|set-context|delete-context|set-cluster|set-credentials`)),
  rule('deploy', 'helm', tool('helm|helmfile') + first('install|upgrade|uninstall|delete|rollback|push|apply|sync|destroy')),
  rule('deploy', 'terraform', tool('terraform|tofu|terragrunt') + then(String.raw`apply|destroy|import|taint|untaint|force-unlock|state\s+(?:rm|mv|push)|workspace\s+(?:new|delete)`)),
  rule('deploy', 'pulumi', tool('pulumi') + then('up|destroy|refresh|import|cancel')),
  rule('deploy', 'ansible-playbook', tool('ansible-playbook') + without('--check|--syntax-check|--list-hosts|--list-tasks|--version|--help')),
  rule('deploy', 'a deploy tool', tool('serverless|cdk|cdktf|sam|sst|kamal|eb|azd') + first('deploy|destroy|remove|delete|terminate|bootstrap|sync|up')),
  rule('deploy', 'a deploy tool', tool('cap') + String.raw`(?:\s+\S+)?\s+deploy(?::[\w:]+)?(?=\s|$)` + '|' + tool('copilot') + then('deploy|delete') + '|' + tool('func') + String.raw`\s+azure\s+functionapp\s+publish(?=\s|$)`),
  rule('deploy', 'serverless', tool('sls') + first('deploy|remove')),
  rule('deploy', 'cf', tool('cf') + first('push|delete|delete-space')),
  rule('deploy', 'a deploy tool', tool('skaffold') + first('run|deploy|delete') + '|' + tool('argocd') + String.raw`\s+app\s+(?:sync|delete|create|set|rollback)(?=\s|$)` + '|' + tool('supabase') + then('deploy')),
  rule('deploy', 'eksctl', tool('eksctl') + first('create|delete|upgrade|scale')),
  rule('deploy', 'aws', tool('aws') + then(AWS_WRITE)),
  rule('deploy', 'gcloud', tool('gcloud') + String.raw`(?!\s+(?:components|config)\s)` + then('deploy|delete|create|update|apply|submit|import|ssh|scp|add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy|start|stop|reset|resize|rollback')),
  rule('deploy', 'az', tool('az') + String.raw`(?!\s+account\s)` + then(String.raw`(?:create|delete|upload)(?:-[\w-]+)?|update|up|deploy|start|stop|restart|set|purge|import`)),
  rule('deploy', 'a hosting CLI', tool('fly|flyctl|netlify|railway|firebase|wrangler') + then(String.raw`deploy|publish|destroy|launch|scale|up|down|secrets?\s+(?:set|unset|import|put|delete)`)),
  rule('deploy', 'vercel', tool('vercel') + String.raw`(?!\s+(?:build|pull|dev|env|login|logout|whoami|ls|list|logs|inspect|link|help)(?=\s|$))` + then('deploy|promote|rollback|remove|rm|--prod') + '|' + HEAD + String.raw`vercel(?:\s+(?!--version|--help|-v|-h)-\S+)*\s*$`),
  rule('deploy', 'heroku', tool('heroku') + then(String.raw`run(?::\w+)?|restart|rollback|[\w-]+:(?:destroy|reset|rollback|restart|scale|promote|push|set|unset|create|add|remove|kill|release)[\w:-]*`)),
  rule('deploy', 'docker swarm', tool('docker') + first('stack|service') + first('deploy|rm|create|update|scale|rollback')),

  rule('publish', 'an image push', tool('docker|podman|nerdctl') + '(?:(?:' + first('compose|image|manifest') + ')?' + first('push') + '|' + then('--push') + ')'),
  rule('publish', 'an image push', tool('docker-compose|podman-compose') + first('push')),
  rule('publish', 'a package publish', tool('npm|pnpm|yarn|bun') + '(?:' + first('npm|run|run-script') + ')?' + first('publish|unpublish|deprecate')),
  rule('publish', 'a package publish', tool('lerna|changeset') + then('publish') + '|' + HEAD + String.raw`semantic-release(?=\s|$)`),
  rule('publish', 'a package publish', tool('twine|maturin') + then('upload') + '|' + String.raw`\bsetup\.py\s+(?:\S+\s+)*?upload(?=\s|$)`),
  rule('publish', 'a package publish', tool('poetry|uv|flit|hatch|pdm|maturin') + first('publish')),
  rule('publish', 'a package publish', tool('cargo') + first('publish|yank')),
  rule('publish', 'a package publish', tool('gem') + first('push|yank')),
  rule('publish', 'a package publish', tool('mvn|mvnw') + then(String.raw`deploy(?::[\w-]+)?|release:[\w-]+`)),
  rule('publish', 'a package publish', tool('gradle|gradlew') + then(String.raw`(?<!--(?:tests|group)\s)(?:[\w-]*:)*publish(?!\w*ToMavenLocal(?=\s|$))\w*`)),
  rule('publish', 'a package publish', tool('sbt') + then(String.raw`\+?(?:[\w-]+\/)?publish(?!Local|M2)\w*`)),
  rule('publish', 'a package publish', tool('nuget') + then('push|delete')),
  rule('publish', 'a package publish', tool('mix') + then(String.raw`hex\.publish`)),
  rule('publish', 'a release', tool('goreleaser') + without(String.raw`--snapshot|--skip-publish|--skip=\S*publish\S*`) + then('release') + '|' + HEAD + String.raw`goreleaser(?:\s+(?!--snapshot|--skip|--version|--help|-v|-h)-\S+)*\s*$`),

  rule('data', 'compose down with its volumes', String.raw`(?<![\w.-])(?:docker|podman)(?:-|\s+)compose(?=\s)` + first('down') + String.raw`(?=.*\s(?:-v|--volumes)(?=\s|$))`),
  rule('data', 'a volume or system prune', tool('docker|podman') + String.raw`\s+(?:volume\s+(?:rm|prune)|system\s+prune)(?=\s|$)`),
  rule('data', 'a destructive SQL statement', tool(SQL_CLIENTS) + '.*' + SQL_DROP, 'sql'),
  rule('data', 'a DELETE or UPDATE with no WHERE', tool(SQL_CLIENTS) + '.*' + SQL_UNBOUNDED, 'sql'),
  rule('data', 'a database drop', tool('dropdb') + '|' + tool('mysqladmin|dbmate') + then('drop')),
  rule('data', 'a cache flush', tool('redis-cli|valkey-cli') + then('FLUSHALL|FLUSHDB')),
  rule('data', 'a database drop', tool('mongosh|mongo') + String.raw`.*(?:dropDatabase|\.drop\s*\(|deleteMany\s*\(\s*\{\s*\}\s*\))`, 'sql'),
  rule('data', 'a migration reset', tool('prisma') + String.raw`\s+(?:migrate\s+reset|db\s+push\b.*--(?:force-reset|accept-data-loss))(?=\s|$)`),
  rule('data', 'a migration reset', tool('artisan') + then(String.raw`migrate:(?:fresh|reset|refresh)|db:wipe`)),
  rule('data', 'a database reset', tool('rails|rake') + then(String.raw`db:(?:drop|reset|purge|truncate_all|schema:load|structure:load|migrate:reset)(?::\w+)*|db:migrate\s+VERSION=0`)),
  rule('data', 'a database flush', String.raw`(?:manage\.py|(?<![\w.-])django-admin)\s+(?:(?:flush|reset_db)|migrate\s+(?:-\S+\s+)*\S+\s+zero)(?=\s|$)`),
  rule('data', 'a downgrade to nothing', tool('alembic') + then(String.raw`downgrade\s+base`) + '|' + tool('flask') + String.raw`\s+db\s+downgrade\s+base(?=\s|$)`),
  rule('data', 'a database drop', String.raw`(?<![\w.-])(?:dotnet(?:\.exe)?\s+ef|dotnet-ef)(?:\s+-\S+(?:\s+(?!-)\S+)?)*?\s+database\s+(?:drop|update\s+0)(?=\s|$)`),
  rule('data', 'a schema clean', String.raw`(?<!-pl\s|--projects\s)` + tool('flyway') + first('clean') + '|' + tool('liquibase') + then('drop-?all')),
  rule('data', 'a schema clean', tool('gradle|gradlew|mvn|mvnw') + then(String.raw`(?:[\w-]*:)*(?:flywayClean|flyway:clean|dropAll|liquibase:dropAll)`)),
  rule('data', 'a migration reset', tool('knex') + String.raw`.*\smigrate:rollback(?=\s).*\s--all(?=\s|$)`),
  rule('data', 'a database drop', tool(String.raw`sequelize|sequelize-cli|typeorm(?:-ts-node-(?:commonjs|esm))?|mikro-orm`) + then(String.raw`db:drop|db:migrate:undo:all|db:seed:undo:all|schema:drop|schema:fresh|migration:fresh`)),
  rule('data', 'a database drop', String.raw`(?<![\w.:-])migrate(?:\.exe)?(?![\w.:-])` + then(String.raw`drop|down\s+-all`)),
  rule('data', 'a database reset', tool('goose') + then(String.raw`reset|down-to\s+0`) + '|' + tool('atlas') + then(String.raw`schema\s+clean`)),
  rule('data', 'a database reset', tool('diesel|sqlx') + then(String.raw`database\s+(?:drop|reset)`) + '|' + tool('supabase') + then(String.raw`db\s+reset`)),
  rule('data', 'a database drop', tool('mix') + then(String.raw`ecto\.(?:drop|reset)`)),
  rule('data', 'a database drop', String.raw`\bdoctrine:(?:database|schema):drop\b` + without('--dump-sql')),

  ...sources(FORBIDDEN_RAW).map((source) => rule('project', 'FORBIDDEN_COMMANDS', source)),
];
const KIND = {
  deploy: 'deploys or changes infrastructure',
  publish: 'publishes outside this machine',
  data: 'destroys data',
  project: "is on this project's forbidden list",
};
// A dry run reaches nothing, and neither does a call aimed at this machine: an emulator behind a localhost
// endpoint, the gcloud emulators, a cluster named as a local one, a registry on localhost. Both pass the deploy
// and publish rules; a kubectl call that names no context is not known to be local and does not.
const DRY_RUN = /\s--dry-run(?:=(?!none|false)\S+)?(?=\s|$)/i;
const LOCAL = new RegExp(
  [
    String.raw`\s--endpoint-url[= ]https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|localstack)(?::\d+)?(?=[\/\s]|$)`,
    String.raw`(?:^|\s)gcloud(?:\s+(?:alpha|beta))?\s+emulators\s`,
    String.raw`\s--(?:kube-)?context[= ](?:kind-[\w.-]+|k3d-[\w.-]+|minikube|docker-desktop|rancher-desktop|colima|orbstack)(?=\s|$)`,
    String.raw`\spush\s+(?:localhost|127\.0\.0\.1)(?::\d+)?\/\S`,
  ].join('|'),
  'i',
);

// A segment whose head only searches or prints text is not judged against FORBIDDEN: its arguments are patterns
// and messages (`grep "terraform apply" docs`, `echo`, `git log --grep`).
const QUIET = new Set([
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'findstr', 'select-string', 'sls', 'echo', 'printf', 'write-output',
  'write-host', 'git', 'ls', 'dir', 'cat', 'bat', 'head', 'tail', 'wc', 'sed', 'awk', 'less', 'more', 'type',
  'get-content', 'gc', 'man', 'which', 'where', 'whereis', 'get-command', 'gcm', 'help', 'tldr', 'test', 'stat', 'file',
]);
const WRAPPERS = new Set(['sudo', 'command', 'exec', 'nohup', 'time']);
// A command that puts a file's content on the output or copies it somewhere readable. `source` and `.` are not
// here: loading an env file into a process prints nothing.
const READERS = new Set([
  'cat', 'bat', 'batcat', 'less', 'more', 'most', 'head', 'tail', 'nl', 'tac', 'rev', 'paste', 'strings', 'xxd', 'od',
  'hexdump', 'format-hex', 'base64', 'type', 'get-content', 'gc', 'import-csv', 'grep', 'egrep', 'fgrep', 'rg', 'ag',
  'ack', 'findstr', 'select-string', 'sls', 'sed', 'gsed', 'awk', 'gawk', 'cut', 'sort', 'uniq', 'diff', 'cmp', 'jq',
  'yq', 'dd', 'tar', 'cp', 'copy', 'copy-item', 'cpi', 'scp', 'rsync', 'mv', 'move', 'move-item',
]);
// Their first plain argument is a pattern or a script, never a path: `grep "\.env" src` searches for a string.
const SEARCHERS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'findstr', 'select-string', 'sls', 'sed', 'gsed', 'awk', 'gawk', 'jq', 'yq']);
// Their last plain argument is where the copy lands, not what is read.
const COPIERS = new Set(['cp', 'copy', 'copy-item', 'cpi', 'scp', 'rsync', 'mv', 'move', 'move-item']);
const GREPS = new Set(['grep', 'egrep', 'fgrep']);
const RECURSIVE = /^(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive|--dereference-recursive)$/;
const SCOPED = /^--(?:include|exclude)(?:-dir)?(?:=|$)/i;
const PATH_PARAM = /^-(?:Path|LiteralPath|LP|PSPath)$/i;
const EXPRESSION = /^(?:-e|--regexp|--expression)$/;
const EXCLUDE_FLAG = /^--exclude(?:-dir)?$/i;
const EXCLUDE_WORD = /^--exclude(?:-dir)?=/i;
// The git verbs that print a file's content (`git grep` is a searcher and is judged as one), and the options
// whose value is a pattern or a name, never a path.
const GIT_PRINTS = new Set(['show', 'diff', 'blame', 'cat-file']);
const GIT_VALUE = /^--?(?:grep|S|G|author|committer|format|pretty|since|until)$/;
const REMOVERS = new Set([
  'rm', 'del', 'erase', 'ri', 'rd', 'rmdir', 'remove-item', 'unlink', 'mv', 'move', 'move-item', 'mi', 'ren',
  'rename-item', 'rni', 'truncate', 'shred', 'clear-content', 'clc',
]);
// A command that runs another one handed to it as a quoted word: that word is judged as a command of its own.
const LAUNCHERS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'cmd', 'pwsh', 'powershell', 'eval', 'iex', 'invoke-expression', 'ssh',
  'wsl', 'su', 'sudo', 'xargs', 'watch', 'timeout', 'nohup', 'env', 'docker', 'podman', 'kubectl', 'find', 'parallel',
]);
const POSIX_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'wsl', 'ssh']);
const SHELL_HEREDOC = /(?:^|[\s;&|(\/])(?:bash|sh|zsh|dash|ksh|ssh|eval|source)(?=[\s;&|)<]|$)/;
const MAX_DEPTH = 3;
const RULE = 'CLAUDE.md, Data, secrets and the outside world';

function deny(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

// A refusal anywhere in the call outranks a question, so the question waits until the whole call was read.
let question = '';
function ask(label) {
  question ||= `backend-guard: this command ${KIND.data} (${label}). ${RULE}: a database is wiped only when you asked for exactly that - approve it if you did, and check which database it points at first.`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const normalized = (value) => String(value).replace(/\\/g, '/').replace(/\/+$/, '');
const isSecret = (value) => SECRET_PATHS.some((pattern) => pattern.test(normalized(value)));
const isFrozenPath = (value) => FROZEN_PATHS.some((pattern) => pattern.test(normalized(value)));
const commandName = (word) => normalized(word).split('/').pop().toLowerCase().replace(/\.(?:exe|cmd|bat|ps1)$/, '');

// A glob names files too: `.env*` reaches the env file. Wildcards are dropped and one brace group is expanded.
function reaches(value) {
  const brace = /^(.*)\{([^{}]*)\}(.*)$/.exec(value);
  const forms = brace ? brace[2].split(',').map((part) => brace[1] + part + brace[3]) : [value];
  return forms.some((form) => isSecret(form) || isSecret(form.replace(/[*?]+/g, '').replace(/\.+$/, '')));
}

// Git Bash spells a drive as /d/...; Node on Windows would read that as a folder named "d".
function absolute(target, cwd) {
  const native = process.platform === 'win32' ? target.replace(/^\/([A-Za-z])\//, '$1:/') : target;
  return path.resolve(cwd, native);
}

// The frozen files git tracks at the path, under it or matching its glob. The agent neither commits nor stages, so
// what git tracks the owner put there; a migration the task itself wrote is not tracked yet. Any failure - no
// repo, a folder that does not exist - reads as "none", which allows the call.
function trackedFrozen(target, cwd) {
  const file = absolute(target, cwd);
  try {
    const listed = execFileSync('git', ['-C', path.dirname(file), 'ls-files', '-z', '--full-name', '--', normalized(file)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return listed.split('\0').some((tracked) => tracked && isFrozenPath(`/${tracked}`));
  } catch {
    return false;
  }
}

function secretRefusal(target, how) {
  deny(
    `Blocked by .claude/hooks/backend-guard.mjs: ${target} is a secret file (SECRET_PATHS) and this call would ${how} it. ${RULE}: a secret is never read, printed or written - take the variable names from the example file and the code that reads them; the owner sets the values.`,
  );
}

function frozenRefusal(target, how) {
  deny(
    `Blocked by .claude/hooks/backend-guard.mjs: ${target} is a committed migration (FROZEN_PATHS) and this call would ${how} it. ${RULE}: other environments have already applied it - write a new migration instead. If it was never applied anywhere, the owner changes it.`,
  );
}

function checkRead(target) {
  if (typeof target === 'string' && target && isSecret(target)) secretRefusal(target, 'read');
}

function checkWrite(target, cwd) {
  if (typeof target !== 'string' || !target) return;
  if (isSecret(target)) secretRefusal(target, 'write');
  // The path test first: it is free, and git is then asked about migration files only.
  if (isFrozenPath(absolute(target, cwd)) && trackedFrozen(target, cwd)) frozenRefusal(target, 'edit');
}

// SQL a database client reads on stdin - a heredoc body, an echo or printf piped into it - is its statement too.
function checkStdinSql(client, sql) {
  // A statement the shell single-quoted whole carries no SQL literal of its own; anywhere else '...' is one.
  const statement = /^\s*'([^']*)'\s*$/.exec(sql)?.[1] ?? sql.replace(/'[^']*'/g, "''");
  if (SQL_CLIENT.test(client) && SQL_WIPE.test(statement)) ask("SQL on a database client's stdin");
}

// A heredoc body is data unless a shell reads it: `cat > notes.txt <<EOF` may quote any command.
function withoutHeredocs(command) {
  const lines = command.split(/\r?\n/);
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    kept.push(line);
    const here = /<<-?\s*(['"]?)([A-Za-z_][\w.-]*)\1/.exec(line.replace(/<<</g, '   '));
    if (!here || SHELL_HEREDOC.test(line)) continue;
    const end = lines.findIndex((candidate, at) => at > index && candidate.trim() === here[2]);
    if (end === -1) continue;
    checkStdinSql(line, lines.slice(index + 1, end).join(' '));
    index = end;
  }
  return kept.join('\n');
}

// Pulls `$(...)` and backtick bodies out of the command: each is a command of its own, wherever it sits.
function withoutSubstitutions(command, shell) {
  const bodies = [];
  let outer = '';
  let single = false;
  let double = false;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (single) {
      outer += ch;
      if (ch === "'") single = false;
      continue;
    }
    if (ch === '\\' && shell === 'Bash' && index + 1 < command.length) {
      outer += ch + command[index + 1];
      index += 1;
      continue;
    }
    if (ch === "'" && !double) single = true;
    else if (ch === '"') double = !double;
    else if (ch === '$' && command[index + 1] === '(' && command[index + 2] !== '(') {
      let depth = 1;
      let at = index + 2;
      let quote = '';
      for (; at < command.length && depth > 0; at += 1) {
        const inner = command[at];
        if (quote) {
          if (inner === quote) quote = '';
        } else if (inner === '"' || inner === "'") quote = inner;
        else if (inner === '(') depth += 1;
        else if (inner === ')') depth -= 1;
      }
      if (depth === 0) {
        bodies.push(command.slice(index + 2, at - 1));
        outer += '__sub__';
        index = at - 1;
        continue;
      }
    } else if (ch === '`' && shell === 'Bash') {
      const end = command.indexOf('`', index + 1);
      if (end !== -1) {
        bodies.push(command.slice(index + 1, end));
        outer += '__sub__';
        index = end;
        continue;
      }
    }
    outer += ch;
  }
  return { outer, bodies };
}

// Splits a command into segments of words: quotes removed, comments dropped, a new segment at `;`, `&`, `|`, a
// parenthesis or a line break. Bash escapes with a backslash, PowerShell with a backtick - there a backslash is a
// path separator and stays.
function segmentsOf(command, shell) {
  const escape = shell === 'PowerShell' ? '`' : '\\';
  const segments = [];
  let words = [];
  let word = '';
  let started = false;
  let quote = '';
  const endWord = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length) segments.push(words);
    words = [];
  };
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote) {
      if (ch === quote) quote = '';
      else if (quote === '"' && ch === escape && (escape === '`' || /["\\$`]/.test(command[index + 1] ?? ''))) {
        index += 1;
        word += command[index] ?? '';
      } else word += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (ch === escape && index + 1 < command.length) {
      index += 1;
      if (command[index] === '\r' && command[index + 1] === '\n') index += 1;
      if (command[index] !== '\n' && command[index] !== '\r') {
        word += command[index];
        started = true;
      }
    } else if (ch === '#' && !started) {
      while (index + 1 < command.length && command[index + 1] !== '\n') index += 1;
    } else if (ch === '\n' || ';&|()'.includes(ch)) endSegment();
    else if (/\s/.test(ch) || ch === '<' || ch === '>') endWord();
    else {
      word += ch;
      started = true;
    }
  }
  endSegment();
  return segments;
}

// `grep -r` does not read the ignore file: over a folder that holds an env file it prints the file's lines.
function checkRecursiveGrep(words, names, reader, cwd) {
  if (!GREPS.has(names[reader]) || !words.some((word) => RECURSIVE.test(word)) || words.some((word) => SCOPED.test(word))) return;
  const plain = words.filter((word, index) => index > reader && !word.startsWith('-') && !EXPRESSION.test(words[index - 1] ?? ''));
  const folders = words.some((word) => EXPRESSION.test(word)) ? plain : plain.slice(1);
  for (const folder of folders.length ? folders : ['.']) {
    let entries = [];
    try {
      entries = readdirSync(absolute(folder, cwd));
    } catch {
      continue;
    }
    const secret = entries.find((entry) => isSecret(entry));
    if (secret) {
      deny(
        `Blocked by .claude/hooks/backend-guard.mjs: a recursive grep over ${folder} walks into ${secret}, a secret file (SECRET_PATHS), and prints its lines. ${RULE}: search with the Grep tool or \`git grep\`, which skip ignored files, or name the folders to search.`,
      );
    }
  }
}

function checkSegment(words, shell, cwd, depth) {
  const names = words.map(commandName);
  const headAt = names.findIndex((name, index) => !/^[A-Za-z_]\w*=/.test(words[index]) && !WRAPPERS.has(name));
  const head = names[headAt] ?? '';
  const text = words.join(' ');
  // The head keeps its spaces (a quoted path to the binary); so does PowerShell's -ArgumentList, the tool's own
  // words. A shell body is judged below, as a command of its own.
  const blank = (word, index) => /\s/.test(word) && (index !== headAt || /[\r\n]/.test(word)) && !/^-(?:ArgumentList|Args)$/i.test(words[index - 1] ?? '');
  const bare = words.map((word, index) => (blank(word, index) ? '_' : word)).join(' ');
  const scopes = { bare, sql: text.replace(/'[^']*'/g, "''") };
  // `sls` is Select-String in PowerShell and the serverless CLI everywhere else.
  const quiet = QUIET.has(head) && !(head === 'sls' && /^(?:deploy|remove)$/i.test(words[headAt + 1] ?? ''));

  if (!quiet) {
    for (const { kind, label, scope, pattern } of FORBIDDEN) {
      if (!pattern.test(scopes[scope])) continue;
      if (kind === 'data') {
        ask(label);
        continue;
      }
      if (kind !== 'project' && (DRY_RUN.test(bare) || LOCAL.test(bare))) continue;
      deny(
        `Blocked by .claude/hooks/backend-guard.mjs: this command ${KIND[kind]} (${label}). ${RULE}: nothing the agent runs leaves the machine - name the command and what it would do, and the owner runs it.`,
      );
    }
  }

  const reader = names.findIndex((name) => READERS.has(name));
  if (reader !== -1) {
    // What stands before the reader belongs to another program (`docker compose --env-file .env exec api cat x`);
    // `find` is the exception, it hands its own words to the reader it runs.
    const from = names.includes('find') ? 0 : reader;
    const plain = words.flatMap((word, index) => (index > reader && !word.startsWith('-') ? [index] : []));
    const destination = COPIERS.has(names[reader]) && plain.length > 1 ? plain[plain.length - 1] : -1;
    let patternSeen = !SEARCHERS.has(names[reader]);
    words.forEach((word, index) => {
      const before = words[index - 1] ?? '';
      if (index === reader || index < from || index === destination) return;
      // An exclusion is the opposite of a read.
      if (word.startsWith('!') || EXCLUDE_WORD.test(word) || EXCLUDE_FLAG.test(before)) return;
      const flag = word.startsWith('-');
      const values = flag ? word.split(/[=:]/).slice(1) : [word, ...word.split(/[=,]/)];
      if (!flag && index > reader && (EXPRESSION.test(before) || (!patternSeen && !PATH_PARAM.test(before)))) {
        if (names[reader] === 'yq' && /^(?:e|eval|ea|eval-all)$/.test(word)) return;
        patternSeen = true;
        return;
      }
      for (const value of values) if (value && reaches(value)) secretRefusal(value, 'print or copy');
    });
    checkRecursiveGrep(words, names, reader, cwd);
  }

  // `git show HEAD:.env` and `git diff -- .env` print the file as surely as `cat` does; `git log` only with a patch.
  if (head === 'git' && (names.some((name) => GIT_PRINTS.has(name)) || (names.includes('log') && words.some((word) => /^(?:-p|-u|--patch)$/.test(word))))) {
    words.forEach((word, index) => {
      const target = word.includes(':') ? word.slice(word.lastIndexOf(':') + 1) : word;
      if (!word.startsWith('-') && !GIT_VALUE.test(words[index - 1] ?? '') && target && isSecret(target)) secretRefusal(target, 'print');
    });
  }

  if (FROZEN_PATHS.length && (names.some((name) => REMOVERS.has(name)) || (names.includes('find') && words.includes('-delete')))) {
    for (const word of words) {
      if (!word.startsWith('-') && trackedFrozen(word, cwd)) frozenRefusal(word, 'delete or move');
    }
  }

  if (depth < MAX_DEPTH && names.some((name) => LAUNCHERS.has(name))) {
    // cmd reads a backslash as a path separator, as PowerShell does; anything else keeps the caller's shell.
    const inner = names.some((name) => name === 'pwsh' || name === 'powershell' || name === 'cmd')
      ? 'PowerShell'
      : names.some((name) => POSIX_SHELLS.has(name))
        ? 'Bash'
        : shell;
    // What follows a searcher or a printer is its pattern or its message, not a command to run.
    const quietAt = names.findIndex((name) => SEARCHERS.has(name) || name === 'echo' || name === 'printf');
    words.forEach((word, index) => {
      if (/\s/.test(word) && (quietAt === -1 || index < quietAt)) checkCommand(word, inner, cwd, depth + 1);
    });
  }
}

function checkCommand(command, shell, cwd, depth) {
  const { outer, bodies } = withoutSubstitutions(depth === 0 ? withoutHeredocs(command) : command, shell);
  if (depth < MAX_DEPTH) for (const body of bodies) checkCommand(body, shell, cwd, depth + 1);
  // `< file` feeds the file to whatever reads stdin; `<<` is a heredoc and `<(` a process substitution. A quoted
  // string with a space in it is a statement or a message, where `<` compares.
  const unquoted = outer.replace(/"[^"]*\s[^"]*"|'[^']*\s[^']*'/g, '""');
  for (const [, , target] of unquoted.matchAll(/(?<![<\w$&])<(?![<(&=])\s*(["']?)([^\s"'<>|;&()]+)\1/g)) {
    if (isSecret(target)) secretRefusal(target, 'read');
  }
  // What echo or printf pipes into a database client is its statement; into a shell, a command.
  for (const [, body, reader] of outer.matchAll(/(?:^|[\n;&|(])\s*(?:echo|printf)\s([^|\n]*)\|([^|;&\n]*)/g)) {
    checkStdinSql(reader, body);
    if (depth < MAX_DEPTH && SHELL_HEREDOC.test(reader)) checkCommand(body.trim().replace(/^(["'])(.*)\1$/s, '$2'), 'Bash', cwd, depth + 1);
  }
  for (const words of segmentsOf(outer, shell)) checkSegment(words, shell, cwd, depth);
}

try {
  const payload = JSON.parse(await readStdin());
  const name = payload.tool_name;
  const input = payload.tool_input ?? {};
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  if (name === 'Read') checkRead(input.file_path);
  else if (name === 'Grep') {
    checkRead(input.path);
    if (typeof input.glob === 'string' && reaches(input.glob)) secretRefusal(input.glob, 'read');
  } else if (name === 'Edit' || name === 'Write' || name === 'MultiEdit') checkWrite(input.file_path, cwd);
  else if ((name === 'Bash' || name === 'PowerShell') && typeof input.command === 'string') checkCommand(input.command, name, cwd, 0);
} catch {
  // Unparseable input: allow. guard.mjs, the deny list in settings.json and the rules still apply.
  question = '';
}
if (question) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: question } })}\n`);
}
process.exit(0);
