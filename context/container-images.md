# Container images & runtime config — interview context

Scope: production Docker image, Docker Compose install files, backend startup/runtime config, Helm/Kubernetes deployment, and CI/release image publishing. No source files were modified; this is a read-only findings artifact.

## Executive summary

- **One production image contains both app layers**: Vite/React static assets are built first, Python dependencies are built second, then a final `python:3.12-alpine` runtime serves both API and SPA from FastAPI/Uvicorn on port `5577` (`Dockerfile:1-10`, `Dockerfile:12-37`, `Dockerfile:39-89`).
- **No nginx runtime config exists**. Static assets are served by FastAPI when `/app/static` exists; API calls are same-origin because the Docker build sets `VITE_API_URL=""` and frontend falls back to `''` / `window.location.origin` (`Dockerfile:9`, `frontend/src/lib/api.ts:3`, `backend/app/main.py:138-151`).
- **Runtime entrypoint is simple self-hosting oriented**: create `/app/data/uploads`, auto-generate `SECRET_KEY` under `/app/data/.secret_key` if absent, run Alembic migrations, then exec Uvicorn (`entrypoint.sh:4-22`).
- **Deploy surfaces**: Compose defaults to `ghcr.io/markoonakic/tarnished:latest`; Helm defaults to `ghcr.io/markoonakic/tarnished:<Chart.appVersion>` (`deploy/compose/docker-compose.yml:3`, `deploy/helm/tarnished/values.yaml:6-12`, `deploy/helm/tarnished/Chart.yaml:5-6`).
- **Pipelines validate and publish images**: CI validates Compose config, builds `tarnished:ci`, and renders Helm scenarios; release builds/pushes multi-arch `linux/amd64,linux/arm64` images to GHCR with version/minor/latest tags depending on release mode, then runs Trivy for CRITICAL findings (`.github/workflows/ci.yml:145-185`, `.github/workflows/release.yml:43-120`, `.github/workflows/release.yml:442-482`).

## Production Docker image

### Build context and ignored files

- Build context is repo root (`docker build -t tarnished:ci .` in CI; Buildx `context: .` in release) (`.github/workflows/ci.yml:158-159`, `.github/workflows/release.yml:466-474`).
- `.dockerignore` removes VCS/tooling, docs, deploy assets, CLI/extension, local envs, tests, local DB/uploads/logs, and recursive Docker files (`.dockerignore:1-34`, `.dockerignore:36-57`, `.dockerignore:74-77`).
- Important security note: `backend/.env*`, root `.env*`, local DBs, backend `data/`, `uploads/`, logs, tests, and scripts are excluded from image context (`.dockerignore:43-57`, `.dockerignore:74-77`).

### Stages and dependency install strategy

| Stage | Base | Purpose | Key details |
| --- | --- | --- | --- |
| `frontend-builder` | `node:22-alpine` | Build React/Vite SPA | Copies frontend package metadata first for cache; `corepack enable && yarn install`; `VITE_API_URL=""`; `yarn build` (`Dockerfile:1-10`). |
| `builder` | `python:3.12-alpine` | Build Python venv | Installs Alpine build deps (`build-base`, `libffi-dev`, `postgresql-dev`, `gcc`, `musl-dev`); copies `uv` from `ghcr.io/astral-sh/uv:latest`; `uv sync --locked --no-dev --no-install-project` into `/app/.venv` (`Dockerfile:12-37`). |
| final runtime | `python:3.12-alpine` | Run app | Upgrades APK packages, installs runtime libs (`libpq`, `postgresql-libs`, `libmagic`, `libffi`, `curl`), creates UID/GID 1000 `appuser`, copies venv/app/alembic/static/entrypoint, exposes 5577, healthchecks `/health`, runs as non-root (`Dockerfile:39-89`). |

