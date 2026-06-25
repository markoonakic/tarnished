# CI/CD pipelines and release workflows

Scope: read-only survey of GitHub Actions and adjacent deployment/release config in this repo. I found GitHub Actions workflows plus Dependabot config; no CircleCI/GitLab/Jenkins/Azure/Buildkite/Cloud Build configs.

## Workflow inventory

| File | Purpose | Triggers | Jobs / runners | Key notes |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | PR validation | `pull_request` to `main` (`ci.yml:3-5`) | `backend`, `cli`, `frontend`, `deployment`, `extension` all on `ubuntu-latest` (`ci.yml:13-249`) | Cancels superseded PR runs with `concurrency` (`ci.yml:8-10`). No explicit `permissions` block. |
| `.github/workflows/release.yml` | Tagged/manual release | tag push `v*` and `workflow_dispatch` with publish toggles (`release.yml:3-34`) | release metadata, checks, GitHub release notes/assets, PyPI, Docker, Helm; mostly `ubuntu-latest` (`release.yml:44-505`) | Release runs are serialized per version but not cancelled (`release.yml:39-41`). |
| `.github/workflows/docs.yml` | Docs build + GitHub Pages deploy | PR/push path filters for `documentation/**` and workflow file, plus manual dispatch (`docs.yml:3-13`) | `build`, `deploy` on `ubuntu-latest` (`docs.yml:20-76`) | Deploy only on push to `main` (`docs.yml:52-63`). |
| `.github/workflows/homebrew-tap.yml` | Update external Homebrew tap after PyPI publish | manual dispatch and daily cron `17 5 * * *` (`homebrew-tap.yml:3-10`) | `tap-update` on `macos-latest` (`homebrew-tap.yml:20-159`) | Separate from release because Homebrew's Python resource resolver has a 24-hour PyPI cooldown (`cli/README.md:69-100`). |
| `.github/workflows/dependabot-auto-merge.yml` | Auto-approve/auto-merge safe dependency PRs | all PRs (`dependabot-auto-merge.yml:3`) | `dependabot` on `ubuntu-latest` (`dependabot-auto-merge.yml:9-37`) | Runs only for Dependabot bot PRs and only patch/minor updates (`dependabot-auto-merge.yml:13-34`). |
| `.github/dependabot.yml` | Dependency update policy | scheduled by ecosystem | n/a | Weekly uv/npm updates for backend/frontend/extension; monthly GitHub Actions updates; grouped PRs and labels (`dependabot.yml:3-72`). |

## CI workflow (`.github/workflows/ci.yml`)

- Trigger: PRs targeting `main` only (`ci.yml:3-5`). Concurrency key uses workflow + ref and cancels in-progress runs (`ci.yml:8-10`), which is good for saving minutes on force-pushed PRs.
- Backend job (`ubuntu-latest`): checkout, Python 3.12, uv, `uv sync`, Ruff lint/format, Pyright, Bandit, `pip-audit`, and pytest (`ci.yml:13-57`). Security audit exports prod requirements and explicitly documents two ignored CVEs (`ci.yml:46-53`).
- CLI job (`ubuntu-latest`): checkout, Python 3.12, uv, `uv sync`, Ruff, Pyright, pytest (`ci.yml:59-90`).
- Frontend job (`ubuntu-latest`): Node 22 + Corepack (`ci.yml:97-103`), Yarn cache keyed by `frontend/yarn.lock` (`ci.yml:105-113`), immutable install, ESLint, Prettier, TypeScript, Vitest, build, and non-blocking high-severity audit (`ci.yml:115-143`).
- Deployment job (`ubuntu-latest`): validates both Compose files, builds production Docker image locally, installs Helm, then lints and templates chart scenarios including cleanup, PostgreSQL, and multi-replica storage cases (`ci.yml:145-185`).
- Extension job (`ubuntu-latest`): fetches full history, computes whether `extension/` changed, and gates setup/cache/install/test/build steps with `if:` (`ci.yml:187-249`). This avoids spending Node minutes when extension files are untouched.

## Release workflow (`.github/workflows/release.yml`)

### Release metadata and gates

