import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "package_browser", ROOT / "scripts" / "package-browser.py"
)
package_browser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package_browser)


class BrowserPackagingTests(unittest.TestCase):
    def setUp(self):
        self.source = json.loads((ROOT / "src" / "manifest.json").read_text())

    def test_version_matches_package(self):
        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual(self.source["version"], package["version"])

    def test_browser_manifests_do_not_modify_the_source(self):
        original = json.loads(json.dumps(self.source))
        chrome = package_browser.manifest_for("chrome", self.source)
        firefox = package_browser.manifest_for("firefox", self.source)
        self.assertEqual(self.source, original)
        self.assertEqual(
            chrome["background"],
            {
                "service_worker": "background/index.js",
                "type": "module",
            },
        )
        self.assertNotIn("browser_specific_settings", chrome)
        self.assertEqual(
            firefox["background"],
            {
                "scripts": ["background/index.js"],
                "type": "module",
            },
        )
        self.assertIn("gecko", firefox["browser_specific_settings"])

    def test_missing_background_entries_fail(self):
        for browser in ("chrome", "firefox"):
            with self.subTest(browser=browser), self.assertRaises(SystemExit):
                package_browser.manifest_for(browser, {"background": {}})

    def test_archives_are_reproducible_and_preserve_build_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / "dist"
            dist.mkdir()
            source = json.dumps(self.source).encode()
            (dist / "manifest.json").write_bytes(source)
            (dist / "background").mkdir()
            (dist / "background" / "index.js").write_text("// background\n")
            with patch.object(package_browser, "DIST", dist):
                for browser in ("chrome", "firefox"):
                    with self.subTest(browser=browser):
                        output = root / f"{browser}.zip"
                        package_browser.package(browser, output)
                        original = output.read_bytes()
                        package_browser.package(browser, output)
                        self.assertEqual(output.read_bytes(), original)
                        with zipfile.ZipFile(output) as archive:
                            self.assertEqual(
                                archive.read("background/index.js"), b"// background\n"
                            )
                            manifest = json.loads(archive.read("manifest.json"))
                            self.assertEqual(
                                manifest,
                                package_browser.manifest_for(browser, self.source),
                            )
                        self.assertEqual((dist / "manifest.json").read_bytes(), source)


if __name__ == "__main__":
    unittest.main()
