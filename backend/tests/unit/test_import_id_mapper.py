from app.services.import_id_mapper import IDMapper


def test_mapping_is_scoped_to_model_and_returns_an_independent_copy():
    mapper = IDMapper()
    mapper.add("Application", "old-id", "new-application")
    mapper.add("Round", "old-id", "new-round")
    assert mapper.get("Application", "old-id") == "new-application"
    assert mapper.get("Round", "old-id") == "new-round"
    assert mapper.get("Application", "unknown") is None
    copy = mapper.mappings
    assert copy == {
        "Application:old-id": "new-application",
        "Round:old-id": "new-round",
    }
    copy.clear()
    assert mapper.get("Application", "old-id") == "new-application"
