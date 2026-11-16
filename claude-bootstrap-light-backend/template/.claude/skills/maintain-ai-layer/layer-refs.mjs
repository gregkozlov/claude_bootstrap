#!/usr/bin/env node
// Mechanical reference check over the AI layer: every backticked repo path, `npm run <script>`, "the `x` skill"
// and "`x` agent / subagent" in the layer's Markdown must still resolve. A path counts as resolved when it
// exists, is a known personal path, or is gitignored outside .claude/. Read-only; always exits 0.
//
//   node .claude/skills/maintain-ai-layer/layer-refs.mjs [file-or-dir ...]
//
// No arguments: CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md, every *.md under .claude/ on disk (sessions
// skipped) and every tracked or unignored *.md - outside a git repository the layer's own files alone.
// With arguments: only those (a directory is scanned for *.md one level deep - the memory folder, say).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUILT_IN_AGENTS = new Set(['Explore', 'Plan', 'general-purpose', 'claude-code-guide', 'statusline-setup', 'claude', 'fork']);
// Only a span starting with one of these is read as a repo path; add the project's other top-level folders.
const PREFIXES = ['<SRC_DIR>/', '.claude/'];
const SUFFIXES = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '.md', '/index.ts', '/index.tsx'];

const git = (...args) =>
  execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const targets = () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    let tracked = [];
    try {
      tracked = git('ls-files', '--cached', '--others', '--exclude-standard', '*.md')
        .split('\n')
        .filter((f) => f && !f.includes('node_modules/'));
    } catch {
      console.log('layer-refs: git lists no files here (no repository, or git failed) - only CLAUDE.md and the *.md under .claude/ are checked');
    }
    // A personal install keeps .claude/ out of the project's git, so the layer is read from disk.
    const fromDisk = (dir) =>
      fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return ['node_modules', '.git'].includes(entry.name) || rel === '.claude/sessions' ? [] : fromDisk(rel);
        return entry.name.endsWith('.md') ? [rel] : [];
      });
    const layer = fs.existsSync(path.join(ROOT, '.claude')) ? fromDisk('.claude') : [];
    const roots = ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md'];
    return [...new Set([...roots, ...layer, ...tracked])].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
  }
  return args.flatMap((arg) => {
    const full = path.resolve(ROOT, arg);
    if (!fs.existsSync(full)) return [];
    if (!fs.statSync(full).isDirectory()) return [full];
    return fs
      .readdirSync(full)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(full, f));
  });
};

const names = (dir, pick) => (fs.existsSync(dir) ? fs.readdirSync(dir).map(pick).filter(Boolean) : []);
const skills = new Set(names(path.join(ROOT, '.claude', 'skills'), (d) => d));
const agents = new Set(names(path.join(ROOT, '.claude', 'agents'), (f) => f.match(/^(.+)\.md$/)?.[1]));
const manifests = new Map();
const scriptsIn = (dir) => {
  if (!manifests.has(dir)) {
    let found = null;
    try {
      found = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts ?? {});
    } catch {
      // No package.json in this folder, or one that does not parse.
    }
    manifests.set(dir, found);
  }
  return manifests.get(dir);
};
// `npm run x` is held to the nearest package.json at or above the file, then to the ones above it up to the root: a
// workspace's doc names its own package's scripts and the root's. A file outside the repo is held to the root's.
const scriptsFor = (file) => {
  const rel = path.relative(ROOT, path.dirname(file));
  const parts = rel.startsWith('..') || path.isAbsolute(rel) ? [] : rel.split(path.sep).filter(Boolean);
  const found = [ROOT, ...parts.map((_, i) => path.join(ROOT, ...parts.slice(0, i + 1)))].map(scriptsIn).filter(Boolean);
  return found.length ? new Set(found.flat()) : null;
};

const onDisk = (ref) => SUFFIXES.some((suffix) => fs.existsSync(path.join(ROOT, ref.replace(/\/$/, '') + suffix)));
// A gitignored path (a session folder, settings.local.json, a waiver) exists per machine or per run, not in the repo.
// Under .claude/ only the known personal paths count: a deny-by-default `.claude/*` block ignores every typo there.
const LOCAL_ONLY = /^\.claude\/sessions(?:\/|$)|^\.claude\/(?:settings\.local\.json|handoff\.md|\.last-maintain|CLAUDE\.md)$|^CLAUDE\.local\.md$/;
const ignored = (ref) => {
  try {
    execFileSync('git', ['-C', ROOT, 'check-ignore', '-q', '--no-index', ref], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const resolves = (ref) => onDisk(ref) || LOCAL_ONLY.test(ref) || (!ref.startsWith('.claude/') && ignored(ref));

const cleanPath = (span) => {
  const ref = span
    .replace(/[.,;:)]+$/, '')
    .replace(/:\d+(-\d+)?$/, '')
    .replace(/#.*$/, '');
  if (!PREFIXES.some((p) => ref.startsWith(p))) return null;
  if (/[\s<>*{}$\\|()[\]]|\.\.\./.test(ref)) return null;
  // Compile probes exist only while a reviewer runs; Foo / Bar are placeholders in worked examples.
  if (/__hunt_probe|\/(Foo|Bar)(\/|$)/.test(ref)) return null;
  return ref;
};

let total = 0;
const files = targets();
for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const problems = [];
  const scripts = scriptsFor(file);
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      const at = `${i + 1}`;
      for (const [, span] of line.matchAll(/`([^`\n]+)`/g)) {
        const ref = cleanPath(span);
        if (ref && !resolves(ref)) problems.push(`${at}: path ${ref}`);
        const npm = span.match(/^npm run ([\w:-]*[\w-])(?![\w:<-])/);
        if (npm && scripts && !scripts.has(npm[1])) problems.push(`${at}: npm script ${npm[1]}`);
      }
      for (const [, name] of line.matchAll(/the `([a-z][a-z0-9-]*)` skill/g)) {
        if (!skills.has(name)) problems.push(`${at}: skill ${name}`);
      }
      for (const [, name] of line.matchAll(/`([A-Za-z][\w-]*)` (?:sub)?agent\b/g)) {
        if (!agents.has(name) && !BUILT_IN_AGENTS.has(name)) problems.push(`${at}: agent ${name}`);
      }
    });
  if (problems.length) {
    console.log(`${rel}\n${problems.map((p) => `  ${p}`).join('\n')}`);
    total += problems.length;
  }
}
console.log(`layer-refs: ${files.length} files, ${total} unresolved references`);
