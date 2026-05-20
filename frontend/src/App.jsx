import React, { useEffect, useMemo, useState } from 'react';
import { askTutor, fetchStudyMap } from './api/tutorApi.js';
import AppHeader from './components/AppHeader.jsx';
import AskBar from './components/AskBar.jsx';
import ChapterPicker from './components/ChapterPicker.jsx';
import ChatMessage from './components/ChatMessage.jsx';
import EmptyState from './components/EmptyState.jsx';
import ModeSwitch from './components/ModeSwitch.jsx';
import StatusNotice from './components/StatusNotice.jsx';
import { STUDY_MODES } from './constants/studyModes.js';
import { getSavedSessionId, saveSessionId } from './utils/session.js';
import { findFirstChapter } from './utils/studyMap.js';

const createWelcomeMessage = () => ({
  id: 'welcome',
  role: 'zuno',
  status: 'intro',
  answer:
    'Hey, main Zuno hoon. Global mode me koi bhi Science doubt pucho, ya Focus mode me ek chapter lock karke study karo.',
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

function App() {
  const [studyMode, setStudyMode] = useState(STUDY_MODES.global);
  const [studyMap, setStudyMap] = useState(null);
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [sessionId, setSessionId] = useState(() => getSavedSessionId());
  const [isStudyMapLoading, setIsStudyMapLoading] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');

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

  const handleModeChange = (nextMode) => {
    setStudyMode(nextMode);
    setError('');
  };

  const handleAsk = async (question, requestMode = studyMode) => {
    const cleanQuestion = question.trim();

    if (!cleanQuestion || isAsking) {
      return;
    }

    if (requestMode === STUDY_MODES.focus && !selectedChapterId) {
      setError('Focus mode ke liye pehle chapter select karo.');
      return;
    }

    setError('');
    setIsAsking(true);
    setMessages((currentMessages) => [
      ...currentMessages,
      createQuestionMessage(cleanQuestion),
    ]);

    try {
      const answerPayload = await askTutor({
        question: cleanQuestion,
        studyMode: requestMode,
        chapterId: selectedChapterId,
        sessionId,
      });
      const nextSessionId = answerPayload.session?.sessionId;

      if (nextSessionId && nextSessionId !== sessionId) {
        saveSessionId(nextSessionId);
        setSessionId(nextSessionId);
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        createAnswerMessage(answerPayload),
      ]);
    } catch (askError) {
      setError(askError.message);
    } finally {
      setIsAsking(false);
    }
  };

  const handleSwitchToGlobal = async (question) => {
    setStudyMode(STUDY_MODES.global);
    await handleAsk(question, STUDY_MODES.global);
  };

  return (
    <main className="app-shell">
      <section className="app-card" aria-label="Zuno tutor app">
        <AppHeader />

        <div className="control-panel">
          <ModeSwitch activeMode={studyMode} onChange={handleModeChange} />
          {studyMode === STUDY_MODES.focus && (
            <ChapterPicker
              chapters={studyMap?.focusStudy?.subjects || []}
              isLoading={isStudyMapLoading}
              selectedChapter={selectedChapter}
              selectedChapterId={selectedChapterId}
              onChange={setSelectedChapterId}
            />
          )}
        </div>

        <section className="chat-panel" aria-live="polite">
          <EmptyState studyMode={studyMode} selectedChapter={selectedChapter} />

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
                  answer: 'Zuno context check kar raha hai...',
                  status: 'thinking',
                  sources: [],
                }}
              />
            )}
          </div>
        </section>

        <StatusNotice error={error} />
        <AskBar disabled={isAsking} onAsk={handleAsk} studyMode={studyMode} />
      </section>
    </main>
  );
}

export default App;