- Triggered by `v*` tag push or manual `workflow_dispatch` inputs for version, ref, and publish flags (`release.yml:3-34`). Manual releases can selectively publish extension assets, Docker, Helm, CLI package, and rolling tags.
- `run-name` and `concurrency.group` use expressions to pick manual input version or tag name (`release.yml:36-41`). `cancel-in-progress: false` protects long release publishes from being killed by another event.
- `release-meta` resolves version/ref/publish flags, converts SHA-like refs to exact commits with `gh api`, checks PyPI for an existing `tarnished-cli` release, and emits job outputs through `$GITHUB_OUTPUT` (`release.yml:44-120`). Docker tags are computed as `ghcr.io/<owner>/tarnished:<version>` plus optional `<major>.<minor>` and `latest` (`release.yml:96-119`).
- Parallel release checks are declared via `needs: release-meta`: backend schema drift/security audit (`release.yml:160-197`), CLI lint/type/test (`release.yml:199-233`), frontend build + bootstrap icon verification + prod audit (`release.yml:235-278`), and deployment checks for Compose/Docker/Helm (`release.yml:280-323`).

### GitHub release, CLI, PyPI, Docker, Helm

- `github-release-notes` waits for all core checks, grants `contents: write`, ensures a GitHub release exists, extracts the matching `CHANGELOG.md` section, and edits release notes (`release.yml:122-158`). This makes asset uploads idempotent even if the release did not exist yet.
- Extension assets: gated by `publish_extension_assets`, grants `contents: write`, builds Chrome/Firefox ZIPs, and uploads them directly to the GitHub release with `gh release upload --clobber` (`release.yml:325-378`).
- CLI package: grants `contents: write`, runs `uv build`, uploads wheel/sdist as a workflow artifact named `cli-dist`, and uploads the same files to the GitHub release (`release.yml:380-419`).
- PyPI publish: gated by `publish_cli_package` and “not already on PyPI”; uses environment `pypi` and `permissions: id-token: write` for PyPI Trusted Publishing/OIDC, downloads `cli-dist`, then runs `pypa/gh-action-pypi-publish` (`release.yml:421-440`). No PyPI API token is stored in repo secrets.
- Docker publish: gated by `publish_docker`, grants `packages: write`, sets up QEMU/Buildx, logs into GHCR with `GITHUB_TOKEN`, builds multi-arch `linux/amd64,linux/arm64`, pushes computed tags, uses registry-backed build cache, then fails on CRITICAL Trivy findings (`release.yml:442-482`).
- Helm publish: gated by `publish_helm` and Docker success/disabled condition, grants `packages: write`, logs into GHCR with Helm, packages `deploy/helm/tarnished` using release version as both chart version and app version, and pushes to `oci://ghcr.io/<owner>/charts` (`release.yml:484-505`).

## Docs workflow (`.github/workflows/docs.yml`)

- Trigger filters keep docs CI/deploy scoped to docs changes or workflow edits (`docs.yml:3-13`). Concurrency cancels superseded docs runs per ref (`docs.yml:15-17`).
- Build job has least-privilege `contents: read` (`docs.yml:20-23`), uses Node 22/Corepack, immutable Yarn install, `yarn typecheck`, `yarn build`, and Lychee link checking (`docs.yml:27-50`).
- On push to `main`, it configures Pages and uploads `documentation/build` as a Pages artifact (`docs.yml:52-60`).
- Deploy job runs only on push to `main`, needs build, grants `contents: read`, `pages: write`, and `id-token: write`, and deploys via `actions/deploy-pages`; environment URL comes from the deploy step output (`docs.yml:62-76`).

## Homebrew tap sync (`.github/workflows/homebrew-tap.yml`)

- Manual version input or daily cron; run name/concurrency are keyed by requested version/latest (`homebrew-tap.yml:3-17`). Uses `macos-latest` because Homebrew tooling is native there (`homebrew-tap.yml:20-21`).
- Permissions are read-only for this repo (`homebrew-tap.yml:22-23`); write access to the external tap uses `HOMEBREW_TAP_DEPLOY_KEY` secret (`homebrew-tap.yml:27-34`, `homebrew-tap.yml:95-111`).
- Resolves target package metadata from PyPI, requires an sdist, and skips until upload age is at least 24 hours (`homebrew-tap.yml:41-88`).
- Clones `markoonakic/homebrew-tap` via SSH, updates formula URL/SHA from PyPI using `.github/release-tools/update_homebrew_formula.py`, refreshes Python resources, builds/tests the formula, then commits/pushes if changed (`homebrew-tap.yml:90-159`).
- The helper fetches PyPI release JSON, selects the sdist with SHA256, and updates the formula’s primary `url`/`sha256` fields (`update_homebrew_formula.py:15-84`).

## Dependabot automation

