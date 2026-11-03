import hashlib
import importlib.util
import io
import json
import shutil
import subprocess
import sys
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("retention", Path(__file__).parents[1] / "deploy" / "publication-retention.py")
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)

class ArchiveTest(unittest.TestCase):
    @unittest.skipIf(sys.platform == "win32", "Host service uses Linux flock")
    def test_manual_and_scheduled_runs_share_one_process_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / "retention.lock")
            code = ("import importlib.util; s=importlib.util.spec_from_file_location('r'," +
                    repr(str(Path(retention.__file__).resolve())) +
                    "); m=importlib.util.module_from_spec(s); s.loader.exec_module(m);\n" +
                    "with m.process_lock(" + repr(path) + "): pass")
            with retention.process_lock(path):
                blocked = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
                self.assertNotEqual(blocked.returncode, 0)
                self.assertIn("BlockingIOError", blocked.stderr)
            allowed = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
            self.assertEqual(allowed.returncode, 0, allowed.stderr)

    def fixture(self, directory):
        root = Path(directory).resolve() / "publication"
        artifact = "a" * 64
        release = root / "releases" / artifact
        release.mkdir(parents=True)
        (root / "manifests").mkdir()
        files = []
        for name, content in {"index.html": b"Home", "404.html": b"Not found", "assets/old.css": b".old{}"}.items():
            target = release / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            files.append(dict(path=name, size=len(content), sha256=hashlib.sha256(content).hexdigest()))
        manifest = dict(artifactId=artifact, manifestDigest="b" * 64, files=files)
        (root / "manifests" / (artifact + ".json")).write_text(json.dumps(manifest))
        return root, manifest

    def test_full_restore_and_file_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root, manifest = self.fixture(directory)
            archive = Path(directory) / "archive.tar.gz"
            retention.create_archive(root, manifest, archive)
            destination = Path(directory) / "isolated-restore"
            retention.verify_restore(archive, manifest, destination)
            self.assertEqual((destination / "release/index.html").read_bytes(), b"Home")
            self.assertEqual((destination / "release/assets/old.css").read_bytes(), b".old{}")

    def test_corruption_and_unlisted_member_abort(self):
        with tempfile.TemporaryDirectory() as directory:
            root, manifest = self.fixture(directory)
            archive = Path(directory) / "archive.tar.gz"
            (root / "releases" / manifest["artifactId"] / "index.html").write_bytes(b"evil")
            retention.create_archive(root, manifest, archive)
            with self.assertRaisesRegex(ValueError, "digest mismatch"):
                retention.verify_restore(archive, manifest)
            with tarfile.open(archive, "w:gz") as stream:
                member = tarfile.TarInfo("../escape")
                member.size = 1
                stream.addfile(member, io.BytesIO(b"x"))
            with self.assertRaisesRegex(ValueError, "Unsafe archive path"):
                retention.verify_restore(archive, manifest, Path(directory) / "restore")
            self.assertFalse((Path(directory) / "escape").exists())

    def test_missing_file_or_symlink_aborts_before_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            root, manifest = self.fixture(directory)
            (root / "releases" / manifest["artifactId"] / "index.html").unlink()
            with self.assertRaisesRegex(ValueError, "Unsafe or missing"):
                retention.create_archive(root, manifest, Path(directory) / "bad.tar.gz")

    def test_archive_failure_never_acknowledges_or_collects(self):
        candidate = dict(artifactId="a" * 64)
        with patch.object(retention.sys, "argv", ["retention", "--apply"]), \
             patch.object(retention, "require_idle"), \
             patch.object(retention, "rpc", return_value=dict(activeArtifactId="b" * 64, candidates=[candidate], protected=[])) as rpc, \
             patch.object(retention, "archive_and_verify", side_effect=RuntimeError("S3 unavailable")):
            with self.assertRaisesRegex(RuntimeError, "S3 unavailable"):
                retention.main()
            self.assertEqual([call.args[0] for call in rpc.call_args_list], ["/retention/plan"])

    def test_existing_archive_gets_fresh_restore_evidence_without_reupload(self):
        with tempfile.TemporaryDirectory() as directory:
            root, manifest = self.fixture(directory)
            archived = Path(directory) / "off-server-object.tar.gz"
            retention.create_archive(root, manifest, archived)
            staging = Path(directory).resolve() / "staging"
            staging.mkdir()
            old = dict(artifactId=manifest["artifactId"], manifestDigest=manifest["manifestDigest"],
                       archiveSha256=retention.file_sha(archived), archiveBytes=archived.stat().st_size,
                       verifiedAt="2000-01-01T00:00:00+00:00", retainUntil="2000-04-01T00:00:00+00:00")
            def bridge(args, **kwargs):
                self.assertEqual(args[-1], "read-only")
                returned = Path(args[-2].replace(retention.CONTAINER_STAGING, str(staging)))
                shutil.copyfile(archived, returned)
                return json.dumps(dict(downloadSha256=old["archiveSha256"], downloadBytes=old["archiveBytes"]))
            with patch.object(retention, "ROOT", root), patch.object(retention, "STAGING", staging), patch.object(retention, "run", side_effect=bridge):
                fresh = retention.archive_and_verify(dict(artifactId=manifest["artifactId"], manifestDigest=manifest["manifestDigest"], archive=old), 1)
            self.assertNotEqual(fresh["verifiedAt"], old["verifiedAt"])
            self.assertEqual(fresh["archiveSha256"], old["archiveSha256"])

if __name__ == "__main__":
    unittest.main()
