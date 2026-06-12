# UI_PLAN.md — Zuno Frontend Redesign
**Created:** 2026-06-10  
**Design System:** Slate & Pearl — Indigo accent, light-first, dark mode toggle  
**Stack:** React 19, Vite 6, MUI v9  
**Goal:** Complete UI overhaul — responsive, industry-standard, clean code structure
---
## Design System (Locked)
### Colors — Light Mode
```
--bg-page:         #F0F2F5   (page background)
--bg-surface:      #FFFFFF   (cards, topbar, panels)
--bg-input:        #F9FAFB   (input fields)
--bg-hover:        #F3F4F6   (hover states)
--border:          #E4E7EC   (default borders)
--border-strong:   #D1D5DB   (emphasis borders)
--primary:         #4F46E5   (indigo — buttons, accents)
--primary-hover:   #4338CA   (button hover)
--primary-tint:    #EEF2FF   (soft indigo bg — tags, formula blocks)
--primary-border:  #C7D2FE   (indigo border)
--primary-label:   #4338CA   (indigo text on light bg)
--text-primary:    #111827
--text-secondary:  #374151
--text-muted:      #6B7280
--text-hint:       #9CA3AF
--text-placeholder:#C4C9D4
--success:         #10B981
--error:           #EF4444
--warning:         #F59E0B
--shadow-sm:       0 1px 3px rgba(0,0,0,0.06)
--shadow-md:       0 4px 12px rgba(0,0,0,0.08)
```
### Colors — Dark Mode (data-theme="dark" on <html>)
```
--bg-page:         #111827
--bg-surface:      #1F2937
--bg-input:        #111827
--bg-hover:        #374151
--border:          #374151
--border-strong:   #4B5563
--primary:         #6366F1
--primary-hover:   #4F46E5
--primary-tint:    #1E1B4B
--primary-border:  #312E81
--primary-label:   #818CF8
--text-primary:    #F9FAFB
--text-secondary:  #D1D5DB
--text-muted:      #9CA3AF
--text-hint:       #4B5563
--text-placeholder:#4B5563
--success:         #34D399
--error:           #F87171
--warning:         #FBBF24
--shadow-sm:       none
--shadow-md:       none
```
### Typography
```
Font family (body):  'Inter', system-ui, -apple-system, sans-serif
Font family (code):  'JetBrains Mono', 'SF Mono', monospace
Google Fonts import: Inter (400,500,600,700) + JetBrains Mono (400,500)
Scale:
  xs:   11px / 400 / lh 1.5   → hint text, timestamps, labels
  sm:   12px / 500 / lh 1.4   → tags, badges, secondary labels
  base: 14px / 400 / lh 1.75  → body text, chat messages
  md:   13px / 600 / lh 1.4   → section headings inside AI response
  lg:   16px / 600 / lh 1.3   → card titles, page subheadings
  xl:   22px / 700 / lh 1.2   → page titles, landing hero
  logo: 15px / 700 / ls -0.3px → topbar logo name
  label:11px / 600 / uppercase / ls 0.07em → section divider labels
```
### Spacing
```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
```
### Border Radius
```
--radius-sm:     5px   → tags, badges, small chips
--radius-md:     8px   → buttons, inputs, send button
--radius-lg:     12px  → chat bubbles, cards
--radius-xl:     16px  → modals, large panels
--radius-avatar: 9px   → logo mark, avatars
--radius-full:   9999px → pills, toggle switches
```
### Layout
```
Chat max-width:       700px (centered, padding 24px sides)
Topbar height:        54px
Mobile padding:       16px sides
Desktop padding:      24px sides
```
### Component Rules
```
Button height:        36px (sm: 28px, lg: 42px)
Input border-width:   1.5px (focus: var(--primary))
Send button:          34x34px, radius-md, primary bg
Avatar / Logo mark:   30x30px, radius-avatar
AI section left bar:  3px wide, var(--primary), radius 2px
Formula block:        primary-tint bg, primary-border, monospace font
User bubble:          right-align, max-width 65% (mobile: 85%), radius 12 12 3 12
AI response:          no bubble — free text with avatar on left
Card shadow:          var(--shadow-sm) — light mode only
Topbar:               1px bottom border (var(--border))
```
### Dark Mode
```
Implementation:  CSS variables — [data-theme="dark"] on <html> element
Toggle:          Button in topbar — sun/moon icon
Persistence:     localStorage key: 'zuno-theme'
Default:         light
```
### Responsive Breakpoints
```
Mobile:   < 640px
Tablet:   640px – 1024px
Desktop:  > 1024px
Mobile rules:
  - Topbar: chapter pill hidden, show hamburger or minimal layout
  - Chat bubbles: user max-width 85%
  - Padding: 16px sides
  - Input: full width, slightly larger tap targets
```
---
## Existing Frontend Files (to be modified)
```
frontend/src/
  main.jsx                          ← import theme.css here
  App.jsx                           ← layout restructure
  theme/zunoTheme.js                ← MUI theme — update to match design system
  styles/global.css                 ← replace with theme.css variables
  components/
    AppHeader.jsx                   ← rebuild as new Topbar
    AskBar.jsx                      ← rebuild as new Input component
    ChatMessage.jsx                 ← rebuild with new AI/user message design
    Sidebar.jsx                     ← remove OR repurpose
    FocusModal.jsx                  ← keep logic, restyle
    AppInitializer.jsx              ← no UI change needed
  pages/ (to be created)
    LoginPage.jsx                   ← Step E
    RegisterPage.jsx                ← Step E
    LandingPage.jsx                 ← Step F
  api/tutorApi.js                   ← no change needed
  services/                         ← no change needed
  store/                            ← no change needed
```
---
## Implementation Steps
### Step A — Foundation (theme.css + dark mode hook)
**What:** Create CSS variables file, update MUI theme, wire dark mode toggle  
**Files:**
- CREATE: `frontend/src/styles/theme.css` (all CSS variables)
- MODIFY: `frontend/src/theme/zunoTheme.js` (point MUI theme to CSS vars)
- MODIFY: `frontend/src/main.jsx` (import theme.css)
- CREATE: `frontend/src/hooks/useTheme.js` (dark mode toggle hook — reads/writes localStorage)
**Status:** ✅ DONE
---
### Step B — App Layout Restructure
**What:** New full-screen layout — topbar + chat area + input bar. Remove old sidebar structure.  
**Files changed:**
- `frontend/src/hooks/useTheme.js` — added `data-color-scheme` attribute sync alongside `data-theme` so MUI color scheme system stays in sync with our custom CSS variable system
- `frontend/src/components/Topbar.jsx` — **NEW FILE.** Replaces AppHeader. Contains: indigo "Z" logo mark (34×34px, CSS variable based, no gradient), "Zuno" brand text, chapter pill (desktop only, hidden on mobile <640px, shows active focus chapter with clear button), Focus outlined button, dark/light theme toggle icon button
- `frontend/src/App.jsx` — removed Sidebar and AppHeader imports, added useTheme hook and Topbar, replaced entire JSX return with new 3-zone column layout: Topbar (fixed 54px) + scrollable chat area (flex:1, overflow-y:auto, max-width 700px centered) + fixed bottom input zone (bg-surface, border-top)
- `frontend/src/styles/global.css` — removed all old hardcoded dark layout classes, replaced with CSS variable based theme-aware classes for layout, chat messages, ask bar, avatar, thinking indicator. FocusModal dark classes preserved (Step G will restyle)
- `frontend/src/components/Sidebar.jsx` — **DELETED**