- Dependabot opens grouped dependency PRs: backend uv weekly (`dependabot.yml:5-20`), frontend npm weekly (`dependabot.yml:23-38`), extension npm weekly (`dependabot.yml:41-56`), GitHub Actions monthly (`dependabot.yml:59-72`). Major updates still require manual review by policy comments (`dependabot.yml:13-14`, `dependabot.yml:31-32`, `dependabot.yml:49-50`, `dependabot.yml:66-67`).
- Auto-merge workflow grants `contents: write` and `pull-requests: write` (`dependabot-auto-merge.yml:5-7`), restricts execution to Dependabot PR authors (`dependabot-auto-merge.yml:10-13`), fetches metadata, auto-approves semver patch/minor, and enables squash auto-merge after required CI passes (`dependabot-auto-merge.yml:15-37`).

## Deployment/release surfaces referenced by pipelines

- Dockerfile is multi-stage: Node 22 builds frontend (`Dockerfile:1-10`), Python 3.12 builder installs locked backend deps with uv (`Dockerfile:12-37`), runtime upgrades Alpine packages, runs as non-root `appuser`, copies backend + built frontend, exposes 5577, and defines `/health` healthcheck (`Dockerfile:39-89`).
- `.dockerignore` excludes repo metadata, CI files, docs, deploy assets, CLI/extension, local deps, tests, env files, and build artifacts from image context (`.dockerignore:1-77`), reducing image build context and accidental secret leakage.
- Compose images default to `ghcr.io/markoonakic/tarnished:latest`; SQLite compose mounts `./data` and sets `APP_URL` (`deploy/compose/docker-compose.yml:1-10`), PostgreSQL compose adds a `postgres:16-alpine` service and requires `POSTGRES_PASSWORD` (`deploy/compose/docker-compose.postgres.yml:1-34`).
- Helm chart metadata pins current chart/app version `0.1.7` and advertises image `ghcr.io/markoonakic/tarnished:0.1.7` (`deploy/helm/tarnished/Chart.yaml:1-33`). Values default image repo to GHCR and empty tag falls back to `.Chart.AppVersion` (`deploy/helm/tarnished/values.yaml:6-12`; template use at `deployment.yaml:47-50`, `deployment.yaml:94-99`).
- Helm templates enforce safe replica/storage combos with `fail`, requiring PostgreSQL and shared storage for multi-replica deployments (`deployment.yaml:1-13`). PostgreSQL password validation is also templated (`secret.yaml:1-15`).
- Helm deployment runs `alembic upgrade head` as an init container before starting the app (`deployment.yaml:47-93`), uses non-root/security contexts from values (`values.yaml:38-52`), and supports liveness/readiness/startup probes (`values.yaml:167-220`).

## Env, secrets, permissions, caches, and artifacts

- Secrets/tokens:
  - `secrets.GITHUB_TOKEN`/`github.token` is used for GitHub API/release operations (`release.yml:72`, `release.yml:132-158`, `release.yml:370-419`), GHCR Docker login (`release.yml:459-464`), and Helm registry login (`release.yml:498-505`).
  - `HOMEBREW_TAP_DEPLOY_KEY` is required for pushing to the external Homebrew tap (`homebrew-tap.yml:27-34`, `homebrew-tap.yml:95-111`).
  - PyPI uses OIDC (`id-token: write`) rather than a password/token secret (`release.yml:425-440`).
- Runtime env/state passing:
  - `$GITHUB_OUTPUT` is used for job/step outputs such as release metadata (`release.yml:104-120`), extension changed flag (`ci.yml:195-203`), and Homebrew metadata (`homebrew-tap.yml:76-81`, `homebrew-tap.yml:90-93`).
  - `$GITHUB_ENV` is used for generated `SECRET_KEY` in release backend checks (`release.yml:180-181`) and SSH agent state in Homebrew sync (`homebrew-tap.yml:108-111`).
  - Dummy `POSTGRES_PASSWORD` values are injected only to validate Compose configs in CI/release (`ci.yml:153-156`, `release.yml:291-294`).
- Permissions:
  - Docs/build and Homebrew jobs use `contents: read`; Pages deploy adds `pages: write` and `id-token: write` (`docs.yml:20-23`, `docs.yml:66-69`, `homebrew-tap.yml:22-23`).
  - Release publish jobs grant only the scopes they need: `contents: write` for release notes/assets, `packages: write` for GHCR Docker/Helm, and `id-token: write` for PyPI (`release.yml:125-126`, `release.yml:329-330`, `release.yml:383-384`, `release.yml:428-429`, `release.yml:446-447`, `release.yml:488-489`).
  - CI and most release check jobs do not declare an explicit `permissions` block, so they rely on repository/default token permissions; consider that in interviews as an area to harden to `contents: read` globally.
