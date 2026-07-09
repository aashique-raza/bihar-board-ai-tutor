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
import { useChapterProgress } from '../hooks/useChapterProgress.js';

// Icon + placeholder-title config for subjects, keyed by id. This is a lookup,
// NOT the render source — the render list is the union of this config and
// studyMap.focusStudy.subjects (see enrichedSubjects below). That union is the
// STEP-15 fix: previously this array WAS the render source, so a subject present
// in studyMap but missing here would silently never appear in the modal at all.
const SUBJECT_META = {
  hindi:            { title: 'Hindi',          icon: TranslateRounded },
  english:          { title: 'English',        icon: AutoStoriesRounded },
  math:             { title: 'Math',           icon: FunctionsRounded },
  science:          { title: 'Science',        icon: ScienceRounded },
  'social-science': { title: 'Social Science', icon: PublicRounded },
  sanskrit:         { title: 'Sanskrit',       icon: MenuBookRounded },
};
const SUBJECT_META_ORDER = Object.keys(SUBJECT_META);
const DEFAULT_SUBJECT_ICON = MenuBookRounded; // used if studyMap has a subject not in SUBJECT_META

// Unlike SUBJECT_META above, this is safe as-is: it's used as a lookup-with-fallback
// over `sections`, which always comes from real studyMap data (never the iteration
// source itself), so a new section never becomes invisible — worst case it gets the
// generic MenuBookRounded fallback icon.
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

  const { inProgressChapters } = useChapterProgress();

  // Build chapterId → English title lookup from the study map
  const chapterTitleMap = useMemo(() => {
    const map = {};
    for (const subject of studyMap?.focusStudy?.subjects || []) {
      for (const section of subject.sections || []) {
        for (const chapter of section.chapters || []) {
          map[chapter.id] = chapter.title;
        }
      }
    }
    return map;
  }, [studyMap]);

  // Union of SUBJECT_META (known/placeholder subjects) and studyMap's real subjects —
  // guarantees a subject with real content always renders, even if nobody added it
  // to SUBJECT_META yet (falls back to its live title + DEFAULT_SUBJECT_ICON).
  const enrichedSubjects = useMemo(() => {
    const liveById = new Map((studyMap?.focusStudy?.subjects || []).map((s) => [s.id, s]));
    const allIds = [...new Set([...SUBJECT_META_ORDER, ...liveById.keys()])];

    return allIds
      .map((id) => {
        const meta = SUBJECT_META[id];
        const live = liveById.get(id);
        return {
          id,
          title: live?.title || meta?.title || id,
          icon:  meta?.icon || DEFAULT_SUBJECT_ICON,
          available: !!live,
        };
      })
      .sort((a, b) => {
        const ai = SUBJECT_META_ORDER.indexOf(a.id);
        const bi = SUBJECT_META_ORDER.indexOf(b.id);
        if (ai !== -1 || bi !== -1) {
          return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
        }
        return a.title.localeCompare(b.title);
      });
  }, [studyMap]);

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

          {/* Step 1 — Continue Karo (in-progress chapters) */}
          {step === 1 && inProgressChapters.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography className="focus-section-label" sx={{ mb: 1 }}>
                Jahan Chhoda Tha
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {inProgressChapters.map((cp) => {
                  // Only show chapters that still exist in the current curriculum
                  // (a chapter_progress doc can outlive a removed/renamed chapter).
                  if (!chapterTitleMap[cp.chapterId]) return null;
                  // hinglishTitle comes straight from the backend (listChapterProgressController
                  // already computes it from the single CHAPTER_HINGLISH source of truth) —
                  // no frontend lookup needed.
                  const hinglishTitle = cp.hinglishTitle || chapterTitleMap[cp.chapterId];
                  const pct = Math.round(cp.progressPercent ?? 0);
                  return (
                    <button
                      key={cp.chapterId}
                      type="button"
                      className="focus-item-btn available"
                      onClick={() => onSelectChapter(cp.chapterId)}
                      style={{ textAlign: 'left', flex: '1 1 180px', maxWidth: 260 }}
                    >
                      <Typography component="span" sx={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, mb: 0.75 }}>
                        {hinglishTitle}
                      </Typography>
                      {/* Mini progress bar */}
                      <Box sx={{ width: '100%', height: 3, bgcolor: 'var(--border)', borderRadius: 2, overflow: 'hidden', mb: 0.5 }}>
                        <Box sx={{ height: '100%', bgcolor: 'var(--primary)', width: `${pct}%`, borderRadius: 2 }} />
                      </Box>
                      <Typography component="span" sx={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {pct}% complete
                      </Typography>
                    </button>
                  );
                })}
              </Box>
            </Box>
          )}

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
