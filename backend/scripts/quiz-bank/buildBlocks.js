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
 * A second pass (after the pilot ran against all 18 Stage B papers) found the script had been
 * overfit to the pilot paper's specific wording in three places — fixed here, each verified
 * against the real Stage B text of multiple papers, not guessed:
 *   3. Group-A/B headers use three different real words across the 18 papers (ग्रुप/भाग/खण्ड,
 *      GROUP/SECTION) — not just the pilot's "ग्रुप"/"GROUP". Devanagari also breaks JS's `\b`
 *      (ASCII-only), so `अ\b` never matched; fixed with a `(?!\w)` lookahead instead.
 *   4. "Group A" / "Group B" do not consistently mean "subjective" / "objective" the way the
 *      pilot did. The pilot (a 2016-era paper) has Group A = 30 subjective marks, Group B = 20
 *      MCQs written as one stem question with roman-numeral sub-parts. Modern papers (2018
 *      onwards) invert this: Section A = 80 objective MCQs (ascending, numbered 1..80),
 *      Section B = 24-30 subjective short/long-answer questions (also ascending, numbered
 *      continuing past Group A's numbering, with Physics/Chemistry/Biology sub-headers in
 *      between that must be skipped, not appended to the previous question). Which shape a
 *      paper's Group B uses is now detected structurally (an ascending pair of top-level
 *      numbers can only occur in the ascending shape — the stem shape has exactly one), not
 *      guessed from a label, since the pilot's own label ("बहुवैकल्पिक"/"Multiple Choice
 *      Questions") doesn't even contain the word "objective".
 *   5. MCQ options are lettered differently across papers: lowercase "(a)(b)(c)(d)" in the
 *      pilot, uppercase "(A)(B)(C)(D)" or bare "A. B. C. D." (no brackets) in most modern
 *      papers. Option parsing now tries multiple label styles instead of one hardcoded one.
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
 *
 * groupA/groupB: `(?!\w)` is used instead of `\b` because JS's `\b` is ASCII-only and never
 * fires after a Devanagari character (e.g. "अ\b" never matches). `(?!\w)` works for both
 * scripts since it only checks that the NEXT character isn't an ASCII word character.
 */
const MARKERS = {
  hi: {
    // Confirmed real-world forms across the 18 papers: ग्रुप - A (2016-a), GROUP-A embedded in
    // the hi field (2016-b/c guide-book style, en field empty), भाग-अ (2017-a/c/d), खण्ड-अ /
    // खण्ड – अ (2018-a onwards — the large majority of papers).
    groupA: /^\s*(?:ग्रुप|भाग|खण्ड|GROUP)\s*[-–—]?\s*(?:A|अ)(?!\w)/i,
    groupB: /^\s*(?:ग्रुप|भाग|खण्ड|GROUP)\s*[-–—]?\s*(?:B|ब)(?!\w)/i,
    alternative: /^\s*अथवा\s*$/,
    declaredMarks: /\(\s*अंक\s*:\s*(\d+)\s*\)/,
    diagram: /सचित्र|चित्र|आरेख/,
    // Lines that announce a subject/answer-type change inside an ascending Group B — never
    // part of a question's own text, always a boundary between two questions.
    sectionBreak: /^\s*(भौतिक\s*शास्त्र|रसायन\s*शास्त्र|जीव\s*विज्ञान|लघु\s*उत्तरीय\s*प्रश्न|दीर्घ\s*उत्तरीय\s*प्रश्न|प्रश्न\s*संख्या)/,
    // The guide-book style papers (2016-b/c, 2017-c/d) print a Group-A-numbered answer key
    // ("उत्तरमाला") after Group B's questions. Its own "1. 2. 3. …" ascending numbering must
    // never be mistaken for more Group B questions.
    answerKey: /^\s*उत्तरमाला/,
  },
  en: {
    // Confirmed real-world forms: GROUP - A (2016-a, 2017-a), SECTION - I / SECTION - II
    // (2018-a — uses Roman numerals for the two sections instead of A/B), SECTION-A / Section A
    // (2019-b onwards, dash and spacing vary).
    groupA: /^\s*(?:GROUP|SECTION)\s*[-–—]?\s*[AI](?!\w)/i,
    groupB: /^\s*(?:GROUP|SECTION)\s*[-–—]?\s*(?:B|II)(?!\w)/i,
    alternative: /^\s*OR\s*$/,
    declaredMarks: /\(\s*Marks\s*:\s*(\d+)\s*\)/i,
    diagram: /\bdiagram\b|\bfigure\b|\blabelled\b/i,
    sectionBreak: /^\s*(Physics|Chemistry|Biology|Short Answer Type Questions|Long Answer Type Questions|Question No)/i,
    answerKey: /^\s*ANSWER\s*KEY/i,
  },
};

