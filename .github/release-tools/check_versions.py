"""Check that release components and the changelog use one version."""

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def component_versions(root: Path) -> dict[str, str]:
    versions = {}
    for name in ("backend", "cli"):
        path = root / name / "pyproject.toml"
        versions[str(path.relative_to(root))] = tomllib.loads(path.read_text())[
            "project"
        ]["version"]
    for name in ("frontend", "extension", "documentation"):
        path = root / name / "package.json"
        versions[str(path.relative_to(root))] = json.loads(path.read_text())["version"]
    manifest = root / "extension/src/manifest.json"
    versions[str(manifest.relative_to(root))] = json.loads(manifest.read_text())[
        "version"
    ]
    chart = (root / "deploy/helm/tarnished/Chart.yaml").read_text()
    for field in ("version", "appVersion"):
        match = re.search(rf'^{field}:\s*"?([^"\s]+)"?$', chart, re.MULTILINE)
        if match is None:
            raise ValueError(f"Missing chart {field}")
        versions[f"Chart.yaml:{field}"] = match[1]
    return versions


def check_versions(root: Path, expected: str) -> None:
    mismatches = [
        f"{name}: {version} != {expected}"
        for name, version in component_versions(root).items()
        if version != expected
    ]
    changelog = (root / "CHANGELOG.md").read_text()
    if not re.search(
        rf"^## \[{re.escape(expected)}\](?:\s|$)", changelog, re.MULTILINE
    ):
        mismatches.append(f"Missing changelog entry for {expected}")
    if mismatches:
        raise ValueError("\n".join(mismatches))


if __name__ == "__main__":
    try:
        check_versions(ROOT, sys.argv[1])
    except (IndexError, ValueError) as error:
        sys.exit(str(error))
