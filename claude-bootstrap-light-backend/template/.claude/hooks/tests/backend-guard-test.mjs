// Self-test for backend-guard.mjs. Run from anywhere:
//   node .claude/hooks/tests/backend-guard-test.mjs
// Every line must read "ok". A case expects one of three outcomes: 0 (allow, nothing printed), 2 (refused) or
// 'ask' (exit 0 with a permissionDecision of "ask": the user is prompted). Three parts:
//   1. the built-in checks, against the installed hook as it stands - they hold whatever the project lists say;
//   2. the three project lists, against a copy of the hook with known values, in a throwaway git repo in the temp
//      directory (a frozen file is one on the upstream default branch, or with no remote one git tracks, so the
//      cases need commits and remote refs of their own, never ones in this tree);
//   3. the same copy with the lists unfilled: a missed fill protects nothing extra and breaks nothing.
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

  // What must not read as a command.
  ['grep for a forbidden command (allow)', 0, bash('grep -n "terraform apply" README.md')],
  ['grep behind xargs (allow)', 0, bash('git ls-files | xargs grep -n "kubectl apply"')],
  ['grep behind find -exec (allow)', 0, bash('find . -name "*.md" -exec grep -l "terraform apply" {} +')],
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
  FORBIDDEN_RAW: JSON.stringify([`${BS}bmake${BS}s+deploy${BS}b`]),
};
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
  // An optional fourth element is a pattern the refusal's text must match.
  for (const [name, want, payload, says] of cases) {
    const input = payload.raw ?? JSON.stringify({ cwd, ...payload });
    const r = spawnSync(process.execPath, [hook], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } });
    const asked = /"permissionDecision":"ask"/.test(r.stdout ?? '');
    const got = r.status === 0 && asked ? 'ask' : r.status === 0 && (r.stdout ?? '').trim() ? 'output' : r.status;
    const ok = got === want && (!says || says.test(r.stderr ?? ''));
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

  // The same copy with a walk cap of 50 entries: past it the tree is unknown, and the user is asked.
  const capped = sample && join(scratch, 'capped.mjs');
  const cappedText = sample && readFileSync(sample, 'utf8').replace(/const WALK_CAP = \d+;/, 'const WALK_CAP = 50;');
  if (capped && cappedText.includes('const WALK_CAP = 50;')) {
    writeFileSync(capped, cappedText);
    run('2', capped, [
      ['a recursive grep over a tree past the cap (ask)', 'ask', bash('grep -rn KEY big')],
      ['a recursive grep over a small tree, cap or not (allow)', 0, bash('grep -rn KEY app')],
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
      ['terraform apply, lists unfilled (deny)', 2, bash('terraform apply')],
      ['psql DROP TABLE, lists unfilled (ask)', 'ask', bash('psql -d app -c "DROP TABLE users"')],
    ], project);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
