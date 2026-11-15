// Self-test for guard.mjs, Edit / Write / MultiEdit payloads. Paths use Windows backslashes and the
// texts carry real dashes, built here so no shell mangles them. Run from anywhere:
//   node .claude/hooks/tests/guard-test.mjs
// Every line must read "ok". Add a case per pattern in PROTECTED_PATHS (see the two marked below).
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, '..', 'guard.mjs');
const root = resolve(here, '..', '..', '..');
const BS = String.fromCharCode(92);
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const inRoot = (...parts) => [root, ...parts].join(BS);

const cases = [
  ['Edit plain text (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: 'a - b' }, cwd: root }],
  ['Edit em dash (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a ${EM} b` }, cwd: root }],
  ['Write en dash (deny)', 2, { tool_name: 'Write', tool_input: { file_path: inRoot('README.md'), content: `a ${EN} b` }, cwd: root }],
  ['Edit two-em dash (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a ${String.fromCharCode(0x2e3a)} b` }, cwd: root }],
  ['MultiEdit en dash (deny)', 2, { tool_name: 'MultiEdit', tool_input: { file_path: inRoot('src', 'App.ts'), edits: [{ old_string: 'a', new_string: `b ${EN} c` }] }, cwd: root }],
  ['Edit spelling the rule (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('CLAUDE.md'), new_string: `plain hyphen, never ${EM}` }, cwd: root }],
  ['Write outside project with dash (allow)', 0, { tool_name: 'Write', tool_input: { file_path: ['C:', 'Users', 'x', 'memory', 'a.md'].join(BS), content: `a ${EM} b` }, cwd: root }],
  // The write fence: a payload naming a fenced agent may write only that agent's paths inside the project.
  ['hunt Write of its probe (allow)', 0, { tool_name: 'Write', agent_type: 'hunt', tool_input: { file_path: inRoot('<SRC_DIR>', '__hunt_probe.ts'), content: 'x' }, cwd: root }],
  ['hunt Edit of a source file (deny)', 2, { tool_name: 'Edit', agent_type: 'hunt', tool_input: { file_path: inRoot('<SRC_DIR>', 'App.ts'), new_string: 'x' }, cwd: root }],
  ['hunt Write outside the project (allow)', 0, { tool_name: 'Write', agent_type: 'hunt', tool_input: { file_path: ['C:', 'Users', 'x', 'AppData', 'Local', 'Temp', 'p.json'].join(BS), content: 'x' }, cwd: root }],
  // PROTECTED_PATHS - replace these two with the project's own patterns; with an empty list both are "allow".
  // ['Edit generated client (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'api', 'generated', 'client.ts'), new_string: 'x' }, cwd: root }],
  // ['Edit schema (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('schemas', 'api.openapi.json'), new_string: 'x' }, cwd: root }],
];

let failed = 0;
for (const [name, want, payload] of cases) {
  const r = spawnSync(process.execPath, [guard], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const ok = r.status === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${r.status}  ${(r.stderr ?? '').trim().slice(0, 60)}`);
}
process.exit(failed ? 1 : 0);
