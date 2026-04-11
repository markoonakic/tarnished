import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "release.yml"


class ReleaseWorkflowTests(unittest.TestCase):
    def test_release_workflow_ensures_github_release_exists_before_edit_and_upload(self) -> None:
        content = WORKFLOW_PATH.read_text()

        self.assertIn('gh release edit "$TAG"', content)
        self.assertIn('gh release upload "$TAG"', content)
        self.assertIn(
            'gh release create "$TAG"',
            content,
            "release workflow should create the GitHub release when it does not exist",
        )


if __name__ == "__main__":
    unittest.main()
