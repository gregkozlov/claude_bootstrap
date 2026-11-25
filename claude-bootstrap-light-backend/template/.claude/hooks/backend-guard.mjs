#!/usr/bin/env node
// PreToolUse guard for a server codebase, registered beside guard.mjs. It refuses what a backend adds to that list:
//   Read / Grep                - a secret file: an env file, a private key, a credentials file (SECRET_PATHS); and a
//                                Grep that prints matching lines of a folder holding one git does not ignore.
//   Edit / Write / MultiEdit   - a secret file; and a frozen file, one matching FROZEN_PATHS that is on the upstream
//                                default branch (with no remote: that git tracks): a merged migration is never
//                                edited, the change is a new migration.
//   Bash / PowerShell          - a command that prints, copies, uploads, deletes or moves a secret file, one that
//                                deletes or moves a frozen file, and one that deploys, changes infrastructure or
//                                publishes (FORBIDDEN, plus the project's own list). A command that destroys data (a
//                                rollback past one step and a database's data folder included), rewrites the
//                                migration history, prints a secret from a cluster or a cloud store, or reaches
//                                another host (a shell, a copy, a tunnel, a database client) is not refused: the user
//                                is asked.
// It is a separate file so that guard.mjs stays the same file in every layer of this bootstrap.
// Reads one JSON payload on stdin. Exit 2 with the reason on stderr blocks the call; exit 0 allows it; exit 0 with
// a permissionDecision of "ask" on stdout hands the call to the user's permission prompt.
// With `--harness codex` on its command line it reads OpenAI Codex's payloads instead - `Bash` whatever the shell,
// `apply_patch` with the patch text - and answers with JSON on stdout, exit 0: there every question is a refusal
// (Codex has no "ask"), a misfilled list refuses every call, and so does an interactive database session or console.
// Every such branch tests CODEX; without the flag nothing changes, and no Claude Code layer registers it that way.
// A backstop, never a security boundary: it reads the command text, so a script file that runs the same command,
// or a value read from the process environment, walks past it. It allows whatever it cannot parse.
// Self-test: node .claude/hooks/tests/backend-guard-test.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The Codex switch: `--harness codex` or `--harness=codex`. Declared before the lists below are read.
const CODEX = process.argv.slice(2).some((arg, index, args) => /^--harness=codex$/i.test(arg) || (arg === '--harness' && /^codex$/i.test(args[index + 1] ?? '')));

// The three project lists, filled at install as JSON arrays of regex sources inside the raw strings (INSTALL.md);
// edit freely afterwards. An unfilled placeholder and an empty string read as an empty list, and so does a misfilled
// one - broken JSON, not an array of strings, a regex that does not compile - which is named on stderr: a hook that
// throws at load allows every call, so a typo costs only its own list. Run the self-test after editing one.
//   frozen    - tested against the absolute file path with every backslash turned into "/", so it matches the
//               path's tail and never starts with "^", e.g. ["db/migrations/[^/]+\\.sql$"]. Case-insensitive on
//               Windows and macOS, where `Db/Migrations/001.sql` is the same file.
//   secret    - the same, case-insensitive everywhere, on top of SECRET_PATHS below, e.g.
//               ["config/local\\.settings\\.json$"].
//   forbidden - tested against one command segment, words joined by single spaces, e.g.
//               ["\\bmake\\s+deploy(?!\\S)"] - a `\\b` after the target would take `make deploy-docs` with it.
const FROZEN_RAW = String.raw`<FROZEN_PATHS>`;
const SECRET_RAW = String.raw`<SECRET_PATHS>`;
const FORBIDDEN_RAW = String.raw`<FORBIDDEN_COMMANDS>`;
// Stderr on an allowed call reaches nobody, so a misfilled list is also told to the user (`systemMessage`, end of file).
// Under Codex no message reaches anyone, so there the first misfilled list refuses every call instead.
const listErrors = [];
function regexList(name, raw, flags) {
  if (raw.startsWith('<') || !raw.trim()) return [];
  try {
    const sources = JSON.parse(raw);
    if (!Array.isArray(sources) || !sources.every((source) => typeof source === 'string')) throw new Error('not an array of strings');
    return sources.map((source) => new RegExp(source, flags));
  } catch (error) {
    const message = `backend-guard.mjs: ${name} is not a JSON array of regex sources (${error.message}); it protects nothing until it is fixed.`;
    listErrors.push(CODEX ? `${name} is not a JSON array of regex sources (${error.message})` : message);
    if (!CODEX) process.stderr.write(`${message}\n`);
    return [];
  }
}
const FOLD = process.platform === 'win32' || process.platform === 'darwin';
const FROZEN_PATHS = regexList('FROZEN_PATHS', FROZEN_RAW, FOLD ? 'i' : '');

// Files whose content is a secret. A name that says it is an example (example, sample, template, dist, defaults)
// holds names and placeholders and stays readable; so does a key or certificate whose name says it is public, a
// known_hosts or authorized_keys file, and a chart's templates folder. Delete or narrow a line the project does not
// want - a tracked `.env.test` with no secret in it is the usual one.
const EXAMPLE = String.raw`(?![^/]*\b(?:example|sample|template|dist|defaults?)\b)`;
// A user's home folder by its absolute path or its shell spelling: a project's own .npmrc holds no token as a rule.
const HOME = String.raw`(?:^|\/)(?:(?:Users|home)\/[^/]+|root|~|\$HOME|\$\{HOME\}|\$env:(?:USERPROFILE|HOME)|%USERPROFILE%)\/`;
// The roaming AppData folder by its variable: cmd's, PowerShell's (also braced) and the one Git Bash exports.
const APPDATA = String.raw`(?:%APPDATA%|\$env:APPDATA|\$\{env:APPDATA\}|\$APPDATA|\$\{APPDATA\})`;
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
  /(?:^|\/)\.m2\/settings(?:-security)?\.xml$/i,
  /(?:^|\/)\.gradle\/gradle\.properties$/i,
  new RegExp(String.raw`${HOME}\.(?:npmrc|yarnrc\.yml)$`, 'i'),
  new RegExp(String.raw`(?:${HOME}(?:AppData\/Roaming\/NuGet|\.nuget\/NuGet|\.config\/NuGet)|(?:^|\/)${APPDATA}\/NuGet)\/NuGet\.Config$`, 'i'),
  // A kubeconfig by name, not a source file about one (kubeconfig.go, KubeconfigLoader.java).
  new RegExp(String.raw`(?:^|\/)${EXAMPLE}[^/]*kubeconfig(?:[-_][^/.]*)?(?:\.(?:ya?ml|json|conf|config|cfg))?$`, 'i'),
  /(?:^|\/)client_secret[^/]*\.json$/i,
  /(?:^|\/)application_default_credentials\.json$/i,
  new RegExp(String.raw`(?:^|\/)(?:\.config|AppData\/Roaming|${APPDATA})\/gcloud(?:\/|$)`, 'i'),
  ...regexList('SECRET_PATHS', SECRET_RAW, 'i'),
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
// filter or a name, never the verb), 'sql' (the whole segment but its SQL string literals), 'words' (the bare
// words as an array, for a source that is a function) or 'raw' (the words as typed, where a quoted value is the
// thing to read: a connection string). Redirections are in none but 'sql'. hint: a sentence the refusal adds.
const rule = (kind, label, source, scope = 'bare', hint = '') => ({
  kind,
  label,
  scope,
  hint,
  pattern: typeof source === 'function' ? { test: source } : new RegExp(source, 'i'),
});
// An image reference on this machine, and the end of a segment where only options follow it.
const LOCAL_REGISTRY = String.raw`(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/`;
const LAST = String.raw`(?:\s+-\S+)*\s*$`;
const SQL_CLIENTS = 'invoke-sqlcmd|psql|mysql|mariadb|sqlcmd|sqlite3|clickhouse-client|cockroach|usql|pgcli|mycli|bq|snowsql';
const SQL_DROP = String.raw`\b(?:DROP\s+(?:DATABASE|SCHEMA|TABLE|COLUMN|INDEX|VIEW|ROLE|USER|OWNED)|TRUNCATE)\b`;
const SQL_UNBOUNDED = String.raw`\b(?:DELETE\s+FROM|UPDATE\s+\S+(?:\s+(?:AS\s+)?\w+)?\s+SET)\b(?![^;]*\bWHERE\b)`;
const SQL_CLIENT = new RegExp(tool(SQL_CLIENTS), 'i');
const SQL_WIPE = new RegExp(`${SQL_DROP}|${SQL_UNBOUNDED}`, 'i');
// A copy that names the bucket after its source writes to it, from the disk or from another bucket; one that
// names the bucket first is a download.
const upload = (verbs, target) => String.raw`(?:${verbs})\s+(?:-\S+\s+)*[^-\s]\S*\s+(?:\S+\s+)*?${target}\S*`;
const REMOTE_URL = String.raw`https?:\/\/(?!(?:localhost|127\.0\.0\.1|\[::1\])(?=[:\/\s]|$))`;
// A read is not a write: `start-query`, `update-kubeconfig`, `admin-get-user`.
const AWS_WRITE =
  String.raw`(?:delete|terminate|remove|put|create|run|stop|reboot|modify|deregister|register|attach|detach|publish|send|invoke|deploy|restore|purge|reset|revoke|authorize|associate|disassociate|import|execute|add|set|change|enable|disable|submit|copy|allocate|release|promote|failover|rotate|cancel|schedule|tag|untag)-[\w-]+|admin-(?!get-|list-)[\w-]+|start-(?!query|live-tail)[\w-]+|update-(?!kubeconfig)[\w-]+|batch-(?:write|delete|execute)-[\w-]+|rm|rb|mb|mv|deploy|invoke|publish|` +
  upload('cp|sync', 's3://');
