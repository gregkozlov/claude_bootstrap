// Rule reach: which path-scoped rules load for which file, measured the way the loader matches.
//   node .claude/scripts/rules-reach.mjs            report - rule bytes a Read of each source file pulls in
//   node .claude/scripts/rules-reach.mjs --check    shape check + rules-reach.fixture.json; exit 1 on a failure
//   node .claude/scripts/rules-reach.mjs --loads [session id prefix]
//                                                   replay the loads record-loads.mjs logged against this model
// Needs Node 22.5+ or 20.17+ (path.matchesGlob) and git. Mechanics in .claude/rules/rules-reach.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULES = path.join(ROOT, '.claude', 'rules');
const FIXTURE = path.join(ROOT, '.claude', 'scripts', 'rules-reach.fixture.json');
const SRC = '<SRC_DIR>/';
// Sessions never stage, so a file this change created is untracked and still has to count.
const LS_FILES = ['-C', ROOT, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

let listed;
const listedFiles = () => (listed ??= [...new Set(execFileSync('git', LS_FILES, { encoding: 'utf8' }).split('\0').filter(Boolean))]);
const ancestors = (file) => {
  const parts = file.split('/').slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
};
let dirs;
const listedDirs = () => (dirs ??= [...new Set(listedFiles().flatMap(ancestors))]);

const loadRules = () =>
  fs
    .readdirSync(RULES)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.md$/, '');
      const text = fs.readFileSync(path.join(RULES, file), 'utf8');
      const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      const rule = { name, text, body: front ? text.slice(front[0].length) : text, size: Buffer.byteLength(text), globs: [], problems: [] };
      const lines = front?.[1].split(/\r?\n/) ?? [];
      const at = lines.indexOf('paths:');
      if (at === -1 || lines.filter((line) => /^paths\s*:/.test(line)).length !== 1) {
        rule.problems.push(
          `${file}: no single \`paths:\` block list in the frontmatter - with none the loader loads it on every session, and a flow list or a string it reads as globs this script cannot check`
        );
        return rule;
      }
      for (const line of lines.slice(at + 1)) {
        if (/^[^\s#]/.test(line)) break;
        const glob = line.match(/^\s+-\s'([^']+)'$/)?.[1];
        if (glob === undefined) rule.problems.push(`${file}: a \`paths:\` line that is not a single-quoted item: "${line}"`);
        else rule.globs.push(glob);
      }
      if (rule.globs.length === 0) rule.problems.push(`${file}: empty \`paths:\` list`);
      return rule;
    });

