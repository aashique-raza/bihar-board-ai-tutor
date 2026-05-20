export const findFirstChapter = (studyMap) => {
  const subjects = studyMap?.focusStudy?.subjects || [];

  for (const subject of subjects) {
    for (const section of subject.sections || []) {
      if (section.chapters?.length) {
        return section.chapters[0];
      }
    }
  }

  return null;
};
