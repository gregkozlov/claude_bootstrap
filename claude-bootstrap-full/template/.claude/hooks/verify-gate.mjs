#!/usr/bin/env node
// Stop-hook verification gate: when a session has changed watched files, run the project's check command
// and block one Stop if it fails; and block one Stop when the session edited source with no `gate` agent
// launched since, reading what record-activity.mjs wrote. Opt-in and personal - it does nothing until
// SessionStart + Stop are registered in .claude/settings.local.json, in every tree you work in (see
// README.md and settings.local.example.json).
//
// Reads one JSON payload on stdin, writes at most one JSON object on stdout, and always exits 0:
// a gate that errors must report, never wedge the session.
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

// The one verification call (CLAUDE.md, Commands). Run through the shell so "npm run check", "make check"
// or "cargo test" all work as written.
const CHECK_COMMAND = '<CHECK_COMMAND>';
// Files whose change makes the gate run. Extend with whatever else breaks the check command on its own
// (a config file the checker reads, a fixture, a translation file) - a session that edits only such a file
// would otherwise produce an empty delta and pass in silence. The rules and the rules-reach fixture are watched for
// the rules-reach check alone.
const WATCHED =
  /(?:\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|cs)|(?:^|\/)tsconfig[^/]*\.json|(?:^|\/)package\.json|^\.claude\/rules\/[^/]+\.md|^\.claude\/scripts\/rules-reach\.fixture\.json)$/;
const PROBE = /^<SRC_DIR>\/__hunt_probe[^/]*\.ts$/;
// A change to these alone runs only the rules-reach check, never the full check command.
const RULE_DOCS = /^\.claude\/rules\/[^/]+\.md$|^\.claude\/scripts\/rules-reach\.fixture\.json$/;
// Where a dev server for this tree answers, for the browser note below. From DEV_PORT_RANGE and
// DEV_BASE_PATH; the marker route is the one thing that proves the tree rather than the port.
const [PORT_FIRST, PORT_LAST] = '<DEV_PORT_RANGE>'.split('-').map(Number);
const TREE_MARKER = `<DEV_BASE_PATH>__tree`;
const MAX_OUTPUT = 1500;

const WAIVER_DIR = '.claude/.gate-waivers';
// A launch with no finish counts as running for this long, then as gone. Review legs have run past 24 minutes.
const RUNNING_TTL_MS = 60 * 60 * 1000;
// The checks share one budget below the Stop hook's timeout (150 s in settings.local.example.json): a hook the
// harness kills writes nothing, and its orphaned checker keeps running.
const RUN_BUDGET_MS = 110_000;
const MIN_CHECK_MS = 5_000;
const STATE_PRUNE_MS = 7 * 24 * 60 * 60 * 1000;

// Agents whose edits need no review: comment text only, as shipped. Add a project's own editor agents here.
const UNREVIEWED_WRITERS = new Set(['comments']);
// An unfinished run of one of these means the review is still ahead, not skipped. Add a project's editor agents.
const LIFECYCLE_AGENTS = ['twins', 'comments', 'gate', 'hunt', 'integration', 'drift'];
// Agents that never write a file the check command reads. Every other running agent of this session - `gate`
// itself, a writer, `general-purpose`, a `fork` - holds the check back.
const READ_ONLY_AGENTS = new Set(['Explore', 'Plan', 'claude-code-guide', 'statusline-setup', 'twins', 'drift', 'hunt', 'integration']);
const ANY_WRITER = '*writer';

