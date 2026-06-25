# Code Context

## Files Retrieved

High-signal files read for architecture mapping:

1. `README.md` (lines 1-132) - product summary, install paths, core env vars.
2. `CONTRIBUTING.md` (lines 21-103) - local dev, test, and deployment validation commands.
3. `frontend/package.json` (lines 1-72) - React/Vite/Yarn scripts and dependencies.
4. `frontend/src/main.tsx` (lines 1-24) - React entry, React Query provider.
5. `frontend/src/App.tsx` (lines 1-178) - route map and auth/theme/toast providers.
6. `frontend/src/lib/api.ts` (lines 1-226) - API base URL, JWT storage, refresh, Axios interceptors.
7. `frontend/vite.config.ts` (lines 1-55) - Vite build chunking and dev `/api` proxy.
8. `backend/pyproject.toml` (lines 1-114) - FastAPI/SQLAlchemy/Alembic deps and backend tooling.
9. `backend/app/main.py` (lines 1-151) - FastAPI app wiring, middleware, routers, health, static SPA serving.
10. `backend/app/core/config.py` (lines 1-142) - env settings, DB URL selection, upload path safety.
11. `backend/app/core/database.py` (lines 1-35) - async SQLAlchemy engine/session/Base.
12. `backend/app/core/deps.py` (lines 1-212) - JWT/API-key auth dependencies and admin checks.
13. `backend/app/core/security.py` (lines 1-204) - password hashing, JWTs, file tokens, API key encryption/hash.
14. `backend/app/core/seed.py` (lines 1-74) - default statuses and interview round types.
15. `backend/app/models/__init__.py` (lines 1-28) - model import registry.
16. `backend/app/models/application.py` (lines 1-167) - core application/status-history model.
17. `backend/app/models/job_lead.py` (lines 1-102) - job lead/extraction model.
18. `backend/app/models/round.py` (lines 1-75) - interview round/media model.
19. `backend/alembic/env.py` (lines 1-70) - migration runtime setup.
20. `backend/alembic.ini` (lines 1-149) - Alembic config.
21. `backend/alembic/versions/*.py` (revision/down_revision lines) - migration chain from initial schema to current head.
22. `Dockerfile` (lines 1-89) - production multi-stage image.
23. `entrypoint.sh` (lines 1-22) - container startup, secret generation, migrations, uvicorn.
24. `.dockerignore` (lines 1-77) - image context exclusions.
25. `deploy/compose/docker-compose.yml` (lines 1-10) - SQLite-backed Compose install.
26. `deploy/compose/docker-compose.postgres.yml` (lines 1-34) - PostgreSQL-backed Compose install.
27. `.env.example` (lines 1-27) - packaged deployment env examples.
28. `deploy/README.md` (lines 1-23) and `deploy/compose/README.md` (lines 1-15) - deployment asset layout.
29. `deploy/helm/tarnished/Chart.yaml` (lines 1-33) - Helm chart metadata.
30. `deploy/helm/tarnished/values.yaml` (lines 1-259) - Helm defaults and configurable surfaces.
31. `deploy/helm/tarnished/templates/deployment.yaml` (lines 1-186) - Kubernetes Deployment, init migration, probes, persistence.
32. `deploy/helm/tarnished/templates/{secret,persistentvolumeclaim,service,ingress,cleanup-cronjob}.yaml` (full files) - Helm support resources.
33. `.github/workflows/ci.yml` (lines 1-249) - PR validation.
34. `.github/workflows/release.yml` (lines 1-505) - release checks plus Docker/Helm/CLI publishing.
35. `.github/workflows/docs.yml` (lines 1-76), `.github/workflows/homebrew-tap.yml` (lines 1-159), `.github/dependabot.yml` (lines 1-72), `.github/workflows/dependabot-auto-merge.yml` (lines 1-37) - docs/dependency/CLI release support.

## Key Code

### Interview talking points

