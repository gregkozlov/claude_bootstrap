// Self-test for guard.mjs, Edit / Write / MultiEdit payloads. Paths use Windows backslashes and the
// texts carry real dashes, built here so no shell mangles them. Run from anywhere:
//   node .claude/hooks/tests/guard-test.mjs
// Every line must read "ok". Add a case per pattern in PROTECTED_PATHS (see the two marked below).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, '..', 'guard.mjs');
const root = resolve(here, '..', '..', '..');
const BS = String.fromCharCode(92);
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const inRoot = (...parts) => [root, ...parts].join(BS);
// A throwaway project holding a ledger that already exists, so the refusal is tested without touching this tree.
const ledgerRoot = mkdtempSync(join(tmpdir(), 'guard-ledger-'));
const ledger = join(ledgerRoot, '.claude', 'sessions', '1999-01-01T00-00-guardtst', 'agents.md');
mkdirSync(dirname(ledger), { recursive: true });
writeFileSync(ledger, '- 00:00 gate launched\n');

const cases = [
  ['Edit plain text (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: 'a - b' }, cwd: root }],
  ['Edit em dash (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'App.ts'), new_string: `a ${EM} b` }, cwd: root }],
  ['Write en dash (deny)', 2, { tool_name: 'Write', tool_input: { file_path: inRoot('README.md'), content: `a ${EN} b` }, cwd: root }],
  ['MultiEdit en dash (deny)', 2, { tool_name: 'MultiEdit', tool_input: { file_path: inRoot('src', 'App.ts'), edits: [{ old_string: 'a', new_string: `b ${EN} c` }] }, cwd: root }],
  ['Edit spelling the rule (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: inRoot('CLAUDE.md'), new_string: `plain hyphen, never ${EM}` }, cwd: root }],
  ['Write outside project with dash (allow)', 0, { tool_name: 'Write', tool_input: { file_path: ['C:', 'Users', 'x', 'memory', 'a.md'].join(BS), content: `a ${EM} b` }, cwd: root }],
  // The two in-tree ledger cases use a folder no session has, so the ledger does not exist there; the last two run against the temp project.
  // record-activity.mjs creates the ledger: no tool may create it first, and Write never replaces it.
  ['Write new agents.md (deny)', 2, { tool_name: 'Write', tool_input: { file_path: inRoot('.claude', 'sessions', '1999-01-01T00-00-guardtst', 'agents.md'), content: '- 00:00 gate launched' }, cwd: root }],
  ['Edit not-yet-existing agents.md (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('.claude', 'sessions', '1999-01-01T00-00-guardtst', 'agents.md'), new_string: 'x' }, cwd: root }],
  ['Write existing agents.md (deny)', 2, { tool_name: 'Write', tool_input: { file_path: ledger, content: 'x' }, cwd: ledgerRoot }, ledgerRoot],
  ['Edit existing agents.md (allow)', 0, { tool_name: 'Edit', tool_input: { file_path: ledger, new_string: 'x' }, cwd: ledgerRoot }, ledgerRoot],
  // PROTECTED_PATHS - replace these two with the project's own patterns; with an empty list both are "allow".
  // ['Edit generated client (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('src', 'api', 'generated', 'client.ts'), new_string: 'x' }, cwd: root }],
  // ['Edit schema (deny)', 2, { tool_name: 'Edit', tool_input: { file_path: inRoot('schemas', 'api.openapi.json'), new_string: 'x' }, cwd: root }],
];

let failed = 0;
try {
  for (const [name, want, payload, projectDir = root] of cases) {
    const r = spawnSync(process.execPath, [guard], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } });
    const ok = r.status === want;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${r.status}  ${(r.stderr ?? '').trim().slice(0, 60)}`);
  }
} finally {
  rmSync(ledgerRoot, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
