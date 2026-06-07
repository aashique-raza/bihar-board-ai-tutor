import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { askTutor, fetchStudyMap } from './api/tutorApi.js';
import AppHeader from './components/AppHeader.jsx';
import AskBar from './components/AskBar.jsx';
import ChatMessage from './components/ChatMessage.jsx';
import FocusModal from './components/FocusModal.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusNotice from './components/StatusNotice.jsx';
import { STUDY_MODES } from './constants/studyModes.js';
import { getSavedSessionId, saveSessionId } from './utils/session.js';
import { findFirstChapter } from './utils/studyMap.js';

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

function App() {
  const [studyMode, setStudyMode] = useState(STUDY_MODES.global);
  const [studyMap, setStudyMap] = useState(null);
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [sessionId, setSessionId] = useState(() => getSavedSessionId());
  const [isStudyMapLoading, setIsStudyMapLoading] = useState(true);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef(null);
  const controllerRef = useRef(null);
  const timeoutRef = useRef(null);
  const sessionIdRef = useRef(sessionId);
  const selectedChapterIdRef = useRef(selectedChapterId);
  const studyModeRef = useRef(studyMode);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { selectedChapterIdRef.current = selectedChapterId; }, [selectedChapterId]);
  useEffect(() => { studyModeRef.current = studyMode; }, [studyMode]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchStudyMap()
      .then((map) => {
        if (!isMounted) {
          return;
        }

        setStudyMap(map);
        setSelectedChapterId(findFirstChapter(map)?.id || '');
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsStudyMapLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isAsking]);

  const selectedChapter = useMemo(() => {
    const subjects = studyMap?.focusStudy?.subjects || [];

    for (const subject of subjects) {
      for (const section of subject.sections || []) {
        const chapter = (section.chapters || []).find(
          (item) => item.id === selectedChapterId
        );

        if (chapter) {
          return {
            ...chapter,
            sectionTitle: section.title,
            subjectTitle: subject.title,
          };
        }
      }
    }

    return null;
  }, [selectedChapterId, studyMap]);

  const findChapterById = (chapterId) => {
    const subjects = studyMap?.focusStudy?.subjects || [];

    for (const subject of subjects) {
      for (const section of subject.sections || []) {
        const chapter = (section.chapters || []).find(
          (item) => item.id === chapterId
        );

        if (chapter) {
          return {
            ...chapter,
            sectionTitle: section.title,
            subjectTitle: subject.title,
          };
        }
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
      setMessages((currentMessages) => [
        ...currentMessages,
        createFocusMessage(nextChapter),
      ]);
    }
  };

  const handleClearFocus = () => {
    setStudyMode(STUDY_MODES.global);
    setError('');
  };

  const handleAsk = useCallback(async (question, requestMode) => {
    const cleanQuestion = question.trim();
    const currentMode = requestMode ?? studyModeRef.current;

    if (!cleanQuestion || controllerRef.current) {
      return;
    }

    if (currentMode === STUDY_MODES.focus && !selectedChapterIdRef.current) {
      setError('Focus mode ke liye pehle chapter select karo.');
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    timeoutRef.current = setTimeout(() => {
      controllerRef.current?.abort();
    }, 60000);

    setError('');
    setIsAsking(true);
    setMessages((currentMessages) => [
      ...currentMessages,
      createQuestionMessage(cleanQuestion),
    ]);

    try {
      const answerPayload = await askTutor(
        {
          question: cleanQuestion,
          studyMode: currentMode,
          chapterId: selectedChapterIdRef.current,
          sessionId: sessionIdRef.current,
        },
        controller.signal,
      );
      clearTimeout(timeoutRef.current);
      const nextSessionId = answerPayload.session?.sessionId;

      if (nextSessionId && nextSessionId !== sessionIdRef.current) {
        saveSessionId(nextSessionId);
        setSessionId(nextSessionId);
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        createAnswerMessage(answerPayload),
      ]);
    } catch (askError) {
      clearTimeout(timeoutRef.current);
      if (askError.name === 'AbortError') {
        setError('Zuno thoda busy hai abhi, thodi der baad try karo.');
      } else {
        setError(askError.message);
      }
    } finally {
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
    <Box className="app-shell" component="main">
      <Sidebar />
      <Box className="app-card" component="section" aria-label="Zuno tutor app">
        <AppHeader
          activeMode={studyMode}
          isFocusLoading={isStudyMapLoading}
          selectedChapter={selectedChapter}
          onClearFocus={handleClearFocus}
          onOpenFocus={() => setIsFocusModalOpen(true)}
        />

        <Box className="chat-panel" component="section" aria-live="polite">
          <div className="message-list">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onSwitchToGlobal={handleSwitchToGlobal}
              />
            ))}
            {isAsking && (
              <ChatMessage
                message={{
                  id: 'thinking',
                  role: 'zuno',
                  answer: '',
                  status: 'thinking',
                  sources: [],
                }}
              />
            )}
            <div ref={chatEndRef} />
          </div>
        </Box>

        <StatusNotice error={error} />
        <AskBar disabled={isAsking} onAsk={handleAsk} onCancel={handleCancel} studyMode={studyMode} />
      </Box>

      <FocusModal
        isOpen={isFocusModalOpen}
        isLoading={isStudyMapLoading}
        selectedChapterId={selectedChapterId}
        studyMap={studyMap}
        onClose={() => setIsFocusModalOpen(false)}
        onSelectChapter={handleFocusChapterSelect}
      />
    </Box>
  );
}

export default App;
