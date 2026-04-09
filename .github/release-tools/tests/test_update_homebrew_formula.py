import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / ".github" / "release-tools" / "update_homebrew_formula.py"


def load_module():
    spec = importlib.util.spec_from_file_location(
        "update_homebrew_formula", MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module from {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class UpdateFormulaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_select_sdist_release_file(self) -> None:
        release_files = [
            {
                "packagetype": "bdist_wheel",
                "filename": "tarnished_cli-0.1.4-py3-none-any.whl",
                "url": "https://example.invalid/tarnished_cli-0.1.4-py3-none-any.whl",
                "digests": {"sha256": "wheel-sha"},
            },
            {
                "packagetype": "sdist",
                "filename": "tarnished_cli-0.1.4.tar.gz",
                "url": "https://example.invalid/tarnished_cli-0.1.4.tar.gz",
                "digests": {"sha256": "sdist-sha"},
            },
        ]

        selected = self.module.select_sdist_release_file(release_files)

        self.assertEqual(selected["url"], "https://example.invalid/tarnished_cli-0.1.4.tar.gz")
        self.assertEqual(selected["digests"]["sha256"], "sdist-sha")

    def test_update_formula_content_only_rewrites_primary_release_artifact(self) -> None:
        original = """class TarnishedCli < Formula
  include Language::Python::Virtualenv

  desc "Agent-first CLI for Tarnished"
  homepage "https://github.com/markoonakic/tarnished"
  url "https://files.pythonhosted.org/packages/old/tarnished_cli-0.1.3.tar.gz"
  sha256 "old-primary-sha"
  license "MIT"

  resource "click" do
    url "https://files.pythonhosted.org/packages/click-8.3.0.tar.gz"
    sha256 "resource-sha"
  end
end
"""

        updated = self.module.update_formula_content(
            original,
            new_url="https://files.pythonhosted.org/packages/new/tarnished_cli-0.1.4.tar.gz",
            new_sha256="new-primary-sha",
        )

        self.assertIn(
            'url "https://files.pythonhosted.org/packages/new/tarnished_cli-0.1.4.tar.gz"',
            updated,
        )
        self.assertIn('sha256 "new-primary-sha"', updated)
        self.assertIn(
            'url "https://files.pythonhosted.org/packages/click-8.3.0.tar.gz"',
            updated,
        )
        self.assertIn('sha256 "resource-sha"', updated)
        self.assertEqual(updated.count('url "https://files.pythonhosted.org/packages/new/tarnished_cli-0.1.4.tar.gz"'), 1)
        self.assertEqual(updated.count('sha256 "new-primary-sha"'), 1)

    def test_update_formula_content_requires_primary_url_and_sha(self) -> None:
        with self.assertRaisesRegex(ValueError, "primary formula url"):
            self.module.update_formula_content(
                'class TarnishedCli < Formula\n  sha256 "only-sha"\nend\n',
                new_url="https://example.invalid/pkg.tar.gz",
                new_sha256="new-sha",
            )

        with self.assertRaisesRegex(ValueError, "primary formula sha256"):
            self.module.update_formula_content(
                'class TarnishedCli < Formula\n  url "https://example.invalid/pkg.tar.gz"\nend\n',
                new_url="https://example.invalid/pkg.tar.gz",
                new_sha256="new-sha",
            )


if __name__ == "__main__":
    unittest.main()
