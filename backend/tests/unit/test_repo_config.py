from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]


def _ci_jobs():
    source = (REPO_ROOT / ".github/workflows/ci.yml").read_text()
    return yaml.safe_load(source)["jobs"]


def test_ci_runs_backend_on_both_databases():
    jobs = _ci_jobs()

    assert jobs["backend"]["strategy"]["matrix"]["database"] == [
        "sqlite",
        "postgresql",
    ]
    assert any("pytest -q" in step.get("run", "") for step in jobs["backend"]["steps"])


def test_ci_runs_all_javascript_components():
    job = _ci_jobs()["javascript"]

    assert job["strategy"]["matrix"]["project"] == [
        "frontend",
        "extension",
        "documentation",
    ]
    for project in ["frontend", "extension"]:
        commands = "\n".join(
            step.get("run", "")
            for step in job["steps"]
            if step.get("working-directory") == project
        )
        assert "yarn test:run" in commands
        assert "yarn build" in commands
