---
phase: 01-ui-ux-css-fixes
plan: 03
subsystem: ui
tags: [tailwind, css, theme, visual-hierarchy]

# Dependency graph
requires:
  - phase: 01-ui-ux-css-fixes
    plan: 01-02
    provides: Research findings on badge colors, icon sizing, and layer borders
provides:
  - Consistent visual hierarchy with border-tertiary on bg-secondary containers
  - Standardized icon sizing (text-xl) across dashboard components
  - Theme dropdown with working hover effect on selected option
affects: [future-ui-plans, visual-consistency]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - bg-secondary containers should have border border-tertiary for layer 1 visual hierarchy
    - Dashboard icons use text-xl for consistent sizing
    - Theme dropdown options use hover:bg-bg2 for both selected and unselected states

key-files:
  created: []
  modified:
    - frontend/src/pages/Admin.tsx
    - frontend/src/pages/Settings.tsx
    - frontend/src/pages/Dashboard.tsx
    - frontend/src/pages/Applications.tsx
    - frontend/src/pages/ApplicationDetail.tsx
    - frontend/src/components/dashboard/QuickActions.tsx
    - frontend/src/components/dashboard/KPICards.tsx
    - frontend/src/components/dashboard/NeedsAttention.tsx
    - frontend/src/components/dashboard/FlameEmblem.tsx
    - frontend/src/components/ThemeDropdown.tsx

key-decisions:
  - "Badge colors using CSS variables already work correctly - no changes needed"
  - "Theme dropdown hover fixed by changing selected option from hover:bg-tertiary to hover:bg-bg2"
  - "Loading skeletons intentionally skip borders for correct visual state"

patterns-established:
  - "Layer 1 containers: bg-secondary border border-tertiary rounded"
  - "Dashboard icons: text-xl (1.25rem) for consistent visual weight"
  - "Button hover patterns: transition-all duration-200 ease-in-out"

# Metrics
duration: 6min
completed: 2026-01-31
---

# Phase 1: Plan 3 Summary

**Visual hierarchy fixes: border-tertiary on layer containers, consistent dashboard icon sizes, and theme dropdown hover on selected option**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-31T12:41:52Z
- **Completed:** 2026-01-31T12:47:44Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- All `bg-secondary` containers in key pages now have `border border-tertiary` for proper visual hierarchy
- Dashboard icons standardized to `text-xl` (QuickActions, NeedsAttention)
- Theme dropdown selected option now shows hover effect with `hover:bg-bg2`

## Task Commits

Each task was committed atomically:

1. **Task 2: Add border-tertiary to bg-secondary containers** - `6d9fc5f` (feat)
2. **Task 3: Standardize dashboard icon sizes** - `01231b1` (feat)

**Plan metadata:** (pending checkpoint approval)

_Note: Task 1 was verification-only - badge colors already use CSS variables correctly_

## Files Created/Modified

### Modified Files

- `frontend/src/pages/Admin.tsx` - Added border-tertiary to stats cards and users table
- `frontend/src/pages/Settings.tsx` - Added border-tertiary to theme, statuses, rounds, export, and import section cards
- `frontend/src/pages/Dashboard.tsx` - Added border-tertiary to activity overview card
- `frontend/src/pages/Applications.tsx` - Added border-tertiary to search filters and applications table
- `frontend/src/pages/ApplicationDetail.tsx` - Added border-tertiary to application info and interview rounds sections
- `frontend/src/components/dashboard/QuickActions.tsx` - Added border-tertiary to action buttons
- `frontend/src/components/dashboard/KPICards.tsx` - Added border-tertiary to KPI cards
- `frontend/src/components/dashboard/NeedsAttention.tsx` - Added border-tertiary to attention sections and text-xl to icons
- `frontend/src/components/dashboard/FlameEmblem.tsx` - Added border-tertiary to flame emblem container
- `frontend/src/components/ThemeDropdown.tsx` - Fixed selected option hover to use bg-bg2

## Decisions Made

- **Badge colors already use CSS variables** - Admin.tsx uses `bg-accent-purple/20 text-accent-purple` pattern which references CSS variables, so badges are theme-aware
- **Theme dropdown hover fix** - Changed selected option from `bg-bg1 hover:bg-tertiary` to `bg-bg1 hover:bg-bg2` to match unselected options' hover behavior
- **Loading skeletons skip borders** - Skeleton loading states intentionally use `bg-secondary` without borders to indicate transient state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all changes applied cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

### What's Ready

- Visual hierarchy is now consistent across all major pages (Admin, Settings, Dashboard, Applications, ApplicationDetail)
- Icon sizing is standardized in dashboard components
- Theme dropdown is fully interactive with hover states on all options

### Verification Needed

This plan has a checkpoint at Task 4. Before proceeding, verify:
- Badge colors display correctly (not white) in all 4 themes (Gruvbox Dark, Gruvbox Light, Nord, Dracula)
- Borders are visible on layer 1 containers (bg-secondary cards)
- Icons appear uniformly sized in dashboard
- Theme dropdown shows hover effect on selected option

### Any Blockers or Concerns

None. Visual fixes are complete and await human verification before proceeding to next plan.

---
*Phase: 01-ui-ux-css-fixes*
*Plan: 03*
*Completed: 2026-01-31*
