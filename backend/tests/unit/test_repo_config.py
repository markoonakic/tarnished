from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_extension_ci_uses_merge_base_diff():
    source = (REPO_ROOT / ".github/workflows/ci.yml").read_text()

    assert "git merge-base" in source
    assert 'git diff --name-only "$BASE_SHA" HEAD' in source


def test_ci_runs_frontend_and_extension_vitest_suites():
    source = (REPO_ROOT / ".github/workflows/ci.yml").read_text()

    assert "working-directory: frontend" in source
    assert "run: yarn test:run" in source
    assert "working-directory: extension" in source
    assert source.count("run: yarn test:run") >= 2


def test_chart_supports_startup_probe():
    values = (REPO_ROOT / "deploy/helm/tarnished/values.yaml").read_text()
    deployment = (
        REPO_ROOT / "deploy/helm/tarnished/templates/deployment.yaml"
    ).read_text()

    assert "startupProbe:" in values
    assert "startupProbe:" in deployment
