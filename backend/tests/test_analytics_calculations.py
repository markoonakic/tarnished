"""Hand-calculated analytics on migrated SQLite and PostgreSQL databases."""

from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.core.api_key_scopes import resolve_scopes_for_preset
from app.core.security import create_access_token, generate_api_token, hash_api_key
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    JobLead,
    Round,
    RoundType,
    User,
    UserAPIKey,
)
from app.schemas.insights import GraceInsights, SectionInsight
from app.services import user_time
from app.services.analytics_queries import (
    get_activity_tracking_data,
    get_pipeline_overview_data,
)
from app.services.insights import build_analytics_prompt_data


def instant(day, month=1, year=2026, hour=9):
    return datetime(year, month, day, hour, tzinfo=UTC)


@pytest.fixture
async def workspace(db, client, monkeypatch):
    monkeypatch.setattr(user_time, "_utc_now", lambda: instant(1, month=6))
    owner = User(email="metrics@synthetic.test", password_hash="unused", is_admin=True)
    other = User(email="foreign@synthetic.test", password_hash="unused")
    db.add_all([owner, other])
    await db.flush()
    statuses = {
        meaning: ApplicationStatus(
            name=meaning.title(), meaning=meaning, user_id=owner.id
        )
        for meaning in (
            "applied",
            "screening",
            "interviewing",
            "offer",
            "rejected",
            "accepted",
            "withdrawn",
            "no_reply",
            "unknown",
        )
    }
    db.add_all(statuses.values())
    await db.commit()
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": owner.id, "session_version": owner.session_version}
    )
    return owner, other, statuses


async def application(
    db, owner, statuses, path, *, applied=date(2026, 1, 1), response=False
):
    app = Application(
        user_id=owner.id,
        company="Synthetic",
        job_title="Role",
        status_id=statuses[path[-1][0]].id,
        applied_at=applied,
        status_meaning=path[-1][0],
        status_meaning_provenance="recorded",
        response_state="not_recorded",
    )
    if response:
        app.response_state = "recorded"
        app.response_recorded_at = instant(2)
        app.response_occurred_on = date(2026, 1, 2)
    db.add(app)
    await db.flush()
    history = []
    for index, (meaning, when) in enumerate(path):
        entry = ApplicationStatusHistory(
            application_id=app.id,
            changed_at=when.astimezone(UTC),
            from_status_id=statuses[path[index - 1][0]].id if index else None,
            to_status_id=statuses[meaning].id,
            from_meaning=path[index - 1][0] if index else None,
            to_meaning=meaning,
            from_meaning_provenance="recorded",
            to_meaning_provenance="recorded",
            time_provenance="recorded",
        )
        db.add(entry)
        history.append(entry)
    await db.commit()
    return app, history


async def calculate(db, owner, **kwargs):
    # Re-read relationships after router corrections in this shared test session.
    db.expire_all()
    return await get_pipeline_overview_data(
        db,
        owner,
        kwargs.pop("period", "all"),
        as_of=kwargs.pop("as_of", instant(7)),
        **kwargs,
    )


async def test_exact_ten_application_three_lead_fixture_and_current_distinction(
    db, client, workspace
):
    owner, other, statuses = workspace
    owner_id = owner.id
    paths = [
        [
            ("applied", instant(1)),
            ("interviewing", instant(3)),
            ("screening", instant(4)),
            ("interviewing", instant(5)),
        ],
        [
            ("applied", instant(1)),
            ("interviewing", instant(3)),
            ("rejected", instant(4)),
        ],
        [("offer", instant(2))],
        [("applied", instant(1)), ("screening", instant(3))],
    ] + [[("applied", instant(1))] for _ in range(6)]
    apps = [
        await application(db, owner, statuses, path, response=index < 4)
        for index, path in enumerate(paths)
    ]
    apps[3][0].response_occurred_on = None
    apps[4][1][0].note = "Automatic receipt only"
    statuses["rejected"].name = "Declined"
    db.add_all(
        [
            JobLead(
                user_id=owner.id,
                company="Saved",
                title="Lead",
                url=f"https://synthetic.test/{n}",
            )
            for n in range(3)
        ]
    )
    await application(db, other, statuses, [("offer", instant(1))], response=True)
    await db.commit()
    data = await calculate(db, owner_id)
    assert (
        data["total_applications"],
        data["responded"],
        data["interviews"],
        data["offers"],
    ) == (10, 4, 2, 1)
    assert (data["response_rate"], data["interview_rate"], data["offer_rate"]) == (
        40,
        20,
        10,
    )
    assert data["current_stage_breakdown"] == {
        "applied": 6,
        "screening": 1,
        "interviewing": 1,
        "offer": 1,
        "rejected": 1,
    }
    assert data["response_undated"] == 1 and data["active_applications"] == 9
    assert data["scope"]["denominator"] == 10
    params = {"period": "all", "as_of": instant(7).isoformat()}
    result = await client.get("/api/analytics/kpis", params=params)
    assert result.status_code == 200, result.text
    assert result.json()["response_rate"] == 40
    assert (
        result.json()["current_record_basis"]["basis"]
        == "live_current_records_not_historical_as_of"
    )
    sankey = (await client.get("/api/analytics/sankey", params=params)).json()
    assert len(sankey["links"]) == 6  # includes both repeated interview entries
    assert len(sankey["nodes"]) == 16
    assert [
        node["name"] for node in sankey["nodes"] if node["meaning"] == "rejected"
    ] == ["Declined"]
    assert sankey["scope"] == result.json()["scope"]