- **What it is:** Tarnished is a self-hosted job application tracker. It tracks applications, job leads, interview rounds, documents/media, analytics, imports/exports, and optional AI extraction/insights (`README.md:1-132`).
- **Frontend is thin:** React 19 + TypeScript + Vite + Tailwind, with React Query and React Router (`frontend/package.json:20-61`, `frontend/src/main.tsx:1-24`, `frontend/src/App.tsx:68-154`). Pages call small API helpers in `frontend/src/lib/*`.
- **Backend owns product logic:** FastAPI app registers routers for auth, applications, job leads, rounds/files, dashboard/analytics/streak, settings/admin, import/export, and AI insights (`backend/app/main.py:113-130`; router prefixes visible in `backend/app/api/*.py`).
- **Database:** async SQLAlchemy, SQLite fallback for simple self-hosting, PostgreSQL via `DATABASE_URL` or discrete `POSTGRES_*` env vars (`backend/app/core/config.py:15-63`, `backend/app/core/database.py:1-35`).
- **Files:** uploaded CVs, cover letters, transcripts, and media are stored on disk under `UPLOAD_DIR`; DB rows hold file paths. Production defaults mount `/app/data/uploads` (`Dockerfile:63-65`; Helm uses `/app/data/uploads` in `deployment.yaml:136-137`).
- **Auth:** JWT access/refresh tokens for browser sessions plus scoped API keys for integrations (`backend/app/core/deps.py:1-212`, `backend/app/core/security.py:1-204`). First account becomes admin (`backend/app/api/auth.py:31-151`).
- **AI:** LiteLLM-backed job extraction and analytics insights are optional and use user-provided settings/API key (`backend/pyproject.toml:26-28`, services under `backend/app/services/`).

### Important mechanics by file

- `backend/app/main.py:43-50` seeds default statuses/round types during lifespan startup; `main.py:133-135` exposes `/health`; `main.py:139-150` serves the built SPA from `static/` in production.
- `backend/app/core/config.py:40-63` picks DB in this order: explicit `DATABASE_URL`, then `POSTGRES_*`, then SQLite at `./data/app.db`.
- `backend/alembic/env.py:10-24` imports models and injects the runtime DB URL; `entrypoint.sh:17-22` runs `alembic upgrade head` before starting uvicorn.
- `frontend/vite.config.ts:45-48` proxies dev `/api` traffic to `http://localhost:5577`; in Docker, `Dockerfile:9-10` builds with `VITE_API_URL=""` so the SPA calls same-origin `/api`.
- `Dockerfile:2-89` builds frontend, installs backend deps with uv, copies migrations/backend/static into a non-root Python runtime, exposes 5577, and health-checks `/health`.
- `deploy/helm/tarnished/templates/deployment.yaml:47-51` uses a migration init container; `deployment.yaml:2-12` rejects unsafe multi-replica SQLite/non-shared-storage configs.

## Architecture

### Runtime flow

```text
Browser
  -> React SPA
     - dev: Vite on localhost:5173 proxies /api to backend localhost:5577
     - prod: FastAPI serves static SPA and /api from same container/origin
  -> FastAPI routers under /api
  -> SQLAlchemy async sessions
  -> SQLite file OR PostgreSQL
  -> upload filesystem volume for documents/media
```

### Frontend map, very light

- Entry: `frontend/src/main.tsx` mounts React and wraps app in `QueryClientProvider`.
- Routing/providers: `frontend/src/App.tsx` wraps routes in browser router, theme/auth/toast providers, and protected/public route guards.
- API client: `frontend/src/lib/api.ts` uses `VITE_API_URL || ''`, stores tokens in `localStorage`, adds Bearer auth, refreshes tokens on 401, and supports time-zone headers.
- Main feature routes: dashboard, job leads, applications, application detail, analytics, settings, admin.

### Backend map, high level only

- Entry: `backend/app/main.py` constructs the FastAPI app, middleware, rate limiter, router includes, `/health`, and static SPA catch-all.
- Core modules:
  - `core/config.py`: env-driven settings and DB URL construction.
  - `core/database.py`: async SQLAlchemy engine/session/Base.
  - `core/deps.py` + `core/security.py`: JWT, API keys, admin/current-user dependencies.
  - `core/seed.py`: default reference data.
