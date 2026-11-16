// Module resolution for run-pure.mjs: the project's import aliases (ALIASES, resolved from the repo root)
// and extensionless relative imports, so a pure helper can be executed by Node directly.
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Import prefix -> its folder from the repo root; `/maintain-ai-layer init` writes the project's aliases here from its tsconfig `paths` / bundler config.
const ALIASES = { '<SRC_DIR>/': '<SRC_DIR>/', '@/': '<SRC_DIR>/' };
// The longest prefix wins, so `@/` and a narrower `@/lib/` can both be listed.
const PREFIXES = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
const EXT = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
const isFile = (p) => existsSync(p) && statSync(p).isFile();
// A `.js` / `.jsx` specifier may name a `.ts` / `.tsx` sibling (the NodeNext import convention).
const complete = (base) => (isFile(base) ? base : [...EXT.map((e) => base + e), base.replace(/\.js$/, '.ts'), base.replace(/\.jsx$/, '.tsx')].find(isFile));

export function resolve(specifier, context, next) {
  let base = null;
  const prefix = PREFIXES.find((p) => specifier.startsWith(p));
  if (prefix) base = pathResolve(ROOT, ALIASES[prefix] + specifier.slice(prefix.length));
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    base = pathResolve(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  const hit = base && complete(base);
  return hit ? { url: pathToFileURL(hit).href, shortCircuit: true } : next(specifier, context);
}