async def test_144_hours_repeats_current_age_and_closed_as_of(db, workspace):
    owner, _, statuses = workspace
    owner_id = owner.id
    app, history = await application(
        db,
        owner,
        statuses,
        [
            ("applied", instant(1)),
            ("screening", instant(3)),
            ("applied", instant(4)),
            ("interviewing", instant(6)),
            ("rejected", instant(7)),
        ],
    )
    before = await calculate(db, owner_id, as_of=instant(7) - timedelta(microseconds=1))
    assert before["current_stage_breakdown"] == {"rejected": 1}
    assert before["applications"][0]["as_of_meaning"] == "interviewing"
    assert before["applications"][0]["current_stage_age_hours"] == pytest.approx(24)
    data = await calculate(db, owner_id)
    assert [(v["meaning"], v["hours"], v["kind"]) for v in data["visits"]] == [
        ("applied", 48, "completed"),
        ("screening", 24, "completed"),
        ("applied", 48, "completed"),
        ("interviewing", 24, "completed"),
        ("rejected", None, "closed"),
    ]
    assert sum(v["hours"] or 0 for v in data["visits"]) == 144
    assert {t["meaning"]: t["hours"] for t in data["stage_totals"]} == {
        "applied": 96,
        "screening": 24,
        "interviewing": 24,
    }
    later = await calculate(db, owner_id, as_of=instant(10))
    assert later["stage_totals"] == data["stage_totals"]
    assert later["applications"][0]["current_stage_age_hours"] is None


async def test_missing_prefix_no_entry_and_later_known_intervals(db, workspace):
    owner, _, statuses = workspace
    owner_id = owner.id
    a, h = await application(db, owner, statuses, [("interviewing", instant(5))])
    b, entries = await application(db, owner, statuses, [("screening", instant(1))])
    await db.delete(entries[0])  # synthetic legacy missing history, not deletion API
    c, unknown = await application(
        db,
        owner,
        statuses,
        [
            ("applied", instant(1)),
            ("screening", instant(3)),
            ("interviewing", instant(5)),
        ],
    )
    unknown[0].time_provenance = "legacy_unknown"
    await db.commit()
    data = await calculate(db, owner_id)
    by_id = {r["application_id"]: r for r in data["applications"]}
    assert sorted(
        r["current_stage_age_hours"]
        for r in by_id.values()
        if r["current_stage_age_hours"] is not None
    ) == [48, 48]
    assert data["coverage"]["applications_with_missing_prefix"] == 3
    assert data["coverage"]["active_age_unavailable"] == 1
    assert data["coverage"]["applications_with_measured_residence"] == 2
    assert sorted(v["hours"] for v in data["visits"] if v["hours"] is not None) == [
        48,
        48,
        48,
    ]
    assert all(v["meaning"] != "applied" for v in data["visits"])


