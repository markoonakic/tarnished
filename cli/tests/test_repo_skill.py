import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_PATH = REPO_ROOT / "cli" / "skills" / "tarnished-cli"
SKILL_MD = SKILL_PATH / "SKILL.md"
ANTHROPIC_QUICK_VALIDATE = (
    Path.home()
    / ".codex"
    / "skills"
    / "anthropic-skill-creator"
    / "scripts"
    / "quick_validate.py"
)


def test_repo_ships_tarnished_cli_skill():
    assert SKILL_MD.exists()


def test_tarnished_skill_passes_anthropic_quick_validate():
    if ANTHROPIC_QUICK_VALIDATE.exists():
        result = subprocess.run(
            [
                "uv",
                "run",
                "--with",
                "pyyaml",
                "python3",
                str(ANTHROPIC_QUICK_VALIDATE),
                str(SKILL_PATH),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode == 0, result.stdout + result.stderr
        assert "Skill is valid!" in result.stdout
        return

    content = SKILL_MD.read_text()
    assert content.startswith("---")
    _, frontmatter_text, _ = content.split("---", 2)
    assert "name: tarnished-cli" in frontmatter_text
    assert "description:" in frontmatter_text


def test_tarnished_skill_mentions_json_profiles_and_admin_safety():
    content = SKILL_MD.read_text()

    assert "prefer `--json`" in content
    assert "prefer explicit `--profile`" in content
    assert "admin" in content.lower()
    assert "Use only when you need privileged access." in content
