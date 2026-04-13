# Tarnished docs toolchain

This directory contains the Tarnished documentation project.

## Structure

- `mkdocs.yml` — MkDocs configuration
- `src/` — publishable documentation source files
- `site/` — generated static output
- `pyproject.toml` / `uv.lock` — isolated docs dependencies

## Local usage

Install docs dependencies:

```bash
uv sync --project documentation --frozen --no-install-project
```

Run a local docs preview:

```bash
documentation/.venv/bin/mkdocs serve --strict -f documentation/mkdocs.yml
```

Build the static site:

```bash
documentation/.venv/bin/mkdocs build --strict -f documentation/mkdocs.yml
```
