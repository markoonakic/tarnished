# Changelog

## [0.3.8] - 2026-10-09

### Fixed

- Use shared Button and TextLink components on every screen. Keep action hover backgrounds, navigation hover colors, pointer cursors, focus rings and a 14px body font consistent.
- Place dropdowns, menus and help tips in one opaque native popover layer above cards and modal forms. Keep participant options reachable with a pointer.
- Ask for the sent date when a status move leaves an undated Preparing application. Default to today and use the same dialog on the board, detail page and edit form.
- Restore the complete Add/Edit Round form, including optional times, completion, outcome, notes, transcript and recording uploads, summaries and safe upload retries. Put the added interview fields in a separate section.
- Show an explicit next step in Profile match. Confirm existing requirements with a visible list, or start extraction before comparison. Keep permission checks and archive support.
- Align task deadline dates, use one dashboard quick-action component, make whole board cards clickable, show status transitions in activity, and expose full requirement labels on focus.
- Move remaining transcript, import, export and empty-chart explanations into help tips.

### Added

- A local Playwright UI audit for hover rules, fonts, cursors, popover layers, card gaps and help text in English and Serbian at desktop and mobile widths.
- Regression tests for every built-in status pair, round file uploads and retry, explicit requirement confirmation, owner isolation, archive round trips and shared controls. Lint prevents new handwritten buttons and links outside the shared components.

## [0.3.7] - 2026-10-09

### Fixed

- Restore complete interview round cards on application pages, including media, transcript editing, feedback, scheduled and completed times, and summary notes. Keep the interview detail page and its new fields.
- Use the existing button, link, card and hover styles across the account, profile, company, contact, lead, application, interview and task screens. Fix gaps between detail and analytics cards.
- Put analytics, board, profile, document and review explanations in translated help tips instead of footnotes. Keep disabled-action guidance in tooltips.
- Group tasks inside cards and collapse deadlines without reminders into one closed group.

### Added

- Optional browser notifications for due reminders while the app is open. Ask permission only when enabled, check each minute, remember notified IDs per account in this browser, and open Tasks when a notification is selected. No push service or background server is required.
- Tests for complete round cards, notification permission and polling, duplicate prevention, reminder owner isolation, collapsed deadlines and help tips.

## [0.3.6] - 2026-10-09

### Fixed

- Retain bounded original interview and application feedback inputs so later record changes do not prevent archive restore. Keep citation, checksum, size and same-owner reference checks.
- Skip only saved reports whose content cannot be verified, including older stale reports, and show a translated import summary. Invalid archive structure still rejects the complete import.
- Translate interview and pipeline feedback request accessible names in Serbian.
- Test stale three-scope report round trips, replaced transcript input, skipped legacy reports and tampered quotes on SQLite and PostgreSQL.

## [0.3.5] - 2026-10-09

### Fixed

- Select profile permission-count forms from the total number of items, including Serbian singular and few forms.
- Use singular English proposal and legacy pagination labels, with complete Serbian count-form coverage.
- Test profile totals in the page and include all inflected count labels in the shared language tests.

## [0.3.4] - 2026-10-09

### Fixed

- Restore ZIP archives with saved pipeline feedback, including stale reports and saved profile comparisons. Keep the original bounded input snapshot, exact citation checks and owner-scoped references; imported results remain unverified and inactive.
- Verify older pipeline reports against recorded historical status data instead of changed live statuses.
- Use correct English and Serbian preparation, pipeline and posting count forms. Check all Serbian count labels for one, few and other forms.
- Add archive round-trip coverage for saved interview, application and pipeline feedback, reviewed extraction, profile comparisons and preparation drafts.

## [0.3.3] - 2026-10-09

### Fixed

- Preserve unknown sent dates when restoring Preparing applications from an archive.
- Show explicit extraction and feedback retry dialogs instead of browser confirmation prompts.
- Keep edited and rejected proposals when accepting the remaining extraction rows.
- Refresh contact-link revisions after extraction and use only reviewed requirements after review.
- Use consistent localized dates and the selected time zone for record timestamps.
- Translate profile evidence, import phases, key presets and current extraction values; fix Serbian plurals and person labels.
- Open Questions & answers when adding a question and keep reminder shortcuts inside their card.
- Tell feedback models to use bounded exact citations instead of oversized source objects; keep the strict 2000-character validator.

## [0.3.2] - 2026-10-09

### Fixed

- Interview preparation schemas now require confirmed requirement references for
  review topics, technical topics, practice questions and profile gaps, and profile
  evidence for personal examples. Prompts use these same constraints, so missing
  citations are not presented as valid output. Source checks stay strict.

## [0.3.1] - 2026-10-08

### Fixed

- Reviewed extraction prompts now include the canonical work-mode, employment-type
  and pay-period values required by validation, while keeping original source quotes.
- Application timestamps and board interview times keep their UTC offsets on SQLite,
  so local-time displays and recent-activity ages remain correct.
- Company activity timestamps retain their offsets without changing date-only values.

## [0.3.0] - 2026-10-08

### Added

- Account requests with administrator approval, last-login information and account deletion.
- Professional profiles with per-section and per-item AI permissions.
- Companies and contacts linked to leads, applications and interviews.
- Private notes, seven reminder kinds and a Tasks page.
- Interview detail pages, preparation lists and a month/week calendar.
- Application boards, Preparing records, archives, status reasons and expanded filters.
- Lead decisions, priorities, tags, deadlines and additional document attachments.
- Dashboard pipeline, upcoming interviews, tasks and recent activity.
- Response and stage statistics, source outcomes, activity history and requirement summaries.
- Reviewed AI extraction, profile evidence comparisons and selected preparation drafts.
- English and Serbian (Latin script) interface languages.

## [0.2.5] - 2026-10-05

### Fixed

- Saved feedback no longer displays internal fallback text or per-finding limitation notes.

## [0.2.4] - 2026-10-05

### Added

- Application sorting by applied date, company, status and last update, with
  stable pagination and URL state.

### Fixed

- Unknown model-output fields are dropped in every feedback scope, with safe
  diagnostic categories. Required fields, types and grounding checks stay strict.
- Independent pipeline sections run up to three at a time. Findings and durable
  checkpoints keep their source order, deadlines and safe interruption handling.
- Feedback always shows its saved period. Starting and running labels use the
  requested period, not a later chart selection.
- Job extraction preserves stated net/gross pay, pay period, employment terms
  and conditions such as no initial on-call duty.
- Later report sections retain saved round dates and outcomes. Advice treats
  completed rounds as past and distinguishes future practice from a next round.
- The settings guide explains that some models on OpenAI-compatible proxies
  require Chat Completions even when the proxy also offers the Responses API.

## [0.2.3] - 2026-10-05

### Fixed

- Pipeline feedback accepts JSON citations with equal values despite differences in
  spacing, key order, Unicode escaping or number format. Fabricated values and
  records outside the selected sources remain rejected (#85).
- Feedback reports can use one JSON code fence or plain surrounding text. Invalid
  JSON still fails with a safe parse error category (#85).
- Each pipeline section keeps original metric context, and the prompt requires a
  metric citation in every finding (#85).
- Extra feedback findings, citations and coaching items are reduced to display
  limits only after validation. Kept citation pointers are remapped safely.
- Queued feedback panels keep checking status when another round or browser tab
  has focus, so completed reports appear without a reload.
- Provider reasoning metadata has a separate bounded response allowance. Report
  text keeps its 100 KB limit, and pipeline sections have a five-minute deadline.

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
