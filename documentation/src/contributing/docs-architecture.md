# Tarnished docs architecture

This page describes how Tarnished documentation is structured and published.

## Source and output

- Documentation project files live in `documentation/`
- Publishable source files live in `documentation/src/`
- MkDocs configuration lives in `documentation/mkdocs.yml`
- Generated static output is written to `documentation/site/`
- `documentation/site/` is a build artifact and must not be edited manually

## Publishing model

Tarnished documentation uses:

- **MkDocs** as the static site generator
- **Material for MkDocs** as the docs theme
- **GitHub Pages** as the initial hosting target

The docs site is built in GitHub Actions from the tracked source files and deployed as static content.

## Information architecture

Tarnished documentation follows a Diátaxis-style structure:

- **Getting started**
- **Tutorials**
- **How-to guides**
- **Reference**
- **Explanation**
- **Troubleshooting**
- **Contributing**

Choose the page type first, then write the page.

## Design constraints

- Keep user-facing docs in `documentation/src/`, not in the ignored `docs/` directory.
- Keep operational facts close to the source of truth, for example code, config, or generated API surfaces.
- Avoid duplication where a single authoritative reference can be linked instead.
- Treat docs updates like code changes: review them, verify them, and keep them consistent with the product.
