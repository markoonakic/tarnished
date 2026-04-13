# Tarnished Helm Chart

A Helm chart for deploying Tarnished on Kubernetes.

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- PersistentVolume provisioner (if using default SQLite mode)

Notes:

- Enabling the optional cleanup CronJob with `.Values.cleanup.timeZone` relies on the CronJob time-zone field, which is stable in Kubernetes 1.27+.
- Multiple replicas require PostgreSQL **and** shared uploads storage.

## Installation

### From OCI Registry (Recommended)

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished
```

### From Source

```bash
helm install tarnished ./chart/
```

## Configuration

### Quick Start (SQLite)

The default configuration uses SQLite with persistent storage:

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished
```

### With External PostgreSQL

Recommended for production even with a single replica:

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --set postgresql.enabled=true \
  --set postgresql.host=postgres.example.com \
  --set postgresql.port=5432 \
  --set postgresql.database=tarnished \
  --set postgresql.user=tarnished \
  --set postgresql.password=your-password
```

### With Multiple Replicas

Multiple replicas require:

- `postgresql.enabled=true`
- shared uploads storage
  - either a chart-managed PVC with `persistence.accessMode=ReadWriteMany`
  - or an existing shared claim plus `persistence.sharedAccess=true`

Example using an existing shared claim:

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --set replicaCount=2 \
  --set postgresql.enabled=true \
  --set postgresql.host=postgres.example.com \
  --set postgresql.port=5432 \
  --set postgresql.database=tarnished \
  --set postgresql.user=tarnished \
  --set postgresql.password=your-password \
  --set persistence.existingClaim=tarnished-uploads \
  --set persistence.sharedAccess=true
```

### With Ingress and TLS

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.host=jobs.example.com \
  --set ingress.annotations."cert-manager\.io/cluster-issuer"=letsencrypt-prod \
  --set ingress.tls.enabled=true
