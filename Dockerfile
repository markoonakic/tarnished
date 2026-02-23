# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/yarn.lock frontend/.yarnrc.yml ./
# Note: Not using --immutable due to Corepack cacheKey mismatch between environments
# CI validates the lockfile separately
RUN corepack enable && yarn install
COPY frontend/ ./
ENV VITE_API_URL=""
RUN yarn build

# Stage 2: Build Python dependencies
FROM python:3.12-alpine AS builder

# Install build dependencies (for packages with C extensions)
RUN apk add --no-cache \
    build-base \
    libffi-dev \
    postgresql-dev \
    gcc \
    musl-dev

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# uv optimizations for Docker
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Copy dependency files
COPY backend/pyproject.toml backend/uv.lock ./

# Create venv and install dependencies
RUN uv venv /app/.venv && \
    uv sync --locked --no-dev --no-install-project

# Stage 3: Production runtime
FROM python:3.12-alpine

# Install runtime dependencies only (no build tools)
RUN apk add --no-cache \
    libpq \
    postgresql-libs \
    curl

WORKDIR /app

# Create non-root user and directories
RUN addgroup -S -g 1000 appuser && \
    adduser -S -u 1000 -G appuser appuser && \
    mkdir -p /app/data/uploads && \
    chown -R appuser:appuser /app

# Copy ENTIRE venv from builder (preserves entry points with correct shebangs)
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    UPLOAD_DIR=/app/data/uploads

# Copy application code
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser backend/alembic.ini ./
COPY --chown=appuser:appuser backend/alembic ./alembic

# Copy built frontend
COPY --from=frontend-builder --chown=appuser:appuser /app/dist ./static

# Copy entrypoint
COPY --chown=appuser:appuser entrypoint.sh ./
RUN chmod +x entrypoint.sh

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/markoonakic/tarnished" \
      org.opencontainers.image.description="A full-stack job application tracking system"

EXPOSE 5577
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5577/health')"

ENTRYPOINT ["./entrypoint.sh"]