const localCluster = (flag) => `On a local cluster, retry with ${flag} kind-<name> (or minikube, docker-desktop).`;
// The `dotnet ef database update` options whose next word is their value, not the migration to go to.
const EF_VALUE = String.raw`(?:--(?:connection|context|project|startup-project|framework|configuration|runtime|msbuildprojectextensionspath)|-[cps])`;
// golang-migrate by its own name: not a value (`--profile=migrate`, `COMPOSE_PROFILES=migrate`), not a script name.
const GO_MIGRATE = String.raw`(?<![\w.:=-])(?<!--profile\s|-p\s|--project-name\s)(?<!(?:npm\s+run|pnpm(?:\s+run)?|yarn(?:\s+run)?|bun\s+run|make|just|task)\s)migrate(?:\.exe)?(?![\w.:-])`;
const FORBIDDEN = [
  rule('deploy', 'kubectl', tool('kubectl|oc') + first(String.raw`apply|delete|patch|replace|scale|rollout\s+(?:restart|undo|pause|resume)|drain|cordon|uncordon|taint|edit|set|create|annotate|label|exec|debug|cp|run|expose|autoscale|config\s+(?:use-context|set-context|delete-context|set-cluster|set-credentials|set)`), 'bare', localCluster('--context')),
  rule('deploy', 'helm', tool('helm|helmfile') + first('install|upgrade|uninstall|delete|rollback|push|apply|sync|destroy'), 'bare', localCluster('--kube-context')),
  rule('deploy', 'terraform', tool('terraform|tofu|terragrunt') + then(String.raw`apply|destroy|import|taint|untaint|force-unlock|state\s+(?:rm|mv|push)|workspace\s+(?:new|delete)`)),
  rule('deploy', 'pulumi', tool('pulumi') + then('up|destroy|refresh|import|cancel')),
  rule('deploy', 'ansible-playbook', tool('ansible-playbook') + without('--check|--syntax-check|--list-hosts|--list-tasks|--version|--help')),
  rule('deploy', 'a deploy tool', tool('serverless|cdk|cdktf|sam|sst|kamal|eb|azd') + first('deploy|destroy|remove|delete|terminate|bootstrap|sync|up')),
  rule('deploy', 'a deploy tool', tool('cap') + String.raw`(?:\s+\S+)?\s+deploy(?::[\w:]+)?(?=\s|$)` + '|' + tool('copilot') + then('deploy|delete') + '|' + tool('func') + String.raw`\s+azure\s+functionapp\s+publish(?=\s|$)`),
  rule('deploy', 'serverless', tool('sls') + first('deploy|remove')),
  rule('deploy', 'cf', tool('cf') + first('push|delete|delete-space')),
  rule('deploy', 'skaffold deploys to the current kube context', tool('skaffold') + first('run|dev|deploy|delete'), 'bare', localCluster('--kube-context')),
  rule('deploy', 'a deploy tool', tool('argocd') + String.raw`\s+app\s+(?:sync|delete|create|set|rollback)(?=\s|$)` + '|' + tool('supabase') + then('deploy')),
  rule('deploy', 'eksctl', tool('eksctl') + first('create|delete|upgrade|scale')),
  // The operation is the word after the service: `--function-name create-order` is a name.
  rule('deploy', 'aws', tool('aws') + first(String.raw`(?![-+])\S+` + first(AWS_WRITE))),
  rule('deploy', 'gcloud', tool('gcloud') + String.raw`(?!\s+(?:components|config)\s)` + then(String.raw`deploy|delete|create|update|apply|submit|import|ssh|scp|execute|patch|publish|enable|disable|update-[\w-]+|set-[\w-]+|add-iam-policy-binding|remove-iam-policy-binding|start|stop|reset|resize|rollback|rm|mv|` + upload('cp|rsync', 'gs://'))),
  rule('deploy', 'az', tool('az') + String.raw`(?!\s+account\s)` + then(String.raw`(?:create|delete|upload)(?:-[\w-]+)?|update|up|deploy|start|stop|restart|set|purge|import|config-zip|swap|scale|invoke|sync`)),
  rule('deploy', 'gsutil', tool('gsutil') + first(String.raw`(?:rm|rb|mb|mv)(?=\s.*gs:\/\/)|` + upload('cp|rsync', 'gs://'))),
  rule('deploy', 'azcopy', tool('azcopy') + first(String.raw`(?:remove|rm|make|mk)(?=\s(?:.*\s)?${REMOTE_URL})|` + upload('copy|cp|sync', REMOTE_URL))),
  rule('deploy', 'a hosting CLI', tool('fly|flyctl|netlify|railway|firebase|wrangler') + then(String.raw`deploy|publish|destroy|launch|scale|up|down|secrets?\s+(?:set|unset|import|put|delete)`)),
  rule('deploy', 'vercel', tool('vercel') + String.raw`(?!\s+(?:build|pull|dev|env|login|logout|whoami|ls|list|logs|inspect|link|help)(?=\s|$))` + then('deploy|promote|rollback|remove|rm|--prod') + '|' + HEAD + String.raw`vercel(?:\s+(?!--version|--help|-v|-h)-\S+)*\s*$`),
  rule('deploy', 'heroku', tool('heroku') + then(String.raw`run(?::\w+)?|restart|rollback|[\w-]+:(?:destroy|reset|rollback|restart|scale|promote|push|set|unset|create|add|remove|kill|release)[\w:-]*`)),
  rule('deploy', 'docker swarm', tool('docker') + first('stack|service') + first('deploy|rm|create|update|scale|rollback')),
  rule('deploy', 'a docker daemon on another host', dockerRemote, 'words'),
  rule('deploy', 'az acr build or run', tool('az') + first('acr') + first('build|run')),
  // A folder profile publishes on this machine; DeployOnBuild with one passes too.
  rule('deploy', 'a .NET publish profile', String.raw`^(?!.*\bPublishProfile=FolderProfile\b|.*\bWebPublishMethod=FileSystem\b)(?:.*` + tool('dotnet') + first('publish|msbuild|build') + '|.*' + tool('msbuild') + String.raw`)(?=.*\s(?:[-\/]p|(?:--?|\/)property):\S*?\b(?:PublishProfile=|WebPublishMethod=|DeployOnBuild=true\b))`),
  rule('remote', 'ssh, scp, sftp, rsync or PuTTY to another host', (words) => Boolean(remoteHost(words)), 'words'),
  rule('remote', 'winrs or psexec on another computer', windowsRemote, 'words'),
  // A tunnel to a database somewhere else - after a port-forward, `localhost` is that database - and a client the
  // command's own words point at another host.
  rule('remote', 'a tunnel to a cluster', String.raw`^(?!.*\s--context[= ](?:kind-[\w.-]+|k3d-[\w.-]+|minikube|docker-desktop|rancher-desktop|colima|orbstack)(?=\s|$)).*` + tool('kubectl|oc') + first('port-forward')),
  rule('remote', 'a tunnel or a client session to a cloud database', cloudProxy, 'words'),
  rule('remote', 'a tunnel or a client session to a cloud database', tool('gcloud') + then(String.raw`sql\s+connect|compute\s+start-iap-tunnel`) + '|' + tool('az') + then(String.raw`(?:postgres|mysql)\s+(?:flexible-server\s+|server\s+)?(?:connect|execute)`) + '|' + tool('heroku') + first(String.raw`pg:psql|psql|redis:cli`) + '|' + tool('fly|flyctl') + first(String.raw`proxy|(?:mpg|postgres|pg|redis)\s+(?:connect|proxy)`) + '|' + tool('railway') + first('connect')),
  rule('remote', 'a database client on another host', remoteDatabase, 'raw'),

  rule('publish', 'an image push', tool('docker|podman|nerdctl') + '(?:(?:' + first('compose|image|manifest') + ')?' + first('push') + '|' + then('--push') + ')'),
  rule('publish', 'an image push', tool('docker-compose|podman-compose') + first('push')),
  // jibDockerBuild and jib:dockerBuild build into the local daemon and pass.
  // jib to a registry on localhost (`-Dimage=`, `-Djib.to.image=`, `--image=`) passes as well.
  rule('publish', 'an image push', String.raw`^(?!.*\s(?:-Dimage=|-Djib\.to\.image=|--image=)${LOCAL_REGISTRY}).*(?:` + tool('gradle|gradlew') + then(String.raw`(?:[\w-]*:)*jib`) + '|' + tool('mvn|mvnw') + then(String.raw`(?:com\.google\.cloud\.tools:)?jib(?:-maven-plugin(?::[\w.-]+)?)?:build`) + ')'),
  rule('publish', 'an image push', tool('gradle|gradlew') + then(String.raw`(?:[\w-]*:)*bootBuildImage`) + String.raw`(?=.*\s--publishImage(?=\s|$))` + '|' + tool('mvn|mvnw') + String.raw`(?=.*\s-Dspring-boot\.build-image\.publish(?:=true)?(?=\s|$))` + then(String.raw`(?:[\w.-]+:)*spring-boot(?:-maven-plugin(?::[\w.-]+)?)?:build-image(?:-no-fork)?`)),
  rule('publish', 'an image push', String.raw`^(?!.*(?:^|\s)KO_DOCKER_REPO=(?:ko|kind)\.local(?=[\s\/]|$)).*` + tool('ko') + without(String.raw`--local(?:=true)?|-L|--push=false`) + first('build|apply|resolve')),
  // A copy lands on the reference it names last; an edit in place works on any it names.
  rule('publish', 'an image push', tool('crane') + first('push|copy|cp') + String.raw`(?!.*\s${LOCAL_REGISTRY}\S*${LAST})`),
  rule('publish', 'a registry change', tool('crane') + first('delete|tag|mutate|append|rebase') + String.raw`(?!.*\s(?:--?\w[\w-]*=)?${LOCAL_REGISTRY})`),
  rule('publish', 'an image push', tool('buildah') + `(?:${first('manifest')})?` + first('push') + String.raw`(?!.*\s(?:(?:docker:\/\/)?${LOCAL_REGISTRY}|(?:docker-daemon|containers-storage|oci|oci-archive|docker-archive|dir):)\S*${LAST})`),
  rule('publish', 'an image push', tool('skopeo') + first('copy') + String.raw`.*\sdocker:\/\/(?!${LOCAL_REGISTRY})\S+${LAST}` + '|' + tool('skopeo') + first('delete') + String.raw`.*\sdocker:\/\/(?!${LOCAL_REGISTRY})\S`),
  rule('publish', 'an image push', tool('skopeo') + first('sync') + String.raw`(?!.*\s--dest[= ]dir(?=\s|$))(?!.*\s${LOCAL_REGISTRY}\S*${LAST})`),
  rule('publish', 'an artifact push', tool('oras') + first('push|attach') + String.raw`(?!(?:\s+-\S+(?:\s+(?!-)\S+)??)*?\s+${LOCAL_REGISTRY})` + '|' + tool('oras') + first('cp|copy') + String.raw`(?!.*\s${LOCAL_REGISTRY}\S*${LAST})`),
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

  // `compose config` prints the file with every env value filled in; these options print names only.
  // `convert` is its alias. Every --env-file an example file: only placeholders to fill in.
  rule('secret', 'compose config prints the interpolated env values', String.raw`^(?!(?=.*\s--env-file[= ])(?!.*\s--env-file[= ](?!(?:\S*\/)?[^\s/]*\b(?:example|sample|template|dist|defaults?)\b))).*(?<![\w.-])(?:docker|podman)(?:-|\s+)compose(?=\s)` + first('config|convert') + without(String.raw`--services|--volumes|--profiles|--images|--networks|--hash(?:=\S+)?|-q|--quiet`)),
  // A list of secrets shows names, `describe` byte counts; an output format prints the values.
  rule('reveal', 'a cluster secret', tool('kubectl|oc') + String.raw`(?=.*\s(?:-o\s*|-o=|--output[= ])(?:ya?ml|jsonpath|json|go-template|custom-columns|template)(?=[=\s]|-|$))` + first('get') + String.raw`(?:\s+[-+]\S+(?:\s+(?![-+])\S+)??)*?\s+(?:\S*,)?secrets?(?:[\/,.]\S*)?(?=\s|$)`),
  // A secret store hands out the value itself; its list of names and its describe pass, and so does a parameter
  // read with no decryption.
  rule('reveal', 'a value from a cloud secret store', tool('aws') + first('secretsmanager') + first(String.raw`(?:batch-)?get-secret-value`) + '|' + tool('aws') + first('ssm') + first(String.raw`get-parameter[\w-]*`) + String.raw`(?=.*\s--with-decryption(?=\s|$))`),
  rule('reveal', 'a value from a cloud secret store', tool('gcloud') + then(String.raw`secrets\s+versions\s+access`) + '|' + tool('az') + then(String.raw`keyvault\s+secret\s+(?:show|download)`)),
  rule('reveal', "the app's config vars", tool('heroku') + first(String.raw`config(?::get)?`)),
  // A secret kept by a tool, decrypted or listed with its values.
  rule('reveal', 'a secret store or an encrypted file', tool('dotnet') + first('user-secrets') + first('list') + '|' + tool('rails|rake') + then(String.raw`credentials:show`) + '|' + tool('sops') + then(String.raw`-d|--decrypt|decrypt`) + '|' + tool('vault') + first(String.raw`kv\s+get|read`) + '|' + tool('op') + first(String.raw`read|item\s+get`)),

  rule('data', 'compose down with its volumes', String.raw`(?<![\w.-])(?:docker|podman)(?:-|\s+)compose(?=\s)` + first('down') + String.raw`(?=.*\s(?:-v|--volumes)(?=\s|$))`),
  rule('data', 'a volume or system prune', tool('docker|podman') + String.raw`\s+(?:volume\s+(?:rm|prune)|system\s+prune)(?=\s|$)`),
  rule('data', 'a destructive SQL statement', tool(SQL_CLIENTS) + '.*' + SQL_DROP, 'sql'),
  rule('data', 'a DELETE or UPDATE with no WHERE', tool(SQL_CLIENTS) + '.*' + SQL_UNBOUNDED, 'sql'),
  rule('data', 'a database drop', tool('dropdb') + '|' + tool('mysqladmin|dbmate') + then('drop')),
  rule('data', 'a cache flush', tool('redis-cli|valkey-cli') + then('FLUSHALL|FLUSHDB')),
  rule('data', 'a database drop', tool('mongosh|mongo') + String.raw`.*(?:dropDatabase|\.drop\s*\(|deleteMany\s*\(\s*\{\s*\}\s*\))`, 'sql'),
  rule('data', 'a migration reset', tool('prisma') + String.raw`\s+(?:migrate\s+reset|db\s+push\b.*--(?:force-reset|accept-data-loss))(?=\s|$)`),
  rule('data', 'a migration reset', tool('artisan') + then(String.raw`migrate:(?:fresh|reset|refresh)|db:wipe`)),
  // A rollback past the one migration a task iterates on - more than one step, or to a target the hook cannot size -
  // asks; one step back (`alembic downgrade -1`, `db:rollback`, `goose down`) is the edit-and-retry loop and passes.
  // STEP may stand anywhere in the call: before the command, or after another variable.
  rule('data', 'a database reset or a rollback past one step', tool('rails|rake') + then(String.raw`db:(?:drop|reset|purge|truncate_all|schema:load|structure:load|migrate:reset)(?::\w+)*|db:migrate\s+VERSION=\S+`) + '|' + String.raw`^(?=(?:.*\s)?STEP=(?:[2-9]|\d{2,})(?=\s|$)).*` + tool('rails|rake') + then(String.raw`db:(?:rollback|migrate:redo)(?::\w+)?`)),
  // The options before the app that take a value (`--settings x`, `--database x`, `-v 2`) are not the app.
  rule('data', 'a database flush or a migrate to a named migration', String.raw`(?:manage\.py|(?<![\w.-])django-admin)\s+(?:(?:flush|reset_db)|migrate\s+(?:(?:--(?:settings|database|verbosity|pythonpath)|-v)\s+\S+\s+|(?!(?:--(?:settings|database|verbosity|pythonpath)|-v)\s)-\S+\s+)*[^-\s]\S*\s+[^-\s]\S*)(?=\s|$)`),
  rule('data', 'a downgrade past one step', tool('alembic|flask') + then(String.raw`(?:db\s+)?downgrade\s+(?!-1(?=\s|$))\S+`)),
  // The options that take a value are listed, as for Django: `--no-build InitialCreate` names a target.
  rule('data', 'a database drop or an update to a named migration', String.raw`(?<![\w.-])(?:dotnet(?:\.exe)?\s+ef|dotnet-ef)(?:\s+-\S+(?:\s+(?!-)\S+)?)*?\s+database\s+(?:drop|update(?:\s+(?:${EF_VALUE}\s+\S+|(?!${EF_VALUE}\s|--\s)-\S+))*\s+[^-\s]\S*)(?=\s|$)`),
  // One changeset back passes, as one step does everywhere else; the Maven and Gradle plugins are how a JVM
  // project runs Liquibase.
  rule('data', 'a schema clean or a rollback', String.raw`(?<!-pl\s|--projects\s)` + tool('flyway') + first('clean') + '|' + tool('liquibase') + then(String.raw`drop-?all|rollback[\w-]*(?<!-sql|Sql)(?!(?<=count)\s+(?:--count[= ])?1(?=\s|$))`)),
  rule('data', 'a rollback past one step', String.raw`^(?!.*\s-Dliquibase\.rollbackCount=1(?=\s|$)).*` + tool('mvn|mvnw') + then(String.raw`(?:[\w.-]+:)*liquibase(?:-maven-plugin(?::[\w.-]+)?)?:rollback(?:OneChangeSet|OneUpdate)?`) + '|' + tool('gradle|gradlew') + then(String.raw`(?:[\w-]*:)*rollback(?:ToDate|OneChangeSet|OneUpdate)?`) + '|' + String.raw`^(?!.*\s-PliquibaseCommandValue=1(?=\s|$)).*` + tool('gradle|gradlew') + then(String.raw`(?:[\w-]*:)*rollbackCount`)),
  // Rewriting the record of what ran is how a merged migration gets "changed" without an edit.
  rule('history', 'a migration stamp', tool('alembic|flask') + then(String.raw`(?:db\s+)?stamp`)),
  rule('history', 'a migration marked as run', String.raw`(?:manage\.py|(?<![\w.-])django-admin)\s+migrate\s+(?:\S+\s+)*?--fake(?=\s|$)` + '|' + tool('liquibase') + then(String.raw`changelog-?sync[\w-]*(?<!-sql|Sql)|mark-next-changeset-ran(?!-sql)`) + '|' + tool('gradle|gradlew|mvn|mvnw') + then(String.raw`(?:[\w.-]*:)*(?:changelogSync(?:ToTag)?|markNextChangesetRan)`)),
  rule('history', 'a schema history repair', tool('flyway') + first('repair') + '|' + tool('liquibase') + then(String.raw`clear-?check-?sums`) + '|' + tool('gradle|gradlew|mvn|mvnw') + then(String.raw`(?:[\w.-]*:)*(?:flywayRepair|flyway:repair|clearCheckSums)`)),
  rule('history', 'removing the newest migration', String.raw`(?<![\w.-])(?:dotnet(?:\.exe)?\s+ef|dotnet-ef)(?:\s+-\S+(?:\s+(?!-)\S+)?)*?\s+migrations\s+remove(?=\s|$)`),
  rule('history', 'a migration marked applied or rolled back', tool('prisma') + String.raw`\s+migrate\s+resolve(?=\s|$)`),
  rule('data', 'a schema clean', tool('gradle|gradlew|mvn|mvnw') + then(String.raw`(?:[\w-]*:)*(?:flywayClean|flyway:clean|dropAll|liquibase:dropAll)`)),
  rule('data', 'a migration reset', tool('knex') + String.raw`.*\smigrate:rollback(?=\s).*\s--all(?=\s|$)`),
  rule('data', 'a database drop', tool(String.raw`sequelize|sequelize-cli|typeorm(?:-ts-node-(?:commonjs|esm))?|mikro-orm`) + then(String.raw`db:drop|db:migrate:undo:all|db:seed:undo:all|schema:drop|schema:fresh|migration:fresh`)),
  rule('data', 'a rollback past one step', tool('sequelize|sequelize-cli') + then(String.raw`db:migrate:undo(?=(?:\s+\S+)*?\s+--to(?:=|\s|$))`)),
  // golang-migrate's bare `down` runs every down migration, and `goto` may run any number of them; `migrate` as a
  // compose profile, a project name or a package script (`npm run migrate down`) is not it.
  rule('data', 'a database drop or a rollback past one step', GO_MIGRATE + then(String.raw`drop|goto|down(?!\s+1(?=\s|$))`)),
  rule('history', 'a forced migration version', GO_MIGRATE + then('force')),
  rule('data', 'a database reset or a rollback to a version', tool('goose') + then(String.raw`reset|down-to`) + '|' + tool('atlas') + then(String.raw`schema\s+clean`)),
  rule('data', 'a database reset', tool('diesel|sqlx') + then(String.raw`database\s+(?:drop|reset)`) + '|' + tool('supabase') + then(String.raw`db\s+reset`)),
  rule('data', 'a database drop or a rollback past one step', tool('mix') + then(String.raw`ecto\.(?:drop|reset)|ecto\.rollback(?=(?:\s+\S+)*?\s+(?:--all|--to(?:=|\s)|(?:-n|--step)(?:=|\s+)(?:[2-9]|\d{2,})))`)),
  rule('data', 'a database drop', String.raw`\bdoctrine:(?:database|schema):drop\b` + without('--dump-sql')),

  ...regexList('FORBIDDEN_COMMANDS', FORBIDDEN_RAW, 'i').map((pattern) => rule('project', 'FORBIDDEN_COMMANDS', pattern)),
];
const KIND = {
  deploy: 'deploys or changes infrastructure',
  publish: 'publishes outside this machine',
  data: 'destroys data',
  project: "is on this project's forbidden list",
};
// A dry run reaches nothing, and neither does a call aimed at this machine: an emulator behind a localhost
// endpoint, the gcloud emulators, a cluster named as a local one, a registry on localhost (the image a push names
// last, or every tag of a `--push` build). They pass the deploy and publish rules, and so does a switch to a local
// context; a kubectl call that names no context is not known to be local and does not.
const DRY_RUN = /\s--dry-run(?:=(?!none|false)\S+)?(?=\s|$)/i;
const LOCAL = new RegExp(
  [
    String.raw`\s--endpoint-url[= ]https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|localstack)(?::\d+)?(?=[\/\s]|$)`,
    String.raw`(?:^|\s)gcloud(?:\s+(?:alpha|beta))?\s+emulators\s`,
    String.raw`\s(?:--(?:kube-)?context[= ]|config\s+use-context\s+)(?:kind-[\w.-]+|k3d-[\w.-]+|minikube|docker-desktop|rancher-desktop|colima|orbstack)(?=\s|$)`,
    String.raw`\spush(?:\s+-\S+)*\s+${LOCAL_REGISTRY}\S*${LAST}`,
  ].join('|'),
  'i',
);
const LOCAL_IMAGE = new RegExp(`^${LOCAL_REGISTRY}`, 'i');
function localTagsOnly(words) {
  if (!words.some((word) => /^--push(?:=true)?$/i.test(word))) return false;
  const tags = words.flatMap((word, index) => {
    if (/^(?:-t|--tag)$/.test(words[index - 1] ?? '')) return [word];
    const joined = /^(?:-t=|--tag=)(.+)$/.exec(word);
    return joined ? [joined[1]] : [];
  });
  return tags.length > 0 && tags.every((tag) => LOCAL_IMAGE.test(tag));
}

