import textwrap

import pytest
from sqlalchemy import inspect


def _plan_text(rows: list[tuple]) -> str:
    return "\n".join(" ".join(str(part) for part in row) for row in rows)


async def _explain_query(db_engine, query: str) -> tuple[str, str]:
    sql = textwrap.dedent(query).strip()

    async with db_engine.connect() as conn:
        dialect = conn.dialect.name

        if dialect == "postgresql":
            await conn.exec_driver_sql("SET enable_seqscan = off")
            result = await conn.exec_driver_sql(
                f"EXPLAIN (FORMAT TEXT, COSTS OFF) {sql}"
            )
        else:
            result = await conn.exec_driver_sql(f"EXPLAIN QUERY PLAN {sql}")

        return dialect, _plan_text(result.fetchall())


def _assert_avoids_explicit_sort(plan: str, dialect: str) -> None:
    if dialect == "postgresql":
        assert "Sort" not in plan
    else:
        assert "USE TEMP B-TREE FOR ORDER BY" not in plan


def _assert_avoids_full_scan(plan: str, table_name: str, dialect: str) -> None:
    if dialect == "postgresql":
        assert f"Seq Scan on {table_name}" not in plan
    else:
        assert f"SCAN {table_name}" not in plan


def _get_index_names(sync_conn, table_name: str) -> set[str]:
    inspector = inspect(sync_conn)
    return {
        index["name"]
        for index in inspector.get_indexes(table_name)
        if index.get("name")
    }


async def _index_names(db_engine, table_name: str) -> set[str]:
    async with db_engine.connect() as conn:
        return await conn.run_sync(_get_index_names, table_name)


@pytest.mark.asyncio
async def test_applications_status_list_uses_index_without_temp_sort(db_engine):
    dialect, plan = await _explain_query(
        db_engine,
        """
        SELECT *
        FROM applications
        WHERE user_id = 'u' AND status_id = 's'
        ORDER BY applied_at DESC, created_at DESC
        LIMIT 20
        """,
    )

    assert "ix_applications_user_status_applied_created" in plan
    _assert_avoids_explicit_sort(plan, dialect)


@pytest.mark.asyncio
async def test_applications_job_url_lookup_uses_exact_match_index(db_engine):
    _, plan = await _explain_query(
        db_engine,
        """
        SELECT *
        FROM applications
        WHERE user_id = 'u' AND job_url = 'https://example.com'
        """,
    )

    assert "ix_applications_user_job_url" in plan


@pytest.mark.asyncio
async def test_job_leads_source_list_uses_index_without_temp_sort(db_engine):
    dialect, plan = await _explain_query(
        db_engine,
        """
        SELECT *
        FROM job_leads
        WHERE user_id = 'u' AND source = 'LinkedIn'
        ORDER BY scraped_at DESC
        LIMIT 20
        """,
    )

    assert "ix_job_leads_user_source_scraped_at" in plan
    _assert_avoids_explicit_sort(plan, dialect)


@pytest.mark.asyncio
async def test_job_leads_url_lookup_uses_exact_match_index(db_engine):
    _, plan = await _explain_query(
        db_engine,
        """
        SELECT *
        FROM job_leads
        WHERE user_id = 'u' AND url = 'https://example.com'
        """,
    )

    assert "uq_job_leads_user_url" in plan


@pytest.mark.asyncio
async def test_round_media_lookup_uses_round_id_index(db_engine):
    dialect, plan = await _explain_query(
        db_engine,
        """
        SELECT *
        FROM round_media
        WHERE round_id = 'r'
        """,
    )

    assert "ix_round_media_round_id" in plan
    _assert_avoids_full_scan(plan, "round_media", dialect)


@pytest.mark.asyncio
async def test_status_history_ordered_lookup_uses_composite_index(db_engine):
    dialect, plan = await _explain_query(
        db_engine,
        """
        SELECT *
        FROM application_status_history
        WHERE application_id = 'a'
        ORDER BY changed_at DESC
        """,
    )

    assert "ix_application_status_history_application_changed_at" in plan
    _assert_avoids_explicit_sort(plan, dialect)


@pytest.mark.asyncio
async def test_fk_supporting_indexes_exist_for_status_and_round_type(db_engine):
    application_index_names = await _index_names(db_engine, "applications")
    round_index_names = await _index_names(db_engine, "rounds")

    assert "ix_applications_status_id" in application_index_names
    assert "ix_rounds_round_type_id" in round_index_names
