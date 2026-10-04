---
title: Install with Helm
description: Install Tarnished 0.2.2 on Kubernetes with persistent storage.
---

You need Kubernetes 1.23 or newer, Helm 3.8 or newer, `kubectl` and a working
StorageClass. The chart uses one replica with `Recreate` updates. Shared storage
does not enable multiple replicas. PostgreSQL is optional and is provisioned
separately.

## Install with SQLite

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --version 0.2.2 --namespace tarnished --create-namespace
kubectl rollout status -n tarnished deploy/tarnished
kubectl port-forward -n tarnished svc/tarnished 5577:5577
```

The migration container prepares storage, generates or loads the signing secret,
and applies migrations. Preserve the PVC, including its `.secret_key` file.
Alternatively, supply an existing Kubernetes Secret with
`secretKey.existingSecret` and `secretKey.existingSecretKey`.

Open **http://localhost:5577** and create the first admin account in the browser.
You are signed in automatically. See
[account setup and recovery](../get-started/create-admin-account.md).

## External PostgreSQL

Create the database and user first. Provision a Secret named `tarnished-db` in the
`tarnished` namespace with its password under the key `password`. Save these
settings as `values-production.yaml`:

```yaml
postgresql:
  enabled: true
  host: postgres.example.com
  port: 5432
  database: tarnished
  user: tarnished
  existingSecret: tarnished-db
  existingSecretPasswordKey: password
```

Use this install command instead of the SQLite command:

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --version 0.2.2 --namespace tarnished --create-namespace \
  --values values-production.yaml
```

Keep a persistent volume for uploads and the signing secret even with PostgreSQL.
Do not commit database passwords in values files.

## Ingress and troubleshooting

Configure the ingress host, TLS certificate and trusted hosts before exposing the
service. See the [chart reference](../reference/helm-chart-reference.md) for values.

```bash
helm status -n tarnished tarnished
kubectl get pods -n tarnished
kubectl logs -n tarnished deploy/tarnished -c migrate
kubectl logs -n tarnished deploy/tarnished -c tarnished
```

With port forwarding active, `/health` returns `{"status":"healthy"}`. Read
[backup and restore](../how-to/backup-and-restore-tarnished.md) before an
[upgrade](../how-to/upgrade-tarnished.md).
