# Tarnished CLI Homebrew Packaging Design

Date: 2026-03-29
Status: Approved for planning
Branch: `homebrew-packaging`

## Goal

Add a best-practice Homebrew distribution path for `tarnished-cli` without changing the canonical packaging model.

The canonical installation path remains:

- `uv tool install tarnished-cli`

Homebrew is a convenience path for human operators on macOS and Linux, not the primary agent install path.

## Context

`tarnished-cli` already exists as a standalone Python package under `cli/`, is published on PyPI as `0.1.2`, and is installable with `uv tool install tarnished-cli`.

That means Homebrew should not become a second product packaging system. It should remain a thin distribution layer over the already-published CLI package.

The most important constraints are:

1. keep the main Tarnished repo as the source of truth for code and releases
2. avoid duplicating packaging logic across multiple places
3. keep release artifacts immutable
4. keep the Homebrew path easy to maintain over time

## Design Principles

### 1. Separate Tap Repo

Use a separate tap repository:

- `markoonakic/homebrew-tap`

This matches normal Homebrew tap conventions and keeps formula metadata separate from the product source repository.

The main Tarnished repo continues to own:

- source code
- versioning
- release notes
- GitHub releases
- PyPI publication

The tap repo owns only:

- `Formula/tarnished-cli.rb`
- minimal tap documentation

### 2. PyPI Remains The Packaging Source Of Truth

The Homebrew formula should install from the published `tarnished-cli` PyPI source distribution, not from an ad hoc tarball stored somewhere else.

Rationale:

- the CLI is already a Python package on PyPI
- PyPI gives stable versioned source URLs and checksums
- this avoids treating GitHub release attachments as the canonical packaging substrate for Python dependencies
- Homebrew formula maintenance is cleaner when tied to the Python package publication flow

### 3. Use Homebrew’s Standard Python Virtualenv Pattern

The formula should use:

- `Language::Python::Virtualenv`

and install the package into a Homebrew-managed virtual environment under `libexec`.

This is the documented Homebrew pattern for Python CLI applications and avoids contaminating the global interpreter environment.

### 4. Keep Homebrew Optional

Homebrew is not the primary installation contract for Tarnished CLI.

Supported installation guidance should remain:

1. primary: `uv tool install tarnished-cli`
2. secondary: `pipx install tarnished-cli`
3. convenience: Homebrew

This keeps the OpenClaw and agent install path simple and cross-platform while still providing a familiar `brew install` path for humans.

## Approaches Considered

### Approach A: Separate Tap Repo Using PyPI Source Distribution

Flow:

1. publish `tarnished-cli` to PyPI
2. update `Formula/tarnished-cli.rb` in `markoonakic/homebrew-tap`
3. formula installs from the PyPI source distribution using Homebrew’s Python virtualenv helpers

Pros:

- best matches Homebrew’s documented tap model
- clean separation of concerns
- leverages the existing Python packaging/release flow
- keeps the main repo as the source of truth for code

Cons:

- introduces a second repository
- formula updates still need an explicit maintenance step

### Approach B: Separate Tap Repo Using GitHub Release Artifacts

Flow:

1. publish the CLI release on GitHub
2. formula points at the GitHub release artifact

Pros:

- keeps everything visually tied to GitHub releases

Cons:

- less aligned with Python formula conventions
- release asset handling becomes part of the packaging contract
- weaker separation between release presentation artifacts and package-source artifacts

### Approach C: Keep Formula In Main Tarnished Repo

Pros:

- fewer repositories

Cons:

- nonstandard tap layout
- mixes tap metadata with product source
- makes Homebrew packaging concerns bleed into the main repository

## Recommendation

Use **Approach A**:

- separate tap repo `markoonakic/homebrew-tap`
- formula sourced from the `tarnished-cli` PyPI source distribution
- formula implemented with `Language::Python::Virtualenv`

This is the most standard and maintainable design.

## Repository Responsibilities

### Main Tarnished Repo

Responsibilities:

- build and publish `tarnished-cli`
- document Homebrew installation
- optionally provide a helper script or release note guidance for updating the tap formula

Non-responsibilities:

- storing the canonical formula file
- acting as the tap repository

### Homebrew Tap Repo

Responsibilities:

- hold `Formula/tarnished-cli.rb`
- provide a minimal README showing:
  - `brew tap markoonakic/tap`
  - `brew install tarnished-cli`

## Formula Design

The formula should:

- declare a dependency on a supported Homebrew Python version
- include `Language::Python::Virtualenv`
- install from the PyPI sdist URL for the release version
- include explicit `resource` stanzas for Python dependencies
- use `virtualenv_install_with_resources`
- include a simple `test do` block such as:
  - `tarnished --version`
  - optionally `tarnished --help`

The formula should be named:

- `tarnished-cli.rb`

and the install name should be:

- `tarnished-cli`

## Update Flow

For each new CLI release:

1. release a new version from the main Tarnished repo
2. wait for PyPI publication to complete
3. update the tap formula:
   - version
   - source URL
   - source checksum
   - dependency resources if changed
4. test locally with:
   - `brew install --build-from-source ./Formula/tarnished-cli.rb`
5. push the tap repo update

This keeps the version/change authority in one place: the published CLI package.

## User Install Flows

### Canonical Agent Install

```bash
uv tool install tarnished-cli
```

Version-pinned:

```bash
uv tool install 'tarnished-cli==0.1.2'
```

### Homebrew Install

```bash
brew tap markoonakic/tap
brew install tarnished-cli
```

If the user wants to avoid ambiguity with future formula name conflicts, this should also work:

```bash
brew install markoonakic/tap/tarnished-cli
```

## Documentation Changes

The main repo should document:

- Homebrew is available as a convenience install path
- PyPI + `uv` remains the recommended path
- the tap repository name and install commands

The tap repo should document:

- what the tap contains
- exact install command
- where the source code and issue tracker live

## Testing And Verification

Before claiming success:

1. verify the CLI still builds locally from `cli/`
2. verify `uv tool install` still works
3. validate the formula syntax
4. if feasible, test the formula locally with:
   - `brew install --build-from-source`
5. verify the installed binary runs:
   - `tarnished --version`

## Non-Goals

This work does not:

- replace PyPI as the main distribution path
- change the agent installation recommendation
- move the formula into `homebrew/core`
- redesign CLI packaging itself

## Expected Deliverables

1. new external tap repo:
   - `markoonakic/homebrew-tap`
2. `Formula/tarnished-cli.rb`
3. tap README
4. main-repo documentation update mentioning the Homebrew path
5. local verification evidence for formula creation and install behavior
