// SessionStart stores the tree state as the session's baseline; Stop runs the check command when the tree moved off it
// and blocks the turn once on a failure. Registered for both events in .claude/settings.json (tracked).
// Reads one JSON payload on stdin, writes at most one JSON object on stdout, and always exits 0.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The project's one verification call (CLAUDE.md, Commands). A chain that outlasts BUDGET_MS is killed and reported as
// "Nothing was verified" on every Stop; point CHECK at a faster subset of it here (type-check and lint, say) instead.
const CHECK = String.raw`<CHECK_COMMAND>`;
const BUDGET_MS = 150_000;
const TAIL_LINES = 60;
const PRUNE_MS = 15 * 24 * 3600_000;
// The tree is this file's own, two folders up; the drive letter is upper-cased so `d:` and `D:` key one tree.
const ROOT = path
  .resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  .replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const STATE_DIR = path.join(
  process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
  'claude-stop-check',
);
const PREFIX = `stop-${sha256(ROOT).slice(0, 16)}-`;
// A reviewer's compile probe comes and goes while the check runs, and the session folders are notes, not code.
const SKIPPED = new RegExp(String.raw`^(?:${'<SRC_DIR>'.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\/__hunt_probe[^/]*\.ts|\.claude\/sessions\/.*)$`);

const statePath = (sessionId) => path.join(STATE_DIR, `${PREFIX}${String(sessionId).replace(/[^\w-]/g, '_')}.json`);
const readState = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};
const writeState = (file, state) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state));
};

// HEAD plus every changed, untracked or deleted path with a hash of its content; undefined on any git error,
// which the Stop handler reads as "changed".
function treeKey() {
  try {
    // With core.ignorecase a case-only rename on disk prints no status line, though a compiler fails on it.
    const git = (...args) =>
      execFileSync('git', ['-C', ROOT, '-c', 'core.ignorecase=false', ...args], {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      });
    const names = [];
    const fields = git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.').split('\0');
    for (let index = 0; index < fields.length; index += 1) {
      if (fields[index].length <= 3) continue;
      names.push(fields[index].slice(3));
      if (/[RC]/.test(fields[index].slice(0, 2))) {
        names.push(fields[index + 1]);
        index += 1;
      }
    }
    // A repo with no commit yet has no HEAD; its status alone keys the tree.
    let head = '';
    try {
      head = git('rev-parse', '--verify', '-q', 'HEAD').trim();
    } catch {
      // No commit yet.
    }
    const entries = [head];
    for (const name of [...new Set(names)].sort()) {
      if (SKIPPED.test(name)) continue;
      const file = path.join(ROOT, name);
      entries.push(name, fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? sha256(fs.readFileSync(file)) : 'missing');
    }
    return sha256(JSON.stringify(entries));
  } catch {
    return undefined;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// Killing the shell alone leaves the compiler or the linter running. On Windows taskkill is awaited: it dies in the
// hook's job object if the hook exits first, and the grandchildren survive.
function killTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    const cap = setTimeout(resolve, 5_000);
    const done = () => {
      clearTimeout(cap);
      resolve();
    };
    killer.on('exit', done);
    killer.on('error', done);
  });
}

function runCheck() {
  return new Promise((resolve) => {
    const child = spawn(CHECK, {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    let overran = false;
    const timer = setTimeout(async () => {
      overran = true;
      await killTree(child);
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      resolve({ overran, code: null, output: Buffer.concat(chunks).toString('utf8') });
    }, BUDGET_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ overran, code: null, output: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ overran, code, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

function handleSessionStart(payload) {
  const file = statePath(payload.session_id);
  for (const name of fs.existsSync(STATE_DIR) ? fs.readdirSync(STATE_DIR) : []) {
    if (!name.startsWith('stop-')) continue;
    const full = path.join(STATE_DIR, name);
    if (Date.now() - fs.statSync(full).mtimeMs > PRUNE_MS) fs.rmSync(full, { force: true });
  }
  // `resume` and `compact` keep the session id: a new baseline there would pass the session's own edits.
  if (readState(file)) return null;
  writeState(file, { baseline: treeKey() });
  return null;
}

async function handleStop(payload) {
  if (payload.stop_hook_active === true) return null;
  const file = statePath(payload.session_id);
  const state = readState(file) ?? {};
  const key = treeKey();
  if (key && (key === state.baseline || key === state.lastPassed || key === state.lastBlocked)) return null;

  const { overran, code, output } = await runCheck();
  const tail = output.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join('\n');
  if (overran) return { systemMessage: `Stop check: "${CHECK}" overran ${BUDGET_MS / 1000} s and was killed. Nothing was verified.` };
  if (code === null) return { systemMessage: `Stop check could not run:\n${tail}\nNothing was verified.` };
  if (code === 0) {
    if (key) writeState(file, { ...state, lastPassed: key });
    return null;
  }
  writeState(file, { ...state, lastBlocked: key });
  return {
    decision: 'block',
    reason: `"${CHECK}" failed:\n${tail}\n\nA failure in a file this task neither touched nor reaches is the owner's own edit or a parallel session's - say so instead of fixing it.`,
  };
}

let output = null;
try {
  const payload = JSON.parse(await readStdin());
  if (payload.hook_event_name === 'SessionStart') output = handleSessionStart(payload);
  else if (payload.hook_event_name === 'Stop') output = await handleStop(payload);
} catch (error) {
  output = { systemMessage: `Stop check could not run: ${error.message}. Nothing was verified.` };
}
// Exit explicitly: a check child that outlived its kill must not keep this process alive past the harness timeout.
if (output) process.stdout.write(`${JSON.stringify(output)}\n`, () => process.exit(0));
else process.exit(0);
