#!/usr/bin/env node
// Says, at session start, when this tree has no Stop gate. The gate is opt-in and personal, its registration
// lives in the gitignored .claude/settings.local.json, and `git worktree add` does not carry that file: a
// second tree can run for weeks with no verification and nothing says so. Registered in the tracked
// settings.json, because the whole point is to speak in a tree where nothing local is set up.
//
// Reports, never blocks. Exits 0 whatever happens.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LOCAL = 'settings.local.json';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function stopHookMissing(root) {
  const parsed = JSON.parse(await readFile(path.join(root, '.claude', LOCAL), 'utf8'));
  return !JSON.stringify(parsed.hooks?.Stop ?? '').includes('verify-gate.mjs');
}

try {
  const payload = JSON.parse(await readStdin());
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  if (await stopHookMissing(root).catch(() => true)) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `No Stop verification gate is registered in this tree (.claude/${LOCAL} has no Stop hook for verify-gate.mjs), so nothing re-runs the project's checks at the end of a turn. Run the check command by hand before finishing, and tell the owner the gate is off here; .claude/hooks/README.md has the block to paste.`,
        },
      })}\n`
    );
  }
} catch {
  // A session must start whatever this hook thinks.
}
process.exit(0);
