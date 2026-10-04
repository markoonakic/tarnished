# Changelog

## [0.2.2] - 2026-10-04

### Fixed

- Clearer password rules and speech presets that keep the selected option (#80).
- Automatic recovery of saved data after connection failures (#81).
- Job-lead save notifications, untitled leads, a transcription dialog and shorter
  feedback panels (#82).
- More reliable feedback with valid source checks and plain error messages (#83).

## [0.2.1] - 2026-10-03

### Added

- Browser first-run admin setup with one-time, race-safe account creation.
- Password confirmation and automatic sign-in after first-run setup.

### Fixed

- The setup page no longer shows an incorrect command. After setup, it explains
  that accounts are managed by an administrator.
- Quick-start instructions use browser setup; the manage CLI remains available
  for account recovery.

## [0.2.0] - 2026-10-02

### Added

- Save job leads without AI, edit their fields and convert them into applications
  from the web app, CLI or browser extension.
- Interview audio/video transcription with separate speech configuration and an
  optional local English speech service.
- Editable transcripts with speaker roles and passage references.
- Saved interview, application and pipeline feedback with source citations,
  explicit generation and outdated-result indicators.
- Compatible text services using Chat Completions or the Responses API.
- Admin-managed accounts, password changes, session controls and host-only owner
  setup and recovery.
- Device and manual time zones, plus optional dashboard sections.

### Changed

- Dashboard and analytics use consistent local-day calculations and recorded
  application evidence. Missing history remains distinct from confirmed outcomes.
- Application documents, response facts and status history can be corrected with
  revision checks through the web app and CLI.
- API-key scopes apply to reports, transcript processing and structured archives.
- Compose installs use a pinned image and prepare storage before startup.
- CI checks SQLite and PostgreSQL, extension packages and documentation builds.
- Dependency and GitHub Actions versions were updated.

### Fixed

- Theme and user preference updates no longer overwrite each other.
- Dashboard data refreshes after related changes; analytics does not substitute
  sample data when an API request fails.
- Zero-baseline KPI changes show `New`; unchanged values show neutral `0%`.
- Helm migration containers receive the configured environment sources.
- Helm-only release publication works when container publication is disabled.

## [0.1.7] - 2026-04-11

### Fixed

- CLI help output works with Homebrew smoke tests and styled terminal output.

## [0.1.6] - 2026-04-11

### Added

- CLI `auth init`, `auth whoami` and `auth doctor` for API-key authentication.
- Backend `/api/auth/whoami` identity endpoint.

### Fixed

- Audio MIME detection during ZIP import/export.

## [0.1.5] - 2026-04-11

### Changed

- Durable import and ZIP-export jobs with progress and failure information.
- Shared analytics queries and scoped API access across clients.

### Fixed

- Import rollback, file-path safety and PostgreSQL foreign-key parity.
- Job-lead conversion and archive relationships across database modes.

## [0.1.4] - 2026-04-09

### Changed

- Separate JWT browser sessions and scoped API keys for machine clients.
- API-key presets, canonical job descriptions and normalized reference names.

### Fixed

- PostgreSQL migrations, default seeding and imported application relationships.
- Axios security update.

## [0.1.3] - 2026-03-30

### Added

- Deployment-configured trusted hosts and matching Helm values.

## [0.1.2] - 2026-03-28

### Added

- Standalone CLI package and release distributions.

### Fixed

- WAV MIME aliases and profile-scoped CLI keyring storage.

## [0.1.1] - 2026-03-28

### Changed

- Smaller import services, extension modules and frontend state helpers.
- Frontend and extension test coverage in CI.

### Fixed

- Admin search pagination, modal state, import errors and iframe data isolation.
- ZIP handling and dependency security updates.