```

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `replicaCount` | int | `1` | Number of replicas. Must be 1 for SQLite mode. |
| `image.repository` | string | `ghcr.io/markoonakic/tarnished` | Container image repository |
| `image.tag` | string | `""` | Container image tag (defaults to appVersion) |
| `image.pullPolicy` | string | `IfNotPresent` | Image pull policy |
| `imagePullSecrets` | list | `[]` | Image pull secrets for private registries |
| `nameOverride` | string | `""` | Override chart name |
| `fullnameOverride` | string | `""` | Override full release name |
| `serviceAccount.create` | bool | `true` | Create a ServiceAccount |
| `serviceAccount.automount` | bool | `false` | Automount API credentials (leave off unless the workload must call the Kubernetes API) |
| `serviceAccount.annotations` | object | `{}` | ServiceAccount annotations |
| `serviceAccount.name` | string | `""` | ServiceAccount name (auto-generated if empty) |
| `podAnnotations` | object | `{}` | Pod annotations |
| `podLabels` | object | `{}` | Pod labels |
| `podSecurityContext` | object | See values | Pod security context |
| `securityContext` | object | See values | Container security context |
| `service.type` | string | `ClusterIP` | Service type |
| `service.port` | int | `5577` | Service port |
| `ingress.enabled` | bool | `false` | Enable ingress |
| `ingress.className` | string | `""` | Ingress class name |
| `ingress.annotations` | object | `{}` | Ingress annotations |
| `ingress.host` | string | `tarnished.local` | Hostname |
| `ingress.paths` | list | `[{path: /, pathType: Prefix}]` | Ingress paths |
| `ingress.tls.enabled` | bool | `false` | Enable TLS |
| `ingress.tls.secretName` | string | `tarnished-tls` | TLS secret name |
| `persistence.enabled` | bool | `true` | Enable persistent storage |
| `persistence.storageClass` | string | `""` | Storage class (cluster default if empty) |
| `persistence.size` | string | `1Gi` | PVC size |
| `persistence.accessMode` | string | `ReadWriteOnce` | Access mode |
| `persistence.existingClaim` | string | `""` | Use existing PVC |
| `persistence.sharedAccess` | bool | `false` | Required acknowledgement when scaling replicas on top of an existing shared claim |
| `postgresql.enabled` | bool | `false` | Enable PostgreSQL mode |
| `postgresql.host` | string | `""` | PostgreSQL host |
| `postgresql.port` | int | `5432` | PostgreSQL port |
| `postgresql.database` | string | `tarnished` | Database name |
| `postgresql.user` | string | `tarnished` | Database user |
| `postgresql.password` | string | `""` | Database password |
| `postgresql.existingSecret` | string | `""` | Existing secret for PostgreSQL credentials |
| `postgresql.existingSecretPasswordKey` | string | `password` | Key within the existing secret for the PostgreSQL password |
| `secretKey.existingSecret` | string | `""` | Existing secret for SECRET_KEY |
| `secretKey.existingSecretKey` | string | `secret-key` | Key within existing secret |
| `trustedHosts` | list | `[]` | Extra hostnames allowed by TrustedHostMiddleware |
| `env` | list | `[]` | Additional environment variables |
| `envFrom` | list | `[]` | Environment variables from ConfigMaps/Secrets |
| `resources.requests.memory` | string | `256Mi` | Memory request |
| `resources.requests.cpu` | string | `100m` | CPU request |
| `resources.limits.memory` | string | `512Mi` | Memory limit |
| `resources.limits.cpu` | string | `500m` | CPU limit |
| `initContainer.resources.requests.memory` | string | `128Mi` | Init container memory request |
| `initContainer.resources.requests.cpu` | string | `50m` | Init container CPU request |
| `initContainer.resources.limits.memory` | string | `256Mi` | Init container memory limit |
| `initContainer.resources.limits.cpu` | string | `200m` | Init container CPU limit |
| `livenessProbe` | object | See values | Liveness probe configuration |
| `readinessProbe` | object | See values | Readiness probe configuration |
| `startupProbe` | object | See values | Startup probe configuration |
| `nodeSelector` | object | `{}` | Node selector |
| `tolerations` | list | `[]` | Tolerations |
| `affinity` | object | `{}` | Affinity rules |
| `cleanup.enabled` | bool | `false` | Enable upload cleanup CronJob |
| `cleanup.schedule` | string | `0 3 * * *` | Cleanup CronJob schedule |
| `cleanup.timeZone` | string | `Etc/UTC` | Cleanup CronJob time zone (Kubernetes 1.27+ when used) |
| `cleanup.mode` | string | `dry-run` | Cleanup mode (`dry-run` or `delete`) |
| `cleanup.successfulJobsHistoryLimit` | int | `1` | Successful cleanup job history |
| `cleanup.failedJobsHistoryLimit` | int | `1` | Failed cleanup job history |
| `cleanup.startingDeadlineSeconds` | int | `600` | Missed-start deadline for cleanup jobs |
| `cleanup.resources` | object | See values | Cleanup CronJob resources |

## Upgrading

### Upgrading the Chart

```bash
helm upgrade tarnished oci://ghcr.io/markoonakic/charts/tarnished
```

### Database Migrations

The chart runs database migrations automatically during pod startup via an init container. No manual intervention is required.

## Persistence

The chart stores uploaded files on `/app/data`.

- **SQLite mode** should remain single-replica and typically uses `ReadWriteOnce`
- **PostgreSQL mode with one replica** can use the same single-writer PVC pattern
- **PostgreSQL mode with multiple replicas** must use shared uploads storage (`ReadWriteMany`, or an existing shared claim with `persistence.sharedAccess=true`)

For chart-managed PVCs, the chart applies `helm.sh/resource-policy: keep` to reduce accidental data loss during `helm uninstall`. The PVC must be deleted manually if you intentionally want to remove all uploads:

```bash
kubectl delete pvc <pvc-name>
```

## Security

The chart deploys with secure defaults:

- Non-root user/group (UID/GID 1000)
- ServiceAccount token automount disabled by default
- Read-only root filesystem disabled (app writes to `/app/data`)
- All capabilities dropped
- Seccomp profile: RuntimeDefault

## First-Time Setup

After installation, navigate to the application URL and create your admin account. The first registered user automatically becomes the administrator.

## Secrets

When deploying to production, you should create Kubernetes Secrets externally and reference them via `existingSecret` values.

### Application Secret Key

Required for JWT token signing:

```bash
kubectl create secret generic tarnished-secrets \
  --from-literal=secret-key='your-secure-random-string-here'
```

Then in your values:

```yaml
secretKey:
  existingSecret: tarnished-secrets
  existingSecretKey: secret-key
```

### PostgreSQL Credentials (when postgresql.enabled=true)

Required keys:

| Key      | Description                                                      |
|----------|------------------------------------------------------------------|
| password | PostgreSQL user password (URL encoding NOT required - app handles it) |

```bash
kubectl create secret generic tarnished-db \
  --from-literal=password='your-postgres-password'
```

Then in your values:

```yaml
postgresql:
  enabled: true
  host: your-postgres-host
  user: tarnished
  database: tarnished
  existingSecret: tarnished-db
  existingSecretPasswordKey: password
```

**Note:** The password can contain special characters (`@`, `:`, `/`, etc.) - the application handles URL encoding automatically. Do NOT pre-encode the password.

### Complete Production Example

```yaml
# values-production.yaml
postgresql:
  enabled: true
  host: tarnished-postgres-postgresql
  user: tarnished
  database: tarnished
  existingSecret: tarnished-db

secretKey:
  existingSecret: tarnished-secrets

ingress:
  enabled: true
  className: nginx
  host: jobs.example.com
  tls:
    enabled: true
```
