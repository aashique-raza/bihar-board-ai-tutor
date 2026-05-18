import { getStudyMap } from '../src/services/studyMap.service.js';

const studyMap = await getStudyMap({ refresh: true });
const subjects = studyMap.focusStudy.subjects;
const chapterCount = subjects.reduce(
  (total, subject) =>
    total + subject.sections.reduce((sectionTotal, section) => sectionTotal + section.chapters.length, 0),
  0
);

console.log('Study map test');
console.log('==============');
console.log(`Default study mode: ${studyMap.defaultStudyMode}`);
console.log(`Supported study modes: ${studyMap.supportedStudyModes.join(', ')}`);
console.log(`Subjects: ${subjects.length}`);
console.log(`Chapters: ${chapterCount}`);

for (const subject of subjects) {
  console.log('');
  console.log(subject.title);

  for (const section of subject.sections) {
    console.log(`- ${section.title}: ${section.chapters.length} chapters`);
  }
}
