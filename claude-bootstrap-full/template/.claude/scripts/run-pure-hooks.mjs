// Module resolution for run-pure.mjs: the project's source alias (`<SRC_DIR>/...` resolved from the repo
// root) and extensionless relative imports, so a pure helper can be executed by Node directly.
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ALIAS = '<SRC_DIR>/';
const EXT = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const complete = (base) => (isFile(base) ? base : EXT.map((e) => base + e).find(isFile));

export function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith(ALIAS)) base = pathResolve(ROOT, specifier);
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    base = pathResolve(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  const hit = base && complete(base);
  return hit ? { url: pathToFileURL(hit).href, shortCircuit: true } : next(specifier, context);
}
