#!/usr/bin/env node
// Example from the example app (React 19 + TanStack Query v5 + i18next, en / de). Not copied by apply.mjs.
// Deterministic i18n checks for an integration, run against git objects only - no working tree is read
// and nothing is written. Called from step 4 of the integrate-worktree skill.
//
//   node i18n-merge-check.mjs <merge-base> <main> <wtb> <merged-tree>
//
// Exits 1 and prints every failure found; exits 0 when all four checks pass.
//
// Why this is not left to the semantic subagent: all four are set comparisons with an exact answer, and
// the two translation files are a pair that parallel trees tend to collide on. A clean `merge-tree` on them
// usually means the two edits landed far apart, not that they are compatible.
import { execFileSync } from 'node:child_process';

const [BASE, MAIN, WTB, MERGED] = process.argv.slice(2);
if (!MERGED) {
  console.error('usage: node i18n-merge-check.mjs <merge-base> <main> <wtb> <merged-tree>');
  process.exit(2);
}

const LANGS = ['en', 'de'];
const filePath = (lang) => `public/locales/${lang}/translation.json`;

// A mistyped rev must fail, not read as four empty files that pass every check.
for (const rev of [BASE, MAIN, WTB, MERGED]) {
  try {
    execFileSync('git', ['cat-file', '-e', rev], { stdio: 'ignore' });
  } catch {
    console.error(`not a valid revision: ${rev}`);
    process.exit(2);
  }
}

// execFileSync, not execSync: no shell, so a rev like `abc^{tree}` survives cmd.exe on Windows
const load = (rev, lang) => {
  let raw;
  try {
    raw = execFileSync('git', ['show', `${rev}:${filePath(lang)}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return {}; // file absent at that rev - treat as empty rather than dying
  }
  // A file that exists but does not parse is a finding, never an empty object.
  return JSON.parse(raw);
};

const walk = (obj, prefix = '', out = new Map()) => {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix + key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.set(path, { kind: 'node' });
      walk(value, path + '.', out);
    } else out.set(path, { kind: 'leaf', value });
  }
  return out;
};
const leaves = (map) => new Map([...map].filter(([, v]) => v.kind === 'leaf').map(([k, v]) => [k, v.value]));

let failed = 0;
const fail = (message, items) => {
  failed++;
  console.log(`FAIL ${message} (${items.length})`);
  items.slice(0, 20).forEach((item) => console.log(`       ${item}`));
  if (items.length > 20) console.log(`       ... +${items.length - 20} more`);
};

const merged = {};
const base = {};
const ours = {};
const theirs = {};
for (const lang of LANGS) {
  merged[lang] = walk(load(MERGED, lang));
  base[lang] = leaves(walk(load(BASE, lang)));
  ours[lang] = leaves(walk(load(MAIN, lang)));
  theirs[lang] = leaves(walk(load(WTB, lang)));
}

// A. en/de parity in the merged result. A key missing from de renders as English text to a German user;
// missing from en is usually absorbed by the inline-default t('key', 'English default') pattern.
const mergedEn = leaves(merged.en);
const mergedDe = leaves(merged.de);
console.log(`merged: en ${mergedEn.size} leaves, de ${mergedDe.size}`);
const onlyEn = [...mergedEn.keys()].filter((key) => !mergedDe.has(key));
const onlyDe = [...mergedDe.keys()].filter((key) => !mergedEn.has(key));
if (onlyEn.length) fail('present in en, missing in de', onlyEn);
if (onlyDe.length) fail('present in de, missing in en', onlyDe);

// B. same path is a leaf on one side and a subtree on the other
const typeClash = [...merged.en].filter(([key, v]) => merged.de.has(key) && merged.de.get(key).kind !== v.kind).map(([key]) => key);
if (typeClash.length) fail('leaf/node type mismatch between en and de', typeClash);

for (const lang of LANGS) {
  const addedByMain = [...ours[lang].keys()].filter((key) => !base[lang].has(key));
  const addedByWtb = [...theirs[lang].keys()].filter((key) => !base[lang].has(key));
  const mergedLeaves = leaves(merged[lang]);

  // C. both sides introduced the same key with different text - git kept one and dropped the other in
  // silence. Invisible to a key-set comparison of the merged file, which is why the base is needed here.
  const collided = addedByMain
    .filter((key) => addedByWtb.includes(key))
    .filter((key) => ours[lang].get(key) !== theirs[lang].get(key))
    .map((key) => `${key}\n         main: ${JSON.stringify(ours[lang].get(key))}\n         wt:   ${JSON.stringify(theirs[lang].get(key))}`);
  if (collided.length) fail(`[${lang}] same key added by both sides with different values`, collided);

  // D. a key one side added is not in the merged result at all - the merge lost it outright
  const dropped = [...new Set([...addedByMain, ...addedByWtb])].filter((key) => !mergedLeaves.has(key));
  if (dropped.length) fail(`[${lang}] added by one side but absent from the merge`, dropped);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall i18n merge checks passed');
process.exit(failed ? 1 : 0);