**Known issues deferred to next steps:**
- ChatMessage left/right alignment needs Step C fix
- Avatar shows graduation cap icon instead of "Z" — Step C fix
- `AppHeader.jsx` still exists on disk (unused) — delete in Step C cleanup

**Build status:** ✅ `npm run build` passed, 0 errors, 654 modules transformed.  
**Status:** ✅ COMPLETE  
**Depends on:** Step A

**Addendum (added post Step E):**
- MODIFIED: `frontend/src/components/Topbar.jsx` — added auth slot between Focus button and theme toggle:
  - Logged out: outlined "Login" pill button → navigates to /login
  - Loading (app start): blank — no flash of wrong state
  - Logged in: 30×30px indigo avatar with user's first initial (radius-avatar), click opens dropdown popover with user name, email, and Logout button
  - Logout flow: calls logoutUser() API → dispatches clearCredentials() → redirects to /login
---
### Step C — ChatMessage Redesign
**What:** AI response — no box, free text with avatar. Sections with left bar, formula block, tags. User message — right-aligned clean bubble.  
**Files changed:**
- REBUILT: `frontend/src/components/ChatMessage.jsx` — student bubble (right-aligned, primary bg, border-radius 12 12 3 12), Zuno message (avatar "Z" on left, free text layout, section headings with 3px primary left bar), ThinkingDots animated component, SourceChips below content, focus-miss "Search globally" button
- `frontend/src/styles/global.css` — added all Step C classes: `.message-row`, `.student-row`, `.zuno-row`, `.student-bubble`, `.zuno-avatar`, `.message-kicker`, `.message-sections`, `.section-block`, `.section-heading`, `.section-content`, `.source-chips`, `.source-chip`, `.thinking-indicator` with pulse animation
- Responsive: student bubble max-width 85% on mobile (<640px), zuno-message max-width 100% on mobile