- Caching:
  - Frontend/extension use `actions/cache` for `~/.cache/node` and `node_modules`, keyed by OS + lockfile hash (`ci.yml:105-113`, `ci.yml:215-224`, `release.yml:251-259`, `release.yml:344-352`).
  - Docker release uses registry cache `ghcr.io/<owner>/tarnished:buildcache` for Buildx (`release.yml:466-474`).
- Artifact flow:
  - CLI: `uv build` -> upload workflow artifact `cli-dist` -> upload to GitHub release -> download same artifact in PyPI publish job (`release.yml:402-440`).
  - Docs: build `documentation/build` -> upload Pages artifact -> deploy Pages (`docs.yml:43-60`, `docs.yml:62-76`).
  - Extension: builds ZIPs and uploads directly to GitHub release; no intermediate workflow artifact (`release.yml:358-378`).
  - Docker/Helm: outputs are registry artifacts in GHCR, not GitHub workflow artifacts (`release.yml:466-505`).

## Notable YAML / GitHub Actions syntax and best-practice rationale

- `on:` controls event triggers; branch/path/tag filters reduce unnecessary runs and separate PR validation, docs deploy, release, and scheduled maintenance (`ci.yml:3-5`, `docs.yml:3-13`, `release.yml:3-34`, `homebrew-tap.yml:3-10`).
- `${{ ... }}` expressions access contexts (`github`, `inputs`, `needs`, `steps`, `runner`) and functions like `hashFiles`; used for dynamic run names, cache keys, outputs, conditions, and tags (`release.yml:36-40`, `ci.yml:111-113`, `release.yml:472-474`).
- `needs:` builds a DAG: checks run in parallel after metadata, and publish jobs wait for the exact gates they depend on (`release.yml:122-124`, `release.yml:160-323`, `release.yml:380-505`). This improves speed while preventing publishing from unverified refs.
- Job/step `if:` gates work based on metadata, changed files, branch, or publish flags (`ci.yml:205-248`, `docs.yml:52-63`, `release.yml:325-328`, `release.yml:421-445`, `release.yml:484-487`). This keeps one workflow reusable for tag and manual releases.
- `permissions:` follows least privilege on publishing/deploying jobs and enables OIDC only where required (`docs.yml:66-69`, `release.yml:428-429`).
- `env:` passes secrets/context into shell commands without hardcoding them; `$GITHUB_OUTPUT` and `$GITHUB_ENV` are the supported way to share step outputs/env across later steps (`release.yml:59-73`, `release.yml:104-120`, `homebrew-tap.yml:108-111`).
- YAML block scalars: `run: |` preserves multi-line shell scripts; `run-name: >-` folds a readable multi-line expression into one display string (`release.yml:36-37`, `release.yml:73-120`).
- Action versions are pinned to full commit SHAs throughout workflows (for example `actions/checkout@...` in `ci.yml:16` and Docker actions in `release.yml:453-467`); `.github/release-tools/tests/test_workflow_action_pinning.py:8-23` enforces this. Pinning reduces supply-chain risk versus mutable tags.
- `continue-on-error: true` on the PR frontend audit makes a noisy advisory check informational while still surfacing results (`ci.yml:139-143`). Release audits/scans remain blocking (`release.yml:275-278`, `release.yml:476-482`).
- `working-directory:` keeps commands scoped to the relevant subproject in this monorepo, avoiding accidental dependency/test leakage (`ci.yml:26-57`, `ci.yml:72-90`, `ci.yml:115-137`).

## Validation hooks and caveats

- Repo contains meta-tests for pipeline intent: deployment surface checks (`test_deployment_workflows.py:10-28`), docs workflow checks (`test_docs_workflow.py:10-23`), Homebrew separation/cooldown checks (`test_homebrew_tap_workflow.py:10-22`), release creation checks (`test_release_workflow.py:9-19`), and full-SHA action pinning (`test_workflow_action_pinning.py:11-23`). I did not find a current workflow step that runs these meta-tests automatically.
- Potential hardening talking points: add top-level `permissions: contents: read` to CI/release by default; consider explicit uv/Python dependency caching; pin the Dockerfile uv image instead of `ghcr.io/astral-sh/uv:latest` (`Dockerfile:25-26`); verify `helm` job behavior for manual releases with Docker disabled because skipped `needs` jobs can be subtle in GitHub Actions (`release.yml:484-487`).
