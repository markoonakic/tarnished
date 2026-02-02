# Roadmap: Job Tracker Improvements

## Overview

This roadmap delivers improvements to the existing Job Tracker application in four focused phases. We start with visible UI/UX fixes that users notice immediately, then complete the partially-built data import feature, refactor code for maintainability, and finish with comprehensive developer documentation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (1.1, 1.1.1, 1.2, 1.3, 1.4): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: UI/UX & CSS Fixes** - Visual consistency and styling improvements
- [x] **Phase 1.1: Theme System Refactor (INSERTED)** - Fix color system for seamless theme switching
- [x] **Phase 1.1.1: Frontend refactor - complete theme system migration (INSERTED)** - All components use theme system and follow design guidelines
- [x] **Phase 1.1.2: UI Inconsistency Fixes (INSERTED)** - Fix dropdowns, interior round sections, and separators
- [ ] **Phase 1.2: Repository Cleanup (INSERTED)** - Clean repository before push
- [ ] **Phase 1.3: Analytics Page (INSERTED)** - Analytics page fixes and improvements
- [ ] **Phase 1.4: Theme Switching Implementation (INSERTED)** - Implement theme switching + fix hardcoded colors
- [ ] **Phase 2: Complete Data Import** - Finish the import feature backend
- [ ] **Phase 3: Code Refactoring & Modals** - Component cleanup and UX patterns
- [ ] **Phase 4: Documentation** - Developer guides and API documentation

## Phase Details

### Phase 1: UI/UX & CSS Fixes

**Goal**: Application interface is visually consistent and polished

**Depends on**: Nothing (first phase)

**Requirements**: UIUX-01, UIUX-02, UIUX-03, UIUX-04, UIUX-05, UIUX-06, UIUX-07, UIUX-08, UIUX-09, UIUX-10, CSS-01, CSS-02, CSS-03

**Success Criteria** (what must be TRUE):
1. All buttons throughout the application use consistent hover states and styling
2. Text input fields show aqua-bright focus borders with smooth transitions
3. Badge colors display correctly (not appearing white)
4. Navigation elements use consistent transition effects
5. "Delete" is used consistently instead of "Remove" on all action buttons

**Plans**: 10 plans in 1 wave

Plans:
- [x] 01-00: Create frontend and backend design guidelines files — 2 tasks
- [x] 01-01: Fix button hover styling and consistency (UIUX-01, UIUX-02, UIUX-03, UIUX-04, UIUX-08, UIUX-09) — 2 tasks
- [x] 01-02: Fix input focus states and CSS class generation (UIUX-07, CSS-01, CSS-02) — 2 tasks
- [x] 01-03: Fix badge colors and visual hierarchy (UIUX-05, UIUX-06, UIUX-10, CSS-03) — 3 tasks (with human verification)
- [x] 01-04: 5-Color Gruvbox Layering Fixes — 8 tasks (comprehensive audit fixes)
- [x] 01-05: Add border class to all inputs (Gap Closure: Input focus borders) — 3 tasks
- [x] 01-06: Fix modal backgrounds to bg-bg2 (Gap Closure: 5-layer reset rule) — 2 tasks
- [x] 01-07: Fix cancel/danger button defaults (Gap Closure: Transparent defaults) — 2 tasks
- [x] 01-08: Fix Admin spacing and table separators (Gap Closure: Spacing & separators) — 2 tasks
- [x] 01-09: Fix X icon button padding (Gap Closure: Oversized hover area) — 1 task
- [x] 01-10: Add trash icon and document 5-layer rule (Gap Closure: Icon & docs) — 2 tasks

### Phase 1.1: Theme System Refactor (INSERTED)

**Goal**: Theme system supports seamless switching and easy community contributions

**Depends on**: Phase 1 (UI/UX & CSS Fixes)

**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, THEME-05

