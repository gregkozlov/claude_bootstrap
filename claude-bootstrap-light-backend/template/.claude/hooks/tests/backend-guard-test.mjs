// Self-test for backend-guard.mjs. Run from anywhere:
//   node .claude/hooks/tests/backend-guard-test.mjs
// Every line must read "ok". A case expects one of three outcomes: 0 (allow, nothing printed), 2 (refused) or
// 'ask' (exit 0 with a permissionDecision of "ask": the user is prompted). Three parts:
//   1. the built-in checks, against the installed hook as it stands - they hold whatever the project lists say;
//   2. the three project lists, against a copy of the hook with known values, in a throwaway git repo in the temp
//      directory (a frozen file is one on the upstream default branch, or with no remote one git tracks, so the
//      cases need commits and remote refs of their own, never ones in this tree);
//   3. the same copy with the lists unfilled: a missed fill protects nothing extra and breaks nothing; and misfilled:
//      a broken list empties itself only.
// Add the project's own cases at the marked place: one per entry of its three lists.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const installed = join(here, '..', 'backend-guard.mjs');
const root = resolve(here, '..', '..', '..');
const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const inRoot = (...parts) => [root, ...parts].join(BS);
const home = (...parts) => ['C:', 'Users', 'x', ...parts].join(BS);

