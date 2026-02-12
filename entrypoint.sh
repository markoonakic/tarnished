#!/bin/sh
set -e

# 1. Ensure data directories exist
mkdir -p /app/data/uploads

# 2. Auto-generate SECRET_KEY if not provided and no file exists
if [ -z "$SECRET_KEY" ] && [ ! -f /app/data/.secret_key ]; then
    echo "Generating SECRET_KEY on first run..."
    python -c "import secrets; print(secrets.token_hex(32))" > /app/data/.secret_key
    chmod 600 /app/data/.secret_key
fi
if [ -z "$SECRET_KEY" ] && [ -f /app/data/.secret_key ]; then
    export SECRET_KEY=$(cat /app/data/.secret_key)
fi

# 3. Run database migrations
# (alembic is on PATH via .venv — no uv needed at runtime)
alembic upgrade head

# 4. Start server (exec for PID 1 signal handling)
exec uvicorn app.main:app --host 0.0.0.0 --port 5577
