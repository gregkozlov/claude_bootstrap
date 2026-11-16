#!/usr/bin/env node
// PreToolUse guard for a server codebase, registered beside guard.mjs. It refuses what a backend adds to that list:
//   Read / Grep                - a secret file: an env file, a private key, a credentials file (SECRET_PATHS).
//   Edit / Write / MultiEdit   - a secret file; and a frozen file, one matching FROZEN_PATHS that is on the upstream
//                                default branch (with no remote: that git tracks): a merged migration is never
//                                edited, the change is a new migration.
//   Bash / PowerShell          - a command that prints or copies a secret file, one that deletes or moves a frozen
//                                file, and one that deploys, changes infrastructure or publishes (FORBIDDEN, plus the
//                                project's own list). A command that destroys data, prints a secret from a cluster
//                                or a cloud store, or opens a shell or a copy to another host is not refused: the
//                                user is asked.
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
//               path's tail and never starts with "^", e.g. ["db/migrations/[^/]+\\.sql$"]. Case-insensitive on
//               Windows and macOS, where `Db/Migrations/001.sql` is the same file.
//   secret    - the same, case-insensitive everywhere, on top of SECRET_PATHS below, e.g.
//               ["config/local\\.settings\\.json$"].
//   forbidden - tested against one command segment, words joined by single spaces, e.g.
//               ["\\bmake\\s+deploy(?!\\S)"] - a `\\b` after the target would take `make deploy-docs` with it.
const FROZEN_RAW = String.raw`<FROZEN_PATHS>`;
const SECRET_RAW = String.raw`<SECRET_PATHS>`;
const FORBIDDEN_RAW = String.raw`<FORBIDDEN_COMMANDS>`;
const sources = (raw) => (raw.startsWith('<') || !raw.trim() ? [] : JSON.parse(raw));
const FOLD = process.platform === 'win32' || process.platform === 'darwin';
const FROZEN_PATHS = sources(FROZEN_RAW).map((source) => new RegExp(source, FOLD ? 'i' : ''));

// Files whose content is a secret. A name that says it is an example (example, sample, template, dist, defaults)
// holds names and placeholders and stays readable; so does a key or certificate whose name says it is public, a
// known_hosts or authorized_keys file, and a chart's templates folder. Delete or narrow a line the project does not
// want - a tracked `.env.test` with no secret in it is the usual one.
const EXAMPLE = String.raw`(?![^/]*\b(?:example|sample|template|dist|defaults?)\b)`;
// A user's home folder by its absolute path or its shell spelling: a project's own .npmrc holds no token as a rule.
const HOME = String.raw`(?:^|\/)(?:(?:Users|home)\/[^/]+|root|~|\$HOME|\$\{HOME\}|\$env:(?:USERPROFILE|HOME)|%USERPROFILE%)\/`;
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
  new RegExp(String.raw`(?:${HOME}(?:AppData\/Roaming\/NuGet|\.nuget\/NuGet|\.config\/NuGet)|(?:^|\/)(?:%APPDATA%|\$env:APPDATA)\/NuGet)\/NuGet\.Config$`, 'i'),
  // A kubeconfig by name, not a source file about one (kubeconfig.go, KubeconfigLoader.java).
  new RegExp(String.raw`(?:^|\/)${EXAMPLE}[^/]*kubeconfig(?:[-_][^/.]*)?(?:\.(?:ya?ml|json|conf|config|cfg))?$`, 'i'),
  /(?:^|\/)client_secret[^/]*\.json$/i,
  /(?:^|\/)application_default_credentials\.json$/i,
  /(?:^|\/)(?:\.config|AppData\/Roaming)\/gcloud(?:\/|$)/i,
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
// filter or a name, never the verb), 'sql' (the whole segment but its SQL string literals) or 'words' (the bare
// words as an array, for a source that is a function). hint: a sentence the refusal adds.
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
const SQL_CLIENTS = 'psql|mysql|mariadb|sqlcmd|sqlite3|clickhouse-client|cockroach|usql|pgcli|mycli|bq|snowsql';
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
  rule('remote', 'ssh, scp, sftp or rsync to another host', (words) => Boolean(remoteHost(words)), 'words'),

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
const REMOTE_TOOLS = new Set(['ssh', 'sftp', 'scp', 'rsync']);
const REMOTE_VALUE = { ssh: 'BbcDEeFIiJLlmOoPpQRSWw', sftp: 'BbcDFiJloPRSsX', scp: 'cDFiJloPS', rsync: 'eTf' };
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
    else if (/^-[A-Za-z]+$/.test(word) && REMOTE_VALUE[name].includes(word.slice(-1))) index += 1;
    else if (name === 'rsync' && /^--(?:rsh|filter|exclude|include|files-from|exclude-from|include-from)$/.test(word)) index += 1;
  }
  // `ssh -T git@host` only checks that the git host accepts the key.
  if (name === 'ssh' && words.includes('-T') && plain.length === 1 && /^git@/i.test(plain[0])) return '';
  const hosts = name === 'ssh' || name === 'sftp' ? plain.slice(0, 1).map((word) => hostOf(word, true)) : plain.map((word) => hostOf(word, false));
  return hosts.find((host) => host && !LOCAL_HOST.test(host)) ?? '';
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
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