const read = (file) => ({ tool_name: 'Read', tool_input: { file_path: file } });
const grep = (input) => ({ tool_name: 'Grep', tool_input: { pattern: 'KEY', ...input } });
const edit = (file) => ({ tool_name: 'Edit', tool_input: { file_path: file, old_string: 'a', new_string: 'b' } });
const multi = (file) => ({ tool_name: 'MultiEdit', tool_input: { file_path: file, edits: [{ old_string: 'a', new_string: 'b' }] } });
const write = (file) => ({ tool_name: 'Write', tool_input: { file_path: file, content: 'x' } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const pwsh = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
const raw = (text) => ({ raw: text });

const builtIn = [
  // Input the hook cannot use: it allows the call.
  ['empty stdin (allow)', 0, raw('')],
  ['stdin that is not JSON (allow)', 0, raw('not json')],
  ['a payload with no tool (allow)', 0, raw('{}')],
  ['an unknown tool (allow)', 0, { tool_name: 'Glob', tool_input: { pattern: '**/.env' } }],
  ['a command that is not a string (allow)', 0, { tool_name: 'Bash', tool_input: { command: 7 } }],

  // Secret files through the file tools.
  ['Read .env (deny)', 2, read(inRoot('.env'))],
  ['Read .env.production (deny)', 2, read(inRoot('deploy', '.env.production'))],
  ['Read .env-production (deny)', 2, read(inRoot('.env-production'))],
  ['Read prod.env (deny)', 2, read(inRoot('deploy', 'prod.env'))],
  ['Read .env.example (allow)', 0, read(inRoot('.env.example'))],
  ['Read .env.sample (allow)', 0, read(inRoot('.env.sample'))],
  ['Read .env.local.example (allow)', 0, read(inRoot('.env.local.example'))],
  ['Read example.env (allow)', 0, read(inRoot('deploy', 'example.env'))],
  ['Read a source file (allow)', 0, read(inRoot('app', 'settings.py'))],
  ['Read a private key (deny)', 2, read(inRoot('certs', 'server.key'))],
  ['Read a CA bundle (allow)', 0, read(inRoot('certs', 'ca.pem'))],
  ['Read a public key in pem form (allow)', 0, read(inRoot('keys', 'jwt_public.pem'))],
  ['Read cloud credentials outside the project (deny)', 2, read(home('.aws', 'credentials'))],
  ['Read a public ssh key (allow)', 0, read(home('.ssh', 'id_ed25519.pub'))],
  ['Read a private ssh key (deny)', 2, read(home('.ssh', 'id_ed25519'))],
  ['Read terraform state (deny)', 2, read(inRoot('infra', 'terraform.tfstate'))],
  ['Read a secrets file (deny)', 2, read(inRoot('config', 'secrets.yaml'))],
  ["Read a chart's secret template (allow)", 0, read(inRoot('chart', 'templates', 'secrets.yaml'))],
  ['Grep with the env file as path (deny)', 2, grep({ path: inRoot('.env') })],
  ['Grep with an env glob (deny)', 2, grep({ glob: '.env*' })],
  ['Grep with an env brace glob (deny)', 2, grep({ glob: '{.env,.env.local}' })],
  ['Grep over the source (allow)', 0, grep({ path: inRoot('app'), glob: '*.{py,toml}' })],
  ['Edit .env (deny)', 2, edit(inRoot('.env'))],
  ['MultiEdit .env (deny)', 2, multi(inRoot('.env'))],
  ['Write .env.local (deny)', 2, write(inRoot('.env.local'))],
  ['Write a key outside the project (deny)', 2, write(home('.ssh', 'id_rsa'))],
  ['Write .env.example (allow)', 0, write(inRoot('.env.example'))],
  ['Read the maven settings in the home folder (deny)', 2, read(home('.m2', 'settings.xml'))],
  ['Read the maven security settings (deny)', 2, read(home('.m2', 'settings-security.xml'))],
  ['Read the gradle properties in the home folder (deny)', 2, read(home('.gradle', 'gradle.properties'))],
  ["Read the project's gradle properties (allow)", 0, read(inRoot('gradle.properties'))],
  ['Read the npmrc in the home folder (deny)', 2, read(home('.npmrc'))],
  ['Read the yarnrc in the home folder (deny)', 2, read(['', 'home', 'dev', '.yarnrc.yml'].join('/'))],
  ["Read the project's npmrc (allow)", 0, read(inRoot('.npmrc'))],
  ['Read the NuGet config in AppData (deny)', 2, read(home('AppData', 'Roaming', 'NuGet', 'NuGet.Config'))],
  ["Read the project's NuGet config (allow)", 0, read(inRoot('NuGet.Config'))],
  ['Read a kubeconfig file (deny)', 2, read(inRoot('deploy', 'prod.kubeconfig'))],
  ['Read a kubeconfig yaml (deny)', 2, read(inRoot('kubeconfig-staging.yaml'))],
  ['Read the kube config in the home folder (deny)', 2, read(home('.kube', 'config'))],
  ['Read a source file about kubeconfigs (allow)', 0, read(inRoot('pkg', 'kubeconfig', 'kubeconfig.go'))],
  ['Read a class that loads kubeconfigs (allow)', 0, read(inRoot('src', 'KubeconfigLoader.java'))],
  ['Read an OAuth client secret (deny)', 2, read(inRoot('client_secret_123.apps.googleusercontent.com.json'))],
  ['Read the gcloud default credentials (deny)', 2, read(home('.config', 'gcloud', 'application_default_credentials.json'))],

  // Secret files from the shell.
  ['cat .env (deny)', 2, bash('cat .env')],
  ['cat .env.example (allow)', 0, bash('cat .env.example')],
  ['cat with a glob that reaches .env (deny)', 2, bash('cat .env*')],
  ['cp with a brace that reaches .env (deny)', 2, bash('cp .env{,.bak}')],
  ['grep for a key in .env (deny)', 2, bash('grep SECRET_KEY .env')],
  ['grep for the string .env in the source (allow)', 0, bash(`grep -n "${BS}.env" app/settings.py`)],
  ['grep with two expressions (allow)', 0, bash(`grep -n -e "dotenv" -e "${BS}.env" app/settings.py`)],
  ['grep that excludes the env file (allow)', 0, bash('grep -n TODO app/settings.py --exclude=.env')],
  ['rg that excludes key files (allow)', 0, bash("rg TODO -g '!*.pem'")],
  ['rg that excludes the env file, option and glob joined (allow)', 0, bash('rg TODO --glob=!.env')],
  ['rg scoped to the env files (deny)', 2, bash("rg KEY -g '.env*'")],
  ['yq reading a key named key (allow)', 0, bash("yq e '.tls.key' values.yaml")],
  ['ls -la .env (allow)', 0, bash('ls -la .env')],
  ['compose with an env file (allow)', 0, bash('docker compose --env-file .env up -d')],
  ['a reader after an env-file option (allow)', 0, bash('docker compose --env-file .env exec api cat /app/config.yml')],
  ['a reader of the env file after the option (deny)', 2, bash('docker compose --env-file .env exec api cat .env')],
  ['sourcing the env file (allow)', 0, bash('set -a; . ./.env; set +a')],
  ['cat .env inside a substitution (deny)', 2, bash('export $(cat .env | xargs)')],
  ['cat .env inside bash -c (deny)', 2, bash('bash -c "cat .env"')],
  ['echo that names the command (allow)', 0, bash('echo "then cat .env yourself"')],
  ['.env on stdin (deny)', 2, bash('python tools/load.py < .env')],
  ['find -exec cat on .env (deny)', 2, bash('find . -name .env -exec cat {} +')],
  ['find -exec cat on an env glob (deny)', 2, bash('find . -maxdepth 2 -name ".env*" -exec cat {} +')],
  ['sed -n over .env (deny)', 2, bash('sed -n 1,5p config/.env')],
  ['rev .env (deny)', 2, bash('rev .env')],
  ['dd if=.env (deny)', 2, bash('dd if=.env')],
  ['tar of the env file (deny)', 2, bash('tar cf - .env')],
  ['copying a key to the temp folder (deny)', 2, bash('cp certs/server.pem /tmp/server.pem')],
  ['making .env from the example (allow)', 0, bash('cp .env.example .env')],
  ['git show of a committed env file (deny)', 2, bash('git show HEAD:.env')],
  ['git diff of the env file (deny)', 2, bash('git diff -- .env')],
  ['git log --grep for the string .env (allow)', 0, bash(`git log --grep "${BS}.env" --oneline`)],
  ['git status of the env file (allow)', 0, bash('git status --short .env')],
  ['git log of the env file with no patch (allow)', 0, bash('git log --oneline -5 -- .env')],
  ['git log -p of the env file (deny)', 2, bash('git log -p -- .env')],
  ['a comparison inside a quoted statement (allow)', 0, bash('psql -d app -c "SELECT * FROM kv WHERE id < kv.key"')],
  ['Get-Content .env (deny)', 2, pwsh('Get-Content .env')],
  ['Get-Content .env.example (allow)', 0, pwsh('Get-Content .env.example')],
  ['Get-Content with a glob (deny)', 2, pwsh('Get-Content .env*')],
  ['Select-String -Path .env (deny)', 2, pwsh('Select-String -Path .env -Pattern KEY')],
  ['Get-Content with a backslash path (deny)', 2, pwsh(`Get-Content config${BS}.env`)],
  ['cmd /c type with a backslash path (deny)', 2, pwsh(`cmd /c "type config${BS}.env"`)],
  ['sls as Select-String (allow)', 0, pwsh('sls KEY app.log')],
  ['plain rg, which honours the ignore files (allow)', 0, bash('rg -n KEY')],
  ['file names piped into grep (allow)', 0, bash('find . -type f | grep KEY')],
  ['cat the maven settings (deny)', 2, bash('cat ~/.m2/settings.xml')],
  ['cat the npmrc in the home folder (deny)', 2, bash('cat ~/.npmrc')],
  ["cat the project's npmrc (allow)", 0, bash('cat .npmrc')],
  ['cat a file in the gcloud folder (deny)', 2, bash('cat ~/.config/gcloud/credentials.db')],
  ['compose config (deny)', 2, bash('docker compose config')],
  ['compose config behind a file option (deny)', 2, bash('docker compose -f compose.prod.yml config')],
  ['compose config --services (allow)', 0, bash('docker compose config --services')],
  ['compose config --volumes (allow)', 0, bash('docker compose -f compose.yml config --volumes')],
  ['kubectl get secret (ask)', 'ask', bash('kubectl get secret db -o yaml')],
  ['kubectl describe secrets, byte counts only (allow)', 0, bash('kubectl -n prod describe secrets')],
  ['kubectl get of a resource list with secrets as json (ask)', 'ask', bash('kubectl get configmap,secret -n prod -o json')],
  ['kubectl get secret with a jsonpath (ask)', 'ask', bash("kubectl get secret db -o jsonpath='{.data.password}'")],
  ['kubectl get secrets, names only (allow)', 0, bash('kubectl get secrets -n prod')],
  ['kubectl get secretstores (allow)', 0, bash('kubectl get secretstores')],
  ['aws secretsmanager get-secret-value (ask)', 'ask', bash('aws secretsmanager get-secret-value --secret-id prod/db')],
  ['aws secretsmanager list-secrets, names only (allow)', 0, bash('aws secretsmanager list-secrets')],
  ['aws ssm get-parameter with decryption (ask)', 'ask', bash('aws ssm get-parameter --name /prod/db-url --with-decryption')],
  ['aws ssm get-parameters with decryption (ask)', 'ask', bash('aws --profile prod ssm get-parameters --names /prod/db-url --with-decryption')],
  ['aws ssm get-parameter, no decryption (allow)', 0, bash('aws ssm get-parameter --name /prod/feature-flag')],
  ['gcloud secrets versions access (ask)', 'ask', bash('gcloud secrets versions access latest --secret db-password')],
  ['gcloud secrets list (allow)', 0, bash('gcloud secrets list')],
  ['az keyvault secret show (ask)', 'ask', bash('az keyvault secret show --vault-name v --name db-password')],
  ['az keyvault secret list (allow)', 0, bash('az keyvault secret list --vault-name v')],
  ['heroku config (ask)', 'ask', bash('heroku config -a api')],
  ['heroku config:get (ask)', 'ask', bash('heroku config:get DATABASE_URL -a api')],
  ['heroku config:set (deny)', 2, bash('heroku config:set LOG_LEVEL=debug -a api')],
  ['heroku apps (allow)', 0, bash('heroku apps')],
  ['compose convert (deny)', 2, bash('docker compose convert')],
  ['compose config over an example env file (allow)', 0, bash('docker compose --env-file .env.example config')],
  ['compose config over an example and a real env file (deny)', 2, bash('docker compose --env-file .env.example --env-file .env.prod config')],
  ['node -e reading .env (deny)', 2, bash(`node -e "console.log(require('fs').readFileSync('.env', 'utf8'))"`)],
  ['python -c reading .env (deny)', 2, bash(`python -c "print(open('.env').read())"`)],
  ['python -c reading the example file (allow)', 0, bash(`python -c "print(open('.env.example').read())"`)],
  ['node -e loading dotenv (allow)', 0, bash(`node -e "require('dotenv').config()"`)],
  ['a .NET ReadAllText of .env (deny)', 2, pwsh(`[IO.File]::ReadAllText('.env')`)],
  ['a .NET ReadAllLines of a key (deny)', 2, pwsh(`[System.IO.File]::ReadAllLines("certs${BS}server.key")`)],

  // Deploys and infrastructure.
  ['kubectl delete (deny)', 2, bash('kubectl -n prod delete pod api-1')],
  ['kubectl get (allow)', 0, bash('kubectl get pods -n prod')],
  ['kubectl logs (allow)', 0, bash('kubectl logs deploy/api --tail 50')],
  ['kubectl auth can-i (allow)', 0, bash('kubectl auth can-i delete pods -n prod')],
  ['kubectl apply as a dry run (allow)', 0, bash('kubectl apply -f k8s/ --dry-run=client')],
  ['kubectl apply to a local cluster (allow)', 0, bash('kubectl --context kind-dev apply -f k8s/dev')],
  ['kubectl by full path (deny)', 2, pwsh(`& "C:${BS}tools${BS}kubectl.exe" rollout restart deploy/api`)],
  ['terraform plan (allow)', 0, bash('terraform plan -out plan.bin')],
  ['terraform apply (deny)', 2, bash('terraform apply -auto-approve')],
  ['terraform destroy inside bash -c (deny)', 2, bash('bash -c "terraform destroy"')],
  ['helm upgrade (deny)', 2, bash('helm -n prod upgrade api ./chart')],
  ['helm template (allow)', 0, bash('helm template api ./chart')],
  ['helm diff upgrade (allow)', 0, bash('helm diff upgrade api ./chart')],
  ['pulumi up (deny)', 2, bash('pulumi up --yes')],
  ['ansible-playbook (deny)', 2, bash('ansible-playbook site.yml -i prod')],
  ['ansible-playbook --check (allow)', 0, bash('ansible-playbook site.yml --check')],
  ['ansible-playbook --version (allow)', 0, bash('ansible-playbook --version')],
  ['aws s3 rm (deny)', 2, bash('aws s3 rm s3://bucket/key')],
  ['aws terminate-instances (deny)', 2, bash('aws ec2 terminate-instances --instance-ids i-1')],
  ['aws lambda invoke (deny)', 2, bash('aws lambda invoke --function-name x out.json')],
  ['aws sns publish (deny)', 2, bash('aws sns publish --topic-arn arn --message hi')],
  ['aws s3 upload (deny)', 2, bash('aws s3 cp ./build s3://prod-bucket/ --recursive')],
  ['aws s3 download (allow)', 0, bash('aws s3 cp s3://bucket/key ./local')],
  ['aws s3 sync down (allow)', 0, bash('aws s3 sync s3://bucket ./local')],
  ['aws s3 ls (allow)', 0, bash('aws s3 ls')],
  ['aws logs tail (allow)', 0, bash('aws logs tail /app/api')],
  ['aws logs start-query (allow)', 0, bash('aws logs start-query --log-group-name /app --query-string "fields @message"')],
  ['aws eks update-kubeconfig (allow)', 0, bash('aws eks update-kubeconfig --name dev')],
  ['aws against a local emulator (allow)', 0, bash('aws --endpoint-url http://localhost:4566 s3 mb s3://test-bucket')],
  ['aws against a host that only starts with localhost (deny)', 2, bash('aws --endpoint-url http://localhost.elsewhere.test s3 rm s3://bucket/key')],
  ['gcloud run deploy (deny)', 2, bash('gcloud run deploy api --source .')],
  ['gcloud emulator (allow)', 0, bash('gcloud beta emulators pubsub start --project=test')],
  ['gcloud components update (allow)', 0, bash('gcloud components update')],
  ['kamal deploy (deny)', 2, bash('kamal deploy')],
  ['capistrano deploy (deny)', 2, bash('bundle exec cap production deploy')],
  ['eb deploy (deny)', 2, bash('eb deploy')],
  ['azd up (deny)', 2, bash('azd up')],
  ['cf push (deny)', 2, bash('cf push')],
  ['sls deploy (deny)', 2, bash('sls deploy --stage prod')],
  ['npx sls deploy (deny)', 2, bash('npx sls deploy')],
  ['fly launch (deny)', 2, bash('fly launch')],
  ['bare vercel (deny)', 2, bash('npx vercel')],
  ['vercel build (allow)', 0, bash('npx vercel build --prod')],
  ['installing the vercel package (allow)', 0, bash('npm install vercel')],
  ['installing firebase for production (allow)', 0, bash('npm install firebase --prod')],
  ['heroku container:release (deny)', 2, bash('heroku container:release web')],
  ['docker stack deploy behind a context (deny)', 2, bash('docker --context prod stack deploy -c stack.yml api')],
  ['a remote command over ssh (deny)', 2, bash('ssh staging "kubectl scale deploy/api --replicas 0"')],
  ['kubectl get with a namespace named run (allow)', 0, bash('kubectl get pods -n run')],
  ['kubectl config use-context (deny)', 2, bash('kubectl config use-context prod')],
  ['aws get-function of a function named create-order (allow)', 0, bash('aws lambda get-function --function-name create-order')],
  ['aws write after global options (deny)', 2, bash('aws --region eu-west-1 --profile prod ec2 terminate-instances --instance-ids i-1')],
  ['skaffold dev, naming the local retry (deny)', 2, bash('skaffold dev'), /--kube-context kind-/],
  ['export DOCKER_HOST over ssh, then compose up (deny)', 2, bash('export DOCKER_HOST=ssh://prod; docker compose up -d')],
  ['$env:DOCKER_HOST over ssh, then compose up (deny)', 2, pwsh('$env:DOCKER_HOST = "ssh://prod"; docker compose up -d')],
  ['export DOCKER_HOST over ssh, then ps (allow)', 0, bash('export DOCKER_HOST=ssh://prod && docker ps')],
  ['dotnet msbuild deploying on build (deny)', 2, bash('dotnet msbuild /p:DeployOnBuild=true /p:PublishProfile=Production')],
  ['dotnet msbuild with a folder profile (allow)', 0, bash('dotnet msbuild /p:DeployOnBuild=true /p:PublishProfile=FolderProfile')],
  ['az acr run (deny)', 2, bash('az acr run -r myreg -f task.yaml .')],
  ['ssh -T to a git host (allow)', 0, bash('ssh -T git@git.example.org')],
  ['skaffold dev on a local cluster (allow)', 0, bash('skaffold dev --kube-context minikube')],
  ['az acr build (deny)', 2, bash('az acr build -r myreg -t api:1 .')],
  ['docker -H over ssh with compose up (deny)', 2, bash('docker -H ssh://deploy@prod compose up -d')],
  ['DOCKER_HOST over ssh with compose up (deny)', 2, bash('DOCKER_HOST=ssh://prod docker compose up -d')],
  ['docker run in a remote context (deny)', 2, bash('docker --context prod run --rm api migrate')],
  ['docker logs on another host (allow)', 0, bash('docker -H ssh://prod logs api --tail 50')],
  ['docker compose up in the default context (allow)', 0, bash('docker --context default compose up -d')],
  ['DOCKER_HOST on localhost (allow)', 0, bash('DOCKER_HOST=tcp://localhost:2375 docker compose up -d')],
  ['dotnet publish with a publish profile (deny)', 2, pwsh('dotnet publish -c Release -p:PublishProfile=Production')],
  ['dotnet publish with a web publish method (deny)', 2, bash('dotnet publish /p:WebPublishMethod=MSDeploy')],
  ['dotnet publish to a folder profile (allow)', 0, pwsh('dotnet publish -p:PublishProfile=FolderProfile')],
  ['dotnet publish to an output folder (allow)', 0, bash('dotnet publish -c Release -o out')],
  ['ssh that restarts a service on another host (ask)', 'ask', bash('ssh prod "sudo systemctl restart api"')],
  ['ssh that reads a log on another host (ask)', 'ask', bash('ssh -i ~/.ssh/deploy.pub deploy@prod cat /var/log/api.log')],
  ['ssh to localhost (allow)', 0, bash('ssh -p 2222 localhost uptime')],
  ['scp to another host (ask)', 'ask', bash('scp build/app.jar deploy@prod:/opt/app/')],
  ['scp from a drive letter to localhost (allow)', 0, pwsh('scp C:/build/app.jar 127.0.0.1:/tmp/')],
  ['rsync to another host (ask)', 'ask', bash('rsync -avz -e ssh dist/ deploy@prod:/srv/app')],
  ['rsync between local folders (allow)', 0, bash('rsync -av src/ /tmp/backup/')],
  ['sftp to another host (ask)', 'ask', bash('sftp -P 2222 deploy@prod')],
  ['kubectl apply, naming the local retry (deny)', 2, bash('kubectl apply -f k8s/dev'), /--context kind-/],
  ['helm upgrade, naming the local retry (deny)', 2, bash('helm upgrade --install api ./chart'), /--kube-context kind-/],
  ['helm upgrade on a local cluster (allow)', 0, bash('helm --kube-context kind-dev upgrade --install api ./chart')],
  ['kubectl config use-context to a local cluster (allow)', 0, bash('kubectl config use-context kind-dev')],
  ['kubectl config use-context to minikube (allow)', 0, bash('kubectl config use-context minikube')],
  ['aws s3 copy between buckets (deny)', 2, bash('aws s3 cp s3://staging-bucket/app.zip s3://prod-bucket/app.zip')],
  ['aws s3 sync between buckets (deny)', 2, bash('aws s3 sync s3://staging-bucket s3://prod-bucket')],
  ['aws s3 copy between buckets on a local emulator (allow)', 0, bash('aws --endpoint-url http://localhost:4566 s3 cp s3://a/k s3://b/k')],
  ['aws s3 upload behind an option with a value (deny)', 2, bash('aws s3 cp ./build --acl public-read s3://prod-bucket/')],
  ['aws autoscaling set-desired-capacity (deny)', 2, bash('aws autoscaling set-desired-capacity --auto-scaling-group-name api --desired-capacity 0')],
  ['aws route53 change-resource-record-sets (deny)', 2, bash('aws route53 change-resource-record-sets --hosted-zone-id Z1 --change-batch file://c.json')],
  ['aws cognito-idp admin-delete-user (deny)', 2, bash('aws cognito-idp admin-delete-user --user-pool-id p --username u')],
  ['aws cognito-idp admin-get-user (allow)', 0, bash('aws cognito-idp admin-get-user --user-pool-id p --username u')],
  ['aws lambda add-permission (deny)', 2, bash('aws lambda add-permission --function-name api --statement-id s')],
  ['aws batch submit-job (deny)', 2, bash('aws batch submit-job --job-name j --job-queue q --job-definition d')],
  ['aws events disable-rule (deny)', 2, bash('aws events disable-rule --name nightly')],
  ['aws sts get-caller-identity (allow)', 0, bash('aws sts get-caller-identity')],
  ['aws ec2 describe-instances (allow)', 0, bash('aws ec2 describe-instances --filters Name=tag:env,Values=dev')],
  ['aws configure set, a local setting (allow)', 0, bash('aws configure set region eu-west-1')],
  ['aws set-queue-attributes on a local emulator (allow)', 0, bash('aws --endpoint-url http://localhost:4566 sqs set-queue-attributes --queue-url u --attributes a=b')],
  ['gcloud run services update-traffic (deny)', 2, bash('gcloud run services update-traffic api --to-latest')],
  ['gcloud run jobs execute (deny)', 2, bash('gcloud run jobs execute migrate')],
  ['gcloud pubsub topics publish (deny)', 2, bash('gcloud pubsub topics publish orders --message hi')],
  ['gcloud sql instances patch (deny)', 2, bash('gcloud sql instances patch main --tier db-f1-micro')],
  ['gcloud storage upload (deny)', 2, bash('gcloud storage cp ./build/app.zip gs://prod-bucket/')],
  ['gcloud storage rm (deny)', 2, bash('gcloud storage rm gs://prod-bucket/app.zip')],
  ['gcloud storage download (allow)', 0, bash('gcloud storage cp gs://prod-bucket/app.zip ./app.zip')],
  ['gcloud compute instances list (allow)', 0, bash('gcloud compute instances list')],
  ['gcloud run services describe (allow)', 0, bash('gcloud run services describe api')],
  ['gcloud config set (allow)', 0, bash('gcloud config set project demo')],
  ['gsutil upload (deny)', 2, bash('gsutil -m cp -r ./build gs://prod-bucket/')],
  ['gsutil rm (deny)', 2, bash('gsutil rm -r gs://prod-bucket/old')],
  ['gsutil ls (allow)', 0, bash('gsutil ls gs://prod-bucket')],
  ['gsutil download (allow)', 0, bash('gsutil cp gs://prod-bucket/app.zip ./app.zip')],
  ['az webapp zip deploy (deny)', 2, bash('az webapp deployment source config-zip -g rg -n api --src app.zip')],
  ['az functionapp zip deploy (deny)', 2, bash('az functionapp deployment source config-zip -g rg -n fn --src fn.zip')],
  ['az webapp slot swap (deny)', 2, bash('az webapp deployment slot swap -g rg -n api --slot staging')],
  ['az aks scale (deny)', 2, bash('az aks scale -g rg -n cluster --node-count 1')],
  ['az webapp list (allow)', 0, bash('az webapp list -g rg')],
  ['az webapp show (allow)', 0, bash('az webapp show -g rg -n api')],
  ['az account show (allow)', 0, bash('az account show')],
  ['azcopy upload (deny)', 2, bash('azcopy copy ./dist https://localhost.elsewhere.test/web --recursive')],
  ['azcopy remove (deny)', 2, bash('azcopy remove https://localhost.elsewhere.test/web/old --recursive')],
  ['azcopy download (allow)', 0, bash('azcopy copy https://localhost.elsewhere.test/web/a.txt ./a.txt')],
  ['azcopy upload to a local emulator (allow)', 0, bash('azcopy copy ./dist http://127.0.0.1:10000/devstoreaccount1/web --recursive')],
  ['azcopy list (allow)', 0, bash('azcopy list https://localhost.elsewhere.test/web')],

  // Publishing.
  ['docker push (deny)', 2, bash('docker push registry.local/api:1')],
  ['docker push to a registry on localhost (allow)', 0, bash('docker push localhost:5000/api:dev')],
  ['docker-compose push (deny)', 2, bash('docker-compose push')],
  ['docker build (allow)', 0, bash('docker build -t api .')],
  ['buildx --push (deny)', 2, bash('docker buildx build --push -t ghcr.io/acme/api .')],
  ['buildx --push to a registry on localhost (allow)', 0, bash('docker buildx build --push -t localhost:5000/api .')],
  ['buildx --push to localhost and a remote tag (deny)', 2, bash('docker buildx build --push -t localhost:5000/api -t ghcr.io/acme/api .')],
  ['gradlew jib (deny)', 2, bash('./gradlew jib')],
  ['gradlew jib of a subproject (deny)', 2, bash('./gradlew :api:jib')],
  ['gradlew jibDockerBuild (allow)', 0, bash('./gradlew jibDockerBuild')],
  ['mvn jib:build (deny)', 2, bash('mvn compile jib:build')],
  ['mvn jib:dockerBuild (allow)', 0, bash('mvn compile jib:dockerBuild')],
  ['mvn jib:build to a registry on localhost (allow)', 0, bash('mvn compile jib:build -Dimage=localhost:5000/app')],
  ['gradlew jib to a registry on localhost (allow)', 0, bash('./gradlew jib -Djib.to.image=localhost:5000/api')],
  ['crane delete (deny)', 2, bash('crane delete registry.example.com/api:1')],
  ['crane tag on a registry on localhost (allow)', 0, bash('crane tag localhost:5000/api:1 v2')],
  ['skopeo sync to a registry (deny)', 2, bash('skopeo sync --src docker --dest docker quay.io/acme/api registry.example.com/mirror')],
  ['skopeo sync into a folder (allow)', 0, bash('skopeo sync --src docker --dest dir quay.io/acme/api /tmp/mirror')],
  ['skopeo delete (deny)', 2, bash('skopeo delete docker://quay.io/acme/api:1')],
  ['buildah manifest push (deny)', 2, bash('buildah manifest push --all api docker://quay.io/acme/api')],
  ['oras attach (deny)', 2, bash('oras attach registry.example.com/api:1 --artifact-type sig sig.json')],
  ['oras cp (deny)', 2, bash('oras cp registry.example.com/api:1 ghcr.io/acme/api:1')],
  ['gradlew bootBuildImage --publishImage (deny)', 2, bash('./gradlew bootBuildImage --publishImage')],
  ['gradlew bootBuildImage (allow)', 0, bash('./gradlew bootBuildImage')],
  ['mvnw spring-boot:build-image with publish (deny)', 2, bash('./mvnw spring-boot:build-image -Dspring-boot.build-image.publish=true')],
  ['mvnw spring-boot:build-image (allow)', 0, bash('./mvnw spring-boot:build-image')],
  ['ko build (deny)', 2, bash('ko build ./cmd/api')],
  ['ko build --local (allow)', 0, bash('ko build --local ./cmd/api')],
  ['ko apply -L (allow)', 0, bash('ko apply -L -f config/')],
  ['ko resolve into ko.local (allow)', 0, bash('KO_DOCKER_REPO=ko.local ko resolve -f config/')],
  ['crane push (deny)', 2, bash('crane push api.tar registry.example.com/api:1')],
  ['crane copy into a registry on localhost (allow)', 0, bash('crane copy registry.example.com/api:1 localhost:5000/api:1')],
  ['buildah push (deny)', 2, bash('buildah push registry.example.com/api:1')],
  ['buildah push of a local image to a registry (deny)', 2, bash('buildah push localhost/api docker://quay.io/acme/api')],
  ['buildah push into the local daemon (allow)', 0, bash('buildah push api docker-daemon:api:dev')],
  ['skopeo copy to a registry (deny)', 2, bash('skopeo copy docker-archive:api.tar docker://quay.io/acme/api:1')],
  ['skopeo copy into a local folder (allow)', 0, bash('skopeo copy docker://quay.io/acme/api:1 dir:/tmp/api')],
  ['oras push (deny)', 2, bash('oras push registry.example.com/api:1 notes.txt')],
  ['oras push to a registry on localhost (allow)', 0, bash('oras push localhost:5000/api:1 notes.txt')],
  ['compose logs of a service named push (allow)', 0, bash('docker compose logs -f push')],
  ['npm publish (deny)', 2, bash('npm publish')],
  ['npm publish as a dry run (allow)', 0, bash('npm publish --dry-run')],
  ['npm test with a publish filter (allow)', 0, bash('npm test -- publish')],
  ['lerna publish (deny)', 2, bash('npx lerna publish')],
  ['semantic-release (deny)', 2, bash('npx semantic-release')],
  ['twine upload (deny)', 2, bash('python -m twine upload dist/*')],
  ['poetry publish (deny)', 2, bash('poetry publish --build')],
  ['pytest with a publish filter (allow)', 0, bash('uv run pytest -k "publish and not slow"')],
  ['cargo publish (deny)', 2, bash('cargo publish')],
  ['cargo test with a push filter (allow)', 0, bash('cargo test push')],
  ['cargo run of a binary named publish (allow)', 0, bash('cargo run --bin publish')],
  ['gradlew publish (deny)', 2, bash('./gradlew publish')],
  ['gradlew publishToMavenLocal (allow)', 0, bash('./gradlew publishToMavenLocal')],
  ['gradlew test of a class named Publish (allow)', 0, bash('./gradlew test --tests PublishServiceTest')],
  ['mvnw deploy (deny)', 2, bash('./mvnw -B deploy')],
  ['mvn verify (allow)', 0, bash('mvn -B verify')],
  ['sbt publish (deny)', 2, bash('sbt publish')],
  ['sbt publishLocal (allow)', 0, bash('sbt publishLocal')],
  ['bare goreleaser (deny)', 2, bash('goreleaser')],
  ['goreleaser snapshot (allow)', 0, bash('goreleaser release --snapshot --clean')],

  // Data loss: never refused, the user is asked.
  ['compose down (allow)', 0, bash('docker compose down')],
  ['compose down -v (ask)', 'ask', bash('docker compose down -v')],
  ['compose down -v as a dry run (ask)', 'ask', bash('docker compose --dry-run down -v')],
  ['docker-compose down --volumes (ask)', 'ask', bash('docker-compose -f dev.yml down --volumes')],
  ['podman compose down -v (ask)', 'ask', bash('podman compose down -v')],
  ['compose run with a bind mount and a step down (allow)', 0, bash('docker compose run --rm -v $(pwd)/migrations:/migrations migrate -path=/migrations -database "$DB" down 1')],
  ['docker system prune (ask)', 'ask', bash('docker system prune -af')],
  ['psql DROP TABLE (ask)', 'ask', bash('psql -d app -c "DROP TABLE users"')],
  ['psql DROP COLUMN (ask)', 'ask', bash('psql -d app -c "ALTER TABLE users DROP COLUMN email"')],
  ['psql SELECT (allow)', 0, bash('psql -d app -c "SELECT count(*) FROM users"')],
  ['psql SELECT of a literal that names a statement (allow)', 0, bash(`psql -d app -c "SELECT * FROM audit WHERE action = 'TRUNCATE'"`)],
  ['psql DELETE with no WHERE (ask)', 'ask', bash('psql -d app -c "DELETE FROM users"')],
  ['psql DELETE with a WHERE (allow)', 0, bash('psql -d app -c "DELETE FROM users WHERE id = 1"')],
  ['psql UPDATE with an alias and no WHERE (ask)', 'ask', bash('psql -d app -c "UPDATE users u SET active = false"')],
  ['psql through compose exec (ask)', 'ask', bash('docker compose exec db psql -U app -c "TRUNCATE orders"')],
  ['SQL piped into psql (ask)', 'ask', bash('echo "DROP TABLE users;" | psql -d app')],
  ['a SELECT piped into psql (allow)', 0, bash('echo "select 1" | psql -d app')],
  ['a PowerShell string piped into psql (ask)', 'ask', pwsh('"DROP TABLE users;" | psql -d app')],
  ['a single-quoted string piped into psql in a container (ask)', 'ask', pwsh("'TRUNCATE orders' | docker compose exec -T db psql -U app")],
  ['a PowerShell SELECT string piped into psql (allow)', 0, pwsh('"select 1" | psql -d app')],
  ['a PowerShell string piped to the clipboard (allow)', 0, pwsh('"DROP TABLE users;" | Set-Clipboard')],
  ['SQL in a heredoc psql reads (ask)', 'ask', bash(['psql -d app <<SQL', 'DROP TABLE users;', 'SQL'].join(NL))],
  ['a mysql URL in the environment (allow)', 0, bash('DATABASE_URL=mysql://root@localhost/test php artisan test --filter truncate')],
  ['dropdb (ask)', 'ask', bash('dropdb app_test')],
  ['redis-cli FLUSHALL (ask)', 'ask', bash('redis-cli FLUSHALL')],
  ['prisma migrate reset (ask)', 'ask', bash('npx prisma migrate reset --force')],
  ['prisma migrate dev (allow)', 0, bash('npx prisma migrate dev --name add_status')],
  ['artisan migrate:fresh (ask)', 'ask', bash('php artisan migrate:fresh --seed')],
  ['artisan migrate (allow)', 0, bash('php artisan migrate')],
  ['manage.py flush (ask)', 'ask', bash('python manage.py flush --no-input')],
  ['django-admin flush (ask)', 'ask', bash('django-admin flush')],
  ['manage.py sqlflush, which only prints (allow)', 0, bash('python manage.py sqlflush')],
  ['manage.py migrate (allow)', 0, bash('python manage.py migrate')],
  ['manage.py migrate to zero (ask)', 'ask', bash('python manage.py migrate --settings=config.test orders zero')],
  ['alembic downgrade base (ask)', 'ask', bash('alembic downgrade base')],
  ['flask db downgrade base (ask)', 'ask', bash('flask db downgrade base')],
  ['alembic downgrade by one (allow)', 0, bash('alembic downgrade -1')],
  ['alembic upgrade head (allow)', 0, bash('alembic upgrade head')],
  ['a migration message that says drop (allow)', 0, bash('flask db migrate -m "drop unused column"')],
  ['a migration message that says push (allow)', 0, bash('docker compose exec api alembic revision --autogenerate -m "add push subscriptions table"')],
  ['rails db:reset (ask)', 'ask', bash('bundle exec rails db:reset')],
  ['rails db:migrate to version 0 (ask)', 'ask', bash('bin/rails db:migrate VERSION=0')],
  ['rails db:migrate (allow)', 0, bash('bin/rails db:migrate')],
  ['dotnet ef database drop (ask)', 'ask', pwsh('dotnet ef database drop --force')],
  ['dotnet ef database update 0 (ask)', 'ask', pwsh('dotnet ef database update 0')],
  ['dotnet ef database update (allow)', 0, pwsh('dotnet ef database update')],
  ['flyway clean (ask)', 'ask', bash('flyway -url=jdbc:h2:mem:x clean')],
  ['a maven module named flyway (allow)', 0, bash('mvn -pl flyway clean install')],
  ['golang-migrate down -all (ask)', 'ask', bash('migrate -path db/migrations -database "$DATABASE_URL" down -all')],
  ['golang-migrate down by one (allow)', 0, bash('migrate -path db/migrations -database "$DATABASE_URL" down 1')],
  ['goose down-to 0 (ask)', 'ask', bash('goose down-to 0')],
  ['supabase db reset (ask)', 'ask', bash('supabase db reset')],
  ['a refusal beside a question (deny)', 2, bash('psql -d app -c "DROP TABLE users" && terraform apply')],

  // A rollback past one step, or to a target the hook cannot size; one step back is the edit-and-retry loop.
  ['alembic downgrade two steps (ask)', 'ask', bash('alembic downgrade -2')],
  ['alembic downgrade to a named revision (ask)', 'ask', bash('alembic downgrade 1975ea83b712')],
  ['flask db downgrade, one step by default (allow)', 0, bash('flask db downgrade')],
  ['dotnet ef database update to a named migration (ask)', 'ask', pwsh('dotnet ef database update InitialCreate')],
  ['dotnet ef database update with an option only (allow)', 0, pwsh('dotnet ef database update --context AppDb')],
  ['rails db:rollback by one (allow)', 0, bash('bin/rails db:rollback')],
  ['rails db:rollback three steps (ask)', 'ask', bash('bin/rails db:rollback STEP=3')],
  ['rails db:migrate to a version (ask)', 'ask', bash('bin/rails db:migrate VERSION=20240101000000')],
  ['manage.py migrate to a named migration (ask)', 'ask', bash('python manage.py migrate orders 0003_add_status')],
  ['manage.py migrate one app (allow)', 0, bash('python manage.py migrate orders')],
  ['golang-migrate bare down, which runs them all (ask)', 'ask', bash('migrate -path db/migrations -database "$DATABASE_URL" down')],
  ['golang-migrate down by three (ask)', 'ask', bash('migrate -path db/migrations -database "$DATABASE_URL" down 3')],
  ['goose down by one (allow)', 0, bash('goose down')],
  ['goose down-to a version (ask)', 'ask', bash('goose down-to 20240101')],
  ['ecto.rollback by one (allow)', 0, bash('mix ecto.rollback')],
  ['ecto.rollback three steps (ask)', 'ask', bash('mix ecto.rollback --step 3')],
  ['liquibase rollback-count (ask)', 'ask', bash('liquibase rollback-count 2')],
  ['liquibase rollback-sql, which only prints (allow)', 0, bash('liquibase rollback-sql v1')],
  ['sequelize undo down to a migration (ask)', 'ask', bash('npx sequelize-cli db:migrate:undo --to 20240101-create-user.js')],
  ['sequelize undo of one (allow)', 0, bash('npx sequelize-cli db:migrate:undo')],
  // A redirection is not a target: the forward and the one-step commands pass with their output piped or logged.
  ['dotnet ef database update with stderr joined and piped (allow)', 0, bash('dotnet ef database update 2>&1 | tail -20')],
  ['dotnet ef database update into a log file (allow)', 0, pwsh('dotnet ef database update *> ef.log')],
  ['flask db downgrade with stderr joined (allow)', 0, bash('flask db downgrade 2>&1')],
  ['manage.py migrate one app into a log file (allow)', 0, bash('python manage.py migrate orders > migrate.log')],
  ['alembic downgrade two steps into a log file (ask)', 'ask', bash('alembic downgrade -2 > downgrade.log 2>&1')],
  ['dotnet ef database update, a flag with no value before the target (ask)', 'ask', pwsh('dotnet ef database update --no-build InitialCreate')],
  ["dotnet ef database update, the app's own arguments after -- (allow)", 0, pwsh('dotnet ef database update -- --environment Development')],
  ['rails db:rollback, STEP after another variable (ask)', 'ask', bash('bin/rails db:rollback RAILS_ENV=test STEP=3')],
  ['rails db:rollback, STEP before the command (ask)', 'ask', bash('STEP=3 bin/rails db:rollback')],
  ['rails db:migrate:redo three steps (ask)', 'ask', bash('bin/rails db:migrate:redo STEP=3')],
  ['golang-migrate goto a version (ask)', 'ask', bash('migrate -path db/migrations -database "$DATABASE_URL" goto 3')],
  ['golang-migrate down by one (allow)', 0, bash('migrate -path db/migrations -database "$DATABASE_URL" down 1')],
  ['a package script named migrate (allow)', 0, bash('npm run migrate down')],
  ['compose down with the profile joined by = (allow)', 0, bash('docker compose --profile=migrate down')],
  ['liquibase rollback-count of one (allow)', 0, bash('liquibase rollback-count 1')],
  ['maven liquibase:rollback by three (ask)', 'ask', bash('mvn liquibase:rollback -Dliquibase.rollbackCount=3')],
  ['maven liquibase:rollback by one (allow)', 0, bash('mvn liquibase:rollback -Dliquibase.rollbackCount=1')],
  ['gradle rollbackCount by three (ask)', 'ask', bash('./gradlew rollbackCount -PliquibaseCommandValue=3')],
  ['gradle rollbackSql, which only prints (allow)', 0, bash('./gradlew rollbackSql -PliquibaseCommandValue=v1')],

  // Rewriting the record of which migrations ran.
  ['alembic stamp (ask)', 'ask', bash('alembic stamp head')],
  ['flask db stamp (ask)', 'ask', bash('flask db stamp head')],
  ['flyway repair (ask)', 'ask', bash('flyway -url=jdbc:h2:mem:x repair')],
  ['gradle flywayRepair (ask)', 'ask', bash('./gradlew flywayRepair')],
  ['dotnet ef migrations remove (ask)', 'ask', pwsh('dotnet ef migrations remove')],
  ['dotnet ef migrations add (allow)', 0, pwsh('dotnet ef migrations add AddStatus')],
  ['prisma migrate resolve (ask)', 'ask', bash('npx prisma migrate resolve --applied 20240101_init')],
  ['maven liquibase:changelogSync (ask)', 'ask', bash('mvn liquibase:changelogSync')],
  ['gradle changelogSync (ask)', 'ask', bash('./gradlew changelogSync')],
  ['gradle changelogSyncSql, which only prints (allow)', 0, bash('./gradlew changelogSyncSql')],
  ['liquibase clear-checksums (ask)', 'ask', bash('liquibase clear-checksums')],

  // A tunnel to a database somewhere else, and a client pointed at another host by its own words.
  ['kubectl port-forward (ask)', 'ask', bash('kubectl port-forward svc/postgres 5432:5432')],
  ['kubectl port-forward on a named remote context (ask)', 'ask', bash('kubectl --context prod-eu port-forward svc/postgres 5432:5432')],
  ['kubectl port-forward on a kind cluster (allow)', 0, bash('kubectl --context kind-dev port-forward svc/postgres 5432:5432')],
  ['gcloud sql connect (ask)', 'ask', bash('gcloud sql connect prod-db --user=app')],
  ['cloud-sql-proxy (ask)', 'ask', bash('cloud-sql-proxy my-project:europe-west1:prod-db')],
  ['az postgres flexible-server connect (ask)', 'ask', pwsh('az postgres flexible-server connect -n prod-db -u app')],
  ['heroku pg:psql (ask)', 'ask', bash('heroku pg:psql -a app')],
  ['fly proxy (ask)', 'ask', bash('fly proxy 5432 -a app-db')],
  ['psql to another host (ask)', 'ask', bash('psql -h db.prod.internal -U app -d app')],
  ['psql to localhost (allow)', 0, bash('psql -h localhost -U app -d app')],
  ['psql with a URL to another host (ask)', 'ask', bash('psql postgresql://db.prod.internal:5432/app')],
  ['psql with a local URL (allow)', 0, bash('psql postgresql://127.0.0.1:5432/app')],
  ['psql with PGHOST set to another host (ask)', 'ask', bash('PGHOST=db.prod.internal psql -d app')],
  ['psql in single-line mode, no host (allow)', 0, bash('psql -S -d app -c "SELECT 1"')],
  ['mysql with a joined host (ask)', 'ask', bash('mysql -hdb.staging.internal -u app app')],
  ['mysql over a socket (allow)', 0, bash('mysql -S /var/run/mysqld/mysqld.sock -u app')],
  ['sqlcmd to another server (ask)', 'ask', pwsh('sqlcmd -S tcp:sql.prod.internal,1433 -d app -Q "SELECT 1"')],
  ['sqlcmd to the local server (allow)', 0, pwsh('sqlcmd -S localhost -d app -Q "SELECT 1"')],
  ['redis-cli to another host (ask)', 'ask', bash('redis-cli -h cache.prod.internal')],
  ['psql inside a compose container (allow)', 0, bash('docker compose exec db psql -h db -U app')],
  ['psql with a connection string to another host (ask)', 'ask', bash('psql "host=db.prod.internal port=5432 dbname=app user=app sslmode=require"')],
  ['psql with a local connection string (allow)', 0, bash('psql "host=localhost dbname=app"')],
  ['pg_dump with a connection string as its database (ask)', 'ask', bash('pg_dump -d "host=db.prod.internal dbname=app"')],
  ['psql with a variable named host (allow)', 0, bash('psql -v host=web1 -d app')],
  ['psql after an exported PGHOST (ask)', 'ask', bash('export PGHOST=db.prod.internal && psql -d app')],
  ['psql after a PowerShell PGHOST assignment (ask)', 'ask', pwsh('$env:PGHOST = "db.prod.internal"; psql -d app')],
  ['psql naming localhost after an exported PGHOST (allow)', 0, bash('export PGHOST=db.prod.internal && psql -h localhost -d app')],
  ['cloud-sql-proxy behind nohup, logged (ask)', 'ask', bash('nohup cloud-sql-proxy my-project:europe-west1:prod-db > proxy.log 2>&1 &')],
  ['cloud-sql-proxy by its release asset name (ask)', 'ask', pwsh(`.${BS}cloud-sql-proxy.x64.exe my-project:europe-west1:prod-db`)],
  ['cloud-sql-proxy as a docker image (ask)', 'ask', bash('docker run -d -p 5432:5432 gcr.io/cloud-sql-connectors/cloud-sql-proxy:2 my-project:europe-west1:prod-db')],
  ['chmod of the downloaded proxy (allow)', 0, bash('chmod +x cloud-sql-proxy')],
  ['gcloud compute start-iap-tunnel (ask)', 'ask', bash('gcloud compute start-iap-tunnel bastion 5432 --local-host-port=localhost:5432')],
  ['docker run of a client image to another host (ask)', 'ask', bash('docker run --rm -it postgres:16 psql -h db.prod.internal -U app')],
  ['docker run of a client image on a compose network (allow)', 0, bash('docker run --rm --network app_default postgres:16 psql -h db -U app')],
  ['docker run of a database server named after its client (allow)', 0, bash('docker run --rm -d --name mongo -p 27017:27017 mongo:7')],
  ['psql inside a pod of a local cluster (allow)', 0, bash('kubectl --context kind-dev exec -it deploy/api -- psql -h postgres -U app')],
  ['mongoexport with a URI to another host (ask)', 'ask', bash('mongoexport --uri mongodb+srv://app@cluster0.example.net/app --collection orders')],
  ['mongosh with a host:port address (ask)', 'ask', bash('mongosh db.prod.internal:27017/app')],
  ['mongosh with a script file (allow)', 0, bash('mongosh app scripts/seed.js')],
  ['sqlcmd with the server joined to -S (ask)', 'ask', pwsh('sqlcmd -Ssql.prod.internal -d app')],
  ['Invoke-Sqlcmd to another server (ask)', 'ask', pwsh('Invoke-Sqlcmd -ServerInstance sql.prod.internal -Database app -Query "SELECT 1"')],

  // A database's own data folder, outside the project too.
  ['rm -rf of the system postgres data folder (ask)', 'ask', bash('sudo rm -rf /var/lib/postgresql/16/main')],
  ['rm -rf of a pgdata bind mount (ask)', 'ask', bash('rm -rf /srv/compose/pgdata')],
  ['Remove-Item of a Windows postgres data folder (ask)', 'ask', pwsh(`Remove-Item -Recurse "C:${BS}Program Files${BS}PostgreSQL${BS}16${BS}data"`)],
  ['rm -rf of a scratch folder (allow)', 0, bash('rm -rf /tmp/build-cache')],
  ['rm -rf of a Homebrew postgres folder (ask)', 'ask', bash('rm -rf /opt/homebrew/var/postgresql@16')],
  ['git rm --cached of a pgdata folder, which only untracks it (allow)', 0, bash('git rm -r --cached pgdata')],
  ['rm -rf of the folder PGDATA names (ask)', 'ask', bash('rm -rf "$PGDATA"')],
  ["rm -rf of MongoDB's default data folder (ask)", 'ask', bash('rm -rf /data/db')],
  ['rm -rf of a data/postgres bind mount (ask)', 'ask', bash('rm -rf ./data/postgres')],
  ['rm of a source file under a folder named data/db (allow)', 0, bash('rm src/data/db/old-client.ts')],

  // Shapes a review found read wrong.
  ['psql to ::1 (allow)', 0, bash('psql -h ::1 -d app')],
  ['redis-cli storing a URL as a value (allow)', 0, bash('redis-cli SET queue:url amqp://broker.internal/orders')],
  ['pg_dump from another host (ask)', 'ask', bash('pg_dump -h db.prod.internal -U app app')],
  ['manage.py migrate with a settings value before the app (allow)', 0, bash('python manage.py migrate --settings config.settings.test orders')],
  ['manage.py migrate -v 2 one app (allow)', 0, bash('python manage.py migrate -v 2 orders')],
  ['manage.py migrate --fake (ask)', 'ask', bash('python manage.py migrate --fake')],
  ['compose down with a profile named migrate (allow)', 0, bash('docker compose --profile migrate down')],
  ['golang-migrate force (ask)', 'ask', bash('migrate -path db/migrations -database "$DATABASE_URL" force 20240101')],
  ['flask --app db downgrade base (ask)', 'ask', bash('flask --app app db downgrade base')],
  ['flask --app db stamp (ask)', 'ask', bash('flask --app app db stamp head')],
  ['dotnet ef database update with options and a target (ask)', 'ask', pwsh('dotnet ef database update --project src/Infra --startup-project src/Api InitialCreate')],
  ['liquibase changelog-sync (ask)', 'ask', bash('liquibase changelog-sync')],
  ["git diff excluding the env file (allow)", 0, bash("git diff -- . ':!.env'")],
  ["git log -p excluding the env file (allow)", 0, bash("git log -p -- . ':(exclude).env'")],

  // What must not read as a command.
  ['grep for a forbidden command (allow)', 0, bash('grep -n "terraform apply" README.md')],
  ['grep behind xargs (allow)', 0, bash('git ls-files | xargs grep -n "kubectl apply"')],
  // The folder is named: a find that feeds a reader is walked for secret files, and this part runs in the project.
  ['grep behind find -exec (allow)', 0, bash('find .claude/hooks -name "*.md" -exec grep -l "terraform apply" {} +')],
  ['grep behind sudo (allow)', 0, bash('sudo -u app grep -n "terraform apply" /srv/app/notes.md')],
  ['echo of a forbidden command (allow)', 0, bash('echo "run terraform apply yourself"')],
  ['git log --grep (allow)', 0, bash('git log --grep "kubectl delete" --oneline')],
  ['a comment naming a command (allow)', 0, bash('ls infra # then terraform apply')],
  ['a heredoc written to a scratch file (allow)', 0, bash(["cat > /tmp/steps.txt <<'EOF'", 'terraform apply', 'EOF'].join(NL))],
  ['a heredoc with a hyphenated delimiter (allow)', 0, bash(["cat > /tmp/notes.md <<'END-OF-NOTES'", 'run terraform apply after review', 'END-OF-NOTES'].join(NL))],
  ['a PowerShell here-string written to the temp folder (allow)', 0, pwsh([`Set-Content -Path $env:TEMP${BS}steps.md -Value @"`, 'run terraform apply after review', '"@'].join(NL))],
  ['a heredoc a shell runs (deny)', 2, bash(["bash <<'EOF'", 'terraform apply', 'EOF'].join(NL))],
  ['a heredoc a shell by full path runs (deny)', 2, bash(['/bin/bash <<EOF', 'terraform apply -auto-approve', 'EOF'].join(NL))],
  ['a command echoed into a shell (deny)', 2, bash('echo "terraform apply -auto-approve" | bash')],
  ['the project check command (allow)', 0, bash('make check')],
  // The project's own lists - one case per entry of FROZEN_PATHS, SECRET_PATHS and FORBIDDEN_COMMANDS, e.g.:
  // ['Read the local settings file (deny)', 2, read(inRoot('config', 'local.settings.json'))],
  // ['the deploy target (deny)', 2, bash('make deploy')],
];

const SAMPLE = {
  FROZEN_RAW: JSON.stringify(['db/migrations/']),
  SECRET_RAW: JSON.stringify([`config/local${BS}.settings${BS}.json$`]),
  FORBIDDEN_RAW: JSON.stringify([`${BS}bmake${BS}s+deploy(?=${BS}s|$)`]),
};
// Windows and macOS fold case in file names, and the frozen check with them.
const FOLD = process.platform === 'win32' || process.platform === 'darwin';
// Built from parts: the install fills every placeholder it finds under .claude, and this one must stay unfilled.
const placeholder = (name) => `<${name}>`;
const UNFILLED = { FROZEN_RAW: placeholder('FROZEN_PATHS'), SECRET_RAW: placeholder('SECRET_PATHS'), FORBIDDEN_RAW: placeholder('FORBIDDEN_COMMANDS') };

// A copy of the hook with its three raw strings replaced; null when the hook no longer carries one of them.
function hookWith(values, target) {
  let text = readFileSync(installed, 'utf8');
  for (const [name, value] of Object.entries(values)) {
    const slot = new RegExp(`(const ${name} = String${BS}.raw\`)[^\`]*(\`;)`);
    if (!slot.test(text)) return null;
    text = text.replace(slot, (whole, open, close) => `${open}${value}${close}`);
  }
  writeFileSync(target, text);
  return target;
}

let failed = 0;
let passed = 0;
function run(part, hook, cases, cwd) {
  // An optional fourth element is a pattern the refusal's text must match - for an 'output' case, what the hook
  // printed for the user.
  for (const [name, want, payload, says] of cases) {
    const input = payload.raw ?? JSON.stringify({ cwd, ...payload });
    const r = spawnSync(process.execPath, [hook], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } });
    const asked = /"permissionDecision":"ask"/.test(r.stdout ?? '');
    const got = r.status === 0 && asked ? 'ask' : r.status === 0 && (r.stdout ?? '').trim() ? 'output' : r.status;
    const ok = got === want && (!says || says.test((want === 'output' ? r.stdout : r.stderr) ?? ''));
    if (ok) passed += 1;
    else failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${part} ${name.padEnd(58)} ${String(got).padEnd(4)} ${(r.stderr ?? '').trim().slice(0, 50)}`);
  }
}
function setupFailed(what) {
  failed += 1;
  console.log(`FAIL setup: ${what}`);
}

run('1', installed, builtIn, root);

const scratch = mkdtempSync(join(tmpdir(), 'backend-guard-'));
try {
  const project = join(scratch, 'project');
  const migrations = join(project, 'db', 'migrations');
  mkdirSync(migrations, { recursive: true });
  mkdirSync(join(project, 'app'), { recursive: true });
  writeFileSync(join(migrations, '001_init.sql'), 'create table a (id int);\n');
  writeFileSync(join(project, 'app', 'main.py'), 'x = 1\n');
  const git = (...args) => spawnSync('git', ['-C', project, ...args], { encoding: 'utf8' });
  const commit = (message) =>
    git('add', '-A').status === 0 &&
    git('-c', 'user.name=test', '-c', 'user.email=test@localhost', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', message).status === 0;
  // The second commit is a migration the developer committed on the working branch, before any merge.
  const committed =
    git('init', '-q').status === 0 &&
    commit('init') &&
    (writeFileSync(join(migrations, '004_branch.sql'), 'alter table a add d int;\n'), commit('branch'));
  // Written after the commits: a migration this task created, which git does not track, and env files - one at the
  // top, one deeper down, one in a dependency folder no search walks into.
  writeFileSync(join(migrations, '002_task.sql'), 'alter table a add b int;\n');
  writeFileSync(join(project, '.env'), 'KEY=placeholder\n');
  for (const folder of [['apps', 'api', 'src'], ['lib', 'node_modules', 'pkg']]) mkdirSync(join(project, ...folder), { recursive: true });
  writeFileSync(join(project, 'apps', 'api', '.env'), 'DATABASE_URL=placeholder\n');
  writeFileSync(join(project, 'apps', 'api', 'src', 'db.ts'), 'export const url = process.env.DATABASE_URL;\n');
  writeFileSync(join(project, 'lib', 'node_modules', 'pkg', '.env'), 'KEY=placeholder\n');
  writeFileSync(join(project, 'lib', 'index.ts'), 'export {};\n');
  // grep -r reads build output too; and a tree past the walk's cap, with an env file deep down.
  mkdirSync(join(project, 'tools', 'build'), { recursive: true });
  writeFileSync(join(project, 'tools', 'build', '.env'), 'KEY=placeholder\n');
  mkdirSync(join(project, 'big', 'deep', 'er'), { recursive: true });
  for (let index = 0; index < 60; index += 1) writeFileSync(join(project, 'big', `f${index}.txt`), '\n');
  writeFileSync(join(project, 'big', 'deep', 'er', '.env'), 'KEY=placeholder\n');

  const sample = hookWith(SAMPLE, join(scratch, 'sample.mjs'));
  if (!committed) setupFailed('could not commit in the throwaway repo - is git on PATH?');
  else if (!sample) setupFailed('backend-guard.mjs no longer carries its three raw strings');
  else {
    run('2', sample, [
      ['Edit a committed migration (deny)', 2, edit(join(migrations, '001_init.sql'))],
      ['MultiEdit a committed migration (deny)', 2, multi(join(migrations, '001_init.sql'))],
      ['Write over a committed migration (deny)', 2, write(join(migrations, '001_init.sql'))],
      ["Edit this task's own migration (allow)", 0, edit(join(migrations, '002_task.sql'))],
      ['Write a new migration (allow)', 0, write(join(migrations, '003_next.sql'))],
      ['Edit a source file (allow)', 0, edit(join(project, 'app', 'main.py'))],
      ['rm a committed migration (deny)', 2, bash('rm db/migrations/001_init.sql')],
      ["rm this task's own migration (allow)", 0, bash('rm db/migrations/002_task.sql')],
      ['rm the committed migrations by glob (deny)', 2, bash('rm db/migrations/*.sql')],
      ['rm -rf the migrations folder (deny)', 2, bash('rm -rf db/migrations')],
      ['find -delete over the migrations (deny)', 2, bash('find db/migrations -name "*.sql" -delete')],
      ['mv a committed migration (deny)', 2, bash('mv db/migrations/001_init.sql db/migrations/001_first.sql')],
      ['copying a committed migration out (allow)', 0, bash('cp db/migrations/001_init.sql /tmp/001.sql')],
      ['Remove-Item a committed migration (deny)', 2, pwsh(`Remove-Item db${BS}migrations${BS}001_init.sql`)],
      ['Clear-Content of a committed migration (deny)', 2, pwsh(`Clear-Content db${BS}migrations${BS}001_init.sql`)],
      ['cmd /c del of a committed migration (deny)', 2, pwsh(`cmd /c "del db${BS}migrations${BS}001_init.sql"`)],
      ["Read the project's secret file (deny)", 2, read(join(project, 'config', 'local.settings.json'))],
      ["cat the project's secret file (deny)", 2, bash('cat config/local.settings.json')],
      ["the project's forbidden command (deny)", 2, bash('make deploy')],
      ["the project's forbidden command as a dry run (deny)", 2, bash('make deploy --dry-run')],
      ['another make target (allow)', 0, bash('make check')],
      ['a target that starts with the forbidden one (allow)', 0, bash('make deploy-docs')],
      ["the project's forbidden command with a variable (deny)", 2, bash('make deploy ENV=prod')],
      ['Edit a committed migration spelled in another case', FOLD ? 2 : 0, edit(join(project, 'DB', 'Migrations', '001_INIT.sql'))],
      ['rm a committed migration spelled in another case', FOLD ? 2 : 0, bash('rm DB/Migrations/001_init.sql')],
      ['git rm a committed migration (deny)', 2, bash('git rm db/migrations/001_init.sql')],
      ['git mv a committed migration (deny)', 2, bash('git mv db/migrations/001_init.sql db/migrations/001_first.sql')],
      ['rm a committed migration behind sudo (deny)', 2, bash('sudo -u app rm -f db/migrations/001_init.sql')],
      ['find -exec rm over the migrations (deny)', 2, bash('find db/migrations -name "*.sql" -exec rm {} +')],
      ['cmd /c del of a committed migration, unquoted (deny)', 2, pwsh(`cmd /c del db${BS}migrations${BS}001_init.sql`)],
      ['docker rm of a container named as the migration folder (allow)', 0, bash('docker rm -f db')],
      ['compose rm of a service named as the migration folder (allow)', 0, bash('docker compose rm -sf db')],
      ['npm rm of a package named as the migration folder (allow)', 0, bash('npm rm db')],
      ['docker volume rm: asked as data, not refused as a migration (ask)', 'ask', bash('docker volume rm db')],
      ['find -delete of byte code under the source folder (allow)', 0, bash('find app -name "*.pyc" -delete')],
      ['a listing piped into Select-String, recursive (deny)', 2, pwsh('Get-ChildItem -Recurse -File | Select-String -Pattern KEY')],
      ['gci -r piped into sls (deny)', 2, pwsh('gci -r | sls KEY')],
      ['a listing of the folder itself piped into Select-String (deny)', 2, pwsh('Get-ChildItem | Select-String KEY')],
      ['a recursive listing of the source folder, piped (allow)', 0, pwsh('Get-ChildItem app -Recurse | Select-String KEY')],
      ['a recursive listing with an -Include, piped (allow)', 0, pwsh('Get-ChildItem -Recurse -Include *.ts, *.py | Select-String KEY')],
      ['a recursive listing of names, piped (allow)', 0, pwsh('Get-ChildItem -Recurse -Name | Select-String KEY')],
      ['a recursive listing piped into something else (allow)', 0, pwsh('Get-ChildItem -Recurse | Select-Object -First 5')],
      ['Select-String -Path with a wildcard that takes .env (deny)', 2, pwsh('Select-String -Path * -Pattern KEY')],
      ['Select-String -Path with a wildcard in the source folder (allow)', 0, pwsh('Select-String -Path app/* -Pattern KEY')],
      ['Select-String -Path with a wildcard no secret matches (allow)', 0, pwsh('Select-String -Path *.py -Pattern KEY')],
      ['findstr /s over every file (deny)', 2, pwsh('findstr /s /i KEY *')],
      ['findstr /s over the source files (allow)', 0, pwsh('findstr /s /i KEY *.ts')],
      ['findstr over one named file (allow)', 0, pwsh('findstr /i KEY README.md')],
      ['find piped into xargs grep (deny)', 2, bash('find . -type f | xargs grep -n KEY')],
      ['find -exec grep (deny)', 2, bash('find . -type f -exec grep -Hn KEY {} +')],
      ['find with a -not -name that leaves the env file in (deny)', 2, bash('find . -type f -not -name "*.ts" | xargs grep -n KEY')],
      ['find with a -name no secret matches, piped (allow)', 0, bash('find . -name "*.ts" -print0 | xargs -0 grep -n KEY')],
      ['find with a -name no secret matches, -exec (allow)', 0, bash('find . -name "*.ts" -exec grep -Hn KEY {} +')],
      ['find over the source folder, piped (allow)', 0, bash('find app -type f | xargs grep -n KEY')],
      ['find at a depth the env file is not at (allow)', 0, bash('find apps -maxdepth 1 -type f | xargs grep -n KEY')],
      ['rg -uu (deny)', 2, bash('rg -uu KEY')],
      ['rg --hidden over a folder with an env file deeper down (deny)', 2, bash('rg --hidden KEY apps')],
      ['rg --no-ignore (deny)', 2, bash('rg --no-ignore -n KEY .')],
      ['rg -uu over the source folder (allow)', 0, bash('rg -uu KEY app')],
      ['rg -uu with a glob no secret matches (allow)', 0, bash("rg -uu KEY -g '*.ts'")],
      ['rg -uu with a glob that leaves the env files out (allow)', 0, bash("rg -uu KEY -g '!.env*' apps")],
      ['rg -uu with a file type (allow)', 0, bash('rg -uu -t py KEY')],
      ['a recursive grep over the folder that holds .env (deny)', 2, bash('grep -rn KEY .')],
      ['a recursive grep with no folder named (deny)', 2, bash('grep -rn KEY')],
      ['a recursive grep over the source folder (allow)', 0, bash('grep -rn KEY app')],
      ['a recursive grep that excludes the env file (allow)', 0, bash('grep -rn KEY . --exclude=.env')],
      ['git grep, which skips ignored files (allow)', 0, bash('git grep -n KEY')],
      ['a recursive grep over a folder with an env file deeper down (deny)', 2, bash('grep -rn DATABASE_URL apps')],
      ['a recursive grep with a count option over it (deny)', 2, bash('grep -rn -m 5 DATABASE_URL apps')],
      ['an exclude-dir that leaves the env file in (deny)', 2, bash('grep -rn --exclude-dir=node_modules DATABASE_URL .')],
      ["an exclude-dir that leaves the env file's folder out (allow)", 0, bash('grep -rn --exclude-dir=api DATABASE_URL apps')],
      ['an include that no secret matches (allow)', 0, bash("grep -rn --include='*.ts' DATABASE_URL apps")],
      ['an include brace that no secret matches (allow)', 0, bash("grep -rn --include='*.{ts,js}' DATABASE_URL apps")],
      ['an include that matches the env file (deny)', 2, bash("grep -rn --include='.e*' DATABASE_URL apps")],
      ['a recursive grep over an env file in node_modules only (allow)', 0, bash('grep -rn KEY lib')],
      ['Edit a migration committed on the branch, no remote (deny)', 2, edit(join(migrations, '004_branch.sql'))],
      ['a recursive grep reads build output too (deny)', 2, bash('grep -rn KEY tools')],
      ['an exclude-dir that names the build folder (allow)', 0, bash('grep -rn --exclude-dir=build KEY tools')],
    ], project);
  }

  // The Grep tool and git grep skip what git ignores, not what it tracks: a secret file in the index is read.
  writeFileSync(join(project, '.gitignore'), '.env\n');
  mkdirSync(join(project, 'config'), { recursive: true });
  writeFileSync(join(project, 'config', 'local.settings.json'), '{}\n');
  if (sample && committed && git('add', 'config/local.settings.json').status === 0) {
    run('2', sample, [
      ['Grep content over a folder with a tracked secret (deny)', 2, grep({ output_mode: 'content' })],
      ['Grep content over the source folder (allow)', 0, grep({ path: join(project, 'app'), output_mode: 'content' })],
      ['Grep file names over a tracked secret (allow)', 0, grep({ output_mode: 'files_with_matches' })],
      ['Grep content with a glob that leaves it out (allow)', 0, grep({ glob: '*.py', output_mode: 'content' })],
      ['Grep content with a type that leaves it out (allow)', 0, grep({ type: 'py', output_mode: 'content' })],
      ['Grep content with a type that takes it (deny)', 2, grep({ type: 'json', output_mode: 'content' })],
      ['Grep content with a path glob that leaves it out (allow)', 0, grep({ glob: 'app/**/*.py', output_mode: 'content' })],
      ['Grep content with a path glob that takes it (deny)', 2, grep({ glob: 'config/**', output_mode: 'content' })],
      ['Grep content with an exclude glob that misses it (deny)', 2, grep({ glob: '!tests/**', output_mode: 'content' })],
      ['Grep content over a folder whose env file git ignores (allow)', 0, grep({ path: join(project, 'apps'), output_mode: 'content' })],
      ['git grep over a tracked secret (deny)', 2, bash('git grep -n KEY')],
      ['git grep -l over a tracked secret (allow)', 0, bash('git grep -l KEY')],
      ['git grep with a pathspec that leaves it out (allow)', 0, bash("git grep -n KEY -- '*.py'")],
      ['git grep with an exclude pathspec (allow)', 0, bash("git grep -n KEY -- . ':!config/local.settings.json'")],
      // The secret lists read the whole path, wherever the search starts.
      ["Grep content from inside the secret's folder (deny)", 2, grep({ path: join(project, 'config'), output_mode: 'content' })],
      ["git grep from inside the secret's folder (deny)", 2, bash('git -C config grep -n KEY')],
      // The tool's glob is a list, and every brace group counts.
      ['Grep content with a glob list that takes it (deny)', 2, grep({ glob: '*.py,*.json', output_mode: 'content' })],
      ['Grep content with a spaced glob list that takes it (deny)', 2, grep({ glob: '*.py *.json', output_mode: 'content' })],
      ['Grep content with two brace groups that take it (deny)', 2, grep({ glob: '{app,config}/*.{py,json}', output_mode: 'content' })],
      ['Grep content with a glob list that leaves it out (allow)', 0, grep({ glob: '*.py,*.sql', output_mode: 'content' })],
      ['Grep content with an exclude glob that names it (allow)', 0, grep({ glob: '!local.settings.json', output_mode: 'content' })],
      ['Grep content with an exclude glob for env files (allow)', 0, grep({ path: join(project, 'app'), glob: '!.env*', output_mode: 'content' })],
    ], project);
    // A file git neither tracks nor ignores is read by the Grep tool, not by git grep; a keystore is binary and is
    // printed by neither, unless git grep is told to read it as text.
    mkdirSync(join(project, 'notes'), { recursive: true });
    mkdirSync(join(project, 'certs'), { recursive: true });
    writeFileSync(join(project, 'notes', 'secrets.yaml'), 'KEY: placeholder\n');
    writeFileSync(join(project, 'certs', 'test.jks'), 'KEY\n');
    if (git('add', 'certs/test.jks').status === 0) {
      run('2', sample, [
        ['Grep content over an untracked secret git does not ignore (deny)', 2, grep({ path: join(project, 'notes'), output_mode: 'content' })],
        ['git grep beside an untracked secret (allow)', 0, bash('git -C notes grep -n KEY')],
        ['Grep content over a tracked keystore, which is binary (allow)', 0, grep({ path: join(project, 'certs'), output_mode: 'content' })],
        ['git grep over a tracked keystore (allow)', 0, bash('git -C certs grep -n KEY')],
        ['git grep -a over a tracked keystore (deny)', 2, bash('git -C certs grep -a -n KEY')],
      ], project);
    } else setupFailed('could not stage a keystore in the throwaway repo');
    rmSync(join(project, 'notes'), { recursive: true, force: true });
  } else if (committed) setupFailed('could not stage a secret file in the throwaway repo');

  // The same copy with a walk cap of 50 entries: past it the tree is unknown, and the user is asked.
  const capped = sample && join(scratch, 'capped.mjs');
  const cappedText = sample && readFileSync(sample, 'utf8').replace(/const WALK_CAP = \d+;/, 'const WALK_CAP = 50;');
  if (capped && cappedText.includes('const WALK_CAP = 50;')) {
    writeFileSync(capped, cappedText);
    run('2', capped, [
      ['a recursive grep over a tree past the cap (ask)', 'ask', bash('grep -rn KEY big')],
      ['a recursive grep over a small tree, cap or not (allow)', 0, bash('grep -rn KEY app')],
      ['rg -uu over a tree past the cap (ask)', 'ask', bash('rg -uu KEY big')],
      ['find piped into xargs grep over a tree past the cap (ask)', 'ask', bash('find big -type f | xargs grep -n KEY')],
    ], project);
  } else if (sample) setupFailed('backend-guard.mjs no longer carries const WALK_CAP');

  // The upstream default branch decides: origin/main holds the first commit only.
  if (sample && committed && git('update-ref', 'refs/remotes/origin/main', 'HEAD~1').status === 0) {
    run('2', sample, [
      ['Edit a migration merged upstream (deny)', 2, edit(join(migrations, '001_init.sql'))],
      ['Edit a migration committed on the branch only (allow)', 0, edit(join(migrations, '004_branch.sql'))],
      ['rm a migration committed on the branch only (allow)', 0, bash('rm db/migrations/004_branch.sql')],
      ['rm -rf a folder with a merged migration (deny)', 2, bash('rm -rf db/migrations')],
    ], project);
  } else if (committed) setupFailed('could not set origin/main in the throwaway repo');

  // origin/HEAD outranks origin/main: here it names a branch that holds the second commit too.
  if (
    sample &&
    committed &&
    git('update-ref', 'refs/remotes/origin/develop', 'HEAD').status === 0 &&
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop').status === 0
  ) {
    run('2', sample, [['Edit a migration on the branch origin/HEAD names (deny)', 2, edit(join(migrations, '004_branch.sql'))]], project);
  } else if (committed) setupFailed('could not set origin/HEAD in the throwaway repo');

  const unfilled = hookWith(UNFILLED, join(scratch, 'unfilled.mjs'));
  if (committed && unfilled) {
    run('3', unfilled, [
      ['Edit a committed migration, list unfilled (allow)', 0, edit(join(migrations, '001_init.sql'))],
      ['rm -rf the migrations folder, list unfilled (allow)', 0, bash('rm -rf db/migrations')],
      ['make deploy, list unfilled (allow)', 0, bash('make deploy')],
      ['cat .env, lists unfilled (deny)', 2, bash('cat .env')],
      ['rg -uu, lists unfilled (deny)', 2, bash('rg -uu KEY')],
      ['terraform apply, lists unfilled (deny)', 2, bash('terraform apply')],
      ['psql DROP TABLE, lists unfilled (ask)', 'ask', bash('psql -d app -c "DROP TABLE users"')],
    ], project);
  }

  // A misfilled list - broken JSON, a regex that does not compile - empties itself and is named; the rest holds.
  const broken = hookWith({ ...SAMPLE, SECRET_RAW: '["config/local', FORBIDDEN_RAW: '["(unclosed"]' }, join(scratch, 'broken.mjs'));
  if (committed && broken) {
    run('3', broken, [
      ['a broken secret list: cat .env still refused (deny)', 2, bash('cat .env'), /SECRET_PATHS is not a JSON array/],
      ['a broken secret list protects nothing of its own, and tells the user (allow)', 'output', read(join(project, 'config', 'local.settings.json')), /"systemMessage":"backend-guard.mjs: SECRET_PATHS is not a JSON array/],
      ['a broken forbidden list: terraform apply still refused (deny)', 2, bash('terraform apply'), /FORBIDDEN_COMMANDS is not a JSON array/],
      ['a broken list beside it: the frozen list still holds (deny)', 2, edit(join(migrations, '001_init.sql'))],
    ], project);
  }

  // A worktree in a folder the main repo ignores is a repo of its own: its own .gitignore decides, not a walk.
  const tree = join(project, '.worktrees', 'feat');
  if (sample && committed && git('worktree', 'add', '-q', tree).status === 0) {
    writeFileSync(join(project, '.gitignore'), '.env\n.worktrees/\n');
    writeFileSync(join(tree, '.gitignore'), '.env\n');
    writeFileSync(join(tree, '.env'), 'KEY=placeholder\n');
    run('2', sample, [
      ['Grep content at the root of a worktree in an ignored folder (allow)', 0, grep({ path: tree, output_mode: 'content' })],
      ['git grep in a worktree in an ignored folder (allow)', 0, bash('git grep -n KEY')],
    ], tree);
  } else if (committed) setupFailed('could not add a worktree in the throwaway repo');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
