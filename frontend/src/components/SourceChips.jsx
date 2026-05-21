import React from 'react';
import SourceRounded from '@mui/icons-material/SourceRounded';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';

function SourceChips({ sources }) {
  if (!sources.length) {
    return null;
  }

  return (
    <Stack
      aria-label="Answer sources"
      direction="row"
      flexWrap="wrap"
      gap={1}
      sx={{ mt: 1.5 }}
    >
      {sources.map((source) => (
        <Chip
          icon={<SourceRounded />}
          key={`${source.sourceNumber}-${source.chunkId || source.sourceId}`}
          label={
            source.label ||
            source.sourceTitle ||
            `${source.chapterTitle} / ${source.headingPath}`
          }
          size="small"
          sx={{ maxWidth: '100%', fontWeight: 750 }}
        />
      ))}
    </Stack>
  );
}

export default SourceChips;
