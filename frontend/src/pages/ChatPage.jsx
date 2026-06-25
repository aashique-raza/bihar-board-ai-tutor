import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { useLocation, useNavigate } from 'react-router-dom';
import { askTutor, fetchSessionHistory, fetchStudyMap } from '../api/tutorApi.js';
import AskBar from '../components/AskBar.jsx';
import ChatMessage from '../components/ChatMessage.jsx';
import FocusModal from '../components/FocusModal.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import Toast from '../components/Toast.jsx';
import Topbar from '../components/Topbar.jsx';
import { STUDY_MODES } from '../constants/studyModes.js';
import { clearSessionId, getSavedSessionId, saveSessionId } from '../utils/session.js';
import { findFirstChapter } from '../utils/studyMap.js';
import {
  getGuestTurnCount,
  incrementGuestTurnCount,
  isGuestLimitReached,
  setGuestTurnCountToLimit,
  GUEST_TURN_LIMIT,
} from '../utils/guestLimit.js';
import GuestLimitModal from '../components/GuestLimitModal.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import useSessionList from '../hooks/useSessionList.js';
import HistoryPanel from '../components/HistoryPanel.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

// --- Message factory helpers ---


const createQuestionMessage = (question) => ({
  id: crypto.randomUUID(),
  role: 'student',
  answer: question,
});

const createAnswerMessage = (payload) => ({
  id: crypto.randomUUID(),
  role: 'zuno',
  ...payload,
});

const createLockSystemMessage = () => ({
  id: crypto.randomUUID(),
  role: 'system',
  answer: 'Is session ki limit reach ho gayi. Nayi chat shuru karo.',
  sources: [],
});

const createCapNoticeMessage = () => ({
  id: crypto.randomUUID(),
  role: 'system',
  answer: 'Purani 30 messages load ki gayi hain.',
  sources: [],
});

const dbMessageToUiMessage = (m) => ({
  id: crypto.randomUUID(),
  role: m.role === 'student' ? 'student' : 'zuno',
  answer: m.text,
  status: m.metadata?.status || 'answered',
  sources: m.sources || [],
  sections: m.metadata?.sections || [],
  responseMode: m.metadata?.responseMode || null,
});

const createFocusMessage = (chapter) => ({
  id: crypto.randomUUID(),
  role: 'zuno',
  status: 'focus_selected',
  answer: `Focus mode on hai. Ab hum ${chapter.subjectTitle} > ${chapter.sectionTitle} > ${chapter.title} par kaam karenge. Is chapter ka topic, concept, ya question likho.`,
  sources: [],
});

// --- ChatPage component ---

