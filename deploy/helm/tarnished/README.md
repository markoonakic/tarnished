<!--
Generated from README.md.gotmpl by helm-docs.
Do not edit README.md directly.
-->

# Tarnished Helm Chart

Deploy Tarnished on Kubernetes with the published OCI Helm chart.

This chart is intended for operators who want a chart-facing reference in addition to the public install docs. For the task-focused install guide, see the published documentation site: <https://markoonakic.github.io/tarnished/install/helm>.

## TL;DR

### SQLite evaluation install

```bash
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --create-namespace
```

### PostgreSQL single-replica install

```bash
kubectl create namespace tarnished
kubectl create secret generic tarnished-secrets \
  -n tarnished \
  --from-literal=secret-key="$(openssl rand -hex 32)"
kubectl create secret generic tarnished-db \
  -n tarnished \
  --from-literal=password='replace-with-a-strong-password'
cat > values-production.yaml <<'EOF'
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
EOF
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --values values-production.yaml
```

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- A working default `StorageClass`, or an explicit storage class configured in your values
- PostgreSQL plus shared uploads storage if you plan to run multiple replicas

## Install modes

### SQLite evaluation mode

The default chart configuration uses SQLite with persistent uploads storage and a single Tarnished replica. This is appropriate for evaluation and small single-instance installs.

### PostgreSQL single replica mode

For production-style installs, use external PostgreSQL and a persistent uploads volume even if you only run one Tarnished replica.

### PostgreSQL with multiple replicas

Multiple replicas require more than just PostgreSQL. You also need shared uploads storage, either:

- a chart-managed PVC with `persistence.accessMode=ReadWriteMany`
- or an existing shared claim plus `persistence.sharedAccess=true`

The chart templates validate these requirements and fail fast on unsupported combinations.

## Secrets

### SECRET_KEY

Use `secretKey.existingSecret` and `secretKey.existingSecretKey` to provide a stable `SECRET_KEY` for Tarnished JWT signing.

### PostgreSQL password

Use `postgresql.existingSecret` and `postgresql.existingSecretPasswordKey` to source the PostgreSQL password from a Secret.

When `existingSecret` is not set, the chart can take the password directly from `postgresql.password`, but a Secret-backed configuration is preferred for real deployments.

## Persistence and data layout

The chart mounts Tarnished data at `/app/data`.

- uploads live under `/app/data/uploads`
- SQLite, when used, also stores its local database under `/app/data`
- PostgreSQL-backed installs still use `/app/data` for uploads and local app state, while relational data lives in PostgreSQL

For chart-managed PVCs, the chart applies `helm.sh/resource-policy: keep` to reduce accidental data loss on uninstall.

## Networking and ingress

Use the `service` block to control the Kubernetes Service and the `ingress` block to publish Tarnished behind a hostname.

When ingress is enabled, the chart also sets `APP_URL` from the configured host and TLS settings.

## Health probes

The chart exposes configurable `startupProbe`, `readinessProbe`, and `livenessProbe` values. The defaults all target Tarnished's `/health` endpoint.

## Cleanup CronJob

The optional `cleanup` block enables a Kubernetes CronJob that runs Tarnished's orphaned-upload cleanup command.

Use `cleanup.mode=dry-run` to audit first. Switch to `delete` only after you are comfortable with the results.

## Upgrading

```bash
helm upgrade tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --values values-production.yaml
```

The chart runs database migrations through an init container before the Tarnished app starts.

## Notes on generated documentation

This README is generated from `README.md.gotmpl` and the comments in `values.yaml`. Keep the `values.yaml` comments accurate because they feed the values table below.

## Maintainers

| Name | Email | Url |
| ---- | ------ | --- |
| Marko Onakic |  | <https://github.com/markoonakic> |
## Source Code

* <https://github.com/markoonakic/tarnished>
## Requirements