// A refusal anywhere in the call outranks a question, so the question waits until the whole call was read.
let question = '';
const QUESTION = {
  data: (label) => `backend-guard: this command ${KIND.data} (${label}). ${RULE}: a database is wiped only when you asked for exactly that - approve it if you did, and check which database it points at first.`,
  reveal: (label) => `backend-guard: this command prints secret values (${label}). ${RULE}: a secret is never read or printed - approve it only if you asked for exactly that.`,
  large: (label) => `backend-guard: a search over ${label} - the tree is too large to check for secret files; name the folders or exclude what it must not read. ${RULE}: approve it only if no env file or key sits under it.`,
  remote: (label) => `backend-guard: this command reaches another machine (${label}). ${RULE}: nothing the agent runs leaves the machine unasked - approve it only if you asked for exactly this, and check which host it is first.`,
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
function frozenAt(target, cwd) {
  const file = absolute(target, cwd);
  const dir = path.dirname(file);
  try {
    const tracked = git(dir, ['ls-files', '-z', '--full-name', '--', `${FOLD ? ':(icase)' : ''}${normalized(file)}`]).split('\0').filter((name) => name && isFrozenPath(`/${name}`));
    if (!tracked.length) return false;
    const ref = upstreamRef(dir);
    if (!ref) return true;
    const found = git(dir, ['cat-file', '--batch-check'], tracked.map((name) => `${ref}:${name}\n`).join(''));
    return found.split('\n').some((line) => line && !line.endsWith(' missing'));
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
    `Blocked by .claude/hooks/backend-guard.mjs: ${target} is a merged migration (FROZEN_PATHS) and this call would ${how} it. ${RULE}: other environments have already applied it - write a new migration instead. If it was never applied anywhere, the owner changes it.`,
  );
}

function checkRead(target) {
  if (typeof target === 'string' && target && isSecret(target)) secretRefusal(target, 'read');
}

function checkWrite(target, cwd) {
  if (typeof target !== 'string' || !target) return;
  if (isSecret(target)) secretRefusal(target, 'write');
  // The path test first: it is free, and git is then asked about migration files only.
  if (isFrozenPath(absolute(target, cwd)) && frozenAt(target, cwd)) frozenRefusal(target, 'edit');
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
  // What stood between two segments; a single `|` makes the second one read the first one's output (`piped`).
  let joint = '';
  const endSegment = (by = '') => {
    endWord();
    if (words.length) {
      words.piped = /^\)?\|$/.test(joint.replace(/\s/g, ''));
      segments.push(words);
      joint = '';
    }
    joint += by;
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
    } else if (ch === '\n' || ';&|()'.includes(ch)) endSegment(ch);
    else if (/\s/.test(ch) || ch === '<' || ch === '>') endWord();
    else {
      word += ch;
      started = true;
    }
  }
  endSegment();
  return segments;
}

