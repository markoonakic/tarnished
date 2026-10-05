---
title: Install Tarnished
description: Choose a deployment method for Tarnished 0.2.4.
---

Start with [Docker Compose and SQLite](./docker-compose.md). It needs only Docker
and stores application data in one local directory.

Other options:

- [Docker Compose with PostgreSQL](./postgresql-docker-compose.md) for a separate database service.
- [Helm](./helm.md) for an existing Kubernetes cluster.

All methods use one application process and persistent storage. AI services are
optional. After startup, [create the first account](../get-started/create-admin-account.md).
