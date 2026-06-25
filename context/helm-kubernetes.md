# Helm/Kubernetes deployment interview context

Scope: only the Helm/Kubernetes deployment surface for this repo. The chart is for **Tarnished** (the app in this repo), published as an OCI Helm chart and deploying one all-in-one app container.

## Mental model

- Chart root: `deploy/helm/tarnished/` (`deploy/README.md:10-23`).
- Chart metadata: application chart `tarnished`, version/appVersion `0.1.7`, Kubernetes `>=1.23.0-0`, image annotation `ghcr.io/markoonakic/tarnished:0.1.7` (`deploy/helm/tarnished/Chart.yaml:1-7`, `31-33`).
- Published install path is OCI: `oci://ghcr.io/markoonakic/charts/tarnished` (`documentation/content/install/helm.md:21-30`, `78-84`). Helm 3.8+ is documented for OCI chart support (`documentation/content/install/helm.md:12-19`).
- The container image bundles backend + built frontend. It exposes port `5577`, runs as non-root `appuser`, sets `UPLOAD_DIR=/app/data/uploads`, and uses `entrypoint.sh` (`Dockerfile:62-89`).
- `/health` exists and is used by probes/tests (`backend/app/main.py:133-135`).

## Source-of-truth files

- `deploy/helm/tarnished/Chart.yaml` — chart/app metadata, kube version, Artifact Hub annotations (`1-33`).
- `deploy/helm/tarnished/values.yaml` — defaults and docs comments for all knobs (`1-259`).
- `deploy/helm/tarnished/values.schema.json` — machine-readable value validation/descriptions (`1-335`). Important: mostly type/enum validation; `additionalProperties: true` (`4-6`).
- `deploy/helm/tarnished/templates/*.yaml` — Kubernetes manifests.
- `deploy/helm/tarnished/README.md` — generated chart README; says not to edit directly and contains install modes, secrets, persistence, upgrade notes (`1-127`).
- `documentation/content/install/helm.md` — user install guide (`1-147`).
- `documentation/content/reference/helm-chart-reference.md` — operator reference and value group overview (`8-173`).
- CI/release validation and publishing: CI lints/renders chart scenarios (`.github/workflows/ci.yml:161-185`); release packages/pushes chart to GHCR OCI (`.github/workflows/release.yml:484-505`).

## What each Helm template/object does

| File | Object(s) | Purpose / behavior |
|---|---|---|
| `templates/_helpers.tpl` | helper templates | Generates names/labels/service account names (`4-62`). Chooses Deployment strategy: `Recreate` for SQLite/default, `RollingUpdate` with 25% surge/unavailable for PostgreSQL (`64-77`). |
| `templates/serviceaccount.yaml` | `ServiceAccount` | Created only when `serviceAccount.create=true`; name generated or supplied. Token automount defaults false (`1-12`; values `22-30`). |
| `templates/persistentvolumeclaim.yaml` | `PersistentVolumeClaim` | Created only when `persistence.enabled=true` and no `existingClaim`. Uses parameterized access mode, storage class, size, annotations (`1-21`). Default annotation keeps PVC on uninstall (`values.yaml:81-99`). |
| `templates/secret.yaml` | `Secret` | Fails if `postgresql.enabled=true` without `postgresql.password` or `postgresql.existingSecret` (`1-4`). If inline password is used, renders `tarnished-postgresql` secret (`5-15`). Nuance: Deployment still injects inline password directly when `postgresql.password` is set (`deployment.yaml:124-127`), so the generated Secret is not the referenced source; prefer `existingSecret`. |
| `templates/service.yaml` | `Service` | Exposes the app with `service.type` and `service.port`, targeting named container port `http` (`1-15`). Container port itself is fixed at 5577 (`deployment.yaml:100-103`). |
| `templates/deployment.yaml` | `Deployment` | Main workload. Fails fast on invalid multi-replica/storage combinations (`1-13`). Sets replicas, strategy, labels/selectors, security contexts, migration init container, app container, env, probes, resources, volume, scheduling knobs (`14-186`). |
| `templates/ingress.yaml` | `Ingress` | Optional when `ingress.enabled=true`. Sets class, annotations, TLS secret, host/path rules to the Service (`1-35`). Deployment also sets `APP_URL` from ingress host/scheme when enabled (`deployment.yaml:138-140`). |
| `templates/cleanup-cronjob.yaml` | `CronJob` | Optional upload cleanup job. Requires persistence and rejects `ReadWriteOncePod` (`1-7`). Runs `python -m app.lib.cleanup_orphan_uploads --verbose` and adds `--delete` only in delete mode (`55-67`). Uses pod affinity for RWO volumes so job lands with app pod (`33-48`). |
| `templates/tests/test-connection.yaml` | Helm test `Pod` | `helm test` hook using BusyBox `wget` against `service:port/health`; deleted before recreation/on success (`1-23`). |
| `templates/NOTES.txt` | Helm notes | Prints port-forward or ingress URL plus first-time setup/status commands (`1-13`). |

