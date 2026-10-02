"""Map archived record IDs to new owner-scoped IDs."""


class IDMapper:
    def __init__(self):
        self._mappings: dict[str, str] = {}

    def add(self, model_name: str, old_id: str, new_id: str) -> None:
        self._mappings[f"{model_name}:{old_id}"] = new_id

    def get(self, model_name: str, old_id: str) -> str | None:
        return self._mappings.get(f"{model_name}:{old_id}")

    @property
    def mappings(self) -> dict[str, str]:
        return dict(self._mappings)
