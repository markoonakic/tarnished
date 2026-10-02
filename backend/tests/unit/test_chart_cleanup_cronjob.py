from _helm_render import find_kind, render_chart, run_helm


def test_cleanup_cronjob_is_disabled_by_default():
    docs = render_chart()

    assert find_kind(docs, "CronJob") == []


def test_cleanup_cronjob_renders_with_safe_defaults():
    docs = render_chart("cleanup.enabled=true")
    cronjobs = find_kind(docs, "CronJob")

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
    assert container["command"] == ["/bin/sh", "-c"]
    assert "python -m app.lib.cleanup_orphan_uploads --verbose" in container["args"][0]
    assert job_spec["automountServiceAccountToken"] is False
    affinity = job_spec["affinity"]["podAffinity"][
        "requiredDuringSchedulingIgnoredDuringExecution"
    ][0]
    assert affinity["topologyKey"] == "kubernetes.io/hostname"


def test_cleanup_cronjob_refuses_scheduled_delete_mode():
    result = run_helm("cleanup.enabled=true", "cleanup.mode=delete")

    assert result.returncode != 0
    assert "cleanup.mode=delete cannot be scheduled" in result.stderr


def test_cleanup_cronjob_delete_mode_needs_offline_maintenance():
    docs = render_chart("cleanup.enabled=true")
    container = find_kind(docs, "CronJob")[0]["spec"]["jobTemplate"]["spec"][
        "template"
    ]["spec"]["containers"][0]

    assert "--delete" not in container["args"][0]


def test_cleanup_cronjob_requires_persistent_storage():
    result = run_helm(
        "cleanup.enabled=true",
        "persistence.enabled=false",
    )

    assert result.returncode != 0
    assert "cleanup requires persistence.enabled=true" in result.stderr


def test_cleanup_cronjob_rejects_read_write_once_pod_access_mode():
    result = run_helm(
        "cleanup.enabled=true",
        "persistence.accessMode=ReadWriteOncePod",
    )

    assert result.returncode != 0
    assert (
        "cleanup does not support persistence.accessMode=ReadWriteOncePod"
        in result.stderr
    )
