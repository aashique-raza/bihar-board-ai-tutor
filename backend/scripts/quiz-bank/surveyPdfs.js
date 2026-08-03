/**
 * Quiz Bank — Step 1: PDF Survey
 *
 * Reads every PDF in data/quiz-bank/pdfs/ and works out what we are dealing with,
 * BEFORE any extraction is attempted. Answers one question per file:
 *
 *   Can a script read this paper's text, or is it a scan that needs page-image reading?
 *
 * The filename is treated as the ONLY source of truth for year + shift. Extractors have
 * repeatedly mislabelled papers, so nothing inside the PDF is trusted for identity.
 *
 * Writes: data/quiz-bank/reports/survey.json
 * Run:    node backend/scripts/quiz-bank/surveyPdfs.js
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PDF_DIR = path.join(REPO_ROOT, 'data/quiz-bank/pdfs');
const REPORT_PATH = path.join(REPO_ROOT, 'data/quiz-bank/reports/survey.json');

/**
 * Filename -> canonical paper id. This is the identity contract for the whole pipeline.
 * "2016 a.pdf" -> { paperId: '2016-a', year: 2016, shift: 'a' }
 * "2021.pdf"   -> { paperId: '2021',   year: 2021, shift: null }
 */
function parseIdentity(filename) {
  const base = path.basename(filename, path.extname(filename)).trim().toLowerCase();
  const match = base.match(/^(\d{4})(?:\s+([a-z]))?$/);
  if (!match) {
    return { paperId: base.replace(/\s+/g, '-'), year: null, shift: null, parsed: false };
  }
  const year = Number(match[1]);
  const shift = match[2] || null;
  return { paperId: shift ? `${year}-${shift}` : String(year), year, shift, parsed: true };
}

/**
 * Find pdftotext. On Windows it usually ships inside Git's bundled MinGW tools, which are
 * not on Node's PATH even though Git Bash can see them — so probe the known locations too.
 */
const PDFTOTEXT_CANDIDATES = [
  'pdftotext',
  'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe',
  'C:\\Program Files (x86)\\Git\\mingw64\\bin\\pdftotext.exe',
  'C:\\Program Files\\poppler\\bin\\pdftotext.exe',
  '/usr/bin/pdftotext',
  '/usr/local/bin/pdftotext',
  '/opt/homebrew/bin/pdftotext',
];

