import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "docs.yml"
DOCUSAURUS_CONFIG_PATH = ROOT / "documentation" / "docusaurus.config.ts"


class DocsWorkflowTests(unittest.TestCase):
    def test_docs_workflow_builds_docusaurus_site_from_documentation_directory(self) -> None:
        content = WORKFLOW_PATH.read_text()

        self.assertIn("yarn install --immutable", content)
        self.assertIn("yarn typecheck", content)
        self.assertIn("yarn build", content)
        self.assertIn("actions/setup-node@", content)
        self.assertIn("actions/configure-pages@", content)
        self.assertIn("actions/upload-pages-artifact@", content)
        self.assertIn("actions/deploy-pages@", content)
        self.assertIn("lycheeverse/lychee-action@", content)
        self.assertIn("path: documentation/build", content)
        self.assertIn("documentation/content", content)

    def test_docusaurus_config_uses_custom_content_root(self) -> None:
        content = DOCUSAURUS_CONFIG_PATH.read_text()

        self.assertIn("path: 'content'", content)
        self.assertIn("routeBasePath: '/'", content)
        self.assertIn("baseUrl: '/tarnished/'", content)
        self.assertIn("editUrl: 'https://github.com/markoonakic/tarnished/edit/main/documentation/'", content)


if __name__ == "__main__":
    unittest.main()
