import React from 'react';

function ChapterPicker({
  chapters,
  isLoading,
  selectedChapter,
  selectedChapterId,
  onChange,
}) {
  if (isLoading) {
    return <div className="chapter-picker loading">Loading chapters...</div>;
  }

  return (
    <section className="chapter-picker" aria-label="Focus chapter selector">
      <div className="focus-banner">
        <span>Focus locked</span>
        <strong>
          {selectedChapter
            ? `${selectedChapter.sectionTitle} / ${selectedChapter.title}`
            : 'Choose a chapter'}
        </strong>
      </div>

      <label htmlFor="chapter-select">Chapter</label>
      <select
        id="chapter-select"
        value={selectedChapterId}
        onChange={(event) => onChange(event.target.value)}
      >
        {chapters.map((subject) =>
          subject.sections.map((section) => (
            <optgroup key={section.id} label={section.title}>
              {section.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.number}. {chapter.title}
                </option>
              ))}
            </optgroup>
          ))
        )}
      </select>
    </section>
  );
}

export default ChapterPicker;
