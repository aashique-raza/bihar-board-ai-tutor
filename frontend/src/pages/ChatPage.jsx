import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { useLocation, useNavigate } from 'react-router-dom';
import { askTutor, fetchSessionHistory, fetchStudyMap, fetchChapterProgress, chapterProgressAction } from '../api/tutorApi.js';
import AskBar from '../components/AskBar.jsx';
import ChatMessage from '../components/ChatMessage.jsx';
import FocusModal from '../components/FocusModal.jsx';
import FocusProgressHeader from '../components/FocusProgressHeader.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import Toast from '../components/Toast.jsx';
import Topbar from '../components/Topbar.jsx';
import { STUDY_MODES } from '../constants/studyModes.js';
import { clearSessionId, getSavedSessionId, saveSessionId } from '../utils/session.js';
import { findFirstChapter } from '../utils/studyMap.js';
import { useChapterTopics } from '../hooks/useChapterTopics.js';
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
import SessionBar from '../components/SessionBar.jsx';
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
  answer: 'Session yahan tak. Nayi chat mein aage badho.',
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
  answer: `Focus on. Ab hum "${chapter.title}" padhenge. Aap chaho toh main seedha chapter start karu, ya aap iska overview janna chahte ho?`,
  sources: [],
  suggestedActions: [
    { type: 'next_topic', label: 'Chapter shuru karein' },
    { type: 'related_concept', label: 'Chapter overview batao' }
  ]
});

