#!/usr/bin/env python3
"""Package dist/ with a browser-specific manifest, without changing the build."""

from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def manifest_for(browser: str, source: dict) -> dict:
    manifest = json.loads(json.dumps(source))
    background = dict(manifest.get("background") or {})

    if browser == "firefox":
        # Firefox uses a module event page instead of a service worker.
        scripts = background.get("scripts")
        if not scripts:
            raise SystemExit("manifest.background.scripts is required for Firefox")
        manifest["background"] = {"scripts": scripts, "type": "module"}
    else:
        worker = background.get("service_worker")
        if not worker:
            raise SystemExit(
                "manifest.background.service_worker is required for Chrome"
            )
        manifest["background"] = {"service_worker": worker, "type": "module"}
        manifest.pop("browser_specific_settings", None)

    return manifest


def package(browser: str, output: Path) -> dict:
    source = json.loads((DIST / "manifest.json").read_text())
    manifest = manifest_for(browser, source)

    # Fixed member order and timestamps make identical builds reproducible.
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(DIST.rglob("*")):
            if path.is_dir():
                continue
            relative = path.relative_to(DIST).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            if relative == "manifest.json":
                archive.writestr(info, json.dumps(manifest, indent=2) + "\n")
            else:
                archive.writestr(info, path.read_bytes())

    return {
        "browser": browser,
        "artifact": output.name,
        "bytes": output.stat().st_size,
        "background": manifest["background"],
        "has_gecko_settings": "browser_specific_settings" in manifest,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("browser", choices=("chrome", "firefox"))
    args = parser.parse_args()

    if not (DIST / "manifest.json").is_file():
        raise SystemExit("dist/manifest.json is missing; run `vite build` first")

    output = ROOT / f"tarnished-{args.browser}.zip"
    print(json.dumps(package(args.browser, output), indent=2))


if __name__ == "__main__":
    main()