**Success Criteria** (what must be TRUE):
1. Theme switching is instant with no page reload
2. Each theme defines its full color palette + accent color
3. Adding a new theme requires only one CSS file
4. No hardcoded colors in components (all use CSS variables)
5. Theme preference persists in localStorage

**Plans**: 2 plans in 2 waves

Plans:
- [x] 01.1-01: Refactor color system and fix dual variable issue (THEME-01, THEME-02, THEME-03) — 4 tasks
- [x] 01.1-02: Remove hardcoded colors and add React Context (THEME-04, THEME-05) — 4 tasks

**Details**:
Refactor the theme system to use CSS variables + React Context hybrid. Fix the dual variable system (--bg0 vs --color-bg0), remove hardcoded colors from components, and structure theme files for easy community contributions. Minimal approach (CSS + human review) like Dracula/Nord themes.

### Phase 1.1.1: Frontend refactor - complete theme system migration (INSERTED)

**Goal:** Entire frontend uses theme system consistently and follows design guidelines
**Depends on:** Phase 1.1 (Theme System Refactor)
**Requirements**: THEME-06, THEME-07, THEME-08, THEME-09, THEME-10

**Success Criteria** (what must be TRUE):
1. All modals use bg-bg1 background (modal reset rule) with bg-bg2 inputs
2. All inputs have NO default border - border only appears on focus
3. All buttons follow 4 standard variants with visible hover backgrounds and cursor-pointer
4. All table rows use border-b border-tertiary except last row
5. No hardcoded hex colors in components (only database status.color as inline styles)
6. All interactive elements use transition-all duration-200 ease-in-out (navigation: duration-100)
7. All dropdowns use universal Dropdown component with 6-layer rule

**Plans**: 13 plans in 2 waves

Plans:
- [x] 01.1.1-01: Migrate modal components to theme system — 4 tasks (CreateUserModal, EditUserModal, ImportModal, StatusHistoryModal)
- [x] 01.1.1-02: Migrate form components to theme system — 4 tasks (RoundForm, DocumentSection, PasswordInput, ApplicationForm)
- [x] 01.1.1-03: Migrate page components to theme system — 5 tasks (Dashboard, Applications, ApplicationDetail, Admin, Analytics)
- [x] 01.1.1-04: Migrate analytics and dashboard components — 7 tasks (AnalyticsKPIs, WeeklyBarChart, PeriodSelector, KPICards, NeedsAttention, QuickActions, ActivityHeatmap)
- [x] 01.1.1-05: Migrate basic utility components — 4 tasks (EmptyState, Loading, Spinner, ProgressBar)
- [x] 01.1.1-06: Migrate complex utility components — 4 tasks (MediaPlayer, RoundCard, SankeyChart, Layout)
- [x] 01.1.1-07: Migrate ThemeDropdown and icon components — 4 tasks (ThemeDropdown, HistoryViewer, FeatureToggles, icon components)
- [x] 01.1.1-08: Gap closure - Add border class to 5 inputs and fix bg-white — 2 tasks (Gap Closure: border class + hardcoded colors)
- [x] 01.1.1-09: Gap closure - Fix transition inconsistencies — 2 tasks (Gap Closure: transition standard + navigation exception)
- [ ] 01.1.1-10: Gap closure - Fix modal backgrounds (bg-bg2 → bg-bg1) — 2 tasks (UAT Gap 1)
- [ ] 01.1.1-11: Gap closure - Fix button hovers and remove input borders — 4 tasks (UAT Gaps 2, 3)
- [ ] 01.1.1-12: Gap closure - Create universal Dropdown component — 4 tasks (UAT Gap 5)
- [ ] 01.1.1-13: Gap closure - Fix navigation link transitions — 2 tasks (UAT Gap 9)

**Details**:
Continuation of Phase 1.1 work - systematic frontend refactor to ensure all components use the new theme architecture and comply with design guidelines. Migration organized by functional area (modals → forms → pages → analytics → utilities) with wave-based parallel execution.

