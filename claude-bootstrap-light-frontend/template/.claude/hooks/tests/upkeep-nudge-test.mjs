// Self-test for upkeep-nudge.mjs. Each case is a throwaway project in the temp directory, never this tree.
// Run from anywhere:
//   node .claude/hooks/tests/upkeep-nudge-test.mjs
// Every line must read "ok".
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, '..', 'upkeep-nudge.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'upkeep-nudge-'));
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// [name, the stamp's text or null for none, whether .git is a file (a linked worktree), the expected output]
const cases = [
  ['no stamp (nudge)', null, false, /has no recorded run/],
  ['stamp from today (silent)', `${daysAgo(0)}\n`, false, null],
  ['stamp 13 days old (silent)', `${daysAgo(13)}\n`, false, null],
  ['stamp 30 days old (nudge)', `${daysAgo(30)}\n`, false, /last ran 30 days ago/],
  ['unreadable stamp (nudge)', 'last week\n', false, /has no recorded run/],
  ['stamp 30 days ahead (nudge)', `${daysAgo(-30)}\n`, false, /dated in the future/],
  ['stamp dated tomorrow (silent)', `${daysAgo(-1)}\n`, false, null],
  ['BOM, CRLF and trailing text (silent)', `${String.fromCharCode(0xfeff)}${daysAgo(2)} weekly\r\n`, false, null],
  ['linked worktree, no stamp (silent)', null, true, null],
];

let failed = 0;
try {
  cases.forEach(([name, stamp, worktree, want], index) => {
    const project = join(scratch, String(index));
    mkdirSync(join(project, '.claude'), { recursive: true });
    if (worktree) writeFileSync(join(project, '.git'), 'gitdir: elsewhere\n');
    else mkdirSync(join(project, '.git'));
    if (stamp !== null) writeFileSync(join(project, '.claude', '.last-maintain'), stamp);
    const r = spawnSync(process.execPath, [hook], { input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project } });
    const out = (r.stdout ?? '').trim();
    const ok = r.status === 0 && (want ? want.test(out) && JSON.parse(out).hookSpecificOutput?.hookEventName === 'SessionStart' : out === '');
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(36)} exit ${r.status}  ${out.slice(0, 70)}`);
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