## Parameterized values

Defaults are in `values.yaml`; schema descriptions/types are in `values.schema.json`.

- **Image/release naming**: `image.repository` default `ghcr.io/markoonakic/tarnished`, `image.tag` defaults to chart appVersion when empty, `image.pullPolicy`, `imagePullSecrets`, `nameOverride`, `fullnameOverride` (`values.yaml:6-20`; schema `12-44`).
- **Replicas/scaling**: `replicaCount` default `1`; SQLite must stay single replica, multi-replica requires PostgreSQL + shared uploads storage (`values.yaml:1-4`; `deployment.yaml:1-13`).
- **Service account/security**: `serviceAccount.*`, `podSecurityContext` non-root UID/GID/fsGroup 1000 + RuntimeDefault seccomp, `securityContext` drops all capabilities and disables privilege escalation (`values.yaml:22-52`).
- **Networking**: `service.type` default `ClusterIP`, `service.port` default `5577`; `ingress.enabled/className/annotations/host/paths/tls.*` (`values.yaml:54-79`).
- **Persistence**: `persistence.enabled` default true, `storageClass`, `size` default `1Gi`, `accessMode` default `ReadWriteOnce`, `existingClaim`, `sharedAccess`, PVC annotations including `helm.sh/resource-policy: keep` (`values.yaml:81-99`).
- **Database/secrets/env**: `postgresql.enabled/host/port/database/user/password/existingSecret/existingSecretPasswordKey`; `secretKey.existingSecret/existingSecretKey`; `env`, `envFrom`, `trustedHosts` (`values.yaml:101-138`). Backend DB priority is `DATABASE_URL`, then discrete PG env, then SQLite fallback (`backend/app/core/config.py:40-63`).
- **Resources/probes**: app `resources`, `initContainer.resources`, `startupProbe`, `readinessProbe`, `livenessProbe` all parameterized; probes default to `/health` with Host `localhost` (`values.yaml:140-220`).
- **Scheduling**: `nodeSelector`, `tolerations`, `affinity` (`values.yaml:222-229`).
- **Cleanup**: `cleanup.enabled/schedule/timeZone/mode/history limits/startingDeadlineSeconds/resources`; mode enum is `dry-run` or `delete` in schema (`values.yaml:231-259`; schema `289-331`).

## Install modes

1. **SQLite evaluation/default**
   - One replica, PostgreSQL disabled, chart-managed PVC for `/app/data`; SQLite file falls under `/app/data/app.db` because backend fallback is `./data/app.db` and container workdir is `/app` (`values.yaml:1-4`, `81-103`; `backend/app/core/config.py:25-26`, `62-63`).
   - Docs command: `helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished --namespace tarnished --create-namespace` then port-forward (`documentation/content/install/helm.md:21-32`).

2. **PostgreSQL single replica / production-style**
   - External PostgreSQL only; no PostgreSQL subchart. Recommended values use `postgresql.enabled=true`, host/port/db/user, existing Secret for DB password, and existing Secret for stable `SECRET_KEY` (`documentation/content/install/helm.md:34-65`).
   - Docs explicitly recommend Secret-backed PG password over inline values (`deploy/helm/tarnished/README.md:77-88`; env docs `158-166`).

3. **PostgreSQL multi-replica**
   - Requires `replicaCount > 1`, `postgresql.enabled=true`, and shared uploads storage (`documentation/content/reference/helm-chart-reference.md:40-53`).
   - Valid combinations: chart-managed PVC with `persistence.accessMode=ReadWriteMany`, or `persistence.existingClaim` plus `persistence.sharedAccess=true` (`deployment.yaml:1-13`).

## Install / upgrade / rollback flow

- **Install default/evaluation**:
  ```bash
  helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
    --namespace tarnished --create-namespace
  kubectl port-forward -n tarnished svc/tarnished 5577:5577
  ```
- **Install production values**: create namespace and Kubernetes Secrets first, write `values-production.yaml`, then `helm install ... --values values-production.yaml` (`documentation/content/install/helm.md:38-84`).
- **Verify**: `helm status`, `kubectl get pods -w`, app/init logs (`documentation/content/install/helm.md:92-110`; troubleshooting `59-83`). `helm test -n tarnished tarnished` runs the BusyBox `/health` test pod (`templates/tests/test-connection.yaml:1-23`).
- **Upgrade**:
  ```bash
  helm upgrade tarnished oci://ghcr.io/markoonakic/charts/tarnished \
    --namespace tarnished --values values-production.yaml
  # add --version if pinning a chart version
  ```
  Documented upgrade advice: read release notes, back up first, know deployment mode (`documentation/content/how-to/upgrade-tarnished.md:8-16`, `46-60`). The chart runs database migrations via init container before app start (`deployment.yaml:47-93`; upgrade doc `58-62`).