// In order; the first failure blocks. `when` decides from the changed paths whether a check runs. While an agent
// in `deferWhile` runs, the check waits for the next Stop instead of failing on a half-finished operation. `own`
// is this session's agents that write the files the check reads - each one's completion brings another turn, so
// that Stop comes. `tree` is any session's agent whose run overlaps the check on disk (a concurrent build cache,
// a probe file); another session's writer is a parallel edit like any other and defers nothing, because nothing
// would bring this session its next Stop. A project that delegates one checker to an editor agent splits it out
// of CHECK_COMMAND into its own entry, deferred on that agent.
const CHECKS = [
  // First, not last: this is the only check whose message says what the file is, and ahead of the others no
  // unrelated failure can mask it. The build and lint configs exclude the probe path too (see README.md), so
  // a live probe cannot fail the check command - which is why a probe agent compiles it through a project of
  // its own rather than the repo's.
  {
    id: 'probe',
    label: 'a compile probe left behind',
    deferWhile: { tree: ['hunt', 'integration'] },
    reason: (output) => output,
    when: (paths) => paths.some((item) => PROBE.test(item)),
    run: async (root, paths) => {
      const survivors = [];
      for (const item of paths.filter((entry) => PROBE.test(entry))) {
        if (await exists(path.join(root, item))) survivors.push(item);
      }
      return {
        code: survivors.length > 0 ? 1 : 0,
        output: `${survivors.join(', ')} still exists - a review agent's compile probe must be deleted before the turn ends.`,
      };
    },
  },
  // Two builds at once can each answer "up to date" against the other's cache, and `gate` runs the check command
  // itself; a writing agent can hold a stranded import mid-edit.
  {
    id: 'check',
    label: CHECK_COMMAND,
    deferWhile: { own: ANY_WRITER, tree: ['gate'] },
    when: (paths) => paths.some((item) => !RULE_DOCS.test(item)),
    run: (root, _paths, timeoutMs) => runCommand(root, CHECK_COMMAND, timeoutMs),
  },
  // Its own entry, so a session that edits only a rule does not pay for the full check command.
  {
    id: 'rules-reach',
    label: 'node .claude/scripts/rules-reach.mjs --check',
    deferWhile: {},
    when: (paths) => paths.some((item) => /^(?:\.claude\/rules\/|\.claude\/scripts\/rules-reach)/.test(item)),
    run: (root, _paths, timeoutMs) => runCommand(root, 'node .claude/scripts/rules-reach.mjs --check', timeoutMs),
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// A subagent's PostToolUse and SubagentStop payloads carry the parent session's id.
function eventDir(root) {
  return path.join(os.tmpdir(), 'claude-verify-gate', `events-${sha256(root.replace(/\\/g, '/')).slice(0, 16)}`);
}

function agentCounts() {
  return { launches: new Map(), finishes: new Map() };
}

// Lists, not a latest value per type: a round launches several agents of one type, and one finish must not end the others.
function countAgentRecord(counts, record) {
  if (typeof record.type !== 'string') return;
  if (record.kind === 'launch') {
    if (!counts.launches.has(record.type)) counts.launches.set(record.type, []);
    counts.launches.get(record.type).push({ at: record.at, agentId: record.agentId });
    return;
  }
  if (!counts.finishes.has(record.type)) counts.finishes.set(record.type, new Map());
  const byAgent = counts.finishes.get(record.type);
  const agentKey = record.agentId ?? record.at;
  if (!byAgent.has(agentKey) || byAgent.get(agentKey) < record.at) byAgent.set(agentKey, record.at);
}

// `own` starts at startedAt: an agent launched before a restart died with that process and must not read as running.
async function readActivity(root, sinceIso, sessionId) {
  const own = agentCounts();
  const tree = agentCounts();
  const edits = new Map();
  let browserAt = '';
  const dir = eventDir(root);
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return { own, tree, edits, browserAt };
  }
  for (const name of names) {
    try {
      const record = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      const mine = (!sessionId || record.sessionId === sessionId) && (!sinceIso || record.at >= sinceIso);
      if (record.kind === 'launch' || record.kind === 'agent') {
        countAgentRecord(tree, record);
        if (mine) countAgentRecord(own, record);
        continue;
      }
      if (!mine) continue;
      // A subagent's edit carries the parent's session id plus its own agentType (measured); only the
      // exempted writers are skipped, any other agent's edit still needs a review after it.
      const exempt = record.agentId && UNREVIEWED_WRITERS.has(record.agentType);
      if (record.kind === 'edit' && !exempt && typeof record.file === 'string') {
        if (!edits.has(record.file) || edits.get(record.file) < record.at) edits.set(record.file, record.at);
      }
      if (record.kind === 'browser' && record.at > browserAt) browserAt = record.at;
    } catch {
      // One malformed record must not disarm the gate: the outer catch reports and does not block.
    }
  }
  return { own, tree, edits, browserAt };
}

// A launch is running until the finish carrying its agent id, for an hour at most; a launch with no id never is.
function runningCount(counts, type) {
  const now = Date.now();
  const finished = counts.finishes.get(type) ?? new Map();
  return (counts.launches.get(type) ?? []).filter(
    (launch) => launch.agentId && !finished.has(launch.agentId) && now - Date.parse(launch.at) < RUNNING_TTL_MS
  ).length;
}

function runningOf(counts, types) {
  const candidates = types === ANY_WRITER ? [...counts.launches.keys()].filter((type) => !READ_ONLY_AGENTS.has(type)) : types;
  return candidates.filter((type) => runningCount(counts, type) > 0);
}

// The browser note is only honest when a server for this tree is actually up, and the marker route is what
// proves the tree rather than the port. Anything unclear counts as "no server", so the note stays silent
// rather than firing on every turn of a session with nothing running.
async function servesThisTree(root) {
  for (let port = PORT_FIRST; port <= PORT_LAST; port += 1) {
    try {
      const response = await fetch(`http://localhost:${port}${TREE_MARKER}`, { signal: AbortSignal.timeout(400) });
      const body = await response.json();
      if (path.resolve(String(body.tree)) === path.resolve(root)) return true;
    } catch {
      // Refused, timed out, or not the marker: not a server for this tree.
    }
  }
  return false;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function projectRoot(payload) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd());
}

