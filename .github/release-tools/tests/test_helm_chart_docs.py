import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
CHART_PATH = ROOT / "deploy" / "helm" / "tarnished" / "Chart.yaml"
README_PATH = ROOT / "deploy" / "helm" / "tarnished" / "README.md"
README_TEMPLATE_PATH = ROOT / "deploy" / "helm" / "tarnished" / "README.md.gotmpl"
VALUES_SCHEMA_PATH = ROOT / "deploy" / "helm" / "tarnished" / "values.schema.json"
HELM_REFERENCE_PATH = ROOT / "documentation" / "content" / "reference" / "helm-chart-reference.md"


class HelmChartDocsTests(unittest.TestCase):
    def test_chart_metadata_is_artifact_hub_ready(self) -> None:
        chart = CHART_PATH.read_text()

        self.assertIn("apiVersion: v2", chart)
        self.assertIn("type: application", chart)
        self.assertIn("kubeVersion:", chart)
        self.assertIn("icon:", chart)
        self.assertIn("maintainers:", chart)
        self.assertIn("artifacthub.io/license: MIT", chart)
        self.assertIn("artifacthub.io/links:", chart)
        self.assertIn("artifacthub.io/images:", chart)

    def test_chart_readme_has_generation_source_and_operator_sections(self) -> None:
        readme = README_PATH.read_text()

        self.assertTrue(README_TEMPLATE_PATH.exists())
        self.assertIn("Generated from README.md.gotmpl by helm-docs.", readme)
        self.assertIn("## TL;DR", readme)
        self.assertIn("## Install modes", readme)
        self.assertIn("## Secrets", readme)
        self.assertIn("## Persistence and data layout", readme)
        self.assertIn("## Upgrading", readme)
        self.assertIn("## Values", readme)

    def test_values_schema_includes_descriptions_for_core_sections(self) -> None:
        schema = json.loads(VALUES_SCHEMA_PATH.read_text())
        props = schema["properties"]

        self.assertIn("description", props["persistence"])
        self.assertIn("description", props["postgresql"])
        self.assertIn("description", props["secretKey"])
        self.assertIn("description", props["cleanup"])
        self.assertIn("description", props["livenessProbe"])
        self.assertIn("description", props["readinessProbe"])
        self.assertIn("description", props["startupProbe"])

    def test_docs_site_includes_helm_reference_page(self) -> None:
        content = HELM_REFERENCE_PATH.read_text()

        self.assertIn("Source-of-truth files", content)
        self.assertIn("Generated chart README", content)
        self.assertIn("Install with Helm", content)


if __name__ == "__main__":
    unittest.main()
