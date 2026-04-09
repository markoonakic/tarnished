import pytest


def _plan_text(rows: list[tuple]) -> str:
    return "\n".join(" ".join(str(part) for part in row) for row in rows)


@pytest.mark.asyncio
async def test_applications_status_list_uses_index_without_temp_sort(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            SELECT *
            FROM applications
            WHERE user_id = 'u' AND status_id = 's'
            ORDER BY applied_at DESC, created_at DESC
            LIMIT 20
            """
        )
        plan = _plan_text(result.fetchall())

    assert "ix_applications_user_status_applied_created" in plan
    assert "USE TEMP B-TREE FOR ORDER BY" not in plan


@pytest.mark.asyncio
async def test_applications_job_url_lookup_uses_exact_match_index(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            SELECT *
            FROM applications
            WHERE user_id = 'u' AND job_url = 'https://example.com'
            """
        )
        plan = _plan_text(result.fetchall())

    assert "ix_applications_user_job_url" in plan


@pytest.mark.asyncio
async def test_job_leads_source_list_uses_index_without_temp_sort(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            SELECT *
            FROM job_leads
            WHERE user_id = 'u' AND source = 'LinkedIn'
            ORDER BY scraped_at DESC
            LIMIT 20
            """
        )
        plan = _plan_text(result.fetchall())

    assert "ix_job_leads_user_source_scraped_at" in plan
    assert "USE TEMP B-TREE FOR ORDER BY" not in plan


@pytest.mark.asyncio
async def test_job_leads_url_lookup_uses_exact_match_index(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            SELECT *
            FROM job_leads
            WHERE user_id = 'u' AND url = 'https://example.com'
            """
        )
        plan = _plan_text(result.fetchall())

    assert "uq_job_leads_user_url" in plan


@pytest.mark.asyncio
async def test_round_media_lookup_uses_round_id_index(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            SELECT *
            FROM round_media
            WHERE round_id = 'r'
            """
        )
        plan = _plan_text(result.fetchall())

    assert "ix_round_media_round_id" in plan
    assert "SCAN round_media" not in plan


@pytest.mark.asyncio
async def test_status_history_ordered_lookup_uses_composite_index(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            SELECT *
            FROM application_status_history
            WHERE application_id = 'a'
            ORDER BY changed_at DESC
            """
        )
        plan = _plan_text(result.fetchall())

    assert "ix_application_status_history_application_changed_at" in plan
    assert "USE TEMP B-TREE FOR ORDER BY" not in plan


@pytest.mark.asyncio
async def test_fk_supporting_indexes_exist_for_status_and_round_type(db_engine):
    async with db_engine.connect() as conn:
        status_indexes = await conn.exec_driver_sql("PRAGMA index_list(applications)")
        round_indexes = await conn.exec_driver_sql("PRAGMA index_list(rounds)")

        application_index_names = {row[1] for row in status_indexes.fetchall()}
        round_index_names = {row[1] for row in round_indexes.fetchall()}

    assert "ix_applications_status_id" in application_index_names
    assert "ix_rounds_round_type_id" in round_index_names
