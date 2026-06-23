/**
 * examKnowledgeService.js
 *
 * Provides Bihar Board exam pattern data to the Ask pipeline.
 * Called by step5.retrieveContent.js when intent === 'EXAM_INFO'.
 *
 * Data source: data/class-10/global/exam_patterns.json
 * This JSON file is NOT indexed by the RAG pipeline (indexPipeline.js only reads .md files).
 *
 * Why NOT in the vector store:
 *   Exam pattern data has exact numbers (marks). RAG retrieval is probabilistic —
 *   it could return wrong values. This service provides 100% deterministic lookup.
 *   Also: "Light chapter marks" query would retrieve OPTICS textbook chunks not marks data
 *   (Entity Conflict Bug) — keeping exam data outside vector store prevents this.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Absolute path to exam pattern JSON.
// backend/src/knowledge/ → ../../.. → project root → data/class-10/global/
const DATA_PATH = resolve(__dirname, '../../../data/class-10/global/exam_patterns.json');

let _cachedData = null;

const loadData = () => {
  if (_cachedData) return _cachedData;
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8');
    _cachedData = JSON.parse(raw);
    console.log('[ExamKnowledgeService] exam_patterns.json loaded and cached.');
    return _cachedData;
  } catch (error) {
    console.error('[ExamKnowledgeService] Failed to load exam_patterns.json:', error.message);
    console.error('[ExamKnowledgeService] Expected path:', DATA_PATH);
    throw new Error(
      'Exam knowledge base unavailable. Ensure data/class-10/global/exam_patterns.json exists.'
    );
  }
};

// Formats a single chapter into readable lines for the LLM
const formatChapter = (ch) => {
  const priorityLabel =
    ch.priority === 'HIGH' ? '★ HIGH PRIORITY' :
    ch.priority === 'MEDIUM' ? '◆ MEDIUM PRIORITY' : '● LOW PRIORITY';

  const lines = [
    `  Chapter ${ch.chapter_no}: ${ch.title}`,
    `  Approx marks: ~${ch.approx_marks} marks | ${priorityLabel}`,
  ];

  if (ch.topics && ch.topics.length > 0) {
    lines.push(`  Key topics: ${ch.topics.slice(0, 4).join(', ')}${ch.topics.length > 4 ? '...' : ''}`);
  }

  if (ch.exam_tip) {
    lines.push(`  Exam tip: ${ch.exam_tip}`);
  }

  return lines.join('\n');
};

/**
 * Returns the full Bihar Board Class 10 exam pattern as a formatted string.
 * This string is injected into the tutor LLM as {retrievedContext}.
 * The LLM reads it and answers the student's specific exam question.
 *
 * @returns {string} Formatted exam pattern context (~600-700 tokens)
 */
