# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning in its published release tags.

## [Unreleased]

## [0.1.4] - 2026-04-09

### Changed

- Authentication is now split cleanly by client type: the web UI uses JWT sessions, while the CLI and browser extension use scoped API keys.
- API keys now support multiple named keys per user, presets, custom scopes, and one-time secret reveal semantics.
- Application posting text is now canonicalized on `job_description`, and converted job leads inherit the visible description correctly.
- Status and round-type reference data now use shared case-insensitive normalization rules across settings, import, seeding, and conversion flows.
- Schema parity between SQLite and PostgreSQL was tightened, including normalized reference-name columns and timezone-aware PostgreSQL timestamp alignment.

### Fixed

- Frontend production dependency `axios` was updated from `1.14.0` to `1.15.0` to address `GHSA-3p68-rc4w-qgx5` / `CVE-2026-39892`.
- Converted applications now preserve `job_lead_id` and `converted_to_application_id` links during import/export round-trips under real foreign-key enforcement.
- Production PostgreSQL migrations no longer fail on overlong unreleased Alembic revision identifiers.
- Job-lead conversion now picks the correct initial status instead of arbitrary user-defined statuses such as `Wishlist`.
- Partial default seeding is now self-healing instead of silently leaving missing default statuses or round types behind.
- Legacy exported application rows that still use `description` are migrated into `job_description` during import.

### Security

- API keys are hashed at rest and accepted only via `X-API-Key`, not bearer-token fallback.
- Scoped API-key authorization is enforced across shared machine-client routes.
- Import integrity validation now fails cleanly on unresolved relationships instead of silently drifting into partial broken state.

### Validation

- Backend tests: `320 passed, 1 skipped`
- Backend Ruff, format check, and Pyright passed
- Frontend tests: `38 passed`
- Frontend build and ESLint passed
- CLI tests: `62 passed`
- CLI Ruff, format check, and Pyright passed
- Extension tests: `55 passed`
- Extension build and Prettier check passed
- Frontend production security audit passed with `yarn npm audit --all --recursive --environment production --severity high`
- Fresh SQLite `alembic upgrade head`, `alembic check`, and `alembic heads` passed
- Restored production PostgreSQL dump upgraded cleanly to head and passed `alembic check`

### Changed

- Release recovery can now be run through GitHub Actions without moving an existing tag.
- Local Git hooks use repo-local tools instead of depending on ambient global package manager state.

## [0.1.3] - 2026-03-30

### Changed

- Tarnished backend now supports deployment-configured trusted hosts so in-cluster clients can use Kubernetes service DNS without spoofing the public ingress hostname.
- Helm chart now exposes `trustedHosts` as a first-class value instead of requiring ad hoc env overrides.

### Fixed

- In-cluster service-to-service clients such as OpenClaw can now target Tarnished through internal Kubernetes service DNS when the deployment config opts in to those hostnames.

### Validation

- Backend tests: `302 passed, 1 skipped`
- Backend pyright: `0 errors, 0 warnings`
- Targeted backend Ruff checks passed for the touched files
- Standalone CLI tests: `65 passed`
- CLI wheel built successfully as `tarnished_cli-0.1.3-py3-none-any.whl`
- Helm lint and template checks passed, including `trustedHosts` env rendering

## [0.1.2] - 2026-03-28

### Added

- Standalone `tarnished-cli` package under `cli/` with its own tests, build metadata, and release artifacts.
- CLI `auth register` command, including support for the initial setup flow via `--needs-setup`.
- Dedicated CLI CI and release workflow jobs, including optional PyPI Trusted Publishing support.

### Changed

- CLI source and tests were moved out of the backend package into a separate `tarnished_cli` namespace.
- Backend packaging no longer ships the CLI executable or CLI-only runtime dependencies.
- CLI installation docs now target `uv tool install tarnished-cli` and `pipx install tarnished-cli`.

### Fixed

- WAV round-media uploads now handle libmagic WAV aliases correctly and preserve `.wav` storage.
- CLI auth storage now scopes keyring entries by config directory and profile, preventing cross-profile credential leaks.

### Validation

- Backend tests: `300 passed, 1 skipped`
- Backend pyright: `0 errors, 0 warnings`
- Standalone CLI tests: `52 passed`
- Standalone CLI Ruff and Pyright passed
- Built CLI wheel installed successfully via `uv tool install`
- Installed `tarnished` binary executed successfully against a healthy local dev instance

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