async def test_deleted_excursion_with_matching_survivors_breaks_residence_and_sankey(
    db, client, workspace
):
    owner, _, statuses = workspace
    owner_id = owner.id
    app, h = await application(
        db,
        owner,
        statuses,
        [
            ("applied", instant(1)),
            ("screening", instant(2)),
            ("applied", instant(3)),
            ("interviewing", instant(4)),
            ("applied", instant(5)),
            ("screening", instant(6)),
        ],
    )
    app_id, deleted = app.id, [h[1].id, h[2].id]
    for revision, event_id in enumerate(deleted):
        r = await client.delete(
            f"/api/applications/{app_id}/history/{event_id}",
            params={"expected_revision": revision},
        )
        assert r.status_code == 204, r.text
    data = await calculate(db, owner_id)
    assert data["applications"][0]["gap_ids"] == deleted
    assert data["visits"][0]["hours"] is None
    assert [v["hours"] for v in data["visits"][1:]] == [24, 24, 24]
    assert len(data["links"]) == 2
    assert data["coverage"]["applications_with_gaps"] == 1
    assert data["coverage"]["visits_unavailable"] == 1
    assert data["applications"][0]["evidence_revision"] == 2


async def test_legacy_fabricated_evidence_excluded_and_corrections_recalculate(
    db, client, workspace
):
    owner, _, statuses = workspace
    owner_id = owner.id
    app, h = await application(
        db, owner, statuses, [("interviewing", instant(2)), ("offer", instant(4))]
    )
    app_id, history_id = app.id, h[0].id
    for entry in h:
        entry.time_provenance = entry.to_meaning_provenance = (
            entry.from_meaning_provenance
        ) = "legacy_unknown"
    app.status_meaning_provenance = "legacy_unknown"
    app.response_state = "legacy_unknown"
    await db.commit()
    data = await calculate(db, owner_id)
    assert data["interviews"] == data["offers"] == 0
    assert data["visits"] == []
    assert data["response_unknown"] == data["unknown_applications"] == 1
    result = await client.patch(
        f"/api/applications/{app_id}/history/{history_id}",
        json={"expected_revision": 0, "to_meaning": "interviewing"},
    )
    assert result.status_code == 200, result.text
    assert (await calculate(db, owner_id))[
        "interviews"
    ] == 0  # untouched fabricated time not promoted
    result = await client.patch(
        f"/api/applications/{app_id}/history/{history_id}",
        json={"expected_revision": 1, "changed_at": instant(3).isoformat()},
    )
    assert result.status_code == 200, result.text
    assert (await calculate(db, owner_id))["interviews"] == 1
    assert (await calculate(db, owner_id))["visits"][0]["hours"] is None


async def test_response_availability_unknown_date_zero_denominator_and_future(
    db, workspace
):
    owner, _, statuses = workspace
    owner_id = owner.id
    app, _ = await application(
        db, owner, statuses, [("applied", instant(1))], response=True
    )
    app.response_occurred_on = None
    app.response_recorded_at = instant(8)
    await application(
        db, owner, statuses, [("offer", instant(9))], applied=date(2026, 1, 9)
    )
    old, _ = await application(
        db,
        owner,
        statuses,
        [("applied", instant(1, year=1995))],
        applied=date(1995, 1, 1),
    )
    data = await calculate(db, owner_id)
    assert data["total_applications"] == 2 and data["responded"] == 0
    assert data["offers"] == 0 and data["scope"]["cohort_start"] is None
    later = await calculate(db, owner_id, as_of=instant(8))
    assert later["responded"] == later["response_undated"] == 1
    assert later["applications"][1]["response_occurred_on"] is None
    empty = await calculate(db, owner_id, period="7d", as_of=instant(1, month=2))
    assert empty["total_applications"] == 0
    assert (
        empty["response_rate"] is empty["interview_rate"] is empty["offer_rate"] is None
    )
    prompt = build_analytics_prompt_data(empty, {}, {}, "7d")
    assert '"response_rate": null' in prompt and "unavailable" in prompt


async def test_period_selects_cohort_not_residence_and_dst_uses_elapsed_utc(
    db, workspace
):
    owner, _, statuses = workspace
    owner_id = owner.id
    # US spring-forward: two local 09:00 observations are only 23 elapsed hours apart.
    app, _ = await application(
        db,
        owner,
        statuses,
        [
            ("applied", datetime.fromisoformat("2026-03-07T09:00:00-05:00")),
            ("screening", datetime.fromisoformat("2026-03-08T09:00:00-04:00")),
        ],
        applied=date(2026, 3, 13),
    )
    data = await calculate(
        db,
        owner_id,
        period="7d",
        as_of=datetime.fromisoformat("2026-03-14T09:00:00-04:00"),
        time_zone="America/New_York",
    )
    assert data["scope"]["cohort_start"] == date(2026, 3, 8)
    assert data["visits"][0]["hours"] == 23  # not clipped to Mar 8 cohort start
    assert data["visits"][1]["hours"] == 144
    assert data["total_applications"] == 1


