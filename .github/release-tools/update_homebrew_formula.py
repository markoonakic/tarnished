#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
from typing import Any


PYPI_RELEASE_URL_TEMPLATE = "https://pypi.org/pypi/{package}/{version}/json"


def fetch_release_files(package_name: str, version: str) -> list[dict[str, Any]]:
    url = PYPI_RELEASE_URL_TEMPLATE.format(package=package_name, version=version)
    try:
        with urllib.request.urlopen(url) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"Failed to fetch PyPI release metadata for {package_name}=={version}: HTTP {exc.code}"
        ) from exc
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Failed to fetch PyPI release metadata for {package_name}=={version}: {exc.reason}"
        ) from exc

    urls = payload.get("urls")
    if not isinstance(urls, list):
        raise SystemExit(
            f"PyPI metadata for {package_name}=={version} did not include release files"
        )

    return urls


def select_sdist_release_file(release_files: list[dict[str, Any]]) -> dict[str, Any]:
    for release_file in release_files:
        if release_file.get("packagetype") == "sdist":
            digests = release_file.get("digests")
            if not isinstance(digests, dict) or not digests.get("sha256"):
                raise ValueError("selected sdist release file is missing a sha256 digest")
            if not release_file.get("url"):
                raise ValueError("selected sdist release file is missing a url")
            return release_file

    raise ValueError("no sdist release file found in PyPI release metadata")


def update_formula_content(formula_text: str, *, new_url: str, new_sha256: str) -> str:
    updated_text, url_count = re.subn(
        r'(?m)^(\s*url\s+)"[^"]+"$',
        rf'\1"{new_url}"',
        formula_text,
        count=1,
    )
    if url_count != 1:
        raise ValueError("failed to update primary formula url")

    updated_text, sha_count = re.subn(
        r'(?m)^(\s*sha256\s+)"[^"]+"$',
        rf'\1"{new_sha256}"',
        updated_text,
        count=1,
    )
    if sha_count != 1:
        raise ValueError("failed to update primary formula sha256")

    return updated_text


def update_formula_file(formula_path: pathlib.Path, *, package_name: str, version: str) -> None:
    release_file = select_sdist_release_file(fetch_release_files(package_name, version))
    formula_text = formula_path.read_text()
    updated_text = update_formula_content(
        formula_text,
        new_url=release_file["url"],
        new_sha256=release_file["digests"]["sha256"],
    )
    formula_path.write_text(updated_text)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Update the primary Tarnished Homebrew formula release artifact from PyPI metadata."
    )
    parser.add_argument("--formula", required=True, help="Path to Formula/tarnished-cli.rb")
    parser.add_argument("--package", required=True, help="PyPI package name")
    parser.add_argument("--version", required=True, help="Package version without leading v")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    formula_path = pathlib.Path(args.formula).resolve()
    update_formula_file(formula_path, package_name=args.package, version=args.version)
    print(f"Updated {formula_path} from PyPI metadata for {args.package}=={args.version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
