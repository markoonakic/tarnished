"""ID mapping for import operations."""

from typing import Any


class IDMapper:
    """
    Maps old IDs to new IDs during import operations.

    Used to remap foreign keys when importing records that
    reference other imported records.
    """

    def __init__(self):
        self._mappings: dict[str, str] = {}

    def _make_key(self, model_name: str, old_id: str) -> str:
        """Create a unique key for a model+id pair."""
        return f"{model_name}:{old_id}"

    def add(self, model_name: str, old_id: str, new_id: str) -> None:
        """Store a mapping from old ID to new ID for a model."""
        key = self._make_key(model_name, old_id)
        self._mappings[key] = new_id

    def get(self, model_name: str, old_id: str) -> str | None:
        """Get the new ID for an old ID, or None if not found."""
        key = self._make_key(model_name, old_id)
        return self._mappings.get(key)

    def remap_fk(
        self, data: dict[str, Any], fk_field: str, model_name: str
    ) -> dict[str, Any]:
        """
        Remap a foreign key field in a data dictionary.

        Args:
            data: Dictionary containing the record data
            fk_field: Name of the foreign key field to remap
            model_name: Name of the model the FK references

        Returns:
            New dictionary with remapped foreign key
        """
        old_fk_value = data.get(fk_field)

        if old_fk_value is None:
            return data

        new_fk_value = self.get(model_name, old_fk_value)

        if new_fk_value is None:
            # No mapping found, keep original
            return data

        return {**data, fk_field: new_fk_value}

    def has_mapping(self, model_name: str, old_id: str) -> bool:
        """Check if a mapping exists for the given model and ID."""
        key = self._make_key(model_name, old_id)
        return key in self._mappings
