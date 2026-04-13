# Tarnished deployment assets

This directory contains the user-facing deployment assets for Tarnished.

**Documentation:** https://markoonakic.github.io/tarnished/

For the public install guides, start with:
- https://markoonakic.github.io/tarnished/install/

## Structure

- `compose/` — Docker Compose install files for published container images
- `helm/tarnished/` — Helm chart for Kubernetes installs

## Purpose

Deployment assets live here so the public install surface is separated from the source tree used for development and contribution.

End users should not need to clone the full repository just to get:

- Docker Compose install files
- Helm chart files
- environment file examples for packaged installs
