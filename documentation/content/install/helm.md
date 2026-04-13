---
title: Install with Helm
description: Deploy Tarnished on Kubernetes with the published OCI Helm chart.
---

Use this install method if you already run Kubernetes and want:

- the published Tarnished OCI chart
- namespace and secret based configuration
- a production-style path that can grow past a single local container host

## Before you begin

You need:

- Kubernetes 1.23 or newer
- Helm 3.8 or newer
- `kubectl` access to the target cluster
- a working default `StorageClass`, or an explicit storage class you plan to use

## Quick evaluation install

If you want to evaluate Tarnished quickly with the chart defaults:

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --create-namespace
kubectl port-forward -n tarnished svc/tarnished 5577:5577
```

Then open `http://localhost:5577`.

## The values file used in the production-style example

For a PostgreSQL-backed install, the file you edit is a values file rather than the chart itself.

Create the required secrets first:

```bash
kubectl create namespace tarnished
kubectl create secret generic tarnished-secrets \
  -n tarnished \
  --from-literal=secret-key="$(openssl rand -hex 32)"
kubectl create secret generic tarnished-db \
  -n tarnished \
  --from-literal=password='replace-with-a-strong-password'
```

Save this as `values-production.yaml`:

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

If you already know the public hostname, extend the same file with ingress settings:

```yaml
ingress:
  enabled: true
  className: nginx
  host: jobs.example.com
  tls:
    enabled: true
```

## Install Tarnished with the values file

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --values values-production.yaml
```

If ingress is not enabled yet, access Tarnished locally:

```bash
kubectl port-forward -n tarnished svc/tarnished 5577:5577
```

## Verify the install

Check the Helm release:

```bash
helm status -n tarnished tarnished
```

Watch the pods:

```bash
kubectl get pods -n tarnished -w
```

Inspect the app logs if needed:

```bash
kubectl logs -n tarnished deploy/tarnished
```

## Where your data lives

In Helm installs:

- Tarnished uploads are stored on the PVC mounted at `/app/data`
- relational data lives in PostgreSQL when `postgresql.enabled=true`

For a real production deployment, you need backups for both the uploads volume and the PostgreSQL database.

## Important scaling note

Multiple replicas require more than just PostgreSQL.

You also need shared uploads storage, either:

- a chart-managed PVC with `persistence.accessMode=ReadWriteMany`
- or an existing shared claim with `persistence.sharedAccess=true`

## Troubleshooting

If the deployment does not become ready:

```bash
kubectl logs -n tarnished deploy/tarnished -c migrate
kubectl logs -n tarnished deploy/tarnished
```

Then continue with [Deployment and startup problems](../troubleshooting/deployment-and-startup.md).

## Related reference

For a chart-facing reference to the Tarnished values, metadata, and scaling rules, see [Helm chart reference](../reference/helm-chart-reference.md).

## Next step

Continue with [Create your admin account](../get-started/create-admin-account.md).
