// Example from the example app (.claude/scripts/bundle-report.mjs). Depends on: Vite's build() API and sourcemaps,
// a `src/routes/lazyPages.ts` map of route -> import('src/pages/...'), and a `components` manual chunk;
// not copied by apply.mjs. Measures per-route static JS, chunk sources and the chunk invariants; --transform measures a fix in memory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const INVARIANTS = [
  { chunk: 'components', marker: 'MuiDataGrid', home: 'DataTable', source: 'CLAUDE.md, Imports' },
  { chunk: 'components', marker: 'maplibregl', home: 'WarehouseMap', source: 'CLAUDE.md, Imports' },
];

// Vite empties outDir, so an existing non-empty directory is accepted only when an earlier run left this file in it.
const SENTINEL = '.bundle-report';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HASHED = /^(.+)-[\w-]{8}\.js$/;
const STATIC_IMPORT = /(?:from|import)\s*["`]\.\/([^"`]+\.js)["`]/g;
const PAGE_LOADER = /'([^']+)':\s*\(\)\s*=>\s*import\('src\/pages\/([^']+)'\)/g;

const fail = (message) => {
  console.error(`bundle-report: ${message}`);
  process.exit(1);
};

const usage = () => fail('usage: build <outDir> [--transform <file.mjs>] | report <outDir> | diff <beforeDir> <afterDir>');

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const signedKb = (bytes) => `${bytes > 0 ? '+' : ''}${kb(bytes)}`;
const slash = (p) => p.replace(/\\/g, '/');
const baseName = (file) => file.match(HASHED)?.[1] ?? file.replace(/\.js$/, '');

const load = (dir) => {
  const root = path.resolve(dir);
  const assets = path.join(root, 'assets');
  if (!fs.existsSync(assets)) fail(`no assets/ in ${root}`);
  const files = fs.readdirSync(assets).filter((f) => f.endsWith('.js'));
  const code = new Map(files.map((f) => [f, fs.readFileSync(path.join(assets, f), 'utf8')]));
  const gz = new Map([...code].map(([f, c]) => [f, gzipSync(c.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '')).length]));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const entry = html.match(/<script type="module"[^>]*src="[^"]*\/assets\/([^"]+\.js)"/)?.[1];
  if (!entry || !code.has(entry)) fail(`no module entry script in ${root}/index.html`);
  return { root, assets, files, code, gz, entry };
};

const closure = (b, start) => {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !b.code.has(file)) continue;
    seen.add(file);
    for (const m of b.code.get(file).matchAll(STATIC_IMPORT)) stack.push(m[1]);
  }
  return seen;
};

const sum = (b, files) => [...files].reduce((total, f) => total + (b.gz.get(f) ?? 0), 0);

const measureRoutes = (b) => {
  const loaders = fs.readFileSync(path.join(ROOT, 'src/routes/lazyPages.ts'), 'utf8');
  const pages = [...loaders.matchAll(PAGE_LOADER)].map(([, route, page]) => ({ route, page }));
  if (pages.length === 0) fail('no page loaders parsed from src/routes/lazyPages.ts');

  const shell = closure(b, b.entry);
  const rows = pages.map(({ route, page }) => {
    const chunkName = page.split('/').pop();
    const chunks = b.files.filter((f) => baseName(f) === chunkName);
    if (chunks.length !== 1) fail(`expected one chunk named ${chunkName}, found ${chunks.length}`);
    const own = [...closure(b, chunks[0])].filter((f) => !shell.has(f));
    return { route, page, staticGz: sum(b, own), staticCount: own.length };
  });
  return { shell: { count: shell.size, gz: sum(b, shell) }, rows };
};

const decodeVlq = (segment) => {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
};

