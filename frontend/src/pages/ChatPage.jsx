import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { useLocation } from 'react-router-dom';
import { askTutor, fetchStudyMap } from '../api/tutorApi.js';
import AskBar from '../components/AskBar.jsx';
import ChatMessage from '../components/ChatMessage.jsx';
import FocusModal from '../components/FocusModal.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import Toast from '../components/Toast.jsx';
import Topbar from '../components/Topbar.jsx';
import { STUDY_MODES } from '../constants/studyModes.js';
import { getSavedSessionId, saveSessionId } from '../utils/session.js';
import { findFirstChapter } from '../utils/studyMap.js';
import { useToast } from '../hooks/useToast.js';

// --- Message factory helpers ---

const createWelcomeMessage = () => ({
  id: 'welcome',
  role: 'zuno',
  status: 'intro',
  answer: 'Main Zuno hoon, tumhara Class 10 personal tutor. Aaj jis topic par atke ho, wahi se start karte hain.',
  sources: [],
});

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
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    if (location.state?.toastSuccess) {
      showToast(location.state.toastSuccess, 'success');
      window.history.replaceState({}, '', location.pathname);
    }
  }, []);

  const [studyMode, setStudyMode] = useState(STUDY_MODES.global);
  const [studyMap, setStudyMap] = useState(null);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [sessionId, setSessionId] = useState(() => getSavedSessionId());
  const [isStudyMapLoading, setIsStudyMapLoading] = useState(true);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');

  const chatEndRef = useRef(null);
  const controllerRef = useRef(null);
  const timeoutRef = useRef(null);

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

  const handleAsk = useCallback(async (question, requestMode) => {
    const cleanQuestion = question.trim();
    const currentMode = requestMode ?? studyModeRef.current;

    if (!cleanQuestion || controllerRef.current) return;

    if (currentMode === STUDY_MODES.focus && !selectedChapterIdRef.current) {
      setError('Focus mode ke liye pehle chapter select karo.');
      return;
    }

    setError('');
    setIsAsking(true);
    setMessages((prev) => [...prev, createQuestionMessage(cleanQuestion)]);

    const controller = new AbortController();
    controllerRef.current = controller;

    timeoutRef.current = setTimeout(() => controller.abort(), 60000);

    try {
      const payload = await askTutor(
        {
          question: cleanQuestion,
          studyMode: currentMode,
          chapterId: selectedChapterIdRef.current,
          sessionId: sessionIdRef.current,
        },
        controller.signal
      );

      if (payload.sessionId && payload.sessionId !== sessionIdRef.current) {
        setSessionId(payload.sessionId);
        saveSessionId(payload.sessionId);
      }

      setMessages((prev) => [...prev, createAnswerMessage(payload)]);
    } catch (askError) {
      if (askError.name === 'AbortError' || askError.name === 'CanceledError') {
        setMessages((prev) => [...prev, createAnswerMessage({
          status: 'cancelled',
          answer: 'Request cancel kar di gayi.',
          sources: [],
        })]);
      } else {
        setError(askError.message);
      }
    } finally {
      clearTimeout(timeoutRef.current);
      controllerRef.current = null;
      setIsAsking(false);
    }
  }, []);

  const handleCancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const handleSwitchToGlobal = async (question) => {
    setStudyMode(STUDY_MODES.global);
    await handleAsk(question, STUDY_MODES.global);
  };

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
      />

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
          {messages.map((message) => (
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
            disabled={isAsking}
            onAsk={handleAsk}
            onCancel={handleCancel}
            studyMode={studyMode}
          />
        </Box>
      </Box>

      <FocusModal
        isOpen={isFocusModalOpen}
        isLoading={isStudyMapLoading}
        selectedChapterId={selectedChapterId}
        studyMap={studyMap}
        onClose={() => setIsFocusModalOpen(false)}
        onSelectChapter={handleFocusChapterSelect}
      />

      <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
    </Box>
  );
}

export default ChatPage;
