"""Tests for ExportService."""

from datetime import datetime
from unittest.mock import Mock, patch

import pytest

from app.services.export_registry import ExportRegistry
from app.services.export_service import ExportService


class TestExportService:
    """Tests for the ExportService class."""

    @pytest.fixture
    def registry(self):
        """Create a fresh registry for each test."""
        return ExportRegistry()

    @pytest.fixture
    def export_service(self, registry):
        """Create an export service with the registry."""
        return ExportService(registry=registry)

    def test_export_user_data_returns_dict(self, export_service):
        """export_user_data should return a properly structured dict."""
        mock_session = Mock()

        with patch.object(export_service, "_get_user_records") as mock_get:
            mock_get.return_value = []

            result = export_service.export_user_data(
                user_id="user-123", session=mock_session
            )

        assert "format_version" in result
        assert "user" in result
        assert "models" in result

    def test_export_includes_export_version(self, export_service):
        """Export should include version for compatibility checking."""
        mock_session = Mock()

        with patch.object(export_service, "_get_user_records") as mock_get:
            mock_get.return_value = []

            result = export_service.export_user_data(
                user_id="user-123", session=mock_session
            )

        assert result["format_version"] == "1.0.0"

    def test_export_includes_user_id(self, export_service):
        """Export should include user ID."""
        mock_session = Mock()

        with patch.object(export_service, "_get_user_records") as mock_get:
            mock_get.return_value = []

            result = export_service.export_user_data(
                user_id="user-123", session=mock_session
            )

        assert result["user"]["id"] == "user-123"

    def test_export_includes_exported_at_timestamp(self, export_service):
        """Export should include ISO timestamp of when it was created."""
        mock_session = Mock()

        with patch.object(export_service, "_get_user_records") as mock_get:
            mock_get.return_value = []

            result = export_service.export_user_data(
                user_id="user-123", session=mock_session
            )

        assert "export_timestamp" in result
        # Should be a valid ISO string
        parsed_time = datetime.fromisoformat(result["export_timestamp"])
        assert parsed_time.tzinfo is not None  # Should have timezone info

    def test_export_version_constant(self, export_service):
        """ExportService should have EXPORT_VERSION class attribute."""
        assert hasattr(ExportService, "EXPORT_VERSION")
        assert ExportService.EXPORT_VERSION == "1.0.0"

    def test_export_iterates_registered_models(self, registry):
        """Export should iterate over all registered models in order."""
        # Create mock models
        mock_model_a = Mock(__name__="ModelA")
        mock_model_b = Mock(__name__="ModelB")

        registry.register(mock_model_a, order=2)
        registry.register(mock_model_b, order=1)

        export_service = ExportService(registry=registry)
        mock_session = Mock()

        with patch.object(export_service, "_get_user_records") as mock_get:
            mock_get.return_value = []

            with patch.object(export_service, "_serialize_record") as mock_serialize:
                mock_serialize.return_value = {"id": "test"}

                export_service.export_user_data(
                    user_id="user-123", session=mock_session
                )

        # Should have called _get_user_records for each model in order
        assert mock_get.call_count == 2
        # First call should be for ModelB (order=1)
        assert mock_get.call_args_list[0][0][0] == mock_model_b
        # Second call should be for ModelA (order=2)
        assert mock_get.call_args_list[1][0][0] == mock_model_a

    def test_export_populates_models_dict(self, export_service):
        """Export should populate models dict with serialized records."""
        mock_session = Mock()

        # Create a mock model class
        mock_model = Mock(__name__="TestModel")
        mock_record = Mock()

        export_service.registry.register(mock_model, order=1)

        with patch.object(export_service, "_get_user_records") as mock_get:
            mock_get.return_value = [mock_record]

            with patch.object(export_service, "_serialize_record") as mock_serialize:
                mock_serialize.return_value = {"id": "record-1", "name": "Test"}

                result = export_service.export_user_data(
                    user_id="user-123", session=mock_session
                )

        assert "TestModel" in result["models"]
        assert len(result["models"]["TestModel"]) == 1
        assert result["models"]["TestModel"][0]["id"] == "record-1"

    def test_get_user_records_filters_by_user_id_column(self, export_service):
        """_get_user_records should filter models with user_id column."""
        mock_session = Mock()
        mock_query = Mock()
        mock_filtered = Mock()
        mock_filtered.all.return_value = ["record1", "record2"]
        mock_query.filter.return_value = mock_filtered
        mock_session.query.return_value = mock_query

        # Create a mock model with user_id attribute
        mock_model = Mock()
        mock_model.user_id = "column"
        mock_model.__name__ = "TestModel"

        result = export_service._get_user_records(
            model_class=mock_model, user_id="user-123", session=mock_session
        )

        # Should query and filter by user_id
        mock_session.query.assert_called_once_with(mock_model)
        mock_query.filter.assert_called_once()
        assert result == ["record1", "record2"]

    def test_get_user_records_filters_user_model_by_id(self, export_service):
        """_get_user_records should filter User model by id."""
        mock_session = Mock()
        mock_query = Mock()
        mock_filtered = Mock()
        mock_filtered.all.return_value = ["user_record"]
        mock_query.filter.return_value = mock_filtered
        mock_session.query.return_value = mock_query

        # Create a mock User model
        mock_user_model = Mock()
        mock_user_model.__name__ = "User"
        mock_user_model.id = "column"
        # Should NOT have user_id for this test
        if hasattr(mock_user_model, "user_id"):
            delattr(mock_user_model, "user_id")

        result = export_service._get_user_records(
            model_class=mock_user_model, user_id="user-123", session=mock_session
        )

        mock_session.query.assert_called_once_with(mock_user_model)
        mock_query.filter.assert_called_once()
        assert result == ["user_record"]

    def test_get_user_records_handles_user_relationship(self, export_service):
        """_get_user_records should handle models with user relationship."""
        mock_session = Mock()
        mock_query = Mock()
        mock_joined = Mock()
        mock_filtered = Mock()
        mock_filtered.all.return_value = ["profile1"]
        mock_joined.filter.return_value = mock_filtered
        mock_query.join.return_value = mock_joined
        mock_session.query.return_value = mock_query

        # Create a mock model with user relationship but no user_id
        mock_model = Mock()
        mock_model.__name__ = "UserProfile"
        mock_user_rel = Mock()
        mock_user_rel.id = "column"
        mock_model.user = mock_user_rel
        # Should NOT have user_id
        if hasattr(mock_model, "user_id"):
            delattr(mock_model, "user_id")

        result = export_service._get_user_records(
            model_class=mock_model, user_id="user-123", session=mock_session
        )

        mock_session.query.assert_called_once_with(mock_model)
        mock_query.join.assert_called_once_with(mock_model.user)
        assert result == ["profile1"]

    def test_get_user_records_returns_empty_for_unknown_models(self, export_service):
        """_get_user_records should return empty list for unhandleable models."""
        mock_session = Mock()

        # Create a model without user_id or any known relationship
        mock_model = Mock()
        mock_model.__name__ = "OrphanModel"
        # Remove all attributes that the service checks for
        for attr in ["user_id", "user", "application", "round"]:
            if hasattr(mock_model, attr):
                delattr(mock_model, attr)

        result = export_service._get_user_records(
            model_class=mock_model, user_id="user-123", session=mock_session
        )

        assert result == []

    def test_serialize_record_uses_serialize_model_instance(self, export_service):
        """_serialize_record should use serialize_model_instance."""
        mock_record = Mock()

        with patch(
            "app.services.export_service.serialize_model_instance"
        ) as mock_serialize:
            mock_serialize.return_value = {"id": "test-123", "name": "Test"}

            result = export_service._serialize_record(
                record=mock_record, include_media_paths=True
            )

        mock_serialize.assert_called_once_with(
            mock_record, include_relationships=True, relationship_prefix=""
        )
        assert result["id"] == "test-123"
        assert result["name"] == "Test"

    def test_serialize_record_adds_original_id(self, export_service):
        """_serialize_record should add __original_id__ for import remapping."""
        mock_record = Mock()

        with patch(
            "app.services.export_service.serialize_model_instance"
        ) as mock_serialize:
            mock_serialize.return_value = {"id": "test-123", "name": "Test"}

            result = export_service._serialize_record(
                record=mock_record, include_media_paths=True
            )

        assert "__original_id__" in result
        assert result["__original_id__"] == "test-123"

    def test_serialize_record_handles_missing_id(self, export_service):
        """_serialize_record should handle records without id field."""
        mock_record = Mock()

        with patch(
            "app.services.export_service.serialize_model_instance"
        ) as mock_serialize:
            mock_serialize.return_value = {"name": "Test", "value": 42}

            result = export_service._serialize_record(
                record=mock_record, include_media_paths=True
            )

        # Should not add __original_id__ if id is not present
        assert "__original_id__" not in result
        assert result["name"] == "Test"

    def test_export_with_empty_registry(self, registry):
        """Export should work even with empty registry."""
        export_service = ExportService(registry=registry)
        mock_session = Mock()

        result = export_service.export_user_data(
            user_id="user-123", session=mock_session
        )

        assert result["format_version"] == "1.0.0"
        assert result["user"]["id"] == "user-123"
        assert result["models"] == {}
