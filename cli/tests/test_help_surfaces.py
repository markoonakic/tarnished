from tarnished_cli.main import app


def test_root_help_includes_examples_and_subcommand_hint(runner):
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "Examples:" in result.output
    assert "tarnished auth status --json" in result.output
    assert "tarnished applications list --json" in result.output
    assert "tarnished <command> --help" in result.output


def test_auth_help_includes_preflight_examples(runner):
    result = runner.invoke(app, ["auth", "--help"])

    assert result.exit_code == 0
    assert "Examples:" in result.output
    assert "tarnished auth status" in result.output
    assert "tarnished auth login --email" in result.output


def test_applications_help_includes_json_and_body_file_examples(runner):
    result = runner.invoke(app, ["applications", "--help"])

    assert result.exit_code == 0
    assert "Examples:" in result.output
    assert "tarnished applications list --json" in result.output
    assert "tarnished applications create --body-file" in result.output


def test_job_leads_help_includes_create_and_convert_examples(runner):
    result = runner.invoke(app, ["job-leads", "--help"])

    assert result.exit_code == 0
    assert "Examples:" in result.output
    assert "tarnished job-leads create --body-file" in result.output
    assert "tarnished job-leads convert" in result.output


def test_analytics_help_includes_period_example(runner):
    result = runner.invoke(app, ["analytics", "--help"])

    assert result.exit_code == 0
    assert "Examples:" in result.output
    assert "tarnished analytics kpis --period 30d --json" in result.output


def test_admin_help_warns_and_includes_examples(runner):
    result = runner.invoke(app, ["admin", "--help"])

    assert result.exit_code == 0
    assert "Examples:" in result.output
    assert "Use only when you need privileged access." in result.output
    assert "tarnished admin users list --json" in result.output
