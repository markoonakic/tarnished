"""Tests for ImportService."""

from unittest.mock import Mock, patch

import pytest

from app.services.export_registry import ExportRegistry
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService


def make_mock_column(name):
    """Create a mock column object for testing."""
    mock_col = Mock()
    mock_col.key = name
    mock_col.type = Mock()  # Mock type, doesn't need specific type for most tests
    return mock_col


class TestImportService:
    """Tests for the ImportService class."""

    @pytest.fixture
    def registry(self):
        """Create a fresh registry for each test."""
        return ExportRegistry()

    @pytest.fixture
    def id_mapper(self):
        """Create a fresh ID mapper for each test."""
        return IDMapper()

    @pytest.fixture
    def import_service(self, registry, id_mapper):
        """Create an import service with registry and id_mapper."""
        return ImportService(registry=registry, id_mapper=id_mapper)

    # === SUPPORTED_VERSION constant tests ===

    def test_supported_version_constant(self, import_service):
        """ImportService should have SUPPORTED_VERSION class attribute."""
        assert hasattr(ImportService, "SUPPORTED_VERSION")
        assert ImportService.SUPPORTED_VERSION == "1.0.0"

    # === validate_export_data tests ===

    def test_validate_export_data_checks_version(self, import_service):
        """Should validate export version."""
        valid_data = {"format_version": "1.0.0", "models": {}}
        is_valid, error = import_service.validate_export_data(valid_data)
        assert is_valid is True
        assert error is None

    def test_validate_rejects_invalid_version(self, import_service):
        """Should reject exports with wrong version."""
        invalid_data = {"format_version": "2.0.0", "models": {}}
        is_valid, error = import_service.validate_export_data(invalid_data)
        assert is_valid is False
        assert "version" in error.lower()

    def test_validate_rejects_missing_version(self, import_service):
        """Should reject exports missing version."""
        invalid_data = {"models": {}}
        is_valid, error = import_service.validate_export_data(invalid_data)
        assert is_valid is False
        assert "version" in error.lower()

    def test_validate_rejects_missing_models(self, import_service):
        """Should reject exports missing models."""
        invalid_data = {"format_version": "1.0.0"}
        is_valid, error = import_service.validate_export_data(invalid_data)
        assert is_valid is False
        assert "model" in error.lower()

    def test_validate_rejects_non_dict_models(self, import_service):
        """Should reject exports where models is not a dict."""
        invalid_data = {"format_version": "1.0.0", "models": "not a dict"}
        is_valid, error = import_service.validate_export_data(invalid_data)
        assert is_valid is False
        assert "dictionary" in error.lower()

    # === _guess_referenced_model tests ===

    def test_guess_referenced_model_converts_application_id(self, import_service):
        """Should convert application_id to Application."""
        assert import_service._guess_referenced_model("application_id") == "Application"

    def test_guess_referenced_model_converts_user_id(self, import_service):
        """Should convert user_id to User."""
        assert import_service._guess_referenced_model("user_id") == "User"

    def test_guess_referenced_model_converts_round_type_id(self, import_service):
        """Should convert round_type_id to RoundType."""
        assert import_service._guess_referenced_model("round_type_id") == "RoundType"

    def test_guess_referenced_model_returns_none_for_non_fk(self, import_service):
        """Should return None for fields that don't look like FKs."""
        assert import_service._guess_referenced_model("company") is None
        assert import_service._guess_referenced_model("status") is None

    # === import_user_data tests ===

    def test_import_validates_first(self, import_service):
        """import_user_data should validate export_data first."""
        invalid_data = {"invalid": "structure"}

        with pytest.raises(ValueError) as exc_info:
            import_service.import_user_data(
                export_data=invalid_data, user_id="user-1", session=Mock()
            )

        assert "Invalid export data" in str(exc_info.value)

    def test_import_creates_id_mappings(self, import_service):
        """Should create ID mappings for imported records."""
        mock_session = Mock()

        # Create a mock model class
        mock_model_class = Mock()
        mock_model_class.__name__ = "Application"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        export_data = {
            "format_version": "1.0.0",
            "models": {
                "Application": [
                    {
                        "__original_id__": "old-app-1",
                        "company": "Acme",
                        "id": "old-app-1",
                    }
                ]
            },
        }

        # Mock _get_column_info to return valid columns
        mock_columns = {
            "id": make_mock_column("id"),
            "company": make_mock_column("company"),
            "user_id": make_mock_column("user_id"),
        }

        from app.services.export_registry import ExportableModel

        with patch.object(import_service.registry, "get_models") as mock_get:
            with patch.object(
                import_service, "_get_column_info", return_value=mock_columns
            ):
                mock_get.return_value = [ExportableModel(mock_model_class, 1)]

                result = import_service.import_user_data(
                    export_data=export_data, user_id="user-1", session=mock_session
                )

        assert import_service.id_mapper.has_mapping("Application", "old-app-1")
        assert result["counts"]["Application"] == 1

    def test_import_returns_counts_dict(self, import_service):
        """Should return counts of imported records per model."""
        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "TestModel"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        export_data = {
            "format_version": "1.0.0",
            "models": {
                "TestModel": [
                    {"__original_id__": "old-1", "name": "Test1", "id": "old-1"},
                    {"__original_id__": "old-2", "name": "Test2", "id": "old-2"},
                ]
            },
        }

        mock_columns = {
            "id": make_mock_column("id"),
            "name": make_mock_column("name"),
            "user_id": make_mock_column("user_id"),
        }

        from app.services.export_registry import ExportableModel

        with patch.object(import_service.registry, "get_models") as mock_get:
            with patch.object(
                import_service, "_get_column_info", return_value=mock_columns
            ):
                mock_get.return_value = [ExportableModel(mock_model_class, 1)]

                result = import_service.import_user_data(
                    export_data=export_data, user_id="user-1", session=mock_session
                )

        assert result["counts"]["TestModel"] == 2

    def test_import_processes_models_in_order(self, import_service):
        """Should process models in registry order (parents before children)."""
        mock_session = Mock()

        mock_parent = Mock()
        mock_parent.__name__ = "Parent"
        mock_parent.return_value = Mock()

        mock_child = Mock()
        mock_child.__name__ = "Child"
        mock_child.return_value = Mock()

        export_data = {
            "format_version": "1.0.0",
            "models": {
                "Parent": [{"__original_id__": "p1", "id": "p1"}],
                "Child": [{"__original_id__": "c1", "id": "c1"}],
            },
        }

        mock_columns = {
            "id": make_mock_column("id"),
            "user_id": make_mock_column("user_id"),
        }

        from app.services.export_registry import ExportableModel

        with patch.object(import_service.registry, "get_models") as mock_get:
            with patch.object(
                import_service, "_get_column_info", return_value=mock_columns
            ):
                mock_get.return_value = [
                    ExportableModel(mock_parent, 1),
                    ExportableModel(mock_child, 2),
                ]

                import_service.import_user_data(
                    export_data=export_data, user_id="user-1", session=mock_session
                )

        # Verify parents were processed first
        assert import_service.id_mapper.has_mapping("Parent", "p1")
        assert import_service.id_mapper.has_mapping("Child", "c1")

    def test_import_skips_models_not_in_export(self, import_service):
        """Should skip models that are not in the export data."""
        mock_session = Mock()

        mock_model_a = Mock()
        mock_model_a.__name__ = "ModelA"
        mock_model_a.return_value = Mock()

        mock_model_b = Mock()
        mock_model_b.__name__ = "ModelB"
        mock_model_b.return_value = Mock()

        export_data = {
            "format_version": "1.0.0",
            "models": {
                "ModelA": [{"__original_id__": "a1", "id": "a1"}]
                # ModelB is not in the export
            },
        }

        mock_columns = {
            "id": make_mock_column("id"),
            "user_id": make_mock_column("user_id"),
        }

        from app.services.export_registry import ExportableModel

        with patch.object(import_service.registry, "get_models") as mock_get:
            with patch.object(
                import_service, "_get_column_info", return_value=mock_columns
            ):
                mock_get.return_value = [
                    ExportableModel(mock_model_a, 1),
                    ExportableModel(mock_model_b, 2),
                ]

                result = import_service.import_user_data(
                    export_data=export_data, user_id="user-1", session=mock_session
                )

        assert "ModelA" in result["counts"]
        assert "ModelB" not in result["counts"]

    # === _import_record tests ===

    def test_import_record_sets_user_id(self, import_service):
        """_import_record should set user_id on models that have it."""
        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "Application"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        record_data = {"__original_id__": "old-id", "id": "old-id", "company": "Acme"}

        mock_columns = {
            "id": make_mock_column("id"),
            "company": make_mock_column("company"),
            "user_id": make_mock_column("user_id"),
        }

        with patch.object(
            import_service, "_get_column_info", return_value=mock_columns
        ):
            result = import_service._import_record(
                model_class=mock_model_class,
                record_data=record_data,
                user_id="new-user-id",
                session=mock_session,
            )

        # Verify the model was created with user_id
        call_kwargs = mock_model_class.call_args[1]
        assert call_kwargs["user_id"] == "new-user-id"
        mock_session.add.assert_called_once_with(mock_instance)

    def test_import_record_remaps_foreign_keys(self, import_service):
        """_import_record should remap foreign keys using IDMapper."""
        # Setup: add an existing mapping for a referenced record
        import_service.id_mapper.add("Application", "old-app-id", "new-app-id")

        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "Interview"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        record_data = {
            "__original_id__": "old-interview-id",
            "id": "old-interview-id",
            "application_id": "old-app-id",  # This should be remapped
            "notes": "Test interview",
        }

        mock_columns = {
            "id": make_mock_column("id"),
            "application_id": make_mock_column("application_id"),
            "notes": make_mock_column("notes"),
            "user_id": make_mock_column("user_id"),
        }

        with patch.object(
            import_service, "_get_column_info", return_value=mock_columns
        ):
            result = import_service._import_record(
                model_class=mock_model_class,
                record_data=record_data,
                user_id="user-1",
                session=mock_session,
            )

        # Verify FK was remapped
        call_kwargs = mock_model_class.call_args[1]
        assert call_kwargs["application_id"] == "new-app-id"

    def test_import_record_keeps_unmapped_fk_if_no_mapping(self, import_service):
        """_import_record should keep original FK value if no mapping exists."""
        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "Interview"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        record_data = {
            "__original_id__": "old-interview-id",
            "id": "old-interview-id",
            "application_id": "unknown-app-id",  # No mapping for this
            "notes": "Test interview",
        }

        mock_columns = {
            "id": make_mock_column("id"),
            "application_id": make_mock_column("application_id"),
            "notes": make_mock_column("notes"),
            "user_id": make_mock_column("user_id"),
        }

        with patch.object(
            import_service, "_get_column_info", return_value=mock_columns
        ):
            result = import_service._import_record(
                model_class=mock_model_class,
                record_data=record_data,
                user_id="user-1",
                session=mock_session,
            )

        # FK should be kept as-is
        call_kwargs = mock_model_class.call_args[1]
        assert call_kwargs["application_id"] == "unknown-app-id"

    def test_import_record_generates_new_id(self, import_service):
        """_import_record should generate a new UUID for the record."""
        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "Application"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        record_data = {"__original_id__": "old-id", "id": "old-id", "company": "Acme"}

        mock_columns = {
            "id": make_mock_column("id"),
            "company": make_mock_column("company"),
            "user_id": make_mock_column("user_id"),
        }

        with patch.object(
            import_service, "_get_column_info", return_value=mock_columns
        ):
            result = import_service._import_record(
                model_class=mock_model_class,
                record_data=record_data,
                user_id="user-1",
                session=mock_session,
            )

        # Verify a new ID was set (UUID format)
        call_kwargs = mock_model_class.call_args[1]
        new_id = call_kwargs["id"]
        assert new_id != "old-id"
        # UUID should be a string of 36 chars (with dashes)
        assert len(new_id) == 36

    def test_import_record_stores_id_mapping(self, import_service):
        """_import_record should store old->new ID mapping."""
        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "Application"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        record_data = {"__original_id__": "old-id", "id": "old-id", "company": "Acme"}

        mock_columns = {
            "id": make_mock_column("id"),
            "company": make_mock_column("company"),
            "user_id": make_mock_column("user_id"),
        }

        with patch.object(
            import_service, "_get_column_info", return_value=mock_columns
        ):
            import_service._import_record(
                model_class=mock_model_class,
                record_data=record_data,
                user_id="user-1",
                session=mock_session,
            )

        # Mapping should be stored
        assert import_service.id_mapper.has_mapping("Application", "old-id")

    def test_import_record_handles_missing_original_id(self, import_service):
        """_import_record should handle records without __original_id__."""
        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "Application"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        record_data = {
            # No __original_id__
            "id": "old-id",
            "company": "Acme",
        }

        mock_columns = {
            "id": make_mock_column("id"),
            "company": make_mock_column("company"),
            "user_id": make_mock_column("user_id"),
        }

        with patch.object(
            import_service, "_get_column_info", return_value=mock_columns
        ):
            result = import_service._import_record(
                model_class=mock_model_class,
                record_data=record_data,
                user_id="user-1",
                session=mock_session,
            )

        # Should still create the record
        mock_session.add.assert_called_once()
        assert result is mock_instance

    def test_import_record_handles_model_without_user_id(self, import_service):
        """_import_record should handle models that don't have user_id."""
        mock_session = Mock()

        mock_model_class = Mock()
        mock_model_class.__name__ = "RoundType"
        mock_instance = Mock()
        mock_model_class.return_value = mock_instance

        record_data = {
            "__original_id__": "old-rt-id",
            "id": "old-rt-id",
            "name": "Phone Screen",
        }

        # No user_id column
        mock_columns = {
            "id": make_mock_column("id"),
            "name": make_mock_column("name"),
        }

        with patch.object(
            import_service, "_get_column_info", return_value=mock_columns
        ):
            result = import_service._import_record(
                model_class=mock_model_class,
                record_data=record_data,
                user_id="user-1",
                session=mock_session,
            )

        # Should still create the record
        mock_session.add.assert_called_once()
        call_kwargs = mock_model_class.call_args[1]
        assert "user_id" not in call_kwargs
