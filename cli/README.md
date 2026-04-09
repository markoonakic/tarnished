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
3. The release workflow will:
   - update `Formula/tarnished-cli.rb` from PyPI metadata
   - refresh Python resource blocks with `brew update-python-resources`
   - build the formula from source and run `brew test tarnished-cli`
   - push the tap update to `markoonakic/homebrew-tap`

### Release Outputs

The release workflow publishes:

- `cli/dist/*.whl`
- `cli/dist/*.tar.gz`

to the GitHub release, publishes to PyPI, and updates the Homebrew tap.
