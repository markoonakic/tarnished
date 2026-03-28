from app.cli.main import app


def test_root_help_lists_command_groups(runner):
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "auth" in result.output
    assert "applications" in result.output
    assert "job-leads" in result.output
    assert "profile" in result.output
    assert "statuses" in result.output
    assert "round-types" in result.output
    assert "rounds" in result.output
    assert "dashboard" in result.output
    assert "analytics" in result.output


def test_version_option(runner):
    result = runner.invoke(app, ["--version"])

    assert result.exit_code == 0
    assert "0.1.1" in result.output
