#!/usr/bin/env node
// Copies template/ into a project. Nothing that already exists is overwritten: a file the project already has
// is kept and listed, and an existing CLAUDE.md gets the layer's copy beside it as CLAUDE.light.md, for the
// `setup` skill to merge. Placeholders are left as they are - `setup` fills them by reading the project.
//
//   node install.mjs <target-project-dir> [--dry-run]
//
// No dependencies; Node 18+.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, 'template');

const GITIGNORE_BLOCK = [
  '# Ignore .claude contents, not the dir itself - git will not descend into an ignored directory, so the',
  '# negations only work against `.claude/*`. Deny by default: add a line when you add a directory.',
  '.claude/*',
  '!.claude/agents/',
  '!.claude/skills/',
  '!.claude/hooks/',
  '!.claude/rules/',
  '!.claude/settings.json',
];

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error('usage: node install.mjs <target-project-dir> [--dry-run]');
  process.exit(2);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const args = process.argv.slice(2);
const unknown = args.find((arg) => arg.startsWith('--') && arg !== '--dry-run');
if (unknown) usage(`unknown option ${unknown}`);
const dryRun = args.includes('--dry-run');
const targets = args.filter((arg) => !arg.startsWith('--'));
if (targets.length > 1) usage('one target only');
const target = resolve(targets[0] ?? usage());
if (!existsSync(target) || !statSync(target).isDirectory()) usage(`${target} is not a directory`);
const fromHere = relative(HERE, target);
if (!fromHere.startsWith('..') && !isAbsolute(fromHere)) usage('the target is the bootstrap folder itself, or inside it');
if (!existsSync(TEMPLATE)) usage(`no template/ beside ${fileURLToPath(import.meta.url)}`);

const written = [];
const kept = [];
for (const source of walk(TEMPLATE)) {
  const rel = relative(TEMPLATE, source).split(sep).join('/');
  let destination = join(target, rel);
  let shown = rel;
  if (rel === 'CLAUDE.md' && existsSync(destination)) {
    destination = join(target, 'CLAUDE.light.md');
    shown = 'CLAUDE.light.md (the project already has a CLAUDE.md - /setup merges them)';
    // A re-run must not replace a copy someone is already merging into.
    if (existsSync(destination)) {
      kept.push('CLAUDE.light.md');
      continue;
    }
  } else if (existsSync(destination)) {
    kept.push(rel);
    continue;
  }
  if (!dryRun) {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(source));
  }
  written.push(shown);
}

const gitignore = join(target, '.gitignore');
const hadGitignore = existsSync(gitignore);
const currentIgnore = hadGitignore ? readFileSync(gitignore, 'utf8') : '';
let ignoreNote = 'unchanged (it already carries a .claude/* block - /setup proves its negations)';
if (/^\s*\/?\.claude\/?\s*$/m.test(currentIgnore)) {
  // A rule like `.claude/` keeps git from descending into the folder at all, so no negation after it can
  // rescue the layer's files: the rule has to be replaced, and only the owner can decide that.
  ignoreNote = `left alone, AND IT HIDES THE LAYER: a bare .claude rule means git never descends into the folder, so nothing installed above can be committed or shared. Replace that rule with:\n  ${GITIGNORE_BLOCK.slice(2).join('\n  ')}\nthen re-check with: git check-ignore .claude/settings.json .claude/agents/hunt.md   (must print nothing)`;
} else if (!/^\s*\/?\.claude\/\*\s*$/m.test(currentIgnore)) {
  if (!dryRun) appendFileSync(gitignore, `${currentIgnore && !currentIgnore.endsWith('\n') ? '\n' : ''}${GITIGNORE_BLOCK.join('\n')}\n`, 'utf8');
  ignoreNote = `${dryRun ? 'would be ' : ''}${hadGitignore ? 'appended the .claude block' : 'created with the .claude block'}`;
}

console.log(`\n${dryRun ? 'would write' : 'wrote'} ${written.length} file(s) into ${target}:`);
for (const item of written) console.log(`  ${item}`);
if (kept.length > 0) {
  console.log(`\nkept ${kept.length} existing file(s), untouched:`);
  for (const item of kept) console.log(`  ${item}`);
}
console.log(`\n.gitignore: ${ignoreNote}`);
if (!existsSync(join(target, '.git'))) {
  console.log('\nnote: this target is not a git repository. The layer works, but /setup and the handoff skill\n      open with git commands, and the docs step greps tracked files - say so when you run /setup.');
}
console.log(`
Next, in the project:
  1. Start Claude Code there and run  /setup
     It reads the project, merges with whatever Claude config was already here, asks what it cannot
     settle, fills every placeholder and [fill] section, and self-tests the guard.
  2. Restart the session afterwards: agents, skills and hook registrations are read at session start.`);
