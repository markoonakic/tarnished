import pytest
from _helm_render import find_kind, render_chart, run_helm


@pytest.mark.parametrize(
    ("set_args", "period", "timeout", "failures"),
    [
        ((), 5, 3, 12),
        (
            (
                "startupProbe.periodSeconds=7",
                "startupProbe.timeoutSeconds=4",
                "startupProbe.failureThreshold=19",
            ),
            7,
            4,
            19,
        ),
    ],
    ids=["defaults", "configured-budget"],
)
def test_startup_probe_targets_health_and_honours_budget(
    set_args, period, timeout, failures
):
    deployment = find_kind(render_chart(*set_args), "Deployment")[0]
    container = next(
        container
        for container in deployment["spec"]["template"]["spec"]["containers"]
        if container["name"] == "tarnished"
    )
    probe = container["startupProbe"]

    assert probe["httpGet"] == {
        "path": "/health",
        "port": "http",
        "httpHeaders": [{"name": "Host", "value": "localhost"}],
    }
    assert probe["periodSeconds"] == period
    assert probe["timeoutSeconds"] == timeout
    assert probe["failureThreshold"] == failures


def test_service_account_token_automount_is_disabled_by_default():
    docs = render_chart()

    deployment = find_kind(docs, "Deployment")[0]
    service_account = find_kind(docs, "ServiceAccount")[0]

    assert (
        deployment["spec"]["template"]["spec"]["automountServiceAccountToken"] is False
    )
    assert service_account["automountServiceAccountToken"] is False


def test_replicas_above_one_are_refused_for_both_databases():
    """E01 supports exactly one replica; bounded intake cannot share a database.

    The earlier per-condition messages were superseded by this explicit guard,
    which refuses HA up front instead of allowing a partially shared setup.
    """
    for database_args in (
        [],
        ["postgresql.enabled=true", "postgresql.password=secret"],
    ):
        result = run_helm("replicaCount=2", *database_args)

        assert result.returncode != 0
        assert (
            "Tarnished requires replicaCount=1 for SQLite and PostgreSQL; HA is unsupported"
            in result.stderr
        )


def test_replicas_above_one_is_refused_before_storage_choices():
    """Storage-sharing options cannot make an unsupported HA topology valid."""
    result = run_helm(
        "replicaCount=2",
        "postgresql.enabled=true",
        "postgresql.password=secret",
        "persistence.accessMode=ReadWriteMany",
    )

    assert result.returncode != 0
    assert (
        "Tarnished requires replicaCount=1 for SQLite and PostgreSQL; HA is unsupported"
        in result.stderr
    )


def test_replicas_above_one_is_refused_with_existing_shared_claim():
    result = run_helm(
        "replicaCount=2",
        "postgresql.enabled=true",
        "postgresql.password=secret",
        "persistence.existingClaim=tarnished-uploads",
        "persistence.sharedAccess=true",
    )

    assert result.returncode != 0
    assert (
        "Tarnished requires replicaCount=1 for SQLite and PostgreSQL; HA is unsupported"
        in result.stderr
    )


def test_single_replica_renders_with_existing_claim():
    """The supported single-replica baseline still honours an existing claim."""
    docs = render_chart(
        "postgresql.enabled=true",
        "postgresql.password=secret",
        "persistence.existingClaim=tarnished-uploads",
    )

    deployment = find_kind(docs, "Deployment")[0]
    volumes = deployment["spec"]["template"]["spec"]["volumes"]

    assert deployment["spec"]["replicas"] == 1
    assert volumes[0]["persistentVolumeClaim"]["claimName"] == "tarnished-uploads"


def test_migration_init_uses_the_shared_entrypoint():
    """Alembic must run through entrypoint.sh so the persisted signing secret loads.

    Running `alembic upgrade head` directly failed on a fresh install with
    "secret_key Field required" because it never generated or read the secret.
    """
    docs = render_chart()
    deployment = find_kind(docs, "Deployment")[0]
    init = deployment["spec"]["template"]["spec"]["initContainers"]
    migrate = next(container for container in init if container["name"] == "migrate")

    assert migrate["command"] == ["./entrypoint.sh", "migrate"]
