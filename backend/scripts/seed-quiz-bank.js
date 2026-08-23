/**
 * seed-quiz-bank.js
 *
 * Reads every data/quiz-bank/**\/*.json seed file, validates all questions,
 * then upserts them into the `question_bank` collection by `questionCode`.
 * See QUIZ_SYSTEM_BLUEPRINT.md §12 for the format and behavior spec.
 *
 * Usage:
 *   node scripts/seed-quiz-bank.js              — validate + write to DB
 *   node scripts/seed-quiz-bank.js --dry-run     — validate only, no DB writes
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { Question } from '../src/models/question.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const SEED_DIR = path.resolve(backendRoot, '..', 'data', 'quiz-bank', 'science');
const CURRICULUM_INDEX_PATH = path.join(backendRoot, 'storage', 'curriculum-index.json');

const NON_BROWSABLE_CHAPTERS = new Set(['science.meta.chapter-00']);
const VALID_LABELS = ['A', 'B', 'C', 'D'];

const isDryRun = process.argv.includes('--dry-run');

function walkJsonFiles(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walkJsonFiles(full));
    else if (entry.name.endsWith('.json')) files.push(full);
  }
  return files;
}

function loadValidChapters() {
  const idx = JSON.parse(fs.readFileSync(CURRICULUM_INDEX_PATH, 'utf-8'));
  const science = idx.subjects.find((s) => s.subjectId === 'science');
  const chapters = new Map(); // chapterId -> Set(topicId)
  for (const section of science.sections) {
    for (const chapter of section.chapters) {
      const topicIds = new Set(chapter.topics.map((t) => t.topicId));
      chapters.set(chapter.chapterId, topicIds);
    }
  }
  return chapters;
}

function hasAnyLocalizedText(localized) {
  return Boolean(localized && (localized.en || localized.hi || localized.hinglish));
}

function validateQuestion(q, file, chapterId, validChapters, seenCodes, errors) {
  const prefix = `${path.relative(backendRoot, file)} / ${q.questionCode || '(no questionCode)'}`;

  if (!q.questionCode) {
    errors.push(`${prefix}: missing questionCode`);
    return;
  }
  if (seenCodes.has(q.questionCode)) {
    errors.push(`${prefix}: duplicate questionCode across seed files`);
  }
  seenCodes.add(q.questionCode);

  if (!hasAnyLocalizedText(q.questionText)) {
    errors.push(`${prefix}: questionText has no en/hi/hinglish value`);
  }

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    errors.push(`${prefix}: must have exactly 4 options`);
  } else {
    const labels = q.options.map((o) => o.label);
    const uniqueLabels = new Set(labels);
    if (uniqueLabels.size !== 4 || VALID_LABELS.some((l) => !uniqueLabels.has(l))) {
      errors.push(`${prefix}: option labels must be exactly A, B, C, D`);
    }
    for (const opt of q.options) {
      if (!hasAnyLocalizedText(opt.text)) {
        errors.push(`${prefix}: option ${opt.label} has no en/hi/hinglish value`);
      }
    }
    if (q.correctOptionLabel && !uniqueLabels.has(q.correctOptionLabel)) {
      errors.push(`${prefix}: correctOptionLabel "${q.correctOptionLabel}" is not one of the option labels`);
    }
  }

  if (!q.correctOptionLabel) {
    errors.push(`${prefix}: missing correctOptionLabel`);
  }

  if (NON_BROWSABLE_CHAPTERS.has(chapterId)) {
    errors.push(`${prefix}: chapterId "${chapterId}" is a non-browsable section, must not be seeded`);
  } else if (!validChapters.has(chapterId)) {
    errors.push(`${prefix}: chapterId "${chapterId}" not found in curriculum-index.json`);
  } else if (q.topicId) {
    const topicIds = validChapters.get(chapterId);
    if (!topicIds.has(q.topicId)) {
      errors.push(`${prefix}: topicId "${q.topicId}" not found in chapter "${chapterId}"`);
    }
  }
}

function loadAndValidate() {
  const files = walkJsonFiles(SEED_DIR);
  const validChapters = loadValidChapters();
  const seenCodes = new Set();
  const errors = [];
  const allQuestions = []; // { question, chapterId }

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const { chapterId, questions } = data;
    for (const q of questions) {
      validateQuestion(q, file, chapterId, validChapters, seenCodes, errors);
      allQuestions.push({ question: q, chapterId, subjectId: data.subjectId, sectionId: data.sectionId });
    }
  }

  return { files, allQuestions, errors };
}

function optionsChanged(existingOptions, newOptions) {
  return JSON.stringify(existingOptions) !== JSON.stringify(newOptions);
}

async function upsertQuestions(allQuestions) {
  let inserted = 0;
  let updated = 0;

  const seedCodes = new Set();

  for (const { question: q, chapterId, subjectId, sectionId } of allQuestions) {
    seedCodes.add(q.questionCode);

    // eslint-disable-next-line no-await-in-loop
    const existing = await Question.findOne({ questionCode: q.questionCode });

    const nextDoc = {
      questionCode: q.questionCode,
      subjectId,
      sectionId,
      chapterId,
      topicId: q.topicId ?? null,
      questionText: q.questionText,
      options: q.options,
      correctOptionLabel: q.correctOptionLabel,
      explanation: q.explanation ?? {},
      difficulty: q.difficulty ?? null,
      askedInYears: q.askedInYears ?? [],
      isActive: true,
    };

    if (!existing) {
      // eslint-disable-next-line no-await-in-loop
      await Question.create({ ...nextDoc, version: 1 });
      inserted += 1;
      continue;
    }

    const contentChanged =
      JSON.stringify(existing.questionText) !== JSON.stringify(nextDoc.questionText) ||
      optionsChanged(existing.options.toObject(), nextDoc.options) ||
      existing.correctOptionLabel !== nextDoc.correctOptionLabel;

    // eslint-disable-next-line no-await-in-loop
    await Question.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...nextDoc,
          version: contentChanged ? existing.version + 1 : existing.version,
        },
      }
    );
    updated += 1;
  }

  const deactivateResult = await Question.updateMany(
    { questionCode: { $nin: [...seedCodes] }, isActive: true },
    { $set: { isActive: false } }
  );

  return { inserted, updated, deactivated: deactivateResult.modifiedCount };
}

async function run() {
  const { files, allQuestions, errors } = loadAndValidate();

  console.log(`Seed files found: ${files.length}`);
  console.log(`Questions parsed: ${allQuestions.length}`);

  if (errors.length > 0) {
    console.error(`\nValidation FAILED — ${errors.length} error(s):`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exitCode = 1;
    return;
  }

  console.log('Validation passed — 0 errors.');

  if (isDryRun) {
    console.log('\n--dry-run: no DB writes performed.');
    return;
  }

  await connectDB();
  const { inserted, updated, deactivated } = await upsertQuestions(allQuestions);
  await disconnectDB();

  console.log(`\n${inserted} inserted, ${updated} updated, ${deactivated} deactivated.`);
}

run().catch(async (err) => {
  console.error('[seed-quiz-bank] Failed:', err);
  try { await disconnectDB(); } catch {}
  process.exitCode = 1;
});