**Build status:** ✅ `npm run build` passed  
**Status:** ✅ COMPLETE  
**Depends on:** Step A, Step B
---
### Step D — AskBar / Input Redesign
**What:** New input — no ugly browser textarea, send button inside input row, no resize arrows  
**Files changed:**
- REBUILT: `frontend/src/components/AskBar.jsx` — MUI Paper wrapper with `.ask-bar` class, InputBase (flex 1), Send/Cancel icon buttons inside row, cancel cooldown to prevent double-fire
- `frontend/src/styles/global.css` — added `.ask-area`, `.ask-bar` with 1.5px border and `:focus-within` primary border

- Hint text added below input: "Zuno sirf Bihar Board Class 10 Science syllabus se jawab deta hai" — `.ask-hint` class in global.css
- Message spacing fixed: `gap: 0` on chat messages Box in App.jsx

**Status:** ✅ COMPLETE  
**Depends on:** Step A, Step B
---
### Step E — Login + Register Pages
**What:** Auth pages matching the design system — clean cards, indigo primary, Google OAuth button  
**Files:**
- CREATE: `frontend/src/pages/LoginPage.jsx`
- CREATE: `frontend/src/pages/RegisterPage.jsx`
- MODIFY: `frontend/src/App.jsx` (add routes for auth pages)
**Design:**
- Centered card on bg-page background
- Logo at top of card
- Input fields with design system styling
- Primary button for submit
- Google OAuth button (secondary style)
- Link between login/register pages
- Responsive: card full-width on mobile with 16px padding

**Files changed:**
- CREATED: `frontend/src/pages/LoginPage.jsx` — email/password form, validation, getMe() call after login, setCredentials dispatch, Google OAuth button, link to Register
- CREATED: `frontend/src/pages/RegisterPage.jsx` — name/email/password form, validation, register + auto-login flow, Google OAuth button, link to Login
- MODIFIED: `frontend/src/App.jsx` — added routes for /login, /register, /auth/callback
- MODIFIED: `frontend/src/services/axios/authService.js` — getMe() now returns normalized user object directly (data?.data?.user || data?.data || data) so all callers receive clean user object without nesting
- MODIFIED: `frontend/src/components/AppInitializer.jsx` — updated getMe() caller pattern: `const user = await getMe(newToken)` (no .data unwrap needed)
- MODIFIED: `frontend/src/pages/AuthCallback.jsx` — updated getMe() caller pattern: `const user = await getMe(tokenParam)` (no .data unwrap needed)

**Bugs fixed this session:**
- BUG: user.name showing "?" in Topbar after login — root cause was getMe() returning nested { user: {...} } object instead of flat user object. Fixed in authService.js getMe() with normalization. All three callers (LoginPage, AuthCallback, AppInitializer) updated.

**Build status:** ✅ npm run build passed

**Status:** ✅ COMPLETE  
**Depends on:** Step A
---
### Step F — Landing Page
**What:** Home screen before user starts chatting — product intro, CTA buttons  
**Files:**
- CREATE: `frontend/src/pages/LandingPage.jsx`
**Design:**
- Full viewport height
- Zuno logo + tagline centered
- "Padhai Start Karo" primary button → goes to chat
- "Chapter Chuno" secondary button → chapter picker
- Dark/light toggle visible
- Responsive: stacked layout on mobile
**Status:** ⬜ PENDING  
**Depends on:** Step A, Step B
---
### Step G — Responsive Polish + FocusModal Restyle
**What:** Final pass — check all breakpoints, restyle FocusModal  
**Files:**
- MODIFY: all components — responsive audit
- RESTYLE: `frontend/src/components/FocusModal.jsx`
**Checks:**
- Mobile 375px — chat, input, topbar
- Tablet 768px — layout correct
- Desktop 1280px — max-width centered
- Dark mode across all screens
**Status:** ⬜ PENDING  
**Depends on:** Steps A–F
---
## Implementation Status Summary
| Step | What | Status |
|------|------|--------|
| A | theme.css + dark mode hook + MUI update | ✅ DONE |
| B | App layout + Topbar rebuild | ✅ DONE |
| C | ChatMessage redesign | ✅ DONE |
| D | AskBar / Input redesign | ✅ DONE |
| E | Login + Register pages | ✅ DONE |
| F | Landing page | ⬜ PENDING |
| G | Responsive polish + FocusModal | ⬜ PENDING |
---
## Quality Rules (Every Step)
- No inline styles where CSS variable exists
- No hardcoded hex colors — always use CSS variables
- Every component responsive at 375px, 768px, 1280px
- Dark mode tested on every component
- `npm run build` must pass after every step
- Simple readable code — no clever tricks
- MUI components styled via `sx` prop or `styled()` — not custom CSS classes fighting MUI
---
## Notes
- MUI v9 is in use — theme overrides go in `zunoTheme.js`
- Redux store, axiosInstance, auth flow — DO NOT touch in any UI step
- tutorApi.js — DO NOT touch
- Backend — DO NOT touch
- Each step = one Claude Code prompt = one focused task
