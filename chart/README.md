# Tarnished Helm Chart

A Helm chart for deploying Tarnished on Kubernetes.

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- PersistentVolume provisioner (if using default SQLite mode)

## Installation

### From OCI Registry (Recommended)

```bash
helm install tarnished oci://ghcr.io/markoonakic/tarnished
```

### From Source

```bash
helm install tarnished ./chart/
```

## Configuration

### Quick Start (SQLite)

The default configuration uses SQLite with persistent storage:

```bash
helm install tarnished oci://ghcr.io/markoonakic/tarnished
```

### With PostgreSQL

For production deployments with multiple replicas:

```bash
helm install tarnished oci://ghcr.io/markoonakic/tarnished \
  --set postgresql.enabled=true \
  --set postgresql.host=postgres.example.com \
  --set postgresql.database=tarnished \
  --set postgresql.user=tarnished \
  --set postgresql.password=your-password \
  --set replicaCount=2
```

### With Ingress and TLS

```bash
helm install tarnished oci://ghcr.io/markoonakic/tarnished \
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
| `image.tag` | string | `latest` | Container image tag |
| `image.pullPolicy` | string | `IfNotPresent` | Image pull policy |
| `imagePullSecrets` | list | `[]` | Image pull secrets for private registries |
| `nameOverride` | string | `""` | Override chart name |
| `fullnameOverride` | string | `""` | Override full release name |
| `serviceAccount.create` | bool | `true` | Create a ServiceAccount |
| `serviceAccount.automount` | bool | `true` | Automount API credentials |
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
| `postgresql.enabled` | bool | `false` | Enable PostgreSQL mode |
| `postgresql.host` | string | `""` | PostgreSQL host |
| `postgresql.database` | string | `tarnished` | Database name |
| `postgresql.user` | string | `tarnished` | Database user |
| `postgresql.password` | string | `""` | Database password |
| `secretKey.existingSecret` | string | `""` | Existing secret for SECRET_KEY |
| `secretKey.existingSecretKey` | string | `secret-key` | Key within existing secret |
| `env` | list | `[]` | Additional environment variables |
| `envFrom` | list | `[]` | Environment variables from ConfigMaps/Secrets |
| `resources.requests.memory` | string | `256Mi` | Memory request |
| `resources.requests.cpu` | string | `100m` | CPU request |
| `resources.limits.memory` | string | `512Mi` | Memory limit |
| `resources.limits.cpu` | string | `500m` | CPU limit |
| `livenessProbe` | object | See values | Liveness probe configuration |
| `readinessProbe` | object | See values | Readiness probe configuration |
| `nodeSelector` | object | `{}` | Node selector |
| `tolerations` | list | `[]` | Tolerations |
| `affinity` | object | `{}` | Affinity rules |

## Upgrading

### Upgrading the Chart

```bash
helm upgrade tarnished oci://ghcr.io/markoonakic/tarnished
```

### Database Migrations

The chart runs database migrations automatically during pod startup via an init container. No manual intervention is required.

## Persistence

The chart uses a PersistentVolumeClaim with `helm.sh/resource-policy: keep` annotation to prevent accidental data loss during `helm uninstall`. The PVC must be manually deleted if you want to remove all data:

```bash
kubectl delete pvc <pvc-name>
```

## Security

The chart deploys with secure defaults:

- Non-root user (UID 1000)
- Read-only root filesystem disabled (app writes to `/app/data`)
- All capabilities dropped
- Seccomp profile: RuntimeDefault

## First-Time Setup

After installation, navigate to the application URL and create your admin account. The first registered user automatically becomes the administrator.
