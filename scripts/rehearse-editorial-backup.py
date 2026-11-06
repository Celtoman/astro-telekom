import importlib.util
import json
from pathlib import Path
import signal
import sys
import tempfile

spec = importlib.util.spec_from_file_location('editorial_backup', Path(__file__).parents[1] / 'deploy' / 'editorial-backup.py')
backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)
def interrupted(signum, frame): raise InterruptedError('Fixture interrupted')
signal.signal(signal.SIGTERM, interrupted)
root = Path(sys.argv[1]).resolve()
if not root.name.startswith('editorial-backup-fixture-') or root.parent != Path(tempfile.gettempdir()).resolve(): raise ValueError('Owned system temporary fixture path required')
manifest = backup.create_bundle(root / 'media', root / 'database.dump', root / 'bundle.tar.gz')
restored = root / 'restored'; backup.verify_bundle(root / 'bundle.tar.gz', manifest, restored)
proof = backup.verify_database(restored / 'database.dump', restored)
assert proof['assets'] == 1 and proof['verifiedFiles'] > 1 and proof['verifiedEditorialReferences'] >= 2
print(json.dumps({'result': 'PASS', 'isolatedPostgresRestore': True, 'mediaReferences': proof['verifiedEditorialReferences'], 'assets': proof['assets'], 'verifiedFiles': proof['verifiedFiles'], 'sourceDatabaseChanged': False}))