function ChatPage({ theme, toggleTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const { sessions, isLoading: sessionsLoading, refresh, fetchOnce } =
    useSessionList({ enabled: isLoggedIn });

  useEffect(() => {
    if (location.state?.toastSuccess) {
      showToast(location.state.toastSuccess, 'success');
    } else if (location.state?.toastError) {
      showToast(location.state.toastError, 'error');
    }
    if (location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  const [studyMode, setStudyMode] = useState(STUDY_MODES.global);
  const [studyMap, setStudyMap] = useState(null);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [sessionId, setSessionId] = useState(() => getSavedSessionId());
  const [isStudyMapLoading, setIsStudyMapLoading] = useState(true);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [isGuestLimited, setIsGuestLimited] = useState(false);
  const [guestLimitModal, setGuestLimitModal] = useState({ open: false, trigger: 'turn_limit' });

  const chatEndRef = useRef(null);
  const controllerRef = useRef(null);
  const timeoutRef = useRef(null);
  const wasTimeoutAbortRef = useRef(false);
  const isSwitchingRef = useRef(false); // BUG-2 FIX: abort race guard

  // Refs so async callbacks always read the latest state values
  const sessionIdRef = useRef(sessionId);
  const selectedChapterIdRef = useRef(selectedChapterId);
  const studyModeRef = useRef(studyMode);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { selectedChapterIdRef.current = selectedChapterId; }, [selectedChapterId]);
  useEffect(() => { studyModeRef.current = studyMode; }, [studyMode]);

  // Cleanup on unmount — abort any in-flight request
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // On mount: if guest already hit the limit (e.g. came back after closing tab), lock AskBar immediately
  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn && isGuestLimitReached()) {
      setIsGuestLimited(true);
    }
  }, [isAuthLoading, isLoggedIn]);

  // Load chat history from DB on mount — restores messages after page refresh
  // Waits for auth to initialize before deciding (race condition guard)
  useEffect(() => {
    if (isAuthLoading) return;

    const savedId = getSavedSessionId();

    if (!savedId || !isLoggedIn) {
      setMessages([]);
      setIsHistoryLoading(false);
      return;
    }

    let cancelled = false;
    fetchSessionHistory(savedId).then((result) => {
      if (cancelled) return;
      // result is null only on 401 (silent) — show welcome and keep sessionId as-is
      if (!result) {
        setMessages([]);
        return;
      }
      const dbMessages = result?.messages ?? [];
      const converted = dbMessages.map(dbMessageToUiMessage);
      setMessages(converted);
      setIsSessionLocked(result?.sessionMeta?.isLocked === true);
    }).catch((err) => {
      if (cancelled) return;
      // SESSION_USER_MISMATCH = logged-in user's localStorage has a stale guest sessionId.
      // Clear it so the next question creates a fresh session instead of hitting a 403.
      if (err.code === 'SESSION_USER_MISMATCH') {
        clearSessionId();
        setSessionId('');
      }
      setMessages([]);
    }).finally(() => {
      if (!cancelled) setIsHistoryLoading(false);
    });

    return () => { cancelled = true; };
  }, [isAuthLoading]);

  // Load study map on mount
  useEffect(() => {
    let isMounted = true;
    fetchStudyMap()
      .then((map) => { if (isMounted) { setStudyMap(map); setSelectedChapterId(null); } })
      .catch((err) => { if (isMounted) setError(err.message); })
      .finally(() => { if (isMounted) setIsStudyMapLoading(false); });
    return () => { isMounted = false; };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isAsking]);

  // Derive full chapter object from selected chapter ID
  const selectedChapter = useMemo(() => {
    const subjects = studyMap?.focusStudy?.subjects || [];
    for (const subject of subjects) {
      for (const section of subject.sections || []) {
        const chapter = (section.chapters || []).find((c) => c.id === selectedChapterId);
        if (chapter) return { ...chapter, sectionTitle: section.title, subjectTitle: subject.title };
      }
    }
    return null;
  }, [selectedChapterId, studyMap]);

  // Find chapter by ID — used when user selects a chapter from FocusModal
  const findChapterById = (chapterId) => {
    const subjects = studyMap?.focusStudy?.subjects || [];
    for (const subject of subjects) {
      for (const section of subject.sections || []) {
        const chapter = (section.chapters || []).find((c) => c.id === chapterId);
        if (chapter) return { ...chapter, sectionTitle: section.title, subjectTitle: subject.title };
      }
    }
    return null;
  };

  const handleFocusChapterSelect = (chapterId) => {
    const nextChapter = findChapterById(chapterId);
    setSelectedChapterId(chapterId);
    setStudyMode(STUDY_MODES.focus);
    setIsFocusModalOpen(false);
    setError('');
    if (nextChapter) {
      setMessages((prev) => [...prev, createFocusMessage(nextChapter)]);
    }
  };

  const handleClearFocus = () => {
    setStudyMode(STUDY_MODES.global);
    setSelectedChapterId(null);
    setError('');
  };

  const handleNewChat = useCallback(() => {
    // Guests who have had at least 1 turn must log in to start a new chat (history won't be saved otherwise)
    if (!isLoggedIn && getGuestTurnCount() >= 1) {
      setGuestLimitModal({ open: true, trigger: 'new_chat' });
      return;
    }

    controllerRef.current?.abort();
    clearTimeout(timeoutRef.current);
    controllerRef.current = null;

    clearSessionId();
    setSessionId('');
    setIsSessionLocked(false);
    setIsHistoryLoading(false);    // BUG-3 FIX: prevent stuck loading if switch was in progress
    isSwitchingRef.current = false; // BUG-2 FIX: release abort guard

    setMessages([]);
    setStudyMode(STUDY_MODES.global);
    setSelectedChapterId(null);
    setError('');
    setIsAsking(false);
    refresh();
  }, [refresh, isLoggedIn]);

  const handleAsk = useCallback(async (question, requestMode) => {
    const cleanQuestion = question.trim();
    const currentMode = requestMode ?? studyModeRef.current;

    if (!cleanQuestion || controllerRef.current) return;

    if (currentMode === STUDY_MODES.focus && !selectedChapterIdRef.current) {
      setError('Focus mode ke liye pehle chapter select karo.');
      return;
    }

    // Pre-flight guest limit check (frontend gate before API call)
    if (!isLoggedIn && isGuestLimitReached()) {
      setIsGuestLimited(true);
      setGuestLimitModal({ open: true, trigger: 'turn_limit' });
      return;
    }

    setError('');
    setIsAsking(true);
    setMessages((prev) => [...prev, createQuestionMessage(cleanQuestion)]);

    const controller = new AbortController();
    controllerRef.current = controller;
    wasTimeoutAbortRef.current = false;

    timeoutRef.current = setTimeout(() => {
      wasTimeoutAbortRef.current = true;
      controller.abort();
    }, 60000);

    try {
      let isFirstUpdate = true;
      const tempMessageId = crypto.randomUUID();

      const payload = await askTutor(
        {
          question: cleanQuestion,
          studyMode: currentMode,
          chapterId: selectedChapterIdRef.current,
          sessionId: sessionIdRef.current,
        },
        controller.signal,
        (partialData) => {
          if (isFirstUpdate) {
            setIsAsking(false); // hide thinking dots early
            isFirstUpdate = false;
            setMessages((prev) => [
              ...prev,
              { id: tempMessageId, role: 'zuno', ...partialData, status: partialData.status || 'answered' }
            ]);
          } else {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempMessageId
                  ? { ...msg, ...partialData, status: partialData.status || 'answered' }
                  : msg
              )
            );
          }
        }
      );

      const backendSessionId = payload.session?.sessionId;
      if (backendSessionId && backendSessionId !== sessionIdRef.current) {
        setSessionId(backendSessionId);
        saveSessionId(backendSessionId);
      }

      const isNowLocked = payload.session?.isLocked === true;
      
      setMessages((prev) => {
        const withoutTemp = isFirstUpdate ? prev : prev.filter(m => m.id !== tempMessageId);
        if (isNowLocked) {
          return [...withoutTemp, createAnswerMessage(payload), createLockSystemMessage()];
        }
        return [...withoutTemp, createAnswerMessage(payload)];
      });
      
      if (isNowLocked) {
        setIsSessionLocked(true);
      }

      // Increment guest turn counter after a confirmed successful response
      if (!isLoggedIn) {
        const newCount = incrementGuestTurnCount();
        if (newCount >= GUEST_TURN_LIMIT) {
          setIsGuestLimited(true);
          setGuestLimitModal({ open: true, trigger: 'turn_limit' });
        }
      }

      refresh(); // reorder sidebar after every successful response
    } catch (askError) {
      // BUG-2 FIX: session switch caused this abort — do not pollute new session
      if (isSwitchingRef.current) return;

      // Backend safety net fired (e.g. localStorage was cleared) — sync frontend state
      if (askError.code === 'GUEST_LIMIT_REACHED') {
        setGuestTurnCountToLimit();
        setIsGuestLimited(true);
        setGuestLimitModal({ open: true, trigger: 'turn_limit' });
        return;
      }

      if (askError.name === 'AbortError' || askError.name === 'CanceledError') {
        const answer = wasTimeoutAbortRef.current
          ? 'Zuno thoda slow hai abhi — connection slow ho sakta hai ya server busy hai. Ek baar aur try karo!'
          : 'Request cancel kar di. Koi aur sawaal poochho!';

        if (!isFirstUpdate) {
          // Streaming had started — update the partial message in-place instead of appending.
          // User keeps the partial content and sees it's incomplete.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempMessageId
                ? { ...m, status: 'cancelled', answer: m.answer || answer }
                : m
            )
          );
        } else {
          setMessages((prev) => [...prev, createAnswerMessage({ status: 'cancelled', answer, sources: [] })]);
        }
      } else {
        if (!isFirstUpdate) {
          // Streaming had started — mark partial message as errored, preserve what arrived.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempMessageId
                ? { ...m, status: 'error' }
                : m
            )
          );
        } else {
          setMessages((prev) => [...prev, createAnswerMessage({ status: 'error', answer: askError.message, sources: [] })]);
        }
      }
    } finally {
      clearTimeout(timeoutRef.current);
      controllerRef.current = null;
      setIsAsking(false);
    }
  }, [isLoggedIn]);

  const handleCancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const handleGuestLimitLogin = useCallback(() => {
    setGuestLimitModal((m) => ({ ...m, open: false }));
    navigate('/login');
  }, [navigate]);

  const handleGuestLimitRegister = useCallback(() => {
    setGuestLimitModal((m) => ({ ...m, open: false }));
    navigate('/register');
  }, [navigate]);

  const handleOpenGuestLimitModal = useCallback(() => {
    setGuestLimitModal({ open: true, trigger: 'turn_limit' });
  }, []);

  const handleSwitchToGlobal = async (question) => {
    setStudyMode(STUDY_MODES.global);
    await handleAsk(question, STUDY_MODES.global);
  };

  const handleSessionSwitch = useCallback(async (session) => {
    if (session.sessionId === sessionId) return; // already on this session

    // BUG-2 FIX: signal handleAsk catch block — do not append cancel message
    isSwitchingRef.current = true;

    // Abort any in-flight request
    controllerRef.current?.abort();
    clearTimeout(timeoutRef.current);
    controllerRef.current = null;

    // Immediate UI reset
    setIsSessionLocked(false);
    setSessionId(session.sessionId);
    saveSessionId(session.sessionId);
    setStudyMode(session.sessionType === 'focus' ? STUDY_MODES.focus : STUDY_MODES.global);
    setSelectedChapterId(session.sessionType === 'focus' ? (session.currentChapterId || null) : null);
    setError('');
    setIsAsking(false);

    // BUG-3 FIX: show skeleton while fetching new session's history
    setIsHistoryLoading(true);
    setMessages([]);

    try {
      const result = await fetchSessionHistory(session.sessionId);

      // Stale check: user may have switched again while fetch was in-flight
      if (session.sessionId !== sessionIdRef.current) return;

      const dbMessages = result?.messages ?? [];
      const converted = dbMessages.map(dbMessageToUiMessage);
      const displayMessages = converted;

      // Show cap notice if history is at the 30-message limit
      if (dbMessages.length === 30) {
        displayMessages.unshift(createCapNoticeMessage());
      }

      setMessages(displayMessages);
      setIsSessionLocked(result?.sessionMeta?.isLocked === true);
    } catch {
      if (session.sessionId !== sessionIdRef.current) return;
      setMessages([]);
      showToast('Session load nahi hui. Dobara try karo.', 'error'); // Missing-1 FIX
    } finally {
      if (session.sessionId === sessionIdRef.current) {
        setIsHistoryLoading(false); // BUG-3 FIX
      }
      isSwitchingRef.current = false; // BUG-2 FIX: release abort guard
    }
  }, [sessionId, showToast]);

  return (
    <Box
      component="main"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'var(--bg-page)',
        overflow: 'hidden',
      }}
    >
      <Topbar
        theme={theme}
        onToggleTheme={toggleTheme}
        selectedChapter={selectedChapter}
        isFocusLoading={isStudyMapLoading}
        onOpenFocus={() => setIsFocusModalOpen(true)}
        onClearFocus={handleClearFocus}
        onNewChat={handleNewChat}
        isSessionLocked={isSessionLocked}
      />

      {/* key=sessionId: when session changes, ErrorBoundary remounts and clears any crashed state */}
      <ErrorBoundary key={sessionId}>
        {/* Chat area — scrollable */}
        <Box
          component="section"
          aria-live="polite"
          sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 }, py: 2 }}
        >
          <Box sx={{
            maxWidth: 'var(--chat-max-width)',
            mx: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}>
            {isHistoryLoading ? (
              <ChatMessage
                message={{ id: 'loading', role: 'zuno', answer: '', status: 'thinking', sources: [] }}
              />
            ) : messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onSwitchToGlobal={handleSwitchToGlobal}
              />
            ))}
            {isAsking && (
              <ChatMessage
                message={{ id: 'thinking', role: 'zuno', answer: '', status: 'thinking', sources: [] }}
              />
            )}
            <div ref={chatEndRef} />
          </Box>
        </Box>

        {/* Input zone — fixed at bottom */}
        <Box sx={{
          flexShrink: 0,
          bgcolor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          px: { xs: 2, sm: 3 },
          py: 1.5,
        }}>
          <Box sx={{ maxWidth: 'var(--chat-max-width)', mx: 'auto' }}>
            <StatusNotice error={error} />
            <AskBar
              disabled={isAsking || isHistoryLoading}
              isLocked={isSessionLocked}
              isGuestLimited={isGuestLimited}
              onGuestLimitClick={handleOpenGuestLimitModal}
              onAsk={handleAsk}
              onCancel={handleCancel}
              studyMode={studyMode}
            />
          </Box>
        </Box>
      </ErrorBoundary>

      <FocusModal
        isOpen={isFocusModalOpen}
        isLoading={isStudyMapLoading}
        selectedChapterId={selectedChapterId}
        studyMap={studyMap}
        onClose={() => setIsFocusModalOpen(false)}
        onSelectChapter={handleFocusChapterSelect}
      />

      <HistoryPanel
        isLoggedIn={isLoggedIn}
        isAuthLoading={isAuthLoading}
        sessions={sessions}
        isLoading={sessionsLoading}
        activeSessionId={sessionId}
        isSessionLocked={isSessionLocked}
        onSessionSelect={handleSessionSwitch}
        onNewChat={handleNewChat}
        fetchOnce={fetchOnce}
        onSessionDelete={(deletedId) => {
          // If deleted session was active, start fresh
          if (deletedId === sessionId) handleNewChat();
          refresh();
        }}
        onSessionRename={() => refresh()}
      />

      <GuestLimitModal
        open={guestLimitModal.open}
        trigger={guestLimitModal.trigger}
        onLogin={handleGuestLimitLogin}
        onRegister={handleGuestLimitRegister}
        onClose={() => setGuestLimitModal((m) => ({ ...m, open: false }))}
      />

      <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
    </Box>
  );
}

export default ChatPage;
