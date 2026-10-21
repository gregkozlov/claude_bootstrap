#!/usr/bin/env node
// Activity recorder: appends one file per event to a directory the Stop gate reads, so a turn can be
// judged on what actually happened rather than on what the reply claims. Four events are recorded - an agent
// being launched and an agent finishing (PostToolUse on Agent, SubagentStop), a file edit by the model or a
// subagent (PostToolUse on Edit / Write / MultiEdit) and a browser navigation (PostToolUse on the chrome navigate
// tool). Registered in .claude/settings.json, so it runs for the whole team; only the Stop gate, which is
// personal and opt-in, ever reads what it writes - plus `agents.md` in the session's own folder, when the
// session keeps one. That ledger is this hook's alone: the first launch, or the first edit of a file inside the
// session's folder, that finds no ledger creates it, backfilled with the rows of the launches made before the
// folder existed; every later launch appends its row.
//
// Append-only by design: writers never rewrite a record and never touch the gate's own state file (the one
// read is the launch records, when the ledger is first created). The gate's state is a single object rewritten
// in place, and this hook fires from parallel agents (the lifecycle launches several in one message), so a
// read-modify-write here would lose records and a write into the gate's file would destroy the baseline it hashes.
//
// Reads one JSON payload on stdin, writes nothing on stdout, always exits 0: a recorder that fails must
// never block a tool call or a turn.
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, link, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A resumed session reopens the next day; its records have to outlive a night.
const PRUNE_AFTER_MS = 48 * 60 * 60 * 1000;
// A launch hook that found no folder a moment ago may still be writing its record when the ledger is opened, so
// the ledger waits this long before reading the launch records it backfills from.
const LEDGER_SETTLE_MS = 250;
// Only a navigation names the surface it reached, and only a named surface can be judged. `read_page` and
// its friends carry no url, so recording them would let the machine-marker check that the browser ritual
// always does first stand in for looking at the app.
const BROWSER_TOOL = 'mcp__claude-in-chrome__navigate';
const APP_PATH = '<DEV_BASE_PATH>';
// guard.mjs's DASH set: one in a launch description would make every Edit anchored on its agents.md row fail.
const DASH = new RegExp(
  `[${String.fromCharCode(0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212, 0xff0d, 0x2e3a, 0x2e3b, 0xfe58, 0xfe31, 0xfe32, 0xfe63)}]`,
  'g',
);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// CLAUDE_PROJECT_DIR is set by the harness for every hook command, so the root costs no process spawn -
// this hook fires on every browser call and every edit, where a `git rev-parse` per event would show.
function repoRoot(payload) {
  const raw = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  return path.resolve(raw).replace(/\\/g, '/');
}

function eventDir(root) {
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'claude-verify-gate', `events-${key}`);
}

function relativePath(root, filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return undefined;
  const relative = path.relative(root, path.resolve(filePath));
  // On Windows `path.relative` between two drives returns the target unchanged rather than a `..` path, so
  // a file on another drive reads as a repo file without this.
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return relative.replace(/\\/g, '/');
}

async function prune(dir) {
  const cutoff = Date.now() - PRUNE_AFTER_MS;
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await stat(full).catch(() => undefined);
    if (info && info.mtimeMs < cutoff) await rm(full, { force: true }).catch(() => {});
  }
}

// The launch row goes in the session's own artifact folder, so the model can read back which agents it started
// without trusting its own memory of a long turn. Written on launch and not on finish, because only the launch
// fires in the main thread's own tool call. The description is what tells two launches of one type apart.
//
// Appended, never rewritten: the lifecycle launches several agents in one message, and a read-modify-write here
// would drop rows. The verdict is the model's to add on the line below; an empty one is a visible gap.
async function sessionFolder(root, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length < 8) return undefined;
  const sessions = path.join(root, '.claude', 'sessions');
  const suffix = `-${sessionId.slice(0, 8)}`;
  const folder = (await readdir(sessions)).find((name) => name.endsWith(suffix));
  // No folder means this session keeps no task file, and inventing one from a hook would be noise.
  return folder ? path.join(sessions, folder) : undefined;
}

function agentRow({ type, description, at }) {
  const label = description ? ` - ${description}` : '';
  return `- ${new Date(at).toTimeString().slice(0, 5)} ${type} launched${label}\n`;
}

