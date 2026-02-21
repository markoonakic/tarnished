from app.services.import_id_mapper import IDMapper


class TestIDMapper:
    def test_store_and_retrieve_id_mapping(self):
        """Should store and retrieve ID mappings."""
        mapper = IDMapper()
        mapper.add("Application", "old-id-123", "new-id-456")

        result = mapper.get("Application", "old-id-123")
        assert result == "new-id-456"

    def test_remap_foreign_key(self):
        """Should remap foreign keys in data dictionaries."""
        mapper = IDMapper()
        mapper.add("Application", "old-app-id", "new-app-id")

        data = {
            "id": "old-round-id",
            "application_id": "old-app-id",
            "notes": "Test round",
        }

        remapped = mapper.remap_fk(data, "application_id", "Application")
        assert remapped["application_id"] == "new-app-id"

    def test_remap_returns_original_if_not_found(self):
        """Should return original ID if mapping not found."""
        mapper = IDMapper()

        data = {"id": "round-id", "application_id": "unknown-app-id"}

        remapped = mapper.remap_fk(data, "application_id", "Application")
        assert remapped["application_id"] == "unknown-app-id"

    def test_generate_model_key(self):
        """Should generate consistent keys for model+id pairs."""
        mapper = IDMapper()
        key = mapper._make_key("Application", "some-id")
        assert key == "Application:some-id"

    def test_handle_none_values(self):
        """Should handle None foreign keys gracefully."""
        mapper = IDMapper()

        data = {"id": "round-id", "application_id": None}

        remapped = mapper.remap_fk(data, "application_id", "Application")
        assert remapped["application_id"] is None
