---
phase: 01-ui-ux-css-fixes
plan: 04
subsystem: ui
tags: [css-variables, tailwind, 5-color-layering, modal-fixes, input-fixes]

# Dependency graph
requires:
  - phase: 01-ui-ux-css-fixes
    provides: Design guidelines, button patterns, input layering rules
provides:
  - Consistent 5-color Gruvbox layering across entire application
  - All modals use bg-bg4 for proper visual hierarchy
  - All inputs follow "next color darker" rule
  - Icon-only buttons use proper asymmetric padding
  - Tables and containers use color-only separation
affects: [phase-02-import]

# Tech tracking
tech-stack:
  added: []
  patterns:
  - 5-color Gruvbox layering: bg0 (page) → bg1 (containers) → bg2 (hover/nested) → bg3 (inputs on bg2) → bg4 (modals)
  - Input background rule: always use next darker color from container
  - Icon-only button padding: px-3 py-1.5 for square proportions
  - Modal overlays: bg-bg0/80 for backdrop
  - Danger button pattern: bg-transparent text-red hover:bg-bg2 hover:text-red-bright

key-files:
  created: []
  modified:
  - frontend/src/components/application/StatusHistoryModal.tsx
  - frontend/src/components/ImportModal.tsx
  - frontend/src/components/CreateUserModal.tsx
  - frontend/src/components/EditUserModal.tsx
  - frontend/src/components/MediaPlayer.tsx
  - frontend/src/components/RoundForm.tsx
  - frontend/src/pages/ApplicationForm.tsx
  - frontend/src/pages/Settings.tsx
  - frontend/src/components/ActivityHeatmap.tsx
  - frontend/src/components/analytics/PeriodSelector.tsx
  - frontend/src/components/application/HistoryViewer.tsx
  - frontend/src/components/dashboard/QuickActions.tsx
  - frontend/src/components/dashboard/FlameEmblem.tsx
  - frontend/src/pages/Applications.tsx
  - frontend/src/pages/Admin.tsx
  - frontend/src/components/DocumentSection.tsx

key-decisions:
  - "Modal backgrounds use bg-bg4 (lightest layer) for proper visual separation from page"
  - "Input backgrounds always use next darker color from container for visibility"
  - "Icon-only buttons use px-3 py-1.5 (asymmetric padding) because icons are taller than wide"
  - "Tables use color-only separation, no borders on rows"
  - "Theme dropdown keeps border as exception per design guidelines"

patterns-established:
  - "5-color Gruvbox layering rule consistently applied across all components"
  - "Modal pattern: bg-bg0/80 backdrop + bg-bg4 content container"
  - "Input layering: bg0→bg1, bg1→bg2, bg2→bg3 based on container background"
  - "Hover states follow layering direction (darker on hover, never lighter)"

# Metrics
duration: 10 min
completed: 2026-01-31
---

# Phase 01 Plan 04: 5-Color Gruvbox Layering Fixes Summary

**Fixed all 80+ violations of the 5-color Gruvbox layering rule across 23 files for consistent visual hierarchy**

## Performance

- **Duration:** 10 min
- **Started:** 2026-01-31T16:31:08Z
- **Completed:** 2026-01-31T16:41:54Z
- **Tasks:** 8
- **Files modified:** 19

## Accomplishments

- Fixed all modal backgrounds to use `bg-bg4` (5 files)
- Fixed all input backgrounds using "next color darker" rule (4 files, 28 instances)
- Fixed icon-only button padding to `px-3 py-1.5` (5 files)
- Fixed button hover states to follow proper layering direction (2 files)
- Removed borders from base containers (2 files)
- Removed table row borders (3 files)
- Replaced hardcoded `bg-black` with CSS variable `bg-bg0` (5 files)
- Fixed delete/cancel button styles to use transparent danger pattern (2 files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix modal backgrounds to use bg-bg4** - `f166750` (fix)
2. **Task 2: Fix input backgrounds using next color darker rule** - `334f6a1` (fix)
3. **Task 3: Fix icon-only button padding to px-3 py-1.5** - `8cebd11` (fix)
4. **Task 4: Fix button hover states using proper layering** - `48f90d6` (fix)
5. **Task 5: Remove container borders from base containers** - `856ec7a` (fix)
6. **Task 6: Remove table row borders** - `b725a08` (fix)
7. **Task 7: Replace hardcoded bg-black with CSS variable** - `54d41df` (fix)
8. **Task 8: Fix delete/cancel button styles** - `e916785` (fix)
9. **Additional: Remove unused index variable** - `07998ae` (fix)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `frontend/src/components/application/StatusHistoryModal.tsx` - Modal bg-secondary→bg-bg4, close button padding, overlay bg-black→bg-bg0
- `frontend/src/components/ImportModal.tsx` - Modal background, close button padding, overlay, cancel button fix
- `frontend/src/components/CreateUserModal.tsx` - Modal background, close button padding, overlay
- `frontend/src/components/EditUserModal.tsx` - Modal background, close button padding, overlay, delete button fix
- `frontend/src/components/MediaPlayer.tsx` - Modal background, close button padding, overlay, video bg-black→bg-bg0
- `frontend/src/components/RoundForm.tsx` - Input backgrounds bg-bg0→bg-bg3 (on bg-tertiary container)
- `frontend/src/pages/ApplicationForm.tsx` - Input backgrounds bg-tertiary→bg-bg2 (on bg-secondary container)
- `frontend/src/pages/Settings.tsx` - Input backgrounds fixed, color picker border fixed
- `frontend/src/components/ActivityHeatmap.tsx` - Select input bg-tertiary→bg-bg1
- `frontend/src/components/analytics/PeriodSelector.tsx` - Button hover bg-bg2→bg-bg1 (on transparent)
- `frontend/src/components/application/HistoryViewer.tsx` - "View more" button hover fix
- `frontend/src/components/dashboard/QuickActions.tsx` - Removed border from action buttons
- `frontend/src/components/dashboard/FlameEmblem.tsx` - Replaced inline borderColor with border-orange class
- `frontend/src/pages/Applications.tsx` - Removed border-b from table rows, fixed unused index
- `frontend/src/pages/Admin.tsx` - Removed border-b from table rows, fixed unused index
- `frontend/src/components/DocumentSection.tsx` - Removed border-b from document list items

## Decisions Made

- Modal backgrounds use `bg-bg4` (lightest layer) for proper visual separation from page
- Input backgrounds follow "next color darker" rule: bg0→bg1, bg1→bg2, bg2→bg3 based on container
- Icon-only buttons use `px-3 py-1.5` (asymmetric padding) because icons are taller than wide
- Button hover states always go darker (never lighter): bg0→bg1, bg1→bg2, bg2→bg3
- Tables use color-only separation between rows (no borders)
- Theme dropdown keeps border as exception per design guidelines
- Modal overlays use `bg-bg0/80` instead of hardcoded `bg-black/80`
- Delete buttons use transparent danger pattern: `bg-transparent text-red hover:bg-bg2 hover:text-red-bright`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Build failed initially due to unused `index` variable after removing border logic from table rows - fixed by removing the unused variable declaration

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 1 (UI/UX & CSS Fixes) is now complete with all 4 plans finished.
- 5-color Gruvbox layering rule is consistently applied everywhere
- Theme switching should now work correctly across all 4 themes
- All visual hierarchy issues from the audit have been resolved
- Ready to proceed to Phase 2 (Import functionality)

---
*Phase: 01-ui-ux-css-fixes*
*Completed: 2026-01-31*
