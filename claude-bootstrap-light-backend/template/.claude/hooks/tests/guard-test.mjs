// Self-test for guard.mjs, Edit / Write / MultiEdit / NotebookEdit payloads, then the same guard under
// `--harness codex` with `apply_patch` payloads. Paths use the platform's separator and
// the texts carry real dashes, built here so no shell mangles them. Run from anywhere:
//   node .claude/hooks/tests/guard-test.mjs
// Every line must read "ok". Add a case per pattern in PROTECTED_PATHS (see the two marked below).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// The Codex form: the same guard started with `--harness codex`, fed payloads in the shape OpenAI Codex sends. A file
// edit is `apply_patch` with the patch text; a refusal is JSON on stdout with exit 0, a pass prints nothing.
const SRC = '<SRC_DIR>';
const patch = (...lines) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');
const P = (command, extra = {}) => ({ tool_name: 'apply_patch', tool_input: { command }, ...extra });
const as = (agent_type) => ({ agent_type, agent_id: `agent-${agent_type}` });
const session = `suite-${process.pid}-${Date.now()}`;
const markers = join(tmpdir(), 'ai-layer-rules', session);
const { CLAUDE_PROJECT_DIR: ignored, ...bareEnv } = process.env;
// Two throwaway projects for the path rules: one rule with globs, and one rule file without a `paths:` list.
const ruled = mkdtempSync(join(tmpdir(), 'guard-rules-'));
const ruledAll = mkdtempSync(join(tmpdir(), 'guard-rules-all-'));
mkdirSync(join(ruled, '.ai-layer', 'rules'), { recursive: true });
mkdirSync(join(ruledAll, '.ai-layer', 'rules'), { recursive: true });
writeFileSync(join(ruled, '.ai-layer', 'rules', 'forms.md'), "---\r\npaths:\r\n  - 'app/**/*.{ts,tsx}'\r\n  - \"*.form.json\"\r\n---\r\nrule text\r\n");
writeFileSync(join(ruledAll, '.ai-layer', 'rules', 'always.md'), '# no frontmatter\n');
const formPatch = P(patch('*** Add File: app/forms/Login.tsx', '+x'));

