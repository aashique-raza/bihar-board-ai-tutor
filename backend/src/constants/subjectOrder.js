// Single source of truth for subject/section display order — shared by
// studyMap.service.js (runtime) and curriculumIndexBuilder.js (build-time),
// which previously each maintained their own independent, driftable copy.
export const SUBJECT_ORDER = ['Hindi', 'English', 'Math', 'Science', 'Social Science', 'Sanskrit'];

export const SECTION_ORDER = [
  'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'Civics', 'Economics',
  'Grammar', 'Prose', 'Poetry', 'Non-Fiction', 'Algebra', 'Geometry', 'Trigonometry', 'Statistics',
];
