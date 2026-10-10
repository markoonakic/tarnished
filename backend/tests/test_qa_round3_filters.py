"""Filter bounds and saved report identity regression checks."""

import json

import pytest
from tests.test_core_mutation_integrity import workspace as workspace

from app.services.interview_evidence import pipeline_evidence_sources


@pytest.mark.parametrize("path", ["applications", "applications/board", "job-leads"])
async def test_tag_filters_reject_oversized_values_and_unbounded_lists(
    client, workspace, path
):
    for tags in [["w" * 101], ["ok"] * 11]:
        assert (
            await client.get("/api/" + path, params=[("tags", tag) for tag in tags])
        ).status_code == 422
    assert (
        await client.get("/api/" + path, params={"tags": "w" * 100})
    ).status_code == 200


async def test_pipeline_round_evidence_keeps_builtin_identity():
    sources, _ = await pipeline_evidence_sources(
        {
            "metrics": {
                "rounds": [
                    {
                        "application_id": "app",
                        "round_type": "Technical",
                        "round_builtin_key": "technical",
                    },
                    {
                        "application_id": "custom",
                        "round_type": "Technical",
                        "round_builtin_key": None,
                    },
                ]
            },
            "profile": {},
        }
    )
    records = json.loads(
        next(
            source["text"] for source in sources if source["id"] == "pipeline:rounds:0"
        )
    )
    assert records["rounds"][0]["round_builtin_key"] == "technical"
    assert records["rounds"][1]["round_builtin_key"] is None
