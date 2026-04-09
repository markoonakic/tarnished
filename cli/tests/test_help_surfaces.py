import re

from tarnished_cli.main import app


def _normalize_help(text: str) -> str:
    text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def test_root_help_includes_examples_and_subcommand_hint(runner):
    result = runner.invoke(app, ["--help"])
    output = _normalize_help(result.output)

    assert result.exit_code == 0
    assert "Examples:" in output
    assert "tarnished auth status --json" in output
    assert "tarnished applications list --json" in output
    assert "tarnished <command> --help" in output


def test_auth_help_includes_preflight_examples(runner):
    result = runner.invoke(app, ["auth", "--help"])
    output = _normalize_help(result.output)

    assert result.exit_code == 0
    assert "Examples:" in output
    assert "tarnished auth status" in output
    assert "tarnished auth api-key set --value" in output


def test_applications_help_includes_json_and_body_file_examples(runner):
    result = runner.invoke(app, ["applications", "--help"])
    output = _normalize_help(result.output)

    assert result.exit_code == 0
    assert "Examples:" in output
    assert "tarnished applications list --json" in output
    assert "tarnished applications create --body-file" in output


def test_job_leads_help_includes_create_and_convert_examples(runner):
    result = runner.invoke(app, ["job-leads", "--help"])
    output = _normalize_help(result.output)

    assert result.exit_code == 0
    assert "Examples:" in output
    assert "tarnished job-leads create --body-file" in output
    assert "tarnished job-leads convert" in output


def test_analytics_help_includes_period_example(runner):
    result = runner.invoke(app, ["analytics", "--help"])
    output = _normalize_help(result.output)

    assert result.exit_code == 0
    assert "Examples:" in output
    assert "tarnished analytics kpis --period 30d --json" in output


def test_admin_help_warns_and_includes_examples(runner):
    result = runner.invoke(app, ["admin", "--help"])
    output = _normalize_help(result.output)

    assert result.exit_code == 0
    assert "Examples:" in output
    assert "Use only when you need privileged access." in output
    assert "tarnished admin users list --json" in output
