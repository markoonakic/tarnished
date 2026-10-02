# Contributing

Report bugs and feature requests at
[GitHub Issues](https://github.com/markoonakic/tarnished/issues). Include the
version, browser, operating system, installation method and steps to reproduce.
Remove credentials and private data from logs.

## Development

Use Python 3.12, [uv](https://docs.astral.sh/uv/), Node.js 24 and Corepack (Yarn 4).
Use a disposable development database, not a live installation.

```bash
cd backend
uv sync --locked
mkdir -p data uploads
export DATABASE_URL="sqlite+aiosqlite:///$(pwd)/data/development.db"
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
export UPLOAD_DIR="$(pwd)/uploads"
uv run alembic upgrade head
uv run python -m app.manage bootstrap-owner --email owner@example.com
uv run uvicorn app.main:app --reload --port 5577
```

Keep the same development secret securely between runs. In another terminal:

```bash
cd frontend
corepack yarn install --immutable
corepack yarn dev
```

The frontend proxies `/api` to backend port `5577`. Sign in with the account you
created. Use Admin for later accounts. See [account recovery](documentation/content/get-started/create-admin-account.md)
if you lose access. The [CLI](cli/README.md) and [extension](extension/README.md)
have their own build instructions.

## Checks

Run the checks for each component you change:

```bash
(cd backend && uv run ruff check && uv run ruff format --check && uv run pyright app && uv run bandit -c pyproject.toml -r app && uv run pytest)
(cd cli && uv sync --locked && uv run ruff check src tests && uv run ruff format --check src tests && uv run pyright src tests && uv run pytest)
(cd frontend && corepack yarn lint && corepack yarn format:check && corepack yarn test:run && corepack yarn build)
(cd extension && corepack yarn install --immutable && corepack yarn format:check && corepack yarn exec tsc --noEmit && corepack yarn test:run && corepack yarn build:all)
(cd documentation && corepack yarn install --immutable && corepack yarn typecheck && corepack yarn build)
python -m unittest discover -s .github/release-tools/tests
```

Backend tests create and drop database tables. With `TEST_DATABASE_URL` unset,
they use temporary SQLite databases. For PostgreSQL tests, set it to a disposable
database only. Install libmagic, FFmpeg and Poppler for upload and media tests.

For deployment changes, also run:

```bash
docker compose -f deploy/compose/docker-compose.yml config
POSTGRES_PASSWORD=test-password docker compose -f deploy/compose/docker-compose.postgres.yml config
docker build -t tarnished:local .
helm lint deploy/helm/tarnished
helm template tarnished deploy/helm/tarnished
helm template tarnished deploy/helm/tarnished --set cleanup.enabled=true
helm template tarnished deploy/helm/tarnished \
  --set postgresql.enabled=true --set postgresql.host=postgres.example.test \
  --set postgresql.password=test-password
```

Both database modes require one replica and `Recreate` updates. Regenerate the
chart README with `helm-docs --chart-search-root deploy/helm/tarnished` when chart
values or their descriptions change.

## Pull requests

Keep changes focused. Add or update tests for changed behavior and update public
documentation where needed. Run the relevant checks, use clear commit messages
and open a pull request against `main`.

Contributions are licensed under the [MIT License](LICENSE).