Notes to mention:
- Dockerfile intentionally does **not** use `yarn install --immutable` due a Corepack cacheKey mismatch; CI validates the frontend lockfile separately (`Dockerfile:5-7`, `.github/workflows/ci.yml:115-137`).
- Backend project itself is not installed into site-packages (`--no-install-project`); runtime imports copied `backend/app` from `/app` (`Dockerfile:33-37`, `Dockerfile:67-70`).
- The entire venv is copied from builder to runtime to preserve entry point shebangs (`Dockerfile:59-60`).
- The final image labels point to `https://github.com/markoonakic/tarnished` and describe the image (`Dockerfile:79-81`).

### Final runtime image and startup

- Runtime env baked into image: `PYTHONUNBUFFERED=1`, `PATH=/app/.venv/bin:$PATH`, `UPLOAD_DIR=/app/data/uploads` (`Dockerfile:62-65`).
- Uvicorn binds `0.0.0.0:5577`; image exposes `5577`; healthcheck hits `http://localhost:5577/health` (`entrypoint.sh:21-22`, `Dockerfile:83-87`).
- Entrypoint always runs `alembic upgrade head` before serving (`entrypoint.sh:17-19`). Alembic takes DB config from the same settings layer as the app (`backend/alembic/env.py:19-20`).

## Backend runtime config consumed by containers

