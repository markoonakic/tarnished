# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning in its published release tags.

## [Unreleased]

### Changed

- Release recovery can now be run through GitHub Actions without moving an existing tag.
- Local Git hooks use repo-local tools instead of depending on ambient global package manager state.

## [0.1.1] - 2026-03-28

### Added

- Focused tests for admin user search request wiring and extension iframe autofill routing.
- Release-readiness and CLI feasibility review notes for this release cycle.

### Changed

- Import validation and execution were extracted into dedicated backend services.
- Extension popup, background, and content logic were split into smaller modules with stronger boundaries.
- Frontend application detail, admin page state, and modal logic were compacted and cleaned up.
- CI coverage was tightened for frontend and extension test suites.

### Fixed

- Admin user search now filters server-side and preserves correct pagination and totals.
- Application modal draft state is preserved more reliably while async status data loads.
- Pagination query handling is clamped safely for invalid values.
- Import/export validation and error contracts are more predictable.
- Extension iframe autofill no longer broadcasts profile data to unrelated iframes.
- Analytics insight generation and extraction boundaries are more stable across supported LiteLLM providers.

### Security

- ZIP handling and import-related file safety checks were hardened.
- Backend dependency audit policy was aligned across CI and release workflows.
- Backend dependencies were refreshed to address current release-audit findings where patched versions were available.

### Validation

- Backend tests: `294 passed, 1 skipped`
- Backend pyright: `0 errors, 0 warnings`
- Frontend lint, typecheck, tests, and build passed
- Extension typecheck, tests, and build passed
- Helm lint/template checks passed
- Local smoke tests were run against a copied PostgreSQL dataset from a real instance
- Browser QA covered login, applications search, create flow, and reload persistence
- AI insights were verified locally through Cerebras-backed LiteLLM configuration

### Notes

- `v0.1.1` is an immutable release tag. Any post-tag release pipeline fixes are handled on `main` and recovered via manual release workflow dispatch instead of moving the tag.
