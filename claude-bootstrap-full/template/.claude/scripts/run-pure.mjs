// Execute a throwaway probe script that imports pure helpers from the source tree - parsers, formatters,
// comparators - so an invariant (round-trip, boundary value) is run rather than reasoned about.
//   node .claude/scripts/run-pure.mjs <path-to-probe.mjs>
// Works for TypeScript modules without JSX, DOM or import.meta.env at module scope (Node 22.6+ strips
// types natively; Node 24 needs no flag). `window` is shimmed to an empty object for modules that read
// it at import time. Not a test runner - a probe lives in the session scratchpad and is deleted with it.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

globalThis.window ??= {};
register('./run-pure-hooks.mjs', import.meta.url);

const probe = process.argv[2];
if (!probe) {
  console.error('usage: node .claude/scripts/run-pure.mjs <probe.mjs>');
  process.exit(2);
}
await import(pathToFileURL(probe).href);
