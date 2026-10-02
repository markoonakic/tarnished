import pathlib
import shutil
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]


def render(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["helm", "template", "tarnished", str(ROOT / "deploy/helm/tarnished"), *args],
        capture_output=True,
        text=True,
        check=False,
    )


@unittest.skipUnless(shutil.which("helm"), "helm is not installed")
class ChartEnvironmentTests(unittest.TestCase):
    def test_environment_sources_reach_migrations_and_application(self) -> None:
        result = render("--set", "envFrom[0].secretRef.name=deployment-environment")
        result.check_returncode()
        self.assertEqual(result.stdout.count("name: deployment-environment"), 2)

    def test_cleanup_keeps_image_path_and_uses_database_secret(self) -> None:
        result = render(
            "--set",
            "cleanup.enabled=true",
            "--set",
            "postgresql.enabled=true",
            "--set",
            "postgresql.host=postgres.example.test",
            "--set",
            "postgresql.password=chart-test-password",
        )
        result.check_returncode()
        self.assertIn("- -c", result.stdout)
        self.assertNotIn("- -lc", result.stdout)
        self.assertEqual(result.stdout.count("name: tarnished-postgresql"), 4)

    def test_cleanup_rejects_clusters_without_cronjob_time_zones(self) -> None:
        result = render("--kube-version", "1.26.0", "--set", "cleanup.enabled=true")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires Kubernetes 1.27 or newer", result.stderr)


if __name__ == "__main__":
    unittest.main()
