# Tarnished

A full-stack job application tracking system built with **React 19 + TypeScript + Tailwind CSS 4.1** (frontend) and **FastAPI + SQLAlchemy** (backend).

## Tooling

- **Frontend**: Yarn (`cd frontend && yarn add <pkg>`)
- **Backend**: uv (`cd backend && uv add <pkg>`)

## Design Guidelines

**Read the relevant guidelines file before making changes:**
- **Frontend**: `frontend/DESIGN_GUIDELINES.md` — mandatory for all UI changes
- **Backend**: `backend/DESIGN_GUIDELINES.md` — mandatory for all API changes

### The 5-Layer Rule (Most Critical Pattern)

All backgrounds, hover states, and inputs follow a strict 5-layer color hierarchy:

```
bg0 (darkest) → bg1 → bg2 → bg3 → bg4 (lightest)
```

- **Hover backgrounds = container + 1 layer** (e.g., button in `bg-bg2` uses `hover:bg-bg3`)
- **Modal reset rule**: Modals start at `bg1`, then layer from there
- **Wrap-around**: After `bg4`, start over at `bg0`

### Key Conventions

- **Icons**: Bootstrap Icons only (`<i className="bi-*" />`). No other icon libraries. Size with `.icon-xs` through `.icon-2xl`.
- **Colors**: CSS variables only (`bg-bg1`, `text-fg1`, `text-aqua`). Never hardcode hex values.
- **Buttons**: 4 variants — Primary (`bg-aqua`), Neutral (`bg-transparent text-fg1`), Danger (`bg-transparent text-red`), Icon-only
- **cursor-pointer**: Required on ALL interactive elements (`<button>`, `<a>`, `onClick` handlers)
- **Transitions**: `transition-all duration-200 ease-in-out` on all interactive elements
- **Destructive actions**: Always say "Delete", never "Remove"
- **Dropdowns**: Use the `Dropdown` component, never native `<select>`

## Project Structure

```
frontend/          # React 19 + Vite 7
  src/
    components/    # Reusable UI components
    pages/         # Route-level page components
    lib/           # API clients, types, utilities
    contexts/      # React contexts (Auth, Theme)
    hooks/         # Custom hooks
backend/           # FastAPI + SQLAlchemy
  app/
    api/           # Route handlers
    core/          # Config, security, deps
    models/        # SQLAlchemy models
```

## Commands

### Frontend
- `cd frontend && yarn dev` — Start frontend dev server
- `cd frontend && yarn build` — Build frontend for production
- `cd frontend && yarn lint` — Lint frontend code
- `cd frontend && npx tsc --noEmit` — Type-check frontend

### Backend
- `cd backend && uv run uvicorn app.main:app --reload` — Start backend dev server
- `cd backend && uv run pytest` — Run backend tests
- `cd backend && uv run alembic upgrade head` — Run database migrations

## Deployment

### Docker Compose (Recommended for Self-Hosting)

```bash
# Quick start with SQLite
docker-compose up -d

# Access at http://localhost:5577
# First user becomes admin automatically
```

### With PostgreSQL

```bash
# Create .env file
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env

# Run with PostgreSQL
docker-compose -f docker-compose.postgres.yml up -d
```

### Kubernetes (Helm)

```bash
helm install tarnished oci://ghcr.io/markoonakic/tarnished
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///app/data/tarnished.db` | Database connection |
| `SECRET_KEY` | auto-generated | JWT signing key |
| `APP_URL` | `http://localhost:5577` | Public URL (CORS, TrustedHost) |
| `APP_PORT` | `5577` | External port mapping |
| `UPLOAD_DIR` | `/app/data/uploads` | File upload location |

See `.env.example` for all options.

## Gotchas

- Backend requires a `.env` file — see `backend/.env.postgresql` for reference.
- Install backend deps with `cd backend && uv sync`, frontend deps with `cd frontend && yarn install`.
- Hover translate animations (`hover:-translate-y-0.5`) need `will-change-transform` for smooth GPU-accelerated rendering.
