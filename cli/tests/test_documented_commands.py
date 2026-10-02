import shlex
from pathlib import Path

import typer

from tarnished_cli.main import app

CLI_DOC = (
    Path(__file__).resolve().parents[2]
    / "documentation"
    / "content"
    / "how-to"
    / "use-the-cli.md"
)


def _registered_paths() -> set[tuple[str, ...]]:
    paths: set[tuple[str, ...]] = set()

    def walk(command: typer.Typer, prefix: tuple[str, ...]) -> None:
        for info in command.registered_commands:
            name = info.name or (info.callback.__name__ if info.callback else None)
            if name:
                paths.add(prefix + (name.replace("_", "-"),))
        for info in command.registered_groups:
            sub = info.typer_instance
            name = info.name or (sub.info.name if sub and sub.info else None)
            if sub is not None and name:
                walk(sub, prefix + (name,))

    walk(app, ())
    return paths


def test_documented_commands_exist_in_the_registry():
    registered = _registered_paths()
    examples = [
        line
        for line in CLI_DOC.read_text().splitlines()
        if line.startswith("tarnished ")
    ]
    assert examples
    for example in examples:
        tokens = shlex.split(example)[1:]
        while tokens and tokens[0].startswith("--"):
            option = tokens.pop(0)
            if option in {"--profile", "--base-url", "--config-dir"}:
                tokens.pop(0)
        assert any(tuple(tokens[: len(path)]) == path for path in registered), example
