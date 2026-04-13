---
title: Install Tarnished
description: Choose the Tarnished install path that fits your environment.
---

Use this section to install Tarnished for the first time.

Every install guide in this section is designed to be self-contained:

- the copy-paste commands are near the top
- the actual file contents used by the guide are shown on the page
- verification steps are included
- the guide tells you where your data lives after installation

## Choose an install method

### Install with Docker Compose

Use [Install with Docker Compose](./docker-compose.md) if you want:

- the fastest self-hosted install path
- a single Docker Compose file
- the default SQLite-backed setup

### Install with PostgreSQL Docker Compose

Use [Install with PostgreSQL Docker Compose](./postgresql-docker-compose.md) if you want:

- local PostgreSQL from the start
- separate app and database storage
- a Docker Compose workflow that is still easy to run locally

### Install with Helm

Use [Install with Helm](./helm.md) if you already run Kubernetes and want:

- a cluster-native install path
- secret-based configuration
- the published Tarnished OCI chart

## After installation

When Tarnished is up and responding, continue with:

- [Create your admin account](../get-started/create-admin-account.md)
- [Create your first application](../get-started/create-your-first-application.md)
- [Create your first API key](../get-started/create-your-first-api-key.md)
- [Back up and restore Tarnished](../how-to/backup-and-restore-tarnished.md)
