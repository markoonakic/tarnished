# Tarnished docs architecture

This page describes how Tarnished documentation is structured and published.

## Source and output

- Documentation project files live in `documentation/`
- Publishable source files live in `documentation/content/`
- Docusaurus site files live in `documentation/src/`
- Static assets live in `documentation/static/`
- Docusaurus configuration lives in `documentation/docusaurus.config.ts`
- Generated static output is written to `documentation/build/`
- `documentation/build/` is a build artifact and must not be edited manually

## Publishing model

Tarnished documentation uses:

- **Docusaurus** as the static site generator
- **GitHub Pages** as the initial hosting target

The docs site is built in GitHub Actions from the tracked source files and deployed as static content.

## Information architecture

Tarnished documentation separates the public user path from contributor docs.

### Public docs

- **Home**
- **Install Tarnished**
- **Get started in Tarnished**
- **How-to**
- **Reference**
- **Explanation**
- **Troubleshooting**

### Contributor docs

- **Contributing**
- contributor-facing architecture, roadmap, and templates

The public docs still borrow from Diátaxis principles, but install and first-use onboarding are elevated because Tarnished is a self-hosted product and users need a clear path from deployment to first real use.

## Design constraints

- Keep user-facing docs in `documentation/content/`, not in the ignored `docs/` directory.
- Keep operational facts close to the source of truth, for example code, config, or generated API surfaces.
- Avoid duplication where a single authoritative reference can be linked instead.
- Treat docs updates like code changes: review them, verify them, and keep them consistent with the product.
