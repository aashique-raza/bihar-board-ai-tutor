import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';
import { useChapterTopics } from '../hooks/useChapterTopics.js';

export default function FocusProgressHeader({ chapterId, currentTopicId, completedTopicIds }) {
  const { topics, isLoading } = useChapterTopics(chapterId);

  if (!chapterId || isLoading || topics.length === 0) {
    return null;
  }

  // Calculate progress
  const totalTopics = topics.length;
  let currentIndex = topics.findIndex(t => t.topicId === currentTopicId);
  
  if (currentIndex === -1) {
    if (completedTopicIds.length === 0) {
      currentIndex = 0; // Not started yet, but chapter is active
    } else {
      // If we have completed topics but current isn't found, maybe chapter is complete
      currentIndex = totalTopics;
    }
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
              {icon} {i + 1}. {t.title}
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
          Topic {displayIndex} of {totalTopics}: <Box component="span" sx={{ color: 'var(--primary)' }}>{currentTopic?.title || 'Chapter Complete'}</Box>
        </Typography>
        
        <Tooltip title={tooltipContent} placement="bottom-end" arrow>
          <IconButton size="small" sx={{ color: 'var(--text-muted)' }}>
            <InfoOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
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
    </Box>
  );
}
