# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && yarn install --immutable
COPY frontend/ ./
ENV VITE_API_URL=""
RUN yarn build

# Stage 2: Install Python dependencies (uv stays in this stage only)
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS backend-builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Install dependencies only (layer cached until lock file changes)
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev

# Stage 3: Production runtime (no uv, no pip, no build tools)
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    UPLOAD_DIR=/app/data/uploads \
    DATABASE_URL=sqlite+aiosqlite:///app/data/tarnished.db

WORKDIR /app

# Create non-root user and data directory
RUN groupadd --system --gid 1000 appuser \
 && useradd --system --gid 1000 --uid 1000 --create-home appuser \
 && mkdir -p /app/data/uploads \
 && chown -R appuser:appuser /app

# Copy virtual environment from builder (deps only, no uv binary)
COPY --from=backend-builder --chown=appuser:appuser /app/.venv ./.venv

# Copy backend code
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser backend/alembic.ini ./
COPY --chown=appuser:appuser backend/alembic ./alembic

# Copy built frontend
COPY --from=frontend-builder --chown=appuser:appuser /app/dist ./static

# Copy entrypoint
COPY --chown=appuser:appuser entrypoint.sh ./
RUN chmod +x entrypoint.sh

# OCI labels (overridden by docker/metadata-action in CI)
LABEL org.opencontainers.image.source="https://github.com/markoonakic/tarnished" \
      org.opencontainers.image.description="A full-stack job application tracking system"

EXPOSE 5577
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5577/health')"

ENTRYPOINT ["./entrypoint.sh"]