async def test_activity_round_dates_separate_from_cohort_and_no_inference(
    db, client, workspace
):
    owner, _, statuses = workspace
    owner_id = owner.id
    app, _ = await application(
        db, owner, statuses, [("applied", instant(1)), ("interviewing", instant(10))]
    )
    round_only, _ = await application(db, owner, statuses, [("applied", instant(1))])
    rt = RoundType(name="Synthetic interview", user_id=owner.id)
    db.add(rt)
    await db.flush()
    db.add_all(
        [
            Round(
                application_id=round_only.id,
                round_type_id=rt.id,
                scheduled_at=instant(12),
                completed_at=instant(14),
                outcome="Passed",
            ),
            Round(application_id=app.id, round_type_id=rt.id, scheduled_at=instant(30)),
        ]
    )
    await db.commit()
    data = await calculate(db, owner_id, period="30d", as_of=instant(15))
    assert data["interviews"] == 1 and data["responded"] == 0
    activity = await get_activity_tracking_data(db, owner_id, "30d", calculation=data)
    assert [
        (e["kind"], e["occurred_at"].day)
        for e in activity["events"]
        if e["kind"] != "status_transition"
    ] == [("round_scheduled", 12), ("round_completed", 14)]
    assert (
        next(p for p in activity["weekly_data"] if p["interviews"])["week"] == "Week 1"
    )
    assert (
        next(p for p in activity["weekly_data"] if p["applications"])["week"]
        == "Week 3"
    )
    result = await client.get(
        "/api/analytics/interview-rounds",
        params={"period": "30d", "as_of": instant(13).isoformat()},
    )
    assert result.status_code == 200, result.text
    rnd = result.json()["candidate_progress"][0]["rounds_completed"][0]
    assert (
        rnd["scheduled_at"] and rnd["completed_at"] is None and rnd["outcome"] is None
    )
    assert result.json()["timeline_data"] == []


async def test_owner_scope_timezone_and_api_negative_requests(db, client, workspace):
    owner, other, statuses = workspace
    owner.settings = {"time_zone_mode": "manual", "time_zone": "America/Los_Angeles"}
    own, history = await application(
        db, owner, statuses, [("applied", instant(1))], applied=date(2026, 1, 6)
    )
    foreign, _ = await application(
        db, other, statuses, [("offer", instant(1))], applied=date(2026, 1, 6)
    )
    future, _ = await application(
        db, owner, statuses, [("applied", instant(7))], applied=date(2026, 1, 7)
    )
    params = {"period": "all", "as_of": "2026-01-07T00:30:00Z"}
    scopes = ["analytics:read", "dashboard:read"]
    token = generate_api_token()
    db.add(
        UserAPIKey(
            user_id=owner.id,
            label="Synthetic scoped",
            key_prefix=token[:8],
            key_hash=hash_api_key(token),
            scopes=scopes,
            preset="custom",
        )
    )
    await db.commit()
    client.headers.pop("Authorization")
    client.headers["X-API-Key"] = token
    for route in (
        "/api/analytics/pipeline",
        "/api/analytics/kpis",
        "/api/analytics/sankey",
        "/api/analytics/activity",
        "/api/dashboard/kpis",
        "/api/dashboard/needs-attention",
    ):
        r = await client.get(
            route, params=params, headers={"Time-Zone": "Europe/Belgrade"}
        )
        assert r.status_code == 200, r.text
        assert r.json()["scope"]["denominator"] == 1
        assert r.json()["scope"]["cohort_end"] == "2026-01-06"
        assert foreign.id not in r.text and future.id not in r.text
    assert (
        await client.patch(
            f"/api/applications/{foreign.id}/history/missing",
            json={"expected_revision": 0, "to_meaning": "offer"},
        )
    ).status_code == 403
    for value in ("2026-01-01T09:00:00", "2999-01-01T09:00:00Z"):
        assert (
            await client.get("/api/analytics/pipeline", params={"as_of": value})
        ).status_code == 422
    client.headers.clear()
    assert (await client.get("/api/analytics/pipeline")).status_code == 401


