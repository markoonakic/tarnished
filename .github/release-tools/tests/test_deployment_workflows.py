import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]


class DeploymentWorkflowTests(unittest.TestCase):
    def test_ci_checks_both_databases_and_deployment_surfaces(self) -> None:
        content = (ROOT / ".github/workflows/ci.yml").read_text()
        for command in (
            "database: [sqlite, postgresql]",
            "docker compose -f deploy/compose/docker-compose.yml config",
            "docker compose -f deploy/compose/docker-compose.postgres.yml config",
            "docker build -t tarnished:ci .",
            "helm lint deploy/helm/tarnished",
            "helm template tarnished ./deploy/helm/tarnished",
            "yarn build:all",
            "yarn typecheck",
        ):
            with self.subTest(command=command):
                self.assertIn(command, content)

    def test_release_reuses_ci_before_publication(self) -> None:
        content = (ROOT / ".github/workflows/release.yml").read_text()
        self.assertIn("uses: ./.github/workflows/ci.yml", content)
        self.assertIn("needs: [release-meta, checks]", content)
        self.assertIn("check_versions.py", content)
        self.assertIn("needs.docker.result == 'skipped'", content)
        self.assertIn("needs.github-release-notes.result == 'success'", content)


if __name__ == "__main__":
    unittest.main()