function findPdftotext() {
  for (const candidate of PDFTOTEXT_CANDIDATES) {
    // Absolute paths: a plain existence check is enough and avoids spawning.
    if (path.isAbsolute(candidate) || /^[A-Za-z]:\\/.test(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    // Bare name: resolve via PATH. Note pdftotext exits 99 on -v, which is not an error.
    try {
      execFileSync(candidate, ['-v'], { stdio: 'ignore' });
      return candidate;
    } catch (err) {
      if (err.status === 99) return candidate; // ran fine, just a non-zero version exit
    }
  }
  return null;
}

let PDFTOTEXT = null;

/** Page count via the page tree. Good enough for a survey. */
function countPages(filePath) {
  try {
    const info = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
    const m = info.match(/^Pages:\s+(\d+)/m);
    if (m) return Number(m[1]);
  } catch {
    /* pdfinfo not installed — fall through */
  }
  const raw = fs.readFileSync(filePath).toString('latin1');
  const leaves = raw.match(/\/Type\s*\/Page[^s]/g);
  if (leaves && leaves.length) return leaves.length;
  const images = (raw.match(/\/Subtype\s*\/Image/g) || []).length;
  return images || null; // a pure scan draws roughly one image per page
}

/**
 * Extract the text layer with pdftotext. Two numbers matter:
 *   totalChars   — is there any text layer at all?
 *   latinChars   — how much of it is readable English/ASCII?
 *
 * Hindi in these papers is stored in legacy Kruti-Dev style encodings, so it comes out
 * as garbage or blank. That is expected and is NOT a reason to reject a paper: the
 * English half of a bilingual paper is enough to build a question from.
 */
function probeText(filePath) {
  let text = '';
  try {
    text = execFileSync(PDFTOTEXT, ['-layout', filePath, '-'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }

  const compact = text.replace(/\s+/g, ' ').trim();
  const totalChars = compact.length;

  // "Real English" = words of 4+ letters sitting next to each other. Legacy-encoded
  // Devanagari produces letter soup, so word-pairs are a good signal of true English.
  const englishLines = (text.match(/[A-Za-z]{4,}\s+[A-Za-z]{4,}/g) || []).length;

  // Question numbering appears as "1." or "1-" (Hindi convention). Both are used.
  const numbered = (text.match(/^[ \t]*\d{1,3}[.\-]/gm) || []).length;
  const optionMarkers = (text.match(/^[ \t]*\((?:A|a)\)/gm) || []).length;

  return { totalChars, englishLines, numbered, optionMarkers, sample: compact.slice(0, 120) };
}

function surveyOne(filePath, toolAvailable) {
  const filename = path.basename(filePath);
  const identity = parseIdentity(filename);
  const sizeKb = Math.round(fs.statSync(filePath).size / 1024);
  const pages = countPages(filePath);
  const probe = toolAvailable ? probeText(filePath) : null;

  let verdict;
  let reason;
  let route;

  if (!probe) {
    verdict = 'UNKNOWN';
    reason = 'pdftotext unavailable — could not test for a text layer.';
    route = 'blocked';
  } else if (probe.totalChars === 0) {
    verdict = 'SCANNED';
    reason = 'No text layer at all — the pages are images.';
    route = 'page-images'; // must be read as rendered pages
  } else if (probe.englishLines >= 50) {
    verdict = 'TEXT';
    reason = 'Text layer present with readable English — a parser can read this.';
    route = 'script';
  } else {
    verdict = 'THIN-TEXT';
    reason = 'Text layer exists but very little readable English — treat as a scan.';
    route = 'page-images';
  }

  return {
    filename,
    ...identity,
    sizeKb,
    pages,
    textChars: probe?.totalChars ?? null,
    englishLines: probe?.englishLines ?? null,
    numbered: probe?.numbered ?? null,
    optionMarkers: probe?.optionMarkers ?? null,
    sample: probe?.sample ?? null,
    verdict,
    route,
    reason,
  };
}

function main() {
  if (!fs.existsSync(PDF_DIR)) {
    console.error(`PDF folder not found: ${PDF_DIR}`);
    process.exit(1);
  }

  PDFTOTEXT = findPdftotext();
  const toolAvailable = Boolean(PDFTOTEXT);
  if (!toolAvailable) {
    console.warn('WARNING: pdftotext not found — verdicts will be UNKNOWN.\n');
  } else {
    console.log(`  using pdftotext: ${PDFTOTEXT}`);
  }

  const files = fs
    .readdirSync(PDF_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();

  if (!files.length) {
    console.error(`No PDFs found in ${PDF_DIR}`);
    process.exit(1);
  }

  const results = files.map((f) => {
    try {
      return surveyOne(path.join(PDF_DIR, f), toolAvailable);
    } catch (err) {
      return {
        filename: f,
        ...parseIdentity(f),
        verdict: 'UNREADABLE',
        route: 'blocked',
        reason: `Could not open/parse: ${err.message}`,
      };
    }
  });

  const pad = (v, n) => String(v ?? '-').padEnd(n);
  const padL = (v, n) => String(v ?? '-').padStart(n);
  console.log('');
  console.log(
    pad('FILE', 12) + pad('ID', 9) + padL('PAGES', 6) + padL('SIZE', 8) +
    padL('TEXT', 9) + padL('ENG', 6) + padL('Q#', 5) + padL('(A)', 5) +
    '  ' + pad('VERDICT', 11) + 'ROUTE'
  );
  console.log('-'.repeat(84));
  for (const r of results) {
    console.log(
      pad(r.filename.replace(/\.pdf$/i, ''), 12) + pad(r.paperId, 9) + padL(r.pages, 6) +
      padL(r.sizeKb ? r.sizeKb + 'kb' : '-', 8) + padL(r.textChars, 9) +
      padL(r.englishLines, 6) + padL(r.numbered, 5) + padL(r.optionMarkers, 5) +
      '  ' + pad(r.verdict, 11) + r.route
    );
  }

  const byRoute = results.reduce((acc, r) => {
    acc[r.route] = (acc[r.route] || 0) + 1;
    return acc;
  }, {});
  const byVerdict = results.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1;
    return acc;
  }, {});

  console.log('');
  console.log('SUMMARY');
  for (const [v, n] of Object.entries(byVerdict)) console.log(`  ${v}: ${n}`);
  console.log('');
  console.log('ROUTE (how each paper must be extracted)');
  for (const [v, n] of Object.entries(byRoute)) console.log(`  ${v}: ${n}`);

  const unparsed = results.filter((r) => !r.parsed);
  if (unparsed.length) {
    console.log('\nFILENAMES THAT COULD NOT BE PARSED INTO year/shift:');
    for (const r of unparsed) console.log(`  ${r.filename}`);
  }

  const totalPages = results.reduce((s, r) => s + (r.pages || 0), 0);
  const scanPages = results
    .filter((r) => r.route === 'page-images')
    .reduce((s, r) => s + (r.pages || 0), 0);
  console.log(`\n  Papers: ${results.length}   Total pages: ${totalPages}   Pages needing image-reading: ${scanPages}\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    pdfDir: path.relative(REPO_ROOT, PDF_DIR).replace(/\\/g, '/'),
    tool: { pdftotext: PDFTOTEXT },
    totals: { papers: results.length, pages: totalPages, scanPages, byVerdict, byRoute },
    papers: results,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`  Report written: ${path.relative(REPO_ROOT, REPORT_PATH).replace(/\\/g, '/')}\n`);
}

main();
