import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "release.yml"


class ReleaseWorkflowTests(unittest.TestCase):
    def test_release_workflow_ensures_github_release_exists_before_edit_and_upload(
        self,
    ) -> None:
        content = WORKFLOW_PATH.read_text()

        self.assertIn('gh release edit "$TAG"', content)
        self.assertIn('gh release upload "$TAG"', content)
        self.assertIn(
            'gh release create "$TAG"',
            content,
            "release workflow should create the GitHub release when it does not exist",
        )

    def test_images_build_on_native_runners_and_merge_before_helm(self) -> None:
        content = WORKFLOW_PATH.read_text()
        build = content.split("\n  docker:\n", 1)[1].split("\n  docker-merge:\n", 1)[0]
        merge = content.split("\n  docker-merge:\n", 1)[1].split("\n  helm:\n", 1)[0]
        helm = content.split("\n  helm:\n", 1)[1]
        for arch, runner in (("amd64", "ubuntu-24.04"), ("arm64", "ubuntu-24.04-arm")):
            self.assertIn(f"arch: {arch}\n            runner: {runner}", build)
        self.assertNotIn("setup-qemu", content)
        self.assertIn("platforms: linux/${{ matrix.arch }}", build)
        self.assertIn("push-by-digest=true,name-canonical=true,push=true", build)
        self.assertEqual(build.count("scope=release-${{ matrix.arch }}"), 2)
        self.assertIn("image-digests-${{ matrix.arch }}", build)
        self.assertIn("docker buildx imagetools create", merge)
        self.assertIn("aquasecurity/trivy-action@", merge)
        self.assertIn("exit-code: '1'", merge)
        self.assertIn("needs: [release-meta, github-release-notes, docker, docker-merge]", helm)
        self.assertIn("needs.docker.result == 'success' || needs.docker.result == 'skipped'", helm)
        self.assertIn("needs.docker-merge.result == 'success' || needs.docker.result == 'skipped'", helm)

    def test_image_scan_uses_only_the_reviewed_jwt_exception(self) -> None:
        content = WORKFLOW_PATH.read_text()
        merge = content.split("\n  docker-merge:\n", 1)[1].split("\n  helm:\n", 1)[0]
        self.assertIn(
            'run: printf \'CVE-2026-85394\\n\' > "$RUNNER_TEMP/tarnished-trivy.ignore"',
            merge,
        )
        self.assertIn("trivyignores: ${{ runner.temp }}/tarnished-trivy.ignore", merge)
        self.assertIn("exit-code: '1'", merge)
        self.assertIn("severity: CRITICAL", merge)
        self.assertNotIn("ignore-unfixed", merge)
        self.assertIn("CVE-2026-85394", (ROOT / ".github/workflows/ci.yml").read_text())

    def test_existing_tag_recovery_does_not_change_release_or_cli(self) -> None:
        content = WORKFLOW_PATH.read_text()
        self.assertIn('gh release view "$INPUT_TAG" --repo "$GITHUB_REPOSITORY"', content)
        notes = content.split("      - name: Create release and update notes\n", 1)[1]
        self.assertTrue(notes.startswith("        if: inputs.tag == ''\n"))
        for job in ("extension", "cli-package", "cli-pypi-publish"):
            block = content.split(f"\n  {job}:\n", 1)[1].split("\n\n  ", 1)[0]
            self.assertIn("    if: inputs.tag == ''", block)
        self.assertIn('echo "$IMAGE:${VERSION%.*}"', content)
        self.assertIn('echo "$IMAGE:latest"', content)
        self.assertIn('[[ "$VERSION" != *-* ]]', content)


if __name__ == "__main__":
    unittest.main()
