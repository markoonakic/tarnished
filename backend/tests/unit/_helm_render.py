import subprocess
from pathlib import Path

import yaml

CHART_DIR = Path(__file__).resolve().parents[3] / "deploy" / "helm" / "tarnished"


def run_helm(*set_args: str) -> subprocess.CompletedProcess[str]:
    cmd = ["helm", "template", "tarnished", str(CHART_DIR)]
    for arg in set_args:
        cmd.extend(["--set", arg])

    return subprocess.run(cmd, check=False, capture_output=True, text=True)


def render_chart(*set_args: str) -> list[dict]:
    rendered = run_helm(*set_args)
    rendered.check_returncode()
    return [doc for doc in yaml.safe_load_all(rendered.stdout) if doc]


def find_kind(docs: list[dict], kind: str) -> list[dict]:
    return [doc for doc in docs if doc.get("kind") == kind]
