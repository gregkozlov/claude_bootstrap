#!/usr/bin/env node
// Copies template/ into a target project, substituting the placeholders from a config file or from
// interactive answers, then prints the manual steps that remain.
//
//   node apply.mjs <target-project-dir> [--config <answers.json>] [--force] [--dry-run]
//
//   --config   answers as JSON (see bootstrap.config.example.json); without it the questions are asked
//              on the terminal, and the answers are printed at the end so they can be saved for a re-run
//   --force    overwrite files that already exist in the target (default: keep them and say so) - never the
//              project's CLAUDE.md or .claude/settings.json, which /setup merges
//   --dry-run  print what would be written, write nothing
//
// examples/ is never copied - it is reference material. No dependencies; Node 18+.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, 'template');
const TEXT = /\.(md|json|mjs|js|ts|txt)$/;

const KEYS = [
  { key: 'PROJECT', ask: 'Project name', example: 'stockroom' },
  { key: 'STACK', ask: 'Stack in one line', example: 'React 19 + TypeScript strict on Vite, MUI, TanStack Query v5' },
  { key: 'SRC_DIR', ask: 'Source directory, no trailing slash', example: 'src' },
  { key: 'CHECK_COMMAND', ask: 'The one verification command', example: 'npm run check' },
  { key: 'DEV_PORT_RANGE', ask: 'Dev server port range, from-to', example: '5173-5179' },
  { key: 'DEV_BASE_PATH', ask: 'App base path, with both slashes', example: '/' },
  {
    key: 'GENERATED_PATHS',
    ask: 'Protected path regexes the agent must never edit, JSON array of strings (forward slashes)',
    example: '["src/api/generated/", "\\\\.openapi\\\\.json$"]',
    json: true,
  },
];

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error('usage: node apply.mjs <target-project-dir> [--config <answers.json>] [--force] [--dry-run]');
  process.exit(2);
}

function parseArgs(argv) {
  const options = { target: null, config: null, force: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--config') {
      index += 1;
      options.config = argv[index] ?? usage('--config needs a file');
    } else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
    else if (options.target) usage('one target only');
    else options.target = arg;
  }
  if (!options.target) usage();
  return options;
}

