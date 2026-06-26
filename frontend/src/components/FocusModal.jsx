import React, { useMemo, useState } from 'react';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AutoStoriesRounded from '@mui/icons-material/AutoStoriesRounded';
import BiotechRounded from '@mui/icons-material/BiotechRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import FunctionsRounded from '@mui/icons-material/FunctionsRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

const baseSubjects = [
  { id: 'hindi',          title: 'Hindi',          icon: TranslateRounded },
  { id: 'english',        title: 'English',         icon: AutoStoriesRounded },
  { id: 'math',           title: 'Math',            icon: FunctionsRounded },
  { id: 'science',        title: 'Science',         icon: ScienceRounded },
  { id: 'social-science', title: 'Social Science',  icon: PublicRounded },
  { id: 'sanskrit',       title: 'Sanskrit',        icon: MenuBookRounded },
];

const sectionIcons = {
  physics:   BoltRounded,
  chemistry: ScienceRounded,
  biology:   BiotechRounded,
};

function FocusModal({ isOpen, isLoading, selectedChapterId, studyMap, onClose, onSelectChapter }) {
  const [step, setStep]                   = useState(1);
  const [animClass, setAnimClass]         = useState('focus-slide-forward');
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('');

  const subjectsInMap = useMemo(() => {
    const subjects = studyMap?.focusStudy?.subjects || [];
    return new Set(subjects.map((s) => s.id || s.title?.toLowerCase()));
  }, [studyMap]);

  const enrichedSubjects = useMemo(() =>
    baseSubjects.map((s) => ({ ...s, available: subjectsInMap.has(s.id) })),
  [subjectsInMap]);

  const subjectChapterCounts = useMemo(() => {
    const counts = {};
    for (const subject of studyMap?.focusStudy?.subjects || []) {
      const total = (subject.sections || []).reduce(
        (acc, sec) => acc + (sec.chapters?.length || 0), 0
      );
      counts[subject.id || subject.title?.toLowerCase()] = total;
    }
    return counts;
  }, [studyMap]);

  const selectedSubject = useMemo(() => {
    const subjects = studyMap?.focusStudy?.subjects || [];
    return subjects.find((s) => s.id === activeSubjectId || s.title?.toLowerCase() === activeSubjectId);
  }, [activeSubjectId, studyMap]);

  const sections     = selectedSubject?.sections || [];
  const activeSection = sections.find((s) => s.id === activeSectionId);

  const go = (newStep, dir) => {
    setAnimClass(dir === 'forward' ? 'focus-slide-forward' : 'focus-slide-back');
    setStep(newStep);
  };

  const handleSubjectClick = (subject) => {
    if (!subject.available || isLoading) return;
    setActiveSubjectId(subject.id);
    setActiveSectionId('');
    go(2, 'forward');
  };

  const handleSectionClick = (section) => {
    setActiveSectionId(section.id);
    go(3, 'forward');
  };

  const handleBack = () => {
    if (step === 3) { setActiveSectionId(''); go(2, 'back'); }
    else if (step === 2) { setActiveSubjectId(''); go(1, 'back'); }
  };

  const handleClose = () => {
    setStep(1);
    setActiveSubjectId('');
    setActiveSectionId('');
    onClose();
  };

  const stepTitle = step === 1
    ? 'Kya padhna hai aaj?'
    : step === 2
      ? `${selectedSubject?.title || ''} — section chunno`
      : `${activeSection?.title || ''} — chapter chunno`;

  const stepLabel = step === 1 ? 'Subject chunno' : step === 2 ? 'Section chunno' : 'Chapter chunno';

  return (
    <Dialog
      fullWidth
      maxWidth="md"
      open={isOpen}
      onClose={handleClose}
      PaperProps={{
        sx: {
          backgroundImage: 'none',
          border:          '1px solid var(--border)',
          borderRadius:    'var(--radius-xl)',
          overflow:        'hidden',
        },
      }}
    >
      {/* ── Header ── */}
      <Box className="focus-modal-header">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          {step > 1 && (
            <IconButton
              size="small"
              onClick={handleBack}
              aria-label="Go back"
              sx={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
                width: 30, height: 30,
                flexShrink: 0,
                '&:hover': { borderColor: 'var(--border-strong)', color: 'var(--text-primary)', bgcolor: 'var(--bg-hover)' },
              }}
            >
              <ArrowBackRounded sx={{ fontSize: 16 }} />
            </IconButton>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--primary)', lineHeight: 1, mb: '2px' }}>
              Focus Mode
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-.3px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stepTitle}
            </Typography>
          </Box>
        </Box>

        <IconButton
          size="small"
          onClick={handleClose}
          aria-label="Close focus selector"
          sx={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-muted)',
            width: 30, height: 30,
            flexShrink: 0,
            '&:hover': { borderColor: 'var(--border-strong)', color: 'var(--text-primary)', bgcolor: 'var(--bg-hover)' },
          }}
        >
          <CloseRounded sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* ── Slide area ── */}
      <Box sx={{ overflowX: 'hidden', overflowY: 'auto' }}>
        <Box key={step} className={`focus-slide ${animClass}`}>

          <Typography className="focus-section-label">{stepLabel}</Typography>

          {/* Step 1 — Subjects */}
          {step === 1 && (
            <Box className="focus-grid-3">
              {enrichedSubjects.map((subject) => {
                const Icon = subject.icon;
                return (
                  <button
                    key={subject.id}
                    type="button"
                    disabled={!subject.available || isLoading}
                    className={`focus-item-btn ${subject.available ? 'available' : 'unavailable'}`}
                    onClick={() => handleSubjectClick(subject)}
                  >
                    <Icon sx={{ fontSize: 20, color: subject.available ? 'var(--primary)' : 'var(--text-hint)', display: 'block', mb: 0.75 }} />
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {subject.title}
                    </Typography>
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.7rem', color: subject.available ? 'var(--primary-label)' : 'var(--text-hint)', mt: 0.5 }}>
                      {subject.available ? `${subjectChapterCounts[subject.id] || 0} chapters` : 'Jald aata hai'}
                    </Typography>
                  </button>
                );
              })}
            </Box>
          )}

          {/* Step 2 — Sections */}
          {step === 2 && (
            <Box className="focus-grid-3">
              {sections.map((section) => {
                const SectionIcon = sectionIcons[section.title?.toLowerCase()] || MenuBookRounded;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className="focus-item-btn available"
                    onClick={() => handleSectionClick(section)}
                  >
                    <SectionIcon sx={{ fontSize: 20, color: 'var(--primary)', display: 'block', mb: 0.75 }} />
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {section.title}
                    </Typography>
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', mt: 0.5 }}>
                      {section.chapters?.length || 0} chapters
                    </Typography>
                  </button>
                );
              })}
            </Box>
          )}

          {/* Step 3 — Chapters */}
          {step === 3 && activeSection && (
            <Box className="focus-grid-2">
              {activeSection.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  className={`focus-item-btn available ${selectedChapterId === chapter.id ? 'selected' : ''}`}
                  onClick={() => onSelectChapter(chapter.id)}
                >
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', mb: 0.5 }}>
                    Ch {chapter.number}
                  </Typography>
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {chapter.title}
                  </Typography>
                </button>
              ))}
            </Box>
          )}

        </Box>
      </Box>
    </Dialog>
  );
}

export default FocusModal;
