import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_DIR = ROOT / ".github" / "workflows"
USES_PATTERN = re.compile(r"^-?\s*uses:\s+[^@\s]+@[0-9a-f]{40}\s*$")


class WorkflowActionPinningTests(unittest.TestCase):
    def test_external_actions_are_pinned_to_full_shas(self) -> None:
        for workflow_path in sorted(WORKFLOW_DIR.glob("*.yml")):
            with self.subTest(workflow=workflow_path.name):
                for line in workflow_path.read_text().splitlines():
                    stripped = line.strip()
                    if not stripped.startswith("uses:") and not stripped.startswith("- uses:"):
                        continue
                    self.assertRegex(
                        stripped,
                        USES_PATTERN,
                        f"workflow line is not pinned to a full SHA: {workflow_path.name}: {stripped}",
                    )


if __name__ == "__main__":
    unittest.main()