export const getExamContext = () => {
  const data = loadData();
  const sci = data.subjects.science;
  const pt = data.paper_types;
  const gen = data.general_rules;
  const div = data.division_system;

  const lines = [
    `[Bihar Board Class 10 — Exam Pattern ${data._meta.exam_year}]`,
    `Source: ${data._meta.source}`,
    `Accuracy note: ${data._meta.accuracy_note}`,
    '',
    '════════════════════════════════════════',
    'GENERAL EXAM RULES (All Subjects)',
    '════════════════════════════════════════',
    `Total subjects: ${gen.total_subjects} | Total marks: ${gen.total_marks}`,
    `Passing per subject: ${gen.passing_per_subject} marks | Passing aggregate: ${gen.passing_aggregate}/${gen.total_marks}`,
    `Note: ${gen.note_english}`,
    `Division system: 1st Division (${div.first_division.minimum}+) | 2nd Division (${div.second_division.minimum}-${div.second_division.maximum}) | 3rd Division (${div.third_division.minimum}-${div.third_division.maximum}) | Fail (below ${div.fail.below})`,
    '',
    '════════════════════════════════════════',
    'SCIENCE (Vigyan) — 100 Marks',
    '════════════════════════════════════════',
    `Total marks: ${sci.total_marks} | Theory paper: ${sci.theory_marks} marks | Internal assessment: ${sci.internal_marks} marks`,
    `Passing: ${sci.overall_passing}/${sci.total_marks} overall | Theory minimum: ${sci.theory_passing}/${sci.theory_marks}`,
    '',
    'Science Paper Structure:',
    `  Section A (MCQ/OMR): ${pt.type2_theory_plus_practical.section_a.total_questions_given} questions given, attempt any ${pt.type2_theory_plus_practical.section_a.questions_to_attempt}, ${pt.type2_theory_plus_practical.section_a.marks_per_question} mark each = ${pt.type2_theory_plus_practical.section_a.total_marks} marks`,
    `    IMPORTANT: ${pt.type2_theory_plus_practical.section_a.important_rule}`,
    `  Section B (Short Answer): ${pt.type2_theory_plus_practical.section_b.total_questions_given} questions given, attempt any ${pt.type2_theory_plus_practical.section_b.questions_to_attempt}, ${pt.type2_theory_plus_practical.section_b.marks_per_question} marks each = ${pt.type2_theory_plus_practical.section_b.total_marks} marks`,
    `  Section C (Long Answer): ${pt.type2_theory_plus_practical.section_c.total_questions_given} questions given, attempt any ${pt.type2_theory_plus_practical.section_c.questions_to_attempt}, ${pt.type2_theory_plus_practical.section_c.marks_per_question} marks each = ${pt.type2_theory_plus_practical.section_c.total_marks} marks`,
    `  Section D (Internal Assessment): ${sci.internal_marks} marks (done in school, not in board exam hall)`,
    `    Internal breakdown: Experiments/Practicals (${sci.internal_assessment_breakdown.experiments_practicals.marks} marks) + Project File (${sci.internal_assessment_breakdown.project_file_record.marks} marks) + Viva Voce (${sci.internal_assessment_breakdown.viva_voce.marks} marks)`,
    '',
    'Science Subject-wise Theory Marks (out of 80):',
    `  Physics:   ${sci.subjects_breakdown.physics.theory_marks} marks (${sci.subjects_breakdown.physics.percentage_of_theory} of theory)`,
    `  Chemistry: ${sci.subjects_breakdown.chemistry.theory_marks} marks (${sci.subjects_breakdown.chemistry.percentage_of_theory} of theory)`,
    `  Biology:   ${sci.subjects_breakdown.biology.theory_marks} marks (${sci.subjects_breakdown.biology.percentage_of_theory} of theory)`,
    '',
    `── PHYSICS CHAPTERS (${sci.subjects_breakdown.physics.theory_marks} marks total) ──`,
    ...sci.subjects_breakdown.physics.chapters.map(formatChapter),
    '',
    `── CHEMISTRY CHAPTERS (${sci.subjects_breakdown.chemistry.theory_marks} marks total) ──`,
    ...sci.subjects_breakdown.chemistry.chapters.map(formatChapter),
    '',
    `── BIOLOGY CHAPTERS (${sci.subjects_breakdown.biology.theory_marks} marks total) ──`,
    ...sci.subjects_breakdown.biology.chapters.map(formatChapter),
    '',
    '════════════════════════════════════════',
    'OTHER SUBJECTS (Exam pattern only — Zuno does not teach these)',
    '════════════════════════════════════════',
    `Mathematics: ${data.subjects.mathematics.total_marks} marks pure theory | Passing: ${data.subjects.mathematics.passing_marks} marks`,
    `  Algebra+Trigonometry+Geometry = 60 marks combined (highest priority units)`,
    `Social Science: ${data.subjects.social_science.total_marks} marks (${data.subjects.social_science.theory_marks} theory + ${data.subjects.social_science.internal_marks} internal) | Passing: ${data.subjects.social_science.overall_passing} marks`,
    `Hindi: ${data.subjects.hindi.total_marks} marks pure theory | Passing: ${data.subjects.hindi.passing_marks} marks`,
    `English: ${data.subjects.english.total_marks} marks pure theory | Passing: ${data.subjects.english.passing_marks} marks (excluded from division calc)`,
    `Sanskrit/Urdu: ${data.subjects.sanskrit_urdu.total_marks} marks pure theory | Passing: ${data.subjects.sanskrit_urdu.passing_marks} marks`,
  ];

  return lines.join('\n');
};