// Builds a "roadmap" message purely from already-loaded client state — no backend/LLM
// call. Shows a small window around the student's current position (mirrors the
// windowing FocusProgressHeader's tooltip already uses) rather than the full topic
// list, since some chapters have 40+ core topics.
const buildRoadmapMessage = (topics, currentTopicId, completedTopicIds) => {
  if (!Array.isArray(topics) || topics.length === 0) {
    return {
      id: crypto.randomUUID(),
      role: 'zuno',
      sections: [{ heading: '', content: 'Roadmap abhi load nahi ho paayi. Thodi der mein try karo.' }],
      sources: [],
    };
  }

  const currentIndex = topics.findIndex((t) => t.topicId === currentTopicId);
  const anchor = currentIndex === -1 ? 0 : currentIndex;
  const windowTopics = topics.slice(Math.max(0, anchor - 2), Math.min(topics.length, anchor + 4));

  const sections = [
    { heading: '', content: `${completedTopicIds.length} / ${topics.length} topics complete` },
    ...windowTopics.map((t) => {
      const isDone = completedTopicIds.includes(t.topicId);
      const isCurrent = t.topicId === currentTopicId;
      const icon = isDone ? '✅' : isCurrent ? '🟢' : '🔒';
      return { heading: '', content: `${icon} ${t.title}` };
    }),
  ];

  return { id: crypto.randomUUID(), role: 'zuno', sections, sources: [] };
};

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
      // Clear React Router state from browser history to prevent toast on F5 refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const [studyMode, setStudyMode] = useState(STUDY_MODES.global);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  
  // Focus Progress State
  const [completedTopicIds, setCompletedTopicIds] = useState([]);
  const [currentTopicId, setCurrentTopicId] = useState(null);
  // ISSUE-1 (FOCUS_MODE_PROGRESS_FIX_PLAN.md): separate "engagement" stat — how many
  // doubt/explain-more turns the student has had in this chapter. Deliberately never
  // blended into completedTopicIds/progressPercent — see the plan file for reasoning.
  const [engagementCount, setEngagementCount] = useState(0);
  // ISSUE-2 (FOCUS_MODE_PROGRESS_FIX_PLAN.md): real ChapterProgress.status, so
  // FocusProgressHeader never has to guess chapter-complete from array lengths.
  const [chapterStatus, setChapterStatus] = useState(null);

  // Loaded for the "roadmap" suggested action — built purely client-side, no LLM call.
  const { topics: chapterTopics } = useChapterTopics(selectedChapterId);

  const [studyMap, setStudyMap] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [sessionId, setSessionId] = useState(() => getSavedSessionId());
  const [isStudyMapLoading, setIsStudyMapLoading] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [isGuestLimited, setIsGuestLimited] = useState(false);
  const [guestLimitModal, setGuestLimitModal] = useState({ open: false, trigger: 'turn_limit' });
  const [historyOpen, setHistoryOpen] = useState(false);

  const chatEndRef = useRef(null);
  const historyTriggerRef = useRef(null);
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
      const converted = dbMessages.map(dbMessageToUiMessage).map(msg => ({ ...msg, isNew: false }));
      setMessages(converted);
      setIsSessionLocked(result?.sessionMeta?.isLocked === true);

      // Restore focus mode state from session meta (fixes refresh-loss bug)
      const meta = result?.sessionMeta;
      if (meta?.sessionType === 'focus' && meta.currentChapterId) {
        setStudyMode(STUDY_MODES.focus);
        setSelectedChapterId(meta.currentChapterId);
        setCompletedTopicIds(meta.completedTopicIds || []);
        setCurrentTopicId(meta.currentTopicId ?? null);
        setEngagementCount((meta.totalDoubtsAsked || 0) + (meta.totalExplainMoreCount || 0));
        setChapterStatus(meta.chapterStatus ?? null);
      }
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

  // Current session title for SessionBar center label
  const currentSessionTitle = useMemo(() => {
    if (!sessionId || !sessions.length) return null;
    const active = sessions.find((s) => s.sessionId === sessionId);
    if (!active) return null;
    return active.title === 'New Chat' && active.previewText ? active.previewText : active.title;
  }, [sessions, sessionId]);

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

  const handleFocusChapterSelect = async (chapterId) => {
    const nextChapter = findChapterById(chapterId);

    // Auto-start a new session if we are already in an active chat.
    // This prevents a 'global' session from being illegally converted to a 'focus' session.
    if (messages.length > 0) {
      clearSessionId();
      setSessionId('');
      setIsSessionLocked(false);
      setMessages([]);
      setIsAsking(false);
      setCompletedTopicIds([]);
      setCurrentTopicId(null);
      setEngagementCount(0);
      setChapterStatus(null);
      refresh();
    }

    setSelectedChapterId(chapterId);
    setStudyMode(STUDY_MODES.focus);
    setIsFocusModalOpen(false);
    setError('');

    if (!nextChapter) return;

    // Fetch real cross-session progress so the welcome message + chips reflect where
    // the student actually left off, instead of always showing the generic "start"
    // text regardless of progress. Falls back to the static message on any failure.
    let progressData = null;
    try {
      progressData = await fetchChapterProgress(chapterId);
    } catch {
      progressData = null;
    }

    // Staleness guard: the student may have picked a different chapter, or left focus
    // mode entirely, while this fetch was in flight — don't apply a stale result.
    if (selectedChapterIdRef.current !== chapterId || studyModeRef.current !== STUDY_MODES.focus) {
      return;
    }

    // Sync the actual progress pointers too — not just the welcome text. Without this,
    // the header and the "roadmap" action would keep showing the pre-fetch [] /null
    // state (everything locked, 0%) until the next ask() response corrected it.
    if (progressData?.progress) {
      setCompletedTopicIds(progressData.progress.completedTopicIds || []);
      setCurrentTopicId(progressData.progress.currentTopicId || null);
      setEngagementCount(
        (progressData.progress.totalDoubtsAsked || 0) + (progressData.progress.totalExplainMoreCount || 0)
      );
      setChapterStatus(progressData.progress.status || null);
    }

    const recommendation = progressData?.recommendation;
    const focusMessage = recommendation
      ? {
          id: crypto.randomUUID(),
          role: 'zuno',
          status: 'focus_selected',
          answer: recommendation.message,
          sources: [],
          suggestedActions: recommendation.chips || [],
        }
      : createFocusMessage(nextChapter);

    setMessages([{ ...focusMessage, isNew: true }]);
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
    setMessages((prev) => [...prev, { ...createQuestionMessage(cleanQuestion), isNew: true }]);

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
              { id: tempMessageId, role: 'zuno', ...partialData, status: partialData.status || 'answered', isNew: true }
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
      
      // Update Focus progress from the response's chapterProgress payload —
      // ChapterProgress is the single source of truth for topic progress now,
      // not session.completedTopicIds/currentTopicId (removed in the BUG-1 fix).
      if (payload.chapterProgress) {
        setCompletedTopicIds(payload.chapterProgress.completedTopicIds ?? []);
        setCurrentTopicId(payload.chapterProgress.currentTopicId ?? null);
        setEngagementCount(
          (payload.chapterProgress.totalDoubtsAsked ?? 0) + (payload.chapterProgress.totalExplainMoreCount ?? 0)
        );
        setChapterStatus(payload.chapterProgress.status ?? null);
      }

      // Bust the useChapterProgress hook cache so FocusModal shows fresh data next open
      if (payload.chapterProgress?.chapterId || selectedChapterIdRef.current) {
        const updatedChapterId = payload.chapterProgress?.chapterId ?? selectedChapterIdRef.current;
        window.dispatchEvent(
          new CustomEvent('chapter-progress-updated', { detail: { chapterId: updatedChapterId } })
        );
      }

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
          setMessages((prev) => [...prev, { ...createAnswerMessage({ status: 'cancelled', answer, sources: [] }), isNew: true }]);
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
          setMessages((prev) => [...prev, { ...createAnswerMessage({ status: 'error', answer: askError.message, sources: [] }), isNew: true }]);
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
    let q = question;
    if (!q) {
      const lastStudentMsg = [...messages].reverse().find(m => m.role === 'student');
      if (lastStudentMsg) q = lastStudentMsg.answer;
    }
    if (!q) return;

    setStudyMode(STUDY_MODES.global);
    await handleAsk(q, STUDY_MODES.global);
  };

  const handleSuggestedAction = useCallback(async (action) => {
    if (controllerRef.current) return; // block if request already in-flight

    switch (action.type) {
      case 'switch_chapter':
        setIsFocusModalOpen(true);
        break;

      case 'global_mode':
        handleClearFocus();
        break;

      // These come from buildRecommendation() on the backend. The label shown to the
      // student varies by progress state, but we always send this same proven-safe
      // canonical phrase as the actual question — decouples display copy from
      // decider-intent routing so a future wording change can never silently
      // misclassify the request.
      // 'next_step' = genuinely starting the chapter (not_started/revising states) —
      // "Chapter shuru karein" is accurate here.
      case 'next_step':
        handleAsk('Chapter shuru karein', studyModeRef.current);
        break;
      // 'continue_step' = resuming mid-chapter (in_progress state). Must NOT reuse
      // "Chapter shuru karein" — the backend advances correctly either way (NEXT_STEP
      // always reads chapterProgress.currentTopicId regardless of phrasing), but the
      // student's own message would misleadingly read "start the chapter" when they
      // clicked "continue". "Aage badhao" is decider-safe (its first NEXT_STEP example).
      case 'continue_step':
        handleAsk('Aage badhao', studyModeRef.current);
        break;
      // Backend-guaranteed advance chip (see sanitizeSuggestedActions in
      // step7.saveAndRespond.js) — always injected for CONCEPT_QUESTION/
      // EXPLAIN_MORE/EXAM_INFO/mid-chapter NEXT_STEP turns in Focus Mode, so
      // it must route the same decider-safe way as 'continue_step', not fall
      // through to the generic label-as-question default.
      case 'next_topic':
        handleAsk('Aage badhao', studyModeRef.current);
        break;
      case 'chapter_overview':
        handleAsk('Chapter overview batao', studyModeRef.current);
        break;

      // Discards progress and starts over — needs a backend reset BEFORE asking,
      // otherwise NEXT_STEP would resolve from the old (unreset) topic pointer.
      case 'restart_topic':
      case 'revise_chapter': {
        const chapterId = selectedChapterIdRef.current;
        if (!chapterId) return;
        const resetStatus = action.type === 'revise_chapter' ? 'revising' : 'in_progress';
        try {
          await chapterProgressAction(chapterId, 'reset', { status: resetStatus });
          window.dispatchEvent(new CustomEvent('chapter-progress-updated', { detail: { chapterId } }));
          handleAsk('Chapter shuru karein', studyModeRef.current);
        } catch {
          showToast('Progress reset nahi hua. Dobara try karo.', 'error');
        }
        break;
      }

      // Pure frontend — built from already-loaded topics/progress, no backend/LLM call.
      case 'roadmap': {
        const roadmapMessage = buildRoadmapMessage(chapterTopics, currentTopicId, completedTopicIds);
        setMessages((prev) => [...prev, { ...roadmapMessage, isNew: true }]);
        break;
      }

      default:
        handleAsk(action.label, studyModeRef.current);
    }
  }, [handleAsk, handleClearFocus, showToast, chapterTopics, currentTopicId, completedTopicIds]);

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
    // Optional: optimistic set if session object has them, otherwise we will set them after fetch
    setStudyMode(session.sessionType === 'focus' ? STUDY_MODES.focus : STUDY_MODES.global);
    if (session.currentChapterId) {
      setSelectedChapterId(session.currentChapterId);
    }
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
      const displayMessages = dbMessages.map(dbMessageToUiMessage).map(msg => ({ ...msg, isNew: false }));

      // Show cap notice if history is at the 30-message limit
      if (dbMessages.length === 30) {
        displayMessages.unshift(createCapNoticeMessage());
      }

      setMessages(displayMessages);
      setIsSessionLocked(result?.sessionMeta?.isLocked === true);
      
      if (result?.sessionMeta) {
        setStudyMode(result.sessionMeta.sessionType === 'focus' ? STUDY_MODES.focus : STUDY_MODES.global);
        if (result.sessionMeta.sessionType === 'focus' && result.sessionMeta.currentChapterId) {
          setSelectedChapterId(result.sessionMeta.currentChapterId);
          setCompletedTopicIds(result.sessionMeta.completedTopicIds || []);
          setCurrentTopicId(result.sessionMeta.currentTopicId || null);
          setEngagementCount(
            (result.sessionMeta.totalDoubtsAsked || 0) + (result.sessionMeta.totalExplainMoreCount || 0)
          );
          setChapterStatus(result.sessionMeta.chapterStatus ?? null);
        } else if (result.sessionMeta.sessionType === 'global') {
          setSelectedChapterId(null);
          setCompletedTopicIds([]);
          setCurrentTopicId(null);
          setEngagementCount(0);
          setChapterStatus(null);
        }
      }
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

      {studyMode === STUDY_MODES.focus && selectedChapterId && (
        <FocusProgressHeader
          chapterId={selectedChapterId}
          currentTopicId={currentTopicId}
          completedTopicIds={completedTopicIds}
          engagementCount={engagementCount}
          status={chapterStatus}
        />
      )}

      {/* key=sessionId: when session changes, ErrorBoundary remounts and clears any crashed state */}
      <ErrorBoundary key={sessionId}>
        {/* Chat area — scrollable */}
        <Box
          component="main"
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
            ) : messages.length === 0 ? (
              studyMode === STUDY_MODES.focus && selectedChapterId && selectedChapter ? (
                <div className="chat-empty-state">
                  <div className="chat-empty-illustration">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="9" stroke="url(#focus-grad)" strokeWidth="2.2"/>
                      <circle cx="12" cy="12" r="4" fill="url(#focus-grad)"/>
                      <defs>
                        <linearGradient id="focus-grad" x1="1" y1="3" x2="23" y2="21" gradientUnits="userSpaceOnUse">
                          <stop stopColor="var(--primary-accent, #F0A500)"/>
                          <stop offset="1" stopColor="#C6570F"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div className="chat-empty-title">Focus Mode: {selectedChapter.title}</div>
                  <div className="chat-empty-sub">Pehla sawaal poochho ya chapter seedha start karo!</div>
                  <div className="chat-empty-chips">
                    <button className="chat-empty-chip" onClick={() => handleAsk('Chapter shuru karein', STUDY_MODES.focus)}>▶ Chapter shuru karein</button>
                    <button className="chat-empty-chip" onClick={() => handleAsk('Is chapter ka overview batao', STUDY_MODES.focus)}>📖 Overview batao</button>
                    <button className="chat-empty-chip" onClick={() => handleAsk('Koi important question poochho is chapter se', STUDY_MODES.focus)}>❓ Exam question dikhao</button>
                  </div>
                </div>
              ) : (
                <div className="chat-empty-state">
                  <div className="chat-empty-illustration">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 3L1 9L5 11.18V17.18L12 21L19 17.18V11.18L21 10.09V17H23V9L12 3ZM18.82 9L12 12.72L5.18 9L12 5.28L18.82 9ZM17 15.99L12 18.72L7 15.99V12.27L12 15L17 12.27V15.99Z" fill="url(#zuno-grad)"/>
                      <defs>
                        <linearGradient id="zuno-grad" x1="1" y1="3" x2="23" y2="21" gradientUnits="userSpaceOnUse">
                          <stop stopColor="var(--primary-accent, #F0A500)"/>
                          <stop offset="1" stopColor="#C6570F"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div className="chat-empty-title">Zuno: Aapka AI Tutor</div>
                  <div className="chat-empty-sub">Bina dare sawaal poochho. Hum milkar exam fodenge!</div>
                  <div className="chat-empty-chips">
                    <button className="chat-empty-chip" onClick={() => handleAsk('Newton ka pehla niyam kya hai?')}>⚡ Newton ka pehla niyam kya hai?</button>
                    <button className="chat-empty-chip" onClick={() => handleAsk('Carbon dioxide kaise banta hai?')}>🧪 Carbon dioxide kaise banta hai?</button>
                    <button className="chat-empty-chip" onClick={() => handleAsk('Photosynthesis kya hota hai?')}>🌿 Photosynthesis kya hota hai?</button>
                  </div>
                </div>
              )
            ) : messages.map((message, index) => {
              let question = message.question;
              if (!question && message.role === 'zuno') {
                for (let i = index - 1; i >= 0; i--) {
                  if (messages[i].role === 'student') {
                    question = messages[i].answer;
                    break;
                  }
                }
              }
              return (
                <ChatMessage
                  key={message.id}
                  message={{ ...message, question }}
                  onSwitchToGlobal={handleSwitchToGlobal}
                  onSuggestedAction={handleSuggestedAction}
                />
              );
            })}
            {isAsking && (
              <ChatMessage
                message={{ id: 'thinking', role: 'zuno', answer: '', status: 'thinking', sources: [] }}
              />
            )}
            <div ref={chatEndRef} />
          </Box>
        </Box>

        {/* Session bar — quick access to history + new chat */}
        <SessionBar
          sessionCount={isLoggedIn ? sessions.length : 0}
          currentSessionTitle={currentSessionTitle}
          triggerRef={historyTriggerRef}
          onOpenHistory={() => setHistoryOpen(true)}
          onNewChat={handleNewChat}
        />

        {/* Input zone — fixed at bottom */}
        <Box sx={{
          flexShrink: 0,
          bgcolor: 'var(--bg-surface)',
          px: { xs: 2, sm: 3 },
          py: 1.5,
        }}>
          <Box sx={{ maxWidth: 'var(--chat-max-width)', mx: 'auto' }}>
            <StatusNotice error={error} />
            <AskBar
              disabled={isAsking}
              isHistoryLoading={isHistoryLoading}
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
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        triggerRef={historyTriggerRef}
        isLoggedIn={isLoggedIn}
        isAuthLoading={isAuthLoading}
        sessions={sessions}
        isLoading={sessionsLoading}
        activeSessionId={sessionId}
        onSessionSelect={handleSessionSwitch}
        onNewChat={handleNewChat}
        fetchOnce={fetchOnce}
        onSessionDelete={(deletedId) => {
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