- API routers are grouped by feature: auth/users/admin, applications/history, job leads, rounds/files, dashboard/analytics/streak/insights, settings/profile/preferences, import/export.
- Services contain non-router logic: AI extraction/insights, import/export/transfer jobs, analytics queries, reference data, storage cleanup.

### Database and migrations

- Primary model tables include: `users`, `user_api_keys`, `user_profiles`, `applications`, `application_status_history`, `application_statuses`, `rounds`, `round_media`, `round_types`, `job_leads`, `system_settings`, `audit_logs`, and `transfer_jobs` (`backend/app/models/*.py`).
- Migrations live in `backend/alembic/versions/`; initial revision is `c1f1dc6361b7_initial_schema.py`, current observed head is `20260411_job_lead_fk_name` via the revision chain.
- Local and packaged startup both rely on Alembic. Docker/Helm automate it; local dev should run migrations when schema changes.
- SQLite is default/simple mode. PostgreSQL is supported by asyncpg/psycopg and is the expected production path for multi-user or multi-replica scenarios.

### Docker, Compose, Helm, CI connection

- **Docker image:** one container contains backend + built frontend. It starts with `entrypoint.sh`, creates `/app/data/uploads`, auto-generates `SECRET_KEY` if needed, runs Alembic, then `uvicorn app.main:app --host 0.0.0.0 --port 5577`.
- **Compose SQLite:** `deploy/compose/docker-compose.yml` runs only the app image, maps `${APP_PORT:-5577}:5577`, and persists `./data:/app/data`.
- **Compose PostgreSQL:** `deploy/compose/docker-compose.postgres.yml` adds `postgres:16-alpine`, persists `./postgres_data`, passes `POSTGRES_*` to the app, and waits for DB health.
- **Helm:** chart defaults to one replica, PVC persistence, optional ingress, optional external PostgreSQL, `/health` probes, init migration container, and optional upload-cleanup CronJob. Multiple replicas require PostgreSQL plus shared upload storage.
- **CI:** `.github/workflows/ci.yml` runs backend checks/tests/security, frontend lint/type/test/build, CLI checks, deployment validation (`docker compose config`, `docker build`, `helm lint/template`), and extension checks when changed.
- **Release:** `.github/workflows/release.yml` repeats release-grade checks, updates GitHub release notes, publishes Docker images to GHCR, scans with Trivy, packages/pushes the Helm chart to GHCR OCI, and can publish CLI artifacts/PyPI and extension ZIPs.

### Local dev commands

From `CONTRIBUTING.md` plus config gotchas:

```bash
# Backend
cd backend
uv sync
# ensure SECRET_KEY exists in backend/.env or env; optional DATABASE_URL/POSTGRES_* for PostgreSQL
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 5577

# Frontend, separate terminal
cd frontend
yarn install
yarn dev
```

Validation commands:

```bash
# Backend
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check
uv run pyright

# Frontend
cd frontend
yarn lint
npx tsc --noEmit
yarn test:run
yarn build

# Deployment surfaces
docker compose -f deploy/compose/docker-compose.yml config
POSTGRES_PASSWORD=test-password docker compose -f deploy/compose/docker-compose.postgres.yml config
docker build -t tarnished:local .
helm lint deploy/helm/tarnished
helm template tarnished ./deploy/helm/tarnished
```

Note: docs show `uv run uvicorn app.main:app --reload` without a port, but Vite proxies `/api` to 5577; use `--port 5577` locally unless you change the proxy/API URL.

## Start Here

Open `README.md` first for the product/deployment narrative, then `backend/app/main.py` for how the API and production SPA are wired. For deployment/CI interview prep, jump next to `Dockerfile`, `entrypoint.sh`, `deploy/compose/*.yml`, `deploy/helm/tarnished/values.yaml`, and `.github/workflows/ci.yml`.

## Supervisor coordination

No supervisor decision needed. Read-only recon completed; no project/source files were modified. Only this requested artifact was written.
