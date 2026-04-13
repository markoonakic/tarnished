import subprocess
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CHART_DIR = PROJECT_ROOT / "deploy" / "helm" / "tarnished"


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


def test_cleanup_cronjob_is_disabled_by_default():
    docs = _render_chart()

    assert _find_kind(docs, "CronJob") == []


def test_cleanup_cronjob_renders_with_safe_defaults():
    docs = _render_chart("cleanup.enabled=true")
    cronjobs = _find_kind(docs, "CronJob")

    assert len(cronjobs) == 1
    cronjob = cronjobs[0]
    spec = cronjob["spec"]
    job_spec = spec["jobTemplate"]["spec"]["template"]["spec"]
    container = job_spec["containers"][0]

    assert spec["schedule"] == "0 3 * * *"
    assert spec["timeZone"] == "Etc/UTC"
    assert spec["concurrencyPolicy"] == "Forbid"
    assert spec["successfulJobsHistoryLimit"] == 1
    assert spec["failedJobsHistoryLimit"] == 1
    assert spec["startingDeadlineSeconds"] == 600
    assert job_spec["restartPolicy"] == "OnFailure"
    assert container["command"] == ["/bin/sh", "-lc"]
    assert "python -m app.lib.cleanup_orphan_uploads --verbose" in container["args"][0]
    assert job_spec["automountServiceAccountToken"] is False
    affinity = job_spec["affinity"]["podAffinity"]["requiredDuringSchedulingIgnoredDuringExecution"][0]
    assert affinity["topologyKey"] == "kubernetes.io/hostname"


def test_cleanup_cronjob_delete_mode_adds_delete_flag():
    docs = _render_chart("cleanup.enabled=true", "cleanup.mode=delete")
    cronjob = _find_kind(docs, "CronJob")[0]
    container = cronjob["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][
        0
    ]

    assert "--delete" in container["args"][0]


def test_cleanup_cronjob_requires_persistent_storage():
    result = _render_chart_failure(
        "cleanup.enabled=true",
        "persistence.enabled=false",
    )

    assert result.returncode != 0
    assert "cleanup requires persistence.enabled=true" in result.stderr


def test_cleanup_cronjob_rejects_read_write_once_pod_access_mode():
    result = _render_chart_failure(
        "cleanup.enabled=true",
        "persistence.accessMode=ReadWriteOncePod",
    )

    assert result.returncode != 0
    assert "cleanup does not support persistence.accessMode=ReadWriteOncePod" in result.stderr
