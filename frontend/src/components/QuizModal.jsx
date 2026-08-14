import React, { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import ShuffleRounded from '@mui/icons-material/ShuffleRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { generateQuiz, submitQuiz } from '../api/tutorApi.js';

// Each quizType gets its own identity — icon, color, and a plain-language purpose
// line — so a student can tell a gate quiz (must-pass) apart from a practice quiz
// (no stakes) at a glance. Copy is deliberately jargon-free (no "gate") — this is
// the same bar as student-facing tutor answers (see CLAUDE.md language rules).
const TYPE_CONFIG = {
  chapter_gate: {
    label: 'Chapter Quiz',
    purpose: 'Pass karke chapter complete karo',
    icon: EmojiEventsRounded,
    fg: 'var(--primary)',
  },
  chapter_practice: {
    label: 'Practice Quiz',
    purpose: 'Bas practice ke liye, koi asar nahi',
    icon: TrendingUpRounded,
    fg: 'var(--text-secondary)',
  },
  mix_practice: {
    label: 'Mix Quiz',
    purpose: 'Alag-alag chapters ke sawaal',
    icon: ShuffleRounded,
    fg: 'var(--text-secondary)',
  },
};

// Server sends all 3 languages — product rule is Zuno always speaks Hinglish,
// so that's the default; en is only a fallback if hinglish is somehow empty.
const pickText = (text) => text?.hinglish || text?.en || '';

function QuizModal({ isOpen, quizType, subjectId, chapterId, contextTitle, onClose }) {
  const [screen, setScreen] = useState('loading'); // 'loading' | 'quiz' | 'confirm' | 'error'
  const [quizData, setQuizData] = useState(null);
  const [answers, setAnswers] = useState({}); // { [questionId]: { selectedOption, timeSpentMs } }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);

  // Step 2 additions — submit flow state.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null); // shown inline on the confirm screen
  const [result, setResult] = useState(null); // submitQuiz()'s response, once we have it

  // Time tracking is ref-based (not state) — it's bookkeeping for the eventual
  // submit payload, not something the UI needs to re-render on.
  const questionStartTimeRef = useRef(null);

  // New in Step 2 — same idea as questionStartTimeRef, but for the WHOLE quiz
  // (used to compute timeTakenSec on submit). Set once when the quiz screen
  // first appears, never reset until a fresh quiz starts.
  const quizStartTimeRef = useRef(null);

  // The key that tells the backend "this is one submission attempt". Made
  // once per quiz (on generate success), reused on every retry-submit, so a
  // double-click or network retry can never create two attempts.
  const submissionKeyRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setScreen('loading');
    setQuizData(null);
    setAnswers({});
    setCurrentIndex(0);
    setError(null);

    generateQuiz({ quizType, subjectId, chapterId })
      .then((data) => {
        if (cancelled) return;
        setQuizData(data);
        submissionKeyRef.current = crypto.randomUUID();
        quizStartTimeRef.current = Date.now();
        questionStartTimeRef.current = Date.now();
        setScreen('quiz');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setScreen('error');
      });

    return () => { cancelled = true; };
  }, [isOpen, quizType, subjectId, chapterId]);

  // Accumulates elapsed time on the question being left into `answers`, then
  // resets the clock for whichever question comes next. Additive (+=) because
  // prev/next can revisit the same question more than once.
  const commitTimeSpent = (questionId) => {
    const elapsed = Date.now() - (questionStartTimeRef.current || Date.now());
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        selectedOption: prev[questionId]?.selectedOption ?? null,
        timeSpentMs: (prev[questionId]?.timeSpentMs || 0) + elapsed,
      },
    }));
    questionStartTimeRef.current = Date.now();
  };

  const currentQuestion = quizData?.questions?.[currentIndex] || null;
  const isLastQuestion = quizData && currentIndex === quizData.questions.length - 1;
  const typeConfig = TYPE_CONFIG[quizType] || TYPE_CONFIG.chapter_practice;
  const TypeIcon = typeConfig.icon;

  const handleSelectOption = (label) => {
    if (!currentQuestion) return;
    setAnswers((prev) => {
      const existing = prev[currentQuestion.questionId];
      const nextSelected = existing?.selectedOption === label ? null : label; // click again = deselect
      return {
        ...prev,
        [currentQuestion.questionId]: {
          selectedOption: nextSelected,
          timeSpentMs: existing?.timeSpentMs || 0,
        },
      };
    });
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    commitTimeSpent(currentQuestion.questionId);
    if (isLastQuestion) {
      setScreen('confirm');
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (!currentQuestion || currentIndex === 0) return;
    commitTimeSpent(currentQuestion.questionId);
    setCurrentIndex((i) => i - 1);
  };

  const handleBackToLastQuestion = () => {
    if (!quizData) return;
    questionStartTimeRef.current = Date.now();
    setCurrentIndex(quizData.questions.length - 1);
    setScreen('quiz');
  };

  // Turns the answers map into the plain array shape submitQuiz() expects —
  // one entry per question, skipped ones just carry selectedOption: null.
  const buildAnswersForSubmit = () =>
    quizData.questions.map((q) => {
      const saved = answers[q.questionId];
      return {
        questionId: q.questionId,
        selectedOption: saved?.selectedOption ?? null,
        timeSpentMs: saved?.timeSpentMs || 0,
      };
    });

  const handleSubmit = async () => {
    if (!quizData) return;

    // Soft check before even calling the API — a session older than this
    // has already expired on the server, no point trying.
    const isExpired = Date.now() > new Date(quizData.expiresAt).getTime();
    if (isExpired) {
      setError('Quiz ka time khatam ho gaya. Nayi quiz banate hain.');
      setScreen('error');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const timeTakenSec = Math.round((Date.now() - quizStartTimeRef.current) / 1000);

    try {
      const data = await submitQuiz({
        quizId: quizData.quizId,
        submissionKey: submissionKeyRef.current,
        timeTakenSec,
        answers: buildAnswersForSubmit(),
      });
      setResult(data);
      setScreen('result');
    } catch (err) {
      if (err.status === 404) {
        // Session genuinely gone on the server side (rare — the soft check
        // above catches the normal TTL case) — only a fresh quiz can fix this.
        setError('Quiz session nahi mili. Nayi quiz banate hain.');
        setScreen('error');
      } else {
        // 409 (already submitted elsewhere) / 429 (rate limit) / network —
        // stay on the confirm screen so the student's answers aren't lost.
        setSubmitError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    setScreen('loading');
    setError(null);
    setSubmitError(null);
    setResult(null);
    generateQuiz({ quizType, subjectId, chapterId })
      .then((data) => {
        setQuizData(data);
        setAnswers({});
        setCurrentIndex(0);
        submissionKeyRef.current = crypto.randomUUID();
        quizStartTimeRef.current = Date.now();
        questionStartTimeRef.current = Date.now();
        setScreen('quiz');
      })
      .catch((err) => {
        setError(err.message);
        setScreen('error');
      });
  };

  // Quiz is "in progress" (something to lose) only on these 2 screens.
  // Loading/error/result have nothing worth confirming before closing.
  const handleClose = () => {
    const quizInProgress = screen === 'quiz' || screen === 'confirm';
    if (quizInProgress && !window.confirm('Progress save nahi hogi. Band karein?')) {
      return;
    }
    onClose();
  };

  const answeredCount = quizData
    ? quizData.questions.filter((q) => answers[q.questionId]?.selectedOption).length
    : 0;
  const skippedCount = quizData ? quizData.questionCount - answeredCount : 0;

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      open={isOpen}
      onClose={handleClose}
      PaperProps={{
        sx: {
          backgroundImage: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
        },
      }}
    >
      {/* ── Header — quiz-type identity + chapter/subject context ── */}
      <Box className="focus-modal-header">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
          {screen === 'quiz' && currentIndex > 0 && (
            <IconButton
              size="small"
              onClick={handlePrev}
              aria-label="Pichla sawaal"
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

          <TypeIcon sx={{ fontSize: 22, color: typeConfig.fg, flexShrink: 0 }} />

          <Box sx={{ minWidth: 0 }}>
            <Typography className="quiz-context-title" title={contextTitle || ''}>
              {contextTitle || typeConfig.label}
            </Typography>
            <Typography className="quiz-type-caption">
              <span style={{ color: typeConfig.fg, fontWeight: 700 }}>{typeConfig.label}</span>
              <span className="quiz-caption-dot">·</span>
              {typeConfig.purpose}
            </Typography>
          </Box>
        </Box>

        <IconButton
          size="small"
          onClick={handleClose}
          aria-label="Close quiz"
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

      {/* ── Progress bar ── */}
      {screen === 'quiz' && quizData && (
        <Box sx={{ px: 3, pt: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
            <Typography className="quiz-progress-label">
              Sawaal {currentIndex + 1} / {quizData.questionCount}
            </Typography>
          </Box>
          <Box sx={{ width: '100%', height: 4, bgcolor: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <Box
              sx={{
                height: '100%',
                bgcolor: 'var(--primary)',
                width: `${((currentIndex + 1) / quizData.questionCount) * 100}%`,
                borderRadius: 2,
                transition: 'width 0.2s ease',
              }}
            />
          </Box>
        </Box>
      )}

      {/* ── Body ── */}
      <Box sx={{ p: 3, minHeight: 280 }}>

        {/* Loading */}
        {screen === 'loading' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 1.5 }}>
            <Box className="quiz-loading-spinner" />
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Quiz tayyar ho raha hai...
            </Typography>
          </Box>
        )}

        {/* Error */}
        {screen === 'error' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 2, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {error || 'Kuch gadbad ho gayi.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button variant="outlined" size="small" onClick={onClose}>Band karo</Button>
              <Button variant="contained" size="small" onClick={handleRetry}>Dobara try karo</Button>
            </Box>
          </Box>
        )}

        {/* Question */}
        {screen === 'quiz' && currentQuestion && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2.5 }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5, flex: 1 }}>
                {pickText(currentQuestion.text)}
              </Typography>
              {Array.isArray(currentQuestion.askedInYears) && currentQuestion.askedInYears.length > 0 && (
                <span className="quiz-pyq-badge">
                  PYQ {currentQuestion.askedInYears.join(', ')}
                </span>
              )}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {currentQuestion.options.map((opt) => {
                const isSelected = answers[currentQuestion.questionId]?.selectedOption === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={`quiz-option-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(opt.label)}
                  >
                    <span className="quiz-option-label">{opt.label}</span>
                    <span className="quiz-option-text">{pickText(opt.text)}</span>
                    {isSelected && <CheckCircleRounded className="quiz-option-check" sx={{ fontSize: 20 }} />}
                  </button>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Confirm submit */}
        {screen === 'confirm' && quizData && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 2, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {quizData.questionCount} mein se {answeredCount} answered, {skippedCount} skipped
            </Typography>
            {quizType === 'chapter_gate' && (
              <span className="quiz-type-note">Pass karne ke liye 70% chahiye</span>
            )}
            {skippedCount > 0 && (
              <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Kya tum bina jawab diye submit karna chahte ho?
              </Typography>
            )}
            {submitError && (
              <Typography sx={{ fontSize: '0.8rem', color: 'var(--error)' }}>
                {submitError}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
              <Button variant="outlined" size="small" onClick={handleBackToLastQuestion} disabled={isSubmitting}>
                Wapas jaao
              </Button>
              <Button variant="contained" size="small" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submit ho raha hai...' : 'Submit karo'}
              </Button>
            </Box>
          </Box>
        )}

        {/* Result */}
        {screen === 'result' && result && (
          <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 1.5, textAlign: 'center' }}>
            {result.passed === true && (
              <Box className="quiz-confetti">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="quiz-confetti-piece" />
                ))}
              </Box>
            )}

            <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {result.score} / {result.totalQuestions}
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {result.percentage}%
            </Typography>

            {result.passed === true && (
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'success.main' }}>
                Chapter complete ho gaya!
              </Typography>
            )}

            {result.passed === false && (
              <>
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  70% chahiye tha, {result.percentage}% aaya. Dobara try karo.
                </Typography>
                <Button variant="contained" size="small" onClick={handleRetry}>
                  Dobara quiz do
                </Button>
              </>
            )}

            {/* Per-question review — one block per question, correct option
                highlighted green, wrong-selected option highlighted red. */}
            {result.results?.length > 0 && (
              <Box sx={{ width: '100%', textAlign: 'left', mt: 2 }}>
                {result.results.map((q) => (
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
          </Box>
        )}
      </Box>

      {/* ── Footer nav (question screen only) ── */}
      {screen === 'quiz' && currentQuestion && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, px: 3, pb: 3 }}>
          <Button variant="text" size="small" onClick={handleNext} sx={{ color: 'var(--text-muted)' }}>
            Skip
          </Button>
          <Button variant="contained" size="small" onClick={handleNext}>
            {isLastQuestion ? 'Review & Submit' : 'Agla'}
          </Button>
        </Box>
      )}
    </Dialog>
  );
}

export default QuizModal;
