FROM node:25-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/yarn.lock frontend/.yarnrc.yml ./
RUN corepack enable && yarn install --immutable
COPY frontend/ ./
ENV VITE_API_URL=""
RUN yarn build

FROM python:3.12-alpine AS builder
RUN apk add --no-cache build-base libffi-dev postgresql-dev
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:0.12.1 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

FROM python:3.12-alpine
RUN apk upgrade --no-cache && \
    apk add --no-cache libpq libmagic libffi ffmpeg poppler-utils
WORKDIR /app
RUN addgroup -S -g 1000 appuser && \
    adduser -S -u 1000 -G appuser appuser && \
    mkdir -p /app/data/uploads && chown -R appuser:appuser /app
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
ENV PYTHONUNBUFFERED=1 \
    LITELLM_LOCAL_MODEL_COST_MAP=true \
    PATH="/app/.venv/bin:$PATH" \
    UPLOAD_DIR=/app/data/uploads
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser backend/alembic.ini ./
COPY --chown=appuser:appuser backend/alembic ./alembic
COPY --from=frontend-builder --chown=appuser:appuser /app/dist ./static
COPY --chown=appuser:appuser entrypoint.sh LICENSE ./
RUN chmod +x entrypoint.sh
LABEL org.opencontainers.image.source="https://github.com/markoonakic/tarnished" \
      org.opencontainers.image.description="Self-hosted job application tracker"
EXPOSE 5577
USER appuser
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5577/health')"
ENTRYPOINT ["./entrypoint.sh"]
