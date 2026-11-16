// Which tree serves which port - a fact, not a convention. Lists every listener in the project's port
// range with the tree it runs from (taken from the server process command line) and that tree's branch,
// and marks the row that belongs to the tree this command runs in.
//   node .claude/scripts/dev-servers.mjs
// Windows reads Get-NetTCPConnection + Win32_Process; macOS / Linux read `lsof -iTCP -sTCP:LISTEN` (Linux falls back
// to `ss -ltnp`) plus `ps -o args= -p <pid>`.
// The tree is recognised by a `node_modules` segment in the process command line - a Node dev server;
// for another runtime change the TREE_FROM_COMMAND regex to whatever names the project root there.
// `ps` prints the command line unquoted, so on macOS / Linux a tree path with a space in it is not recognised.
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { resolve, sep } from 'node:path';

const [PORT_FROM, PORT_TO] = '<DEV_PORT_RANGE>'.split('-').map(Number);
const BASE_PATH = '<DEV_BASE_PATH>';
// A quoted Windows path may hold spaces; an unquoted one stops at a space, so a bare node.exe path is not glued onto the tree.
const TREE_FROM_COMMAND = /(?:"([A-Za-z]:[^"]*?)|(?<=^|\s)([A-Za-z]:[^\s"]*?)|(?<=^|[\s"'])(\/[^\s"']*?))[\\/]node_modules[\\/]/;

const PS = [
  '$ErrorActionPreference = "SilentlyContinue"',
  `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge ${PORT_FROM} -and $_.LocalPort -le ${PORT_TO} } | ForEach-Object {`,
  '  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"',
  '  "$($_.LocalPort)`t$($_.LocalAddress)`t$($_.OwningProcess)`t$($p.CommandLine)"',
  '}',
].join('; ');

const inRange = (port) => port >= PORT_FROM && port <= PORT_TO;
// `127.0.0.1:5173`, `[::1]:5173`, `*:5173` -> address and port, brackets dropped to read like the Windows rows.
const splitAddress = (text) => {
  const at = text.lastIndexOf(':');
  return { address: text.slice(0, at).replace(/^\[(.*)\]$/, '$1'), port: Number(text.slice(at + 1)) };
};
// The same socket shows once per fd: one row per port, address and pid.
const unique = (listeners) => [...new Map(listeners.map((l) => [`${l.port} ${l.address} ${l.pid}`, l])).values()];

// `lsof -F pn`: a `p<pid>` line opens a process, each `n<address>:<port>` line under it is one listener.
function parseLsof(text) {
  const listeners = [];
  let pid = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('p')) pid = line.slice(1);
    else if (line.startsWith('n')) {
      const { address, port } = splitAddress(line.slice(1));
      if (inRange(port)) listeners.push({ port: String(port), address, pid });
    }
  }
  return unique(listeners);
}

// `ss -ltnp`: State Recv-Q Send-Q Local:Port Peer:Port Process; the pid shows only for this user's own processes.
function parseSs(text) {
  const listeners = [];
  for (const line of text.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns[0] !== 'LISTEN' || !columns[3]) continue;
    const { address, port } = splitAddress(columns[3].replace(/%[^:\]]*/, ''));
    if (inRange(port)) listeners.push({ port: String(port), address, pid: line.match(/pid=(\d+)/)?.[1] ?? '?' });
  }
  return unique(listeners);
}

// lsof exits 1 when nothing matches: only a missing binary is null.
function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    return error.code === 'ENOENT' ? null : (error.stdout ?? '');
  }
}

function windowsListeners() {
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { encoding: 'utf8', windowsHide: true });
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const [port, address, pid, command = ''] = line.split('\t');
      return { port, address, pid, command };
    });
}

function posixListeners() {
  const lsof = run('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n', '-Fpn']);
  const ss = lsof === null && process.platform === 'linux' ? run('ss', ['-ltnp']) : null;
  if (lsof === null && ss === null) {
    console.error(`dev-servers needs ${process.platform === 'linux' ? 'lsof or ss' : 'lsof'} on the PATH`);
    process.exit(1);
  }
  return (lsof !== null ? parseLsof(lsof) : parseSs(ss)).map((l) => ({
    ...l,
    command: /^\d+$/.test(l.pid) ? (run('ps', ['-o', 'args=', '-p', l.pid]) ?? '').trim() : '',
  }));
}

const here = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const rows = (process.platform === 'win32' ? windowsListeners() : posixListeners())
  .map(({ port, address, pid, command }) => {
    const match = command.match(TREE_FROM_COMMAND);
    const tree = match ? resolve(match[1] ?? match[2] ?? match[3]) : null;
    let branch = '';
    if (tree) {
      try {
        branch = execFileSync('git', ['-C', tree, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
      } catch {
        branch = '?';
      }
    }
    return { port, address, pid, tree, branch, mine: tree !== null && tree.toLowerCase() === here.toLowerCase() };
  })
  .sort((a, b) => Number(a.port) - Number(b.port));

console.log(`host ${hostname()} - this tree: ${here}${sep}`);
if (rows.length === 0) {
  console.log(`no dev server listening on ${PORT_FROM}-${PORT_TO}`);
  process.exit(0);
}
for (const r of rows) {
  const who = r.tree ? `${r.tree}  (${r.branch})` : `pid ${r.pid} - not a dev server from a tree`;
  console.log(`${r.port}  ${r.address.padEnd(4)}  ${r.mine ? 'THIS TREE ' : '          '} ${who}`);
}
const mine = rows.find((r) => r.mine);
console.log(mine ? `use http://localhost:${mine.port}${BASE_PATH}` : 'no listener serves this tree - ask the owner to start one; never start it yourself');
