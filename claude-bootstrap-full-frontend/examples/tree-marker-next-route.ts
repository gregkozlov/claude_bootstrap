// Example from a Next.js App Router project. Depends on: Next.js 13.4+ (route handlers), git on PATH. Not part of
// the template - save it by hand as app/%5F_tree/route.ts (src/app/%5F_tree/route.ts with a src folder).
// The folder name is deliberate: a folder starting with `_` is private in the App Router and never routed, and `%5F`
// is the encoded underscore that makes the URL segment `__tree`. With `basePath` set in next.config, it answers at
// <basePath>/__tree, which is <DEV_BASE_PATH>__tree.
// Two project settings get in its way: a middleware (`proxy.ts` from Next.js 16) that has no `matcher` or whose
// `matcher` takes every path (an auth or i18n redirect) must let `__tree` through, and `trailingSlash: true`
// moves it to `__tree/`. A static export (`output: 'export'`) cannot carry it - a route handler that reads the
// request is not supported there - and the browser check stays off.
//
// Dev-only marker: which machine, tree and branch this server serves - tree-marker-plugin.ts says why the port
// alone cannot tell. Outside `next dev` it answers 404. verify-live compares `tree` with the repository root, so
// the app sits at that root: one in a monorepo package reports its package folder and fails the comparison.
import { execFileSync } from 'node:child_process';
import os from 'node:os';

export function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return new Response('Not found', { status: 404 });
  const root = process.cwd(); // `next dev` runs from the project root
  let branch: string;
  try {
    branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    branch = '?';
  }
  // The port the request reached is the one this server listens on; the configured one may be another tree's.
  const port = Number(new URL(request.url).port) || null;
  return Response.json({ host: os.hostname(), tree: root, branch, port });
}
