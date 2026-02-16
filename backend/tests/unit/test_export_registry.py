import pytest
from app.services.export_registry import exportable, ExportRegistry


class TestExportRegistry:
    def test_exportable_decorator_registers_model(self):
        """Models decorated with @exportable should be registered."""
        registry = ExportRegistry()

        @exportable(order=1, registry=registry)
        class RegisteredModel:
            pass

        models = registry.get_models()
        assert len(models) == 1
        assert models[0].model_class == RegisteredModel
        assert models[0].order == 1

    def test_models_sorted_by_order(self):
        """Models should be returned sorted by their order."""
        registry = ExportRegistry()

        @exportable(order=3, registry=registry)
        class ThirdModel:
            pass

        @exportable(order=1, registry=registry)
        class FirstModel:
            pass

        @exportable(order=2, registry=registry)
        class SecondModel:
            pass

        models = registry.get_models()
        assert models[0].order == 1
        assert models[1].order == 2
        assert models[2].order == 3

    def test_default_registry_singleton(self):
        """Default registry should be a global singleton."""
        from app.services.export_registry import default_registry

        @exportable(order=1)
        class SingletonTest:
            pass

        assert default_registry.get_model(SingletonTest) is not None
