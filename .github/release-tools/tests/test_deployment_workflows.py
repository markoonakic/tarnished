import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
CI_WORKFLOW_PATH = ROOT / ".github" / "workflows" / "ci.yml"
RELEASE_WORKFLOW_PATH = ROOT / ".github" / "workflows" / "release.yml"


class DeploymentWorkflowTests(unittest.TestCase):
    def test_ci_workflow_validates_deployment_surfaces(self) -> None:
        content = CI_WORKFLOW_PATH.read_text()

        self.assertIn("docker compose -f deploy/compose/docker-compose.yml config", content)
        self.assertIn("docker compose -f deploy/compose/docker-compose.postgres.yml config", content)
        self.assertIn("docker build -t tarnished:ci .", content)
        self.assertIn("helm lint deploy/helm/tarnished", content)
        self.assertIn("helm template tarnished ./deploy/helm/tarnished", content)

    def test_release_workflow_gates_publish_steps_on_deployment_checks(self) -> None:
        content = RELEASE_WORKFLOW_PATH.read_text()

        self.assertIn("deployment-checks:", content)
        self.assertIn("docker compose -f deploy/compose/docker-compose.yml config", content)
        self.assertIn("docker compose -f deploy/compose/docker-compose.postgres.yml config", content)
        self.assertIn("docker build -t tarnished:release-check .", content)
        self.assertIn("needs: [release-meta, backend-checks, frontend-checks, deployment-checks, github-release-notes]", content)
        self.assertIn("needs: [release-meta, backend-checks, frontend-checks, deployment-checks, docker, github-release-notes]", content)


if __name__ == "__main__":
    unittest.main()
