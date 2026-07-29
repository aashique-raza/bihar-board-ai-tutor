# TASK-022: Premium Dark Frontend Tutor UI Refresh

Status: DONE

## Goal

Refresh the Zuno frontend so it feels like a premium Class 10 personal tutor app instead of a simple doubt-solver demo.

## Completed

- Added Material UI, Emotion, and MUI icons.
- Created a premium dark theme foundation.
- Added a fixed app shell with sidebar and chat panel scrolling.
- Added a future-ready sidebar for Tutor, History, Tracking, Quiz, and Account.
- Moved Account to the bottom of the sidebar.
- Removed the old Global/Focus segmented switch.
- Kept Global behavior as the default.
- Added a Focus button that opens a subject/section/chapter selection modal.
- Added subject-specific icons for Hindi, English, Math, Science, Social Science, and Sanskrit.
- Added section-specific icons for Physics, Chemistry, and Biology.
- Removed the large empty hero/intro panel from the chat surface.
- Added compact Focus Mode state in the header after chapter selection.
- Added a contextual Zuno chat message when Focus Mode is selected.
- Fixed the chat scroll behavior so only the chat panel scrolls.
- Added auto-scroll after new messages.
- Reworked message bubbles, input bar, status notice, and loading state.
- Replaced loading text with an animated thinking indicator.
- Hid source chips from the student-facing chat UI.
- Deleted old `ModeSwitch`, `ChapterPicker`, and `EmptyState` components.

## Verified

```bash
cd frontend
npm.cmd run build
```

Build passed.

## Remaining Follow-Up

- Add lesson state display.
- Add continue lesson action.
- Render structured Tutor Engine actions.
- Do a browser visual QA pass for desktop and mobile.
