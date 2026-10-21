#!/usr/bin/env node
// Names this session's artifact folder at the three moments the model can lose it. The folder is
// `.claude/sessions/<start>-<session prefix>/`, so the session id in the payload finds it without scanning
// contents and without ever touching another session's folder.
//
//   SessionStart - `additionalContext`: the session's id prefix, and the folder it has or the name to open one
//                  under; after a compaction, also where to resume from. Nothing else tells the model its own session id.
//   PreCompact   - `systemMessage`: the user sees the path before the summary.
//   PostCompact  - `systemMessage` only: the harness rejects `hookSpecificOutput` for this event.
//
// Neither compaction event can write the handoff: no turn exists between the hook and the summary, so that
// stays `/precompact`.
//
// Registered in the tracked settings.json. Reports, never blocks. Exits 0 whatever happens.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const SESSIONS_DIR = '.claude/sessions';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function ownFolder(root, prefix) {
  const names = await readdir(path.join(root, SESSIONS_DIR)).catch(() => []);
  return names.find((name) => name.endsWith(`-${prefix}`));
}

// Local time, the way the existing folders are named.
function startStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function sessionStartContext(prefix, folder, source) {
  if (!folder) {
    return `This session's id prefix is ${prefix}. When a task opens this session's artifact folder (lifecycle step 1), the folder is ${SESSIONS_DIR}/${startStamp()}-${prefix}/.`;
  }
  const named = `This session's id prefix is ${prefix}; its artifact folder is ${SESSIONS_DIR}/${folder}/.`;
  if (source !== 'compact') return named;
  return [
    named,
    'Read its task file before continuing - it carries the brief, the file list, the adjudicated findings and the open risks, none of which the summary keeps.',
    "Write only into this folder. Another session's folder is read only when the owner named it to continue from in their first message, or by `/maintain-ai-layer efficiency`, for statistics.",
  ].join(' ');
}

try {
  const payload = JSON.parse(await readStdin());
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const sessionId = payload.session_id;
  if (typeof sessionId === 'string' && sessionId.length >= 8) {
    const prefix = sessionId.slice(0, 8);
    const folder = await ownFolder(root, prefix);
    let output;
    if (payload.hook_event_name === 'SessionStart') {
      output = {
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: sessionStartContext(prefix, folder, payload.source) },
      };
    } else if (folder) {
      // Nothing to point at before compaction without a folder: this session never opened a task file.
      const where = `${SESSIONS_DIR}/${folder}/`;
      let systemMessage = `Auto-compacting. This session's notes are in ${where}.`;
      if (payload.hook_event_name === 'PostCompact') systemMessage = `Compaction done. This session's notes are in ${where}.`;
      else if (payload.trigger === 'manual') {
        systemMessage = `Compacting. This session's notes are in ${where} - a handoff needs /precompact before /compact, the summary will not carry one.`;
      }
      output = { systemMessage };
    }
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  }
} catch {
  // A session start or a compaction must proceed whatever this hook thinks.
}
process.exit(0);