// [name, 'deny' | 'allow' | 'context', payload, { hook, project, env, reason }]
const codexCases = [
  ['patch: add a file (allow)', 'allow', P(patch(`*** Add File: ${SRC}/a.ts`, '+a - b'))],
  ['patch: an added em dash (deny)', 'deny', P(patch(`*** Add File: ${SRC}/a.ts`, `+a ${EM} b`)), { reason: /AGENTS\.md, Punctuation/ }],
  ['patch: an updated line with an en dash (deny)', 'deny', P(patch(`*** Update File: ${SRC}/a.ts`, '@@', '-a', `+b ${EN} c`))],
  ['patch: a dash on a removed or context line only (allow)', 'allow', P(patch(`*** Update File: ${SRC}/a.ts`, '@@', `-a ${EM} b`, ` c ${EN} d`, '+e'))],
  ['patch: a line spelling the rule (allow)', 'allow', P(patch('*** Update File: AGENTS.md', '@@', `+plain hyphen, never ${EM}`))],
  ['patch: outside the project with a dash (allow)', 'allow', P(patch(`*** Add File: ${join(temp, 'notes.md')}`, `+a ${EM} b`))],
  ['patch: CRLF and a padded header (deny)', 'deny', P(['*** Begin Patch', `  *** add file: ${SRC}/a.ts  `, `+a ${EM} b`, '*** End Patch'].join('\r\n'))],
  ['patch: a header look-alike on a context line hides no dash (deny)', 'deny', P(patch('*** Update File: docs/patches.md', '@@', ` *** Add File: ${join(temp, 'x')}`, `+a ${EM} b`))],
  ['patch: no file header (deny)', 'deny', P('*** Begin Patch\n*** End Patch'), { reason: /cannot be judged/ }],
  ['patch: no patch text (deny)', 'deny', { tool_name: 'apply_patch', tool_input: {} }],
  // A removed path is judged as the shell delete grant is: one project path per call, never a guarded one.
  ['patch: delete one file (allow)', 'allow', P(patch(`*** Delete File: ${SRC}/a.ts`))],
  ['patch: delete two files (deny)', 'deny', P(patch(`*** Delete File: ${SRC}/a.ts`, `*** Delete File: ${SRC}/b.ts`))],
  ['patch: delete under .git (deny)', 'deny', P(patch('*** Delete File: .git/config'))],
  ['patch: write under .git (deny)', 'deny', P(patch('*** Add File: .git/hooks/pre-commit', '+x'))],
  ['patch: a rename, both ends plain (allow)', 'allow', P(patch(`*** Update File: ${SRC}/a.ts`, `*** Move to: ${SRC}/b.ts`))],
  ['patch: a rename and a delete (deny)', 'deny', P(patch(`*** Update File: ${SRC}/a.ts`, `*** Move to: ${SRC}/b.ts`, `*** Delete File: ${SRC}/c.ts`))],
  ['patch: a rename with a dash in its change (deny)', 'deny', P(patch(`*** Update File: ${SRC}/a.ts`, `*** Move to: ${SRC}/b.ts`, '@@', `+a ${EM} b`))],
  // The layer's own files belong to the developer.
  ['patch: update a hook (deny)', 'deny', P(patch('*** Update File: .codex/hooks/guard.mjs', '@@', '+x')), { reason: /layer's own files/ }],
  ['patch: add hooks.json (deny)', 'deny', P(patch('*** Add File: .codex/hooks.json', '+{}'))],
  ['patch: add a command rules file (deny)', 'deny', P(patch('*** Add File: .codex/rules/more.rules', '+x'))],
  ['patch: update an agent (deny)', 'deny', P(patch('*** Update File: .codex/agents/hunt.toml', '@@', '+x'))],
  ['patch: update the Codex config (deny)', 'deny', P(patch('*** Update File: .codex/config.toml', '@@', '+x'))],
  ['patch: delete a hook (deny)', 'deny', P(patch('*** Delete File: .codex/hooks/guard.mjs'))],
  ['patch: rename a hook away (deny)', 'deny', P(patch('*** Update File: .codex/hooks/guard.mjs', `*** Move to: ${SRC}/g.mjs`))],
  ['patch: rename onto an agent (deny)', 'deny', P(patch(`*** Update File: ${SRC}/a.toml`, '*** Move to: .codex/agents/hunt.toml'))],
  ['patch: hooks.json reached from a subfolder (deny)', 'deny', P(patch('*** Update File: ../.codex/hooks.json', '@@', '+x'), { cwd: inRoot(SRC) })],
  ['patch: a hook named from inside .codex (deny)', 'deny', P(patch('*** Update File: hooks/guard.mjs', '@@', '+x'), { cwd: inRoot('.codex') })],
  ['patch: a skill file (allow)', 'allow', P(patch('*** Update File: .agents/skills/debug/SKILL.md', '@@', '+x'))],
  ['patch: a run-time layer file (allow)', 'allow', P(patch('*** Add File: .ai-layer/handoff.md', '+x'))],
  // The write fence by agent type: Codex agents have no tool list, so this is what keeps a reviewer read-only.
  ['hunt: add its probe (allow)', 'allow', P(patch(`*** Add File: ${SRC}/__hunt_probe.ts`, '+x'), as('hunt'))],
  ['hunt: update a source file (deny)', 'deny', P(patch(`*** Update File: ${SRC}/App.ts`, '@@', '+x'), as('hunt')), { reason: /hunt may write or remove only its compile probe/ }],
  ['hunt: delete its probe (allow)', 'allow', P(patch(`*** Delete File: ${SRC}/__hunt_probe.ts`), as('hunt'))],
  ['drift: update a doc (deny)', 'deny', P(patch('*** Update File: README.md', '@@', '+x'), as('drift')), { reason: /drift is read-only here/ }],
  ['gate: add a file (deny)', 'deny', P(patch(`*** Add File: ${SRC}/a.ts`, '+x'), as('gate'))],
  ['twins: update a source file (deny)', 'deny', P(patch(`*** Update File: ${SRC}/a.ts`, '@@', '+x'), as('twins'))],
  ['explorer: add a file (deny)', 'deny', P(patch(`*** Add File: ${SRC}/a.ts`, '+x'), as('explorer'))],
  ['drift: delete a file (deny)', 'deny', P(patch(`*** Delete File: ${SRC}/a.ts`), as('drift'))],
  ['drift: write outside the project (allow)', 'allow', P(patch(`*** Add File: ${join(temp, 'p.json')}`, '+x'), as('drift'))],
  ['comments: a plain update (allow)', 'allow', P(patch(`*** Update File: ${SRC}/a.ts`, '@@', '-// old', '+// new'), as('comments'))],
  ['comments: add a file (deny)', 'deny', P(patch(`*** Add File: ${SRC}/a.ts`, '+x'), as('comments')), { reason: /comments may only change an existing file/ }],
  ['comments: delete a file (deny)', 'deny', P(patch(`*** Delete File: ${SRC}/a.ts`), as('comments'))],
  ['comments: rename a file (deny)', 'deny', P(patch(`*** Update File: ${SRC}/a.ts`, `*** Move to: ${SRC}/b.ts`), as('comments'))],
  ['worker: add a file (allow)', 'allow', P(patch(`*** Add File: ${SRC}/a.ts`, '+x'), as('worker'))],
  // PROTECTED_PATHS, on the copy with a known list; a path is also judged as it resolves from a subfolder.
  ['copy: add a protected path (deny)', 'deny', P(patch('*** Add File: src/api/generated/x.ts', '+x')), { hook: filled, reason: /PROTECTED_PATHS/ }],
  ['copy: a protected path named from a subfolder (deny)', 'deny', P(patch('*** Update File: generated/x.ts', '@@', '+x'), { cwd: inRoot('src', 'api') }), { hook: filled }],
  ['copy: delete a protected path (deny)', 'deny', P(patch('*** Delete File: src/api/generated/x.ts')), { hook: filled }],
  ['copy: rename onto a protected path (deny)', 'deny', P(patch('*** Update File: src/a.ts', '*** Move to: src/api/generated/a.ts')), { hook: filled }],
  ['copy: a plain path (allow)', 'allow', P(patch('*** Add File: src/a.ts', '+x')), { hook: filled }],
  // A list that failed to parse cannot be reported on stderr there: every call is refused, naming the list.
  ['misfilled copy: a read is refused, naming the list (deny)', 'deny', { tool_name: 'Bash', tool_input: { command: 'git status' } }, { hook: misfilled, reason: /PROTECTED_PATHS is not a JSON array/ }],
  ['misfilled copy: a session start is left alone (allow)', 'allow', { hook_event_name: 'SessionStart', source: 'startup' }, { hook: misfilled }],
  // The root is where the guard is installed, never the cwd; a session outside it is refused whole.
  ['root from the guard file: a dash from a subfolder (deny)', 'deny', P(patch('*** Add File: ../notes.md', `+a ${EM} b`), { cwd: inRoot(SRC) }), { env: bareEnv }],
  ['a session outside the project (deny)', 'deny', P(patch('*** Add File: a.md', '+x'), { cwd: temp }), { reason: /outside it/ }],
  ['an event that is not a tool call (allow)', 'allow', { hook_event_name: 'Stop' }],
  // Path rules: the first patch that writes a path a rule reaches is refused once per session and agent.
  ['rules: the first patch on a ruled path (deny)', 'deny', formPatch, { project: ruled, reason: /read \.ai-layer\/rules\/forms\.md in full, then retry/ }],
  ['rules: the retry (allow)', 'allow', formPatch, { project: ruled }],
  ['rules: another agent in the session (deny)', 'deny', { ...formPatch, ...as('worker') }, { project: ruled }],
  ['rules: a slash-less glob at any depth (deny)', 'deny', P(patch('*** Add File: data/x/a.form.json', '+{}'), as('other')), { project: ruled }],
  ['rules: a path no rule reaches (allow)', 'allow', P(patch('*** Add File: lib/app.ts', '+x'), as('third')), { project: ruled }],
  ['rules: a delete reads no rule (allow)', 'allow', P(patch('*** Delete File: app/forms/Old.tsx'), as('third')), { project: ruled }],
  ['rules: a compaction (allow)', 'allow', { hook_event_name: 'SessionStart', source: 'compact' }, { project: ruled }],
  ['rules: the first patch after it (deny)', 'deny', formPatch, { project: ruled }],
  ['rules: no session id, context instead (context)', 'context', { ...formPatch, session_id: undefined }, { project: ruled, reason: /forms\.md/ }],
  ['rules: an unusable session id, context instead (context)', 'context', { ...formPatch, session_id: '..' }, { project: ruled }],
  ['rules: a rule without paths reaches every path (deny)', 'deny', P(patch('*** Add File: any/where.txt', '+x')), { project: ruledAll, reason: /always\.md/ }],
];

const CLAUDE_WORDS = /CLAUDE|\.claude[\\/]|Edit or Write|scratchpad/;
for (const [name, want, payload, { hook = guard, project = root, env, reason } = {}] of codexCases) {
  const r = spawnSync(process.execPath, [hook, '--harness', 'codex'], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: session, cwd: project, ...payload }),
    encoding: 'utf8',
    env: env ?? { ...process.env, CLAUDE_PROJECT_DIR: project },
  });
  let said = {};
  try {
    said = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : {};
  } catch {
    said = { permissionDecision: 'unreadable' };
  }
  const text = said.permissionDecisionReason ?? said.additionalContext ?? '';
  const verdict = said.permissionDecision ?? (said.additionalContext ? 'context' : 'allow');
  // The wording check reads the sentence, not the paths in it: this project may itself sit under a folder named so.
  const sentence = [project, root, temp].reduce((rest, folder) => rest.split(folder).join(''), text);
  const ok = r.status === 0 && verdict === want && (verdict === 'allow' || said.hookEventName === 'PreToolUse') && (!reason || reason.test(text)) && !CLAUDE_WORDS.test(sentence);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${r.status}  ${verdict}  ${text.slice(0, 60)}`);
}
{
  const r = spawnSync(process.execPath, [guard, '--harness', 'codex', '--rules-for', 'app/forms/Login.tsx', 'lib/app.ts'], { cwd: ruled, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: ruled } });
  const ok = r.status === 0 && r.stdout.trim() === '.ai-layer/rules/forms.md';
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${'--rules-for lists the rule files for a path'.padEnd(44)} exit ${r.status}  ${r.stdout.trim().slice(0, 60)}`);
}
for (const folder of [ruled, ruledAll, markers]) rmSync(folder, { recursive: true, force: true });
rmSync(copies, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
