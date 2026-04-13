import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "docs.yml"
MKDOCS_CONFIG_PATH = ROOT / "documentation" / "mkdocs.yml"


class DocsWorkflowTests(unittest.TestCase):
    def test_docs_workflow_builds_documentation_from_documentation_directory(self) -> None:
        content = WORKFLOW_PATH.read_text()

        self.assertIn("uv sync --project documentation --frozen --no-install-project", content)
        self.assertIn("documentation/.venv/bin/mkdocs build --strict -f documentation/mkdocs.yml", content)
        self.assertIn("actions/configure-pages@", content)
        self.assertIn("actions/upload-pages-artifact@", content)
        self.assertIn("actions/deploy-pages@", content)
        self.assertIn("lycheeverse/lychee-action@", content)
        self.assertIn("path: documentation/site", content)

    def test_mkdocs_config_uses_isolated_content_root(self) -> None:
        content = MKDOCS_CONFIG_PATH.read_text()

        self.assertIn("docs_dir: src", content)
        self.assertIn("site_dir: site", content)
        self.assertIn("edit_uri: edit/main/documentation/src/", content)


if __name__ == "__main__":
    unittest.main()