// Opens the ledger with the launches made before the folder existed. The records are read before the file appears:
// a launch whose record is already there either found no folder (so it has no row) or created the file itself.
async function openLedger(root, sessionId, folder) {
  const ledger = path.join(folder, 'agents.md');
  if (await stat(ledger).catch(() => undefined)) return ledger;
  await new Promise((resolve) => setTimeout(resolve, LEDGER_SETTLE_MS));
  const dir = eventDir(root);
  const earlier = [];
  for (const name of await readdir(dir).catch(() => [])) {
    if (!name.startsWith('launch-')) continue;
    const record = await readFile(path.join(dir, name), 'utf8')
      .then(JSON.parse)
      .catch(() => undefined);
    if (record?.sessionId === sessionId) earlier.push(record);
  }
  earlier.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const content = `# Agents\n\n${earlier.map(agentRow).join('')}`;
  // Linked into place whole: a parallel hook's row appended to a file still being written in place would be
  // overwritten. A link fails with EEXIST when another hook got there first; a filesystem without hard links falls
  // back to an exclusive write.
  const temp = `${ledger}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temp, content)
    .then(() => link(temp, ledger))
    .catch((error) => (error?.code === 'EEXIST' ? undefined : writeFile(ledger, content, { flag: 'wx' })))
    .catch(() => {});
  await rm(temp, { force: true }).catch(() => {});
  return ledger;
}

async function appendAgentRow(root, record) {
  const folder = await sessionFolder(root, record.sessionId);
  if (!folder) return;
  await appendFile(await openLedger(root, record.sessionId, folder), agentRow(record));
}

function launchDescription(input) {
  if (typeof input?.description !== 'string') return '';
  return input.description.replace(/\s+/g, ' ').replace(DASH, '-').trim().slice(0, 80);
}

function buildRecord(payload) {
  const base = { sessionId: payload.session_id, at: new Date().toISOString() };

  if (payload.hook_event_name === 'SubagentStop') {
    // Measured: `SubagentStop` fires repeatedly while an agent works, roughly every 30 seconds, and those
    // intermediate events carry an empty `agent_type` and the agent's progress line. Only the final event names
    // the agent. Recording the rest would multiply the directory tenfold and tell the gate nothing.
    const type = payload.agent_type;
    if (typeof type !== 'string' || type.length === 0) return undefined;
    return { kind: 'agent', type, agentId: payload.agent_id, ...base };
  }
  if (payload.hook_event_name === 'PostToolUse') {
    if (payload.tool_name === 'Agent') {
      const raw = payload.tool_input?.subagent_type;
      const type = typeof raw === 'string' && raw.length > 0 ? raw : 'general-purpose';
      // The launch result names the agent id its SubagentStop carries, which pairs the two exactly (measured).
      const agentId = typeof payload.tool_response?.agentId === 'string' ? payload.tool_response.agentId : undefined;
      return { kind: 'launch', type, agentId, description: launchDescription(payload.tool_input), ...base };
    }
    if (payload.tool_name === BROWSER_TOOL) {
      const url = typeof payload.tool_input?.url === 'string' ? payload.tool_input.url : '';
      // A local dev server only: with the base path `/`, any site would otherwise count as a look at the app.
      let page;
      try {
        page = new URL(url);
      } catch {
        return undefined;
      }
      if (!/^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(page.hostname) || !page.pathname.startsWith(APP_PATH) || url.includes('__tree')) return undefined;
      return { kind: 'browser', url, ...base };
    }
    const file = relativePath(repoRoot(payload), payload.tool_input?.file_path);
    if (!file) return undefined;
    return { kind: 'edit', file, tool: payload.tool_name, agentId: payload.agent_id, agentType: payload.agent_type, ...base };
  }
  return undefined;
}

try {
  const payload = JSON.parse(await readStdin());
  const record = buildRecord(payload);
  if (record?.kind === 'launch') {
    await appendAgentRow(repoRoot(payload), record).catch(() => {});
  }
  // Without this, launches made before the folder existed get no rows until some later launch opens the ledger:
  // writing the task file into a fresh session folder is what opens it.
  if (record?.kind === 'edit' && record.file.startsWith('.claude/sessions/')) {
    const root = repoRoot(payload);
    const folder = await sessionFolder(root, record.sessionId).catch(() => undefined);
    if (folder && record.file.startsWith(`.claude/sessions/${path.basename(folder)}/`)) {
      await openLedger(root, record.sessionId, folder).catch(() => {});
    }
  }
  if (record) {
    const dir = eventDir(repoRoot(payload));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${record.kind}-${Date.now()}-${randomUUID().slice(0, 8)}.json`), JSON.stringify(record));
    if (record.kind === 'agent' || record.kind === 'launch') await prune(dir).catch(() => {});
  }
} catch {
  // A recorder that reports its own failure would put noise in front of the user on every tool call.
}
