// Example from the example app (.claude/scripts/pretty-json.mjs), used by examples/backend-request; not copied by apply.mjs. No dependencies.
// Usage: node .claude/scripts/pretty-json.mjs <file> - prints the JSON re-indented by two spaces; exits 1 with NOT JSON, or with MISMATCH when the output differs outside whitespace.
// It never re-stringifies the text: JSON.parse + JSON.stringify would round 0.1000000000000000055511 and rewrite 1E-10.
import { readFileSync } from 'node:fs';

const pretty = (src) => {
  let out = '';
  let depth = 0;
  let inString = false;
  const pad = () => '\n' + '  '.repeat(depth);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += src[++i];
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '{' || ch === '[') {
      const close = ch === '{' ? '}' : ']';
      let j = i + 1;
      while (/\s/.test(src[j] ?? '')) j++;
      if (src[j] === close) {
        out += ch + close;
        i = j;
      } else {
        depth++;
        out += ch + pad();
      }
    } else if (ch === '}' || ch === ']') {
      depth--;
      out += pad() + ch;
    } else if (ch === ',') {
      out += ',' + pad();
    } else if (ch === ':') {
      out += ': ';
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
};

const stripWhitespace = (s) => {
  let r = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      r += ch;
      if (ch === '\\') r += s[++i];
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      r += ch;
    } else if (!/\s/.test(ch)) r += ch;
  }
  return r;
};

// trimStart also drops a BOM, which JSON.parse refuses.
const raw = readFileSync(process.argv[2], 'utf8').trimStart();
// Parsed only to refuse what is not JSON (an HTML error, a truncated slice), which the scanner would reshape silently; never re-stringified.
try {
  JSON.parse(raw);
} catch {
  console.error('NOT JSON - paste the body as returned, in a plain fence');
  process.exit(1);
}
const formatted = pretty(raw);
if (stripWhitespace(formatted) !== stripWhitespace(raw)) {
  console.error('MISMATCH');
  process.exit(1);
}
process.stdout.write(formatted + '\n');
