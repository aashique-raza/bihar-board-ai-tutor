/**
 * Quiz Bank — Stage C: question blocks
 *
 * Input:  data/quiz-bank/stage1-pages/<paperId>/page-NN.json   (Stage B output, immutable)
 * Output: data/quiz-bank/stage2-blocks/<paperId>.json
 *
 * Turns one paper's page-by-page text into one block per question.
 *
 * The pilot (2016-a) proved two things this script is built around:
 *   1. A question can split across a page break — its Hindi ends on one rendered half and
 *      its English starts on the next. So the WHOLE paper is joined first, then segmented.
 *      A page boundary is a marker, not a wall. (QUIZ_DATA_PIPELINE.md §7 Stage P, finding 4)
 *   2. Hindi and English are two parallel copies of the same paper, not two papers. They are
 *      segmented independently and then paired by sourceId, so a miss on one side is visible
 *      instead of silently shifting every question after it.
 *
 * Nothing here corrects the text. Whatever Stage B saw is what gets carried forward —
 * cleanup belongs to Stage D. (P2: stages are immutable.)
 *
 * Run: node backend/scripts/quiz-bank/buildBlocks.js [paperId ...]
 *      (no argument = every paper that has a stage1-pages folder)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PAGES_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage1-pages');
const BLOCKS_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage2-blocks');

const SCHEMA_VERSION = 1;

/** Roman numerals in paper order — used to recognise sub-parts (i)…(xx) and to sort them. */
const ROMAN = [
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
];
const ROMAN_ALT = ROMAN.join('|');

/**
 * Per-language markers. Both halves of the paper carry the same structure, only the words
 * differ, so everything below is driven off this table instead of language `if`s.
 */
const MARKERS = {
  hi: {
    groupA: /^\s*ग्रुप\s*[-–—]\s*A\b/,
    groupB: /^\s*ग्रुप\s*[-–—]\s*B\b/,
    alternative: /^\s*अथवा\s*$/,
    declaredMarks: /\(\s*अंक\s*:\s*(\d+)\s*\)/,
    diagram: /सचित्र|चित्र|आरेख/,
  },
  en: {
    groupA: /^\s*GROUP\s*[-–—]\s*A\b/i,
    groupB: /^\s*GROUP\s*[-–—]\s*B\b/i,
    alternative: /^\s*OR\s*$/,
    declaredMarks: /\(\s*Marks\s*:\s*(\d+)\s*\)/i,
    diagram: /\bdiagram\b|\bfigure\b|\blabelled\b/i,
  },
};

/** A numbered question: "12. …". Group A only — Group B is all sub-parts of Q31. */
const NUMBERED = /^\s*(\d{1,2})\s*[.\-]\s*(.*)$/;
/** A sub-part: "(xiv) …". Option keys are a–d, so there is no clash with i/v/x. */
const SUBPART = new RegExp(`^\\s*\\((${ROMAN_ALT})\\)\\s*(.*)$`);
/** Marks printed in the right margin, e.g. "…कैसे होता है ?   1" */
const TRAILING_MARKS = /\s{1,}(\d{1,2})\s*$/;

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

/**
 * Read every page file of a paper and flatten it into two parallel line lists — one per
 * language — each line remembering which PDF page it came from (that is what fills
 * provenance.pdfPages later).
 */
