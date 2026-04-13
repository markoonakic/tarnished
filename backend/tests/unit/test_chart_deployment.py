import subprocess
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CHART_DIR = PROJECT_ROOT / "chart"


def _render_chart(*set_args: str) -> list[dict]:
    cmd = ["helm", "template", "tarnished", str(CHART_DIR)]
    for arg in set_args:
        cmd.extend(["--set", arg])

    rendered = subprocess.run(
        cmd,
        check=True,
        capture_output=True,
        text=True,
    )
    return [doc for doc in yaml.safe_load_all(rendered.stdout) if doc]


def _render_chart_failure(*set_args: str) -> subprocess.CompletedProcess[str]:
    cmd = ["helm", "template", "tarnished", str(CHART_DIR)]
    for arg in set_args:
        cmd.extend(["--set", arg])

    return subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
    )


def _find_kind(docs: list[dict], kind: str) -> list[dict]:
    return [doc for doc in docs if doc.get("kind") == kind]


def test_service_account_token_automount_is_disabled_by_default():
    docs = _render_chart()

    deployment = _find_kind(docs, "Deployment")[0]
    service_account = _find_kind(docs, "ServiceAccount")[0]

    assert deployment["spec"]["template"]["spec"]["automountServiceAccountToken"] is False
    assert service_account["automountServiceAccountToken"] is False


def test_multiple_replicas_require_postgresql():
    result = _render_chart_failure("replicaCount=2")

    assert result.returncode != 0
    assert "Multiple replicas require postgresql.enabled=true" in result.stderr


def test_multiple_replicas_require_shared_upload_storage_for_chart_managed_pvc():
    result = _render_chart_failure(
        "replicaCount=2",
        "postgresql.enabled=true",
        "postgresql.password=secret",
    )

    assert result.returncode != 0
    assert "Multiple replicas require shared upload storage" in result.stderr


def test_multiple_replicas_require_shared_access_ack_for_existing_claim():
    result = _render_chart_failure(
        "replicaCount=2",
        "postgresql.enabled=true",
        "postgresql.password=secret",
        "persistence.existingClaim=tarnished-uploads",
    )

    assert result.returncode != 0
    assert "persistence.sharedAccess=true" in result.stderr


def test_multiple_replicas_render_with_read_write_many_chart_managed_storage():
    docs = _render_chart(
        "replicaCount=2",
        "postgresql.enabled=true",
        "postgresql.password=secret",
        "persistence.accessMode=ReadWriteMany",
    )

    deployment = _find_kind(docs, "Deployment")[0]
    pvc = _find_kind(docs, "PersistentVolumeClaim")[0]

    assert deployment["spec"]["replicas"] == 2
    assert pvc["spec"]["accessModes"] == ["ReadWriteMany"]


def test_multiple_replicas_render_with_existing_shared_claim():
    docs = _render_chart(
        "replicaCount=2",
        "postgresql.enabled=true",
        "postgresql.password=secret",
        "persistence.existingClaim=tarnished-uploads",
        "persistence.sharedAccess=true",
    )

    deployment = _find_kind(docs, "Deployment")[0]
    volumes = deployment["spec"]["template"]["spec"]["volumes"]

    assert deployment["spec"]["replicas"] == 2
    assert volumes[0]["persistentVolumeClaim"]["claimName"] == "tarnished-uploads"
