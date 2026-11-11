// Rule reach: which path-scoped rules load for which file, measured the way the loader matches.
//   node .claude/scripts/rules-reach.mjs                report - rule bytes a Read of each source file pulls in
//   node .claude/scripts/rules-reach.mjs --check        glob shapes + the per-rule byte budget; exit 1 on a failure
//   node .claude/scripts/rules-reach.mjs --files <rule> the tracked files a rule's globs match, one per line
// Needs Node 22.5+ or 20.17+ (path.matchesGlob) and git. Mechanics in .claude/skills/maintain-ai-layer/references/rules.md,
// "Writing a rule".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULES = path.join(ROOT, '.claude', 'rules');
const RULE_BUDGET = 20 * 1024;
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

// A layer with no project rule yet has no folder either: an empty set, which `--check` passes.
const loadRules = () =>
  (fs.existsSync(RULES) ? fs.readdirSync(RULES) : [])
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.md$/, '');
      const text = fs.readFileSync(path.join(RULES, file), 'utf8');
      const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      // Sized on the LF text, as the budgets are; a checkout can leave a rule CRLF on disk.
      const rule = { name, size: Buffer.byteLength(text.replace(/\r\n/g, '\n')), globs: [], problems: [] };
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
// `--files` keeps stdout to paths alone: its callers count lines.
const notice = process.argv[2] === '--files' ? console.error : console.log;
for (const problem of shapes) notice(`SHAPE ${problem}`);

if (process.argv[2] === '--check') {
  const over = rules.filter((rule) => rule.size > RULE_BUDGET);
  for (const rule of over) console.log(`FAIL  ${rule.name}.md is ${kb(rule.size)}, over the ${kb(RULE_BUDGET)} per-rule budget`);
  console.log(`rules-reach: ${rules.length} rules, ${over.length} over budget, ${shapes.length} rule shape problems`);
  if (shapes.length || over.length) process.exitCode = 1;
} else if (process.argv[2] === '--files') {
  const name = process.argv[3]?.replace(/\.md$/, '');
  const rule = rules.find((r) => r.name === name);
  if (rule) {
    for (const file of listedFiles().filter((file) => matches(rule, file))) console.log(file);
  } else {
    notice(`FAIL  no rule named ${name ?? '(none given)'} in .claude/rules`);
    process.exitCode = 1;
  }
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
