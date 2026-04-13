# Tarnished documentation roadmap

This page defines the first writing plan for the Tarnished docs site.

## Writing principles

Write pages in this order:

1. High user value
2. High confidence in source-of-truth coverage
3. Low duplication risk
4. Strong linkage to current deployment and product behavior

## Wave 1: launch-critical docs

These pages establish the minimum useful documentation set for operators and new users.

| Page | Type | Primary audience | Verify against |
|---|---|---|---|
| Install with Docker Compose | Install | New self-hosters | `README.md`, `deploy/compose/docker-compose.yml`, `entrypoint.sh` |
| Install with PostgreSQL Docker Compose | Install | Self-hosters moving past SQLite | `README.md`, `deploy/compose/docker-compose.postgres.yml`, `backend/app/core/config.py` |
| Install with Helm | Install | Kubernetes operators | `deploy/helm/tarnished/README.md`, `deploy/helm/tarnished/values.yaml`, `deploy/helm/tarnished/templates/*` |
| Configure environment variables | Reference | Operators | `.env.example`, `backend/app/core/config.py`, deployment files |
| Understand storage and backups | Explanation | Operators | `README.md`, compose files, chart docs, `backend/app/core/config.py` |
| Troubleshoot deployment and startup failures | Troubleshooting | Operators | Compose files, chart docs, `entrypoint.sh`, `backend/app/main.py` |

## Wave 2: core product usage docs

These pages explain the main product workflows once the app is running.

| Page | Type | Primary audience | Verify against |
|---|---|---|---|
| Create your first application | Get started | End users | frontend flows, backend application routes, current UI copy |
| Save and convert a job lead | Tutorial | End users | `backend/app/api/job_leads.py`, `backend/app/api/applications.py`, extension README |
| Manage statuses and round types | How-to | End users/admins | `backend/app/api/settings.py`, settings UI, CLI status/round type commands |
| Upload documents and media | How-to | End users | `backend/app/api/files.py`, `backend/app/api/rounds.py`, frontend upload flows |
| Import and export your data | How-to | End users/admins | `backend/app/api/import_router.py`, `backend/app/api/export.py`, transfer UX |
| Troubleshoot imports, exports, and uploads | Troubleshooting | End users/admins | import/export/files routes, transfer jobs, MIME/validation rules |

## Wave 3: admin, AI, and automation docs

These pages explain higher-complexity and admin-focused features.

| Page | Type | Primary audience | Verify against |
|---|---|---|---|
| Configure API keys | How-to | Admins, CLI users, extension users | `backend/app/api/auth.py`, `backend/app/core/api_key_scopes.py`, settings UI, CLI README |
| Configure AI settings | How-to | Admins | `backend/app/api/ai_settings.py`, settings UI, `backend/app/services/ai_settings.py` |
| Understand auth and API-key scopes | Explanation | Admins, integrators | auth routes, API key scopes, CLI auth flows |
| Understand transfer jobs | Explanation | Admins, developers | import/export routes, transfer jobs services/models |
| Use the CLI | How-to + Reference | Power users | `cli/src/tarnished_cli/commands/*`, `cli/README.md`, help output |
| Use the browser extension | How-to | End users | `extension/README.md`, extension APIs, manifest/build behavior |

## Wave 4: deep reference and architecture

These pages make Tarnished easier to operate and extend with confidence.

| Page | Type | Primary audience | Verify against |
|---|---|---|---|
| API overview and auth expectations | Reference | Integrators | `backend/app/main.py`, route modules, FastAPI OpenAPI output |
| CLI command reference | Reference | CLI users | generated Typer help plus command modules |
| Helm chart reference | Reference | Kubernetes operators | `deploy/helm/tarnished/Chart.yaml`, `deploy/helm/tarnished/README.md`, `deploy/helm/tarnished/values.yaml`, `deploy/helm/tarnished/values.schema.json` |
| Architecture overview | Explanation | Contributors, advanced operators | `backend/app/main.py`, frontend structure, service layout |
| Import/export system design | Explanation | Contributors | import/export services, transfer jobs, storage model |
| Contribution guide for docs authors | How-to | Contributors | docs style guide, templates, Docusaurus workflow |

## Candidate source-of-truth map

### Deployment and operations
- `README.md`
- `Dockerfile`
- `entrypoint.sh`
- `deploy/compose/docker-compose.yml`
- `deploy/compose/docker-compose.postgres.yml`
- `deploy/compose/.env.example`
- `.env.example`
- `deploy/helm/tarnished/README.md`
- `deploy/helm/tarnished/values.yaml`
- `deploy/helm/tarnished/values.schema.json`
- `deploy/helm/tarnished/templates/*`
- `backend/app/core/config.py`
- `backend/app/main.py`

### Backend product and API behavior
- `backend/app/api/*`
- `backend/app/services/*`
- `backend/app/models/*`
- `backend/app/schemas/*`

### CLI behavior
- `cli/README.md`
- `cli/src/tarnished_cli/commands/*`
- `cli/src/tarnished_cli/main.py`

### Extension behavior
- `extension/README.md`
- `extension/src/manifest.json`
- `extension/src/lib/*`

## Recommended writing order

1. Install with Docker Compose
2. Install with PostgreSQL Docker Compose
3. Install with Helm
4. Configure environment variables
5. Understand storage and backups
6. Troubleshoot deployment and startup failures
7. Create your first application
8. Save and convert a job lead
9. Import and export your data
10. Configure API keys
11. Use the CLI
12. Use the browser extension

## Out of scope for the first writing wave

- `llms.txt` and related agent-accessibility files
- Docs preview deployments beyond the current GitHub Pages flow
- Heavy versioning strategy
- Generated API portal beyond FastAPI/OpenAPI baseline