/** A numbered question: "12. …". */
const NUMBERED = /^\s*(\d{1,2})\s*[.\-]\s*(.*)$/;
/** A sub-part: "(xiv) …". Option keys are a–d, so there is no clash with i/v/x. */
const SUBPART = new RegExp(`^\\s*\\((${ROMAN_ALT})\\)\\s*(.*)$`);
/**
 * Marks printed in the right margin, e.g. "…कैसे होता है ?   1" — bare in most papers, but
 * bracketed "…लिखें। [2]" in a couple of them (2021, 2022).
 */
const TRAILING_MARKS = /\s{1,}\[?(\d{1,2})\]?\s*$/;

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
      for (const rawText of raw.split('\n')) {
        // "[Page N]" is a page-boundary breadcrumb some Stage B reading sessions (2021, 2022)
        // inserted inline into the extracted text itself — not exam content, and redundant
        // with the pdfPage already tracked per line below. Strip it so it can't land in the
        // middle of a trailing-marks match (e.g. "...लिखें। [2] [Page 31]") and hide the mark.
        const text = rawText.replace(/\[\s*Page\s*\d+\s*\]/gi, '').trim();
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
 * Split an options line into a/b/c/d. Tries label styles in order — parenthesized letter
 * first (either case: "(a)" or "(A)"), then a bare lettered dot ("A." / "a.") for papers that
 * print options without brackets. A paper is internally consistent, so whichever style finds
 * all 4 keys in ascending order wins; the other style is never tried once one succeeds.
 *
 * Scanned ascending on purpose: option (c) is often literally "(a) और (b) दोनों", and a
 * naive split on the label pattern would tear that option in half. Searching for the next
 * label only after the previous one has been passed keeps nested markers inside their own
 * option.
 */
function parseOptions(text) {
  const keys = ['a', 'b', 'c', 'd'];
  // Some papers (2022 confirmed) letter Hindi options with the Devanagari transliteration of
  // a/b/c/d instead of the Latin letters — अ./ब./स./द.
  const devanagariKey = { a: 'अ', b: 'ब', c: 'स', d: 'द' };
  const styles = [
    (k) => new RegExp(`\\(${k}\\)`, 'i'),
    (k) => new RegExp(`(?:^|\\s)${k}\\.\\s`, 'i'),
    (k) => new RegExp(`(?:^|\\s)${devanagariKey[k]}\\.\\s`),
  ];

  for (const styleFn of styles) {
    const positions = [];
    let from = 0;
    let ok = true;
    for (const key of keys) {
      const re = styleFn(key);
      const rest = text.slice(from);
      const m = rest.match(re);
      if (!m) { ok = false; break; }
      const idx = from + m.index + (m[0].length - m[0].trimStart().length); // skip leading \s captured by the dot style
      positions.push({ key, idx, matchLen: m[0].trim().length });
      from = idx + m[0].length;
    }
    if (!ok) continue;
    return positions.map((pos, i) => {
      const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
      const body = text
        .slice(pos.idx + pos.matchLen, end)
        .replace(/[।.,;]\s*$/, '')
        .trim();
      return { key: pos.key, text: body };
    });
  }
  return null;
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
 * Segment an ascending run of numbered questions — "1. … 2. … 3. …" — into one block per
 * number, with an optional OR-alternative half. Used for Group A (always this shape, in every
 * paper seen) and for Group B when Group B turns out to be the same shape (§ note 4 above).
 *
 * `sectionBreak` lines (subject headers, "Short/Long Answer Type Questions", "Question Nos. …"
 * instruction lines) are never part of a question — hitting one flushes whatever question was
 * open and is otherwise skipped, so it never gets glued onto the previous question's text.
 *
 * A strictly-next-number match (n === lastNumber + 1) is preferred, but a small forward gap
 * (up to +3) is also accepted — confirmed necessary by 2018-a, where a question number was
 * physically clipped off the scan (Stage B's own page text says so inline: "[question number
 * clipped at top edge — this is Q4 …]"). Without this tolerance the missing "4." permanently
 * desyncs the counter, and every question from Q4 onward — dozens of them — silently gets
 * absorbed into Q3's last option instead of becoming blocks of their own. Anything wider than
 * +3 is still rejected, so a stray digit inside an answer can't restart the count. Every
 * accepted gap is recorded in `notes` so it stays visible for review rather than silent.
 */
function segmentAscending(lines, startIdx, endIdx, groupLetter, M, notes) {
  const segments = new Map();
  let current = null;
  let alternative = null;
  let lastNumber = 0;

  const flush = () => {
    if (!current) return;
    segments.set(`${groupLetter}:${current.number}`, {
      group: groupLetter,
      questionNumber: current.number,
      subPart: null,
      marks: current.marks,
      ...joinBuffer(current.buffer),
    });
    if (alternative) {
      segments.set(`${groupLetter}:${current.number}-or`, {
        group: groupLetter,
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

  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i];

    if (M.sectionBreak.test(line.text)) {
      flush();
      continue;
    }

    const numbered = line.text.match(NUMBERED);

    if (numbered) {
      const n = Number(numbered[1]);
      if (n > lastNumber && n <= lastNumber + 3) {
        if (n !== lastNumber + 1) {
          notes?.push(`${groupLetter}: number jumped from ${lastNumber} to ${n} — a gap in the source, not a parsing skip.`);
        }
        flush();
        const { text, marks } = splitMarks(numbered[2]);
        lastNumber = n;
        current = { number: lastNumber, marks, buffer: [{ text, pdfPage: line.pdfPage }] };
        continue;
      }
    }

    if (!current) continue; // still in an instruction block

    if (M.alternative.test(line.text)) {
      alternative = [];
      continue;
    }

    const { text, marks } = splitMarks(line.text);
    if (marks !== null && current.marks === null) current.marks = marks;
    (alternative || current.buffer).push({ text, pdfPage: line.pdfPage });
  }
  flush();

  return segments;
}

/**
 * Segment Group B when it is one stem question ("31. Choose the correct alternative…")
 * followed by roman-numeral MCQ sub-parts — the pilot's shape. The stem line itself is an
 * instruction, not a question, so it never becomes a block of its own.
 */
function segmentGroupBStem(lines, groupBIdx, endIdx) {
  const segments = new Map();
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

  for (let i = groupBIdx + 1; i < endIdx; i++) {
    const line = lines[i];

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

  return segments;
}

/**
 * Which shape does this paper's Group B use — one stem + roman sub-parts, or an ascending run
 * of numbered questions? Detected structurally rather than guessed from a label, because the
 * pilot's own Group B label ("बहुवैकल्पिक प्रश्न" / "Multiple Choice Questions") never contains
 * the word "objective" — a keyword-based guess would have missed it.
 *
 * The stem shape can, by definition, only ever have ONE top-level number in the whole of
 * Group B (everything else is a roman-numeral sub-part of it). So finding two ADJACENT
 * top-level numbers (n, n+1) anywhere in Group B is proof of the ascending shape — checked
 * first, and it wins even if a sub-part-looking "(i)" also appears somewhere (a genuine
 * ascending short-answer question can itself contain a roman-numeral sub-list, e.g.
 * "Explain: (i) reason A (ii) reason B" — that must not be mistaken for the stem shape).
 * Only if no such adjacent pair exists anywhere does a "(i)" sighting mean the stem shape.
 */
function detectGroupBFlavor(lines, groupBIdx, endIdx) {
  if (groupBIdx === -1) return 'none';
  let lastNumber = null;
  let sawSubpart = false;

  for (let i = groupBIdx + 1; i < endIdx; i++) {
    const text = lines[i].text;
    const numbered = text.match(NUMBERED);
    if (numbered) {
      const n = Number(numbered[1]);
      if (lastNumber !== null && n === lastNumber + 1) return 'ascending';
      lastNumber = n;
      continue;
    }
    if (lastNumber !== null && SUBPART.test(text)) sawSubpart = true;
  }

  if (sawSubpart) return 'stem';
  return lastNumber === null ? 'none' : 'ascending';
}

/**
 * Segment one language's lines. Group A is always the ascending shape (true in every paper
 * seen, whether its content is subjective — the pilot — or objective — modern papers). Group B
 * shape is detected per §detectGroupBFlavor.
 *
 * The Group A header is the starting gun: everything before it (cover page, candidate
 * instructions — themselves numbered 1.–7.) is skipped, so instruction lines can never be
 * mistaken for questions.
 */
function segment(lines, lang) {
  const M = MARKERS[lang];
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

  const segmentsA = segmentAscending(lines, startIdx + 1, endOfA, 'A', M, notes);

  // A guide-book style paper's own printed answer key ("उत्तरमाला" / "ANSWER KEY") comes after
  // Group B and restarts its own "1. 2. 3. …" numbering — that must not be read as more
  // questions, so Group B's scan stops at the key if one is found.
  const answerKeyIdx = groupBIdx === -1
    ? -1
    : lines.findIndex((l, i) => i > groupBIdx && M.answerKey.test(l.text));
  const endOfB = answerKeyIdx === -1 ? lines.length : answerKeyIdx;

  const groupBFlavor = detectGroupBFlavor(lines, groupBIdx, endOfB);
  let segmentsB = new Map();
  if (groupBFlavor === 'stem') {
    segmentsB = segmentGroupBStem(lines, groupBIdx, endOfB);
  } else if (groupBFlavor === 'ascending') {
    segmentsB = segmentAscending(lines, groupBIdx + 1, endOfB, 'B', M, notes);
  }

  const segments = new Map([...segmentsA, ...segmentsB]);

  return { segments, declared, notes, groupBFlavor };
}

/**
 * Split a Group A/B segment into its stem and its four options, for whichever segments turn
 * out to be MCQs (§classifyIsMcq). Tries the parenthesized-letter start first, then the bare
 * lettered-dot start, so it works for both "(a)…(d)" and "A. …D." papers.
 */
function splitStemAndOptions(text) {
  let idx = text.search(/\([aA]\)/);
  if (idx === -1) idx = text.search(/(?:^|\s)[aA]\.\s/);
  if (idx === -1) idx = text.search(/(?:^|\s)अ\.\s/);
  if (idx === -1) return { stem: text, options: null };
  if (text[idx] === ' ') idx += 1; // the bare-dot pattern can capture a leading space
  const options = parseOptions(text.slice(idx));
  if (!options) return { stem: text, options: null };
  return { stem: text.slice(0, idx).trim().replace(/[:—-]\s*$/, '').trim(), options };
}

/** Does this text look like it has 4 lettered options, in either label style? */
function looksLikeMcq(text) {
  if (!text) return false;
  if (/\([aA]\)[\s\S]*\([bB]\)[\s\S]*\([cC]\)[\s\S]*\([dD]\)/.test(text)) return true;
  if (/(?:^|\s)[aA]\.\s[\s\S]*(?:^|\s)[bB]\.\s[\s\S]*(?:^|\s)[cC]\.\s[\s\S]*(?:^|\s)[dD]\.\s/.test(text)) return true;
  if (/(?:^|\s)अ\.\s[\s\S]*(?:^|\s)ब\.\s[\s\S]*(?:^|\s)स\.\s[\s\S]*(?:^|\s)द\.\s/.test(text)) return true;
  return false;
}

/**
 * Is this group's content MCQ (objective) or free-text (subjective)? A stem-shaped Group B is
 * always MCQ by definition. Everything else (Group A in every paper; an ascending Group B) is
 * judged by whether a majority of its own segments actually look like 4-option MCQs — content,
 * not a label, since labels vary too much across papers to guess reliably (§ note 5 above).
 */
function classifyIsMcq(hiSegments, enSegments, groupLetter) {
  const texts = [];
  for (const seg of hiSegments.values()) if (seg.group === groupLetter) texts.push(seg.text);
  for (const seg of enSegments.values()) if (seg.group === groupLetter) texts.push(seg.text);
  if (!texts.length) return false;
  const mcqLike = texts.filter(looksLikeMcq).length;
  return mcqLike / texts.length >= 0.5;
}

// ---------------------------------------------------------------------------
// pairing hi + en
// ---------------------------------------------------------------------------

function buildBlocks(paperId, hi, en, isMcqByGroup) {
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

    const isMcq = isMcqByGroup[meta.group] === true;
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

  const groupBFlavor = hi.groupBFlavor === 'stem' || en.groupBFlavor === 'stem'
    ? 'stem'
    : (hi.groupBFlavor === 'ascending' || en.groupBFlavor === 'ascending' ? 'ascending' : 'none');

  const isMcqByGroup = {
    A: classifyIsMcq(hi.segments, en.segments, 'A'),
    B: groupBFlavor === 'stem' ? true : classifyIsMcq(hi.segments, en.segments, 'B'),
  };

  const blocks = buildBlocks(paperId, hi, en, isMcqByGroup);

  // Mark parents of an OR alternative.
  const alternativeParents = new Set(blocks.filter((b) => b.variantOf).map((b) => b.variantOf));
  for (const block of blocks) {
    if (alternativeParents.has(block.sourceId)) block.hasAlternative = true;
  }

  const groupA = blocks.filter((b) => b.group === 'A' && !b.variantOf);
  const groupB = blocks.filter((b) => b.group === 'B' && !b.variantOf);
  const alternatives = blocks.filter((b) => b.variantOf);

  const sum = (list) => list.reduce((s, b) => s + (b.marks || 0), 0);
  const declared = { A: hi.declared.A ?? en.declared.A ?? null, B: hi.declared.B ?? en.declared.B ?? null };
  const computed = { A: sum(groupA), B: sum(groupB) };

  const paperFlags = [...hi.notes, ...en.notes];
  paperFlags.push(`groupA-classified-${isMcqByGroup.A ? 'objective' : 'subjective'}`);
  paperFlags.push(`groupB-shape-${groupBFlavor}${groupBFlavor === 'none' ? '' : `-classified-${isMcqByGroup.B ? 'objective' : 'subjective'}`}`);
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