**UAT Gap Closure (Plans 10-13):**
User Acceptance Testing found 7 major gaps requiring closure:
- Gap 1: Modal backgrounds using bg-bg2 instead of bg-bg1 (wrong STATE.md decision)
- Gap 2: Inputs have default borders when they should only have borders on focus (wrong STATE.md decision)
- Gap 3: Buttons missing visible hover backgrounds, cursor-pointer, wrong icon button padding
- Gap 5: Need universal Dropdown component to replace ThemeDropdown + 7 native selects
- Gap 6: Theme switching not implemented (deferred to Phase 1.4)
- Gap 7: 11 text-red instances, 1 hardcoded hex (deferred to Phase 1.4)
- Gap 9: Navigation links should use duration-100 not duration-200

**Deferred to Phase 1.4:**
- Theme switching implementation (Gap 6)
- 12 hardcoded color issues (Gap 7)

### Phase 1.1.2: UI Inconsistency Fixes (INSERTED)

**Goal**: UI inconsistencies are fixed across dropdowns, interior round sections, separators, and icon sizing

**Depends on**: Phase 1.1.1 (Frontend refactor - complete theme system migration)

**Requirements**: UI-01, UI-02, UI-03

**Success Criteria** (what must be TRUE):
1. All dropdowns follow consistent 6-layer rule with proper styling
2. Interior round sections use consistent backgrounds and borders
3. All separators follow consistent border pattern (border-tertiary)
4. Icons use consistent sizing system across entire application
5. No visual inconsistencies across affected components

**Plans**: 13 plans in 4 waves

Plans:
- [x] 01.1.2-01: Fix Dropdown hover bug and add focus ring — 2 tasks (dropdown component)
- [x] 01.1.2-02: Fix RoundCard backgrounds and separators — 1 task (5-layer rule)
- [x] 01.1.2-03: Standardize modal separators — 1 task (5 modal components)
- [x] 01.1.2-04: Update DESIGN_GUIDELINES.md — 1 task (documentation)
- [x] 01.1.2-05: Add Bootstrap Icons ::before override and icon sizing utilities — 2 tasks (index.css)
- [x] 01.1.2-06: Update Dropdown to use icon utilities — 1 task (Dropdown.tsx)
- [x] 01.1.2-07: Refactor icons in Admin, ApplicationDetail, Settings pages — 3 tasks (8 icons)
- [x] 01.1.2-08: Refactor icons in Applications, DocumentSection, EmptyState — 3 tasks (7 icons)
- [x] 01.1.2-09: Refactor icons in modal components — 4 tasks (6 icons)
- [x] 01.1.2-10: Refactor icons in RoundCard, RoundForm — 2 tasks (12 icons)
- [x] 01.1.2-11: Refactor icons in HistoryViewer, StatusHistoryModal — 2 tasks (7 icons)
- [x] 01.1.2-12: Refactor icons in dashboard components — 2 tasks (8 icons)
- [x] 01.1.2-13: Update DESIGN_GUIDELINES.md with icon sizing system — 4 tasks (documentation)

**Details**:
Urgent UI fixes discovered during Phase 1.1.1 review and UAT. Four specific areas need attention:
- Dropdowns: Ensure all dropdowns follow universal Dropdown component patterns with 6-layer rule
- Interior round sections: Fix inconsistent backgrounds and borders in rounded container elements
- Separator consistency: Ensure all separators use border-tertiary consistently
- Icon sizing system: Bootstrap Icons don't respond to text-* utilities; create dedicated icon sizing utilities (.icon-xs through .icon-2xl) and refactor all 51 icon usages across 19 files

**Gap Closure (Plans 05-13):**
UAT found a MAJOR gap with icon sizing:
- Bootstrap Icons are font-based (rendered in ::before pseudo-element) and don't respond to Tailwind text-* utilities or explicit width/height
- Current codebase has no icon sizing utilities and no consistent system
- 51 icon usages across 19 files using ad-hoc text utilities (text-xs, text-sm, text-base, text-xl, text-5xl)
- Dropdown component was the ONLY place using explicit w-[14px] h-[14px] sizing (inconsistent)

