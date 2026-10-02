from pathlib import Path
from tempfile import TemporaryDirectory


def write_private_file(path: Path, content: bytes) -> None:
    """Replace a file only after its complete content has private permissions."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=path.parent, prefix=".tarnished-") as directory:
        temporary = Path(directory) / "file"
        temporary.write_bytes(content)
        temporary.chmod(0o600)
        temporary.replace(path)
