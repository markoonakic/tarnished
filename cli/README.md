# Tarnished CLI

Agent-first command-line interface for Tarnished.

## Install

Preferred install path:

```bash
uv tool install tarnished-cli
```

Alternative:

```bash
pipx install tarnished-cli
```

Homebrew convenience path:

```bash
brew tap markoonakic/tap
brew install tarnished-cli
```

For agents and automation, keep using:

```bash
uv tool install tarnished-cli
```

Install from a built wheel before PyPI publication:

```bash
uv tool install ./dist/tarnished_cli-0.1.2-py3-none-any.whl
```

## OpenClaw / Agent Install

Recommended:

```bash
uv tool install tarnished-cli
```

Version-pinned:

```bash
uv tool install 'tarnished-cli==0.1.2'
```

Then run:

```bash
tarnished --help
```

## Development

```bash
cd cli
uv sync
uv run tarnished --help
uv run pytest -q
```

## Release

The repository release workflow builds CLI distributions and uploads them to the GitHub release.

PyPI publication is optional and is controlled by the `publish_cli_package` workflow input.

### One-Time PyPI Trusted Publishing Setup

1. Create the `tarnished-cli` project on PyPI.
2. In the PyPI project settings, add a Trusted Publisher for this GitHub repository.
3. Use these values:
   - Owner: `markoonakic`
   - Repository: `tarnished`
   - Workflow name: `release.yml`
   - Environment name: `pypi`
4. After that, run the GitHub release workflow with:
   - `publish_cli_package=true`

### Release Outputs

The release workflow publishes:

- `cli/dist/*.whl`
- `cli/dist/*.tar.gz`

to the GitHub release, and optionally to PyPI.
