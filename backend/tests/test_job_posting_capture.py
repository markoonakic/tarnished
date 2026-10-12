"""Posting content selection with bounded page assets and structured metadata."""

import json
from unittest.mock import AsyncMock

import pytest
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.models import Application, JobLead
from app.services.lead_capture import capture_complete_source, capture_source


@pytest.mark.parametrize("tag", ["main", "article"])
def test_fetch_keeps_posting_after_large_script_and_does_not_prefer_jsonld_teaser(tag):
    posting = "<h1>Engineer</h1><table><tr><td>Python and SQL required.</td></tr></table><p>Final posting condition: no initial on-call duty.</p>"
    ld = {
        "@type": "JobPosting",
        "title": "Engineer",
        "hiringOrganization": {"name": "Example"},
        "description": "A short teaser.",
    }
    html = (
        "<html><head><script>"
        + "x" * 120000
        + '</script><script type="application/ld+json">'
        + json.dumps(ld)
        + "</script></head><body><nav>Unrelated navigation</nav><"
        + tag
        + ">"
        + posting
        + "</"
        + tag
        + "></body></html>"
    )
    result = capture_complete_source(html=html)
    assert not result["source_truncated"] and result["content_warning"] is None
    assert "Python and SQL required." in result["source_text"]
    assert "no initial on-call duty" in result["source_text"]
    assert "Example" in result["source_text"]
    assert "Unrelated navigation" not in result["source_text"]


def test_full_jsonld_description_is_fallback_and_main_content_limits_stay_honest():
    description = "<p>Python and SQL required. Final condition.</p>" * 50
    ld = {
        "@graph": [
            {"@type": ["JobPosting"], "title": "Engineer", "description": description}
        ]
    }
    html = (
        '<script type="application/ld+json">'
        + json.dumps(ld)
        + "</script><main><p>Short summary.</p></main>"
    )
    assert "Final condition" in capture_complete_source(html=html)["source_text"]
    large = "<main>" + "<p>Actual posting condition.</p>" * 6000 + "</main>"
    result = capture_source(html=large)
    assert result["source_truncated"] and len(result["source_text"]) <= 50000
    with pytest.raises(Exception):
        capture_complete_source(html=large)


@pytest.mark.parametrize("target", ["job-leads", "applications"])
async def test_fetch_remains_a_read_only_preview_after_removing_page_assets(
    client, db, workspace, monkeypatch, target
):
    _, headers, _, _, statuses = workspace
    html = (
        "<html><script>"
        + "x" * 120000
        + "</script><main><h1>Engineer</h1><p>Python and SQL required. Final posting condition.</p></main></html>"
    )
    fetch = AsyncMock(return_value=html)
    monkeypatch.setattr("app.api.source_capture.fetch_job_posting_html", fetch)
    if target == "job-leads":
        record = await post(
            client, "/job-leads", {"url": "https://jobs.example.test/public"}, headers
        )
        model, revision = JobLead, "revision"
    else:
        record = await post(
            client,
            "/applications",
            {
                "company": "Example",
                "job_title": "Engineer",
                "job_url": "https://jobs.example.test/public",
                "status_id": statuses["applied"],
            },
            headers,
        )
        model, revision = Application, "evidence_revision"
    row = await db.get(model, record["id"])
    before = (row.source_text, getattr(row, revision))
    response = await client.post(
        f"/api/{target}/{row.id}/fetch-source", headers=headers
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert "Final posting condition." in preview["text"]
    assert not preview["truncated"] and preview["warning"] is None
    await db.refresh(row)
    assert (row.source_text, getattr(row, revision)) == before
    fetch.assert_awaited_once_with("https://jobs.example.test/public")
