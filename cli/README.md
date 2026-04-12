# Tarnished CLI

Agent-first command-line interface for Tarnished.

## Install

Supported install path:

```bash
brew tap markoonakic/tap
brew install tarnished-cli
```

For local release verification only:

```bash
uv tool install ./dist/tarnished_cli-<version>-py3-none-any.whl
```

## Authentication

Tarnished CLI is API-key-first.

1. Create or rotate the API key in the Tarnished web app.
2. Prefer the **CLI** preset so the key includes the scopes the CLI expects.
3. Validate and store the key locally:

```bash
uv run tarnished auth init --api-key '...'
```

4. Run the auth doctor to confirm the stored key, live auth check, and required
   CLI scopes all pass:

```bash
uv run tarnished auth doctor
uv run tarnished auth whoami
```

5. Clear the locally stored key when needed:

```bash
uv run tarnished auth api-key clear
```

The web app remains the source of truth for API keys. The CLI does **not**
create, rotate, revoke, or otherwise manage remote API keys.

## Development

```bash
cd cli
uv sync
uv run tarnished --help
uv run pytest -q
```

## Release

The repository release workflow builds CLI distributions, publishes them to the
GitHub release, publishes the CLI to PyPI by default, and then updates the
Homebrew tap from the released PyPI sdist.

### One-Time PyPI Trusted Publishing Setup

1. Create the `tarnished-cli` project on PyPI.
2. In the PyPI project settings, add a Trusted Publisher for this GitHub repository.
3. Use these values:
   - Owner: `markoonakic`
   - Repository: `tarnished`
   - Workflow name: `release.yml`
   - Environment name: `pypi`

### One-Time Homebrew Tap Automation Setup

1. Create a write-enabled deploy key for `markoonakic/homebrew-tap`.
2. Add the private key to this repository as the `HOMEBREW_TAP_DEPLOY_KEY` secret.
3. The dedicated `homebrew-tap.yml` workflow will:
   - wait until the target PyPI release is older than Homebrew's 24-hour Python resource cooldown window
   - update `Formula/tarnished-cli.rb` from PyPI metadata
   - refresh Python resource blocks with `brew update-python-resources`
   - build the formula from source and run `brew test tarnished-cli`
   - push the tap update to `markoonakic/homebrew-tap`

Why separate from the main release workflow?

- Homebrew's Python dependency resolver intentionally excludes PyPI uploads from the last 24 hours when refreshing resource blocks.
- Keeping tap sync separate avoids false-negative release failures while still following Homebrew's documented Python-formula workflow.

### Release Outputs

The release workflow publishes:

- `cli/dist/*.whl`
- `cli/dist/*.tar.gz`

to the GitHub release, publishes to PyPI, and updates the Homebrew tap.
