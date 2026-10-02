#!/bin/sh
set -e

# Recovery uses the existing secret without changing the schema.
if [ "$1" = "manage" ]; then
    shift
    if [ -z "$SECRET_KEY" ] && [ -f /app/data/.secret_key ]; then
        SECRET_KEY=$(cat /app/data/.secret_key)
        export SECRET_KEY
    fi
    if [ -z "$SECRET_KEY" ]; then
        echo "Configured SECRET_KEY unavailable; restore instance configuration first" >&2
        exit 1
    fi
    exec python -m app.manage "$@"
fi

mkdir -p /app/data/uploads

# Persist the signing secret across restarts.
if [ -z "$SECRET_KEY" ] && [ ! -f /app/data/.secret_key ]; then
    echo "Generating SECRET_KEY on first run..."
    (umask 077; python -c "import secrets; print(secrets.token_hex(32))" > /app/data/.secret_key)
fi
if [ -z "$SECRET_KEY" ] && [ -f /app/data/.secret_key ]; then
    SECRET_KEY=$(cat /app/data/.secret_key)
    export SECRET_KEY
fi

alembic upgrade head

# Init containers migrate without starting the server.
if [ "$1" = "migrate" ]; then
    exit 0
fi

# Background processing requires one application worker.
if [ "${WEB_CONCURRENCY:-1}" != "1" ] || [ "${UVICORN_WORKERS:-1}" != "1" ]; then
    echo "Tarnished requires one application worker; multiple workers are unsupported" >&2
    exit 1
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 5577 --workers 1 --limit-concurrency 64 --timeout-graceful-shutdown 200
