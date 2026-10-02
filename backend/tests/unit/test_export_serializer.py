"""Unit tests for the explicit personal-data serializer."""

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models import Application, User
from app.models.user_api_key import UserAPIKey
from app.services.export_serializer import (
    EXPORT_FIELDS,
    serialize_model_instance,
    serialize_value,
)


class TestSerializeValue:
    """Tests for the serialize_value function."""

    def test_serialize_none(self):
        """None values should be serialized as None."""
        assert serialize_value(None) is None

    def test_serialize_string(self):
        """Strings should be returned as-is."""
        assert serialize_value("hello") == "hello"

    def test_serialize_int(self):
        """Integers should be returned as-is."""
        assert serialize_value(42) == 42

    def test_serialize_float(self):
        """Floats should be returned as-is."""
        assert serialize_value(3.14) == 3.14

    def test_serialize_bool(self):
        """Booleans should be returned as-is."""
        assert serialize_value(True) is True
        assert serialize_value(False) is False

    def test_serialize_datetime(self):
        """DateTime should be serialized as ISO string."""
        dt = datetime(2026, 2, 16, 12, 30, 45)
        assert serialize_value(dt) == "2026-02-16T12:30:45"

    def test_serialize_date(self):
        """Date should be serialized as ISO string (date only)."""
        from datetime import date

        d = date(2026, 2, 16)
        assert serialize_value(d) == "2026-02-16"

    def test_serialize_uuid(self):
        """UUID should be serialized as string."""
        uuid = uuid4()
        assert serialize_value(uuid) == str(uuid)

    def test_serialize_decimal(self):
        """Decimal should be serialized as float."""
        dec = Decimal("123.45")
        assert serialize_value(dec) == 123.45
        assert isinstance(serialize_value(dec), float)

    def test_serialize_list(self):
        """Lists should be returned as-is."""
        lst = [1, 2, 3]
        assert serialize_value(lst) == lst

    def test_serialize_dict(self):
        """Dicts should be returned as-is."""
        d = {"key": "value"}
        assert serialize_value(d) == d

    def test_serialize_unknown_type(self):
        """Unknown types should fall back to str()."""

        class CustomClass:
            def __str__(self):
                return "custom_value"

        obj = CustomClass()
        assert serialize_value(obj) == "custom_value"


def test_serialize_permitted_fields_without_relationships():
    user = User(id="owner", email="owner@example.com", password_hash="secret")
    application = Application(
        id="application",
        user_id=user.id,
        user=user,
        company="Acme",
        job_title="Engineer",
        job_description=None,
        skills=["Python"],
        created_at=datetime(2026, 2, 16, 12, 0, 0),
    )
    result = serialize_model_instance(application)
    assert result is not None
    assert set(result) == set(EXPORT_FIELDS["Application"])
    assert result["created_at"] == "2026-02-16T12:00:00"
    assert result["skills"] == ["Python"]
    assert result["job_description"] is None
    assert result["user_id"] == "owner"
    assert "user" not in result
    assert "rounds" not in result


def test_serialize_user_excludes_credentials_and_unknown_settings():
    user = User(
        id="owner",
        email="owner@example.com",
        password_hash="secret",
        session_version=42,
        settings={
            "theme": "dracula",
            "show_heatmap": False,
            "time_zone": "Europe/Paris",
            "litellm_api_key": "legacy-secret",
            "accent": {"api_key": "nested-secret"},
        },
    )
    result = serialize_model_instance(user)
    assert result is not None
    assert "session_version" not in result
    assert "password_hash" not in result
    assert "api_keys" not in result
    assert result["settings"] == {
        "theme": "dracula",
        "show_heatmap": False,
        "time_zone": "Europe/Paris",
    }


def test_serialize_unlisted_model_fails_closed():
    with pytest.raises(ValueError, match="not permitted"):
        serialize_model_instance(UserAPIKey(key_hash="secret"))


def test_serialize_none_model():
    assert serialize_model_instance(None) is None


@pytest.mark.parametrize("settings", [None, ["legacy-secret"], "legacy-secret"])
def test_serialize_user_settings_never_exports_unstructured_legacy_state(settings):
    result = serialize_model_instance(User(settings=settings))
    assert result is not None
    assert result["settings"] == (None if settings is None else {})
