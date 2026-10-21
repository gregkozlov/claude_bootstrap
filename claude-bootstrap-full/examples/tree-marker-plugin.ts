// Example from a Vite project (vite.config.ts). Depends on: Vite (any version with configureServer),
// git on PATH. Not copied by apply.mjs - paste the plugin into the project's vite.config.ts and add it
// to `plugins`. For another dev server, expose the same JSON at <DEV_BASE_PATH>__tree.
//
// Dev-only marker at <base>__tree: which machine, tree and branch this server serves. Two trees share
// one config with no strictPort, and a second machine answers on the same localhost port, so neither
// the port nor a loaded page says whose app is on screen - this does. Registered without the
// post-middleware wrapper so the SPA fallback never swallows it. The verify-live skill curls it from the
// shell and then loads it in the paired browser: same host and tree in both answers, or stop.
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import type { PluginOption } from 'vite';

const BASE_PATH = '/stockroom/'; // the app's base path, with both slashes - the same value Vite's `base` gets
const root = process.cwd(); // the tree this config file belongs to

export const TreeMarkerPlugin: PluginOption = {
  name: 'tree-marker-plugin',
  apply: 'serve',
  configureServer(server) {
    let branch: string;
    try {
      branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      branch = '?';
    }
    server.middlewares.use(`${BASE_PATH}__tree`, (_, res) => {
      // The listening port, not the configured one: the configured value would name the port another tree is serving.
      const address = server.httpServer?.address();
      const port = (typeof address === 'object' && address !== null ? address.port : server.config.server.port) ?? null;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ host: os.hostname(), tree: root, branch, port }));
    });
  },
};
