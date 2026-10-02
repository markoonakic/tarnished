#!/usr/bin/env python3
"""Install and verify pinned speech models in a dedicated cache.

Pull the service image separately. Failed downloads remain available for inspection.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = "ghcr.io/speaches-ai/speaches@sha256:c26e287cbfbd77d7035f80a297f3695f8d33c797c894e4555cc258f5a4a5dd07"

# Curated selection. Hashes are git-blob sha1 for plain files and sha256 for the
# LFS model.bin, matching what the pinned revision actually stores.
MODELS = {
    "Systran/faster-whisper-tiny.en": {
        "revision": "0d3d19a32d3338f10357c0889762bd8d64bbdeba",
        "repository": "models--Systran--faster-whisper-tiny.en",
        "manifest": {
            ".gitattributes": (1477, "c7d9f3332a950355d5a77d85000f05e6f45435ea"),
            "README.md": (1323, "274935f9e69738f32b157a5572d8940122d27417"),
            "config.json": (2317, "4065bb3bed375b176d5465be117d2d202e210434"),
            "model.bin": (
                75537502,
                "1a5afae06a4db91c975c9a9d78be5cc110ee4ea022ad57d55492e4550e936b2a",
            ),
            "tokenizer.json": (2128466, "15d7bdf9ba25718ca2504eec6a8f02bc55af0a6a"),
            "vocabulary.txt": (422309, "ee695b8d3e3c10d488304e04468efec4ca27554a"),
        },
    },
    "Systran/faster-whisper-base.en": {
        "revision": "3d3d5dee26484f91867d81cb899cfcf72b96be6c",
        "repository": "models--Systran--faster-whisper-base.en",
        "manifest": {
            ".gitattributes": (1477, "c7d9f3332a950355d5a77d85000f05e6f45435ea"),
            "README.md": (1323, "9ee8023dc11d4d835bd6bf2e0a88dc9a2b652e6b"),
            "config.json": (2227, "594369787efe617005d199b03739ee0ead7e3ab7"),
            "model.bin": (
                145216508,
                "2a166925539a16005f14ff328359f9b9adb9dc4fb631bb3b227526862e93e2ef",
            ),
            "tokenizer.json": (2128466, "15d7bdf9ba25718ca2504eec6a8f02bc55af0a6a"),
            "vocabulary.txt": (422309, "ee695b8d3e3c10d488304e04468efec4ca27554a"),
        },
    },
}
DEFAULT_MODEL = "Systran/faster-whisper-tiny.en"
REPOSITORIES = frozenset(spec["repository"] for spec in MODELS.values())

# VAD assets included in the pinned image.
VAD_ASSETS = {
    "silero_encoder_v5.onnx": (
        713415,
        "0e9fc8f56407693d283f99045fb95c2b90fdca3433ce5f83e2c121fb4e615075",
    ),
    "silero_decoder_v5.onnx": (
        532505,
        "8c20344f509846a07ccd85827e8857017fae67fabd58689bec1af79e1d488307",
    ),
}

REVISION = MODELS[DEFAULT_MODEL]["revision"]


def verify_model(cache: Path, model: str, *, initialize: bool = False) -> dict:
    """Verify one curated snapshot and its private main reference."""
    spec = MODELS[model]
    repository = cache / spec["repository"]
    snapshots = repository / "snapshots"
    if {p.name for p in snapshots.iterdir()} != {spec["revision"]}:
        raise ValueError("Unexpected snapshot revision")
    snapshot = snapshots / spec["revision"]
    manifest = spec["manifest"]
    if {p.name for p in snapshot.iterdir()} != set(manifest):
        raise ValueError("Snapshot file manifest differs")
    for name, (size, digest) in manifest.items():
        path = snapshot / name
        if (
            not path.resolve(strict=True).is_relative_to(cache)
            or path.stat().st_size != size
        ):
            raise ValueError("Model file location/size differs: " + name)
        hasher = hashlib.sha256() if name == "model.bin" else hashlib.sha1()
        if name != "model.bin":
            hasher.update(f"blob {size}\0".encode())
        with path.open("rb") as file:
            for block in iter(lambda: file.read(1024 * 1024), b""):
                hasher.update(block)
        if hasher.hexdigest() != digest:
            raise ValueError("Model file hash differs: " + name)
    refs = repository / "refs"
    if refs.is_symlink() or (
        refs.exists() and {p.name for p in refs.iterdir()} - {"main"}
    ):
        raise ValueError("Unexpected cache references")
    main = refs / "main"
    if main.is_symlink():
        raise ValueError("Ref must be a plain file")
    if main.exists():
        if main.read_bytes() != spec["revision"].encode():
            raise ValueError("Unexpected main reference; refusing overwrite")
    elif initialize:
        refs.mkdir(exist_ok=True)
        with main.open("xb") as file:
            file.write(spec["revision"].encode())  # Exactly 40 bytes, no newline.
    else:
        raise ValueError("Verified main reference missing")
    return {
        "model": model,
        "revision": spec["revision"],
        "snapshot_bytes": sum(v[0] for v in manifest.values()),
        "status": "installed_unvalidated",
    }


def verify_cache(cache: Path) -> list[dict]:
    """Verify every curated repository already present in the dedicated cache."""
    cache = cache.resolve(strict=True)
    present = {p.name for p in cache.glob("models--*")}
    unexpected = present - REPOSITORIES
    if unexpected:
        raise ValueError(
            "Unexpected repository in dedicated cache: " + ", ".join(sorted(unexpected))
        )
    if not present:
        raise ValueError("No curated model repository found in cache")
    return [
        verify_model(cache, model)
        for model, spec in MODELS.items()
        if spec["repository"] in present
    ]


def image_runtime_identity() -> tuple[int, int]:
    """Resolve the uid/gid the pinned service actually runs as."""
    output = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--pull=never",
            "--entrypoint",
            "sh",
            IMAGE,
            "-c",
            "id -u; id -g",
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.split()
    if len(output) != 2 or not all(part.isdigit() for part in output):
        raise ValueError("Cannot resolve the pinned image runtime identity")
    return int(output[0]), int(output[1])


def verify_vad_assets() -> dict:
    """Verify the image-installed VAD assets."""
    from importlib.metadata import distribution

    package = distribution("faster-whisper")
    assets = {}
    for name, (size, digest) in VAD_ASSETS.items():
        path = package.locate_file("faster_whisper/assets/" + name)
        if not path.is_file():
            raise ValueError("Image-installed VAD asset missing: " + name)
        data = path.read_bytes()
        if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
            raise ValueError("Image-installed VAD asset differs: " + name)
        assets[name] = {"bytes": size, "sha256": digest}
    return assets


def prepare_cache(cache: Path, identity: tuple[int, int]) -> None:
    """Create the dedicated cache so the pinned service identity can read it.

    The service runs as the image uid. A cache owned by a different non-root
    operator would be unreadable by the service even though verification passes.
    """
    image_uid, image_gid = identity
    host_uid = os.getuid()
    if host_uid == image_uid:
        cache.mkdir(mode=0o700)
        return
    if host_uid == 0:
        cache.mkdir(mode=0o750)
        os.chown(cache, image_uid, image_gid)
        return
    raise PermissionError(
        "The pinned service runs as uid "
        + str(image_uid)
        + ", but setup runs as uid "
        + str(host_uid)
        + ". A cache created here would be unreadable by the service. "
        "Run setup as uid "
        + str(image_uid)
        + ", or as root so this dedicated cache can be aligned. No cache was created."
    )


def download_in_image(cache: Path, models: list[str]) -> None:
    # This branch is explicitly online provisioning, never the service startup path.
    from importlib.metadata import version

    from huggingface_hub import snapshot_download

    versions = {
        name: version(name)
        for name in ("speaches", "faster-whisper", "huggingface-hub")
    }
    if versions["faster-whisper"] != "1.1.1" or versions["huggingface-hub"] != "0.35.3":
        raise ValueError("Installed dependency versions differ from source contract")
    vad_assets = verify_vad_assets()
    receipts = []
    for model in models:
        spec = MODELS[model]
        snapshot = snapshot_download(
            repo_id=model,
            revision=spec["revision"],
            cache_dir=str(cache),
            token=False,
            max_workers=1,
        )
        if (
            Path(snapshot)
            != cache / spec["repository"] / "snapshots" / spec["revision"]
        ):
            raise ValueError("Unexpected returned snapshot path")
        receipts.append(verify_model(cache, model, initialize=True))
    print(
        json.dumps(
            {
                "image": IMAGE,
                "installed_versions": versions,
                "vad_assets": vad_assets,
                "models": receipts,
            },
            indent=2,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        required=True,
        type=Path,
        help="NEW dedicated absolute hub-cache directory (not application data)",
    )
    parser.add_argument(
        "--model",
        action="append",
        choices=sorted(MODELS),
        default=None,
        help="Curated model to install; repeatable. Default: " + DEFAULT_MODEL,
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Offline full integrity check of every curated model present, no Docker/network",
    )
    parser.add_argument("--inside-image", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    cache = args.cache
    if not cache.is_absolute() or "," in str(cache):
        parser.error("Cache must be an absolute path without commas")
    if args.verify:
        print(json.dumps(verify_cache(cache), indent=2))
        return
    if args.inside_image:
        download_in_image(cache, args.model or [DEFAULT_MODEL])
        return
    requested = args.model or [DEFAULT_MODEL]
    # Refuse implicit pull and reject ANY existing cache before contacting HF.
    subprocess.run(
        ["docker", "image", "inspect", IMAGE], check=True, stdout=subprocess.DEVNULL
    )
    identity = image_runtime_identity()
    if cache.exists() or cache.is_symlink():
        # An existing cache may only receive another curated model when every
        # snapshot already there is complete. Partial state needs operator review.
        verify_cache(cache)
        for model in requested:
            spec = MODELS[model]
            if not (cache / spec["repository"]).is_dir():
                continue
            verify_model(cache, model)
    else:
        if (
            not cache.parent.is_dir()
            or shutil.disk_usage(cache.parent).free < 5 * 1024**3
        ):
            parser.error("Existing cache parent with at least 5 GiB free is required")
        prepare_cache(cache, identity)
    image_uid, image_gid = identity
    subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--pull=never",
            "--platform=linux/amd64",
            "--memory=4g",
            "--cpus=4",
            "--pids-limit=256",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--user",
            f"{image_uid}:{image_gid}",
            "--entrypoint=python",
            "-e",
            "HOME=/tmp",
            "-e",
            "HF_HUB_DISABLE_TELEMETRY=1",
            "-e",
            "HF_HUB_DISABLE_IMPLICIT_TOKEN=1",
            "-e",
            "HF_HUB_DISABLE_XET=1",
            "--mount",
            f"type=bind,source={cache},target=/cache",
            "--mount",
            f"type=bind,source={Path(__file__).resolve()},target=/setup.py,readonly",
            IMAGE,
            "/setup.py",
            "--inside-image",
            "--cache=/cache",
            *[item for model in requested for item in ("--model", model)],
        ],
        check=True,
    )
    print(json.dumps([verify_model(cache, model) for model in requested], indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(
            f"Local setup stopped: {error}. Retain partial cache for inspection; do not automatically retry.",
            file=sys.stderr,
        )
        sys.exit(1)