function parsePorcelainZ(stdout) {
  const fields = stdout.split('\0');
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (!entry || entry.length < 4) continue;
    const status = entry.slice(0, 2);
    paths.push(entry.slice(3));
    if (/[RC]/.test(status) && fields[index + 1]) {
      index += 1;
      paths.push(fields[index]);
    }
  }
  return paths;
}

async function fileHash(root, relativePath) {
  try {
    return sha256(await readFile(path.join(root, relativePath)));
  } catch {
    return 'missing';
  }
}

// Content hashes, not mtimes, so an edit reverted back to the original state reads as unchanged.
async function changedFileMap(root) {
  const { stdout } = await execFile('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const relativePaths = [...new Set(parsePorcelainZ(stdout).filter((item) => WATCHED.test(item)))].sort();
  const entries = await Promise.all(relativePaths.map(async (item) => [item, await fileHash(root, item)]));
  return Object.fromEntries(entries);
}

function statePath(root, sessionId) {
  return path.join(os.tmpdir(), 'claude-verify-gate', `${sha256(`${root}|${sessionId}`).slice(0, 16)}.json`);
}

async function readState(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function writeState(file, state) {
  await mkdir(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify(state, null, 2)}\n`;
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, body, 'utf8');
  try {
    await rename(temporary, file);
  } catch {
    await writeFile(file, body, 'utf8');
    await rm(temporary, { force: true });
  }
}

async function pruneStale(root, ownStateFile) {
  const cutoff = Date.now() - STATE_PRUNE_MS;
  const targets = [
    [path.join(os.tmpdir(), 'claude-verify-gate'), /^[0-9a-f]{16}\.json$/],
    [path.join(root, WAIVER_DIR), /^review-/],
  ];
  for (const [dir, pattern] of targets) {
    for (const name of await readdir(dir).catch(() => [])) {
      if (!pattern.test(name)) continue;
      const full = path.join(dir, name);
      if (full === ownStateFile) continue;
      const info = await stat(full).catch(() => undefined);
      if (info?.isFile() && info.mtimeMs < cutoff) await rm(full, { force: true }).catch(() => {});
    }
  }
}

// Killing the shell alone leaves the checker running with the pipe open, and `close` then waits for it.
function killTree(child) {
  // Once the shell has exited its pid can be reused; only the pipes are left to drop.
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => {});
    setTimeout(() => killer.kill(), 5_000).unref();
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

function runCommand(root, command, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: root,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const chunks = [];
    let settled = false;
    let timedOut = false;
    // Every caller of `finish` runs from an event or a timer, after `timer` below exists.
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // A grandchild that survives the kill would hold the pipe open; stop waiting on it.
      setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        finish({ code: 1, output: Buffer.concat(chunks).toString('utf8'), timedOut: true });
      }, 3_000).unref();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.once('error', (error) => finish({ code: 1, output: error.message, timedOut }));
    child.once('close', (code) => finish({ code: code ?? 1, output: Buffer.concat(chunks).toString('utf8'), timedOut }));
  });
}

function concise(text) {
  const value = text.trim();
  if (value.length <= MAX_OUTPUT) return value;
  return `${value.slice(0, 900)}\n... output truncated ...\n${value.slice(-600)}`;
}

async function handleSessionStart(payload) {
  const root = projectRoot(payload);
  const file = statePath(root, payload.session_id);
  await pruneStale(root, file).catch(() => {});
  // `compact` fires mid-session with the same session_id: re-baselining would pass this session's own edits.
  const existing = await readState(file);
  if (existing) {
    // The session id survives a restart: the baseline stays, the activity window reopens.
    if (payload.source === 'startup') {
      await writeState(file, { ...existing, startedAt: new Date().toISOString(), reviewBlocked: undefined });
    }
    return null;
  }
  // `clear` starts a new session id, so it baselines like `startup`. A `resume` or `compact` here means the state
  // file went missing mid-life: baselining the live tree would record work already done as unchanged.
  const baseline = payload.source === 'startup' || payload.source === 'clear' ? await changedFileMap(root) : {};
  await writeState(file, { repoRoot: root, sessionId: payload.session_id, baseline, startedAt: new Date().toISOString() });
  return null;
}

function reviewWaiverPath(sessionId) {
  return `${WAIVER_DIR}/review-${String(sessionId ?? '').slice(0, 8)}`;
}

async function readWaiver(root, relativePath) {
  const target = path.join(root, relativePath);
  try {
    const { mtimeMs } = await stat(target);
    const reason = (await readFile(target, 'utf8')).trim();
    return reason ? { at: new Date(mtimeMs).toISOString(), reason } : undefined;
  } catch {
    return undefined;
  }
}

// Asked about this session's edits, never the tree: the author edits from a second terminal, and a mid-task commit empties the diff.
async function reviewVerdict(state, file, payload, editedSrc, activity, inFlight) {
  if (editedSrc.length === 0) return undefined;
  const lastEditAt = editedSrc
    .map(([, at]) => at)
    .sort()
    .at(-1);
  // The launch is the review's moment: a gate launched before an edit did not see it, whenever it finished.
  const gateLaunches = (activity.own.launches.get('gate') ?? []).map((launch) => launch.at).sort();
  const gateFinishes = [...(activity.own.finishes.get('gate')?.values() ?? [])].sort();
  const lastGateAt = gateLaunches.at(-1) ?? gateFinishes.at(-1) ?? '';
  if (lastEditAt <= lastGateAt) return undefined;
  const unreviewed = editedSrc.filter(([, at]) => at > lastGateAt).map(([item]) => item);

  const waiverPath = reviewWaiverPath(payload.session_id);
  const waiver = await readWaiver(state.repoRoot, waiverPath);
  if (waiver && waiver.at > lastEditAt) return { systemMessage: `Verification gate: review deliberately skipped - ${waiver.reason}` };

  // After a block, re-edits of the files it named stay quiet until a gate launch or a waiver answers it.
  const blocked = state.reviewBlocked;
  if (blocked && lastGateAt <= blocked.at && (waiver?.at ?? '') <= blocked.at && unreviewed.every((item) => blocked.files.includes(item))) {
    return undefined;
  }

  if (inFlight.length > 0) {
    return { systemMessage: `Verification gate: review pending - ${inFlight.join(', ')} still running.` };
  }

  const message = `Verification gate: ${unreviewed.length} file(s) under <SRC_DIR>/ were edited after the last review, and no gate agent ran since.`;
  if (payload.stop_hook_active === true) return { systemMessage: message };
  state.reviewBlocked = { at: new Date().toISOString(), files: unreviewed };
  await writeState(file, state).catch(() => {});
  return {
    systemMessage: message,
    decision: 'block',
    reason: [
      `No \`gate\` run was recorded after these ${unreviewed.length} edit(s) under <SRC_DIR>/:`,
      unreviewed.slice(0, 12).join(', '),
      '',
      'Run the review now (lifecycle step 6 - the `crosscheck` skill picks the tier), or, if the skip rule',
      'genuinely covers the change, the review was done in the main thread under "no subagents", or the fix',
      `was one a reviewer prescribed and you applied verbatim, write the reason into ${waiverPath}`,
      '(and into the task file, if the session keeps one), and finish.',
    ].join('\n'),
  };
}

