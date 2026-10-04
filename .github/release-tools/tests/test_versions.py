import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "check_versions", ROOT / ".github/release-tools/check_versions.py"
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class VersionTests(unittest.TestCase):
    def test_current_release_versions_match(self) -> None:
        MODULE.check_versions(ROOT, "0.2.2")

    def test_mismatched_version_and_missing_notes_fail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "CHANGELOG.md").write_text("# Changelog\n")
            with patch.object(
                MODULE, "component_versions", return_value={"cli": "0.1.7"}
            ):
                with self.assertRaisesRegex(ValueError, "cli: 0.1.7 != 0.2.2") as error:
                    MODULE.check_versions(root, "0.2.2")
                self.assertIn("Missing changelog entry", str(error.exception))


if __name__ == "__main__":
    unittest.main()