// `docker -H ssh://prod compose up` changes the other host; a call that only reads it (`ps`, `logs`) passes.
const DOCKER_VALUE = /^(?:-H|--host|-c|--context|--config|-l|--log-level|--tlscacert|--tlscert|--tlskey|-f|--file|-p|--project-name|--env-file|--profile|--project-directory|--ansi|--progress|--parallel)$/;
const DOCKER_GROUPS = new Set(['compose', 'container', 'image', 'volume', 'network', 'system', 'service', 'stack', 'node', 'plugin', 'buildx', 'builder', 'manifest', 'swarm', 'trust']);
const DOCKER_READS = new Set(['ps', 'ls', 'list', 'images', 'logs', 'inspect', 'info', 'version', 'events', 'stats', 'top', 'port', 'diff', 'history', 'search', 'df', 'config', 'convert', 'show', 'help', 'login', 'logout', 'context']);
const LOCAL_DOCKER_HOST = /^(?:(?:unix|npipe|fd):|(?:tcp|ssh|https?):\/\/(?:[^@\/]+@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$)/i;
const LOCAL_DOCKER_CONTEXT = /^(?:default|desktop-linux|docker-desktop|rancher-desktop|colima(?:-[\w.-]+)?|orbstack)$/i;
// Set when the call assigns DOCKER_HOST or DOCKER_CONTEXT another host anywhere (`export`, `$env:`): every docker
// call after it in the same command talks to that host.
let dockerElsewhere = false;
const DOCKER_ASSIGN = /(?:^|[\s;&|(])(?:export\s+|set\s+|\$env:)?DOCKER_(HOST|CONTEXT)\s*=\s*["']?([^\s"';&|)]+)/gi;
function noteDockerAssignments(command) {
  for (const [, name, value] of command.matchAll(DOCKER_ASSIGN)) {
    if (!(name.toUpperCase() === 'HOST' ? LOCAL_DOCKER_HOST : LOCAL_DOCKER_CONTEXT).test(value)) dockerElsewhere = true;
  }
}
function dockerRemote(words) {
  const at = words.findIndex((word) => commandName(word) === 'docker' || commandName(word) === 'docker-compose');
  if (at === -1) return false;
  let remote = dockerElsewhere || words.slice(0, at).some((word) => {
    const env = /^DOCKER_(HOST|CONTEXT)=(.*)$/.exec(word);
    return Boolean(env?.[2]) && !(env[1] === 'HOST' ? LOCAL_DOCKER_HOST : LOCAL_DOCKER_CONTEXT).test(env[2]);
  });
  const verbs = commandName(words[at]) === 'docker-compose' ? ['compose'] : [];
  for (let index = at + 1; index < words.length && verbs.length < 2; index += 1) {
    const word = words[index];
    const option = /^(-H|--host|-c|--context)(?:=(.*))?$/.exec(word);
    if (option) {
      const value = option[2] ?? words[(index += 1)] ?? '';
      if (!(/^(?:-H|--host)$/.test(option[1]) ? LOCAL_DOCKER_HOST : LOCAL_DOCKER_CONTEXT).test(value)) remote = true;
    } else if (DOCKER_VALUE.test(word)) index += 1;
    else if (!word.startsWith('-')) {
      verbs.push(word.toLowerCase());
      if (!DOCKER_GROUPS.has(verbs[0])) break;
    }
  }
  return remote && verbs.length > 0 && !DOCKER_READS.has(verbs[verbs.length - 1]);
}

// The other host an ssh, sftp, scp or rsync call reaches: ssh and sftp name it first, a copy as `host:path`.
// PuTTY's plink and psftp name it first as ssh does, pscp as `host:path`; their options are whole words.
const REMOTE_TOOLS = new Set(['ssh', 'sftp', 'scp', 'rsync', 'plink', 'psftp', 'pscp']);
const REMOTE_VALUE = { ssh: 'BbcDEeFIiJLlmOoPpQRSWw', sftp: 'BbcDFiJloPRSsX', scp: 'cDFiJloPS', rsync: 'eTf' };
const PUTTY = new Set(['plink', 'psftp', 'pscp']);
const PUTTY_VALUE = /^-(?:P|l|i|pw|pwfile|m|L|R|D|load|hostkey|sercfg|proxycmd|b|sshlog|sshrawlog)$/;
const LOCAL_HOST = /^\[?(?:localhost|127\.0\.0\.1|::1)\]?$/i;
function hostOf(word, bare) {
  const scheme = /^(?:ssh|sftp|scp|rsync):\/\/(?:[^@\/]*@)?(\[[^\]]*\]|[^:\/]+)/i.exec(word);
  if (scheme) return scheme[1];
  const remote = /^(?:[^@\/]*@)?(\[[^\]]*\]|[^:\/@]+)(:|$)/.exec(word);
  if (!remote || (!remote[2] && !bare)) return '';
  // One letter before the colon is a Windows drive.
  return remote[2] && remote[1].length === 1 ? '' : remote[1];
}
function remoteHost(words) {
  const at = words.findIndex((word) => REMOTE_TOOLS.has(commandName(word)));
  if (at === -1) return '';
  const name = commandName(words[at]);
  const plain = [];
  for (let index = at + 1; index < words.length; index += 1) {
    const word = words[index];
    if (!word.startsWith('-')) plain.push(word);
    else if (PUTTY.has(name) ? PUTTY_VALUE.test(word) : /^-[A-Za-z]+$/.test(word) && REMOTE_VALUE[name].includes(word.slice(-1))) index += 1;
    else if (name === 'rsync' && /^--(?:rsh|filter|exclude|include|files-from|exclude-from|include-from)$/.test(word)) index += 1;
  }
  // `ssh -T git@host` only checks that the git host accepts the key.
  if (name === 'ssh' && words.includes('-T') && plain.length === 1 && /^git@/i.test(plain[0])) return '';
  const hosts = /^(?:ssh|sftp|plink|psftp)$/.test(name) ? plain.slice(0, 1).map((word) => hostOf(word, true)) : plain.map((word) => hostOf(word, false));
  return hosts.find((host) => host && !LOCAL_HOST.test(host)) ?? '';
}

// This computer by any name a Windows remoting tool takes for it.
const localComputer = (host) => /^(?:\.|localhost|127\.0\.0\.1|::1|\[::1\]|\$env:COMPUTERNAME|\$\{env:COMPUTERNAME\})$/i.test(host) || host.toLowerCase() === os.hostname().toLowerCase();
const hostPart = (value) => value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

// winrs runs on the computer its `-r:` / `-remote:` names (this one without it); psexec and paexec on each
// `\\computer` they are handed.
function windowsRemote(words) {
  const names = words.map(commandName);
  const at = names.findIndex((name) => /^(?:winrs|psexec(?:64)?|paexec)$/.test(name));
  if (at === -1) return false;
  const hosts = [];
  for (const word of words.slice(at + 1)) {
    const remote = names[at] === 'winrs' ? /^[-/]r(?:emote)?:(.+)$/i.exec(word) : /^\\\\(.+)$/.exec(word);
    if (remote) hosts.push(...remote[1].split(',').filter(Boolean).map(hostPart));
  }
  return hosts.some((host) => !localComputer(host));
}

// A database client whose own words name another host: a host option or a connection URL. One run inside a
// container talks to that container's network, and one that names no host connects where its environment says,
// which the hook cannot read.
const DB_CLIENTS = new Set([
  'psql', 'pgcli', 'pg_dump', 'pg_dumpall', 'pg_restore', 'pg_basebackup', 'createdb', 'dropdb', 'createuser', 'dropuser', 'reindexdb', 'vacuumdb',
  'mysql', 'mariadb', 'mycli', 'mysqldump', 'mariadb-dump', 'mysqladmin', 'mariadb-admin', 'mysqlimport', 'sqlcmd', 'invoke-sqlcmd', 'usql',
  'cockroach', 'clickhouse-client', 'clickhouse', 'mongosh', 'mongo', 'mongodump', 'mongorestore', 'mongoexport', 'mongoimport', 'redis-cli',
  'valkey-cli',
]);
// The clients that take a libpq connection string: `psql "host=db.example.com dbname=app"`.
const LIBPQ_CLIENTS = new Set(['psql', 'pgcli', 'pg_dump', 'pg_dumpall', 'pg_restore', 'pg_basebackup']);
const CONNINFO = /^(?:[a-z_]+\s*=\s*(?:'[^']*'|\S*)(?:\s+|$))+$/i;
const CONNINFO_HOST = /(?:^|\s)host(?:addr)?\s*=\s*'?([^'\s]+)/i;
// psql's variable assignment: `-v host=web1` sets a variable named host, it is not a connection string.
const PSQL_VARIABLE = /^(?:-v|--set|--variable)$/;
// kubectl and oc are here because a call into a cluster that is not a local one is refused before this rule reads it.
const CONTAINER_RUNNERS = new Set(['docker', 'podman', 'nerdctl', 'docker-compose', 'podman-compose', 'kubectl', 'oc']);
// A `docker run` of a client image sits on the default bridge and reaches outward; on a network it names, or beside
// a linked container, it talks to that network. `exec` and compose are inside one already.
function insideContainer(words, names, runner, at) {
  const before = words.slice(runner + 1, at);
  if (!/^(?:docker|podman|nerdctl)$/.test(names[runner]) || before.includes('compose') || !before.includes('run')) return true;
  return words.some((word, index) => {
    if (index <= runner) return false;
    if (/^--link(?:=|$)/.test(word)) return true;
    const network = /^--net(?:work)?(?:=(.*))?$/.exec(word);
    return Boolean(network) && !/^(?:host|bridge|default|none)?$/.test(network[1] ?? words[index + 1] ?? '');
  });
}
// A host a call assigns for the commands after it (`export PGHOST=...`, `$env:PGHOST = ...`, a database URL in any
// variable): a client that names no host of its own connects there.
let databaseElsewhere = false;
const DB_ASSIGN = /(?:^|[\s;&|(])(?:export\s+|set\s+|\$env:)?([A-Za-z_]\w*)\s*=\s*["']?([^\s"';&|)]+)/g;
function noteDatabaseAssignments(command) {
  for (const [, name, value] of command.matchAll(DB_ASSIGN)) {
    const host = /^(?:PGHOST|PGHOSTADDR|MYSQL_HOST)$/.test(name) ? value : DB_URL.exec(value)?.[1];
    if (host && !localDatabaseHost(host)) databaseElsewhere = true;
  }
}
// The Cloud SQL and AlloyDB proxies: the command a segment runs (a release asset is `cloud-sql-proxy.x64.exe`), also
// behind Start-Process, or the image of a `docker run`. A download, a chmod or an install only names the file.
const PROXY_NAME = /^(?:cloud[-_]sql[-_]proxy|alloydb-auth-proxy)(?:[._][\w.-]*)?$/;
const PROXY_IMAGE = /(?:^|\/)(?:cloud-sql-proxy|alloydb-auth-proxy)(?:[:@]\S*)?$/i;
function cloudProxy(words) {
  if (words.some((word) => /^(?:--version|--help|-h|version|help)$/.test(word))) return false;
  const names = words.map(commandName);
  let at = commandAt(words, names);
  if (/^(?:start-process|saps|start)$/.test(names[at] ?? '')) at = words.findIndex((word, index) => index > at && !word.startsWith('-'));
  if (PROXY_NAME.test(names[at] ?? '')) return true;
  return /^(?:docker|podman|nerdctl)$/.test(names[at] ?? '') && words.includes('run') && words.some((word) => PROXY_IMAGE.test(word));
}
// A database's own URL schemes only: a value such as `amqp://broker/orders` is data the client stores.
const DB_URL = /^(?:jdbc:)?(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|valkey|sqlserver|clickhouse|cockroachdb):\/\/(?:[^@\/?#]*@)?(\[[^\]]*\]|[^:\/?#,;]+)/i;
function localDatabaseHost(value) {
  // sqlcmd spells a server as `tcp:host,1433` or `host\INSTANCE`; a path is a Unix socket; `::1` is no port.
  const host = value.replace(/^(?:tcp|np|lpc):/i, '').replace(/[,\\].*$/, '');
  const bare = LOCAL_HOST.test(host) ? host : host.replace(/:\d+$/, '');
  return !bare || bare.startsWith('/') || LOCAL_HOST.test(bare) || /^(?:\.|\(local\)|\(localdb\)|0\.0\.0\.0|host\.docker\.internal)$/i.test(bare);
}
function remoteDatabase(words) {
  const names = words.map(commandName);
  let at = names.findIndex((name) => DB_CLIENTS.has(name));
  if (at === -1) return false;
  const runner = names.findIndex((name, index) => index < at && CONTAINER_RUNNERS.has(name));
  if (runner !== -1) {
    if (insideContainer(words, names, runner, at)) return false;
    // In a `docker run` the client is the command after the image, never an option's value (`--name mongo`).
    at = names.findIndex((name, index) => index > runner && DB_CLIENTS.has(name) && !words[index - 1].startsWith('-'));
    if (at === -1) return false;
  }
  for (const word of words.slice(0, at)) {
    const env = /^(?:(PGHOST|PGHOSTADDR|MYSQL_HOST)|[A-Za-z_]\w*)=(.+)$/.exec(word);
    const host = env && (env[1] ? env[2] : DB_URL.exec(env[2])?.[1]);
    if (host && !localDatabaseHost(host)) return true;
  }
  // `-S` is sqlcmd's server; for mysql it is a socket, for psql a mode with no value.
  const sqlcmd = names[at] === 'sqlcmd';
  // Invoke-Sqlcmd's -ServerInstance by the prefixes PowerShell accepts (`-Ser`).
  const hostFlag = sqlcmd ? /^(?:-S|--server)$/ : names[at] === 'invoke-sqlcmd' ? /^-Ser(?:v(?:e(?:r(?:I(?:n(?:s(?:t(?:a(?:n(?:c(?:e)?)?)?)?)?)?)?)?)?)?)?$/i : /^(?:-h|--host)$/;
  const mongo = names[at] === 'mongosh' || names[at] === 'mongo';
  // Whether the client's own words say where it connects: only one that says nothing follows the call's variable.
  let named = false;
  for (let index = at + 1; index < words.length; index += 1) {
    const word = words[index];
    const option = word.replace(/^--?[\w-]+=/, '');
    const url = DB_URL.exec(option);
    if (url) {
      if (!localDatabaseHost(url[1])) return true;
      named = true;
      continue;
    }
    if (names[at] === 'psql' && PSQL_VARIABLE.test(word)) {
      index += 1;
      continue;
    }
    // mongosh's own address forms: `host:27017/app` and `db.example.com/app`.
    const address = mongo && !word.startsWith('-') ? /^([\w-]+(?:\.[\w-]+)*):\d+(?:\/|$)|^([\w-]+(?:\.[\w-]+)+)\/[\w-]*$/.exec(word) : null;
    const conninfo = LIBPQ_CLIENTS.has(names[at]) && CONNINFO.test(option) ? CONNINFO_HOST.exec(option) : null;
    const joined = /^--(?:host|server)=(.+)$/i.exec(word) ?? (sqlcmd ? /^-S(.+)$/.exec(word) : names[at] === 'invoke-sqlcmd' ? null : /^-h(?!elp$)(.+)$/.exec(word));
    const value = address ? (address[1] ?? address[2]) : conninfo ? conninfo[1] : joined ? joined[1] : hostFlag.test(word) ? (words[(index += 1)] ?? '') : null;
    if (value === null) continue;
    if (!localDatabaseHost(value)) return true;
    named = true;
  }
  return databaseElsewhere && !named;
}

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
  'hexdump', 'format-hex', 'fhx', 'base64', 'type', 'get-content', 'gc', 'import-csv', 'grep', 'egrep', 'fgrep', 'rg', 'ag',
  'ack', 'findstr', 'select-string', 'sls', 'sed', 'gsed', 'awk', 'gawk', 'cut', 'sort', 'uniq', 'diff', 'cmp', 'jq',
  'yq', 'dd', 'tar', 'cp', 'copy', 'copy-item', 'cpi', 'scp', 'rsync', 'mv', 'move', 'move-item',
  // An archive, a recoding, a split or a Windows copier copies it.
  'compress-archive', 'zip', '7z', '7za', 'gzip', 'bzip2', 'xz', 'zstd', 'comm', 'join', 'iconv', 'pr', 'fold', 'fmt',
  'expand', 'split', 'perl', 'ruby', 'xcopy', 'robocopy',
]);
// Two readers only by their verb: `certutil -encode` (not `-hashfile`), `openssl base64` / `enc` (not `genrsa`).
const readsByVerb = (name, words, at) =>
  (name === 'certutil' && words.some((word) => /^[-/](?:encode|decode|encodehex|dump)$/i.test(word))) || (name === 'openssl' && /^(?:base64|enc)$/.test(words[at + 1] ?? ''));
// The upload tools read only the file they send - a value spelled `@file` or `<file`, the value of -T and its kin, a
// `-Form` entry, a mail's `-Attachments`; a URL, a header or a client certificate (`--cert`, `--key`) is none.
const UPLOADERS = new Set(['curl', 'wget', 'http', 'xh', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'send-mailmessage']);
// -InFile by the prefixes PowerShell accepts (`-InF` is also -InformationAction's); -Attachments by any, for
// Send-MailMessage only (`-A` is curl's user agent).
const UPLOAD_FILE = /^(?:-T|--upload-file|--post-file|--body-file|-InFi(?:l(?:e)?)?)$/i;
const ATTACHMENTS = /^-A(?:t(?:t(?:a(?:c(?:h(?:m(?:e(?:n(?:t(?:s)?)?)?)?)?)?)?)?)?)?$/i;
// Their first plain argument is a pattern or a script, never a path: `grep "\.env" src` searches for a string.
const SEARCHERS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'findstr', 'select-string', 'sls', 'sed', 'gsed', 'awk', 'gawk', 'jq', 'yq', 'perl', 'ruby']);
// An option whose next word is a filter, a pattern or a name, never a path read: a wildcard after it is not expanded.
// find's -path is not here: find is no reader, and PowerShell's -Path is a path.
const VALUE_OPTION = /^(?:-[gtvexdso]|--i?glob|--include|--exclude(?:-dir)?|--type|--regexp|--expression|--delimiter|--separator|--output|-i?name|-i?regex|-Filter|-Include|-Exclude|-Pattern)$/i;
// Their last plain argument is where the copy lands, not what is read.
const COPIERS = new Set(['cp', 'copy', 'copy-item', 'cpi', 'scp', 'rsync', 'mv', 'move', 'move-item']);
const GREPS = new Set(['grep', 'egrep', 'fgrep']);
const RECURSIVE = /^(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive|--dereference-recursive)$/;
const GREP_FILTER = /^--(include|exclude|exclude-dir)(?:=(.*))?$/i;
// The grep options that take the next word as their value; -e and -f (and their long forms) give the pattern.
const GREP_VALUE = /^(?:-[A-Za-z]*[efmABCdD]|--(?:regexp|file|max-count|after-context|before-context|context|devices|directories|label|binary-files|exclude-from))$/;
// grep -r reads build output too, so only these are skipped unasked: a search through them is almost never meant.
const WALK_SKIP = new Set(['node_modules', '.git']);
const TOO_LARGE = Symbol('too large');
const WALK_CAP = 20000;
const WILD = /[*?[]/;
// ripgrep told to read what the ignore files or a leading dot would keep out, and its options that take a value.
const RG_UNRESTRICTED = /^(?:-[A-Za-z]*u[A-Za-z]*|-\.|--unrestricted|--hidden|--no-ignore(?:-vcs)?)$/;
const RG_VALUE = /^(?:-[A-Za-z]*[ABCEMTdjmr]|--(?:after-context|before-context|context|color|colors|context-separator|encoding|engine|field-context-separator|field-match-separator|ignore-file|max-columns|max-count|max-depth|max-filesize|path-separator|pre|pre-glob|replace|sort|sortr|threads|type-add|type-clear|type-not))$/;
// PowerShell: the listings Select-String reads file by file, and -Recurse as it may be cut short (-s is its alias).
const PS_LISTERS = new Set(['get-childitem', 'gci', 'dir', 'ls']);
const PS_SEARCHERS = new Set(['select-string', 'sls']);
const PS_RECURSE = /^-(?:r|re|rec|recu|recur|recurs|recurse|s)$/i;
const FIND_RUNS = /^-(?:exec|execdir|ok|okdir)$/;
// -Path, and -LiteralPath by the prefixes PowerShell accepts (`-Li` and `-Pa` are ambiguous in Select-String).
const PATH_PARAM = /^-(?:Path|Lit(?:e(?:r(?:a(?:l(?:P(?:a(?:t(?:h)?)?)?)?)?)?)?)?|LP|PSPath)$/i;
const EXPRESSION = /^(?:-e|--regexp|--expression)$/;
const EXCLUDE_FLAG = /^--exclude(?:-dir)?$/i;
const EXCLUDE_WORD = /^--exclude(?:-dir)?=/i;
// The git verbs that print a file's content (`git grep` is a searcher and is judged as one), and the options
// whose value is a pattern or a name, never a path.
const GIT_PRINTS = new Set(['show', 'diff', 'blame', 'cat-file']);
const GIT_VALUE = /^--?(?:grep|S|G|author|committer|format|pretty|since|until)$/;
// A pathspec that leaves files out (`:!x`, `:^x`, `:(exclude)x`, `:(exclude,glob)x`) is the opposite of a read.
const GIT_EXCLUDE = /^:(?:!|\^|\((?:[\w,]*,)?exclude[,)])/;
const REMOVERS = new Set([
  'rm', 'del', 'erase', 'ri', 'rd', 'rmdir', 'remove-item', 'unlink', 'mv', 'move', 'move-item', 'mi', 'ren',
  'rename-item', 'rni', 'truncate', 'shred', 'clear-content', 'clc',
]);
// A database server's own data folder: a system or Homebrew install's, a Windows install's, or a bind mount named
// for it.
const DATA_DIR = /(?:^|\/)(?:var\/lib\/(?:postgresql|pgsql|mysql|mariadb|mongo(?:db)?|redis|clickhouse|cassandra|elasticsearch|docker\/volumes)|var\/opt\/mssql|usr\/local\/pgsql\/data|(?:opt\/homebrew|usr\/local)\/var\/(?:postgres(?:ql)?(?:@[\d.]+)?|mysql|mariadb|mongodb|redis)|PostgreSQL\/[^/]+\/data|MongoDB\/Server\/[^/]+\/data|MySQL\/MySQL Server [^/]+\/Data|MSSQL\/DATA|(?:pg|postgres(?:ql)?|mysql|mariadb|mongo(?:db)?|redis|db|database)[-_]?data)(?:\/|$)/i;
// The same by where it starts: MongoDB's default `/data/db`, a `data/postgres` bind mount at the top of the project
// (deeper down, `src/data/db` is code), and the variable a server's tools read the folder from.
const DATA_ROOT = /^(?:\/data\/db|(?:\.\/)?data\/(?:postgres(?:ql)?|pg|mysql|mariadb|mongo(?:db)?|redis))(?:\/|$)|^\$(?:\{|env:)?(?:PGDATA|MYSQL_DATADIR)\b/i;
// A command that runs the one it is handed, with the options of its own that take a value.
const RUNNERS = new Map(Object.entries({ sudo: 'ugphCDRTU', doas: 'uC', xargs: 'InPLdEsa', env: 'uCS', timeout: 'sk', time: 'of', nice: 'n', nohup: '', command: '', exec: 'a' }));
// A command that runs another one handed to it as a quoted word: that word is judged as a command of its own.
const LAUNCHERS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'cmd', 'pwsh', 'powershell', 'eval', 'iex', 'invoke-expression', 'ssh',
  'wsl', 'su', 'sudo', 'xargs', 'watch', 'timeout', 'nohup', 'env', 'docker', 'podman', 'kubectl', 'find', 'parallel',
]);
// An interpreter, and the option whose value is code it runs (`-e`, `-c`, `-p`, `-r`, perl's `-ne`, `deno eval`).
const INTERPRETERS = /^(?:node|nodejs|python[\d.]*|py|ruby|perl|php|bun|deno)$/;
const CODE_FLAG = /^(?:-[A-Za-z]*[cepEr]|--eval|--print|eval)$/;
const POSIX_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'wsl', 'ssh']);
const SHELL_HEREDOC = /(?:^|[\s;&|(\/])(?:bash|sh|zsh|dash|ksh|ssh|eval|source)(?=[\s;&|)<]|$)/;
const MAX_DEPTH = 3;
const RULE = 'CLAUDE.md, Data, secrets and the outside world';

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

// The refusals are written once, in Claude Code's words; under Codex the same sentence names that tool's files, and
// a search is sent to `git grep` alone - there is no Grep tool there.
function codexWording(reason) {
  return reason
    .split('.claude/hooks/backend-guard.mjs')
    .join('.codex/hooks/backend-guard.mjs')
    .split('CLAUDE.md')
    .join('AGENTS.md')
    .split('search with the Grep tool or `git grep`, which skip ignored files')
    .join('search with `git grep`, which skips ignored files');
}

// A refusal anywhere in the call outranks a question, so the question waits until the whole call was read. Codex
// has no question: there the same kinds are refused, each with what the user can do instead.
let question = '';
const CODEX_QUESTION = {
  data: (label) => `Blocked by .claude/hooks/backend-guard.mjs: this command ${KIND.data} (${label}). ${RULE}: a database is wiped only when the user asked for exactly that. If they did, name the command and the database it points at, and they run it in their own terminal.`,
  reveal: (label) => `Blocked by .claude/hooks/backend-guard.mjs: this command prints secret values (${label}). ${RULE}: a secret is never read or printed. If the user needs the value, they read it in their own terminal.`,
  large: (label) => `Blocked by .claude/hooks/backend-guard.mjs: a search over ${label} - the tree is too large to check for secret files. ${RULE}: name the folders to search, exclude what it must not read, or search the tracked files with \`git grep\`.`,
  remote: (label) => `Blocked by .claude/hooks/backend-guard.mjs: this command reaches another machine (${label}). ${RULE}: nothing the agent runs leaves the machine unasked. If the user asked for exactly this, name the command and the host, and they run it in their own terminal.`,
  history: (label) => `Blocked by .claude/hooks/backend-guard.mjs: this command rewrites the record of which migrations ran (${label}). ${RULE}: a merged migration is never changed. If the user asked for exactly that, name the command, and they run it in their own terminal.`,
};
const QUESTION = CODEX ? CODEX_QUESTION : {
  data: (label) => `backend-guard: this command ${KIND.data} (${label}). ${RULE}: a database is wiped only when you asked for exactly that - approve it if you did, and check which database it points at first.`,
  reveal: (label) => `backend-guard: this command prints secret values (${label}). ${RULE}: a secret is never read or printed - approve it only if you asked for exactly that.`,
  large: (label) => `backend-guard: a search over ${label} - the tree is too large to check for secret files; name the folders or exclude what it must not read. ${RULE}: approve it only if no env file or key sits under it.`,
  remote: (label) => `backend-guard: this command reaches another machine (${label}). ${RULE}: nothing the agent runs leaves the machine unasked - approve it only if you asked for exactly this, and check which host it is first.`,
  history: (label) => `backend-guard: this command rewrites the record of which migrations ran (${label}). ${RULE}: a merged migration is never changed - approve it only if you asked for exactly that, and the migration it touches was never merged or applied anywhere else.`,
};
function ask(label, kind = 'data') {
  question ||= QUESTION[kind](label);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const normalized = (value) => String(value).replace(/\\/g, '/').replace(/\/+$/, '');
// Windows opens `.env.`, `.env ` and `.env::$DATA` as `.env`: the last name also counts without trailing dots and
// spaces and without an NTFS stream suffix (a drive's colon is not one).
function spellings(value) {
  const flat = normalized(value);
  const at = flat.lastIndexOf('/');
  const name = flat.slice(at + 1);
  const plain = (at === -1 && /^[A-Za-z]:/.test(name) ? name.slice(0, 2) + name.slice(2).replace(/:.*$/, '') : name.replace(/:.*$/, '')).replace(/[. ]+$/, '');
  return plain && plain !== name && !/^\.*$/.test(name) ? [flat, flat.slice(0, at + 1) + plain] : [flat];
}
const isSecret = (value) => spellings(value).some((form) => SECRET_PATHS.some((pattern) => pattern.test(form)));
const isFrozenPath = (value) => spellings(value).some((form) => FROZEN_PATHS.some((pattern) => pattern.test(form)));
// The spelling git and the file system agree on, for the frozen check's `git ls-files`.
const plainSpelling = (value) => spellings(value).at(-1);
const commandName = (word) => normalized(word).split('/').pop().toLowerCase().replace(/\.(?:exe|cmd|bat|ps1)$/, '');

// A glob names files too: `.env*` reaches the env file. Wildcards are dropped and one brace group is expanded.
function reaches(value) {
  const brace = /^(.*)\{([^{}]*)\}(.*)$/.exec(value);
  const forms = brace ? brace[2].split(',').map((part) => brace[1] + part + brace[3]) : [value];
  return forms.some((form) => isSecret(form) || isSecret(form.replace(/[*?]+/g, '').replace(/\.+$/, '')));
}

// The same, and the path as it resolves from the call's folder: a project entry such as `config/local\.settings\.json$`
// holds for `cat local.settings.json` run inside `config`.
const reachesFrom = (value, cwd) => reaches(value) || (!WILD.test(value) && /[\w.]/.test(value) && isSecret(absolute(value, cwd)));

// Git Bash spells a drive as /d/...; Node on Windows would read that as a folder named "d".
function absolute(target, cwd) {
  const native = process.platform === 'win32' ? target.replace(/^\/([A-Za-z])\//, '$1:/') : target;
  return path.resolve(cwd, native);
}

// A home folder by its shell spelling, for a wildcard that is listed on disk: `~/.aws/cred*`, `$env:USERPROFILE\...`.
const homeExpanded = (target) => target.replace(/^(?:~|\$HOME|\$\{HOME\}|\$env:(?:USERPROFILE|HOME)|%USERPROFILE%)(?=[\\/]|$)/i, () => os.homedir());

const git = (cwd, args, input) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 });

