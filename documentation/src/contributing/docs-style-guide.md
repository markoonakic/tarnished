# Tarnished documentation style guide

This guide defines the baseline writing rules for Tarnished documentation.

## Source principles

Tarnished documentation follows these source principles:

- **Docs as code**: docs live in Git, are reviewed in pull requests, and are validated in CI.
- **Diátaxis structure**: choose the right page type before writing.
- **Single source of truth**: avoid duplicating technical facts across pages.
- **Keep docs close to reality**: verify against code, config, commands, and current product behavior.

## Writing baseline

Tarnished uses the Microsoft Writing Style Guide as the general baseline for tone and style.

Apply these default rules:

- Use present tense and active voice.
- Address the reader as **you**.
- Prefer short, direct sentences.
- Use sentence case for headings.
- Use `code formatting` for commands, paths, file names, env vars, and literal values.
- Use **bold** for UI labels when referring to visible controls.
- Use numbered steps for procedures.
- Use bullets for lists of facts, options, or outcomes.

## Tarnished-specific rules

- Use the product name **Tarnished** exactly.
- Use **API key** for the current machine-client auth model.
- Do not describe JWT login as a supported CLI auth path.
- Prefer `docker compose`, not `docker-compose`.
- Be explicit about deployment mode when it changes behavior, for example SQLite vs PostgreSQL.
- Distinguish clearly between:
  - source docs in `documentation/src/`
  - generated site output in `documentation/site/`
  - runtime app data such as `data/` or database storage

## Choose the right page type

Before writing, classify the page:

- **Tutorial**: guided learning by doing
- **How-to**: solve one practical task
- **Reference**: precise facts and technical detail
- **Explanation**: concepts, rationale, architecture
- **Troubleshooting**: symptoms, causes, checks, fixes

Do not mix page types unless there is a clear reason.

## Page hygiene

- Start with a clear first paragraph that states what the page is for.
- Keep one primary purpose per page.
- Link outward instead of repeating large chunks of related material.
- Prefer concrete examples over vague statements.
- When documenting commands, make them copyable.
- When documenting risky actions, state the risk before the step.

## Verification rule

Do not write documentation from memory when the code, config, or live commands can be checked.
