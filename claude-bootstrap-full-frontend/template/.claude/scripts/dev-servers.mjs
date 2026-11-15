// Which tree serves which port - a fact, not a convention. Lists every listener in the project's port
// range with the tree it runs from (taken from the server process command line) and that tree's branch,
// and marks the row that belongs to the tree this command runs in.
//   node .claude/scripts/dev-servers.mjs
// Windows only (Get-NetTCPConnection + Win32_Process). On macOS / Linux replace the PowerShell block
// with `lsof -iTCP -sTCP:LISTEN -P -n` plus `ps -o args= -p <pid>` and keep the rest.
// The tree is recognised by a `node_modules` segment in the process command line - a Node dev server;
// for another runtime change the TREE_FROM_COMMAND regex to whatever names the project root there.
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { resolve, sep } from 'node:path';

const [PORT_FROM, PORT_TO] = '<DEV_PORT_RANGE>'.split('-').map(Number);
const BASE_PATH = '<DEV_BASE_PATH>';
const TREE_FROM_COMMAND = /([A-Za-z]:[^"]*?)[\\/]node_modules[\\/]/;

const PS = [
  '$ErrorActionPreference = "SilentlyContinue"',
  `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge ${PORT_FROM} -and $_.LocalPort -le ${PORT_TO} } | ForEach-Object {`,
  '  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"',
  '  "$($_.LocalPort)`t$($_.LocalAddress)`t$($_.OwningProcess)`t$($p.CommandLine)"',
  '}',
].join('; ');

const here = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { encoding: 'utf8', windowsHide: true });
const rows = raw
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => {
    const [port, address, pid, command = ''] = line.split('\t');
    const match = command.match(TREE_FROM_COMMAND);
    const tree = match ? resolve(match[1]) : null;
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
