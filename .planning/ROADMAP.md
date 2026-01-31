# Roadmap: Job Tracker Improvements

## Overview

This roadmap delivers improvements to the existing Job Tracker application in four focused phases. We start with visible UI/UX fixes that users notice immediately, then complete the partially-built data import feature, refactor code for maintainability, and finish with comprehensive developer documentation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: UI/UX & CSS Fixes** - Visual consistency and styling improvements (Completed 2026-01-31)
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

**Plans**: 4 plans in 1 wave

Plans:
- [x] 01-00: Create frontend and backend design guidelines files — 2 tasks
- [x] 01-01: Fix button hover styling and consistency (UIUX-01, UIUX-02, UIUX-03, UIUX-04, UIUX-08, UIUX-09) — 2 tasks
- [x] 01-02: Fix input focus states and CSS class generation (UIUX-07, CSS-01, CSS-02) — 2 tasks
- [x] 01-03: Fix badge colors and visual hierarchy (UIUX-05, UIUX-06, UIUX-10, CSS-03) — 3 tasks (with human verification)
- [x] 01-04: 5-Color Gruvbox Layering Fixes — 8 tasks (comprehensive audit fixes)

### Phase 2: Complete Data Import

**Goal**: Users can import job application data from exported files

**Depends on**: Nothing (feature-independent)

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
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. UI/UX & CSS Fixes | 4/4 | Complete | 2026-01-31 |
| 2. Complete Data Import | 0/2 | Not started | - |
| 3. Code Refactoring & Modals | 0/3 | Not started | - |
| 4. Documentation | 0/3 | Not started | - |

---

*Roadmap created: 2026-01-31*