const shapeProblems = (rule) =>
  rule.globs.flatMap((glob) => {
    const problems = [];
    const groups = glob.match(/\{[^{}]*\}/g) ?? [];
    if (/\s/.test(glob)) problems.push('whitespace');
    if (glob.replace(/\{[^{}]*\}/g, '').includes(',')) problems.push('a comma outside the brace group');
    if (groups.some((group) => group.slice(1, -1).split(',').includes(''))) problems.push('an empty brace alternative');
    if (/\{[^}]*\{/.test(glob)) problems.push('nested braces');
    if (groups.length > 1) problems.push('more than one brace group');
    if (groups.some((group) => !group.includes(','))) problems.push('a brace group with one alternative');
    const alts = groups.length === 1 ? groups[0].slice(1, -1).split(',') : [null];
    for (const alternative of alts.map((alt) => (alt === null ? glob : glob.replace(groups[0], alt)))) {
      const stripped = alternative.endsWith('/**');
      const base = stripped ? alternative.slice(0, -3) : alternative;
      const label = alternative === glob ? '' : `'${alternative}': `;
      if (!base || /^\.?\//.test(base) || alternative.endsWith('/') || alternative.includes('//')) problems.push(`${label}a stray slash`);
      if (stripped && base.split('/').at(-1).endsWith('*')) problems.push(`${label}a segment ending in * before /**`);
      if (stripped && !base.includes('/')) problems.push(`${label}matches that folder name at any depth`);
      // The loader matches a slash-less glob at any depth; that only disagrees when something nested shares the name.
      const hit = (item) => path.posix.matchesGlob(base.includes('/') ? item : path.posix.basename(item), base);
      const namesake = !stripped && !base.includes('/') && listedFiles().find((f) => f.includes('/') && hit(f));
      if (namesake) problems.push(`${label}a nested file matches it too (${namesake})`);
      if (!stripped && listedDirs().some(hit)) problems.push(`${label}a directory matches it`);
    }
    return [...new Set(problems)].map((problem) => `${rule.name}.md: '${glob}' - ${problem}`);
  });

const matches = (rule, file) => rule.globs.some((glob) => path.posix.matchesGlob(file, glob));

const rules = loadRules();
const shapes = rules.flatMap((rule) => [...rule.problems, ...shapeProblems(rule)]);
for (const problem of shapes) console.log(`SHAPE ${problem}`);

if (process.argv[2] === '--check') {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const byName = new Map(rules.map((rule) => [rule.name, rule]));
  const known = new Set(listedFiles());
  let failures = 0;
  let warnings = 0;
  const fail = (message) => {
    failures++;
    console.log(`FAIL  ${message}`);
  };
  // Windows resolves `src\x.ts`, `./src/x.ts` and a wrong case, and no glob matches them.
  const usable = (file) => {
    const onDisk = fs.existsSync(path.join(ROOT, file));
    if (onDisk && known.has(file)) return true;
    if (onDisk) {
      fail(`${file} is not in git ls-files form (forward slashes, exact case) or is gitignored`);
    } else {
      warnings++;
      console.log(`WARN  ${file} no longer exists - update rules-reach.fixture.json`);
    }
    return false;
  };
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const valid = (entry, needle) => text(entry.file) && text(entry.rule) && (!needle || text(entry.needle));
  for (const entry of fixture.must) {
    const { file, rule, needle } = entry;
    const target = byName.get(rule);
    if (!valid(entry, true)) fail(`fixture entry ${JSON.stringify(entry)} needs file, rule and a non-empty needle`);
    else if (!target) fail(`${file} -> ${rule}: no such rule`);
    else if (!usable(file)) continue;
    else if (!matches(target, file)) fail(`${file} -> ${rule}: no glob matches`);
    else if (!target.body.includes(needle)) fail(`${file} -> ${rule}: the rule no longer contains "${needle}"`);
  }
  for (const entry of fixture.mustNot) {
    const { file, rule } = entry;
    const target = byName.get(rule);
    if (!valid(entry, false)) fail(`fixture entry ${JSON.stringify(entry)} needs file and rule`);
    else if (!target) fail(`${file} -> ${rule}: no such rule`);
    else if (usable(file) && matches(target, file)) fail(`${file} -> ${rule}: loads, and must not`);
  }
  const pairs = fixture.must.length + fixture.mustNot.length;
  console.log(`rules-reach: ${pairs} pairs, ${failures} failed, ${warnings} warnings, ${shapes.length} rule shape problems`);
  if (failures || shapes.length) process.exitCode = 1;
} else if (process.argv[2] === '--loads') {
  // Written by .claude/hooks/record-loads.mjs, keyed by the same hash of the repo root.
  const cache = process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  const key = createHash('sha256')
    .update(ROOT.replace(/^[a-z]:/, (drive) => drive.toUpperCase()).replaceAll('\\', '/'))
    .digest('hex')
    .slice(0, 16);
  const dir = path.join(cache, 'claude-verify-gate', `loads-${key}`);
  const read = (name) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      return undefined;
    }
  };
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
  const parsed = names.map(read);
  const records = parsed.filter(Boolean).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const byName = new Map(rules.map((rule) => [rule.name, rule]));
  const expand = (glob) => {
    const group = glob.match(/\{[^{}]*\}/);
    return group
      ? group[0]
          .slice(1, -1)
          .split(',')
          .flatMap((alt) => expand(glob.replace(group[0], alt)))
      : [glob];
  };
  const loaderForm = (glob) => expand(glob).map((g) => (g.endsWith('/**') ? g.slice(0, -3) : g));
  // The loader matches case-insensitively; `--check` refuses a wrong-case fixture path instead.
  const reaches = (rule, file) => rule.globs.some((glob) => path.posix.matchesGlob(file.toLowerCase(), glob.toLowerCase()));
  // A slash-less glob matches at any depth, as the loader's gitignore semantics do.
  const reachesLoaded = (glob, file) =>
    (glob.includes('/') ? [glob, `${glob}/**`] : [glob, `${glob}/**`, `**/${glob}`, `**/${glob}/**`]).some((g) =>
      path.posix.matchesGlob(file.toLowerCase(), g.toLowerCase())
    );
  const sameSet = (a, b) => [...new Set(a)].sort().join('\n') === [...new Set(b)].sort().join('\n');
  // The loader also matches a gitignored namesake (`node_modules/x/package.json`); a trigger merely gone from the tree is still checked.
  const tracked = new Set(listedFiles().map((file) => file.toLowerCase()));
  const ignoredCache = new Map();
  const ignored = (file) => {
    if (!ignoredCache.has(file)) {
      let result = true;
      try {
        execFileSync('git', ['-C', ROOT, 'check-ignore', '-q', '--no-index', '--', file], { stdio: 'ignore' });
      } catch {
        result = false;
      }
      ignoredCache.set(file, result);
    }
    return ignoredCache.get(file);
  };
  const shaped = new Set(rules.filter((rule) => shapeProblems(rule).length).map((rule) => rule.name));
  const localTime = (at) => {
    const date = new Date(at);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
  };
  const findings = new Map();
  const report = (message) => findings.set(message, (findings.get(message) ?? 0) + 1);
  let checked = 0;
  let stale = 0;
  let gitignored = 0;
  let malformed = parsed.length - records.length;
  for (const record of records) {
    if (typeof record.load_reason !== 'string' || typeof record.file_path !== 'string' || typeof record.memory_type !== 'string') {
      malformed++;
      continue;
    }
    if (record.memory_type !== 'Project') continue;
    const file = path.resolve(record.file_path);
    if (path.relative(RULES, path.dirname(file)) !== '') continue;
    const rule = byName.get(path.basename(file, '.md'));
    if (!rule || rule.problems.length || shaped.has(rule.name)) continue;
    if (fs.statSync(file).mtimeMs > Date.parse(record.at)) {
      stale++;
      continue;
    }
    if (record.load_reason === 'session_start') {
      report(
        `ALWAYS ${rule.name}.md loaded at session start - the loader read no globs from it, rules-reach reads ${JSON.stringify(rule.globs)}`
      );
      continue;
    }
    if (record.load_reason !== 'path_glob_match') continue;
    checked++;
    const trigger =
      typeof record.trigger_file_path === 'string' ? path.relative(ROOT, path.resolve(record.trigger_file_path)).replaceAll('\\', '/') : '';
    const inside = trigger !== '' && !trigger.startsWith('..') && !path.isAbsolute(trigger);
    const ours = rule.globs.flatMap(loaderForm);
    const logged = Array.isArray(record.globs) ? record.globs : [];
    // The event ships the rule's whole list but is described as carrying the matched patterns: either shape passes, nothing else.
    const whole = logged.length > 0 && sameSet(logged, ours);
    const matchedOnly = inside && logged.length > 0 && logged.every((glob) => ours.includes(glob) && reachesLoaded(glob, trigger));
    if (!whole && !matchedOnly) {
      report(`PARSER ${rule.name}.md: the loader read ${JSON.stringify(record.globs)}, rules-reach reads ${JSON.stringify(ours)}`);
    }
    if (inside && !tracked.has(trigger.toLowerCase()) && ignored(trigger)) {
      gitignored++;
    } else if (!inside || !reaches(rule, trigger)) {
      report(`REACH  ${rule.name}.md loaded for ${record.trigger_file_path ?? '(no trigger)'}, which rules-reach does not match`);
    }
  }
  const session = process.argv[3];
  if (session) {
    const shown = (p) => {
      const relative = path.relative(ROOT, path.resolve(p)).replaceAll('\\', '/');
      return relative.startsWith('..') || path.isAbsolute(relative) ? p : relative;
    };
    for (const record of records.filter((r) => typeof r.session_id === 'string' && r.session_id.startsWith(session))) {
      const trigger = typeof record.trigger_file_path === 'string' ? ` <- ${shown(record.trigger_file_path)}` : '';
      console.log(`${localTime(record.at)} ${record.load_reason} ${shown(record.file_path)}${trigger}`);
    }
    console.log('');
  }
  for (const [message, count] of findings) console.log(`${message}${count > 1 ? ` (${count} loads)` : ''}`);
  if (malformed) {
    console.log(
      `FAIL  ${malformed} records unreadable or without load_reason, file_path or memory_type - a payload field moved; read one record in ${dir}`
    );
  }
  if (records.length === 0) {
    console.log(
      `FAIL  nothing recorded in ${dir} - no session in this tree for 15 days, or record-loads.mjs is not firing. Nothing was verified.`
    );
  } else if (checked === 0) {
    console.log('FAIL  no rule load left to check - none recorded, or every one is older than its rule. Nothing was verified.');
  }
  console.log(
    `rules-reach loads: ${records.length} records, ${checked} rule loads checked, ${findings.size} mismatches, ${stale} older than their rule, ${gitignored} gitignored triggers`
  );
  if (findings.size || malformed || checked === 0) process.exitCode = 1;
} else {
  const files = listedFiles().filter((file) => file.startsWith(SRC) && /\.(tsx?|jsx?|mjs|py|rs|go|java|kt|cs)$/.test(file));
  if (files.length === 0) {
    console.log(`no source files under ${SRC} - nothing to measure`);
  } else {
    const reach = (rule) => files.filter((file) => matches(rule, file)).length;
    const perFile = files
      .map((file) => {
        const hit = rules.filter((rule) => matches(rule, file));
        return { file, bytes: hit.reduce((sum, rule) => sum + rule.size, 0), rules: hit.map((rule) => rule.name) };
      })
      .sort((a, b) => b.bytes - a.bytes);
    const at = (share) => perFile[Math.floor(perFile.length * share)].bytes;
    const over = (bytes) => perFile.filter((f) => f.bytes > bytes).length;
    console.log(
      `${files.length} source files; rule text per file: median ${kb(at(0.5))}, top-decile ${kb(at(0.1))}, max ${kb(perFile[0].bytes)}`
    );
    console.log(`files over 30 KB: ${over(30720)}, over 20 KB: ${over(20480)}\n`);
    console.log('| Rule text | File | Rules |\n| ---: | --- | --- |');
    for (const f of perFile.slice(0, 15)) console.log(`| ${kb(f.bytes)} | ${f.file} | ${f.rules.join(', ')} |`);
    console.log('\n| Rule | Size | Files | Globs matching nothing |\n| --- | ---: | ---: | --- |');
    for (const rule of [...rules].sort((a, b) => b.size * reach(b) - a.size * reach(a))) {
      const dead = rule.globs.filter((glob) => glob.startsWith(SRC) && !files.some((file) => path.posix.matchesGlob(file, glob)));
      console.log(`| ${rule.name} | ${kb(rule.size)} | ${reach(rule)} | ${dead.join(', ')} |`);
    }
  }
  if (shapes.length) process.exitCode = 1;
}