Solution: Add .bi::before override, create icon sizing utilities (.icon-xs through .icon-2xl), refactor all 51 icon usages, update documentation.

### Phase 1.2: Repository Cleanup (INSERTED)

**Goal**: Repository is clean and ready for push before continuing

**Depends on**: Phase 1.1.2 (UI Inconsistency Fixes)

**Requirements**: CLEANUP-01, CLEANUP-02, CLEANUP-03

**Success Criteria** (what must be TRUE):
1. Root directory is clean (no junk files, organized scripts)
2. Duplicate/unused files are deleted
3. Git status shows only meaningful changes

**Plans**: 4 plans in 4 waves

Plans:
- [ ] 01.02-01: Remove junk files and directories — 3 tasks (temp/, temp2/, .playwright-mcp/)
- [ ] 01.02-02: Delete duplicate and empty phase directories — 4 tasks (01-repository-cleanup, malformed newline dir, 01.1.1-frontend-theme-migration, 01.1-frontend-refactor-cleanup-repo-cleanup)
- [ ] 01.02-03: Update .gitignore with comprehensive patterns — 2 tasks (temp2/, *.swp, *.swo, session backups, verification)
- [ ] 01.02-04: Stage deletions and commit cleanup changes — 5 tasks (git add -A, conventional commit, verify clean status)

**Details**:
Urgent cleanup discovered during Phase 2 CONTEXT AUDIT. Root directory has duplicate files, junk files, and scripts that need organizing before continuing. Three-wave cleanup approach: (1) Remove obvious junk, (2) Consolidate duplicate phase directories, (3) Stage and commit with proper conventional commit messages.

### Phase 1.3: Analytics Page (INSERTED)

**Goal**: Analytics page is polished with consistent theming and improved data visualization

**Depends on**: Phase 1.2 (Repository Cleanup)

**Requirements**: ANALYTICS-01, ANALYTICS-02, ANALYTICS-03, ANALYTICS-04

**Success Criteria** (what must be TRUE):
1. All charts use theme colors consistently
2. KPI cards have proper visual hierarchy
3. Trend indicators use correct colors (positive=green, negative=red)
4. Error states use accent-red color
5. Data visualizations are responsive and accessible

**Plans**: TBD

Plans:
- [ ] TBD (run `/gsd:plan-phase 1.3` to break down)

**Details**:
Deferred from Phase 1.1.1 UAT (Test 6) - dedicated focus on analytics page fixes and improvements. Charts, KPIs, and trend indicators need consistent theming and better data visualization.

### Phase 1.4: Theme Switching Implementation (INSERTED)

**Goal**: Theme switching works end-to-end with no hardcoded colors

**Depends on**: Phase 1.3 (Analytics Page)

**Requirements**: THEME-11, THEME-12, THEME-13

**Success Criteria** (what must be TRUE):
1. Selecting different themes in dropdown immediately applies theme changes
2. Theme preference persists in localStorage
3. All components respond to theme changes (no stuck colors)
4. No hardcoded hex colors in components (all use theme variables)

**Plans**: TBD

Plans:
- [ ] TBD (run `/gsd:plan-phase 1.4` to break down)

**Details**:
Deferred from Phase 1.1.1 UAT (Tests 8, Gap 6-7). Theme system architecture was refactored (CSS variables, React Context) but actual theme switching functionality not implemented. Also fixes 12 hardcoded color issues:
- 11 instances of text-red → text-accent-red
- 1 hardcoded hex #8ec07c → theme color reference

### Phase 2: Complete Data Import

**Goal**: Users can import job application data from exported files

**Depends on**: Phase 1.4 (Theme Switching Implementation)

