"""Known deterministic metrics, including repeated visits and saved requirements."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import select

from app.core.seed import seed_defaults
from app.models import Application, ApplicationStatus, ApplicationStatusHistory, User
from app.services.analytics_queries import get_calculation_data
from app.services.requirement_insights import requirement_insights


def test_requirement_counts_use_distinct_applications_and_known_saved_rows():
    applications = [
        SimpleNamespace(
            id="one",
            confirmed_requirements=[
                {"id": "a", "text": " Python "},
                {"id": "b", "text": "python"},
                {"id": "c", "text": "SQL"},
            ],
        ),
        SimpleNamespace(
            id="two", confirmed_requirements=[{"id": "d", "text": "Python"}]
        ),
        SimpleNamespace(id="unknown", confirmed_requirements=[]),
    ]
    data = requirement_insights(
        applications,
        {
            "one": [
                {"requirement_id": "a", "state": "no_evidence"},
                {"requirement_id": "b", "state": "no_evidence"},
                {"requirement_id": "c", "state": "unknown"},
            ]
        },
    )
    assert data["repeated_requirements"] == {
        "items": [{"label": "Python", "count": 2}, {"label": "SQL", "count": 1}],
        "denominator": 2,
    }
    assert data["missing_evidence"] == {
        "items": [{"label": "Python", "count": 1}],
        "denominator": 1,
    }
    assert requirement_insights(applications)["missing_evidence"] == {
        "items": [],
        "denominator": 0,
    }


async def test_dated_response_reached_outcomes_and_completed_visit_mean(db):
    await seed_defaults(db)
    user = User(email="metrics@example.com", password_hash="unused")
    other = User(email="other-metrics@example.com", password_hash="unused")
    db.add_all([user, other])
    await db.flush()
    statuses = {row.meaning: row for row in await db.scalars(select(ApplicationStatus))}
    now = datetime.now(UTC)
    entered = now - timedelta(days=10)
    app = Application(
        user_id=user.id,
        company="North",
        job_title=" Engineer ",
        status_id=statuses["rejected"].id,
        status_meaning="rejected",
        status_meaning_provenance="recorded",
        applied_at=entered.date(),
        response_state="recorded",
        response_occurred_on=(entered + timedelta(days=4)).date(),
        response_recorded_at=now - timedelta(days=1),
        skills=["Python", " python "],
        source="Board",
        archived_at=now,
    )
    missing = Application(
        user_id=user.id,
        company="South",
        job_title="engineer",
        status_id=statuses["applied"].id,
        status_meaning="applied",
        status_meaning_provenance="recorded",
        applied_at=entered.date(),
        response_state="not_recorded",
        skills=["Python"],
        source="Board",
    )
    preparing = Application(
        user_id=user.id,
        company="",
        job_title="",
        status_id=statuses["preparing"].id,
        status_meaning="preparing",
        status_meaning_provenance="recorded",
    )
    foreign = Application(
        user_id=other.id,
        company="Foreign",
        job_title="Hidden",
        status_id=statuses["applied"].id,
        applied_at=entered.date(),
    )
    db.add_all([app, missing, preparing, foreign])
    await db.flush()
    preparing.applied_at = None
    previous = None
    for index, meaning in enumerate(
        ("applied", "screening", "rejected", "applied", "rejected")
    ):
        db.add(
            ApplicationStatusHistory(
                application_id=app.id,
                from_status_id=statuses[previous].id if previous else None,
                to_status_id=statuses[meaning].id,
                from_meaning=previous,
                to_meaning=meaning,
                from_meaning_provenance="recorded",
                to_meaning_provenance="recorded",
                time_provenance="recorded",
                changed_at=entered + timedelta(days=index),
            )
        )
        previous = meaning
    await db.commit()
    data = await get_calculation_data(db, user.id, "all", as_of=now)
    assert data["total_applications"] == 2
    assert data["first_response"] == {"mean_days": 4.0, "n": 1, "unknown_count": 1}
    assert data["rejected_count"] == 1
    assert data["top_positions"] == [{"label": "Engineer", "count": 2}]
    assert data["top_technologies"] == [{"label": "Python", "count": 2}]
    assert data["outcomes_by_source"] == [
        {
            "source": "Board",
            "sent": 2,
            "interview": 0,
            "offer": 0,
            "rejected": 1,
            "withdrawn": 0,
        }
    ]
    current = {row["meaning"]: row["count"] for row in data["current_phases"]}
    assert current == {"applied": 1, "preparing": 1}
    applied = next(row for row in data["stage_averages"] if row["meaning"] == "applied")
    assert applied["n"] == 2 and applied["mean_days"] == 1.0
