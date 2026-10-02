import json

import pytest

from tarnished_cli.input import load_model_body
from tarnished_cli.models.requests import (
    ApplicationCreate,
    ApplicationExtractRequest,
    ApplicationUpdate,
    StatusCreate,
    StatusUpdate,
)


@pytest.mark.parametrize(
    "model,base",
    [
        (
            ApplicationCreate,
            {"company": "Synthetic", "job_title": "Role", "status_id": "s"},
        ),
        (
            ApplicationExtractRequest,
            {"url": "https://synthetic.test", "status_id": "s"},
        ),
        (ApplicationUpdate, {}),
    ],
)
def test_evidence_body_is_not_dropped(tmp_path, model, base):
    path = tmp_path / "body.json"
    for evidence in [None, {}, {"occurred_on": "2026-01-01", "reference": "Optional"}]:
        body = dict(base, response_evidence=evidence)
        path.write_text(json.dumps(body))
        assert load_model_body(path, model) == body
    path.write_text(json.dumps(base))
    assert "response_evidence" not in load_model_body(path, model)


def test_meaning_and_revision_bodies_are_not_dropped(tmp_path):
    path = tmp_path / "body.json"
    for model, body in [
        (StatusCreate, {"name": "Synthetic", "meaning": "offer"}),
        (StatusUpdate, {"meaning": "rejected"}),
        (ApplicationUpdate, {"expected_revision": 3, "response_evidence": None}),
    ]:
        path.write_text(json.dumps(body))
        assert load_model_body(path, model) == body


def test_new_evidence_fields_cannot_be_silently_discarded(tmp_path):
    from pydantic import ValidationError

    from tarnished_cli.models.requests import HistoryCorrection, InsightsRequest

    path = tmp_path / "body.json"
    for model, body in [
        (ApplicationUpdate, {"response_evidenc": {}}),
        (
            HistoryCorrection,
            {"expected_revision": 3, "to_meaning": "offer", "unexpected": True},
        ),
        (InsightsRequest, {"period": "all", "asof": "2026-01-07T09:00:00Z"}),
    ]:
        with pytest.raises(ValidationError):
            model.model_validate(body)
    for body in [
        {"expected_revision": 3, "to_meaning": "offer"},
        {"expected_revision": 3, "changed_at": "2026-01-03T09:00:00Z"},
    ]:
        path.write_text(json.dumps(body))
        assert load_model_body(path, HistoryCorrection) == body


def test_documented_evidence_body_files_execute_through_models():
    from pathlib import Path

    from tarnished_cli.models.requests import (
        CurrentMeaningCorrection,
        HistoryCorrection,
        InsightsRequest,
    )

    examples = Path(__file__).resolve().parents[1] / "examples/evidence"
    for name, model in [
        ("response-record", ApplicationUpdate),
        ("response-clear", ApplicationUpdate),
        ("history-correction", HistoryCorrection),
        ("current-meaning", CurrentMeaningCorrection),
        ("insights", InsightsRequest),
    ]:
        path = examples / f"{name}.json"
        assert load_model_body(path, model) == json.loads(path.read_text())
