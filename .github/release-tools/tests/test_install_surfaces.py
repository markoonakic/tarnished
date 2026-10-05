import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
COMPOSE = ROOT / "deploy/compose"


class InstallSurfaceTests(unittest.TestCase):
    def test_compose_uses_pinned_images_and_private_ports(self) -> None:
        for name in ("docker-compose.yml", "docker-compose.postgres.yml"):
            with self.subTest(file=name):
                content = (COMPOSE / name).read_text()
                self.assertIn(
                    "image: ${TARNISHED_IMAGE:-ghcr.io/markoonakic/tarnished:0.2.3}",
                    content,
                )
                self.assertIn("${APP_PORT:-127.0.0.1:5577}:5577", content)
                self.assertIn("condition: service_completed_successfully", content)
                self.assertIn("chown -R 1000:1000 /app/data", content)
                self.assertNotIn("build: .", content)

    def test_quickstart_uses_compose_without_manual_storage_preparation(self) -> None:
        for path in (
            ROOT / "README.md",
            ROOT / "documentation/content/install/docker-compose.md",
        ):
            with self.subTest(file=path.name):
                content = path.read_text()
                self.assertIn("docker compose up -d", content)
                self.assertIn("v0.2.3/deploy/compose/docker-compose.yml", content)
                self.assertNotIn("chown -R", content)
                self.assertNotIn("demo-data", content)
                self.assertIn("create the first admin account in the browser", content)
                self.assertNotIn("manage bootstrap-owner", content)

    def test_image_includes_project_license(self) -> None:
        dockerfile = (ROOT / "Dockerfile").read_text()
        dockerignore = (ROOT / ".dockerignore").read_text()
        self.assertIn(
            "COPY --chown=appuser:appuser entrypoint.sh LICENSE ./", dockerfile
        )
        self.assertIn("!LICENSE\n", dockerignore)

    def test_postgres_waits_for_database_health(self) -> None:
        content = (COMPOSE / "docker-compose.postgres.yml").read_text()
        self.assertIn("condition: service_healthy", content)
        self.assertIn("pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB", content)


if __name__ == "__main__":
    unittest.main()
