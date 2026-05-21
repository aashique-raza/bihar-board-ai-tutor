import React, { useMemo, useState } from 'react';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AutoStoriesRounded from '@mui/icons-material/AutoStoriesRounded';
import BiotechRounded from '@mui/icons-material/BiotechRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import FunctionsRounded from '@mui/icons-material/FunctionsRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const class10Subjects = [
  { id: 'hindi', title: 'Hindi', available: false, icon: TranslateRounded },
  { id: 'english', title: 'English', available: false, icon: AutoStoriesRounded },
  { id: 'math', title: 'Math', available: false, icon: FunctionsRounded },
  { id: 'science', title: 'Science', available: true, icon: ScienceRounded },
  { id: 'social-science', title: 'Social Science', available: false, icon: PublicRounded },
  { id: 'sanskrit', title: 'Sanskrit', available: false, icon: MenuBookRounded },
];

const sectionIcons = {
  physics: BoltRounded,
  chemistry: ScienceRounded,
  biology: BiotechRounded,
};

function getScienceSubject(studyMap) {
  const subjects = studyMap?.focusStudy?.subjects || [];

  return (
    subjects.find((subject) => subject.title?.toLowerCase() === 'science') ||
    subjects[0]
  );
}

function FocusModal({
  isOpen,
  isLoading,
  selectedChapterId,
  studyMap,
  onClose,
  onSelectChapter,
}) {
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('');
  const scienceSubject = useMemo(() => getScienceSubject(studyMap), [studyMap]);

  const sections = scienceSubject?.sections || [];
  const activeSection = sections.find((section) => section.id === activeSectionId);
  const totalScienceChapters = sections.reduce(
    (total, section) => total + (section.chapters?.length || 0),
    0
  );

  const handleClose = () => {
    setActiveSubjectId('');
    setActiveSectionId('');
    onClose();
  };

  const handleSubjectClick = (subject) => {
    if (!subject.available || isLoading) {
      return;
    }

    setActiveSubjectId(subject.id);
    setActiveSectionId('');
  };

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      open={isOpen}
      onClose={handleClose}
      PaperProps={{ className: 'focus-dialog' }}
    >
      <DialogTitle component="div" sx={{ p: 0 }}>
        <Box className="focus-modal-title">
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box className="modal-icon">
              <SchoolRounded />
            </Box>
            <Box>
              <Typography variant="overline" color="primary.main" sx={{ fontWeight: 950 }}>
                Focus Mode
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 950 }}>
                Select Your Study Path
              </Typography>
            </Box>
          </Stack>
          <IconButton
            aria-label="Close focus selector"
            className="focus-close-button"
            onClick={handleClose}
          >
            <CloseRounded />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={3}>
          <Box>
            <Typography className="section-label">Class 10 Subjects</Typography>
            <Box className="focus-grid subjects">
              {class10Subjects.map((subject) => {
                const Icon = subject.icon;
                const isSelected = activeSubjectId === subject.id;

                return (
                  <Card
                    className={`focus-card ${isSelected ? 'selected' : ''}`}
                    key={subject.id}
                    variant="outlined"
                  >
                    <CardActionArea
                      disabled={!subject.available || isLoading}
                      onClick={() => handleSubjectClick(subject)}
                      sx={{ height: '100%', p: 2 }}
                    >
                      <Stack spacing={1.25}>
                        <Stack direction="row" alignItems="center" spacing={1.25}>
                          <Box className="card-icon subject-icon">
                            <Icon fontSize="small" />
                          </Box>
                          <Typography variant="h6" sx={{ fontWeight: 900, flex: 1 }}>
                            {subject.title}
                          </Typography>
                        </Stack>
                        <Chip
                          color={subject.available ? 'primary' : 'default'}
                          label={
                            subject.available
                              ? `${totalScienceChapters || 16} chapters`
                              : 'Coming soon'
                          }
                          size="small"
                          sx={{ alignSelf: 'flex-start', fontWeight: 850 }}
                        />
                      </Stack>
                    </CardActionArea>
                  </Card>
                );
              })}
            </Box>
          </Box>

          {activeSubjectId === 'science' && (
            <Box>
              <Typography className="section-label">Sections</Typography>
              <Box className="focus-grid sections">
                {sections.map((section) => {
                  const normalizedTitle = section.title?.toLowerCase();
                  const SectionIcon = sectionIcons[normalizedTitle] || MenuBookRounded;

                  return (
                    <Card
                      className={
                        activeSectionId === section.id
                          ? 'section-card selected-section'
                          : 'section-card'
                      }
                      key={section.id}
                      variant="outlined"
                    >
                      <CardActionArea
                        onClick={() => setActiveSectionId(section.id)}
                        sx={{ height: '100%', p: 2 }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1.25}>
                          <Box className="card-icon section-icon">
                            <SectionIcon fontSize="small" />
                          </Box>
                          <Box>
                            <Typography sx={{ fontWeight: 900 }}>{section.title}</Typography>
                            <Typography color="text.secondary" variant="body2">
                              {section.chapters?.length || 0} chapters
                            </Typography>
                          </Box>
                        </Stack>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Box>
            </Box>
          )}

          {activeSection && (
            <Box>
              <Typography className="section-label">
                {activeSection.title} Chapters
              </Typography>
              <Box className="focus-grid chapters">
                {activeSection.chapters.map((chapter) => (
                  <Card
                    className={selectedChapterId === chapter.id ? 'chapter-card selected' : 'chapter-card'}
                    key={chapter.id}
                    variant="outlined"
                  >
                    <CardActionArea
                      onClick={() => onSelectChapter(chapter.id)}
                      sx={{ height: '100%', p: 2 }}
                    >
                      <Stack spacing={1}>
                        <Chip
                          color="primary"
                          label={`Chapter ${chapter.number}`}
                          size="small"
                          sx={{ alignSelf: 'flex-start', fontWeight: 900 }}
                        />
                        <Typography sx={{ fontWeight: 900 }}>
                          {chapter.title}
                        </Typography>
                      </Stack>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default FocusModal;
