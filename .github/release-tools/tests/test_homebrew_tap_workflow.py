import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "homebrew-tap.yml"
RELEASE_WORKFLOW_PATH = ROOT / ".github" / "workflows" / "release.yml"


class HomebrewTapWorkflowTests(unittest.TestCase):
    def test_homebrew_tap_sync_runs_separately_from_release_workflow(self) -> None:
        release_content = RELEASE_WORKFLOW_PATH.read_text()
        tap_content = WORKFLOW_PATH.read_text()

        self.assertNotIn("tap-update:", release_content)
        self.assertIn("name: Homebrew Tap Sync", tap_content)
        self.assertIn("workflow_dispatch:", tap_content)
        self.assertIn("schedule:", tap_content)
        self.assertIn("brew update-python-resources", tap_content)
        self.assertIn("uploaded_at", tap_content)
        self.assertIn("should_update", tap_content)
        self.assertIn("24 hours", tap_content)


if __name__ == "__main__":
    unittest.main()
