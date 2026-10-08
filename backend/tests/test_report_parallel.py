"""Bounded pipeline dispatch; checkpoints stay ordered and fail closed."""

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import interview_jobs as jobs


@pytest.mark.parametrize(
    "scope,width", [("PIPELINE", 3), ("APPLICATION", 1), ("INTERVIEW", 1)]
)
async def test_section_dispatch_is_bounded_and_ordered(monkeypatch, scope, width):
    job = SimpleNamespace(scope=scope, manifest={}, checkpoints=[], uncertain=False)
    db = SimpleNamespace(commit=AsyncMock(), scalar=AsyncMock(return_value=None))

    @asynccontextmanager
    async def sessions():
        yield db

    executor = SimpleNamespace(sessions=sessions, accepting=True)
    monkeypatch.setattr(jobs, "guard", AsyncMock(return_value=(job, {}, None)))
    monkeypatch.setattr(
        jobs, "_scope_evidence", AsyncMock(return_value=([], [], list(range(7))))
    )
    active = peak = 0
    arrived = asyncio.Queue()
    gates = [asyncio.Event() for _ in range(7)]

    async def analyze(settings, batch, limits, actual_scope, **kwargs):
        nonlocal active, peak
        assert job.uncertain and actual_scope == scope
        active += 1
        peak = max(peak, active)
        await arrived.put(batch)
        try:
            await gates[batch].wait()
            return {"findings": [], "limitations": [str(batch)]}
        finally:
            active -= 1

    saved = []
    original = jobs.checkpoint

    async def checkpoint(db, job_id, claim, index, output, sources, **kwargs):
        await original(db, job_id, claim, index, output, [], **kwargs)
        saved.append((index, job.uncertain))

    async def publish(*args):
        assert not job.uncertain
        assert [item["limitations"] for item in job.checkpoints] == [
            [str(i)] for i in range(7)
        ]

    monkeypatch.setattr(jobs, "analyze_section", analyze)
    monkeypatch.setattr(jobs, "checkpoint", checkpoint)
    monkeypatch.setattr(jobs, "publish", publish)
    task = asyncio.create_task(jobs.execute(executor, "job", "claim"))
    for start in range(0, 7, width):
        batch = [
            await asyncio.wait_for(arrived.get(), 2)
            for _ in range(min(width, 7 - start))
        ]
        assert batch == list(range(start, start + len(batch)))
        for index in reversed(batch):
            gates[index].set()
    await asyncio.wait_for(task, 2)
    assert peak == width
    assert [i for i, _ in saved] == list(range(7))
    assert [pending for _, pending in saved] == [
        i % width != width - 1 and i != 6 for i in range(7)
    ]


@pytest.mark.parametrize("cancel", [False, True])
async def test_failed_or_cancelled_wave_keeps_uncertainty_and_cancels_siblings(
    monkeypatch, cancel
):
    job = SimpleNamespace(
        scope="PIPELINE", manifest={}, checkpoints=[], uncertain=False
    )
    db = SimpleNamespace(commit=AsyncMock(), scalar=AsyncMock(return_value=None))

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(jobs, "guard", AsyncMock(return_value=(job, {}, None)))
    monkeypatch.setattr(
        jobs, "_scope_evidence", AsyncMock(return_value=([], [], [0, 1, 2, 3]))
    )
    arrived = asyncio.Queue()
    fail = asyncio.Event()
    finished = []

    async def analyze(settings, batch, *args, **kwargs):
        await arrived.put(batch)
        try:
            await fail.wait()
            if batch == 0:
                raise ValueError("rejected evidence")
            await asyncio.Event().wait()
        finally:
            finished.append(batch)

    publish = AsyncMock()
    monkeypatch.setattr(jobs, "analyze_section", analyze)
    monkeypatch.setattr(jobs, "publish", publish)
    task = asyncio.create_task(
        jobs.execute(SimpleNamespace(sessions=sessions, accepting=True), "job", "claim")
    )
    assert [await asyncio.wait_for(arrived.get(), 2) for _ in range(3)] == [0, 1, 2]
    if cancel:
        task.cancel()
    else:
        fail.set()
    with pytest.raises(asyncio.CancelledError if cancel else ValueError):
        await task
    assert sorted(finished) == [0, 1, 2]
    assert job.uncertain and job.checkpoints == []
    publish.assert_not_called()
