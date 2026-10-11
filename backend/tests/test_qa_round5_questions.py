"""Blank questions cannot erase saved answers."""

import pytest
from tests.test_core_mutation_integrity import workspace as workspace


@pytest.mark.parametrize("question", ["", "   "])
async def test_blank_question_keeps_saved_pair(client, workspace, question):
    _, _, _, types, app_id = workspace
    created = await client.post(
        f"/api/applications/{app_id}/rounds",
        json={
            "round_type_id": types[0].id,
            "questions_answers": [{"question": "Question", "answer": "Saved answer"}],
        },
    )
    assert created.status_code == 201
    round_id = created.json()["id"]
    path = f"/api/rounds/{round_id}"
    current = (await client.get(path)).json()
    rejected = await client.patch(
        path,
        json={
            "expected_revision": current["revision"],
            "questions_answers": [{"question": question, "answer": "Saved answer"}],
        },
    )
    assert rejected.status_code == 422
    assert (await client.get(path)).json()["questions_answers"] == [
        {"question": "Question", "answer": "Saved answer"}
    ]
    deleted = await client.patch(
        path, json={"expected_revision": current["revision"], "questions_answers": []}
    )
    assert deleted.status_code == 200
    assert (await client.get(path)).json()["questions_answers"] == []


async def test_round_create_rejects_answer_without_question(client, workspace):
    _, _, _, types, app_id = workspace
    rejected = await client.post(
        f"/api/applications/{app_id}/rounds",
        json={
            "round_type_id": types[0].id,
            "questions_answers": [{"question": " ", "answer": "New answer"}],
        },
    )
    assert rejected.status_code == 422
