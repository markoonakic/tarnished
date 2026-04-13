---
title: Helm chart reference
description: Operator-facing reference for the Tarnished Helm chart.
---

Use this page when you need chart-facing detail beyond the task-focused [Install with Helm](../install/helm.md) guide.

## Source-of-truth files

The Tarnished Helm chart lives under `deploy/helm/tarnished/`.

The main source-of-truth files are:

- `Chart.yaml` — chart metadata and Artifact Hub-facing annotations
- `values.yaml` — default chart configuration and inline value descriptions
- `values.schema.json` — machine-readable validation and values reference metadata
- `README.md` — chart-facing reference README generated from `README.md.gotmpl` and `values.yaml`

## Install modes

### SQLite evaluation mode

Default values install Tarnished with:

- one replica
- SQLite-backed local state
- persistent uploads storage on the chart PVC

This mode is appropriate for evaluation and simple single-instance installs.

### PostgreSQL single replica mode

For production-style installs, prefer:

- `postgresql.enabled=true`
- a Secret-backed database password
- a stable `SECRET_KEY`
- persistent uploads storage

### PostgreSQL multi-replica mode

Multiple replicas require:

- `replicaCount > 1`
- `postgresql.enabled=true`
- shared uploads storage

Shared uploads storage means either:

- a chart-managed PVC with `persistence.accessMode=ReadWriteMany`
- or an existing shared claim with `persistence.existingClaim` and `persistence.sharedAccess=true`

The chart templates fail fast on unsupported combinations.

## Key value groups

### Image and release naming

Use these values to control the deployed image and generated resource names:

- `image.repository`
- `image.tag`
- `image.pullPolicy`
- `nameOverride`
- `fullnameOverride`
- `imagePullSecrets`

### Service account and pod security

These values control the pod identity and security posture:

- `serviceAccount.*`
- `podSecurityContext`
- `securityContext`
- `podAnnotations`
- `podLabels`

The default chart posture is intentionally conservative:

- non-root execution
- dropped Linux capabilities
- ServiceAccount token automount disabled by default

### Service and ingress

Use these values to expose Tarnished in-cluster and externally:

- `service.type`
- `service.port`
- `ingress.enabled`
- `ingress.className`
- `ingress.host`
- `ingress.paths`
- `ingress.tls.*`

When ingress is enabled, the chart also sets `APP_URL` from the configured host and TLS settings.

### Persistence

These values control Tarnished uploads and local app data storage:

- `persistence.enabled`
- `persistence.storageClass`
- `persistence.size`
- `persistence.accessMode`
- `persistence.existingClaim`
- `persistence.sharedAccess`
- `persistence.annotations`

The chart-managed PVC includes `helm.sh/resource-policy: keep` to reduce accidental data loss during uninstall.

### PostgreSQL

These values switch Tarnished from SQLite to PostgreSQL mode:

- `postgresql.enabled`
- `postgresql.host`
- `postgresql.port`
- `postgresql.database`
- `postgresql.user`
- `postgresql.password`
- `postgresql.existingSecret`
- `postgresql.existingSecretPasswordKey`

For real deployments, prefer `existingSecret` over putting the password directly in a values file.

### SECRET_KEY and extra environment

Use:

- `secretKey.existingSecret`
- `secretKey.existingSecretKey`
- `env`
- `envFrom`
- `trustedHosts`

Use a stable `SECRET_KEY` for production-style installs so Tarnished JWT signing remains consistent across restarts and upgrades.

### Probes and resources

The chart exposes configurable app probes and container resources:

- `resources`
- `initContainer.resources`
- `startupProbe`
- `readinessProbe`
- `livenessProbe`

All default probes target Tarnished's `/health` endpoint.

### Cleanup CronJob

The optional upload cleanup job is controlled by:

- `cleanup.enabled`
- `cleanup.schedule`
- `cleanup.timeZone`
- `cleanup.mode`
- `cleanup.successfulJobsHistoryLimit`
- `cleanup.failedJobsHistoryLimit`
- `cleanup.startingDeadlineSeconds`
- `cleanup.resources`

Start with `cleanup.mode=dry-run` before using `delete`.

## Generated chart README

The chart-facing README is generated from:

- `deploy/helm/tarnished/README.md.gotmpl`
- `deploy/helm/tarnished/values.yaml`

That README is the place where the full values table should remain exhaustive.

## Related pages

- [Install with Helm](../install/helm.md)
- [Environment variables](./environment-variables.md)
- [Storage and backups](../explanation/storage-and-backups.md)
- [Deployment and startup problems](../troubleshooting/deployment-and-startup.md)