// The upstream default branch: origin/HEAD, else origin/main, else origin/master; '' when there is none.
function upstreamRef(dir) {
  for (const ref of ['refs/remotes/origin/HEAD', 'refs/remotes/origin/main', 'refs/remotes/origin/master']) {
    try {
      return git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
    } catch {
      // Not there: the next one.
    }
  }
  return '';
}

// Whether a frozen file git tracks at the path, under it or matching its glob is on the upstream default branch:
// a migration committed on the working branch only is still the developer's to fix before the merge. With no
// remote, every tracked one counts - the agent neither commits nor stages, so what git tracks the owner put there.
// Any failure - no repo, a folder that does not exist - reads as "none", which allows the call.
// Git is asked once per repository and call, never per path: the frozen files it tracks and which of them the upstream
// branch holds are listed once, and every path is matched against that list here - a path as itself or as a folder
// above the file, a wildcard as git's pathspec reads one (`*` crosses folders), in any case where the file system
// folds it.
const repoOfFolder = new Map();
const frozenOfRepo = new Map();
function frozenFiles(dir) {
  if (!repoOfFolder.has(dir)) {
    let found = null;
    try {
      // The folder's place in its repository as git spells it: a short 8.3 name or a link in the path cannot confuse it.
      const [root, prefix] = git(dir, ['rev-parse', '--show-toplevel', '--show-prefix']).split('\n');
      found = { root: root.trim(), prefix: prefix.trim() };
    } catch {
      // No repository there: nothing in it is frozen.
    }
    repoOfFolder.set(dir, found);
  }
  const place = repoOfFolder.get(dir);
  if (!place) return null;
  const root = place.root;
  if (!frozenOfRepo.has(root)) {
    let names = [];
    try {
      const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z', '--full-name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 256 * 1024 * 1024 })
        .split('\0')
        .filter((name) => name && isFrozenPath(`/${name}`));
      const ref = tracked.length ? upstreamRef(root) : '';
      if (!ref) names = tracked;
      else {
        const found = git(root, ['cat-file', '--batch-check'], tracked.map((name) => `${ref}:${name}\n`).join('')).split('\n');
        names = tracked.filter((_, index) => found[index] && !found[index].endsWith(' missing'));
      }
    } catch {
      names = [];
    }
    frozenOfRepo.set(root, names.map((name) => (FOLD ? name.toLowerCase() : name)));
  }
  return { prefix: place.prefix, names: frozenOfRepo.get(root) };
}
function frozenAt(target, cwd) {
  const file = absolute(plainSpelling(target), cwd);
  const listed = frozenFiles(path.dirname(file));
  if (!listed || !listed.names.length) return false;
  const name = path.basename(file);
  const relative = (FOLD ? (listed.prefix + name).toLowerCase() : listed.prefix + name).replace(/\/+$/, '');
  if (WILD.test(name)) {
    const matches = globMatcher(relative, FOLD);
    return listed.names.some((tracked) => matches(tracked));
  }
  return listed.names.some((tracked) => tracked === relative || tracked.startsWith(`${relative}/`));
}

// Whether a removed path can reach a frozen file at all, before git is asked (one call per word is slow): it matches
// the list itself, it is a wildcard, or it is a folder that may hold one. A plain file the list does not name never is.
function mayHoldFrozen(target, cwd) {
  if (WILD.test(target)) return true;
  const file = absolute(plainSpelling(target), cwd);
  if (isFrozenPath(file)) return true;
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function secretRefusal(target, how) {
  deny(
    `Blocked by .claude/hooks/backend-guard.mjs: ${target} is a secret file (SECRET_PATHS) and this call would ${how} it. ${RULE}: a secret is never read, printed or written - take the variable names from the example file and the code that reads them; the owner sets the values.`,
  );
}

function secretDeleteRefusal(target) {
  deny(
    `Blocked by .claude/hooks/backend-guard.mjs: ${target} is a secret file (SECRET_PATHS) and this call would delete or move it. ${RULE}: a secret file holds values only the owner has - say what should change, and the owner does it.`,
  );
}

function frozenRefusal(target, how) {
  deny(
    `Blocked by .claude/hooks/backend-guard.mjs: ${target} is a merged migration (FROZEN_PATHS) and this call would ${how} it. ${RULE}: other environments have already applied it - write a new migration instead. If it was never applied anywhere, the owner changes it.`,
  );
}

function checkRead(target) {
  if (typeof target === 'string' && target && isSecret(target)) secretRefusal(target, 'read');
}

function checkWrite(target, cwd) {
  if (typeof target !== 'string' || !target) return;
  // The absolute path too: a project entry such as `config/local\.settings\.json$` holds for a relative path given
  // from inside `config`.
  if (isSecret(target) || isSecret(absolute(target, cwd))) secretRefusal(target, 'write');
  // The path test first: it is free, and git is then asked about migration files only.
  if (isFrozenPath(absolute(target, cwd)) && frozenAt(target, cwd)) frozenRefusal(target, 'edit');
}

// SQL a database client reads on stdin - a heredoc body, an echo or printf piped into it - is its statement too.
function checkStdinSql(client, sql) {
  // A statement the shell single-quoted whole carries no SQL literal of its own; anywhere else '...' is one.
  const statement = /^\s*'([^']*)'\s*$/.exec(sql)?.[1] ?? sql.replace(/'[^']*'/g, "''");
  if (SQL_CLIENT.test(client) && SQL_WIPE.test(statement)) ask("SQL on a database client's stdin");
}

// A heredoc body is data unless a shell reads it: `cat > notes.txt <<EOF` may quote any command. A `<<` inside quotes
// on its line (`echo '<<END'`) opens nothing.
function withoutHeredocs(command) {
  const lines = command.split(/\r?\n/);
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    kept.push(line);
    const open = line.replace(/<<</g, '   ').replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (quoted) => ' '.repeat(quoted.length)).indexOf('<<');
    const here = open === -1 ? null : /^<<-?\s*(['"]?)([A-Za-z_][\w.-]*)\1/.exec(line.slice(open));
    if (!here || SHELL_HEREDOC.test(line)) continue;
    const end = lines.findIndex((candidate, at) => at > index && candidate.trim() === here[2]);
    if (end === -1) continue;
    checkStdinSql(line, lines.slice(index + 1, end).join(' '));
    index = end;
  }
  return kept.join('\n');
}

// PowerShell has no heredoc; its here-string is `@'` or `@"` ending a line outside a quote and a comment, closed by
// `'@` or `"@` at the start of a later line (no blank may come before it). Each becomes one single-quoted word, so an
// apostrophe or a quote inside no longer unbalances the rest of the command; what it is piped into is judged below.
// A `@"` body's `$(...)` runs, so it is checked as a command first. An opener with no closer changes nothing.
// A block comment `<# ... #>` is blank space to PowerShell, so it leaves one blank here: what follows it is judged. It
// opens only where a token may start (after a blank, an operator, a comma, a `-Name:`, a closing quote or another
// comment; `a<#b#>` is one word), and `<#>` closes nothing.
function hereStringsQuoted(command, cwd, depth) {
  let out = '';
  let quote = '';
  let comment = '';
  let opened = 0;
  // Where the last block comment closed: another may open right after it (`<# a #><# b #>`).
  let closed = -2;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (comment === '<#') {
      if (ch === '>' && command[index - 1] === '#' && index > opened + 2) {
        comment = '';
        closed = index;
        out += ' ';
      }
      continue;
    }
    if (comment) {
      out += ch;
      if (ch === '\n') comment = '';
      continue;
    }
    if (quote) {
      out += ch;
      if (quote === '"' && ch === '`' && index + 1 < command.length) {
        index += 1;
        out += command[index];
      } else if (ch === quote) quote = '';
      continue;
    }
    const mark = command[index + 1];
    if (ch === '@' && (mark === "'" || mark === '"')) {
      const lineEnd = command.indexOf('\n', index + 2);
      const close = lineEnd === -1 ? -1 : command.indexOf(`\n${mark}@`, lineEnd);
      if (close !== -1 && /^[ \t]*\r?$/.test(command.slice(index + 2, lineEnd))) {
        const body = command.slice(lineEnd + 1, close).replace(/\r$/, '');
        if (mark === '"') {
          for (const inner of withoutSubstitutions(body, 'PowerShell').bodies) {
            if (depth < MAX_DEPTH) checkCommand(inner, 'PowerShell', cwd, depth + 1);
            else tooDeep();
          }
        }
        // Its line breaks are kept around the body, so even a one-line body is a quoted word with a break in it: text,
        // never the head of a command.
        out += `'\n${body.replace(/'/g, "''")}\n'`;
        index = close + 2;
        continue;
      }
    }
    if (ch === '#' && (index === 0 || /[\s;|&(){}]/.test(command[index - 1]))) comment = '#';
    else if (ch === '<' && mark === '#' && (index === 0 || index === closed + 1 || /[\s;|&(){},'"]/.test(command[index - 1]) || /(?:^|[\s,])-[A-Za-z][\w-]*:$/.test(command.slice(Math.max(0, index - 64), index)))) {
      comment = '<#';
      opened = index;
      continue;
    } else if (ch === "'" || ch === '"') quote = ch;
    out += ch;
  }
  return out;
}

// Under Codex a body nested deeper than this hook reads is refused, not passed unread.
function tooDeep() {
  if (CODEX) deny('Blocked by .claude/hooks/backend-guard.mjs: this command nests one shell in another deeper than this guard reads, so it cannot be judged. Run the inner command itself.');
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
// path separator and stays. A redirection is not an argument: the descriptor before `>` (`2>&1`, `*>`) is dropped,
// and the file after `>` or `<` is marked (`redirected`), so that no rule reads it as a verb or a target.
function segmentsOf(command, shell) {
  const escape = shell === 'PowerShell' ? '`' : '\\';
  const segments = [];
  let words = [];
  let redirected = new Set();
  let word = '';
  let started = false;
  let quote = '';
  let redirect = false;
  const endWord = () => {
    if (started) {
      if (redirect) redirected.add(words.length);
      words.push(word);
      redirect = false;
    }
    word = '';
    started = false;
  };
  // What stood between two segments; a single `|` makes the second one read the first one's output (`piped`), and so
  // does `|&` (Bash's pipe of both streams, PowerShell's pipe into a script block `| & { ... }`).
  let joint = '';
  // Whether the segment reads a `<` redirect or a heredoc: then nothing is typed into what it runs.
  let stdin = false;
  const endSegment = (by = '') => {
    endWord();
    if (words.length) {
      words.piped = /^\)?\|&?$/.test(joint.replace(/\s/g, ''));
      words.redirected = redirected;
      words.stdin = stdin;
      segments.push(words);
      joint = '';
    }
    joint += by;
    words = [];
    redirected = new Set();
    redirect = false;
    stdin = false;
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
    } else if (ch === '\n' || ';&|()'.includes(ch)) endSegment(ch);
    // In PowerShell a `<` inside a word is part of it (`a<#b#>` is one word), never a redirect.
    else if ((ch === '<' && !(shell === 'PowerShell' && started)) || ch === '>') {
      if (ch === '>' && /^(?:\d+|\*)$/.test(word)) {
        word = '';
        started = false;
      }
      endWord();
      redirect = true;
      if (ch === '<') stdin = true;
    } else if (/\s/.test(ch)) endWord();
    else {
      word += ch;
      started = true;
    }
  }
  endSegment();
  return segments;
}

// Every form a glob's brace groups stand for: `{src,test}/*.{json,yaml}` is four globs.
function braceForms(glob) {
  const brace = /^(.*?)\{([^{}]*)\}(.*)$/.exec(glob);
  return brace ? brace[2].split(',').flatMap((part) => braceForms(brace[1] + part + brace[3])) : [glob];
}

// A glob as a list of tokens - `*`, `?`, a `[...]` class (`!` or `^` negates it; one with no closing `]` is a plain
// `[`), a literal - matched by a table, never a regex: a regex built from a glob can backtrack past the hook's timeout
// or throw, and either lets the call through. `paths`: `*` and `?` stop at `/`, and `**/` / `**` cross it.
function globMatcher(glob, fold, paths = false) {
  const tokens = [];
  for (let index = 0; index < glob.length; index += 1) {
    const ch = glob[index];
    if (paths && glob.startsWith('**/', index)) {
      tokens.push({ kind: 'dirs' });
      index += 2;
    } else if (ch === '*') {
      const cross = !paths || glob[index + 1] === '*';
      while (glob[index + 1] === '*') index += 1;
      if (tokens.at(-1)?.kind !== 'star' || tokens.at(-1).cross !== cross) tokens.push({ kind: 'star', cross });
    } else if (ch === '?') tokens.push({ kind: 'one' });
    else if (ch === '[' && glob.indexOf(']', index + 2) !== -1) {
      const close = glob.indexOf(']', index + 2);
      let body = glob.slice(index + 1, close);
      const negate = /^[!^]/.test(body);
      if (negate) body = body.slice(1);
      const ranges = [];
      for (let at = 0; at < body.length; at += 1) {
        if (body[at + 1] === '-' && at + 2 < body.length) {
          ranges.push([body[at], body[at + 2]]);
          at += 2;
        } else ranges.push([body[at], body[at]]);
      }
      tokens.push({ kind: 'class', negate, ranges });
      index = close;
    } else tokens.push({ kind: 'char', ch });
  }
  const same = (a, b) => (fold ? a.toLowerCase() === b.toLowerCase() : a === b);
  const inClass = (token, ch) => {
    const hit = token.ranges.some(([low, high]) => (fold ? [ch.toLowerCase(), ch.toUpperCase()] : [ch]).some((c) => c >= low && c <= high));
    return token.negate ? !hit : hit;
  };
  return (text) => {
    // reach[j]: the tokens so far can match the first j characters.
    let reach = new Array(text.length + 1).fill(false);
    reach[0] = true;
    for (const token of tokens) {
      const next = new Array(text.length + 1).fill(false);
      let any = false;
      for (let j = 0; j <= text.length; j += 1) {
        const ch = text[j - 1];
        if (token.kind === 'star') {
          next[j] = reach[j] || (j > 0 && next[j - 1] && (token.cross || ch !== '/'));
        } else if (token.kind === 'dirs') {
          // `any`: the tokens so far matched some shorter prefix, so this `/` can close a run of folders after it.
          next[j] = reach[j] || (j > 0 && ch === '/' && any);
          any ||= reach[j];
        } else if (j > 0 && reach[j - 1]) {
          next[j] = token.kind === 'one' ? !paths || ch !== '/' : token.kind === 'class' ? (!paths || ch !== '/') && inClass(token, ch) : same(token.ch, ch);
        }
      }
      reach = next;
    }
    return reach[text.length];
  };
}

// A glob as grep's --include / --exclude reads it, against a base name; brace groups are expanded. PowerShell
// and findstr match a name whatever its case ('i').
function globTest(glob, flags = '') {
  const matchers = braceForms(glob).map((form) => globMatcher(form, flags.includes('i')));
  return (name) => matchers.some((matches) => matches(name));
}