- **Rollback**: use Helm history/revisions, e.g. `helm history -n tarnished tarnished` then `helm rollback -n tarnished tarnished <REVISION>`. Important interview caveat: Helm rollback reverts Kubernetes manifests/image/chart values, but it does **not** automatically undo database migrations or PVC data. Docs say bad upgrades should restore from backups (`documentation/content/how-to/upgrade-tarnished.md:78-80`); Helm backups must include PVC `/app/data` plus PostgreSQL if enabled (`documentation/content/how-to/backup-and-restore-tarnished.md:63-70`, `103-109`).

## Validation currently in repo

- Local chart validation is in CI/release: `helm lint deploy/helm/tarnished` and `helm template` for default, cleanup, PostgreSQL, multi-replica RWX, and multi-replica existing-claim cases (`.github/workflows/ci.yml:164-185`; release mirror `302-323`).
- Release publishing gates Helm on deployment checks and Docker success, then packages/pushes chart to GHCR OCI (`.github/workflows/release.yml:484-505`).
- Chart docs tests check Artifact Hub metadata, generated README sections, schema descriptions, and docs reference presence (`.github/release-tools/tests/test_helm_chart_docs.py:14-56`).

## Gotchas / risks worth mentioning in interviews

- **Default Helm + init container SECRET_KEY risk**: backend settings require `secret_key` (`backend/app/core/config.py:28`). The app entrypoint auto-generates one in `/app/data/.secret_key` when the app container starts (`entrypoint.sh:7-19`), but the Helm init container runs `alembic upgrade head` directly and only receives `SECRET_KEY` when `secretKey.existingSecret` is set (`deployment.yaml:47-83`). Alembic imports settings before migration (`backend/alembic/env.py:11-20`). So a production-grade install should provide stable `SECRET_KEY`; default docs claim auto-generation, but the init container path may need scrutiny.
- **PostgreSQL host is operationally required but not fail-fast validated**: chart validates password/secret when `postgresql.enabled=true` (`secret.yaml:1-4`) but does not validate non-empty `postgresql.host`. Backend only uses PG when host/user/password are all present (`backend/app/core/config.py:51-60`).
- **Inline PostgreSQL password is rendered in manifests**: when `postgresql.password` is used, env value is plain in the Deployment (`deployment.yaml:124-127`) despite a Secret object being rendered (`secret.yaml:5-15`). Use `postgresql.existingSecret` for real deployments.
- **`envFrom` does not feed the migration init container**: `env` is included in init/app (`deployment.yaml:84-86`, `146-148`), but `envFrom` only appears on app container (`149-151`). If DB/SECRET_KEY is only in `envFrom`, migrations may fail.
- **No bundled operational extras**: no ConfigMap, HPA, PDB, NetworkPolicy, Role/RoleBinding, or bundled PostgreSQL chart. Those would be cluster/operator additions.
- **Storage determines scaling**: PostgreSQL alone is insufficient; uploads need RWX/shared PVC for >1 replicas (`deployment.yaml:1-13`).
- **Uninstall/data**: chart-managed PVC has `helm.sh/resource-policy: keep` by default (`values.yaml:96-99`), reducing accidental data loss, but cluster-specific backup/restore is still required.

## Likely interviewer questions and crisp answers

1. **What does this chart deploy?**  
   A ServiceAccount, PVC, Service, Deployment, optional Ingress, optional cleanup CronJob, optional PG Secret, and a Helm test pod. It deploys a single Tarnished container that serves both API and static frontend.

2. **How do you configure production?**  
   Enable external PostgreSQL, set host/db/user/port, use existing Kubernetes Secrets for PG password and `SECRET_KEY`, keep persistence enabled, add ingress/TLS as needed.

3. **How does scaling work?**  
   Default SQLite is single-replica with `Recreate`. Multi-replica requires PostgreSQL and shared uploads storage (`ReadWriteMany` or acknowledged existing shared claim), then uses `RollingUpdate`.

4. **How are migrations handled?**  
   A `migrate` init container runs `alembic upgrade head` before the app container. The container entrypoint also runs migrations on normal startup, so migrations are effectively idempotent but duplicated.

5. **How would you upgrade and rollback?**  
   Upgrade with `helm upgrade ... --values values-production.yaml` and watch rollout/logs. Roll back with `helm rollback` to a previous revision, but restore DB/PVC backups if schema/data changed because Helm does not reverse migrations/data.

6. **How does ingress affect the app?**  
   Ingress creates host/path/TLS rules to the Service; when enabled the chart sets `APP_URL` to `http(s)://<ingress.host>`, which affects generated links/CORS/trusted host behavior.

7. **What health checks exist?**  
   Startup, readiness, and liveness probes all hit `/health` on named port `http`, plus a Helm test pod uses `wget service:port/health`.

8. **What would you improve?**  
   Validate required PG host when PG mode is enabled; ensure init container gets/generates `SECRET_KEY`; make inline PG Secret actually referenced or remove it; optionally add PDB/NetworkPolicy/HPA examples and stronger CI validation against Kubernetes schemas.