Kubernetes: `>=1.23.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` | Affinity rules |
| cleanup | object | `{"enabled":false,"failedJobsHistoryLimit":1,"mode":"dry-run","resources":{"limits":{"cpu":"50m","memory":"32Mi"},"requests":{"cpu":"10m","memory":"16Mi"}},"schedule":"0 3 * * *","startingDeadlineSeconds":600,"successfulJobsHistoryLimit":1,"timeZone":"Etc/UTC"}` | Configuration for the optional upload cleanup CronJob. |
| cleanup.enabled | bool | `false` | Enable a Kubernetes CronJob that runs upload cleanup. Disabled by default; the cleanup command remains available manually for all deployment modes. |
| cleanup.failedJobsHistoryLimit | int | `1` | Keep recent failed jobs. |
| cleanup.mode | string | `"dry-run"` | Cleanup mode: "dry-run" reports only, "delete" removes orphaned CAS blobs. |
| cleanup.resources | object | `{"limits":{"cpu":"50m","memory":"32Mi"},"requests":{"cpu":"10m","memory":"16Mi"}}` | Resource requests and limits for the cleanup CronJob container. |
| cleanup.resources.limits.cpu | string | `"50m"` | CPU limit for the cleanup CronJob container. |
| cleanup.resources.limits.memory | string | `"32Mi"` | Memory limit for the cleanup CronJob container. |
| cleanup.resources.requests.cpu | string | `"10m"` | CPU request for the cleanup CronJob container. |
| cleanup.resources.requests.memory | string | `"16Mi"` | Memory request for the cleanup CronJob container. |
| cleanup.schedule | string | `"0 3 * * *"` | Cron schedule for the cleanup job. |
| cleanup.startingDeadlineSeconds | int | `600` | How long Kubernetes may delay a missed start before skipping it. |
| cleanup.successfulJobsHistoryLimit | int | `1` | Keep recent successful jobs. |
| cleanup.timeZone | string | `"Etc/UTC"` | CronJob time zone. |
| env | list | `[]` | Additional environment variables |
| envFrom | list | `[]` | Additional environment variables from ConfigMaps/Secrets |
| fullnameOverride | string | `""` | Override the full release name |
| image.pullPolicy | string | `"IfNotPresent"` | Image pull policy |
| image.repository | string | `"ghcr.io/markoonakic/tarnished"` | Container image repository |
| image.tag | string | `""` | Container image tag (defaults to .Chart.AppVersion if empty) |
| imagePullSecrets | list | `[]` | Image pull secrets for private registries |
| ingress.annotations | object | `{}` | Ingress annotations (e.g. cert-manager, nginx config) |
| ingress.className | string | `""` | Ingress class name (e.g. "nginx", "traefik") |
| ingress.enabled | bool | `false` | Enable ingress |
| ingress.host | string | `"tarnished.local"` | Hostname |
| ingress.paths | list | `[{"path":"/","pathType":"Prefix"}]` | Ingress paths |
| ingress.tls.enabled | bool | `false` | Enable TLS |
| ingress.tls.secretName | string | `"tarnished-tls"` | TLS secret name (cert-manager auto-creates if annotations set) |
| initContainer | object | `{"resources":{"limits":{"cpu":"200m","memory":"256Mi"},"requests":{"cpu":"50m","memory":"128Mi"}}}` | Configuration for the migration init container. |
| initContainer.resources.limits.cpu | string | `"200m"` | CPU limit for the migration init container. |
| initContainer.resources.limits.memory | string | `"256Mi"` | Memory limit for the migration init container. |
| initContainer.resources.requests.cpu | string | `"50m"` | CPU request for the migration init container. |
| initContainer.resources.requests.memory | string | `"128Mi"` | Memory request for the migration init container. |
| livenessProbe | object | `{"failureThreshold":3,"httpGet":{"httpHeaders":[{"name":"Host","value":"localhost"}],"path":"/health","port":"http"},"initialDelaySeconds":30,"periodSeconds":10,"timeoutSeconds":5}` | Liveness probe for the Tarnished app container. |
| livenessProbe.failureThreshold | int | `3` | Consecutive failures required before the liveness probe fails. |
| livenessProbe.httpGet.path | string | `"/health"` | HTTP path used by the liveness probe. |
| livenessProbe.httpGet.port | string | `"http"` | Named port used by the liveness probe. |
| livenessProbe.initialDelaySeconds | int | `30` | Initial delay before Kubernetes starts running the liveness probe. |
| livenessProbe.periodSeconds | int | `10` | Interval between liveness probe executions. |
| livenessProbe.timeoutSeconds | int | `5` | Timeout for each liveness probe execution. |
| nameOverride | string | `""` | Override the chart name |
| nodeSelector | object | `{}` | Node selector |
| persistence.accessMode | string | `"ReadWriteOnce"` | Access mode for chart-managed PVCs. SQLite should stay on ReadWriteOnce. Multiple replicas require shared write access. |
| persistence.annotations | object | `{"helm.sh/resource-policy":"keep"}` | Annotations applied to the chart-managed PVC. |
| persistence.enabled | bool | `true` | Enable persistent storage |
| persistence.existingClaim | string | `""` | Use an existing PVC instead of creating one |
| persistence.sharedAccess | bool | `false` | Acknowledge that the chosen existing claim supports shared read-write access across replicas. Required when replicaCount > 1 and using existingClaim. |
| persistence.size | string | `"1Gi"` | PVC size |
| persistence.storageClass | string | `""` | Storage class (empty = cluster default) |
| podAnnotations | object | `{}` | Pod-level annotations (e.g. prometheus.io/scrape) |
| podLabels | object | `{}` | Pod-level labels |
| podSecurityContext | object | `{"fsGroup":1000,"runAsGroup":1000,"runAsNonRoot":true,"runAsUser":1000,"seccompProfile":{"type":"RuntimeDefault"}}` | Pod security context applied to Tarnished pods and the migration init container. |
| postgresql.database | string | `"tarnished"` | Database name |
| postgresql.enabled | bool | `false` | Enable external PostgreSQL (disables SQLite) |
| postgresql.existingSecret | string | `""` | Use an existing Kubernetes Secret for PostgreSQL credentials Secret must contain: password (URL encoding NOT required - app handles it) |
| postgresql.existingSecretPasswordKey | string | `"password"` | Key within the existing secret for the password |
| postgresql.host | string | `""` | PostgreSQL host |
| postgresql.password | string | `""` | Database password (ignored if existingSecret is set) |
| postgresql.port | int | `5432` | PostgreSQL port |
| postgresql.user | string | `"tarnished"` | Database user |
| readinessProbe | object | `{"failureThreshold":3,"httpGet":{"httpHeaders":[{"name":"Host","value":"localhost"}],"path":"/health","port":"http"},"initialDelaySeconds":10,"periodSeconds":5,"timeoutSeconds":3}` | Readiness probe for the Tarnished app container. |
| readinessProbe.failureThreshold | int | `3` | Consecutive failures required before the readiness probe fails. |
| readinessProbe.httpGet.path | string | `"/health"` | HTTP path used by the readiness probe. |
| readinessProbe.httpGet.port | string | `"http"` | Named port used by the readiness probe. |
| readinessProbe.initialDelaySeconds | int | `10` | Initial delay before Kubernetes starts running the readiness probe. |
| readinessProbe.periodSeconds | int | `5` | Interval between readiness probe executions. |
| readinessProbe.timeoutSeconds | int | `3` | Timeout for each readiness probe execution. |
| replicaCount | int | `1` | Number of replicas. Must be 1 when using SQLite (default). Multiple replicas require PostgreSQL plus shared upload storage (ReadWriteMany PVC, or an existing shared claim with persistence.sharedAccess=true). |
| resources | object | `{"limits":{"cpu":"500m","memory":"512Mi"},"requests":{"cpu":"100m","memory":"256Mi"}}` | Resource requests and limits for the Tarnished app container. |
| resources.limits.cpu | string | `"500m"` | CPU limit for the Tarnished app container. |
| resources.limits.memory | string | `"512Mi"` | Memory limit for the Tarnished app container. |
| resources.requests.cpu | string | `"100m"` | CPU request for the Tarnished app container. |
| resources.requests.memory | string | `"256Mi"` | Memory request for the Tarnished app container. |
| secretKey.existingSecret | string | `""` | Use an existing Kubernetes Secret for SECRET_KEY If empty, the app auto-generates a key on first run |
| secretKey.existingSecretKey | string | `"secret-key"` | Key within the existing secret |
| securityContext | object | `{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]},"readOnlyRootFilesystem":false}` | Container security context applied to the Tarnished app container and migration init container. |
| service.port | int | `5577` | Service port |
| service.type | string | `"ClusterIP"` | Service type |
| serviceAccount.annotations | object | `{}` | ServiceAccount annotations |
| serviceAccount.automount | bool | `false` | Automount API credentials. Leave false unless the app must call the Kubernetes API. |
| serviceAccount.create | bool | `true` | Create a ServiceAccount |
| serviceAccount.name | string | `""` | ServiceAccount name (generated if empty) |
| startupProbe | object | `{"failureThreshold":12,"httpGet":{"httpHeaders":[{"name":"Host","value":"localhost"}],"path":"/health","port":"http"},"periodSeconds":5,"timeoutSeconds":3}` | Startup probe for the Tarnished app container. |
| startupProbe.failureThreshold | int | `12` | Consecutive failures required before the startup probe fails. |
| startupProbe.httpGet.path | string | `"/health"` | HTTP path used by the startup probe. |
| startupProbe.httpGet.port | string | `"http"` | Named port used by the startup probe. |
| startupProbe.periodSeconds | int | `5` | Interval between startup probe executions. |
| startupProbe.timeoutSeconds | int | `3` | Timeout for each startup probe execution. |
| tolerations | list | `[]` | Tolerations |
| trustedHosts | list | `[]` | Extra hostnames allowed by TrustedHostMiddleware. These are appended to localhost/test defaults and the APP_URL hostname. |
