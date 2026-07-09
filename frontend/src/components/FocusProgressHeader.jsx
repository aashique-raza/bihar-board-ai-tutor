import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';
import { useChapterTopics } from '../hooks/useChapterTopics.js';

export default function FocusProgressHeader({ chapterId, currentTopicId, completedTopicIds, engagementCount = 0, status = null }) {
  const { topics, isLoading } = useChapterTopics(chapterId);

  if (!chapterId || isLoading || topics.length === 0) {
    return null;
  }

  // Calculate progress
  const totalTopics = topics.length;
  let currentIndex = topics.findIndex(t => t.topicId === currentTopicId);

  // ISSUE-2 (FOCUS_MODE_PROGRESS_FIX_PLAN.md): currentTopicId can legitimately not be
  // found in `topics` (fresh chapter select before progress loads, or a restructured
  // chapter's old topicId). Use the real ChapterProgress.status instead of guessing
  // from completedTopicIds.length, which used to misreport "chapter complete".
  if (currentIndex === -1) {
    currentIndex = status === 'completed' ? totalTopics : 0;
  }

  const currentTopic = topics[currentIndex];
  const displayIndex = Math.min(currentIndex + 1, totalTopics);
  const progressPercent = Math.max(0, Math.min(100, (completedTopicIds.length / totalTopics) * 100));

  // Build a tooltip hint showing the next few topics
  const nextTopics = topics.slice(currentIndex + 1, currentIndex + 4);
  const tooltipContent = (
    <Box sx={{ p: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: '#fff' }}>
        Chapter Roadmap
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {topics.map((t, i) => {
          const isDone = completedTopicIds.includes(t.topicId);
          const isCurrent = t.topicId === currentTopicId;
          let icon = '🔒';
          if (isDone) icon = '✅';
          else if (isCurrent) icon = '🟢';
          else if (i === currentIndex && !isCurrent) icon = '🟢'; // fallback for start

          return (
            <Typography key={t.topicId} variant="caption" sx={{ color: isCurrent ? '#fff' : 'rgba(255,255,255,0.7)' }}>
              {icon} {t.title}
            </Typography>
          );
        })}
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        width: '100%',
        bgcolor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        py: 1,
        px: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 'var(--chat-max-width)', mx: 'auto', width: '100%' }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Topic{' '}
          <Box component="span" sx={{ color: 'var(--primary)' }}>{displayIndex}</Box>
          {' '}of {totalTopics}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>
            {Math.round(progressPercent)}%
          </Typography>
          <Tooltip title={tooltipContent} placement="bottom-end" arrow>
            <IconButton size="small" sx={{ color: 'var(--text-muted)' }}>
              <InfoOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Thin Progress Bar */}
      <Box sx={{ width: '100%', maxWidth: 'var(--chat-max-width)', mx: 'auto', height: 2, bgcolor: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            bgcolor: 'var(--primary)',
            width: `${progressPercent}%`,
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </Box>

      {/* ISSUE-1: separate "engagement" stat — how much the student has asked/explored in
          this chapter, distinct from topic-completion %. Never blended into progressPercent
          above; only shown once it's non-zero so a fresh chapter stays uncluttered. */}
      {engagementCount > 0 && (
        <Box sx={{ maxWidth: 'var(--chat-max-width)', mx: 'auto', width: '100%' }}>
          <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            💬 {engagementCount} sawaal poochhe is chapter me
          </Typography>
        </Box>
      )}
    </Box>
  );
}