// A mapping runs on across unmapped lines.
const attribution = (b, chunk) => {
  const mapFile = path.join(b.assets, `${chunk}.map`);
  if (!fs.existsSync(mapFile)) return 'no sourcemap';
  const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  const lines = b.code.get(chunk).split('\n');
  const mappingLines = map.mappings.split(';');
  const bySource = new Map();
  const credit = (source, length) => {
    if (source >= 0 && length > 0) bySource.set(source, (bySource.get(source) ?? 0) + length);
  };
  let sourceIndex = 0;
  let current = -1;
  lines.forEach((text, lineIndex) => {
    let column = 0;
    let spanStart = 0;
    for (const segment of (mappingLines[lineIndex] ?? '').split(',')) {
      if (!segment) continue;
      const [columnDelta, sourceDelta] = decodeVlq(segment);
      column += columnDelta;
      credit(current, column - spanStart);
      spanStart = column;
      if (sourceDelta === undefined) {
        current = -1;
      } else {
        sourceIndex += sourceDelta;
        current = sourceIndex;
      }
    }
    credit(current, text.length - spanStart);
  });

  const total = lines.reduce((sum, line) => sum + line.length, 0);
  const groups = new Map();
  for (const [index, length] of bySource) {
    const source = slash(map.sources[index] ?? '');
    const key =
      source.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ??
      source
        .replace(/^.*?\bsrc\//, 'src/')
        .split('/')
        .slice(0, 3)
        .join('/');
    groups.set(key, (groups.get(key) ?? 0) + length);
  }
  return [...groups]
    .sort((x, y) => y[1] - x[1])
    .filter(([, length]) => total > 0 && length / total >= 0.05)
    .slice(0, 3)
    .map(([key, length]) => `${key} ${Math.round((100 * length) / total)}%`)
    .join(', ');
};

const checkInvariants = (b) => {
  let ok = true;
  for (const { chunk, marker, home, source } of INVARIANTS) {
    const matches = b.files.filter((f) => baseName(f) === chunk);
    const homes = b.files.filter((f) => baseName(f) === home);
    let verdict = 'ok';
    if (matches.length !== 1) {
      verdict = `FAIL - expected one ${chunk} chunk, found ${matches.length}`;
    } else {
      const count = b.code.get(matches[0]).split(marker).length - 1;
      if (count > 0) verdict = `FAIL - ${count} occurrence(s)`;
      else if (homes.length !== 1 || !b.code.get(homes[0]).includes(marker)) {
        verdict = `FAIL - ${marker} not found in one ${home} chunk, the check is blind`;
      } else if (closure(b, matches[0]).has(homes[0])) {
        verdict = `FAIL - ${chunk}-*.js statically imports ${homes[0]}`;
      }
    }
    if (verdict !== 'ok') ok = false;
    console.log(`- ${verdict === 'ok' ? 'ok' : verdict}: \`${marker}\` in \`${chunk}-*.js\` must stay 0 (${source})`);
  }
  return ok;
};

const report = (dir) => {
  const b = load(dir);
  const { shell, rows } = measureRoutes(b);
  console.log(`## Bundle report - ${b.root}\n`);
  console.log(`Shell (static closure of ${b.entry}): ${shell.count} chunks, ${kb(shell.gz)} gzip\n`);
  console.log("Route-only JS: the page chunk's static import closure, shell excluded - what loads before the page renders.");
  console.log('Lazy widgets, tabs, modals and CSS come on top and are not counted.\n');
  console.log('| Route | Page | gzip | Chunks |');
  console.log('| --- | --- | ---: | ---: |');
  for (const r of rows) console.log(`| ${r.route} | ${r.page} | ${kb(r.staticGz)} | ${r.staticCount} |`);
  console.log('\nLargest chunks (top sources by the share of generated bytes they map to):\n');
  console.log('| Chunk | gzip | Top sources |');
  console.log('| --- | ---: | --- |');
  for (const f of [...b.files].sort((x, y) => b.gz.get(y) - b.gz.get(x)).slice(0, 10)) {
    console.log(`| ${f} | ${kb(b.gz.get(f))} | ${attribution(b, f)} |`);
  }
  console.log('\nInvariants:\n');
  if (!checkInvariants(b)) process.exitCode = 1;
};

const diff = (beforeDir, afterDir) => {
  const before = load(beforeDir);
  const after = load(afterDir);
  const a = measureRoutes(before);
  const z = measureRoutes(after);
  const byRoute = new Map(a.rows.map((r) => [r.route, r]));
  console.log(`## Bundle diff\n\nbefore: ${before.root}\nafter:  ${after.root}\n`);
  console.log(
    `Shell: ${kb(a.shell.gz)} -> ${kb(z.shell.gz)} (${signedKb(z.shell.gz - a.shell.gz)}), ${a.shell.count} -> ${z.shell.count} chunks\n`
  );
  console.log('| Route | Before | After | Delta |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const r of z.rows) {
    const o = byRoute.get(r.route);
    console.log(`| ${r.route} | ${kb(o.staticGz)} | ${kb(r.staticGz)} | ${signedKb(r.staticGz - o.staticGz)} |`);
  }

  const counts = (b) => b.files.reduce((m, f) => m.set(baseName(f), (m.get(baseName(f)) ?? 0) + 1), new Map());
  const ca = counts(before);
  const cz = counts(after);
  const added = [...cz].filter(([n, c]) => c > (ca.get(n) ?? 0)).map(([n]) => n);
  const removed = [...ca].filter(([n, c]) => c > (cz.get(n) ?? 0)).map(([n]) => n);
  console.log(`\nChunks added: ${added.join(', ') || 'none'}`);
  console.log(`Chunks removed: ${removed.join(', ') || 'none'}`);

  const unique = (b, counted) => new Map(b.files.filter((f) => counted.get(baseName(f)) === 1).map((f) => [baseName(f), b.gz.get(f)]));
  const ua = unique(before, ca);
  const moved = [...unique(after, cz)]
    .filter(([n, gz]) => ua.has(n) && Math.abs(gz - ua.get(n)) >= 1024)
    .map(([n, gz]) => `${n} ${kb(ua.get(n))} -> ${kb(gz)}`);
  console.log(`Chunks changed by 1 KB or more: ${moved.join('; ') || 'none'}`);

  console.log('\nInvariants (after):\n');
  if (!checkInvariants(after)) process.exitCode = 1;
};

const build = async (outDir, transformFile) => {
  const out = path.resolve(outDir);
  const exists = fs.existsSync(out);
  let existing = out;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const resolved = path.join(fs.realpathSync(existing), path.relative(existing, out));
  const relative = path.relative(fs.realpathSync(ROOT), resolved);
  const inside = relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  if (inside) fail(`refusing an outDir inside the repo: ${out}`);
  if (exists && fs.readdirSync(out).length > 0 && !fs.existsSync(path.join(out, SENTINEL))) {
    fail(`refusing a non-empty outDir that no earlier bundle-report run created (no ${SENTINEL}): ${out}`);
  }

  const changed = new Set();
  const plugins = [];
  if (transformFile) {
    const { transform } = await import(pathToFileURL(path.resolve(transformFile)).href);
    if (typeof transform !== 'function') fail(`${transformFile} does not export transform(code, id)`);
    plugins.push({
      name: 'bundle-report-transform',
      enforce: 'pre',
      transform(code, id) {
        const file = slash(id);
        if (file.includes('/node_modules/')) return null;
        const next = transform(code, file);
        if (next == null || next === code) return null;
        changed.add(slash(path.relative(ROOT, file)));
        return { code: next, map: null };
      },
    });
  }

  const { build: viteBuild } = await import('vite');
  await viteBuild({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    plugins,
    build: { outDir: out, emptyOutDir: true, sourcemap: true },
  });
  fs.writeFileSync(path.join(out, SENTINEL), '');

  if (transformFile) {
    if (changed.size === 0) fail('the transform changed no module - the experiment measured nothing');
    const list = [...changed].sort().map((f) => `  ${f}`);
    console.log(`Transform changed ${changed.size} module(s):\n${list.join('\n')}\n`);
  }
  report(out);
};

const [command, ...args] = process.argv.slice(2);
const transformAt = args.indexOf('--transform');
let transformFile;
if (transformAt !== -1) {
  transformFile = args[transformAt + 1];
  if (!transformFile) usage();
  args.splice(transformAt, 2);
}

if (command === 'build' && args.length === 1) await build(args[0], transformFile);
else if (command === 'report' && args.length === 1 && !transformFile) report(args[0]);
else if (command === 'diff' && args.length === 2 && !transformFile) diff(args[0], args[1]);
else usage();
