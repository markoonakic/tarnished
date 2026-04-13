import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
README_PATH = ROOT / "README.md"
DOTENV_PATH = ROOT / ".env.example"
COMPOSE_SQLITE_PATH = ROOT / "deploy" / "compose" / "docker-compose.yml"
COMPOSE_POSTGRES_PATH = ROOT / "deploy" / "compose" / "docker-compose.postgres.yml"
QUICKSTART_PATH = ROOT / "documentation" / "content" / "getting-started" / "quickstart-docker-compose.md"


class InstallSurfaceTests(unittest.TestCase):
    def test_public_compose_files_use_published_images_not_source_builds(self) -> None:
        sqlite_content = COMPOSE_SQLITE_PATH.read_text()
        postgres_content = COMPOSE_POSTGRES_PATH.read_text()

        expected = "image: ${TARNISHED_IMAGE:-ghcr.io/markoonakic/tarnished:latest}"
        self.assertIn(expected, sqlite_content)
        self.assertIn(expected, postgres_content)
        self.assertNotIn("build: .", sqlite_content)
        self.assertNotIn("build: .", postgres_content)

    def test_public_install_docs_describe_published_image_flow(self) -> None:
        readme = README_PATH.read_text()
        quickstart = QUICKSTART_PATH.read_text()
        dotenv = DOTENV_PATH.read_text()

        self.assertIn("published Tarnished container image", readme)
        self.assertIn("published Tarnished image", quickstart)
        self.assertIn("TARNISHED_IMAGE", quickstart)
        self.assertIn("TARNISHED_IMAGE", dotenv)
        self.assertNotIn("local app build from this repository", quickstart)
        self.assertNotIn("docker compose up -d --build", quickstart)
        self.assertNotIn("git clone https://github.com/markoonakic/tarnished.git", readme)
        self.assertNotIn("git clone https://github.com/markoonakic/tarnished.git", quickstart)


if __name__ == "__main__":
    unittest.main()
