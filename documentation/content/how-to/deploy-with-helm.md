---
title: Deploy with Helm
sidebar_position: 1
description: Install Tarnished on Kubernetes with the published OCI Helm chart.
---

Use this guide if you want to run Tarnished on Kubernetes with the published Helm chart.

This page covers two supported paths:

- a minimal SQLite-backed evaluation install
- a PostgreSQL-backed install using Kubernetes Secrets and a values file

## Before you begin

You need:

- a Kubernetes cluster
- Helm 3.8 or newer
- a working default `StorageClass`, or an explicit storage class you plan to use
- `kubectl` access to the target cluster

## Option 1: Evaluate Tarnished quickly with the default chart

This path keeps the chart defaults, which means:

- single replica
- SQLite-backed app storage
- a chart-managed persistent volume claim
- no ingress by default

Install the chart:

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --create-namespace
```

Access Tarnished locally:

```bash
kubectl port-forward -n tarnished svc/tarnished 5577:5577
```

Then open `http://localhost:5577` in your browser.

:::warning
The default SQLite mode is a single-replica path. Do not scale this into a multi-replica deployment.
:::

## Option 2: Install Tarnished with PostgreSQL (recommended)

This is the recommended starting point for production-style installs, even if you only plan to run one replica.

### Step 1: Create the namespace

```bash
kubectl create namespace tarnished
```

### Step 2: Create the required Secrets

Create a secret for the app `SECRET_KEY`:

```bash
kubectl create secret generic tarnished-secrets \
  -n tarnished \
  --from-literal=secret-key="$(openssl rand -hex 32)"
```

Create a secret for the PostgreSQL password:

```bash
kubectl create secret generic tarnished-db \
  -n tarnished \
  --from-literal=password='replace-with-a-strong-password'
```

### Step 3: Create a values file

Create `values-production.yaml`:

```yaml
postgresql:
  enabled: true
  host: postgres.example.com
  port: 5432
  database: tarnished
  user: tarnished
  existingSecret: tarnished-db
  existingSecretPasswordKey: password

secretKey:
  existingSecret: tarnished-secrets
  existingSecretKey: secret-key
```

If you already know the public hostname, extend the values file with ingress settings:

```yaml
ingress:
  enabled: true
  className: nginx
  host: jobs.example.com
  tls:
    enabled: true
```

### Step 4: Install the chart

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --values values-production.yaml
```

If ingress is not enabled yet, access Tarnished with:

```bash
kubectl port-forward -n tarnished svc/tarnished 5577:5577
```

Then open `http://localhost:5577`.

## Multiple replicas

Multiple replicas require more than just PostgreSQL.

You must also provide shared uploads storage, either:

- a chart-managed PVC with `persistence.accessMode=ReadWriteMany`
- or an existing shared claim with `persistence.sharedAccess=true`

Example values file fragment for an existing shared claim:

```yaml
replicaCount: 2

postgresql:
  enabled: true
  host: postgres.example.com
  user: tarnished
  database: tarnished
  existingSecret: tarnished-db
  existingSecretPasswordKey: password

secretKey:
  existingSecret: tarnished-secrets

persistence:
  existingClaim: tarnished-uploads
  sharedAccess: true
```

## What the chart does for you

The current chart:

- runs database migrations in an init container
- mounts app data at `/app/data`
- keeps ServiceAccount token automount disabled by default
- applies liveness, readiness, and startup probes
- supports an optional cleanup CronJob for orphaned uploads

## Troubleshooting

### Check the release status

```bash
helm status -n tarnished tarnished
```

### Render the chart locally before installing

```bash
helm template tarnished ./deploy/helm/tarnished
```

### Watch pods in the namespace

```bash
kubectl get pods -n tarnished -w
```

### Inspect the app logs

```bash
kubectl logs -n tarnished deploy/tarnished
```

### Inspect the migration init container logs

```bash
kubectl logs -n tarnished deploy/tarnished -c migrate
```

## Next steps

- Use [Reference](../reference/index.md) when you need exact Helm values or configuration detail.
- Use [Troubleshooting](../troubleshooting/index.md) when you are diagnosing deployment problems.