async function handleStop(payload) {
  const deadline = Date.now() + RUN_BUDGET_MS;
  const root = projectRoot(payload);
  const file = statePath(root, payload.session_id);
  const state = (await readState(file)) ?? { repoRoot: root, sessionId: payload.session_id, baseline: {} };
  const changed = await changedFileMap(root);
  const key = sha256(JSON.stringify(changed));

  const activity = await readActivity(root, state.startedAt, payload.session_id);
  const inFlight = runningOf(activity.own, LIFECYCLE_AGENTS);
  // A file the tree no longer holds cannot be reviewed, and the record of having written it outlives it:
  // a compile probe created and deleted in one turn, or an addition reverted, would otherwise demand a
  // review of nothing for the rest of the session. Same principle as hashing content rather than mtimes.
  const editedSrc = [];
  for (const [item, at] of activity.edits) {
    if (item.startsWith('<SRC_DIR>/') && (await exists(path.join(root, item)))) editedSrc.push([item, at]);
  }
  const notes = [];

  // Only while a server for this tree is up (with none, the browser check is the owner's to start), only for an
  // edit newer than this session's last look at the app, and not while reviewers run - the check comes after them.
  const lastEditAt = editedSrc
    .map(([, at]) => at)
    .sort()
    .at(-1);
  if (lastEditAt && lastEditAt > activity.browserAt && inFlight.length === 0 && (await servesThisTree(root))) {
    notes.push('no browser check was recorded after the last change - lifecycle step 7.');
  }

  const withNotes = (result) => {
    if (notes.length === 0) return result;
    const line = `Verification gate: ${notes.join(' ')}`;
    if (!result) return { systemMessage: line };
    return { ...result, systemMessage: `${result.systemMessage ?? ''} ${line}`.trim() };
  };

  if (key === sha256(JSON.stringify(state.baseline))) {
    return withNotes(await reviewVerdict(state, file, payload, editedSrc, activity, inFlight));
  }

  if (state.lastRun?.key === key) {
    if (state.lastRun.status === 'pass') return withNotes(await reviewVerdict(state, file, payload, editedSrc, activity, inFlight));
    return withNotes({ systemMessage: `Verification gate: ${state.lastRun.label} still failing (not re-run).` });
  }

  // Paths that differ from the baseline decide which of the conditional checks run.
  const changedPaths = Object.keys(changed).filter((item) => changed[item] !== state.baseline[item]);

  let incomplete = false;

  for (const check of CHECKS) {
    if (!check.when(changedPaths)) continue;

    const owners = [
      ...runningOf(activity.own, check.deferWhile.own ?? []),
      ...runningOf(activity.tree, check.deferWhile.tree ?? []).map((type) =>
        runningCount(activity.own, type) > 0 ? type : `${type} (another session)`
      ),
    ].filter((owner, index, all) => all.indexOf(owner) === index);
    if (owners.length > 0) {
      notes.push(`${check.label} deferred - ${owners.join(', ')} still running.`);
      incomplete = true;
      continue;
    }

    const remaining = deadline - Date.now();
    if (remaining < MIN_CHECK_MS) {
      notes.push(`${check.label} not run - the time budget is spent; the next Stop runs it.`);
      incomplete = true;
      continue;
    }

    const result = await check.run(root, changedPaths, remaining);
    if (result.timedOut) {
      notes.push(`${check.label} timed out and was stopped - not counted as a failure; the next Stop runs it again.`);
      incomplete = true;
      continue;
    }
    if (result.code === 0) continue;

    const systemMessage = [
      check.reason ? `Verification gate: ${check.label}.` : `Verification gate: ${check.label} failed.`,
      ...notes,
    ].join(' ');
    // A continuation cannot block again and is not recorded: the next ordinary Stop re-runs the check and blocks.
    if (payload.stop_hook_active === true) return { systemMessage };
    state.lastRun = { key, status: 'fail', label: check.label };
    // Swallowed: a throw would reach the outer catch, which does not block - fail-open on the one path that must not.
    await writeState(file, state).catch(() => {});
    return {
      systemMessage,
      decision: 'block',
      reason: check.reason
        ? check.reason(concise(result.output))
        : `${check.label} failed on files changed in this session. Fix them before finishing, then re-run \`${check.label}\`:\n\n${concise(result.output)}`,
    };
  }

  if (!incomplete) {
    state.lastRun = { key, status: 'pass' };
    await writeState(file, state).catch(() => {});
  }
  return withNotes(await reviewVerdict(state, file, payload, editedSrc, activity, inFlight));
}

let output = null;
try {
  const payload = JSON.parse(await readStdin());
  if (payload.hook_event_name === 'SessionStart') output = await handleSessionStart(payload);
  else if (payload.hook_event_name === 'Stop') output = await handleStop(payload);
} catch (error) {
  output = { systemMessage: `Verification gate could not run: ${error.message}` };
}
// Exit explicitly: a check child that outlived its kill must not keep this process alive past the harness timeout.
if (output) process.stdout.write(`${JSON.stringify(output)}\n`, () => process.exit(0));
else process.exit(0);
