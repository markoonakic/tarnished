"""Introspective serializer for SQLAlchemy models.

This module provides functions to serialize SQLAlchemy model instances
to dictionaries using introspection, avoiding hardcoded field lists.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import inspect
from sqlalchemy.orm import Mapper


def serialize_value(value: Any) -> Any:
    """
    Serialize a single value to JSON-compatible format.

    Args:
        value: Any value to serialize

    Returns:
        JSON-compatible representation of the value:
        - None -> None
        - Primitives (str, int, float, bool) -> as-is
        - datetime/date -> ISO string
        - UUID -> string
        - Decimal -> float
        - list/dict -> as-is
        - Other types -> str()
    """
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (list, dict)):
        return value
    # Fallback to string representation
    return str(value)


def serialize_model_instance(
    instance: Any,
    include_relationships: bool = False,
    relationship_prefix: str = "__rel__",
) -> dict[str, Any] | None:
    """
    Serialize a SQLAlchemy model instance to a dictionary.

    Uses introspection to automatically include all column fields.
    Optionally includes relationships with a prefix to distinguish them.

    Args:
        instance: SQLAlchemy model instance (or None)
        include_relationships: Whether to include relationship data
        relationship_prefix: Prefix for relationship keys in output

    Returns:
        Dictionary with all field values serialized to JSON-compatible types.
        Returns None if instance is None.
    """
    if instance is None:
        return None

    mapper: Mapper = inspect(instance.__class__)
    result = {}

    # Serialize all column attributes
    for column in mapper.columns:
        value = getattr(instance, column.key)
        result[column.key] = serialize_value(value)

    # Optionally serialize relationships
    if include_relationships:
        for rel_property in mapper.relationships:
            rel_value = getattr(instance, rel_property.key)

            if rel_value is None:
                result[f"{relationship_prefix}{rel_property.key}"] = None
            elif rel_property.uselist:
                # One-to-many or many-to-many (collection)
                result[f"{relationship_prefix}{rel_property.key}"] = [
                    serialize_model_instance(item, include_relationships=False)
                    for item in rel_value
                ]
            else:
                # Many-to-one or one-to-one (single object)
                result[f"{relationship_prefix}{rel_property.key}"] = (
                    serialize_model_instance(rel_value, include_relationships=False)
                )

    return result
