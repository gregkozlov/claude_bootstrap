// Execute a throwaway probe script that imports pure helpers from the source tree - parsers, formatters,
// comparators - so an invariant (round-trip, boundary value) is run rather than reasoned about.
//   node .claude/scripts/run-pure.mjs <path-to-probe.mjs>
// Works for TypeScript modules without JSX, DOM or import.meta.env at module scope (Node 22.18+ / 23.6+ strip
// types with no flag; 22.6-22.17 need `node --experimental-strip-types`). `window` is shimmed to an empty
// object for modules that read it at import time. Not a test runner - a probe lives in the session scratchpad
// and is deleted with it.
import module from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from './run-pure-hooks.mjs';

globalThis.window ??= {};
// registerHooks is the synchronous successor of register(), which newer Node versions deprecate.
if (module.registerHooks) module.registerHooks({ resolve });
else module.register('./run-pure-hooks.mjs', import.meta.url);

const probe = process.argv[2];
if (!probe) {
  console.error('usage: node .claude/scripts/run-pure.mjs <probe.mjs>');
  process.exit(2);
}
await import(pathToFileURL(probe).href);
