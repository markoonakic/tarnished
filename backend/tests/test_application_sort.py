from datetime import UTC, date, datetime

import pytest
from tests.test_core_mutation_integrity import workspace as workspace

from app.models import Application


@pytest.mark.parametrize(
    "sort,expected",
    [
        ("applied_desc", ["zeta", "Beta", "Acme"]),
        ("applied_asc", ["Acme", "Beta", "zeta"]),
        ("company", ["Acme", "Beta", "zeta"]),
        ("status", ["Acme", "zeta", "Beta"]),
        ("updated", ["Beta", "zeta", "Acme"]),
    ],
)
async def test_sort_before_pagination_and_preserve_owner_filters(
    client, db, workspace, sort, expected
):
    owner, other, statuses, _, app_id = workspace
    acme = await db.get(Application, app_id)
    acme.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    for company, day, status, updated in [
        ("Beta", 2, statuses[1], 3),
        ("zeta", 3, statuses[0], 2),
    ]:
        db.add(
            Application(
                user_id=owner.id,
                company=company,
                job_title="Engineer",
                status_id=status.id,
                applied_at=date(2026, 1, day),
                updated_at=datetime(2026, 1, updated, tzinfo=UTC),
                created_at=datetime(2026, 1, 1, tzinfo=UTC),
            )
        )
    db.add(
        Application(
            user_id=other.id,
            company="Foreign",
            job_title="Engineer",
            status_id=statuses[2].id,
            applied_at=date(2026, 1, 4),
        )
    )
    await db.commit()
    items = []
    for page in [1, 2, 3]:
        response = await client.get(
            "/api/applications", params={"sort": sort, "per_page": 1, "page": page}
        )
        assert response.status_code == 200
        assert response.json()["total"] == 3
        items += [a["company"] for a in response.json()["items"]]
    assert items == expected
    response = await client.get(
        "/api/applications",
        params={"sort": sort, "search": "Beta", "status_id": statuses[1].id},
    )
    assert [a["company"] for a in response.json()["items"]] == ["Beta"]
    assert (
        await client.get("/api/applications?sort=company;DROP TABLE applications")
    ).status_code == 422