**Requirements**: IMPORT-01, IMPORT-02, IMPORT-03, IMPORT-04, IMPORT-05, IMPORT-06, IMPORT-07

**Success Criteria** (what must be TRUE):
1. User can upload a JSON or ZIP export file through the Settings import modal
2. Import progress displays in real-time via SSE updates
3. Imported applications appear in the dashboard with all data intact
4. Override mode correctly replaces existing data when selected
5. Import attempts are rate-limited and audit-logged

**Plans**: TBD

Plans:
- [ ] 02-01: Implement backend import endpoint and core utilities (IMPORT-01, IMPORT-02, IMPORT-03, IMPORT-04)
- [ ] 02-02: Add security (rate limiting, audit logging) and tests (IMPORT-05, IMPORT-06, IMPORT-07)

### Phase 3: Code Refactoring & Modals

**Goal**: Codebase is maintainable and follows established patterns

**Depends on**: Phase 2 (prevents conflicts with new import code)

**Requirements**: REFACTOR-01, REFACTOR-02, REFACTOR-03, REFACTOR-04, REFACTOR-05, REFACTOR-06, MODAL-01, MODAL-02, MODAL-03, MODAL-04

**Success Criteria** (what must be TRUE):
1. Settings component is split into smaller, focused files under 300 lines each
2. Custom hooks (useLoadingState, useApiCall) are used across components
3. Application editing happens in a modal instead of separate page
4. Status history displays and manages entries through a modal interface
5. Interview rounds use inline editing (form replaces card in-place)
6. Error boundary wraps the main app

**Plans**: TBD

Plans:
- [ ] 03-01: Break up Settings component and add custom hooks (REFACTOR-01, REFACTOR-02, REFACTOR-03, REFACTOR-04, REFACTOR-05, REFACTOR-06)
- [ ] 03-02: Implement modal patterns (application edit, status history) (MODAL-01, MODAL-02, MODAL-03)
- [ ] 03-03: Implement inline editing for interview rounds (MODAL-04)

### Phase 4: Documentation

**Goal**: Developers can understand, set up, and contribute to the project

**Depends on**: Phase 3 (code structure should be stable before documenting)

**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06

**Success Criteria** (what must be TRUE):
1. README.md exists with quick start and setup instructions
2. CONTRIBUTING.md exists with development workflow and standards
3. All API endpoints are documented with request/response formats
4. Developer guide explains detailed setup and debugging
5. Frontend component patterns are documented
6. Backend patterns (database, auth, error handling) are documented

**Plans**: TBD

Plans:
- [ ] 04-01: Create README.md and CONTRIBUTING.md (DOCS-01, DOCS-02)
- [ ] 04-02: Document API endpoints and create developer guide (DOCS-03, DOCS-04)
- [ ] 04-03: Document frontend and backend patterns (DOCS-05, DOCS-06)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 1.1 → 1.1.1 → 1.1.2 → 1.2 → 1.3 → 1.4 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. UI/UX & CSS Fixes | 11/11 | ✓ Complete | 2026-01-31 |
| 1.1. Theme System Refactor (INSERTED) | 2/2 | ✓ Complete | 2026-02-01 |
| 1.1.1. Frontend refactor (INSERTED) | 13/13 | ✓ Complete | 2026-02-01 |
| 1.1.2. UI Inconsistency Fixes (INSERTED) | 13/13 | ✓ Complete | 2026-02-02 |
| 1.2. Repository Cleanup (INSERTED) | 0/3 | Not started | - |
| 1.3. Analytics Page (INSERTED) | 0/0 | Not started | - |
| 1.4. Theme Switching (INSERTED) | 0/0 | Not started | - |
| 2. Complete Data Import | 0/2 | Not started | - |
| 3. Code Refactoring & Modals | 0/3 | Not started | - |
| 4. Documentation | 0/3 | Not started | - |

---

*Roadmap created: 2026-01-31*
*Updated: 2026-02-01 (added Phases 1.3, 1.4)*