async def test_attention_uses_recorded_response_and_published_thresholds(
    db, client, workspace
):
    owner, _, statuses = workspace
    silent, _ = await application(db, owner, statuses, [("applied", instant(1))])
    replied, _ = await application(
        db, owner, statuses, [("screening", instant(1))], response=True
    )
    closed, _ = await application(db, owner, statuses, [("no_reply", instant(1))])
    r = await client.get(
        "/api/dashboard/needs-attention", params={"as_of": instant(9).isoformat()}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert [row["id"] for row in data["follow_ups"]] == [silent.id]
    assert [row["id"] for row in data["no_responses"]] == [silent.id]
    assert "7–10" in data["follow_ups"][0]["reason"]
    assert "not proof of silence" in data["no_responses"][0]["reason"]
    assert data["follow_ups"][0]["current_stage_age_hours"] == 192


async def test_read_only_generation_denied_and_authorized_post_is_explicit(
    db, client, workspace
):
    owner, _, statuses = workspace
    await application(db, owner, statuses, [("applied", instant(1))])
    section = SectionInsight(
        key_insight="Synthetic", trend="No comparison", priority_actions=[]
    )
    mock_result = GraceInsights(
        overall_grace="Synthetic",
        pipeline_overview=section,
        interview_analytics=section,
        activity_tracking=section,
    )
    assert "analytics:generate" in resolve_scopes_for_preset("cli")
    assert "analytics:generate" in resolve_scopes_for_preset("full_access")
    assert "analytics:generate" not in resolve_scopes_for_preset("read_only")
    assert "analytics:generate" not in resolve_scopes_for_preset("extension")
    raw = generate_api_token()
    key = UserAPIKey(
        user_id=owner.id,
        label="Old read-only",
        key_prefix=raw[:8],
        key_hash=hash_api_key(raw),
        scopes=["analytics:read"],
        preset="read_only",
    )
    db.add(key)
    await db.commit()
    client.headers.clear()
    client.headers["X-API-Key"] = raw
    with patch(
        "app.api.insights.generate_insights_async",
        new_callable=AsyncMock,
        return_value=mock_result,
    ) as generate:
        assert (await client.get("/api/analytics/pipeline")).status_code == 200
        assert (
            await client.get("/api/analytics/insights/configured")
        ).status_code == 200
        assert (
            await client.post("/api/analytics/insights", json={"period": "all"})
        ).status_code == 403
        generate.assert_not_called()
        assert key.scopes == ["analytics:read"]
        key.scopes = ["analytics:generate"]
        await db.commit()
        assert (
            await client.post("/api/analytics/insights", json={"period": "all"})
        ).status_code == 403
        generate.assert_not_called()
        key.scopes = ["analytics:read", "analytics:generate"]
        await db.commit()
        r = await client.post(
            "/api/analytics/insights",
            json={"period": "all", "as_of": instant(7).isoformat()},
        )
        assert r.status_code == 200, r.text
        generate.assert_awaited_once()
        assert generate.await_args is not None
        pipeline, rounds, activity = generate.await_args.args[1:4]
        assert pipeline["scope"] == rounds["scope"] == activity["scope"]
        assert pipeline["scope"]["as_of"] == instant(7)


async def test_correction_recalculates_duration_response_and_foreign_not_found(
    db, client, workspace
):
    owner, other, statuses = workspace
    owner_id = owner.id
    app, history = await application(
        db,
        owner,
        statuses,
        [("applied", instant(1)), ("interviewing", instant(3))],
        response=True,
    )
    app_id, event_id = app.id, history[1].id
    foreign, entries = await application(db, other, statuses, [("offer", instant(1))])
    assert (
        await client.patch(
            f"/api/applications/{foreign.id}/history/{entries[0].id}",
            json={"expected_revision": 0, "to_meaning": "applied"},
        )
    ).status_code == 404
    before = await calculate(db, owner_id)
    assert before["visits"][0]["hours"] == 48 and before["response_rate"] == 100
    r = await client.patch(
        f"/api/applications/{app_id}/history/{event_id}",
        json={"expected_revision": 0, "changed_at": instant(4).isoformat()},
    )
    assert r.status_code == 200, r.text
    assert (
        await client.patch(
            f"/api/applications/{app_id}", json={"response_evidence": None}
        )
    ).status_code == 200
    after = await calculate(db, owner_id)
    assert after["visits"][0]["hours"] == 72 and after["response_rate"] == 0
    assert (
        after["applications"][0]["evidence_revision"]
        > before["applications"][0]["evidence_revision"]
    )


async def test_equal_timestamps_do_not_invent_order_or_wait(db, workspace):
    owner, _, statuses = workspace
    owner_id = owner.id
    await application(
        db,
        owner,
        statuses,
        [
            ("applied", instant(1)),
            ("screening", instant(1)),
            ("interviewing", instant(3)),
        ],
    )
    data = await calculate(db, owner_id)
    assert len(data["applications"][0]["ambiguous_time_ids"]) == 2
    assert [v["hours"] for v in data["visits"]].count(None) == 2
    assert data["visits"][-1]["hours"] == 96
    assert data["links"] == []


async def test_exact_current_144_hour_example(db, workspace):
    owner, _, statuses = workspace
    owner_id = owner.id
    await application(
        db,
        owner,
        statuses,
        [
            ("applied", instant(1)),
            ("screening", instant(3)),
            ("applied", instant(4)),
            ("interviewing", instant(6)),
        ],
    )
    data = await calculate(db, owner_id)
    assert [v["hours"] for v in data["visits"]] == [48, 24, 48, 24]
    assert [v["kind"] for v in data["visits"]] == [
        "completed",
        "completed",
        "completed",
        "current",
    ]
    assert data["applications"][0]["current_stage_age_hours"] == 24
    assert sum(t["hours"] for t in data["stage_totals"]) == 144
    assert data["coverage"]["applications_with_missing_prefix"] == 0


async def test_ten_new_applied_are_not_ten_replies_and_all_closed_meanings(
    db, workspace
):
    owner, _, statuses = workspace
    owner_id = owner.id
    for _ in range(10):
        await application(db, owner, statuses, [("applied", instant(1))])
    for meaning in ("accepted", "rejected", "withdrawn", "no_reply", "unknown"):
        await application(db, owner, statuses, [(meaning, instant(1))])
    data = await calculate(db, owner_id)
    assert data["responded"] == data["interviews"] == data["offers"] == 0
    assert data["response_rate"] == 0
    assert data["active_applications"] == 10
    assert data["closed_applications"] == 4
    assert data["unknown_applications"] == 1
    assert sum(v["hours"] is not None for v in data["visits"]) == 10


async def test_same_day_future_milestone_and_dated_response_not_available_yet(
    db, workspace
):
    owner, _, statuses = workspace
    owner_id = owner.id
    app, _ = await application(
        db,
        owner,
        statuses,
        [("offer", instant(7, hour=10))],
        applied=date(2026, 1, 7),
        response=True,
    )
    app.response_occurred_on = date(2026, 1, 8)
    await db.commit()
    data = await calculate(db, owner_id)
    assert data["total_applications"] == 1
    assert data["offers"] == data["responded"] == 0
    assert data["current_stage_breakdown"] == {"offer": 1}
    assert data["visits"] == []
    assert data["applications"][0]["as_of_meaning"] == "unknown"


async def test_empty_cohort_api_exposes_unavailable_percentages(client, workspace):
    response = await client.get(
        "/api/analytics/kpis", params={"period": "all", "as_of": instant(7).isoformat()}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["scope"]["denominator"] == 0
    assert (
        data["response_rate"]
        is data["application_to_interview_rate"]
        is data["offer_rate"]
        is None
    )


@pytest.mark.parametrize("intermediate", [False, True], ids=["initial", "intermediate"])
async def test_custom_unknown_observations_remain_visible_without_inference(
    db, client, workspace, intermediate
):
    owner, _, statuses = workspace
    statuses["unknown"].name = "Portfolio review"
    path = [("unknown", instant(2))]
    if intermediate:
        path = [("applied", instant(1)), *path, ("screening", instant(3))]
    app, history = await application(db, owner, statuses, path)
    app_id = app.id
    unknown_id = history[1 if intermediate else 0].id
    params = {"period": "all", "as_of": instant(7).isoformat()}
    sankey = await client.get("/api/analytics/sankey", params=params)
    assert sankey.status_code == 200, sankey.text
    nodes = sankey.json()["nodes"]
    assert len(nodes) == len(path)
    node = next(n for n in nodes if n["id"] == unknown_id)
    assert (node["name"], node["meaning"], node["application_id"]) == (
        "Portfolio review",
        "unknown",
        app_id,
    )
    assert datetime.fromisoformat(node["entered_at"]) == instant(2)
    assert sankey.json()["links"] == []  # No path through unclassified residence.
    activity = await client.get("/api/analytics/activity", params=params)
    assert activity.status_code == 200, activity.text
    events = activity.json()["events"]
    assert len(events) == len(path)
    event = next(e for e in events if e["event_id"] == unknown_id)
    assert (event["kind"], event["meaning"]) == ("status_transition", "unknown")
    assert datetime.fromisoformat(event["occurred_at"]) == instant(2)
    pipeline = await client.get("/api/analytics/pipeline", params=params)
    assert pipeline.status_code == 200, pipeline.text
    data = pipeline.json()
    assert data["interviews"] == data["offers"] == data["responded"] == 0
    assert data["applications"][0]["unknown_history_ids"] == [unknown_id]
    assert all(v["entry_id"] != unknown_id for v in data["visits"])
    if intermediate:
        # The trusted source at the unknown transition closes Applied; it cannot
        # establish a wait in the unknown stage. Later known residence survives.
        assert [v["hours"] for v in data["visits"]] == [24, 96]
    else:
        assert data["visits"] == data["stage_totals"] == []
        assert data["applications"][0]["current_stage_age_hours"] is None


@pytest.mark.parametrize("applied_exit_first", [True, False])
async def test_equal_future_timestamps_do_not_certify_earlier_wait(
    db, workspace, applied_exit_first
):
    owner, _, statuses = workspace
    owner_id = owner.id
    _, history = await application(
        db,
        owner,
        statuses,
        [
            ("applied", instant(1)),
            ("screening", instant(3)),
            ("interviewing", instant(3)),
        ],
    )
    history[1].id, history[2].id = (
        ("exit-a", "exit-b") if applied_exit_first else ("exit-b", "exit-a")
    )
    await db.commit()
    before = await calculate(db, owner_id, as_of=instant(2))
    assert before["applications"][0]["as_of_meaning"] == "applied"
    assert before["applications"][0]["current_stage_age_hours"] is None
    assert before["visits"][0]["hours"] is None
    assert before["stage_totals"] == []
    assert before["coverage"]["active_age_unavailable"] == 1
    boundary = await calculate(db, owner_id, as_of=instant(3))
    assert boundary["applications"][0]["ambiguous_time_ids"] == ["exit-a", "exit-b"]
    assert all(v["hours"] is None for v in boundary["visits"])
    assert boundary["links"] == []


async def test_candidate_rounds_order_by_schedule_after_backfill_and_rescheduling(
    db, client, workspace
):
    owner, _, statuses = workspace
    app, _ = await application(db, owner, statuses, [("applied", instant(1))])
    rounds = []
    # Reverse insertion, including same-time IDs and an undated observation.
    for name, day in [
        ("undated", None),
        ("rescheduled", 2),
        ("tie-b", 4),
        ("tie-a", 4),
        ("backfill", 3),
    ]:
        rt = RoundType(name=name, user_id=owner.id)
        db.add(rt)
        await db.flush()
        rnd = Round(
            id=name,
            application_id=app.id,
            round_type_id=rt.id,
            scheduled_at=instant(day) if day else None,
        )
        db.add(rnd)
        rounds.append(rnd)
        await db.flush()
    await db.commit()
    rounds[1].scheduled_at = instant(6)
    await db.commit()
    # Discard identity-map ordering to exercise a fresh database relationship load.
    db.expire_all()
    result = await client.get(
        "/api/analytics/interview-rounds",
        params={"period": "all", "as_of": instant(7).isoformat()},
    )
    assert result.status_code == 200, result.text
    completed = result.json()["candidate_progress"][0]["rounds_completed"]
    assert [r["round_type"] for r in completed] == [
        "backfill",
        "tie-a",
        "tie-b",
        "rescheduled",
        "undated",
    ]
    assert completed[-1]["scheduled_at"] is None