// A glob as grep's --include / --exclude reads it, against a base name; one brace group is expanded. PowerShell
// and findstr match a name whatever its case ('i').
function globTest(glob, flags = '') {
  const brace = /^(.*)\{([^{}]*)\}(.*)$/.exec(glob);
  const forms = brace ? brace[2].split(',').map((part) => brace[1] + part + brace[3]) : [glob];
  const patterns = forms.map((form) => new RegExp(`^${form.replace(/[.+^$(){}|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, flags));
  return (name) => patterns.some((pattern) => pattern.test(name));
}

// The first secret file a search reads under the folder, breadth first, past node_modules and .git; at the entry
// cap, TOO_LARGE - whatever lies beyond it is unknown. The filters: `include` (a name must match one, when there is
// any), `name` (and this one), `exclude`, `excludeDir`, and `depth`, the folder levels below the first it reads.
const noFilters = () => ({ include: [], exclude: [], excludeDir: [], name: null, depth: Infinity });
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
      const type = value();
      filters.include.push(globTest(type === 'yaml' ? '*.{yaml,yml}' : `*.${type}`));
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
function checkSearch(words, names, reader, cwd, feed) {
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
  for (const { folder, filters } of walks) {
    const secret = secretUnder(absolute(folder, cwd), filters);
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

function checkSegment(words, shell, cwd, depth, feed) {
  const names = words.map(commandName);
  const headAt = names.findIndex((name, index) => !/^[A-Za-z_]\w*=/.test(words[index]) && !WRAPPERS.has(name));
  const head = names[headAt] ?? '';
  const text = words.join(' ');
  // The head keeps its spaces (a quoted path to the binary); so does PowerShell's -ArgumentList, the tool's own
  // words. A shell body is judged below, as a command of its own.
  const blank = (word, index) => /\s/.test(word) && (index !== headAt || /[\r\n]/.test(word)) && !/^-(?:ArgumentList|Args)$/i.test(words[index - 1] ?? '');
  const bareWords = words.map((word, index) => (blank(word, index) ? '_' : word));
  const bare = bareWords.join(' ');
  const scopes = { bare, sql: text.replace(/'[^']*'/g, "''"), words: bareWords };
  // `sls` is Select-String in PowerShell and the serverless CLI everywhere else.
  const quiet = QUIET.has(head) && !(head === 'sls' && /^(?:deploy|remove)$/i.test(words[headAt + 1] ?? ''));

  if (!quiet) {
    for (const { kind, label, scope, pattern, hint } of FORBIDDEN) {
      if (!pattern.test(scopes[scope])) continue;
      if (kind === 'data' || kind === 'reveal' || kind === 'remote') {
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
      for (const value of values) if (value && !value.startsWith('!') && reaches(value)) secretRefusal(value, 'print or copy');
    });
    checkSearch(words, names, reader, cwd, feed);
  }

  // `git show HEAD:.env` and `git diff -- .env` print the file as surely as `cat` does; `git log` only with a patch.
  if (head === 'git' && (names.some((name) => GIT_PRINTS.has(name)) || (names.includes('log') && words.some((word) => /^(?:-p|-u|--patch)$/.test(word))))) {
    words.forEach((word, index) => {
      const target = word.includes(':') ? word.slice(word.lastIndexOf(':') + 1) : word;
      if (!word.startsWith('-') && !GIT_VALUE.test(words[index - 1] ?? '') && target && isSecret(target)) secretRefusal(target, 'print');
    });
  }

  if (FROZEN_PATHS.length) {
    for (const word of removed(words, names)) {
      if (!word.startsWith('-') && frozenAt(word, cwd)) frozenRefusal(word, 'delete or move');
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

// The string literals of a piece of code: one that names a secret file is a read of it.
function checkCodeLiterals(code) {
  for (const [, , value] of code.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (value && reaches(value)) secretRefusal(value, 'read');
  }
}

function checkCommand(command, shell, cwd, depth) {
  const { outer, bodies } = withoutSubstitutions(depth === 0 ? withoutHeredocs(command) : command, shell);
  if (depth < MAX_DEPTH) for (const body of bodies) checkCommand(body, shell, cwd, depth + 1);
  noteDockerAssignments(outer);
  // A .NET file call reads or writes the path it names: `[IO.File]::ReadAllText('.env')`.
  for (const [call] of outer.matchAll(/\[(?:System\.)?IO\.File\]::\w+\s*\([^)]*\)/gi)) checkCodeLiterals(call);
  // `< file` feeds the file to whatever reads stdin; `<<` is a heredoc and `<(` a process substitution. A quoted
  // string with a space in it is a statement or a message, where `<` compares.
  const unquoted = outer.replace(/"[^"]*\s[^"]*"|'[^']*\s[^']*'/g, '""');
  for (const [, , target] of unquoted.matchAll(/(?<![<\w$&])<(?![<(&=])\s*(["']?)([^\s"'<>|;&()]+)\1/g)) {
    if (isSecret(target)) secretRefusal(target, 'read');
  }
  // What echo or printf pipes into a database client is its statement; into a shell, a command. PowerShell pipes
  // a bare quoted string the same way.
  for (const [, echoed, quoted, reader] of outer.matchAll(/(?:^|[\n;&|(])\s*(?:(?:echo|printf)\s([^|\n]*)|("[^"\n]*"|'[^'\n]*')\s*)\|([^|;&\n]*)/g)) {
    const body = echoed ?? quoted;
    checkStdinSql(reader, body);
    if (depth < MAX_DEPTH && SHELL_HEREDOC.test(reader)) checkCommand(body.trim().replace(/^(["'])(.*)\1$/s, '$2'), 'Bash', cwd, depth + 1);
  }
  const segments = segmentsOf(outer, shell);
  segments.forEach((words, index) => checkSegment(words, shell, cwd, depth, words.piped ? segments[index - 1] : undefined));
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
