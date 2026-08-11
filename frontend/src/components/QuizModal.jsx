import React, { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { generateQuiz } from '../api/tutorApi.js';

const QUIZ_TYPE_LABEL = {
  chapter_gate: 'Chapter Quiz',
  chapter_practice: 'Practice Quiz',
  mix_practice: 'Mix Quiz',
};

// Server sends all 3 languages — product rule is Zuno always speaks Hinglish,
// so that's the default; en is only a fallback if hinglish is somehow empty.
const pickText = (text) => text?.hinglish || text?.en || '';

function QuizModal({ isOpen, quizType, subjectId, chapterId, onClose }) {
  const [screen, setScreen] = useState('loading'); // 'loading' | 'quiz' | 'confirm' | 'error'
  const [quizData, setQuizData] = useState(null);
  const [answers, setAnswers] = useState({}); // { [questionId]: { selectedOption, timeSpentMs } }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);

  // Time tracking is ref-based (not state) — it's bookkeeping for the eventual
  // submit payload, not something the UI needs to re-render on.
  const questionStartTimeRef = useRef(null);

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

  // Step 2 wires the real submit call (submitQuiz + result screen) here.
  const handleSubmit = () => {};

  const handleRetry = () => {
    setScreen('loading');
    setError(null);
    generateQuiz({ quizType, subjectId, chapterId })
      .then((data) => {
        setQuizData(data);
        setAnswers({});
        setCurrentIndex(0);
        questionStartTimeRef.current = Date.now();
        setScreen('quiz');
      })
      .catch((err) => {
        setError(err.message);
        setScreen('error');
      });
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
      onClose={onClose}
      PaperProps={{
        sx: {
          backgroundImage: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
        },
      }}
    >
      {/* ── Header ── */}
      <Box className="focus-modal-header">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
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
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--primary)', lineHeight: 1, mb: '2px' }}>
              {QUIZ_TYPE_LABEL[quizType] || 'Quiz'}
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-.3px', lineHeight: 1.2 }}>
              {screen === 'quiz' && quizData
                ? `Sawaal ${currentIndex + 1} / ${quizData.questionCount}`
                : screen === 'confirm'
                  ? 'Submit se pehle check karo'
                  : 'Quiz'}
            </Typography>
          </Box>
        </Box>

        <IconButton
          size="small"
          onClick={onClose}
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
            {Array.isArray(currentQuestion.askedInYears) && currentQuestion.askedInYears.length > 0 && (
              <Box className="quiz-pyq-badge">
                PYQ {currentQuestion.askedInYears.join(', ')}
              </Box>
            )}

            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5, mb: 2.5 }}>
              {pickText(currentQuestion.text)}
            </Typography>

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
            {skippedCount > 0 && (
              <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Kya tum bina jawab diye submit karna chahte ho?
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
              <Button variant="outlined" size="small" onClick={handleBackToLastQuestion}>Wapas jaao</Button>
              <Button variant="contained" size="small" onClick={handleSubmit}>Submit karo</Button>
            </Box>
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
