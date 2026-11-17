// Self-test for guard.mjs, Edit / Write / MultiEdit / NotebookEdit payloads. Paths use the platform's separator and
// the texts carry real dashes, built here so no shell mangles them. Run from anywhere:
//   node .claude/hooks/tests/guard-test.mjs
// Every line must read "ok". Add a case per pattern in PROTECTED_PATHS (see the two marked below).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, '..', 'guard.mjs');
const root = resolve(here, '..', '..', '..');
const BS = String.fromCharCode(92);
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const inRoot = (...parts) => join(root, ...parts);
// Paths outside any project, spelled as this platform spells them: a drive-letter path reads as relative on POSIX.
const WIN = process.platform === 'win32';
const home = WIN ? ['C:', 'Users', 'x'].join(BS) : '/home/x';
const temp = WIN ? join(home, 'AppData', 'Local', 'Temp') : '/tmp';

// Copies of the guard with a known protected list, in the OS temp dir: one well filled, one misfilled.
const source = readFileSync(guard, 'utf8');
const RAW = /(const PROTECTED_RAW = String\.raw`)[^`]*(`)/;
const copies = mkdtempSync(join(tmpdir(), 'guard-test-'));
const withList = (file, raw) => {
  const path = join(copies, file);
  writeFileSync(path, source.replace(RAW, (_, open, close) => `${open}${raw}${close}`));
  return path;
};
const filled = withList('filled.mjs', '["src/api/generated/"]');
const misfilled = withList('misfilled.mjs', 'src/api/generated/');
// On a file system that ignores case a protected path in other capitals is the same file.
const foldsCase = process.platform === 'win32' || process.platform === 'darwin' ? 2 : 0;

const cases = [
  ['Edit plain text (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: 'a - b' }, cwd: root }],
  ['Edit em dash (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a ${EM} b` }, cwd: root }],
  ['Write en dash (deny)', 2, { tool_name: 'Write', tool_input: { file_path: inRoot('README.md'), content: `a ${EN} b` }, cwd: root }],
  // Only the en and em dash are banned; every other dash-like character passes.
  ['Edit two-em dash (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a ${String.fromCharCode(0x2e3a)} b` }, cwd: root }],
  ['Edit minus sign (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a ${String.fromCharCode(0x2212)} b` }, cwd: root }],
  ['Edit non-breaking hyphen (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a${String.fromCharCode(0x2011)}b` }, cwd: root }],
  ['MultiEdit en dash (deny)', 2, { tool_name: 'MultiEdit', tool_input: { file_path: inRoot('src', 'App.ts'), edits: [{ old_string: 'a', new_string: `b ${EN} c` }] }, cwd: root }],
  ['NotebookEdit em dash (deny)', 2, { tool_name: 'NotebookEdit', tool_input: { notebook_path: inRoot('a.ipynb'), new_source: `a ${EM} b` }, cwd: root }],
  ['Edit spelling the rule (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('CLAUDE.md'), new_string: `plain hyphen, never ${EM}` }, cwd: root }],
  ['Write outside project with dash (allow)', 0, { tool_name: 'Write', tool_input: { file_path: join(home, 'memory', 'a.md'), content: `a ${EM} b` }, cwd: root }],
  // The write fence: a payload naming a fenced agent may write only that agent's paths inside the project.
  ['hunt Write of its probe (allow)', 0, { tool_name: 'Write', agent_type: 'hunt', tool_input: { file_path: inRoot('<SRC_DIR>', '__hunt_probe.ts'), content: 'x' }, cwd: root }],
  ['hunt Edit of a source file (deny)', 2, { tool_name: 'Edit', agent_type: 'hunt', tool_input: { file_path: inRoot('<SRC_DIR>', 'App.ts'), new_string: 'x' }, cwd: root }],
  ['hunt NotebookEdit of a source notebook (deny)', 2, { tool_name: 'NotebookEdit', agent_type: 'hunt', tool_input: { notebook_path: inRoot('<SRC_DIR>', 'a.ipynb'), new_source: 'x' }, cwd: root }],
  ['hunt Write outside the project (allow)', 0, { tool_name: 'Write', agent_type: 'hunt', tool_input: { file_path: join(temp, 'p.json'), content: 'x' }, cwd: root }],
  // PROTECTED_PATHS - replace these two with the project's own patterns; with an empty list both are "allow".
  // ['Edit generated client (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'api', 'generated', 'client.ts'), new_string: 'x' }, cwd: root }],
  // ['Edit schema (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('schemas', 'api.openapi.json'), new_string: 'x' }, cwd: root }],
  // The copy with a known list: the matching itself, whatever this project's list is.
  ['copy: Write a protected path (deny)', 2, { tool_name: 'Write', tool_input: { file_path: inRoot('src', 'api', 'generated', 'x.ts'), content: 'x' }, cwd: root }, filled],
  ['copy: Write it in other capitals (deny where case folds)', foldsCase, { tool_name: 'Write', tool_input: { file_path: inRoot('src', 'API', 'Generated', 'x.ts'), content: 'x' }, cwd: root }, filled],
  ['copy: rm it in capitals (deny where case folds)', foldsCase, { tool_name: 'Bash', tool_input: { command: 'rm SRC/API/GENERATED/x.ts' }, cwd: root }, filled],
  // A misfilled list is named on stderr and protects nothing; every other check stays live.
  ['misfilled copy: plain Edit names the list (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: 'x' }, cwd: root }, misfilled, /PROTECTED_PATHS/],
  ['misfilled copy: em dash still refused (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a ${EM} b` }, cwd: root }, misfilled],
  ['misfilled copy: git commit still refused (deny)', 2, { tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: root }, misfilled],
];

let passed = 0;
let failed = 0;
if (!RAW.test(source)) {
  failed += 1;
  console.log('FAIL PROTECTED_RAW not found in guard.mjs - the copies below test nothing');
}
for (const [name, want, payload, hook = guard, stderr] of cases) {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const ok = r.status === want && (!stderr || stderr.test(r.stderr ?? ''));
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${r.status}  ${(r.stderr ?? '').trim().slice(0, 60)}`);
}
rmSync(copies, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
