# Tarnished docs toolchain

This directory contains the Tarnished documentation project.

## Structure

- `content/` — publishable documentation source files
- `src/` — Docusaurus site files and theme customizations
- `static/` — static assets copied into the built site
- `build/` — generated static output
- `docusaurus.config.ts` — site configuration
- `sidebars.ts` — docs sidebar configuration
- `package.json` / `yarn.lock` — isolated docs dependencies

## Local usage

Install docs dependencies:

```bash
cd documentation
yarn install
```

Run a local docs preview:

```bash
cd documentation
yarn start
```

Build the static site:

```bash
cd documentation
yarn build
```

Type-check the site config and sidebars:

```bash
cd documentation
yarn typecheck
```