// A glob as ripgrep and the Grep tool read it: one without a slash against the file name, one with a slash against
// the path under the search folder (`**/` any folders, `*` within one). Where only a name is known (the walk), the
// path form answers `unknown`.
function rgGlobTest(glob, unknown) {
  if (!glob.includes('/')) return globTest(glob);
  const matchers = braceForms(glob).map((form) => globMatcher(form.replace(/^\//, ''), false, true));
  return (name, relative) => (relative === undefined ? unknown : matchers.some((matches) => matches(relative)));
}

// A ripgrep file type as the extensions it takes, for the types a secret file can carry.
const RG_TYPES = {
  yaml: '*.{yaml,yml}',
  tf: '*.{tf,tfvars,tf.json}',
  json: '*.{json,jsonl}',
  config: '*.{cfg,conf,config,ini}',
  sh: '{*.sh,*.bash,*.zsh,*.env,.env}',
  java: '*.{java,jsp,jspx,properties}',
  gradle: '{*.gradle,*.gradle.kts,gradle.properties}',
};
const typeGlob = (type) => RG_TYPES[type] ?? `*.${type}`;
// The Grep tool's `glob` is a list: split at spaces, and at commas outside a brace group.
const grepGlobs = (glob) => glob.split(/\s+/).flatMap((part) => (/[{}]/.test(part) ? [part] : part.split(','))).filter(Boolean);
// A keystore is binary: a search prints "Binary file matches" for it, never its bytes - unless told to read it as text.
const BINARY_SECRET = /\.(?:p12|pfx|jks|keystore)$/i;

// The first secret file a search reads under the folder, breadth first, past node_modules and .git; at the entry
// cap, TOO_LARGE - whatever lies beyond it is unknown. The filters: `include` (a name must match one, when there is
// any), `name` (and this one), `exclude`, `excludeDir`, and `depth`, the folder levels below the first it reads.
const noFilters = () => ({ include: [], exclude: [], excludeDir: [], name: null, depth: Infinity, binary: false });
function secretUnder(folder, filters) {
  const queue = [[folder, 0]];
  let seen = 0;
  for (let at = 0; at < queue.length; at += 1) {
    const [dir, level] = queue[at];
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if ((seen += 1) > WALK_CAP) return TOO_LARGE;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (level < filters.depth && !WALK_SKIP.has(entry.name) && !filters.excludeDir.some((test) => test(entry.name))) queue.push([full, level + 1]);
      } else if (
        isSecret(full) &&
        (!filters.include.length || filters.include.some((test) => test(entry.name))) &&
        (!filters.name || filters.name(entry.name)) &&
        !filters.exclude.some((test) => test(entry.name))
      ) {
        return full;
      }
    }
  }
  return '';
}

// The Grep tool and `git grep` skip what git ignores, but not a secret file git tracks (or, with --untracked, one it
// does not ignore): the first such file under the folder that the filters let through. A folder git ignores itself,
// which the Grep tool still reads when it is named as the path, or one outside a repository, is walked instead -
// `walkIgnored` false for `git grep`, which never reads an untracked file. A worktree's root is never "ignored":
// the repo it sits in may ignore its folder, but the worktree is a repo of its own.
function listedSecret(folder, filters, args = ['--cached', '--others', '--exclude-standard'], walkIgnored = true) {
  let names;
  if (walkIgnored) {
    try {
      if (git(folder, ['rev-parse', '--show-prefix']).trim()) {
        git(path.dirname(folder), ['check-ignore', '-q', '--', path.basename(folder)]);
        return secretUnder(folder, filters);
      }
    } catch {
      // Not ignored, a repository's root, or no repository: ls-files below tells which.
    }
  }
  try {
    names = execFileSync('git', ['-C', folder, 'ls-files', '-z', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 256 * 1024 * 1024,
    }).split('\0');
  } catch {
    return secretUnder(folder, filters);
  }
  for (const name of names) {
    const base = name.slice(name.lastIndexOf('/') + 1);
    // The secret lists read the whole path: a project entry such as `config/local\.settings\.json$` still holds
    // when the search starts inside `config`, and so does the `templates/` exemption.
    if (
      name &&
      isSecret(path.join(folder, name)) &&
      (filters.binary || !BINARY_SECRET.test(name)) &&
      (!filters.include.length || filters.include.some((test) => test(base, name))) &&
      !filters.exclude.some((test) => test(base, name))
    ) {
      return path.join(folder, name);
    }
  }
  return '';
}

// Only a search that prints matching lines puts a secret's value in the transcript; a list of file names does not.
function checkGrepTool(input, cwd) {
  if (input.output_mode !== 'content') return;
  const folder = absolute(typeof input.path === 'string' && input.path ? input.path : '.', cwd);
  try {
    if (!statSync(folder).isDirectory()) return;
  } catch {
    return;
  }
  const filters = noFilters();
  for (const glob of typeof input.glob === 'string' ? grepGlobs(input.glob) : []) {
    const excluded = glob.startsWith('!');
    (excluded ? filters.exclude : filters.include).push(rgGlobTest(glob.replace(/^!/, ''), !excluded));
  }
  if (typeof input.type === 'string' && input.type) filters.include.push(globTest(typeGlob(input.type)));
  const secret = listedSecret(folder, filters);
  if (secret === TOO_LARGE) ask(normalized(folder), 'large');
  else if (secret) {
    deny(
      `Blocked by .claude/hooks/backend-guard.mjs: this Grep prints the matching lines of every file it reads under ${normalized(folder)}, and ${normalized(path.relative(cwd, secret))} there is a secret file git does not ignore (SECRET_PATHS). ${RULE}: leave it out with a glob, a type or a narrower path, or ask for file names only (output_mode files_with_matches).`,
    );
  }
}

// `git grep` prints the matching lines of the files git tracks under its pathspecs; -l, -L, -c and -q print none.
const GIT_GREP_NAMES_ONLY = /^(?:-[A-Za-z]*[lLcq][A-Za-z]*|--(?:files-with-matches|name-only|files-without-match|count|quiet))$/;
const GIT_GREP_VALUE = /^(?:-[ABCmef]|--(?:max-depth|threads|max-count|after-context|before-context|context|regexp|file))$/;
function checkGitGrep(words, names, cwd) {
  const at = commandAt(words, names);
  let dir = cwd;
  let index = at + 1;
  for (; index < words.length && words[index].startsWith('-'); index += 1) {
    if (/^-[Cc]$/.test(words[index])) {
      if (words[index] === '-C') dir = absolute(words[index + 1] ?? '.', dir);
      index += 1;
    }
  }
  if (words[index] !== 'grep') return;
  const rest = words.slice(index + 1);
  if (rest.some((word) => GIT_GREP_NAMES_ONLY.test(word))) return;
  const dash = rest.indexOf('--');
  let specs = [];
  if (dash !== -1) specs = rest.slice(dash + 1);
  else {
    let patternGiven = false;
    for (let position = 0; position < rest.length; position += 1) {
      if (GIT_GREP_VALUE.test(rest[position])) {
        if (/^(?:-[ef]|--regexp|--file)$/.test(rest[position])) patternGiven = true;
        position += 1;
      } else if (!rest[position].startsWith('-')) specs.push(rest[position]);
    }
    if (!patternGiven) specs = specs.slice(1);
  }
  const noIndex = rest.includes('--no-index');
  const args = rest.includes('--untracked') ? ['--cached', '--others', '--exclude-standard'] : ['--cached'];
  const filters = { ...noFilters(), binary: rest.some((word) => /^(?:-[A-Za-z]*a[A-Za-z]*|--text)$/.test(word)) };
  const secret = noIndex
    ? (specs.length ? specs : ['.']).map((spec) => secretUnder(absolute(spec, dir), noFilters())).find(Boolean)
    : listedSecret(dir, filters, [...args, '--', ...specs], false);
  if (secret === TOO_LARGE) ask(normalized(dir), 'large');
  else if (secret) {
    deny(
      `Blocked by .claude/hooks/backend-guard.mjs: this git grep prints the matching lines of the files it reads, and ${normalized(path.relative(cwd, secret))} is a secret file among them (SECRET_PATHS). ${RULE}: narrow the pathspec (\`-- '*.java'\`, or \`':!<that file>'\`), or list file names only (-l).`,
    );
  }
}

// The word a segment runs: past its leading assignments and past a runner with its own options (`sudo -u app`,
// `xargs -0`, `timeout 5`).
function commandAt(words, names) {
  let at = 0;
  for (;;) {
    while (at < words.length && /^[A-Za-z_]\w*=/.test(words[at])) at += 1;
    const takes = RUNNERS.get(names[at]);
    if (takes === undefined) return at;
    const runner = names[at];
    for (at += 1; at < words.length; at += 1) {
      if (/^-[A-Za-z]$/.test(words[at]) && takes.includes(words[at][1])) at += 1;
      else if (!words[at].startsWith('-') && !(runner === 'timeout' && /^\d/.test(words[at]))) break;
    }
  }
}

const walksOf = (folders, filters) => (folders.length ? folders : ['.']).map((folder) => ({ folder, filters }));
// `app/*.py` is the folder app and the name *.py; null when the folder is a wildcard itself, which is not followed.
function folderAndName(target) {
  const flat = normalized(target);
  const at = flat.lastIndexOf('/');
  const folder = at === -1 ? '.' : flat.slice(0, at).replace(/^(?:[A-Za-z]:)?$/, '$&/');
  return WILD.test(folder) ? null : { folder, name: flat.slice(at + 1), flat };
}

// `grep -r` does not read the ignore file - unless an --exclude, an --exclude-dir or an --include keeps a file out.
function grepWalks(words, reader) {
  const filters = noFilters();
  const plain = [];
  let patternGiven = false;
  for (let index = reader + 1; index < words.length; index += 1) {
    const word = words[index];
    const filter = GREP_FILTER.exec(word);
    if (filter) {
      const value = filter[2] ?? words[(index += 1)] ?? '';
      filters[{ include: 'include', exclude: 'exclude', 'exclude-dir': 'excludeDir' }[filter[1].toLowerCase()]].push(globTest(value));
    } else if (GREP_VALUE.test(word)) {
      if (/^(?:-[A-Za-z]*[ef]|--regexp|--file)$/.test(word)) patternGiven = true;
      index += 1;
    } else if (/^(?:--regexp|--file)=/.test(word)) patternGiven = true;
    else if (!word.startsWith('-')) plain.push(word);
  }
  return walksOf(patternGiven ? plain : plain.slice(1), filters);
}

// ripgrep honours the ignore files and skips hidden files until -u, --no-ignore or --hidden says otherwise; then
// it is judged as a search of every file. A -g glob narrows it, and so does a file type, read as its extension:
// `-t json` still takes a secrets.json.
function ripgrepWalks(words, reader) {
  if (!words.some((word, index) => index > reader && RG_UNRESTRICTED.test(word))) return [];
  const filters = noFilters();
  const plain = [];
  let patternGiven = false;
  for (let index = reader + 1; index < words.length; index += 1) {
    const joined = /^(--[\w-]+)=(.*)$/.exec(words[index]);
    const flag = joined ? joined[1] : words[index];
    const value = () => (joined ? joined[2] : (words[(index += 1)] ?? ''));
    if (/^(?:-[A-Za-z]*g|--i?glob)$/.test(flag)) {
      const glob = value();
      const test = globTest(glob.replace(/^!/, '').replace(/\/(?:\*\*)?$/, ''));
      for (const list of glob.startsWith('!') ? [filters.exclude, filters.excludeDir] : [filters.include]) list.push(test);
    } else if (/^(?:-[A-Za-z]*t|--type)$/.test(flag)) {
      filters.include.push(globTest(typeGlob(value())));
    } else if (/^(?:-[A-Za-z]*[ef]|--regexp|--file)$/.test(flag)) {
      value();
      patternGiven = true;
    } else if (RG_VALUE.test(flag)) value();
    else if (!flag.startsWith('-')) plain.push(flag);
  }
  return walksOf(patternGiven ? plain : plain.slice(1), filters);
}

// findstr reads the files a wildcard names, and with /s the ones of that name in every folder below.
function findstrWalks(words, reader) {
  const plain = [];
  let patternGiven = false;
  let recursive = false;
  for (const word of words.slice(reader + 1)) {
    if (/^\/[belrsixvnmop]+$/i.test(word)) recursive ||= /s/i.test(word);
    else if (/^\/[cg]:/i.test(word)) patternGiven = true;
    else if (!/^\/[dfa]:/i.test(word)) plain.push(word);
  }
  return (patternGiven ? plain : plain.slice(1)).flatMap((target) => {
    const at = folderAndName(target);
    if (!at || !(recursive || WILD.test(at.name))) return [];
    return [{ folder: at.folder, filters: { ...noFilters(), name: globTest(at.name, 'i'), depth: recursive ? Infinity : 0 } }];
  });
}

// What a PowerShell listing hands on (`lister`) or what Select-String reads by itself: a wildcard names the
// files of its folder; a listing without -Recurse stops at the folder's own files.
function powershellWalks(words, from, lister) {
  const filters = noFilters();
  const targets = [];
  let pattern = lister;
  let depth = 0;
  for (let index = from + 1; index < words.length; index += 1) {
    const word = words[index];
    // A parameter's value is one word, or a comma list that may run over several: `-Include *.py, *.toml`.
    const list = () => {
      const values = [];
      do values.push(...(words[(index += 1)] ?? '').split(',').filter(Boolean));
      while ((words[index] ?? '').endsWith(','));
      return values;
    };
    if (PATH_PARAM.test(word)) targets.push(...list());
    else if (/^-(?:Include|Filter)$/i.test(word)) filters.include.push(...list().map((glob) => globTest(glob, 'i')));
    else if (/^-Exclude$/i.test(word)) filters.exclude.push(...list().map((glob) => globTest(glob, 'i')));
    else if (/^-Pat(?!h)\w*$/i.test(word)) {
      pattern = true;
      index += 1;
    } else if (/^-(?:Context|Encoding|Culture|Attributes)$/i.test(word)) index += 1;
    else if (/^-Depth$/i.test(word)) depth = Number(words[(index += 1)]) || 0;
    // Names, or folders only: nothing is read.
    else if (lister && /^-(?:Name|Directory|ad)$/i.test(word)) return [];
    else if (lister && PS_RECURSE.test(word)) depth = Infinity;
    else if (word.startsWith('-')) continue;
    else if (!pattern) pattern = true;
    else targets.push(...word.split(',').filter(Boolean));
  }
  return (targets.length || !lister ? targets : ['.']).flatMap((target) => {
    const at = folderAndName(target);
    if (!at) return [];
    if (WILD.test(at.name)) return [{ folder: at.folder, filters: { ...filters, name: globTest(at.name, 'i'), depth } }];
    return lister ? [{ folder: at.flat, filters: { ...filters, depth } }] : [];
  });
}

// The files a segment is handed by the one piping into it, when it reads or removes each of them: a PowerShell listing
// or item (`gi .env | gc`, `gci | Remove-Item`; no operand is the folder itself) into a cmdlet that takes them, and
// under xargs the names `echo` or `printf` prints or the files `ls` lists (`echo .env | xargs cat`). `psTakes` names
// the cmdlets that read or remove what they are piped, `xargsTakes` the commands xargs hands the names to.
const PS_FEEDERS = new Set([...PS_LISTERS, 'get-item', 'gi', 'resolve-path', 'rvpa']);
const PS_FED_READERS = new Set(['get-content', 'gc', 'type', 'cat', 'format-hex', 'copy-item', 'cpi', 'import-csv', 'compress-archive']);
const PS_FED_REMOVERS = new Set(['remove-item', 'ri', 'del', 'erase', 'rm', 'rmdir', 'rd', 'move-item', 'mi', 'mv', 'move', 'rename-item', 'rni', 'clear-content', 'clc']);
function fedWalks(words, names, at, feed, psTakes, xargsTakes, shell) {
  if (!feed) return [];
  const feedNames = feed.map(commandName);
  const feedAt = commandAt(feed, feedNames);
  const xargs = names.slice(0, at).includes('xargs');
  // Only PowerShell pipes objects: under Bash `ls | cat` prints the names.
  if (shell === 'PowerShell' && PS_FEEDERS.has(feedNames[feedAt]) && psTakes.has(names[at]) && !xargs) return powershellWalks(feed, feedAt, true);
  if (!xargs || !xargsTakes.has(names[at])) return [];
  const operands = feed.slice(feedAt + 1).filter((word) => !word.startsWith('-'));
  // A printed name is that one path: a folder named so hands on no file of its own.
  if (/^(?:echo|printf|write-output)$/.test(feedNames[feedAt])) return operands.map((folder) => ({ folder, filters: { ...noFilters(), name: () => false } }));
  if (feedNames[feedAt] !== 'ls') return [];
  const flags = feed.slice(feedAt + 1).filter((word) => /^-[A-Za-z]+$/.test(word)).join('');
  const filters = { ...noFilters(), depth: /R/.test(flags) ? Infinity : 0, exclude: /[aA]/.test(flags) ? [] : [(name) => name.startsWith('.')] };
  return (operands.length ? operands : ['.']).flatMap((target) => {
    const spot = folderAndName(target);
    if (spot && WILD.test(spot.name)) return [{ folder: spot.folder, filters: { ...filters, name: globTest(spot.name) } }];
    return [{ folder: target, filters }];
  });
}

// A copy or an archive that takes a whole folder takes the secret files in it: `tar -czf b.tgz .`, `zip -r b.zip config`,
// `Compress-Archive -Path config ...`, `Copy-Item -Recurse config x`, `cp -r . /tmp/bk`, `robocopy . x /E`. Each folder it
// is handed is walked, past what its own exclusions leave out (`--exclude`, zip's `-x`, robocopy's `/XF`); the archive
// file and the destination are not sources.
function checkFolderCopy(words, names, reader, destination, cwd, shell) {
  const name = names[reader];
  if (!/^(?:cp|copy|copy-item|cpi|rsync|zip|tar|7z|7za|compress-archive|robocopy|xcopy)$/.test(name)) return;
  const rest = words.slice(reader + 1);
  const recursive = rest.some((word) => /^(?:-[A-Za-z]*[rRa][A-Za-z]*|--recursive|--archive|-Recurse|\/[se])$/i.test(word));
  const tarCreates = name === 'tar' && rest.some((word) => /^-?[A-Za-z]*c[A-Za-z]*$/.test(word) || word === '--create');
  const whole = tarCreates || name === 'compress-archive' || name === 'robocopy' || (/^(?:7z|7za)$/.test(name) && rest[0] === 'a') || recursive;
  if (!whole) return;
  // A switch: `-x`, and for the Windows copiers `/E` - elsewhere a word opening with `/` is an absolute path.
  const isSwitch = (word) => word.startsWith('-') || (/^(?:robocopy|xcopy)$/.test(name) && /^\/[A-Za-z]+(?::.*)?$/.test(word));
  const skip = new Set([destination]);
  const exclude = [];
  for (let index = reader + 1; index < words.length; index += 1) {
    const word = words[index];
    const joined = /^--exclude=(.+)$/.exec(word);
    if (joined) exclude.push(globTest(joined[1]));
    else if (/^(?:--exclude|\/XF|\/XD)$/i.test(word) || (name === 'zip' && word === '-x')) {
      for (index += 1; index < words.length && !isSwitch(words[index]); index += 1) {
        exclude.push(globTest(words[index].replace(/^.*[\\/]/, '')));
        skip.add(index);
      }
      index -= 1;
    } else if (/^(?:-f|--file|-DestinationPath)$/i.test(word) || (tarCreates && /^-?[A-Za-z]*f$/.test(word) && !word.startsWith('--'))) skip.add(index + 1);
  }
  // zip's and 7z's first plain word is the archive they write.
  const plain = words.flatMap((word, index) => (index > reader && !isSwitch(word) && !skip.has(index) && !(/^7za?$/.test(name) && word === 'a') ? [index] : []));
  if (/^(?:zip|7z|7za)$/.test(name)) plain.shift();
  // robocopy names its source, its destination, then file names.
  if (name === 'robocopy') plain.splice(1);
  // PowerShell hands a comma list over as several sources: `Compress-Archive -Path app,. x.zip`.
  for (const source of plain.flatMap((index) => (shell === 'PowerShell' ? words[index].split(',').filter(Boolean) : [words[index]]))) {
    const folder = absolute(homeExpanded(source), cwd);
    try {
      if (!statSync(folder).isDirectory()) continue;
    } catch {
      continue;
    }
    const depth = name === 'robocopy' && !rest.some((word) => /^\/[se]$/i.test(word)) ? 0 : Infinity;
    const secret = secretUnder(folder, { ...noFilters(), exclude, depth });
    if (secret === TOO_LARGE) ask(normalized(source), 'large');
    else if (secret) secretRefusal(`${source} (${normalized(path.relative(cwd, secret))})`, 'print or copy');
  }
}

// A wildcard the shell expands before the command runs reaches the secret files it names on disk: `cat .e*`,
// `gc config/*`. Its folder is listed once; under Bash a wildcard opening the name does not take a dot file. `keep`:
// whether the command's own filters let a name through (`Remove-Item app/* -Exclude .env.local`).
function globSecret(word, cwd, shell, keep = () => true) {
  const spot = folderAndName(homeExpanded(word));
  if (!spot || !WILD.test(spot.name)) return '';
  let entries;
  try {
    entries = readdirSync(absolute(spot.folder, cwd));
  } catch {
    return '';
  }
  const matches = globMatcher(spot.name, shell === 'PowerShell' || FOLD);
  for (const entry of entries.slice(0, WALK_CAP)) {
    if (shell !== 'PowerShell' && entry.startsWith('.') && !spot.name.startsWith('.')) continue;
    const full = path.join(absolute(spot.folder, cwd), entry);
    if (isSecret(full) && matches(entry) && keep(entry)) return full;
  }
  return '';
}

// What a `find` hands to the command it runs or pipes into: the folders it starts from, narrowed by its -name
// tests and -maxdepth. Nothing where it lists folders only, or where a -path or -regex test picks the files -
// the walk cannot follow those.
function findWalks(words, at) {
  const folders = [];
  let index = at + 1;
  while (/^-[HLP]$/.test(words[index] ?? '')) index += 1;
  for (; index < words.length && !/^[-!(]/.test(words[index]); index += 1) folders.push(words[index]);
  const filters = noFilters();
  for (; index < words.length && !FIND_RUNS.test(words[index]); index += 1) {
    const word = words[index];
    const negated = /^(?:!|-not)$/.test(words[index - 1] ?? '');
    const pruned = words[index + 2] === '-prune';
    if (/^-i?name$/.test(word)) {
      const test = globTest(words[(index += 1)] ?? '', word === '-iname' ? 'i' : '');
      (pruned ? filters.excludeDir : negated ? filters.exclude : filters.include).push(test);
    } else if (/^-(?:i?path|i?wholename|i?regex)$/.test(word)) {
      if (!negated && !pruned) return [];
      index += 1;
    } else if (word === '-type' && words[index + 1] === 'd' && !words.includes('-prune')) return [];
    else if (word === '-maxdepth') filters.depth = Number(words[(index += 1)]) - 1;
  }
  return filters.depth >= 0 ? walksOf(folders, filters) : [];
}

// A search that reads a whole folder reads the secret file in it, at any depth: `grep -r`, an unrestricted `rg`,
// `findstr /s`, a wildcard handed to findstr or Select-String, a file listing piped into Select-String (`feed` is
// the segment that pipes into this one), a `find` that hands its files to a reader. Each is walked the way the
// command reads, and refused unless its own filters keep every secret file out.
function checkSearch(words, names, reader, cwd, feed, shell) {
  const walks = [];
  if (GREPS.has(names[reader]) && words.some((word) => RECURSIVE.test(word))) walks.push(...grepWalks(words, reader));
  else if (names[reader] === 'rg') walks.push(...ripgrepWalks(words, reader));
  else if (names[reader] === 'findstr') walks.push(...findstrWalks(words, reader));
  else if (PS_SEARCHERS.has(names[reader])) walks.push(...powershellWalks(words, reader, false));
  const at = commandAt(words, names);
  const feedNames = (feed ?? []).map(commandName);
  const feedAt = commandAt(feed ?? [], feedNames);
  if (names[at] === 'find' && words.some((word, index) => FIND_RUNS.test(word) && READERS.has(names[index + 1]))) walks.push(...findWalks(words, at));
  else if (feedNames[feedAt] === 'find' && READERS.has(names[at]) && names.slice(0, at).includes('xargs')) walks.push(...findWalks(feed, feedAt));
  else if (PS_LISTERS.has(feedNames[feedAt]) && PS_SEARCHERS.has(names[reader])) walks.push(...powershellWalks(feed, feedAt, true));
  else if (reader === at) walks.push(...fedWalks(words, names, at, feed, PS_FED_READERS, READERS, shell));
  for (const { folder, filters } of walks) {
    // A walk that starts at a file reads that file.
    if (reaches(folder)) secretRefusal(folder, 'print or copy');
    const secret = secretUnder(absolute(homeExpanded(folder), cwd), filters);
    if (secret === TOO_LARGE) ask(folder, 'large');
    else if (secret) {
      deny(
        `Blocked by .claude/hooks/backend-guard.mjs: this search reads every file it finds under ${folder}, and ${normalized(path.relative(cwd, secret))} there is a secret file (SECRET_PATHS). ${RULE}: search with the Grep tool or \`git grep\`, which skip ignored files, or name the folders or the file names to search.`,
      );
    }
  }
}

// What a segment deletes or moves: the words after a remover it runs itself - at its head, as `git rm` / `git mv`,
// behind `find -exec` or `cmd /c` - and the folders a deleting `find` starts from. A remover word anywhere else is
// a name: `docker rm -f db`, `npm rm db`.
function removed(words, names) {
  const at = commandAt(words, names);
  const name = names[at] ?? '';
  if (REMOVERS.has(name)) return words.slice(at + 1);
  if (name === 'git') {
    const verb = words.findIndex((word, index) => index > at && !word.startsWith('-') && !/^-[Cc]$/.test(words[index - 1]));
    return /^(?:rm|mv)$/.test(words[verb] ?? '') ? words.slice(verb + 1) : [];
  }
  if (name === 'find') {
    const run = words.findIndex((word, index) => FIND_RUNS.test(word) && REMOVERS.has(names[index + 1]));
    if (run === -1 && !words.includes('-delete')) return [];
    const starts = words.slice(at + 1, words.findIndex((word, index) => index > at && /^[-!(]/.test(word) && !/^-[HLP]$/.test(word)));
    return [...starts, ...(run === -1 ? [] : words.slice(run + 2).filter((word) => !/^(?:\{\}|\+|;)$/.test(word)))];
  }
  if (/^(?:cmd|pwsh|powershell)$/.test(name)) {
    const run = words.findIndex((word, index) => index > at && /^(?:\/[ck]|-c|-command)$/i.test(word));
    return run !== -1 && REMOVERS.has(names[run + 1]) ? words.slice(run + 2) : [];
  }
  return [];
}

// What a mover removes is its sources, never where it moves them to: `mv .env.example .env` takes no secret away.
const MOVERS = new Set(['mv', 'move', 'move-item', 'mi', 'ren', 'rename-item', 'rni']);
function removedSources(words, names) {
  // A filter's value names what is kept or picked, never a path removed by name: `Remove-Item app\* -Exclude .env`.
  const list = removed(words, names).filter((word, index, all) => !/^-(?:Exclude|Include|Filter)$/i.test(all[index - 1] ?? ''));
  const verb = names.findIndex((name, index) => index >= commandAt(words, names) && REMOVERS.has(name));
  if (!MOVERS.has(names[verb] ?? '')) return list;
  const sources = list.filter((word, index) => !/^-(?:Destination|Dest|NewName)$/i.test(list[index - 1] ?? '') && !/^-(?:Destination|Dest|NewName)$/i.test(word));
  const plain = sources.flatMap((word, index) => (word.startsWith('-') ? [] : [index]));
  return list.some((word) => /^-(?:Destination|Dest|NewName)$/i.test(word)) ? sources : sources.filter((_, index) => index !== plain.at(-1));
}

// The words a block or a keyword wraps around a command - `{ rm x; }`, `1 | % { ... }`, `if (...) { ... }`, `then psql`,
// a script block's `process { ... }` - are dropped before a segment is judged, so the command inside is judged as if it
// were typed alone. A brace may be glued to what calls it: `%{ ... }`, `.{ ... }`.
const BLOCK_WORD = /^(?:\{|\}|\.|%|%\{|\.\{|foreach-object|foreach|invoke-command|icm|if|then|else|elif|do|while|until|try|finally|begin|process|end)$/i;
const OPENS = /^(?:%|\.)?\{/;
// A block run once per piped item: the command inside reads no pipe of its own.
const PER_ITEM = /^(?:%|foreach-object|foreach)(?:\{|$)/i;
// A PowerShell script block never reads the pipe as stdin (`1 | & { psql }`); a Bash group does (`x | { xargs rm; }`).
function unwrapped(words, shell) {
  let start = 0;
  let end = words.length;
  while (start < end && BLOCK_WORD.test(words[start])) start += 1;
  while (end > start && words[end - 1] === '}') end -= 1;
  const opened = words.slice(0, start).some((word) => OPENS.test(word)) || /^(?:%|\.)?\{./.test(words[start] ?? '');
  if (start === 0 && end === words.length && !opened) return words;
  const kept = [];
  kept.redirected = new Set();
  for (let index = start; index < end; index += 1) {
    if (words.redirected?.has(index)) kept.redirected.add(kept.length);
    kept.push(words[index]);
  }
  if (/^(?:%|\.)?\{./.test(kept[0] ?? '')) kept[0] = kept[0].replace(OPENS, '');
  // A brace glued to the last word closes the block it opened: `% { gc .env}`.
  if (opened && /[^{]\}$/.test(kept.at(-1) ?? '')) kept[kept.length - 1] = kept.at(-1).slice(0, -1);
  kept.piped = words.piped && !words.slice(0, start + 1).some((word) => PER_ITEM.test(word) || (shell === 'PowerShell' && OPENS.test(word)));
  kept.stdin = words.stdin;
  return kept;
}

// A PowerShell command that runs the script blocks it is handed - ForEach-Object (`-Begin`, `-Process`, `-End`, or two
// or three blocks in a row), Where-Object, Invoke-Command, Measure-Command, Start-Job, a dot-sourced block - has each
// of its top-level blocks judged as a command of its own, fed what the segment is fed; the words around them are one
// more. None of them reads the pipe as its stdin.
const BLOCK_RUNNER = /^(?:%|foreach-object|foreach|\?|where|where-object|invoke-command|icm|measure-command|start-job|sajb|start-threadjob|\.)$/;
const BLOCK_PARAM = /^-(?:B(?:e(?:g(?:i(?:n)?)?)?)?|Pr(?:o(?:c(?:e(?:s(?:s)?)?)?)?)?|En(?:d)?|R(?:e(?:m(?:a(?:i(?:n(?:i(?:n(?:g(?:S(?:c(?:r(?:i(?:p(?:t(?:s)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?|Sc(?:r(?:i(?:p(?:t(?:B(?:l(?:o(?:c(?:k)?)?)?)?)?)?)?)?)?)$/i;
const braces = (word, ch) => word.split(ch).length - 1;
function blockGroups(words) {
  const glued = OPENS.test(words[0] ?? '') && !/^\{/.test(words[0]);
  if (!glued && !BLOCK_RUNNER.test(commandName(words[0] ?? ''))) return null;
  const outer = glued ? [] : [words[0]];
  const groups = [];
  let group = null;
  let depth = 0;
  for (let index = glued ? 0 : 1; index < words.length; index += 1) {
    let word = words[index];
    if (depth === 0) {
      if (!OPENS.test(word)) {
        if (!BLOCK_PARAM.test(word)) outer.push(word);
        continue;
      }
      group = [];
      depth = braces(word, '{') - braces(word, '}');
      word = word.replace(OPENS, '');
    } else depth += braces(word, '{') - braces(word, '}');
    if (depth <= 0) word = word.replace(/\}$/, '');
    if (word) group.push(word);
    if (depth <= 0) {
      groups.push(group);
      group = null;
      depth = 0;
    }
  }
  if (group) groups.push(group);
  if (!groups.length) return null;
  return [outer, ...groups].map((list, index) => {
    list.redirected = new Set();
    list.piped = index === 0 && words.piped;
    list.stdin = index === 0 && words.stdin;
    return list;
  });
}

// PowerShell joins a parameter to its value with a colon (`-Path:.env`, `-InFile:.env`, `-Recurse:$true`) or a colon
// and a blank (`-Path: .env`). In a segment that runs a cmdlet or one of its aliases each such word is read as the
// parameter and its value, so every check sees `-Path .env`; a switch set to `$true` is the switch, one set to
// `$false` is dropped. A one-letter option and msbuild's `-property:` belong to a native tool and stay whole
// (`-p:PublishProfile=x`).
const PS_ALIASES = new Set(['gc', 'cat', 'type', 'gi', 'gci', 'dir', 'ls', 'rm', 'del', 'erase', 'ri', 'rd', 'rmdir', 'mi', 'mv', 'move', 'cpi', 'cp', 'copy', 'rni', 'ren', 'clc', 'sls', 'fhx', 'iwr', 'irm', 'curl', 'wget', 'icm', 'etsn', 'nsn', 'saps', 'start', 'iex', '%']);
// PowerShell needs no blank around a block's braces: `&{process{gc $_}}`, `%{begin{}process{x}}`. A word that opens
// with braces or a block keyword glued to one (`{process{gc`), and a word that ends in closing braces and opens none
// (`$_}}`), is split into its braces, its keywords and the rest; a hash table (`@{a=1}`) and `${env:x}` stay whole.
const GLUED_OPEN = /^(?:[{}]|(?:begin|process|end|%|\.)(?=\{))/i;
function bracesSplit(words, shell) {
  if (shell !== 'PowerShell' || !words.some((word) => GLUED_OPEN.test(word) || /[^{}]\}+$/.test(word))) return words;
  const out = [];
  out.redirected = new Set();
  words.forEach((word, index) => {
    if (words.redirected?.has(index)) out.redirected.add(out.length);
    let rest = word;
    const parts = [];
    for (let head = GLUED_OPEN.exec(rest); head && rest.length > 1; head = GLUED_OPEN.exec(rest)) {
      parts.push(head[0]);
      rest = rest.slice(head[0].length);
    }
    const tail = rest.includes('{') ? null : /^(.*?)(\}+)$/.exec(rest);
    if (tail && tail[1]) parts.push(tail[1], ...tail[2].split(''));
    else if (rest) parts.push(rest);
    out.push(...parts);
  });
  out.piped = words.piped;
  out.stdin = words.stdin;
  return out;
}

const isCmdlet = (name) => /^[a-z]+-[a-z]+$/.test(name) || PS_ALIASES.has(name);
function colonValues(words, shell) {
  if (shell !== 'PowerShell' || !words.some((word) => isCmdlet(commandName(word.replace(OPENS, ''))))) return words;
  const out = [];
  out.redirected = new Set();
  words.forEach((word, index) => {
    if (words.redirected?.has(index)) out.redirected.add(out.length);
    const joined = /^(-[A-Za-z][\w-]+):(.*)$/.exec(word);
    if (!joined || /^-property$/i.test(joined[1])) out.push(word);
    else if (/^\$false$/i.test(joined[2])) return;
    else out.push(...(joined[2] === '' || /^\$true$/i.test(joined[2]) ? [joined[1]] : [joined[1], joined[2]]));
  });
  out.piped = words.piped;
  out.stdin = words.stdin;
  return out;
}

// PowerShell's -ArgumentList by any prefix it accepts, and its alias.
const ARG_LIST = /^-(?:args|a(?:r(?:g(?:u(?:m(?:e(?:n(?:t(?:l(?:i(?:s(?:t)?)?)?)?)?)?)?)?)?)?)?)$/i;
const ENCODED = /^-(?:ec|e(?:n(?:c(?:o(?:d(?:e(?:d(?:c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?)?)?)?)?)?)?)?)$/i;

function checkSegment(segment, shell, cwd, depth, feed) {
  if (shell === 'PowerShell') {
    // Remoting is judged on the segment as typed: unwrapping drops Invoke-Command, and a block holds its own calls.
    if (psRemote(segment)) ask('PowerShell remoting to another computer', 'remote');
    const blocks = blockGroups(segment);
    if (blocks) {
      for (const block of blocks) checkSegment(block, shell, cwd, depth, feed);
      return;
    }
  }
  const words = unwrapped(segment, shell);
  if (words.length === 0) return;
  const names = words.map(commandName);
  // PowerShell reads `a,b` as two arguments; Bash as one name.
  const pieces = (word) => (shell === 'PowerShell' ? word.split(',').filter(Boolean) : [word]);
  const headAt = names.findIndex((name, index) => !/^[A-Za-z_]\w*=/.test(words[index]) && !WRAPPERS.has(name));
  const head = names[headAt] ?? '';
  const text = words.join(' ');
  // The head keeps its spaces (a quoted path to the binary); so does PowerShell's -ArgumentList, the tool's own
  // words, whose comma list (`'apply','-auto-approve'`) is split into them. A shell body is judged below, as a command
  // of its own.
  // Behind Start-Process any prefix of -ArgumentList is it (`-A`); elsewhere `-a` is another tool's flag.
  const argList = names.some((name) => /^(?:start-process|saps|start)$/.test(name)) ? ARG_LIST : /^-(?:ArgumentList|Args)$/i;
  const blank = (word, index) => /\s/.test(word) && (index !== headAt || /[\r\n]/.test(word)) && !argList.test(words[index - 1] ?? '');
  const argument = (word, index) => !words.redirected?.has(index);
  const bareWords = words.flatMap((word, index) => {
    if (!argument(word, index)) return [];
    if (blank(word, index)) return ['_'];
    return argList.test(words[index - 1] ?? '') && word.includes(',') ? word.split(',').filter(Boolean) : [word];
  });
  const bare = bareWords.join(' ');
  const scopes = { bare, sql: text.replace(/'[^']*'/g, "''"), words: bareWords, raw: words.filter(argument) };
  // `sls` is Select-String in PowerShell and the serverless CLI everywhere else.
  const quiet = QUIET.has(head) && !(head === 'sls' && /^(?:deploy|remove)$/i.test(words[headAt + 1] ?? ''));

  if (!quiet) {
    for (const { kind, label, scope, pattern, hint } of FORBIDDEN) {
      if (!pattern.test(scopes[scope])) continue;
      if (kind === 'data' || kind === 'reveal' || kind === 'remote' || kind === 'history') {
        ask(label, kind);
        continue;
      }
      if (kind === 'secret') {
        deny(
          `Blocked by .claude/hooks/backend-guard.mjs: this command prints secret values (${label}). ${RULE}: a secret is never read, printed or written - list what you need with --services, --volumes, --profiles or --images, or read the compose file itself.`,
        );
      }
      if (kind !== 'project' && (DRY_RUN.test(bare) || LOCAL.test(bare) || localTagsOnly(bareWords))) continue;
      deny(
        `Blocked by .claude/hooks/backend-guard.mjs: this command ${KIND[kind]} (${label}). ${RULE}: nothing the agent runs leaves the machine - name the command and what it would do, and the owner runs it.${hint ? ` ${hint}` : ''}`,
      );
    }
  }

  // An interpreter one-liner that names a secret file reads it: `node -e "...readFileSync('.env')"`.
  const interpreter = names.findIndex((name) => INTERPRETERS.test(name));
  if (interpreter !== -1) {
    words.forEach((word, index) => {
      if (index > interpreter && CODE_FLAG.test(words[index - 1] ?? '')) checkCodeLiterals(word);
    });
  }

  const commandIndex = commandAt(words, names);
  const reader = names.findIndex((name, index) => READERS.has(name) || readsByVerb(name, words, index));
  if (reader !== -1) {
    // What stands before the reader belongs to another program (`docker compose --env-file .env exec api cat x`);
    // `find` is the exception, it hands its own words to the reader it runs.
    const from = names.includes('find') ? 0 : reader;
    const plain = words.flatMap((word, index) => (index > reader && !word.startsWith('-') ? [index] : []));
    // A copy lands on its last plain word - unless an option names the target (`cp -t /tmp .env`,
    // `Copy-Item -Destination x .env`), and then every plain word is a source.
    const target = words.findIndex((word, index) => index > reader && /^(?:-t|--target-directory|-Destination|-Dest)$/i.test(word));
    const destination = !COPIERS.has(names[reader]) ? -1 : target !== -1 ? target + 1 : plain.length > 1 ? plain[plain.length - 1] : -1;
    // The wildcards the reader is handed as paths, listed on disk once the walks below have run.
    const wild = [];
    let patternSeen = !SEARCHERS.has(names[reader]);
    words.forEach((word, index) => {
      const before = words[index - 1] ?? '';
      if (index === reader || index < from || index === destination) return;
      // An exclusion is the opposite of a read - a git pathspec's `:!`, `:^` and `:(exclude)` included, and zip's `-x`.
      if (word.startsWith('!') || GIT_EXCLUDE.test(word) || EXCLUDE_WORD.test(word) || EXCLUDE_FLAG.test(before) || (names[reader] === 'zip' && before === '-x')) return;
      const flag = word.startsWith('-');
      const values = flag ? word.split(/[=:]/).slice(1) : [word, ...word.split(/[=,]/)];
      if (!flag && index > reader && (EXPRESSION.test(before) || (!patternSeen && !PATH_PARAM.test(before)))) {
        if (names[reader] === 'yq' && /^(?:e|eval|ea|eval-all)$/.test(word)) return;
        patternSeen = true;
        return;
      }
      for (const value of values) if (value && !value.startsWith('!') && reachesFrom(value, cwd)) secretRefusal(value, 'print or copy');
      if (!flag && index > reader && reader === commandIndex && WILD.test(word) && !VALUE_OPTION.test(before)) wild.push(...pieces(word).filter((piece) => WILD.test(piece)));
    });
    checkSearch(words, names, reader, cwd, feed, shell);
    for (const word of wild) {
      const secret = globSecret(word, cwd, shell);
      if (secret) secretRefusal(`${word} (${normalized(path.relative(cwd, secret))})`, 'print or copy');
    }
    if (reader === commandIndex) checkFolderCopy(words, names, reader, destination, cwd, shell);
  }

  const uploader = names.findIndex((name) => UPLOADERS.has(name));
  if (uploader !== -1) {
    const form = words.findIndex((word) => /^-Form$/i.test(word));
    // A mail's attachments: the list after -Attachments, over several words when one ends in a comma (`a.txt, .env`),
    // and the files piped into it (`Get-Item .env | Send-MailMessage ...`).
    const attached = new Set();
    if (names[uploader] === 'send-mailmessage') {
      words.forEach((word, index) => {
        if (ATTACHMENTS.test(words[index - 1] ?? '') || (attached.has(index - 1) && words[index - 1].endsWith(','))) attached.add(index);
      });
      for (const { folder, filters } of fedWalks(words, names, uploader, feed, new Set(['send-mailmessage']), new Set(), shell)) {
        if (reaches(folder)) secretRefusal(folder, 'upload');
        const secret = secretUnder(absolute(homeExpanded(folder), cwd), filters);
        if (secret === TOO_LARGE) ask(folder, 'large');
        else if (secret) secretRefusal(normalized(path.relative(cwd, secret)), 'upload');
      }
    }
    words.forEach((word, index) => {
      if (index <= uploader) return;
      const pieces = [...word.matchAll(/[@<]([^;,{}\s]+)/g)].map((match) => match[1]);
      const joined = /^--(?:upload-file|post-file|body-file)=(.+)$/i.exec(word);
      if (joined) pieces.push(joined[1]);
      if (UPLOAD_FILE.test(words[index - 1] ?? '') || (form !== -1 && index > form)) pieces.push(word.replace(/^@?\{?(?:[\w-]+=)?/, '').replace(/[})]+$/, ''));
      if (attached.has(index)) pieces.push(...word.split(','));
      for (const piece of pieces) if (piece && (reachesFrom(piece, cwd) || globSecret(piece, cwd, shell))) secretRefusal(piece, 'upload');
    });
  }

  // `git show HEAD:.env` and `git diff -- .env` print the file as surely as `cat` does; `git log` only with a patch.
  if (head === 'git' && (names.some((name) => GIT_PRINTS.has(name)) || (names.includes('log') && words.some((word) => /^(?:-p|-u|--patch)$/.test(word))))) {
    words.forEach((word, index) => {
      const target = word.includes(':') ? word.slice(word.lastIndexOf(':') + 1) : word;
      if (!word.startsWith('-') && !GIT_EXCLUDE.test(word) && !GIT_VALUE.test(words[index - 1] ?? '') && target && isSecret(target)) secretRefusal(target, 'print');
    });
  }

  if (FROZEN_PATHS.length) {
    for (const word of removed(words, names).flatMap(pieces)) {
      if (!word.startsWith('-') && mayHoldFrozen(word, cwd) && frozenAt(word, cwd)) frozenRefusal(word, 'delete or move');
    }
  }
  // A database's own data folder, wherever it is: guard.mjs refuses a recursive delete inside the project only.
  // `git rm --cached` only stops tracking it.
  if (!(head === 'git' && words.includes('--cached'))) {
    for (const word of removed(words, names).flatMap(pieces)) {
      if (!word.startsWith('-') && (DATA_DIR.test(normalized(word)) || DATA_ROOT.test(normalized(word)))) ask('a database data folder', 'data');
    }
    // A secret file deleted or moved away holds values only the owner has: by name or by a wildcard on disk, behind
    // a deleting `find`, or handed over a pipe (`gi .env | Remove-Item`, `echo .env | xargs rm`). A PowerShell
    // remover's -Include, -Filter and -Exclude decide which names its wildcard takes.
    const filterValues = (flag) => words.flatMap((word, index) => (flag.test(words[index - 1] ?? '') ? pieces(word).map((glob) => globTest(glob, 'i')) : []));
    const include = shell === 'PowerShell' ? filterValues(/^-(?:Include|Filter)$/i) : [];
    const exclude = shell === 'PowerShell' ? filterValues(/^-Exclude$/i) : [];
    const keep = (name) => (!include.length || include.some((test) => test(name))) && !exclude.some((test) => test(name));
    for (const word of removedSources(words, names).flatMap(pieces)) {
      if (!word.startsWith('-') && (reachesFrom(word, cwd) || globSecret(word, cwd, shell, keep))) secretDeleteRefusal(word);
    }
    const deletingFind = names[commandIndex] === 'find' && (words.includes('-delete') || words.some((word, index) => FIND_RUNS.test(word) && REMOVERS.has(names[index + 1])));
    const walks = deletingFind ? findWalks(words, commandIndex) : fedWalks(words, names, commandIndex, feed, PS_FED_REMOVERS, REMOVERS, shell);
    for (const { folder, filters } of walks) {
      const secret = reaches(folder) ? folder : secretUnder(absolute(homeExpanded(folder), cwd), filters);
      if (secret === TOO_LARGE) ask(normalized(folder), 'large');
      else if (secret) secretDeleteRefusal(secret === folder ? folder : normalized(path.relative(cwd, secret)));
    }
  }

  if (head === 'git') checkGitGrep(words, names, cwd);

  if (CODEX && !words.piped && !words.stdin) {
    const session = sessionClient(words);
    if (session) {
      deny(
        `Blocked by .claude/hooks/backend-guard.mjs: this opens an interactive database session or console (${session}), and what is typed into a running command reaches no check. ${RULE}: pass the statement with the client's own flag or a file, or name the session and the developer opens it in their own terminal.`,
      );
    }
  }

  // `pwsh -EncodedCommand <base64>` runs the decoded text - also glued (`-ec:<base64>`) and inside Start-Process's
  // argument list. Only pwsh's own option counts: after the pwsh word and before its -File or -Command, which hand
  // every later word to the script (`docker run -e X=1 img pwsh -File t.ps1 -e dev`). Under Codex a value the hook
  // cannot decode (a variable, a subexpression) is refused: it is unread.
  if (names.some((name) => name === 'pwsh' || name === 'powershell')) {
    const spread = bareWords.flatMap((word) => word.split(/\s+/)).flatMap((word) => {
      const glued = /^(-\w+):(.+)$/.exec(word);
      return glued && ENCODED.test(glued[1]) ? [glued[1], glued[2]] : [word];
    });
    const undecodable = () =>
      deny(`Blocked by .claude/hooks/backend-guard.mjs: this command hands PowerShell an encoded command this guard cannot decode, so it cannot be judged. ${RULE}: run the decoded command itself, so that it is judged.`);
    let own = false;
    for (let index = 0; index < spread.length; index += 1) {
      const word = spread[index];
      if (/^(?:pwsh|powershell)$/.test(commandName(word))) own = true;
      else if (own && /^-(?:f|fi|fil|file|c|co|com|comm|comma|comman|command)$/i.test(word)) own = false;
      else if (own && ENCODED.test(word)) {
        const value = spread[index + 1] ?? '';
        if (!/^[A-Za-z0-9+/]{4,}={0,2}$/.test(value)) {
          if (CODEX) undecodable();
        } else if (depth < MAX_DEPTH) checkCommand(Buffer.from(value, 'base64').toString('utf16le'), 'PowerShell', cwd, depth + 1);
        else tooDeep();
        index += 1;
        own = false;
      }
    }
  }

  if (names.some((name) => LAUNCHERS.has(name))) {
    // cmd reads a backslash as a path separator, as PowerShell does; anything else keeps the caller's shell.
    const inner = names.some((name) => name === 'pwsh' || name === 'powershell' || name === 'cmd')
      ? 'PowerShell'
      : names.some((name) => POSIX_SHELLS.has(name))
        ? 'Bash'
        : shell;
    // What follows a searcher or a printer is its pattern or its message, not a command to run.
    const quietAt = names.findIndex((name) => SEARCHERS.has(name) || name === 'echo' || name === 'printf');
    words.forEach((word, index) => {
      if (!/\s/.test(word) || (quietAt !== -1 && index >= quietAt)) return;
      if (depth < MAX_DEPTH) checkCommand(word, inner, cwd, depth + 1);
      else tooDeep();
    });
  }
}

// PowerShell remoting runs on the computer it names. Every call in the segment is read, inside a block too
// (`% { icm $_ { ... } }`, `Measure-Command { Enter-PSSession x }`), each by its own words past the blocks it is handed:
//   - any cmdlet's -ComputerName (from -Comp, and its aliases -Cn, -Server, -__Server) and -CimSession;
//   - on Invoke-Command, Enter-PSSession and New-PSSession also -HostName (from -Ho), -ConnectionUri (-URI, -CU), and
//     the first plain word that is no option's value, before or after the script block - as on Restart-Computer and
//     Stop-Computer, which with the three take -IPAddress too (elsewhere it is a network setting's own address);
//   - a session handed over (-Session on those three, -SSHConnection, -ToSession, -FromSession): its computer is not
//     in the text.
// A host list may run over several words (`-ComputerName a, b`). A network probe's -ComputerName is not remoting
// (`Test-Connection`, the ping equivalent), and a host the hook cannot tell is this machine (`$h`, `$_`) is another.
const PS_REMOTING = /^(?:invoke-command|icm|enter-pssession|etsn|new-pssession|nsn)$/;
const PS_POSITIONAL_HOST = /^(?:invoke-command|icm|enter-pssession|etsn|new-pssession|nsn|restart-computer|stop-computer)$/;
const PS_PROBES = /^(?:test-connection|test-netconnection|tnc|resolve-dnsname)$/;
const PS_HOST = /^-(?:Comp(?:u(?:t(?:e(?:r(?:N(?:a(?:m(?:e)?)?)?)?)?)?)?)?|Cn|Server|__Server|CimSession)$/i;
const PS_REMOTING_HOST = /^-(?:Ho(?:s(?:t(?:N(?:a(?:m(?:e)?)?)?)?)?)?|URI|CU|ConnectionU(?:r(?:i)?)?)$/i;
const PS_SESSION = /^-(?:SSHConnection|ToS(?:e(?:s(?:s(?:i(?:o(?:n)?)?)?)?)?)?|FromS(?:e(?:s(?:s(?:i(?:o(?:n)?)?)?)?)?)?)$/i;
// The remoting cmdlets' switches: the word after one may be the computer.
const PS_REMOTING_SWITCH = /^-(?:UseSSL|EnableNetworkAccess|AllowRedirection|HideComputerName|AsJob|InDisconnectedSession|NoNewScope|RunAsAdministrator|Force|Wait)$/i;
function psRemote(words) {
  const depthOf = [];
  let level = 0;
  for (const word of words) {
    depthOf.push(level);
    level += braces(word, '{') - braces(word, '}');
  }
  return words.some((call, at) => {
    const name = commandName(call.replace(OPENS, ''));
    if (!(PS_POSITIONAL_HOST.test(name) || isCmdlet(name)) || PS_PROBES.test(name)) return false;
    const remoting = PS_REMOTING.test(name);
    // Its own words, one `{}` standing for each block it is handed.
    const callDepth = depthOf[at] + (OPENS.test(call) ? 1 : 0);
    const own = [];
    // They end where the next call at its own depth starts: a segment of thousands of calls is read once, not once per
    // call.
    for (let index = at + 1; index < words.length && depthOf[index] >= callDepth; index += 1) {
      if (depthOf[index] > callDepth) continue;
      const next = commandName(words[index]);
      if (PS_POSITIONAL_HOST.test(next) || /^[a-z]+-[a-z]+$/.test(next)) break;
      if (OPENS.test(words[index])) own.push('{}');
      else if (words[index].replace(/[{}]/g, '')) own.push(words[index].replace(/[{}]/g, ''));
    }
    // Copy-Item takes -ToSession and -FromSession by their shortest prefixes too (`-To`, `-Fr`).
    const copy = /^(?:copy-item|cpi|copy|cp)$/.test(name);
    if (own.some((word) => PS_SESSION.test(word) || (remoting && /^-Session$/i.test(word)) || (copy && /^-(?:To|Fr|Fro|From)$/i.test(word)))) return true;
    const hosts = [];
    const take = (from) => {
      for (let index = from; index < own.length && own[index] !== '{}'; index += 1) {
        hosts.push(...own[index].split(',').filter(Boolean));
        if (!own[index].endsWith(',')) break;
      }
    };
    own.forEach((word, index) => {
      const named = PS_HOST.test(word) || (remoting && PS_REMOTING_HOST.test(word)) || (PS_POSITIONAL_HOST.test(name) && /^-IPAddress$/i.test(word));
      if (named && own[index + 1] && !own[index + 1].startsWith('-')) take(index + 1);
    });
    if (!hosts.length && PS_POSITIONAL_HOST.test(name)) {
      const positional = own.flatMap((word, index) => (word !== '{}' && !word.startsWith('-') && !(/^-/.test(own[index - 1] ?? '') && !PS_REMOTING_SWITCH.test(own[index - 1])) ? [index] : []));
      // Invoke-Command's one plain word with no block beside it is the script block (`Invoke-Command $sb`).
      const blockGiven = own.includes('{}') || own.some((word) => /^-(?:Sc\w*|FilePath|File|FP)$/i.test(word));
      if (positional.length && !(/^(?:invoke-command|icm)$/.test(name) && positional.length === 1 && !blockGiven)) take(positional[0]);
    }
    return hosts.some((host) => !localComputer(hostPart(host)));
  });
}

// ---- Under the Codex switch only: an interactive database session or console. What is typed into a running
// command fires no hook there, so a client left open is a database shell nothing checks. ----
const SESSION_CLIENTS = new Set([
  'psql', 'pgcli', 'mysql', 'mariadb', 'mycli', 'sqlcmd', 'sqlite3', 'duckdb', 'usql', 'cockroach', 'clickhouse-client', 'clickhouse',
  'mongosh', 'mongo', 'redis-cli', 'valkey-cli', 'sqlplus', 'cqlsh',
]);
const CONTAINER_SHELLS = new Set(['bash', 'sh', 'ash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell']);
// An interpreter in a container, whose prompt waits for typed input when nothing hands it a script or code; and the
// options of python's that take a value (`-X dev`, `-W ignore`).
const REPLS = /^(?:node|nodejs|python[\d.]*|ipython3?|ruby|irb|php|bun|deno)$/;
const REPL_VALUE = /^-[XWQ]$/;
// `django` is the module `python -m django` runs.
const CONSOLES = new Set(['manage.py', 'django-admin', 'django', 'artisan', 'rails', 'flask']);
// What may stand before a client in command position: a shell or a launcher with its switches, a package runner, an
// interpreter that runs a console's script (`python manage.py shell`, `py -3 -m django shell`, `bundle exec rails c`).
const LAUNCH_NAME = /^(?:iex|invoke-expression|cmd|pwsh|powershell|bash|sh|zsh|dash|ksh|wsl|winpty|start-process|saps|start|invoke-command|icm|python[\d.]*|py|php|ruby|uv|poetry|pipenv|pdm|hatch|rye|bundle|run|exec)$/;
const LAUNCH_SWITCH = /^(?:\/[ck]|-[lc]+|-command|-noprofile|-nop|-nologo|-nol|-noninteractive|-noni|-nonewwindow|-wait|-passthru|-filepath|-scriptblock|-e|--exec|-m|-[\d.]+|-[uBEsSOIqX]|--)$/i;
// A launcher's switch that takes the next word as its value: `wsl -d Ubuntu`, `pwsh -ExecutionPolicy Bypass`.
const LAUNCH_VALUE = /^(?:-d|--distribution|--cd|-executionpolicy|-ep|-windowstyle|-workingdirectory)$/i;
// `docker run` options that take the next word as their value: the first other plain word is the image.
const RUN_VALUE = /^(?:-[evpwuhlm]|--(?:env|volume|publish|workdir|user|hostname|label|memory|name|network|net|entrypoint|env-file|mount|platform|add-host|cpus|restart|pull|cidfile|device|dns|expose|group-add|ipc|link|log-driver|pid|runtime|security-opt|shm-size|stop-signal|tmpfs|ulimit|uts))$/;

// The client, console or shell a segment leaves open, or ''.
function sessionClient(typed, inContainer = false) {
  // Start-Process hands what it starts its -ArgumentList, a comma list or one quoted line: read as plain words
  // (`Start-Process cmd -ArgumentList '/c','psql -U app'`).
  const started = typed.some((word, index) => /^(?:start-process|saps)$/.test(commandName(word)) || (index === 0 && commandName(word) === 'start'));
  const words = started ? typed.flatMap((word, index) => (ARG_LIST.test(word) ? [] : ARG_LIST.test(typed[index - 1] ?? '') ? word.split(/[\s,]+/).filter(Boolean) : [word])) : typed;
  const names = words.map(commandName);
  // A container shell's command: an interpreter there is judged here (outside one, guard.mjs judges it).
  if (inContainer && REPLS.test(names[0] ?? '')) return replOpen(names[0], words.slice(1));
  let at = 0;
  for (;;) {
    const before = at;
    at += commandAt(words.slice(at), names.slice(at));
    for (;;) {
      // `-u` is wsl's user and python's unbuffered switch.
      if (at < words.length && (LAUNCH_VALUE.test(words[at]) || (/^(?:-u|--user)$/.test(words[at]) && names.slice(0, at).includes('wsl')))) at += 2;
      else if (at < words.length && (LAUNCH_NAME.test(names[at]) || LAUNCH_SWITCH.test(words[at]))) at += 1;
      else break;
    }
    if (at === before) break;
  }
  const name = names[at] ?? '';
  // A word with blanks after the client (a Start-Process argument list) is read word by word.
  const rest = words.slice(at + 1).flatMap((word) => (/\s/.test(word) ? word.trim().split(/\s+/) : [word]));
  if (SESSION_CLIENTS.has(name)) return clientStaysOpen(name, rest) ? name : '';
  if (CONSOLES.has(name)) return consoleOpen(name, rest);
  if (!CONTAINER_RUNNERS.has(name)) return '';
  // `attach` hands the container's own process the terminal (kubectl only with -i), and `start -i` a stopped one's.
  const stdinFlag = (word) => /^-[A-Za-z]*i[A-Za-z]*$/.test(word) || /^--(?:interactive|stdin)(?:=true)?$/.test(word);
  const own = names.findIndex((word, index) => index > at && !words[index].startsWith('-') && !DOCKER_VALUE.test(words[index - 1]) && !/^(?:container|compose)$/.test(word));
  if (names[own] === 'attach' && !words.includes('--no-stdin') && (!/^(?:kubectl|oc)$/.test(name) || words.slice(own + 1).some(stdinFlag))) return `${name} attach`;
  if (names[own] === 'start' && /^(?:docker|podman|nerdctl)$/.test(name) && words.slice(own + 1).some(stdinFlag)) return `${name} start -i`;
  // In a container: the first client, console, shell or interpreter after `exec` / `run` that is no option's value.
  // docker, podman and kubectl attach stdin only with -i; compose exec and run always do.
  const verb = names.findIndex((word, index) => index > at && (word === 'exec' || word === 'run'));
  if (verb === -1) return '';
  const compose = /compose$/.test(name) || names.slice(at, verb).includes('compose');
  const interactive = compose || words.slice(verb + 1).some((word) => /^-[A-Za-z]*i[A-Za-z]*$/.test(word) || /^--(?:interactive|stdin)(?:=true)?$/.test(word));
  if (!interactive) return '';
  const inside = names.findIndex(
    (word, index) => index > verb && (SESSION_CLIENTS.has(word) || CONTAINER_SHELLS.has(word) || CONSOLES.has(word) || REPLS.test(word)) && !/^-(?!-$)/.test(words[index - 1]),
  );
  if (inside === -1) {
    // `docker run -it alpine` runs the image's own command, often a shell: one with nothing after the image.
    if (compose || names[verb] !== 'run' || !/^(?:docker|podman|nerdctl)$/.test(name)) return '';
    const plain = [];
    for (let index = verb + 1; index < words.length; index += 1) {
      if (RUN_VALUE.test(words[index])) index += 1;
      else if (!words[index].startsWith('-')) plain.push(words[index]);
    }
    return plain.length === 1 ? `${name} run ${plain[0]}` : '';
  }
  const after = words.slice(inside + 1);
  if (CONSOLES.has(names[inside])) return consoleOpen(names[inside], after);
  if (REPLS.test(names[inside])) return replOpen(names[inside], after);
  if (CONTAINER_SHELLS.has(names[inside])) {
    // `sh -c psql` or `sh -c "python -i x"` runs the command it is given: it is judged as typed alone in the container.
    const code = after.findIndex((word) => /^-(?:[A-Za-z]*c|command)$/i.test(word));
    if (code !== -1 && after[code + 1]) return sessionClient(after[code + 1].trim().split(/\s+/), true);
    return after.some((word) => !word.startsWith('-') || /^-(?:[A-Za-z]*c|command|file|f|ec|encodedcommand)$/i.test(word)) ? '' : names[inside];
  }
  return clientStaysOpen(names[inside], after) ? names[inside] : '';
}

// Whether an interpreter in a container waits at its prompt: with nothing that hands it a script or code; with `-i`
// (python, node) or `-a` (php) even then; behind `-m` a prompt module (`-m IPython`, `-m asyncio`); `deno repl`,
// `bun repl`. One that runs a console's script or module is that console (`python manage.py shell`,
// `python -m django shell`, `php artisan tinker`); a version or help check exits.
const REPL_MODULES = /^(?:IPython|asyncio|code|ptpython|bpython)$/;
function replOpen(name, after) {
  if (after.some((word) => /^(?:--version|-V|-v|--help|-h|-\?)$/.test(word))) return '';
  const node = /^(?:node|nodejs)$/.test(name);
  if (after.some((word) => (/^(?:-i|--interactive)$/.test(word) && (node || /^python/.test(name))) || (name === 'php' && word === '-a'))) return name;
  const valued = node ? /^(?:-r|--require|--import|--loader|--experimental-loader)$/ : /^(?:ruby|irb)$/.test(name) ? /^-[rI]$/ : REPL_VALUE;
  const code = node ? /^(?:-e|-p|--eval|--print)$/ : name === 'php' ? /^-r$/ : /^(?:-c|-e)$/;
  if (after.some((word) => code.test(word))) return '';
  const module = after.indexOf('-m');
  if (module !== -1) {
    const named = after[module + 1] ?? '';
    if (REPL_MODULES.test(named)) return `${name} -m ${named}`;
    return CONSOLES.has(named) ? consoleOpen(named, after.slice(module + 2)) : '';
  }
  const script = after.findIndex((word, index) => !word.startsWith('-') && !valued.test(after[index - 1] ?? ''));
  if (script === -1) return name === 'bun' ? '' : name;
  if (/^(?:deno|bun)$/.test(name)) return after[script] === 'repl' ? `${name} repl` : '';
  return CONSOLES.has(commandName(after[script])) ? consoleOpen(commandName(after[script]), after.slice(script + 1)) : '';
}

// A console's subcommand is its first plain word that is no option's value (`flask --app app shell`).
function consoleOpen(name, rest) {
  const sub = rest.find((word, index) => !word.startsWith('-') && !/^(?:--app|-A|--env-file|-e|--settings|--pythonpath)$/.test(rest[index - 1] ?? '')) ?? '';
  return consoleStaysOpen(name, sub, rest) ? `${name} ${sub}` : '';
}

// Whether a short option cluster hands the client work: its letters are read left to right, and one that takes a
// value ends the cluster - `-qAtc` carries -c, `-Ualice` is a user name, `-psecret` a password.
function clusterHas(word, closers, valued) {
  if (!/^-[A-Za-z]/.test(word) || word.startsWith('--')) return false;
  for (const letter of word.slice(1)) {
    if (closers.includes(letter)) return true;
    if (valued.includes(letter)) return false;
  }
  return false;
}

// Whether a database client started with these words waits for typed input: nothing hands it a statement, a file or
// a mode of its own.
function clientStaysOpen(name, words) {
  const has = (pattern) => words.some((word) => pattern.test(word));
  if (has(/^(?:--version|--help|-\?)$/)) return false;
  const plain = (valued) => {
    const found = [];
    for (let index = 0; index < words.length; index += 1) {
      if (valued.test(words[index])) index += 1;
      else if (!words[index].startsWith('-')) found.push(words[index]);
    }
    return found;
  };
  switch (name) {
    case 'psql':
    case 'pgcli':
      // `-f -` (or /dev/stdin) reads the statements from the terminal: the session stays open.
      if (words.some((word, index) => (/^(?:-f|--file)$/.test(word) && /^(?:-|\/dev\/stdin)$/.test(words[index + 1] ?? '')) || /^(?:-f|--file=)(?:-|\/dev\/stdin)$/.test(word))) return true;
      return !(words.some((word) => clusterHas(word, 'cfl', 'dhLopPTUvFR')) || has(/^--(?:command|file|list)(?:=|$)|^-V$/));
    case 'mysql':
    case 'mariadb':
    case 'mycli':
      return !(words.some((word) => clusterHas(word, 'e', 'uphPDSOTW')) || has(/^--execute(?:=|$)|^-V$/));
    case 'sqlcmd':
      // `-q` runs its query and stays open; `-Q` and `-i` exit.
      return !has(/^-[Qi]$|^--query(?:=|$)/);
    case 'usql':
      return !has(/^-[cf]$|^--(?:command|file)(?:=|$)/);
    case 'cockroach':
      return /^(?:sql|demo)$/.test(plain(/^$/)[0] ?? '') && !has(/^-[ef]$|^--(?:execute|file)(?:=|$)/);
    case 'clickhouse':
      if (!/^(?:client|local)$/.test(plain(/^$/)[0] ?? '')) return false;
    // falls through
    case 'clickhouse-client':
      return !has(/^-q$|^--query(?:=|$)|^--queries-file(?:=|$)/);
    case 'mongosh':
    case 'mongo':
      return has(/^--shell$/) || !(has(/^(?:--eval|-f|--file)(?:=|$)/) || plain(/^$/).some((word) => /\.js$/i.test(word)));
    case 'redis-cli':
    case 'valkey-cli':
      if (has(/^--(?:scan|bigkeys|memkeys|hotkeys|latency|latency-history|latency-dist|stat|pipe|rdb|functions-rdb|eval|lru-test|intrinsic-latency)(?:=|$)/)) return false;
      return plain(/^(?:-[hpsaunridDt]|--(?:user|pass|cacert|cacertdir|cert|key|sni|tls-ciphers|tls-ciphersuites|pattern|count))$/).length === 0;
    case 'sqlite3':
    case 'duckdb':
      return !has(/^-c$|^-(?:version|help)$/) && plain(/^-(?:cmd|init|separator|newline|nullvalue|vfs|maxsize|mmap)$/).length < 2;
    case 'sqlplus':
      return !has(/^@|^-[VH]$/i);
    case 'cqlsh':
      return !has(/^(?:-e|--execute|-f|--file)(?:=|$)/);
    default:
      return false;
  }
}

// A framework's console: `rails console` always waits for input; Django's `shell` unless given `-c`, its `dbshell`
// unless handed the client's own arguments after `--`; `artisan tinker` unless `--execute`; `flask shell` always.
function consoleStaysOpen(name, sub, words) {
  if (name === 'rails') return /^(?:console|c|dbconsole|db)$/.test(sub);
  if (name === 'flask') return sub === 'shell';
  if (name === 'django' && sub === 'dbshell') return !(words.includes('--') && words.indexOf('--') < words.length - 1);
  if (name === 'artisan') return sub === 'tinker' && !words.some((word) => /^--execute(?:=|$)/.test(word));
  if (/^(?:shell|shell_plus)$/.test(sub)) return !words.some((word) => /^(?:-c|--command)(?:=|$)/.test(word));
  if (sub === 'dbshell') return !(words.includes('--') && words.indexOf('--') < words.length - 1);
  return false;
}

// The string literals of a piece of code: one that names a secret file is a read of it.
function checkCodeLiterals(code) {
  for (const [, , value] of code.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (value && reaches(value)) secretRefusal(value, 'read');
  }
}

// A shell a quoted string is piped into runs it: PowerShell's `iex`, `Invoke-Expression`, `pwsh`, `powershell`, `cmd`.
const PS_SHELL_READER = /(?:^|[\s;&|(\/])(?:iex|invoke-expression|pwsh|powershell|cmd)(?=[\s;&|)]|$)/i;

// A .NET call, cast or object that opens the file it names: `[IO.File]::ReadAllText('.env')`,
// `[IO.StreamReader]::new('.env')`, `([IO.StreamReader]'.env')`, `New-Object -TypeName System.IO.StreamReader '.env'`.
const DOTNET_TYPE = String.raw`(?:System\.)?IO\.(?:File|FileInfo|StreamReader|StreamWriter|FileStream|BinaryReader)`;
const DOTNET_FILE = new RegExp(String.raw`\[${DOTNET_TYPE}\]\s*(?:::(?:\w+|'\w+'|"\w+")\s*\([^)]*\)|'[^']*'|"[^"]*")|New-Object\b(?=[^;|\n)]*\b${DOTNET_TYPE}\b)[^;|\n)]*`, 'gi');
function checkDotnet(text, cwd) {
  for (const [call] of text.matchAll(DOTNET_FILE)) {
    checkCodeLiterals(call);
    // A path named bare, or inside a call of its own: `[IO.File]::ReadAllText((Resolve-Path .env))`.
    const args = call.replace(/^\[[^\]]*\]\s*(?:::\w+\s*)?|^New-Object\b/i, '').split(/[\s,()]+/);
    for (const word of args) {
      const value = word.replace(/^-\w+:/, '').replace(/^['"]|['"]$/g, '');
      if (value && !/^[-$]/.test(value) && !new RegExp(DOTNET_TYPE, 'i').test(value) && reachesFrom(value, cwd)) secretRefusal(value, 'read');
    }
  }
}

// What PowerShell reads in forms no reader names: the provider path `${C:\app\.env}` (a drive letter: `${env:TEMP}` is
// a variable), and a FileInfo method on a listed item - `(Get-Item .env).OpenText()`, `((gi .env)).OpenText()`,
// `(gci .e*)[0].OpenRead()`; its `.Delete()` and `.MoveTo()` remove the file.
const FILEINFO = /\(\s*(?:\(\s*)?(?:get-item|gi|get-childitem|gci|dir|ls)\s([^()]*)\)\s*(?:\)\s*)?(?:\[\d+\]\s*)?\.(OpenText|OpenRead|OpenWrite|Open|CopyTo|Replace|Encrypt|Delete|MoveTo)\s*\(/gi;
function checkPowerShellReads(text, cwd) {
  checkDotnet(text, cwd);
  for (const [, file] of text.matchAll(/\$\{([A-Za-z]:[^{}]*)\}/g)) if (reachesFrom(file, cwd)) secretRefusal(file, 'read');
  for (const [, list, method] of text.matchAll(FILEINFO)) {
    for (const word of list.trim().split(/[\s,]+/)) {
      const file = word.replace(/^-\w+:/, '').replace(/^['"]|['"]$/g, '');
      if (!file || file.startsWith('-')) continue;
      const removes = /^(?:Delete|MoveTo)$/i.test(method);
      if (removes && FROZEN_PATHS.length && mayHoldFrozen(file, cwd) && frozenAt(file, cwd)) frozenRefusal(file, 'delete or move');
      if (!(reachesFrom(file, cwd) || globSecret(file, cwd, 'PowerShell'))) continue;
      if (removes) secretDeleteRefusal(file);
      secretRefusal(file, 'read');
    }
  }
}

// A quoted literal in parentheses or an array is that literal: `Get-Content ('.env')`, `gc(".env")`, `@('a'; '.env')`,
// `-Path:('.env')`, `((".env"))`. Only quoted items (no `$`, no backtick), so `('.e' + 'nv')` and `(Join-Path ...)` stay
// what they are, and a keyword's condition (`if ('x')`) is left alone.
const PS_LITERAL = String.raw`(?:'[^']*'|"[^"$\x60]*")`;
const PS_LITERAL_GROUP = new RegExp(
  // The look-ahead first: the keyword test looks back over blanks, and only where a parenthesis follows.
  String.raw`(^|[\s,:(;|=]|(?:^|[\s;|(])[A-Za-z][\w-]*)(?=@?\()(?<!(?:^|[^\w-])(?:if|elseif|while|switch|foreach|for|until|return|throw)\s{0,8})@?\(\s*,?\s*(${PS_LITERAL}(?:\s*[,;]\s*${PS_LITERAL})*)\s*\)`,
  'g',
);
// A lone variable in parentheses is that variable: `-ComputerName ($env:COMPUTERNAME)`.
const PS_VARIABLE_GROUP = /(^|[\s,:(;|=]|(?:^|[\s;|(])[A-Za-z][\w-]*)(?=@?\()(?<!(?:^|[^\w-])(?:if|elseif|while|switch|foreach|for|until|return|throw)\s{0,8})@?\(\s*(\$(?:\{[^{}]*\}|[\w:]+))\s*\)/g;
function literalGroups(text) {
  let out = text;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = out
      .replace(PS_LITERAL_GROUP, (whole, before, list) => `${before} ${[...list.matchAll(new RegExp(PS_LITERAL, 'g'))].map((item) => item[0]).join(',')}`)
      .replace(PS_VARIABLE_GROUP, '$1 $2');
    if (next === out) break;
    out = next;
  }
  return out;
}

// A parenthesised group inside a PowerShell command is one of its arguments, not the end of the command:
// `Get-Content -TotalCount (10) .env`, `Remove-Item -Force:(1) .envrc`. A group in an argument position - after a
// blank, a comma, a colon or `=`, with a word before it in its statement, and not a keyword's condition - is pulled
// out and judged as a command of its own, and one placeholder word stays in its place, as a `$(...)` does.
const PS_KEYWORD_PAREN = /(?:^|[^\w-])(?:if|elseif|while|switch|foreach|for|until|catch|param|function|filter|trap|data)\s*$/i;
function parenGroups(command) {
  // Every parenthesis outside a quote and its partner, found in one pass: a long command may hold thousands.
  const partner = new Map();
  const open = [];
  for (let index = 0, quote = ''; index < command.length; index += 1) {
    const ch = command[index];
    if (quote) {
      if (quote === '"' && ch === '`') index += 1;
      else if (ch === quote) quote = '';
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') open.push(index);
    else if (ch === ')' && open.length) partner.set(open.pop(), index);
  }
  const bodies = [];
  // What is kept, one character or placeholder per entry: read backwards without copying it.
  const outer = [];
  let quote = '';
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote) {
      outer.push(ch);
      if (quote === '"' && ch === '`' && index + 1 < command.length) {
        index += 1;
        outer.push(command[index]);
      } else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(' && partner.has(index)) {
      const end = outer.at(-1) === '@' ? outer.length - 1 : outer.length;
      let word = end - 1;
      while (word >= 0 && /^\s$/.test(outer[word])) word -= 1;
      const opensStatement = word < 0 || /^[;|{}\n&(]$/.test(outer[word]);
      if (/^[\s,:=]$/.test(outer[end - 1] ?? '') && !opensStatement && !PS_KEYWORD_PAREN.test(outer.slice(Math.max(0, end - 40), end).join(''))) {
        bodies.push(command.slice(index + 1, partner.get(index)));
        outer.length = end;
        outer.push('__sub__');
        index = partner.get(index);
        continue;
      }
    }
    outer.push(ch);
  }
  return { outer: outer.join(''), bodies };
}

function checkCommand(command, shell, cwd, depth) {
  let text = command;
  if (shell === 'PowerShell') {
    text = hereStringsQuoted(text, cwd, depth);
    // `-ArgumentList @('apply','-auto-approve')` is the list `'apply','-auto-approve'`.
    text = text.replace(/(\s)(-\w+)(\s+)@\(([^()]*)\)/g, (whole, space, flag, gap, list) => (ARG_LIST.test(flag) ? `${space}${flag}${gap}${list}` : whole));
    text = literalGroups(text);
    // `(gci).ForEach({ ... })` and `.Where({ ... })` hand the block each item, as a pipe into `% { ... }` does.
    text = text.replace(/\(([^()]*)\)\s*\.(?:ForEach|Where)\(\s*\{/gi, '$1 | % {');
    checkPowerShellReads(text, cwd);
    const groups = parenGroups(text);
    for (const body of groups.bodies) {
      if (depth < MAX_DEPTH) checkCommand(body, shell, cwd, depth + 1);
      else tooDeep();
    }
    text = groups.outer;
  } else if (depth === 0) text = withoutHeredocs(text);
  const { outer, bodies } = withoutSubstitutions(text, shell);
  for (const body of bodies) {
    if (depth < MAX_DEPTH) checkCommand(body, shell, cwd, depth + 1);
    else tooDeep();
  }
  noteDockerAssignments(outer);
  noteDatabaseAssignments(outer);
  // A .NET file call reads or writes the path it names: `[IO.File]::ReadAllText('.env')`.
  if (shell !== 'PowerShell') checkDotnet(outer, cwd);
  // `< file` feeds the file to whatever reads stdin; `<<` is a heredoc and `<(` a process substitution. A quoted
  // string with a space in it is a statement or a message, where `<` compares.
  const unquoted = outer.replace(/"[^"]*\s[^"]*"|'[^']*\s[^']*'/g, '""');
  for (const [, , target] of unquoted.matchAll(/(?<![<\w$&])<(?![<(&=])\s*(["']?)([^\s"'<>|;&()]+)\1/g)) {
    if (isSecret(target)) secretRefusal(target, 'read');
  }
  // What echo or printf pipes into a database client is its statement; into a shell, a command. PowerShell pipes
  // a bare quoted string the same way - one written as PowerShell writes it (`''` an apostrophe, a backtick an
  // escape, over several lines: a here-string is one by now).
  const quotedForm = shell === 'PowerShell' ? String.raw`'(?:[^']|'')*'|"(?:[^"\x60]|\x60[\s\S])*"` : String.raw`"[^"\n]*"|'[^'\n]*'`;
  const pipedText = new RegExp(String.raw`(?:^|[\n;&|(])\s*(?:(?:echo|printf)\s([^|\n]*)|(${quotedForm})\s*)\|([^|;&\n]*)`, 'g');
  for (const [, echoed, quoted, reader] of outer.matchAll(pipedText)) {
    const body =
      echoed ??
      (shell !== 'PowerShell' ? quoted : quoted.startsWith("'") ? quoted.slice(1, -1).replace(/''/g, "'") : quoted.slice(1, -1).replace(/\x60([\s\S])/g, '$1'));
    checkStdinSql(reader, body);
    const runner = SHELL_HEREDOC.test(reader) ? 'Bash' : shell === 'PowerShell' && PS_SHELL_READER.test(reader) ? 'PowerShell' : '';
    if (!runner) continue;
    if (depth < MAX_DEPTH) checkCommand(body.trim().replace(/^(["'])(.*)\1$/s, '$2'), runner, cwd, depth + 1);
    else tooDeep();
  }
  const segments = segmentsOf(outer, shell).map((words) => colonValues(bracesSplit(words, shell), shell));
  segments.forEach((words, index) => checkSegment(words, shell, cwd, depth, words.piped ? segments[index - 1] : undefined));
}

// ---- OpenAI Codex: the input form below runs only under the switch. ----

// The grammar a Codex `Bash` call is judged by: the shell the call names when it names one, otherwise the platform's.
// cmd reads a backslash as a path separator, as PowerShell does.
function codexShell(tool, named) {
  const name = commandName(Array.isArray(named) ? (named[0] ?? '') : typeof named === 'string' ? named : '');
  if (/^(?:bash|sh|zsh|dash|ksh)$/.test(name)) return 'Bash';
  if (/^(?:pwsh|powershell|cmd)$/.test(name)) return 'PowerShell';
  return tool === 'PowerShell' || process.platform === 'win32' ? 'PowerShell' : 'Bash';
}

// A command handed over as an argument list, written back as the one line a shell would get: every word that is not
// plain goes into double quotes, so `pwsh -Command <code>` and `bash -lc <script>` are read as they run.
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
      else ops.push((current = { kind: 'add', path: head[2] }));
    } else if (head) {
      ops.push((current = { kind: head[1].split(' ')[0].toLowerCase(), path: head[2] }));
    }
  }
  return ops;
}

// A patch, file by file: a written path (an `Add File`, an `Update File`, a `Move to`'s destination) as Edit / Write
// are judged; a removed one (a `Delete File`, a `Move to`'s source) as a shell delete is.
function checkPatch(text, cwd) {
  for (const op of patchOps(text)) {
    if (op.kind === 'delete' || op.moveTo !== undefined) {
      if (isSecret(op.path) || isSecret(absolute(op.path, cwd))) secretDeleteRefusal(op.path);
      if (isFrozenPath(absolute(op.path, cwd)) && frozenAt(op.path, cwd)) frozenRefusal(op.path, 'delete or move');
    }
    if (op.kind !== 'delete') checkWrite(op.moveTo ?? op.path, cwd);
  }
}

function codexCall(payload) {
  if (payload.hook_event_name !== undefined && payload.hook_event_name !== 'PreToolUse') return;
  if (listErrors.length) {
    deny(`Blocked by .claude/hooks/backend-guard.mjs: ${listErrors[0]} in .claude/hooks/backend-guard.mjs. Until the developer fixes that list this guard refuses every call - tell them, and do not work around it.`);
  }
  const tool = payload.tool_name;
  const input = payload.tool_input ?? {};
  const base = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const workdir = [input.workdir, input.cwd].find((value) => typeof value === 'string' && value);
  const cwd = workdir ? absolute(workdir, base) : base;
  if (tool === 'apply_patch' || tool === 'Edit' || tool === 'Write') {
    const patch = [input.command, input.patch, input.input].find((value) => typeof value === 'string');
    if (patch !== undefined) checkPatch(patch, cwd);
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    const shell = codexShell(tool, input.shell);
    const typed = typeof input.command === 'string' ? input.command : Array.isArray(input.command) ? commandLine(input.command, shell) : undefined;
    if (typed !== undefined) checkCommand(typed, shell, cwd, 0);
  }
}

let parsed = false;
try {
  const payload = JSON.parse(await readStdin());
  parsed = true;
  if (CODEX) codexCall(payload);
  else {
    const name = payload.tool_name;
    const input = payload.tool_input ?? {};
    const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
    if (name === 'Read') checkRead(input.file_path);
    else if (name === 'Grep') {
      checkRead(input.path);
      // A glob that leaves a file out (`!.env`) is the opposite of a read.
      for (const glob of typeof input.glob === 'string' ? grepGlobs(input.glob) : []) if (!glob.startsWith('!') && reaches(glob)) secretRefusal(glob, 'read');
      checkGrepTool(input, cwd);
    } else if (name === 'Edit' || name === 'Write' || name === 'MultiEdit') checkWrite(input.file_path, cwd);
    else if ((name === 'Bash' || name === 'PowerShell') && typeof input.command === 'string') checkCommand(input.command, name, cwd, 0);
  }
} catch {
  // Unparseable input: allow. guard.mjs, the deny list in settings.json and the rules still apply. Under Codex a call
  // that parsed and then stopped the guard is refused: it was not judged.
  if (CODEX && parsed) deny('Blocked by .claude/hooks/backend-guard.mjs: this call could not be judged - the guard stopped on it. Split the command into simpler calls.');
  question = '';
}
if (CODEX) {
  if (question) deny(question);
  process.exit(0);
}
if (question || listErrors.length) {
  const output = listErrors.length ? { systemMessage: listErrors.join(' ') } : {};
  if (question) output.hookSpecificOutput = { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: question };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}
process.exit(0);
