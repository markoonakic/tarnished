"""Model registry for export/import system."""

from dataclasses import dataclass


@dataclass
class ExportableModel:
    """Represents a model registered for export."""

    model_class: type
    order: int


class ExportRegistry:
    """Registry for models that should be exported/imported."""

    def __init__(self):
        self._models: dict[type, ExportableModel] = {}

    def register(self, model_class: type, order: int) -> None:
        """Register a model for export."""
        self._models[model_class] = ExportableModel(
            model_class=model_class, order=order
        )

    def get_models(self) -> list[ExportableModel]:
        """Get all registered models sorted by order."""
        return sorted(self._models.values(), key=lambda m: m.order)

    def get_model(self, model_class: type) -> ExportableModel | None:
        """Get a specific model's registration info."""
        return self._models.get(model_class)


# Global default registry
default_registry = ExportRegistry()


def exportable(order: int, registry: ExportRegistry = default_registry):
    """
    Decorator to mark a model as exportable.

    Usage:
        @exportable(order=1)
        class MyModel(Base):
            ...
    """

    def decorator(model_class: type) -> type:
        registry.register(model_class, order)
        return model_class

    return decorator