- Settings are loaded via Pydantic settings with `env_file=".env"`, but packaged images do not copy local `.env` files (`backend/app/core/config.py:12-13`, `.dockerignore:43-44`, `.dockerignore:74-77`).
- Database priority is: `DATABASE_URL` → discrete PostgreSQL vars (`POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, etc.) → SQLite at `./data/app.db` (`backend/app/core/config.py:15-26`, `backend/app/core/config.py:40-63`). In the image, working dir is `/app`, so SQLite persists at `/app/data/app.db` when `/app/data` is mounted (`Dockerfile:51`, `deploy/compose/docker-compose.yml:6-7`).
- `SECRET_KEY` is required by settings (`backend/app/core/config.py:28`), but the production entrypoint generates and exports one before migrations if missing (`entrypoint.sh:7-15`).
- `APP_URL` influences CORS and TrustedHost; trusted hosts include `localhost`, `127.0.0.1`, `test`, the host derived from `APP_URL`, and extra `TRUSTED_HOSTS` values (`backend/app/core/config.py:36-38`, `backend/app/core/config.py:65-82`, `backend/app/main.py:56-73`).
- Static frontend is served by FastAPI from `static/assets` and fallback `static/index.html`; no external web server is in the image (`backend/app/main.py:138-151`).
- Health endpoint returns `{"status":"healthy"}` (`backend/app/main.py:133-135`).

## Docker Compose deployment surfaces

### Default SQLite Compose

- Runs only the app image, defaulting to `ghcr.io/markoonakic/tarnished:latest` (`deploy/compose/docker-compose.yml:1-3`).
- Host port is configurable via `APP_PORT`, but container port remains `5577` (`deploy/compose/docker-compose.yml:4-5`).
- Bind mounts `./data:/app/data`, so SQLite DB, uploads, and generated `.secret_key` persist under the local `data` directory (`deploy/compose/docker-compose.yml:6-7`, `entrypoint.sh:4-15`).
- Passes only `APP_URL` into the app (`deploy/compose/docker-compose.yml:8-9`).

### PostgreSQL Compose

- App still uses the same published image, plus a `postgres:16-alpine` service (`deploy/compose/docker-compose.postgres.yml:1-3`, `deploy/compose/docker-compose.postgres.yml:20-21`).
- App receives discrete PostgreSQL env vars and `APP_URL`; `POSTGRES_PASSWORD` is required with Compose fail-fast syntax (`deploy/compose/docker-compose.postgres.yml:8-14`).
- App waits for DB service health (`condition: service_healthy`); DB healthcheck runs `pg_isready` every 5s with 10s start period and 5 retries (`deploy/compose/docker-compose.postgres.yml:15-18`, `deploy/compose/docker-compose.postgres.yml:28-33`).
- App data/uploads persist in `./data`; PostgreSQL data persists in `./postgres_data` (`deploy/compose/docker-compose.postgres.yml:6-7`, `deploy/compose/docker-compose.postgres.yml:22-23`).

### Compose env examples

- Compose `.env.example` advertises `TARNISHED_IMAGE`, `APP_PORT`, `APP_URL`, and `POSTGRES_PASSWORD` (`deploy/compose/.env.example:1-13`).
- Root `.env.example` also lists backend knobs such as `DATABASE_URL`, discrete PostgreSQL vars, and `SECRET_KEY` (`.env.example:13-27`). Caveat: Docker Compose does not pass every `.env` key automatically; the packaged compose files only inject the keys explicitly listed under `environment`.

## Helm / Kubernetes deployment surface

### Chart metadata and image selection

- Chart is `tarnished` version/appVersion `0.1.7` and requires Kubernetes `>=1.23.0-0` (`deploy/helm/tarnished/Chart.yaml:1-7`).
- Image defaults: repository `ghcr.io/markoonakic/tarnished`, tag empty means `.Chart.AppVersion`, pull policy `IfNotPresent` (`deploy/helm/tarnished/values.yaml:6-12`, `deploy/helm/tarnished/templates/deployment.yaml:49-50`, `deploy/helm/tarnished/templates/deployment.yaml:98-99`).
- Artifact Hub annotation references `ghcr.io/markoonakic/tarnished:0.1.7` (`deploy/helm/tarnished/Chart.yaml:31-33`).

### Pod, ports, probes, and storage

- Default `replicaCount: 1`; SQLite must stay single-replica. Templates fail when multiple replicas are requested without PostgreSQL and shared upload storage (`deploy/helm/tarnished/values.yaml:1-4`, `deploy/helm/tarnished/templates/deployment.yaml:1-13`).
- Default pod security runs as UID/GID 1000 with `fsGroup: 1000`, `runAsNonRoot`, seccomp RuntimeDefault; container drops all capabilities and leaves root FS writable because app writes `/app/data` (`deploy/helm/tarnished/values.yaml:38-52`).
- App container exposes named port `http` at `5577`; Service defaults to ClusterIP port `5577` targeting that named port (`deploy/helm/tarnished/templates/deployment.yaml:100-103`, `deploy/helm/tarnished/templates/service.yaml:1-14`).
- Liveness/readiness/startup probes all hit `/health` on named port `http` with `Host: localhost` to satisfy TrustedHostMiddleware defaults (`deploy/helm/tarnished/values.yaml:167-220`).
- Persistence defaults to an app PVC of `1Gi`, `ReadWriteOnce`, mounted at `/app/data`; chart-managed PVC is annotated `helm.sh/resource-policy: keep` (`deploy/helm/tarnished/values.yaml:81-99`, `deploy/helm/tarnished/templates/deployment.yaml:161-174`, `deploy/helm/tarnished/templates/persistentvolumeclaim.yaml:1-20`).

### Helm env/secrets/config

- PostgreSQL mode is controlled by `.Values.postgresql.*`; if enabled, chart requires either `postgresql.password` or `postgresql.existingSecret` (`deploy/helm/tarnished/values.yaml:101-118`, `deploy/helm/tarnished/templates/secret.yaml:1-4`).
- Deployment injects discrete PostgreSQL vars into both the migration init container and app container. Password can come from an existing Secret, or from an inline Helm value (`deploy/helm/tarnished/templates/deployment.yaml:56-75`, `deploy/helm/tarnished/templates/deployment.yaml:108-127`).
- `secretKey.existingSecret` injects `SECRET_KEY` into init and app containers; if not set, the image entrypoint is expected to auto-generate on app startup (`deploy/helm/tarnished/values.yaml:120-125`, `deploy/helm/tarnished/templates/deployment.yaml:77-83`, `deploy/helm/tarnished/templates/deployment.yaml:129-135`).
- `UPLOAD_DIR` is explicitly set to `/app/data/uploads` for the app container (`deploy/helm/tarnished/templates/deployment.yaml:136-137`).
- Ingress, when enabled, creates a networking.k8s.io/v1 Ingress and sets app `APP_URL` from protocol + host; class, annotations, paths, TLS are configurable (`deploy/helm/tarnished/values.yaml:60-79`, `deploy/helm/tarnished/templates/ingress.yaml:1-35`, `deploy/helm/tarnished/templates/deployment.yaml:138-140`).
- `trustedHosts` renders a comma-separated `TRUSTED_HOSTS` env var; `env` appends arbitrary env vars; `envFrom` is wired only on the main app container (`deploy/helm/tarnished/values.yaml:127-138`, `deploy/helm/tarnished/templates/deployment.yaml:142-151`).

### Helm migrations and cleanup

- Every pod has a `migrate` init container running `alembic upgrade head` with the same image before app startup (`deploy/helm/tarnished/templates/deployment.yaml:47-93`).
- Main app container still uses the image entrypoint, which also runs `alembic upgrade head` before Uvicorn (`entrypoint.sh:17-22`, `deploy/helm/tarnished/templates/deployment.yaml:94-164`).
- Deployment strategy is `Recreate` for SQLite and `RollingUpdate` for PostgreSQL (`deploy/helm/tarnished/templates/_helpers.tpl:64-77`).
- Optional cleanup CronJob uses the app image, mounts the same data PVC, reads `.secret_key` from `/app/data/.secret_key` if env `SECRET_KEY` is absent, and runs `python -m app.lib.cleanup_orphan_uploads`; default mode is dry-run (`deploy/helm/tarnished/values.yaml:231-259`, `deploy/helm/tarnished/templates/cleanup-cronjob.yaml:1-121`).
- Helm test uses `busybox:1.36.1` to wget the service `/health` endpoint (`deploy/helm/tarnished/templates/tests/test-connection.yaml:1-23`).

## CI / release / registry flow

- CI `deployment` job validates both Compose files, builds the production image locally, then lints/templates Helm scenarios including cleanup, PostgreSQL, and multi-replica storage cases (`.github/workflows/ci.yml:145-185`).
- Release metadata resolves version/ref and emits Docker tags: always `ghcr.io/<owner>/tarnished:<version>`; tag pushes also publish `<major>.<minor>` and `latest`, while manual releases only do rolling tags if requested (`.github/workflows/release.yml:73-120`).
- Release `deployment-checks` repeats Compose validation, image build, and Helm rendering before publishing (`.github/workflows/release.yml:280-323`).
- Docker release job uses QEMU + Buildx, logs into GHCR, builds multi-arch `linux/amd64,linux/arm64`, pushes tags, uses registry cache `:buildcache`, then runs Trivy with `exit-code: 1` for `CRITICAL` severity (`.github/workflows/release.yml:442-482`).
- Helm release job packages the chart with release version/appVersion and pushes it as OCI to `ghcr.io/<owner>/charts` (`.github/workflows/release.yml:484-505`).

## Non-production container config

- `.devcontainer/Dockerfile` is separate from production. It uses `mcr.microsoft.com/devcontainers/base:ubuntu-24.04`, copies `mise` from `jdxcode/mise`, and activates mise in bash/zsh (`.devcontainer/Dockerfile:1-7`).
- `.devcontainer/devcontainer.json` builds from `.devcontainer/Dockerfile` with repo root context, mounts a local secrets zsh file read-only, and forwards dev ports `4747`, `5173`, `5175`, `8000` (`.devcontainer/devcontainer.json:1-10`).

## Interview-ready risks / tradeoffs

- **Simplicity vs separation of concerns**: single image and one Uvicorn process serve API and SPA; no nginx sidecar/config. This reduces operational moving parts, but FastAPI handles static file serving too (`backend/app/main.py:138-151`).
- **Mutable base/tool tags**: `node:22-alpine`, `python:3.12-alpine`, `ghcr.io/astral-sh/uv:latest`, Compose default `latest`, and `apk upgrade` improve ease/security updates but reduce reproducibility compared with digest-pinned builds (`Dockerfile:2`, `Dockerfile:13`, `Dockerfile:26`, `Dockerfile:40-49`, `deploy/compose/docker-compose.yml:3`). Helm is more deterministic by default because it uses chart appVersion when `image.tag` is empty (`deploy/helm/tarnished/values.yaml:6-12`).
- **Alpine/musl tradeoff**: small final image, but C-extension dependencies require build deps in a builder stage and matching runtime libs (`Dockerfile:15-21`, `Dockerfile:42-49`).
- **Docker build lockfile tradeoff**: Dockerfile runs `yarn install` without `--immutable`; CI separately enforces immutable install, but an ad hoc Docker build alone is less strict (`Dockerfile:5-7`, `.github/workflows/ci.yml:115-117`).
- **Runtime dependency hygiene**: `uv sync --no-dev` excludes dependency groups, but `pytest`, `pytest-asyncio`, and `httpx` are listed in main backend dependencies, so test libraries may still ship unless moved to dev dependencies (`backend/pyproject.toml:6-31`).
- **Startup migrations**: automatic Alembic migrations are convenient for self-hosters, but migrations run at container startup and also via Helm init container. In PostgreSQL multi-replica rollouts, this can create redundant/concurrent migration attempts unless carefully controlled (`entrypoint.sh:17-19`, `deploy/helm/tarnished/templates/deployment.yaml:47-93`).
- **Potential Helm SECRET_KEY mismatch**: default Helm values imply auto-generation if `secretKey.existingSecret` is empty, but the `migrate` init container bypasses `entrypoint.sh` and only receives `SECRET_KEY` when an existing secret is configured. Since settings require `SECRET_KEY`, default Helm installs may need an explicit secret or template adjustment (`backend/app/core/config.py:28`, `entrypoint.sh:7-15`, `deploy/helm/tarnished/templates/deployment.yaml:47-83`).
- **Potential Helm password exposure/unused secret**: chart creates a PostgreSQL Secret when `postgresql.password` is set, but the Deployment injects that password as a plain env `value` rather than `valueFrom` the generated Secret; using `postgresql.existingSecret` is safer (`deploy/helm/tarnished/templates/secret.yaml:1-14`, `deploy/helm/tarnished/templates/deployment.yaml:66-75`, `deploy/helm/tarnished/templates/deployment.yaml:118-127`).
- **Compose env caveat**: root `.env.example` lists `DATABASE_URL` and `SECRET_KEY`, but packaged Compose files do not pass those keys into the container by default. Users need an override or compose edit for those runtime vars (`.env.example:13-27`, `deploy/compose/docker-compose.yml:8-9`, `deploy/compose/docker-compose.postgres.yml:8-14`).
- **Bind-mount ownership**: image owns `/app/data` as UID/GID 1000, but Compose bind mounts `./data` over it. On Linux hosts, a root-owned auto-created bind mount can cause write failures for non-root `appuser` unless permissions are prepared (`Dockerfile:53-57`, `Dockerfile:83-84`, `deploy/compose/docker-compose.yml:6-7`).
- **Frontend runtime configurability**: `VITE_API_URL` is baked at build time as empty for same-origin; `APP_URL` does not rewrite the frontend API base at runtime. Good for bundled single-origin deployments, less flexible for split frontend/API deployments without rebuilding (`Dockerfile:9`, `frontend/src/lib/api.ts:3`, `frontend/src/lib/api.ts:82-83`).