function loadPaper(paperId) {
  const dir = path.join(PAGES_DIR, paperId);
  const manifestPath = path.join(dir, '_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No _manifest.json for ${paperId} — Stage B has not run for this paper.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const pending = (manifest.pages || []).filter((p) => p.status !== 'done');
  if (pending.length) {
    throw new Error(
      `${paperId}: ${pending.length} page(s) still pending in Stage B — finish page reading first.`
    );
  }

  const pageFiles = fs
    .readdirSync(dir)
    .filter((f) => /^page-\d+\.json$/.test(f))
    .sort();

  const lines = { hi: [], en: [] };
  const lowConfidencePages = [];

  for (const file of pageFiles) {
    const page = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (page.confidence && page.confidence !== 'high') lowConfidencePages.push(page.pdfPage);
    for (const lang of ['hi', 'en']) {
      const raw = page.raw?.[lang] || '';
      for (const text of raw.split('\n')) {
        lines[lang].push({ text, pdfPage: page.pdfPage });
      }
    }
  }

  return { manifest, lines, pageCount: pageFiles.length, lowConfidencePages };
}

// ---------------------------------------------------------------------------
// segmentation (runs once per language)
// ---------------------------------------------------------------------------

/** Pull "…text   3" apart into the text and the marks. Returns marks null if absent. */
function splitMarks(line) {
  const match = line.match(TRAILING_MARKS);
  if (!match) return { text: line.trim(), marks: null };
  return { text: line.slice(0, match.index).trim(), marks: Number(match[1]) };
}

/**
 * Split an options line into a/b/c/d.
 *
 * Scanned ascending on purpose: option (c) is often literally "(a) और (b) दोनों", and a
 * naive split on /\([a-d]\)/ would tear that option in half. Searching for "(b)" only
 * after the real "(b)" has been passed keeps the nested markers inside their own option.
 */
function parseOptions(text) {
  const keys = ['a', 'b', 'c', 'd'];
  const positions = [];
  let from = 0;
  for (const key of keys) {
    const idx = text.indexOf(`(${key})`, from);
    if (idx === -1) return null; // not a complete 4-option line
    positions.push({ key, idx });
    from = idx + 3;
  }
  return positions.map((pos, i) => {
    const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
    const body = text
      .slice(pos.idx + 3, end)
      .replace(/[।.,;]\s*$/, '')
      .trim();
    return { key: pos.key, text: body };
  });
}

/** Collapse a buffer of {text,pdfPage} lines into one string + the pages it touched. */
function joinBuffer(buffer) {
  const text = buffer
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const pdfPages = [...new Set(buffer.map((l) => l.pdfPage))].sort((a, b) => a - b);
  return { text, pdfPages };
}

/**
 * Segment one language's lines into raw segments keyed by sourceId suffix.
 *
 * Group A  -> "A:12", plus "A:28-or" for an अथवा/OR alternative
 * Group B  -> "B:31-xiv"
 *
 * The Group A header is the starting gun: everything before it (cover page, candidate
 * instructions — which are themselves numbered 1.–5.) is skipped, so instruction lines can
 * never be mistaken for questions.
 */
function segment(lines, lang) {
  const M = MARKERS[lang];
  const segments = new Map();
  const declared = {};
  const notes = [];

  let startIdx = lines.findIndex((l) => M.groupA.test(l.text));
  if (startIdx === -1) {
    notes.push(`${lang}: Group A header not found — segmenting from the top of the paper.`);
    startIdx = 0;
  } else {
    const marks = lines[startIdx].text.match(M.declaredMarks)
      || lines[startIdx + 1]?.text.match(M.declaredMarks);
    if (marks) declared.A = Number(marks[1]);
  }

  const groupBIdx = lines.findIndex((l, i) => i > startIdx && M.groupB.test(l.text));
  if (groupBIdx !== -1) {
    const marks = lines[groupBIdx].text.match(M.declaredMarks)
      || lines[groupBIdx + 1]?.text.match(M.declaredMarks);
    if (marks) declared.B = Number(marks[1]);
  }

  const endOfA = groupBIdx === -1 ? lines.length : groupBIdx;

  // ---- Group A: ascending numbered questions, each possibly with one OR alternative ----
  let current = null; // { number, marks, buffer }
  let alternative = null; // buffer for the OR half
  let lastNumber = 0;

  const flushA = () => {
    if (!current) return;
    segments.set(`A:${current.number}`, {
      group: 'A',
      questionNumber: current.number,
      subPart: null,
      marks: current.marks,
      ...joinBuffer(current.buffer),
    });
    if (alternative) {
      segments.set(`A:${current.number}-or`, {
        group: 'A',
        questionNumber: current.number,
        subPart: 'or',
        marks: current.marks, // an alternative always carries the parent's marks
        isAlternative: true,
        ...joinBuffer(alternative),
      });
    }
    current = null;
    alternative = null;
  };

  for (let i = startIdx + 1; i < endOfA; i++) {
    const line = lines[i];
    const numbered = line.text.match(NUMBERED);

    // Only an ascending number starts a new question. "1." inside an answer or a stray
    // digit cannot silently restart the count.
    if (numbered && Number(numbered[1]) === lastNumber + 1) {
      flushA();
      const { text, marks } = splitMarks(numbered[2]);
      lastNumber = Number(numbered[1]);
      current = { number: lastNumber, marks, buffer: [{ text, pdfPage: line.pdfPage }] };
      continue;
    }

    if (!current) continue; // still in the instruction block

    if (M.alternative.test(line.text)) {
      alternative = [];
      continue;
    }

    const { text, marks } = splitMarks(line.text);
    if (marks !== null && current.marks === null) current.marks = marks;
    (alternative || current.buffer).push({ text, pdfPage: line.pdfPage });
  }
  flushA();

  // ---- Group B: Q31's sub-parts (i)…(xx), each an MCQ ----
  if (groupBIdx !== -1) {
    let stemNumber = null;
    let sub = null; // { roman, buffer }

    const flushB = () => {
      if (!sub) return;
      segments.set(`B:${stemNumber}-${sub.roman}`, {
        group: 'B',
        questionNumber: stemNumber,
        subPart: sub.roman,
        marks: 1,
        ...joinBuffer(sub.buffer),
      });
      sub = null;
    };

    for (let i = groupBIdx + 1; i < lines.length; i++) {
      const line = lines[i];

      // The Q31 stem ("31. Choose the correct alternative…") only sets the number — it is
      // an instruction, not a question, so it never becomes a block of its own.
      const numbered = line.text.match(NUMBERED);
      if (numbered && stemNumber === null) {
        stemNumber = Number(numbered[1]);
        continue;
      }
      if (stemNumber === null) continue; // still in the Group B instruction block

      const subpart = line.text.match(SUBPART);
      if (subpart) {
        flushB();
        sub = { roman: subpart[1], buffer: [{ text: subpart[2].trim(), pdfPage: line.pdfPage }] };
        continue;
      }
      if (!sub) continue;
      sub.buffer.push({ text: line.text, pdfPage: line.pdfPage });
    }
    flushB();
  }

  return { segments, declared, notes };
}

/**
 * Split a Group B segment into its stem and its four options. The options always start at
 * the first "(a)" — everything before it is the question itself, however many lines it took.
 */
function splitStemAndOptions(text) {
  const idx = text.indexOf('(a)');
  if (idx === -1) return { stem: text, options: null };
  const options = parseOptions(text.slice(idx));
  if (!options) return { stem: text, options: null };
  return { stem: text.slice(0, idx).trim().replace(/[:—-]\s*$/, '').trim(), options };
}

// ---------------------------------------------------------------------------
// pairing hi + en
// ---------------------------------------------------------------------------

function buildBlocks(paperId, hi, en) {
  const keys = [...new Set([...hi.segments.keys(), ...en.segments.keys()])];

  // Paper order, not string order: A before B, then by number, then by sub-part.
  keys.sort((a, b) => {
    const parse = (k) => {
      const [group, rest] = k.split(':');
      const [num, part] = rest.split('-');
      return { group, num: Number(num), part: part || '' };
    };
    const A = parse(a);
    const B = parse(b);
    if (A.group !== B.group) return A.group < B.group ? -1 : 1;
    if (A.num !== B.num) return A.num - B.num;
    const rank = (p) => (p === '' ? -1 : p === 'or' ? 999 : ROMAN.indexOf(p));
    return rank(A.part) - rank(B.part);
  });

  return keys.map((key) => {
    const h = hi.segments.get(key) || null;
    const e = en.segments.get(key) || null;
    const meta = h || e;
    const flags = [];

    if (!h) flags.push('missing-hindi');
    if (!e) flags.push('missing-english');

    const isMcq = meta.group === 'B';
    let text = { hi: h?.text ?? null, en: e?.text ?? null };
    let options = null;

    if (isMcq) {
      const splitHi = h ? splitStemAndOptions(h.text) : { stem: null, options: null };
      const splitEn = e ? splitStemAndOptions(e.text) : { stem: null, options: null };
      text = { hi: splitHi.stem, en: splitEn.stem };

      if (h && !splitHi.options) flags.push('options-unparsed-hindi');
      if (e && !splitEn.options) flags.push('options-unparsed-english');

      if (splitHi.options || splitEn.options) {
        options = ['a', 'b', 'c', 'd'].map((k) => ({
          key: k,
          text: {
            hi: splitHi.options?.find((o) => o.key === k)?.text ?? null,
            en: splitEn.options?.find((o) => o.key === k)?.text ?? null,
          },
        }));
      }
    }

    // Marks come from whichever language printed them; a disagreement is recorded, never
    // averaged away (A18 — per-question marks win, mismatches get flagged).
    let marks = h?.marks ?? e?.marks ?? null;
    if (h?.marks != null && e?.marks != null && h.marks !== e.marks) {
      flags.push(`marks-mismatch-hi-${h.marks}-en-${e.marks}`);
      marks = h.marks;
    }
    if (marks === null) flags.push('marks-missing');

    if (!text.hi || !text.en) flags.push('empty-text');

    const diagram = Boolean(
      (text.hi && MARKERS.hi.diagram.test(text.hi)) ||
      (text.en && MARKERS.en.diagram.test(text.en))
    );

    const isAlternative = Boolean(h?.isAlternative || e?.isAlternative);
    const subPart = meta.subPart;
    const sourceId = subPart
      ? `${paperId}:${meta.group}:${meta.questionNumber}-${subPart}`
      : `${paperId}:${meta.group}:${meta.questionNumber}`;

    return {
      sourceId,
      group: meta.group,
      questionNumber: meta.questionNumber,
      subPart,
      section: isMcq ? 'objective' : 'subjective',
      type: isMcq ? 'mcq' : (marks !== null && marks >= 5 ? 'long' : 'short'),
      marks,
      variantOf: isAlternative ? `${paperId}:${meta.group}:${meta.questionNumber}` : null,
      hasAlternative: false, // filled in below, once every block is known
      text,
      options,
      diagramMentioned: diagram,
      provenance: {
        pdfPages: [...new Set([...(h?.pdfPages || []), ...(e?.pdfPages || [])])].sort((a, b) => a - b),
        readBy: 'vision',
      },
      flags,
    };
  });
}

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

/** Sorted keys, no timestamps — so a re-run produces a byte-identical file (P5). */
function stableStringify(value) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = sortKeys(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function processPaper(paperId) {
  const { manifest, lines, lowConfidencePages } = loadPaper(paperId);

  const hi = segment(lines.hi, 'hi');
  const en = segment(lines.en, 'en');
  const blocks = buildBlocks(paperId, hi, en);

  // Mark parents of an OR alternative.
  const alternativeParents = new Set(blocks.filter((b) => b.variantOf).map((b) => b.variantOf));
  for (const block of blocks) {
    if (alternativeParents.has(block.sourceId)) block.hasAlternative = true;
  }

  const groupA = blocks.filter((b) => b.group === 'A' && !b.variantOf);
  const groupB = blocks.filter((b) => b.group === 'B');
  const alternatives = blocks.filter((b) => b.variantOf);

  const sum = (list) => list.reduce((s, b) => s + (b.marks || 0), 0);
  const declared = { A: hi.declared.A ?? en.declared.A ?? null, B: hi.declared.B ?? en.declared.B ?? null };
  const computed = { A: sum(groupA), B: sum(groupB) };

  const paperFlags = [...hi.notes, ...en.notes];
  if (declared.A !== null && declared.A !== computed.A) {
    paperFlags.push(`marks-mismatch-groupA-declared-${declared.A}-computed-${computed.A}`);
  }
  if (declared.B !== null && declared.B !== computed.B) {
    paperFlags.push(`marks-mismatch-groupB-declared-${declared.B}-computed-${computed.B}`);
  }
  if (lowConfidencePages.length) {
    paperFlags.push(`low-confidence-pages-${lowConfidencePages.join(',')}`);
  }

  const output = {
    schemaVersion: SCHEMA_VERSION,
    paper: {
      paperId,
      sourceFile: manifest.sourceFile,
      sourceMd5: manifest.sourceMd5,
      pdfPages: manifest.pdfPages ?? null,
      printedPages: manifest.printedPages ?? null,
      declaredMarks: declared,
    },
    totals: {
      blocks: blocks.length,
      groupA: groupA.length,
      groupB: groupB.length,
      alternatives: alternatives.length,
      marksGroupA: computed.A,
      marksGroupB: computed.B,
      blocksWithFlags: blocks.filter((b) => b.flags.length).length,
    },
    flags: paperFlags,
    blocks,
  };

  fs.mkdirSync(BLOCKS_DIR, { recursive: true });
  const outPath = path.join(BLOCKS_DIR, `${paperId}.json`);
  fs.writeFileSync(outPath, stableStringify(output), 'utf8');

  return { output, outPath };
}

function main() {
  const requested = process.argv.slice(2);
  const papers = requested.length
    ? requested
    : fs.existsSync(PAGES_DIR)
      ? fs.readdirSync(PAGES_DIR).filter((d) => fs.statSync(path.join(PAGES_DIR, d)).isDirectory()).sort()
      : [];

  if (!papers.length) {
    console.error(`No papers found in ${PAGES_DIR} — run Stage B first.`);
    process.exit(1);
  }

  let failed = 0;
  for (const paperId of papers) {
    console.log(`\n${paperId}`);
    console.log('-'.repeat(60));
    let result;
    try {
      result = processPaper(paperId);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      failed += 1;
      continue;
    }

    const { output, outPath } = result;
    const t = output.totals;
    console.log(`  blocks: ${t.blocks}  (Group A ${t.groupA} + Group B ${t.groupB} + OR alternatives ${t.alternatives})`);
    console.log(`  marks:  Group A ${t.marksGroupA}/${output.paper.declaredMarks.A ?? '?'}   Group B ${t.marksGroupB}/${output.paper.declaredMarks.B ?? '?'}`);

    const flagged = output.blocks.filter((b) => b.flags.length);
    if (flagged.length) {
      console.log(`  flagged blocks: ${flagged.length}`);
      for (const b of flagged) console.log(`    ${b.sourceId}  ${b.flags.join(', ')}`);
    } else {
      console.log('  flagged blocks: 0');
    }
    if (output.flags.length) {
      console.log('  paper flags:');
      for (const f of output.flags) console.log(`    ${f}`);
    }
    console.log(`  written: ${path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')}`);
  }

  console.log('');
  process.exit(failed ? 1 : 0);
}

main();
