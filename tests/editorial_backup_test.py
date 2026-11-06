import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('editorial_backup', Path(__file__).parents[1] / 'deploy' / 'editorial-backup.py')
backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)

class EditorialBackupTest(unittest.TestCase):
    def test_origin_binding_scratch_budget_and_cleanup_failure(self):
        html = '<astro-island component-export="AdminWorkspace" props="{&quot;apiUrl&quot;:[0,&quot;https://admin.example.test/api/v1&quot;]}"></astro-island>'
        self.assertEqual(backup.configured_api_origin(html), 'https://admin.example.test')
        with self.assertRaises(ValueError): backup.configured_api_origin(html.replace('https://admin.example.test', 'http://wrong.test'))
        with self.assertRaises(ValueError): backup.configured_api_origin('<html></html>')
        self.assertGreater(backup.required_scratch(10**9, 3 * 10**9, 100), 20 * 10**9)
        with patch.object(backup.subprocess, 'run', return_value=SimpleNamespace(returncode=1)):
            with self.assertRaisesRegex(RuntimeError, 'cleanup failed'): backup.remove_restore_fixture('astro-editorial-restore-owned-test')
    def fixture(self, root):
        media = root / 'media'; media.mkdir()
        key = 'a' * 64 + '/' + 'b' * 64 + '.webp'
        path = media / key; path.parent.mkdir(); path.write_bytes(b'original-image')
        dump = root / 'database.dump'; dump.write_bytes(b'PGDMPfixture')
        return media, dump, key

    def test_restore_every_byte_and_validate_revision_media_ownership(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); media, dump, key = self.fixture(root)
            archive = root / 'bundle.tar.gz'; manifest = backup.create_bundle(media, dump, archive)
            restored = root / 'restored'; backup.verify_bundle(archive, manifest, restored)
            self.assertEqual((restored / 'database.dump').read_bytes(), b'PGDMPfixture')
            row = {'id': 'asset', 'siteId': 'site', 'ready': True, 'originalKey': key, 'sha256': backup.sha(media / key), 'bytes': 14, 'derivatives': {'cover': [{'key': key, 'sha256': backup.sha(media / key), 'bytes': 14}]}}
            self.assertEqual(backup.verify_media_rows([row], restored), 2)
            self.assertEqual(backup.verify_editorial_references([{'siteId': 'site', 'content': {'body': {'assetId': 'asset'}}}], [row], restored), 1)
            with self.assertRaisesRegex(ValueError, 'foreign media'):
                backup.verify_editorial_references([{'siteId': 'other', 'content': {'assetId': 'asset'}}], [row], restored)
            (restored / 'media' / key).write_bytes(b'broken')
            with self.assertRaisesRegex(ValueError, 'reference mismatch'): backup.verify_media_rows([row], restored)

    def test_reject_incomplete_duplicate_corrupt_and_traversal_archives(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); media, dump, key = self.fixture(root)
            original = root / 'good.tar.gz'; manifest = backup.create_bundle(media, dump, original)
            for name, mode in [('incomplete', 'missing'), ('duplicate', 'duplicate'), ('corrupt', 'corrupt'), ('traversal', 'traversal')]:
                output = root / (name + '.tar.gz')
                with tarfile.open(original, 'r:gz') as source, tarfile.open(output, 'w:gz') as target:
                    for entry in source:
                        if mode == 'missing' and entry.name == 'database.dump': continue
                        raw = source.extractfile(entry).read()
                        if mode == 'corrupt' and entry.name == 'database.dump': raw = b'X' * len(raw)
                        entry.size = len(raw); target.addfile(entry, io.BytesIO(raw))
                        if mode == 'duplicate' and entry.name == 'database.dump': target.addfile(entry, io.BytesIO(raw))
                    if mode == 'traversal':
                        entry = tarfile.TarInfo('../escape'); entry.size = 1; target.addfile(entry, io.BytesIO(b'x'))
                with self.assertRaises(ValueError): backup.verify_bundle(output, manifest, root / name)
            self.assertFalse((root / 'escape').exists())

    def test_manifest_and_published_registry_must_match_real_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); media, dump, key = self.fixture(root)
            archive = root / 'bundle.tar.gz'; manifest = backup.create_bundle(media, dump, archive)
            for bad in ['../escape', '/absolute', 'media/../escape']:
                changed = copy.deepcopy(manifest); changed['files'][0]['path'] = bad
                with self.assertRaises(ValueError): backup.verify_bundle(archive, changed)
            restored = root / 'restored'; backup.verify_bundle(archive, manifest, restored)
            reference = {'sourceKey': key, 'sha256': backup.sha(media / key), 'bytes': 14}
            self.assertEqual(backup.verify_editorial_references([{'siteId': 'site', 'content': reference}], [], restored), 1)
            reference['sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'registry reference mismatch'): backup.verify_editorial_references([{'siteId': 'site', 'content': reference}], [], restored)

if __name__ == '__main__': unittest.main()
