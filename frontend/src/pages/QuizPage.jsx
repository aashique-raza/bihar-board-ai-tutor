import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AutoStoriesRounded from '@mui/icons-material/AutoStoriesRounded';
import BiotechRounded from '@mui/icons-material/BiotechRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import FunctionsRounded from '@mui/icons-material/FunctionsRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import ShuffleRounded from '@mui/icons-material/ShuffleRounded';
import ZunoMark from '../components/ZunoMark.jsx';
import QuizModal from '../components/QuizModal.jsx';
import { fetchStudyMap, fetchQuizHistory, fetchQuizAttemptDetail } from '../api/tutorApi.js';

// Server sends all 3 languages — same fallback rule as QuizModal (Zuno always
// speaks Hinglish by default).
const pickText = (text) => text?.hinglish || text?.en || '';

const QUIZ_TYPE_LABELS = {
  chapter_gate: 'Chapter Quiz',
  chapter_practice: 'Practice Quiz',
  mix_practice: 'Mix Quiz',
};

const HISTORY_PAGE_SIZE = 10;

function formatRelativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Abhi';
  if (mins < 60) return `${mins} min pehle`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ghanta pehle`;
  const days = Math.floor(hours / 24);
  return `${days} din pehle`;
}

// Same 3-tier split as the gate's 70% pass bar — used to color-code both the
// history list's score pills and the attempt-detail score ring.
function scoreTier(percentage) {
  if (percentage >= 70) return 'high';
  if (percentage >= 40) return 'mid';
  return 'low';
}

// Same subject icon/title lookup as FocusModal.jsx — kept as a separate literal
// (not imported) because FocusModal doesn't export it; duplicating a small
// config object is simpler than introducing a shared-constants file for one map.
const SUBJECT_META = {
  hindi:            { title: 'Hindi',                     icon: TranslateRounded },
  english:          { title: 'English',                   icon: AutoStoriesRounded },
  math:             { title: 'Ganit (Math)',               icon: FunctionsRounded },
  science:          { title: 'Vigyan (Science)',           icon: ScienceRounded },
  'social-science': { title: 'Samajik Vigyan (Soc. Sci)', icon: PublicRounded },
  sanskrit:         { title: 'Sanskrit',                  icon: MenuBookRounded },
};
const SUBJECT_META_ORDER = Object.keys(SUBJECT_META);
const DEFAULT_SUBJECT_ICON = MenuBookRounded;

const sectionIcons = {
  physics:   BoltRounded,
  chemistry: ScienceRounded,
  biology:   BiotechRounded,
};

function QuizPageHeader({ showBack, stepTitle, onBackStep, onExit }) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '54px',
        px: { xs: 2, sm: 3 },
        bgcolor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        {showBack ? (
          <Box
            role="button"
            tabIndex={0}
            onClick={onBackStep}
            onKeyDown={(e) => e.key === 'Enter' && onBackStep()}
            aria-label="Peeche jao"
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, flexShrink: 0,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              '&:hover': { borderColor: 'var(--border-strong)', color: 'var(--text-primary)', bgcolor: 'var(--bg-hover)' },
            }}
          >
            <ArrowBackRounded sx={{ fontSize: 16 }} />
          </Box>
        ) : (
          <ZunoMark />
        )}
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {stepTitle}
        </Typography>
      </Box>

      <Box
        role="button"
        tabIndex={0}
        onClick={onExit}
        onKeyDown={(e) => e.key === 'Enter' && onExit()}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
          fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer',
          '&:hover': { color: 'var(--text-primary)' },
        }}
      >
        Chat pe wapas
      </Box>
    </Box>
  );
}

function QuizPage() {
  const navigate = useNavigate();
  const goToChat = () => navigate('/chat');

  const [studyMap, setStudyMap] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [step, setStep] = useState(1); // 1=subject, 2=section+mix, 3=chapters
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('');

  const [quizConfig, setQuizConfig] = useState(null); // { quizType, subjectId, chapterId, contextTitle }
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);

  // History list — loaded once on mount, independent of the picker steps.
  const [historyAttempts, setHistoryAttempts] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState(null);

  // Attempt detail — set when a history card is clicked. Replaces the picker
  // view entirely (same idea as FocusModal's step-based slide, but this is a
  // separate mode since it can be opened from step 1 regardless of subject/
  // section state).
  const [viewingAttemptId, setViewingAttemptId] = useState(null);
  const [attemptDetail, setAttemptDetail] = useState(null);
  const [attemptDetailLoading, setAttemptDetailLoading] = useState(false);
  const [attemptDetailError, setAttemptDetailError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetchStudyMap()
      .then((map) => { if (isMounted) setStudyMap(map); })
      .catch((err) => { if (isMounted) setLoadError(err.message); })
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchQuizHistory({ limit: HISTORY_PAGE_SIZE })
      .then((data) => {
        if (!isMounted) return;
        setHistoryAttempts(data.attempts || []);
        setHistoryHasMore(!!data.hasMore);
        setHistoryCursor(data.nextCursor || null);
      })
      .catch((err) => { if (isMounted) setHistoryError(err.message); })
      .finally(() => { if (isMounted) setHistoryLoading(false); });
    return () => { isMounted = false; };
  }, []);

  // Called after a fresh quiz submit — the new attempt won't appear in the
  // already-loaded history list otherwise. Simplest correct fix: reload page 1
  // (resets pagination, but a student who just finished a quiz is looking at
  // the newest attempt anyway, not mid-scroll through old ones).
  const refreshHistory = () => {
    setHistoryLoading(true);
    fetchQuizHistory({ limit: HISTORY_PAGE_SIZE })
      .then((data) => {
        setHistoryAttempts(data.attempts || []);
        setHistoryHasMore(!!data.hasMore);
        setHistoryCursor(data.nextCursor || null);
      })
      .catch((err) => setHistoryError(err.message))
      .finally(() => setHistoryLoading(false));
  };

  const handleLoadMoreHistory = async () => {
    if (!historyCursor || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    try {
      const data = await fetchQuizHistory({ limit: HISTORY_PAGE_SIZE, cursor: historyCursor });
      setHistoryAttempts((prev) => [...prev, ...(data.attempts || [])]);
      setHistoryHasMore(!!data.hasMore);
      setHistoryCursor(data.nextCursor || null);
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  const handleOpenAttempt = (attemptId) => {
    setViewingAttemptId(attemptId);
    setAttemptDetail(null);
    setAttemptDetailError(null);
    setAttemptDetailLoading(true);
    fetchQuizAttemptDetail(attemptId)
      .then((data) => setAttemptDetail(data))
      .catch((err) => setAttemptDetailError(err.message))
      .finally(() => setAttemptDetailLoading(false));
  };

  const handleCloseAttempt = () => {
    setViewingAttemptId(null);
    setAttemptDetail(null);
    setAttemptDetailError(null);
  };

  // chapterId -> Hinglish title, used to label history cards (the API only
  // returns chapterId, never a title — same lookup pattern as FocusModal's
  // chapterTitleMap).
  const chapterTitleMap = useMemo(() => {
    const map = {};
    for (const subject of studyMap?.focusStudy?.subjects || []) {
      for (const section of subject.sections || []) {
        for (const chapter of section.chapters || []) {
          map[chapter.id] = chapter.hinglishTitle || chapter.title;
        }
      }
    }
    return map;
  }, [studyMap]);

  const getAttemptTitle = (attempt) => {
    if (attempt.chapterId && chapterTitleMap[attempt.chapterId]) {
      return chapterTitleMap[attempt.chapterId];
    }
    if (attempt.quizType === 'mix_practice') {
      const subjMeta = SUBJECT_META[attempt.subjectId];
      return `${subjMeta?.title || attempt.subjectId} — Mix Quiz`;
    }
    return QUIZ_TYPE_LABELS[attempt.quizType] || 'Quiz';
  };

  // Union of SUBJECT_META (known/placeholder subjects) and studyMap's real
  // subjects — same reasoning as FocusModal: a subject with real content must
  // always render, even if nobody added it to SUBJECT_META yet.
  const enrichedSubjects = useMemo(() => {
    const liveById = new Map((studyMap?.focusStudy?.subjects || []).map((s) => [s.id, s]));
    const allIds = [...new Set([...SUBJECT_META_ORDER, ...liveById.keys()])];

    return allIds
      .map((id) => {
        const meta = SUBJECT_META[id];
        const live = liveById.get(id);
        return {
          id,
          title: live?.hinglishTitle || live?.title || meta?.title || id,
          icon: meta?.icon || DEFAULT_SUBJECT_ICON,
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
      const total = (subject.sections || []).reduce((acc, sec) => acc + (sec.chapters?.length || 0), 0);
      counts[subject.id || subject.title?.toLowerCase()] = total;
    }
    return counts;
  }, [studyMap]);

  const selectedSubject = useMemo(() => {
    const subjects = studyMap?.focusStudy?.subjects || [];
    return subjects.find((s) => s.id === activeSubjectId || s.title?.toLowerCase() === activeSubjectId);
  }, [activeSubjectId, studyMap]);

  const sections = selectedSubject?.sections || [];
  const activeSection = sections.find((s) => s.id === activeSectionId);

  const handleSubjectClick = (subject) => {
    if (!subject.available) return;
    setActiveSubjectId(subject.id);
    setActiveSectionId('');
    setStep(2);
  };

  const handleSectionClick = (section) => {
    setActiveSectionId(section.id);
    setStep(3);
  };

  const handleBackStep = () => {
    if (step === 3) { setActiveSectionId(''); setStep(2); }
    else if (step === 2) { setActiveSubjectId(''); setStep(1); }
  };

  const openChapterQuiz = (chapter) => {
    setQuizConfig({
      quizType: 'chapter_practice',
      subjectId: selectedSubject.id,
      chapterId: chapter.id,
      contextTitle: chapter.hinglishTitle || chapter.title,
    });
    setIsQuizModalOpen(true);
  };

  const openMixQuiz = () => {
    setQuizConfig({
      quizType: 'mix_practice',
      subjectId: selectedSubject.id,
      chapterId: null,
      contextTitle: `${selectedSubject.hinglishTitle || selectedSubject.title} — Mix Quiz`,
    });
    setIsQuizModalOpen(true);
  };

  const stepTitle = viewingAttemptId
    ? 'Quiz Result'
    : step === 1
      ? 'Practice Quiz Hub'
      : step === 2
        ? `${selectedSubject?.hinglishTitle || selectedSubject?.title || ''} — bhaag ya Mix Quiz`
        : `${activeSection?.hinglishTitle || activeSection?.title || ''} — adhyaay chunno`;

  const handleHeaderBack = () => {
    if (viewingAttemptId) { handleCloseAttempt(); return; }
    handleBackStep();
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-page)', display: 'flex', flexDirection: 'column' }}>
      <QuizPageHeader
        showBack={!!viewingAttemptId || step > 1}
        stepTitle={stepTitle}
        onBackStep={handleHeaderBack}
        onExit={goToChat}
      />

      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', px: 2, py: { xs: 3, sm: 4 } }}>
        <Box sx={{ width: '100%', maxWidth: 640 }}>

          {!viewingAttemptId && isLoading && (
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', mt: 4 }}>
              Loading...
            </Typography>
          )}

          {!viewingAttemptId && !isLoading && loadError && (
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--error)', textAlign: 'center', mt: 4 }}>
              {loadError}
            </Typography>
          )}

          {/* ── Attempt detail — replaces the picker entirely while open ── */}
          {viewingAttemptId && (
            <Box>
              {attemptDetailLoading && (
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', mt: 4 }}>
                  Loading...
                </Typography>
              )}

              {!attemptDetailLoading && attemptDetailError && (
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--error)', textAlign: 'center', mt: 4 }}>
                  {attemptDetailError}
                </Typography>
              )}

              {!attemptDetailLoading && attemptDetail && (
                <>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mb: 3, textAlign: 'center' }}>
                    <Box className={`quiz-detail-score-ring ${scoreTier(attemptDetail.percentage)}`}>
                      <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                        {attemptDetail.percentage}%
                      </Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: 'var(--text-muted)', mt: '2px' }}>
                        {attemptDetail.score}/{attemptDetail.totalQuestions}
                      </Typography>
                    </Box>
                    {attemptDetail.passed === true && (
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>
                        Pass ho gaya
                      </Typography>
                    )}
                    {attemptDetail.passed === false && (
                      <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        70% chahiye tha
                      </Typography>
                    )}
                  </Box>

                  {attemptDetail.results?.length > 0 && (
                    <Box sx={{ textAlign: 'left' }}>
                      {attemptDetail.results.map((q) => (
                        <Box key={q.questionId} className="quiz-review-item">
                          <Typography className="quiz-review-question">
                            {pickText(q.text)}
                          </Typography>

                          {q.options.map((opt) => {
                            const isCorrectOption = opt.label === q.correctOption;
                            const isWrongSelected = opt.label === q.selectedOption && !q.isCorrect;
                            const highlightClass = isCorrectOption ? 'correct' : isWrongSelected ? 'incorrect' : '';
                            return (
                              <Box key={opt.label} className={`quiz-review-option ${highlightClass}`}>
                                <span className="quiz-option-label">{opt.label}</span>
                                <span>{pickText(opt.text)}</span>
                              </Box>
                            );
                          })}

                          {pickText(q.explanation) && (
                            <Typography className="quiz-review-explanation">
                              {pickText(q.explanation)}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}

          {!viewingAttemptId && !isLoading && !loadError && step === 1 && (
            <>
              <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)', mb: 2.5, lineHeight: 1.5 }}>
                Jitna practice utna confidence — koi bhi chapter chuno, ya seedha Mix Quiz try karo.
              </Typography>

              <Typography className="focus-section-label">Vishay chunno</Typography>
              <Box className="focus-grid-3">
                {enrichedSubjects.map((subject) => {
                  const Icon = subject.icon;
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      disabled={!subject.available}
                      className={`focus-item-btn ${subject.available ? 'available' : 'unavailable'}`}
                      onClick={() => handleSubjectClick(subject)}
                    >
                      <Icon sx={{ fontSize: 20, color: subject.available ? 'var(--primary)' : 'var(--text-hint)', display: 'block', mb: 0.75 }} />
                      <Typography component="span" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                        {subject.title}
                      </Typography>
                      <Typography component="span" sx={{ display: 'block', fontSize: '0.7rem', color: subject.available ? 'var(--primary-label)' : 'var(--text-hint)', mt: 0.5 }}>
                        {subject.available ? `${subjectChapterCounts[subject.id] || 0} adhyaay` : 'Jald aata hai'}
                      </Typography>
                    </button>
                  );
                })}
              </Box>

              {/* ── History — past attempts, newest first ── */}
              <Box sx={{ mt: 3.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <HistoryRounded sx={{ fontSize: 16, color: 'var(--text-muted)' }} />
                  <Typography className="focus-section-label" sx={{ mb: '0 !important' }}>
                    Tumhari History
                  </Typography>
                </Box>

                {historyLoading && (
                  <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Loading...
                  </Typography>
                )}

                {!historyLoading && historyError && (
                  <Typography sx={{ fontSize: '0.8rem', color: 'var(--error)' }}>
                    {historyError}
                  </Typography>
                )}

                {!historyLoading && !historyError && historyAttempts.length === 0 && (
                  <Box className="quiz-history-empty">
                    <HistoryRounded sx={{ fontSize: 22, color: 'var(--text-hint)' }} />
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Abhi tak koi quiz attempt nahi hai.
                    </Typography>
                  </Box>
                )}

                {!historyLoading && !historyError && historyAttempts.length > 0 && (
                  <>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {historyAttempts.map((attempt) => (
                        <button
                          key={attempt.attemptId}
                          type="button"
                          className={`quiz-history-card type-${attempt.quizType}`}
                          onClick={() => handleOpenAttempt(attempt.attemptId)}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography component="span" sx={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {getAttemptTitle(attempt)}
                            </Typography>
                            <Typography component="span" sx={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', mt: 0.25 }}>
                              {QUIZ_TYPE_LABELS[attempt.quizType] || 'Quiz'} · {formatRelativeTime(attempt.createdAt)}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            <Typography component="span" sx={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {attempt.score}/{attempt.totalQuestions}
                            </Typography>
                            <span className={`quiz-score-pill ${scoreTier(attempt.percentage)}`}>
                              {attempt.percentage}%
                            </span>
                          </Box>
                        </button>
                      ))}
                    </Box>

                    {historyHasMore && (
                      <Button
                        size="small"
                        onClick={handleLoadMoreHistory}
                        disabled={historyLoadingMore}
                        sx={{ mt: 1.5, textTransform: 'none', color: 'var(--text-muted)' }}
                      >
                        {historyLoadingMore ? 'Load ho raha hai...' : 'Aur dikhao'}
                      </Button>
                    )}
                  </>
                )}
              </Box>
            </>
          )}

          {!viewingAttemptId && !isLoading && !loadError && step === 2 && selectedSubject && (
            <>
              <Typography className="focus-section-label">Mix Quiz</Typography>
              <button type="button" className="focus-item-btn available quiz-mix-card" onClick={openMixQuiz}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShuffleRounded sx={{ fontSize: 20, color: 'var(--primary)' }} />
                  <Box>
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Mix Quiz
                    </Typography>
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', mt: 0.25 }}>
                      Poore {selectedSubject.hinglishTitle || selectedSubject.title} se 20 sawaal
                    </Typography>
                  </Box>
                </Box>
              </button>

              <Typography className="focus-section-label" sx={{ mt: 2.5 }}>Ya bhaag chunno</Typography>
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
                        {section.hinglishTitle || section.title}
                      </Typography>
                      <Typography component="span" sx={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', mt: 0.5 }}>
                        {section.chapters?.length || 0} adhyaay
                      </Typography>
                    </button>
                  );
                })}
              </Box>
            </>
          )}

          {!viewingAttemptId && !isLoading && !loadError && step === 3 && activeSection && (
            <Box className="focus-grid-2">
              {activeSection.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  className="focus-item-btn available"
                  onClick={() => openChapterQuiz(chapter)}
                >
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', mb: 0.5 }}>
                    Adhyaay {chapter.number}
                  </Typography>
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {chapter.hinglishTitle || chapter.title}
                  </Typography>
                </button>
              ))}
            </Box>
          )}

        </Box>
      </Box>

      <QuizModal
        isOpen={isQuizModalOpen}
        quizType={quizConfig?.quizType}
        subjectId={quizConfig?.subjectId}
        chapterId={quizConfig?.chapterId}
        contextTitle={quizConfig?.contextTitle}
        onQuizComplete={refreshHistory}
        onClose={() => setIsQuizModalOpen(false)}
      />
    </Box>
  );
}

export default QuizPage;
