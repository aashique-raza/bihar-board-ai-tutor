/**
 * apply-heading-restructure.js
 *
 * Mechanically applies a heading-restructure spec to ONE markdown file:
 * each operation replaces an exact, whole heading line with a new heading line
 * (level and/or number-prefix change only — never touches prose/body text).
 *
 * Safety guarantees:
 *   - Every `from` line must exist in the file EXACTLY once, else the whole
 *     run aborts with an error (no partial writes).
 *   - Only whole lines starting with a Markdown heading marker (#) are touched.
 *   - Reports a summary (headings before/after, per-level breakdown) so the
 *     caller can sanity-check nothing was lost.
 *
 * Usage: node scripts/apply-heading-restructure.js <spec.json>
 *
 * spec.json shape:
 * {
 *   "file": "../data/class-10/science/biology/chapter-04-heredity-and-evolution.md",
 *   "operations": [
 *     { "from": "## 12. Some Heading", "to": "### 8.2 Some Heading" },
 *     ...
 *   ]
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specPath = process.argv[2];
if (!specPath) {
  console.error('Usage: node apply-heading-restructure.js <spec.json>');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
const targetPath = path.resolve(__dirname, spec.file);

const countHeadings = (text) =>
  text.split(/\r?\n/).filter((l) => /^#{1,6}\s+/.test(l)).length;

const countByLevel = (text) => {
  const counts = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^(#{1,6})\s+/.exec(line);
    if (m) counts[m[1].length] = (counts[m[1].length] || 0) + 1;
  }
  return counts;
};

let content = fs.readFileSync(targetPath, 'utf8');
const before = { headings: countHeadings(content), byLevel: countByLevel(content) };

// --- Validation pass: every `from` must match exactly once, no duplicates among `to` ---
const errors = [];
const toSeen = new Set();

for (const op of spec.operations) {
  if (!/^#{1,6}\s+/.test(op.from)) errors.push(`"from" is not a heading line: "${op.from}"`);
  if (!/^#{1,6}\s+/.test(op.to)) errors.push(`"to" is not a heading line: "${op.to}"`);

  const escaped = op.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = content.match(new RegExp(`^${escaped}$`, 'gm')) || [];
  if (matches.length === 0) errors.push(`NOT FOUND (0 matches): "${op.from}"`);
  if (matches.length > 1) errors.push(`AMBIGUOUS (${matches.length} matches): "${op.from}"`);

  if (toSeen.has(op.to)) errors.push(`DUPLICATE "to" target (would create identical headings): "${op.to}"`);
  toSeen.add(op.to);
}

if (errors.length > 0) {
  console.error(`\nABORTED — ${errors.length} validation error(s), no changes written:\n`);
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}

// --- Apply pass (all validated, safe to mutate) ---
for (const op of spec.operations) {
  const escaped = op.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  content = content.replace(new RegExp(`^${escaped}$`, 'm'), op.to);
}

fs.writeFileSync(targetPath, content, 'utf8');

const after = { headings: countHeadings(content), byLevel: countByLevel(content) };

console.log(`Applied ${spec.operations.length} operations to ${spec.file}`);
console.log('Heading count before:', before.headings, JSON.stringify(before.byLevel));
console.log('Heading count after: ', after.headings, JSON.stringify(after.byLevel));

if (before.headings !== after.headings) {
  console.error('\n⚠️  WARNING: total heading count changed — this should never happen for a pure level/rename change. Investigate before trusting this file.');
  process.exit(1);
}

console.log('OK — heading count unchanged, only levels/numbering shifted as specified.');
