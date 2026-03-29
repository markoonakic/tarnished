import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_FIXTURE = (
    REPO_ROOT / "cli" / "skills" / "tarnished-cli" / "evals" / "trigger-eval.json"
)


def test_trigger_eval_fixture_exists():
    assert EVAL_FIXTURE.exists()


def test_trigger_eval_fixture_has_balanced_realistic_cases():
    payload = json.loads(EVAL_FIXTURE.read_text())

    assert isinstance(payload, list)
    assert len(payload) == 20

    positives = [item for item in payload if item["should_trigger"]]
    negatives = [item for item in payload if not item["should_trigger"]]

    assert len(positives) >= 8
    assert len(negatives) >= 8

    for item in payload:
        assert set(item) == {"query", "should_trigger"}
        assert isinstance(item["query"], str)
        assert item["query"].strip()
        assert len(item["query"]) > 20
        assert isinstance(item["should_trigger"], bool)
