// Example from the example app (React + TypeScript + i18next, en / de). Depends on: translations in
// public/locales/{en,de}/translation.json, the inline-fallback t('key', 'English') pattern; not copied by apply.mjs.
// Deterministic checks over public/locales/{en,de}/translation.json against src/ - the i18n agent's tool.
//   node .claude/scripts/i18n-check.mjs            parity, keys referenced in code (a literal `t()` / `i18nKey` /
//                                                  route `titleKey`) but missing from a file, and literal inline
//                                                  English fallbacks that differ from `en`
//   node .claude/scripts/i18n-check.mjs --orphans  additionally list en keys nothing under src/ references
// Exit 1 when parity, a missing key or a fallback fails; orphans are informational (dynamic keys cannot be proven
// unused). Computed keys, `defaultValue` objects and `Record` fallbacks are not read.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANGS = ['en', 'de'];
const WANT_ORPHANS = process.argv.includes('--orphans');

const load = (lang) => JSON.parse(readFileSync(join(REPO, 'public', 'locales', lang, 'translation.json'), 'utf8'));
const leaves = (obj, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') leaves(v, path, out);
    else out.set(path, typeof v);
  }
  return out;
};

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'generated') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/^__hunt_probe/.test(name)) out.push(p);
  }
  return out;
};

const files = walk(join(REPO, 'src'));
const sources = files.map((f) => [relative(REPO, f).split(sep).join('/'), readFileSync(f, 'utf8')]);

// Literal keys: t('a.b'), t("a.b"), i18nKey="a.b", i18n.t('a.b'). Template literals are dynamic - collected as prefixes.
// A backtick key with no interpolation is a literal key too, so the pattern accepts a backtick delimiter.
const literalRe = /\b(?:t|i18n\.t)\(\s*(['"`])([a-zA-Z0-9_.]+)\1|i18nKey=(['"])([a-zA-Z0-9_.]+)\3/g;
// A route's `titleKey` is resolved by `t()` far from the literal, so no `t(` sits in front of it.
const titleKeyRe = /\btitleKey:\s*(['"])([a-zA-Z0-9_.]+)\1/g;
// `t('key', 'English')` - the inline fallback, which must be the `en` value verbatim. One branch per delimiter,
// so an apostrophe inside a double-quoted fallback ("doesn't") is part of the text.
const fallbackRe = /\b(?:t|i18n\.t)\(\s*(['"`])([a-zA-Z0-9_.]+)\1\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g;
const dynamicRe = /\b(?:t|i18n\.t)\(\s*`([a-zA-Z0-9_.]*)\$\{/g;
const referenced = new Map(); // key -> first file
const dynamicPrefixes = new Set();
const fallbacks = new Map(); // key -> { file, text }
for (const [file, text] of sources) {
  for (const m of text.matchAll(literalRe)) {
    const key = m[2] ?? m[4];
    if (!referenced.has(key)) referenced.set(key, file);
  }
  for (const m of text.matchAll(titleKeyRe)) {
    if (!referenced.has(m[2])) referenced.set(m[2], file);
  }
  for (const m of text.matchAll(dynamicRe)) dynamicPrefixes.add(m[1]);
  for (const m of text.matchAll(fallbackRe)) {
    // A template literal that interpolates has no fixed text to compare.
    if (m[5] !== undefined && m[5].includes('${')) continue;
    const fallback = m[3] ?? m[4] ?? m[5];
    if (!fallbacks.has(m[2])) fallbacks.set(m[2], { file, text: fallback.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n') });
  }
}

const tables = Object.fromEntries(LANGS.map((l) => [l, leaves(load(l))]));
// leaves() keeps the type of each value; this keeps the value itself, for the two text checks below.
const flatten = (obj, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, path, out);
    else out.set(path, v);
  }
  return out;
};
const strings = Object.fromEntries(LANGS.map((l) => [l, flatten(load(l))]));
let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(msg);
};

// 1. Parity
for (const [a, b] of [
  ['en', 'de'],
  ['de', 'en'],
]) {
  for (const [key, type] of tables[a]) {
    if (!tables[b].has(key)) fail(`missing in ${b}: ${key}`);
    else if (tables[b].get(key) !== type) fail(`type differs (${a}: ${type}, ${b}: ${tables[b].get(key)}): ${key}`);
  }
}

// 2. Referenced in code, absent from a file. A plural key `x` is satisfied by `x_one` / `x_other`.
const has = (lang, key) => tables[lang].has(key) || tables[lang].has(`${key}_one`) || tables[lang].has(`${key}_other`);
for (const [key, file] of referenced) {
  for (const lang of LANGS) if (!has(lang, key)) fail(`referenced in ${file} but absent from ${lang}: ${key}`);
}

// 3. The inline English fallback in code is the `en` value verbatim - the invariant the i18n agent works to.
// A drift means the user reads one string and the code claims another, and only one of the two is ever reviewed.
for (const [key, { file, text }] of fallbacks) {
  const value = strings.en.get(key);
  if (typeof value === 'string' && value !== text) {
    fail(`inline fallback differs from en (${file}): ${key}\n    code: ${text}\n    en:   ${value}`);
  }
}

// 4. Placeholder parity (warning, never a failure): the two files must interpolate the same names, or the
// German prints a literal `{{count}}` to the user. A warning so that the first run over an already drifted
// file does not block a turn.
const placeholders = (value) => (typeof value === 'string' ? [...value.matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1]).sort() : []);
const placeholderWarnings = [];
for (const [key, value] of strings.en) {
  if (!strings.de.has(key)) continue;
  const en = placeholders(value).join(',');
  const de = placeholders(strings.de.get(key)).join(',');
  const show = (list) => (list ? `{{${list.split(',').join('}} {{')}}}` : 'none');
  if (en !== de) placeholderWarnings.push(`  ${key}\n    en: ${show(en)}  de: ${show(de)}`);
}
if (placeholderWarnings.length > 0) {
  console.log(`\nwarning - ${placeholderWarnings.length} key(s) interpolate different placeholders in en and de:`);
  for (const line of placeholderWarnings) console.log(line);
}

// 5. Orphans (informational): en leaves nothing under src/ mentions as a plain string.
if (WANT_ORPHANS) {
  const allText = sources.map(([, t]) => t).join('\n');
  const orphans = [];
  for (const key of tables.en.keys()) {
    const base = key.replace(/_(one|other)$/, '');
    if ([...dynamicPrefixes].some((p) => base.startsWith(p))) continue;
    if (!allText.includes(base)) orphans.push(key);
  }
  console.log(
    `\norphans (${orphans.length}, en keys with no static reference; dynamic prefixes skipped: ${[...dynamicPrefixes].join(', ') || 'none'}):`
  );
  for (const k of orphans) console.log(`  ${k}`);
}

console.log(
  failures
    ? `\n${failures} failure(s) - ${tables.en.size} en keys, ${tables.de.size} de keys, ${referenced.size} literal keys referenced in code, ${fallbacks.size} inline fallbacks compared`
    : `OK - ${tables.en.size} en keys, ${tables.de.size} de keys in parity, all ${referenced.size} literal keys referenced in code present in both, ${fallbacks.size} inline fallbacks match en`
);
process.exit(failures ? 1 : 0);
