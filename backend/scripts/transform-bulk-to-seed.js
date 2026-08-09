// One-time transform: reads data/quiz-bank/bank/questions.json (the 744-question bulk bank
// from quiz-phase0.5-bulk) and writes 16 per-chapter seed files in the §12 seed format.
// Not part of the ongoing pipeline — run once, its output (data/quiz-bank/science/**) is what
// `quiz:seed` reads from then on. See QUIZ_SYSTEM_BLUEPRINT.md §12/§17.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const BULK_PATH = path.join(ROOT, 'data/quiz-bank/bank/questions.json');
const CURRICULUM_INDEX_PATH = path.join(__dirname, '..', 'storage', 'curriculum-index.json');
const OUT_DIR = path.join(ROOT, 'data/quiz-bank/science');

const SECTION_ABBR = { physics: 'phy', chemistry: 'chem', biology: 'bio' };
const NON_BROWSABLE_CHAPTERS = new Set(['science.meta.chapter-00']);

function loadChapterTitles() {
  const idx = JSON.parse(fs.readFileSync(CURRICULUM_INDEX_PATH, 'utf-8'));
  const science = idx.subjects.find((s) => s.subjectId === 'science');
  const titles = new Map();
  for (const section of science.sections) {
    for (const chapter of section.chapters) {
      titles.set(chapter.chapterId, { sectionId: section.sectionId, title: chapter.title });
    }
  }
  return titles;
}

function toQuestionCode(sectionId, chapterId, questionId) {
  const abbr = SECTION_ABBR[sectionId];
  const chapterNum = chapterId.split('-').pop(); // "01"
  const idSuffix = questionId.replace('q-', 'q'); // "q-000033" -> "q000033"
  return `sci-${abbr}-ch${chapterNum}-${idSuffix}`;
}

function transformQuestion(q, sectionId, chapterId) {
  const options = q.canonical.options.map((opt) => ({
    label: opt.key.toUpperCase(),
    text: { en: opt.text.en, hi: opt.text.hi, hinglish: opt.text.hinglish },
  }));

  return {
    questionCode: toQuestionCode(sectionId, chapterId, q.questionId),
    topicId: null,
    questionText: {
      en: q.canonical.text.en,
      hi: q.canonical.text.hi,
      hinglish: q.canonical.text.hinglish,
    },
    options,
    correctOptionLabel: q.canonical.answer.correctOption.toUpperCase(),
    explanation: { en: null, hi: null, hinglish: null },
    difficulty: null,
    askedInYears: [...q.years].sort((a, b) => a - b),
  };
}

function main() {
  const bulk = JSON.parse(fs.readFileSync(BULK_PATH, 'utf-8'));
  const chapterTitles = loadChapterTitles();

  const usable = bulk.questions.filter((q) => q.usableInQuiz === true);
  const skippedMeta = usable.filter((q) => NON_BROWSABLE_CHAPTERS.has(q.chapter?.chapterId));
  const seedable = usable.filter((q) => !NON_BROWSABLE_CHAPTERS.has(q.chapter?.chapterId));

  const byChapter = new Map();
  for (const q of seedable) {
    const chapterId = q.chapter.chapterId;
    if (!byChapter.has(chapterId)) byChapter.set(chapterId, []);
    byChapter.get(chapterId).push(q);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const summary = [];
  for (const [chapterId, questions] of byChapter) {
    const meta = chapterTitles.get(chapterId);
    if (!meta) {
      throw new Error(`chapterId ${chapterId} not found in curriculum-index.json`);
    }
    const { sectionId, title } = meta;

    const seedFile = {
      subjectId: 'science',
      sectionId,
      chapterId,
      chapterTitle: title,
      questions: questions.map((q) => transformQuestion(q, sectionId, chapterId)),
    };

    const sectionDir = path.join(OUT_DIR, sectionId);
    fs.mkdirSync(sectionDir, { recursive: true });
    const outPath = path.join(sectionDir, `${chapterId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(seedFile, null, 2) + '\n', 'utf-8');

    summary.push({ chapterId, count: seedFile.questions.length, file: outPath });
  }

  summary.sort((a, b) => a.chapterId.localeCompare(b.chapterId));
  console.log('Seed files written:');
  for (const s of summary) {
    console.log(`  ${s.chapterId}: ${s.count} questions -> ${path.relative(ROOT, s.file)}`);
  }
  const total = summary.reduce((sum, s) => sum + s.count, 0);
  console.log(`\nTotal seedable questions: ${total}`);
  console.log(`Skipped (non-browsable, e.g. meta chapter): ${skippedMeta.length}`);
  console.log(`Chapters written: ${summary.length}`);
}

main();
