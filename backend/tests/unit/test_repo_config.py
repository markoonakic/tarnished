from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_extension_ci_uses_merge_base_diff():
    source = (REPO_ROOT / ".github/workflows/ci.yml").read_text()

    assert "git merge-base" in source
    assert "git diff --name-only \"$BASE_SHA\" HEAD" in source


def test_chart_supports_startup_probe():
    values = (REPO_ROOT / "chart/values.yaml").read_text()
    deployment = (REPO_ROOT / "chart/templates/deployment.yaml").read_text()

    assert "startupProbe:" in values
    assert "startupProbe:" in deployment