function validate(answers) {
  const problems = [];
  for (const { key, json } of KEYS) {
    const value = answers[key];
    if (json) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) problems.push(`${key}: must be an array of strings`);
      else {
        for (const source of value) {
          try {
            new RegExp(source);
          } catch (error) {
            problems.push(`${key}: "${source}" is not a valid regex (${error.message})`);
          }
        }
      }
    } else if (typeof value !== 'string' || !value.trim()) problems.push(`${key}: must be a non-empty string`);
  }
  // The values land inside JS and JSON string literals unescaped, so a quote, a backslash or a backtick breaks
  // settings.json or a hook - and a hook that does not parse lets every call through.
  if (typeof answers.SRC_DIR === 'string' && /[\\/]$/.test(answers.SRC_DIR)) problems.push('SRC_DIR: no trailing slash');
  else if (typeof answers.SRC_DIR === 'string' && !/^[A-Za-z0-9_@-][\w.@/-]*$/.test(answers.SRC_DIR)) problems.push('SRC_DIR: a relative path with forward slashes, no "./", spaces or backslashes');
  if (typeof answers.DEV_PORT_RANGE === 'string') {
    const ports = answers.DEV_PORT_RANGE.match(/^(\d+)-(\d+)$/);
    if (!ports) problems.push('DEV_PORT_RANGE: expected "from-to", e.g. 5173-5179');
    else if (Number(ports[1]) > Number(ports[2])) problems.push('DEV_PORT_RANGE: "from" must not be above "to"');
  }
  if (typeof answers.DEV_BASE_PATH === 'string' && !/^\/.*\/$|^\/$/.test(answers.DEV_BASE_PATH)) problems.push('DEV_BASE_PATH: must start and end with "/"');
  else if (typeof answers.DEV_BASE_PATH === 'string' && /["'`\\\s]/.test(answers.DEV_BASE_PATH)) problems.push('DEV_BASE_PATH: no quotes, backslashes or spaces');
  if (typeof answers.CHECK_COMMAND === 'string' && /[<>|&;]/.test(answers.CHECK_COMMAND)) problems.push('CHECK_COMMAND: one plain command, no shell operators');
  else if (typeof answers.CHECK_COMMAND === 'string' && /["'`\\]/.test(answers.CHECK_COMMAND)) problems.push('CHECK_COMMAND: no quotes or backslashes - wrap it in a package script');
  if (Array.isArray(answers.GENERATED_PATHS) && answers.GENERATED_PATHS.some((source) => typeof source === 'string' && /`|\$\{/.test(source))) problems.push('GENERATED_PATHS: no backtick or "${" in a regex');
  return problems;
}

async function askAnswers() {
  if (!process.stdin.isTTY) usage('no terminal for questions - pass --config <answers.json>');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answers = {};
  console.log('\nAnswer each question; the example is only a hint, not a default.\n');
  for (const { key, ask, example, json } of KEYS) {
    let value;
    for (;;) {
      const raw = (await rl.question(`${ask}\n  e.g. ${example}\n  ${key} = `)).trim();
      if (!json) {
        value = raw;
        break;
      }
      try {
        value = JSON.parse(raw || '[]');
        break;
      } catch {
        console.log('  not valid JSON - try again, e.g. [] for none');
      }
    }
    answers[key] = value;
  }
  rl.close();
  return answers;
}

function substitute(text, answers, file, unfilled) {
  const replaced = text.replace(/<([A-Z][A-Z_]{2,})>/g, (whole, key) => {
    if (!(key in answers)) return whole;
    const value = answers[key];
    return Array.isArray(value) ? JSON.stringify(value) : value;
  });
  for (const match of replaced.matchAll(/<([A-Z][A-Z_]{2,})>/g)) unfilled.add(`${file}: <${match[1]}>`);
  return replaced;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const GITIGNORE_CLAUDE_BLOCK = [
  '# Ignore .claude contents, not the dir itself - git will not descend into an ignored directory, so the',
  '# negations only work against `.claude/*`. Deny-by-default: add a line when you add a directory.',
  '.claude/*',
  '!.claude/rules/',
  '!.claude/agents/',
  '!.claude/skills/',
  '!.claude/hooks/',
  '!.claude/scripts/',
  '!.claude/docs/',
  '!.claude/settings.json',
  '!.claude/settings.local.example.json',
  '# .claude/sessions/ is deliberately not negated: one folder per session holding its own task file and',
  '# handoff, personal and temporary, pruned by hand.',
  'CLAUDE.local.md',
];

function ensureGitignore(target, dryRun) {
  const file = join(target, '.gitignore');
  const existed = existsSync(file);
  const current = existed ? readFileSync(file, 'utf8') : '';
  const block = GITIGNORE_CLAUDE_BLOCK.filter((line) => !line.startsWith('#'));
  if (/^\s*\/?\.claude\/?\s*$/m.test(current)) {
    return `left alone, AND IT HIDES THE LAYER: a bare .claude line keeps git out of the folder, so no negation can rescue it. Replace that line with:\n  ${block.join('\n  ')}`;
  }
  if (/^\s*\/?\.claude\/\*\s*$/m.test(current)) return 'unchanged (it already carries a .claude/* block - /setup proves its negations)';
  if (!dryRun) appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}${GITIGNORE_CLAUDE_BLOCK.join('\n')}\n`, 'utf8');
  return `${dryRun ? 'would be ' : ''}${existed ? 'appended' : 'created'}: ${block.join(', ')}`;
}

const options = parseArgs(process.argv.slice(2));
const target = resolve(options.target);
if (!existsSync(target) || !statSync(target).isDirectory()) usage(`${target} is not a directory`);
const fromHere = relative(HERE, target);
if (!fromHere.startsWith('..') && !isAbsolute(fromHere)) usage('the target is the bootstrap folder itself, or inside it');

let answers;
let fromFile = false;
if (options.config) {
  try {
    answers = JSON.parse(readFileSync(resolve(options.config), 'utf8'));
  } catch (error) {
    usage(`--config: ${error.message}`);
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) usage('--config: expected a JSON object of answers');
  fromFile = true;
} else {
  answers = await askAnswers();
}
const problems = validate(answers);
if (problems.length > 0) {
  console.error(`\nAnswers rejected:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const written = [];
const kept = [];
const unfilled = new Set();
for (const source of walk(TEMPLATE)) {
  const rel = relative(TEMPLATE, source);
  let destination = join(target, rel);
  let show = rel.split(sep).join('/');
  // The project's own CLAUDE.md is never replaced, not even by --force, but the layer's has to reach the project
  // anyway: the `setup` skill merges the two, and the bootstrap folder it would otherwise read from is not
  // reachable from there. settings.json carries the project's own entries, so --force keeps it too.
  if (show === 'CLAUDE.md' && existsSync(destination)) {
    destination = join(target, 'CLAUDE.bootstrap.md');
    show = 'CLAUDE.bootstrap.md (the project already has a CLAUDE.md - /setup merges them)';
    if (existsSync(destination) && !options.force) {
      kept.push('CLAUDE.bootstrap.md');
      continue;
    }
  } else if (show === '.claude/settings.json' && existsSync(destination)) {
    kept.push('.claude/settings.json (kept even with --force - /setup merges the hook registrations into it)');
    continue;
  } else if (existsSync(destination) && !options.force) {
    kept.push(show);
    continue;
  }
  const raw = readFileSync(source);
  const body = TEXT.test(source) ? substitute(raw.toString('utf8'), answers, show, unfilled) : raw;
  if (!options.dryRun) {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, body);
  }
  written.push(show);
}
const gitignore = ensureGitignore(target, options.dryRun);

const verb = options.dryRun ? 'would write' : 'wrote';
console.log(`\n${verb} ${written.length} file(s) into ${target}:`);
for (const item of written) console.log(`  ${item}`);
if (kept.length > 0) {
  console.log(`\nkept ${kept.length} existing file(s) (use --force to overwrite):`);
  for (const item of kept) console.log(`  ${item}`);
}
console.log(`\n.gitignore: ${gitignore}`);
if (unfilled.size > 0) {
  console.log('\nplaceholders left unfilled (no answer for them):');
  for (const item of unfilled) console.log(`  ${item}`);
}

console.log(`
Start Claude Code in the project and run /setup: it does steps 1 to 7 and 9 below by reading the repo, plus
the deletion half of 8 (the marker endpoint is a source change and stays with you). It asks in chat what the
repo cannot settle, and merges with a CLAUDE.md or settings.json that was already there. The list is what
must end up done, whoever does it.

Manual steps left - in this order:
  1. CLAUDE.md: write every [fill] section (grep -n "\\[fill\\]" CLAUDE.md), then delete the bootstrap note at the top.
     Keep it under 48 000 bytes (wc -c CLAUDE.md).
  2. .claude/agents/twins.md: fill "Known twins"; .claude/agents/comments.md: the artefacts other agents own;
     .claude/skills/lifecycle/SKILL.md: the project's editor agents at step 4 (its [fill] lines);
     .claude/skills/maintain-ai-layer/references/rules.md: the three source areas of step R5, and PREFIXES in
     .claude/skills/maintain-ai-layer/layer-refs.mjs; .claude/skills/crosscheck/SKILL.md: replace the signal
     list with this project's risk classes; .claude/skills/verify-live/SKILL.md: every [fill] line
     (grep -n "\\[fill\\]" .claude/skills/verify-live/SKILL.md).
  3. .claude/agents/hunt.md: keep the shape of the attack angles, replace the classes the project does not have,
     and feed it every bug that surfaces after a review (examples/hunt-example.md shows a fed library).
  4. Self-test the guard:  node .claude/hooks/tests/guard-test.mjs && node .claude/hooks/tests/guard-shell-test.mjs
     and the upkeep reminder:  node .claude/hooks/tests/upkeep-nudge-test.mjs
     Add a test case per entry in GENERATED_PATHS (the two commented lines in guard-test.mjs).
  5. Exclude ${answers.SRC_DIR}/__hunt_probe*.ts from the build and lint configs, so a probe live while gate runs
     cannot fail "${answers.CHECK_COMMAND}" and get blamed on the diff. Then confirm the probe agents still
     compile their probe: a project that excludes the path does not compile it either, which is why hunt.md and
     integration.md build a project of their own in the scratchpad. Prove it once with a broken probe.
  6. Add "node .claude/scripts/rules-reach.mjs --check" to "${answers.CHECK_COMMAND}" (Node 22.5+ or 20.17+, git)
     and run it once - the two shipped rules and their fixture pairs must pass.
  7. Optional Stop gate: copy .claude/settings.local.example.json to .claude/settings.local.json (gitignored),
     in every worktree. It runs "${answers.CHECK_COMMAND}" at the end of a turn that changed a file, and sets
     CLAUDE_CODE_MAX_RETRIES=15 so an API outage is retried longer before the turn dies.
     It waits on this session's own writing agents by itself; a project editor agent that owns one checker gets
     that checker split out of CHECKS in verify-gate.mjs, deferred on the agent (.claude/hooks/README.md).
  8. Browser projects: add the /__tree marker endpoint (examples/tree-marker-plugin.ts in the bootstrap folder
     is the Vite version) so verify-live can prove which server and which machine it is looking at - and have it
     report the listening port, not the configured one.
     Projects without a UI: delete .claude/skills/verify-live/, .claude/scripts/dev-servers.mjs and the
     "running app" block in CLAUDE.md, and rewrite step 7 in .claude/skills/lifecycle/SKILL.md as the command
     that exercises the change.
  9. The project's first path-scoped rule goes into .claude/rules/ beside the two the layer ships
     (rules-reach.md says how), with a "must" pair in .claude/scripts/rules-reach.fixture.json.
     Point its globs at the files that call the thing, then measure with node .claude/scripts/rules-reach.mjs:
     a rule that does not load at the call site is a rule that does not exist. After /setup,
     /maintain-ai-layer rules builds the whole set from the project.
 10. Start a new Claude Code session in the project - agents and skills are read at session start, and a
     running session is not guaranteed to pick up the hook registrations.`);

if (!fromFile) {
  console.log('\nAnswers used - save them as answers.json to re-run with --config:\n');
  console.log(JSON.stringify(answers, null, 2));
}
