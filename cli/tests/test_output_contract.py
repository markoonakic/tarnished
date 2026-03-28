from tarnished_cli.main import app


def test_status_writes_json_to_stdout_only(runner, cli_config_dir):
    result = runner.invoke(app, ["auth", "status"])

    assert result.exit_code == 0
    assert result.stdout.strip().startswith("{")
    assert result.stderr == ""


def test_delete_without_yes_keeps_primary_stdout_clean(runner, cli_config_dir):
    result = runner.invoke(app, ["applications", "delete", "app-123"])

    assert result.exit_code != 0
    assert result.stdout == ""
    assert result.stderr != ""
