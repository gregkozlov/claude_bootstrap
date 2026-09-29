#!/usr/bin/env node
// Load log for rule reach: every CLAUDE.md or rule load (InstructionsLoaded) becomes one file in a per-repo
// directory under the user cache, which `node .claude/scripts/rules-reach.mjs --loads` replays against its model
// of the loader. Observe-only: the harness does not await this event, the hook cannot block, and it never reports.
//
// One file per load: several rules load within milliseconds of each other, each in its own hook process.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// `rules-reach.mjs --loads` replays the log from the weekly maintain-ai-layer pass, which runs every week or two.
const PRUNE_AFTER_MS = 15 * 24 * 60 * 60 * 1000;
// A user cache, not os.tmpdir() like the gate's event records: a temp cleaner would empty a log that spans two weeks.
const CACHE_BASE = process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
const NAMESPACE = 'claude-verify-gate';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// rules-reach.mjs builds the same key from its own location, whose drive letter may come in either case.
function rootKey(payload) {
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd());
  const normalized = root.replace(/^[a-z]:/, (drive) => drive.toUpperCase()).replaceAll('\\', '/');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

async function prune(dir) {
  const cutoff = Date.now() - PRUNE_AFTER_MS;
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await stat(full).catch(() => undefined);
    if (info && info.mtimeMs < cutoff) await rm(full, { force: true }).catch(() => {});
  }
}

try {
  const payload = JSON.parse(await readStdin());
  // Kept whole: the payload's field list is not documented as shipped, so a renamed field stays visible in the record.
  const record = { at: new Date().toISOString(), ...payload };
  delete record.transcript_path;
  const dir = path.join(CACHE_BASE, NAMESPACE, `loads-${rootKey(payload)}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `load-${Date.now()}-${randomUUID().slice(0, 8)}.json`), JSON.stringify(record));
  if (payload.load_reason === 'session_start') await prune(dir).catch(() => {});
} catch {
  // An observer that reports its own failure would put noise in front of the user on every load.
}
