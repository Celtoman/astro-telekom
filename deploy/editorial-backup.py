#!/usr/bin/env python3
"""Private PostgreSQL/media bundle and isolated restore verification; no site activation."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from urllib.parse import urlsplit
from html.parser import HTMLParser

RESOURCE = 'jlrsktdos9yhchkgnrd9f5fj'
MEDIA = Path('/var/lib/docker/volumes') / (RESOURCE + '_editorial-media') / '_data'
STAGING = Path('/data/coolify/backups/publication-retention')
CONTAINER_STAGING = '/var/www/html/storage/app/backups/publication-retention'

def configured_api_origin(html):
    class Workspace(HTMLParser):
        origins = []
        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'astro-island' and attrs.get('component-export') == 'AdminWorkspace':
                value = json.loads(attrs['props'])['apiUrl']
                if not isinstance(value, list) or value[0] != 0: raise ValueError('Unknown API property encoding')
                parsed = urlsplit(value[1])
                if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path != '/api/v1' or parsed.query or parsed.fragment: raise ValueError('Invalid configured API URL')
                self.origins.append(parsed.scheme + '://' + parsed.netloc)
    parser = Workspace(); parser.origins = []; parser.feed(html)
    if len(set(parser.origins)) != 1: raise ValueError('Expected a single configured workspace API origin')
    return parser.origins[0]

def required_scratch(database_bytes, media_bytes, media_files):
    if min(database_bytes, media_bytes, media_files) < 0: raise ValueError('Invalid data size')
    # Dump, two gzip copies and a full isolated extraction, plus incompressible/tar overhead and reserve.
    return 6 * (database_bytes + media_bytes + 2048 * media_files) + 2 * 1024**3

def media_size(media):
    total = count = 0
    for parent, dirs, names in os.walk(media, followlinks=False):
        for name in dirs:
            if (Path(parent) / name).is_symlink(): raise ValueError('Symlink in media volume')
        for name in names:
            path = Path(parent) / name
            if path.is_symlink() or not path.is_file(): raise ValueError('Unsafe media file')
            safe_key(path.relative_to(media).as_posix()); total += path.stat().st_size; count += 1
    return total, count

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def safe_key(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}/[a-f0-9]{64}\.(?:jpeg|jpg|png|webp)', value):
        raise ValueError('Unsafe editorial storage key')
    return value

def inventory(media, dump):
    media, dump = Path(media), Path(dump)
    if media.is_symlink() or dump.is_symlink() or not dump.is_file(): raise ValueError('Unsafe backup source')
    files = [{'path': 'database.dump', 'size': dump.stat().st_size, 'sha256': sha(dump)}]
    for parent, dirs, names in os.walk(media, followlinks=False):
        for name in dirs:
            if (Path(parent) / name).is_symlink(): raise ValueError('Symlink in media volume')
        for name in sorted(names):
            path = Path(parent) / name
            if path.is_symlink() or not path.is_file(): raise ValueError('Non-regular media file')
            key = safe_key(path.relative_to(media).as_posix())
            files.append({'path': 'media/' + key, 'size': path.stat().st_size, 'sha256': sha(path)})
    return sorted(files, key=lambda item: item['path'])

def create_bundle(media, dump, target):
    manifest = {'version': 1, 'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'files': inventory(media, dump)}
    raw = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
    import io
    with tarfile.open(target, 'x:gz') as archive:
        entry = tarfile.TarInfo('manifest.json'); entry.size = len(raw); entry.mode = 0o600
        archive.addfile(entry, io.BytesIO(raw))
        for item in manifest['files']:
            path = Path(dump) if item['path'] == 'database.dump' else Path(media) / item['path'][6:]
            entry = archive.gettarinfo(str(path), arcname=item['path']); entry.mode = 0o600; entry.uid = entry.gid = 0; entry.uname = entry.gname = ''
            with path.open('rb') as stream: archive.addfile(entry, stream)
    verify_bundle(target, manifest)
    return manifest

def verify_bundle(archive_path, manifest, destination=None):
    if manifest.get('version') != 1 or not isinstance(manifest.get('files'), list): raise ValueError('Invalid backup manifest')
    expected = {}
    for item in manifest['files']:
        name = item.get('path')
        if name != 'database.dump':
            if not isinstance(name, str) or not name.startswith('media/'): raise ValueError('Unknown bundle path')
            safe_key(name[6:])
        if name in expected or not isinstance(item.get('size'), int) or item['size'] < 0 or not re.fullmatch('[a-f0-9]{64}', str(item.get('sha256'))): raise ValueError('Invalid bundle file')
        expected[name] = item
    if 'database.dump' not in expected: raise ValueError('Missing database dump')
    seen = set()
    with tarfile.open(archive_path, 'r:gz') as archive:
        for entry in archive:
            if not entry.isfile() or entry.name in seen or entry.name not in expected and entry.name != 'manifest.json': raise ValueError('Unsafe or duplicate bundle member')
            seen.add(entry.name)
            if entry.name == 'manifest.json':
                if entry.size > 16 * 1024 * 1024: raise ValueError('Oversized manifest')
                if json.load(archive.extractfile(entry)) != manifest: raise ValueError('Manifest mismatch')
                continue
            item = expected[entry.name]
            if entry.size != item['size']: raise ValueError('Bundle file size mismatch')
            stream = archive.extractfile(entry); output = None; digest = hashlib.sha256(); size = 0
            if destination is not None:
                root = Path(destination).resolve(); target = root.joinpath(*PurePosixPath(entry.name).parts)
                if root not in target.resolve().parents: raise ValueError('Restore escaped target')
                target.parent.mkdir(parents=True, exist_ok=True)
                if any(p.is_symlink() for p in [target, *target.parents]): raise ValueError('Restore symlink rejected')
                output = target.open('xb')
            try:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk); size += len(chunk)
                    if output: output.write(chunk)
            finally:
                stream.close()
                if output: output.close()
            if digest.hexdigest() != item['sha256'] or size != item['size']: raise ValueError('Restored bytes mismatch')
    if seen != set(expected) | {'manifest.json'}: raise ValueError('Incomplete bundle')

def verify_media_rows(rows, restored):
    count = 0
    for row in rows:
        if not row['ready']: continue
        variants = [{'key': row['originalKey'], 'sha256': row['sha256'], 'bytes': row['bytes']}]
        def collect(value):
            if isinstance(value, dict):
                if all(key in value for key in ['key', 'sha256', 'bytes']): variants.append(value)
                else:
                    for child in value.values(): collect(child)
            elif isinstance(value, list):
                for child in value: collect(child)
        collect(row['derivatives'])
        for item in variants:
            key = safe_key(item['key']); path = Path(restored) / 'media' / key
            if path.is_symlink() or not path.is_file() or path.stat().st_size != item['bytes'] or sha(path) != item['sha256']: raise ValueError('Restored database/media reference mismatch')
            count += 1
    return count

def verify_editorial_references(records, assets, restored):
    available = {(row['siteId'], row['id']) for row in assets if row['ready']}
    references = 0
    for record in records:
        def visit(value):
            nonlocal references
            if isinstance(value, list):
                for child in value: visit(child)
            elif isinstance(value, dict):
                if value.get('assetId'):
                    if (record['siteId'], value['assetId']) not in available: raise ValueError('Editorial revision references missing or foreign media')
                    references += 1
                if value.get('sourceKey'):
                    path = Path(restored) / 'media' / safe_key(value['sourceKey'])
                    if not path.is_file() or path.is_symlink() or sha(path) != value.get('sha256') or path.stat().st_size != value.get('bytes'): raise ValueError('Published media registry reference mismatch')
                    references += 1
                for child in value.values(): visit(child)
        visit(record['content'])
    return references

def run(args, timeout=120, **options):
    result = subprocess.run(args, capture_output=True, timeout=timeout, **options)
    if result.returncode: raise RuntimeError('Backup/restore command failed; private diagnostics suppressed')
    return result.stdout

def verify_database(dump, restored):
    name = 'astro-editorial-restore-' + uuid.uuid4().hex[:12]
    try:
        run(['docker', 'run', '-d', '--name', name, '--network', 'none', '--memory', '512m', '--cpus', '0.5', '--tmpfs', '/var/lib/postgresql', '-e', 'POSTGRES_USER=news_restore', '-e', 'POSTGRES_DB=news_restore', '-e', 'POSTGRES_PASSWORD=isolated-restore-only', 'postgres:18.6-alpine'])
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'news_restore', '-d', 'news_restore'], capture_output=True, timeout=5)
            if ready.returncode == 0: break
            time.sleep(0.5)
        else: raise RuntimeError('Isolated restore database unavailable')
        with Path(dump).open('rb') as stream:
            result = subprocess.run(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'news_restore', '-d', 'news_restore', '--no-owner', '--no-acl', '--exit-on-error'], stdin=stream, capture_output=True, timeout=300)
        if result.returncode: raise RuntimeError('Isolated PostgreSQL restore failed')
        sql = 'SELECT COALESCE(json_agg(t),\'[]\') FROM (SELECT id,"siteId","originalKey","sha256","bytes","derivatives","ready" FROM "MediaAsset") t;'
        rows = json.loads(run(['docker', 'exec', name, 'psql', '-U', 'news_restore', '-d', 'news_restore', '-At', '-c', sql]))
        sql = '''SELECT COALESCE(json_agg(t),'[]') FROM (
SELECT "siteId",content FROM "NewsArticle" UNION ALL
SELECT "siteId",content FROM "NewsCategory" UNION ALL
SELECT "siteId",snapshot AS content FROM "EditorialRevision" UNION ALL
SELECT "siteId",content FROM "EditorialSettings" UNION ALL
SELECT "siteId",catalog->'editorial' AS content FROM "SitePublication"
) t;'''
        records = json.loads(run(['docker', 'exec', name, 'psql', '-U', 'news_restore', '-d', 'news_restore', '-At', '-c', sql]))
        return {'assets': len(rows), 'verifiedFiles': verify_media_rows(rows, restored), 'verifiedEditorialReferences': verify_editorial_references(records, rows, restored), 'editorialRecords': len(records)}
    finally:
        # Only this invocation-owned, network-isolated fixture is removed.
        remove_restore_fixture(name)

def remove_restore_fixture(name):
    result = subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=30)
    if result.returncode:
        print(json.dumps({'event': 'restore_fixture_cleanup_failed', 'container': name}), file=sys.stderr)
        raise RuntimeError('Owned restore cleanup failed; no successful proof issued')

def backup(storage_id=1, api_origin=None):
    origin = urlsplit(api_origin or '')
    if origin.scheme != 'https' or not origin.hostname or origin.username or origin.password or origin.path not in ['', '/'] or origin.query or origin.fragment: raise ValueError('Verified HTTPS API origin required')
    if os.geteuid() != 0: raise RuntimeError('Host root required')
    configured = configured_api_origin(run(['docker', 'exec', 'admin-' + RESOURCE, 'cat', '/srv/index.html']).decode())
    if api_origin.rstrip('/') != configured: raise ValueError('API origin does not match this resource workspace')
    if not MEDIA.is_dir() or MEDIA.is_symlink() or MEDIA.resolve() != MEDIA: raise RuntimeError('Expected persistent media volume unavailable')
    STAGING.mkdir(mode=0o700, parents=True, exist_ok=True)
    if STAGING.is_symlink() or STAGING.resolve() != STAGING: raise RuntimeError('Unsafe staging')
    db_bytes = int(run(['docker', 'exec', 'postgres-' + RESOURCE, 'sh', '-c', 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT pg_database_size(current_database())"']).strip())
    media_bytes, media_files = media_size(MEDIA)
    if shutil.disk_usage(STAGING).free < required_scratch(db_bytes, media_bytes, media_files): raise RuntimeError('Insufficient private backup scratch space')
    import fcntl
    descriptor = os.open('/run/astro-editorial-backup.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix='editorial-', dir=STAGING) as temporary:
            root = Path(temporary); os.chmod(root, 0o700); dump = root / 'database.dump'
            with dump.open('xb') as output:
                os.chmod(dump, 0o600)
                result = subprocess.run(['docker', 'exec', 'postgres-' + RESOURCE, 'sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl --lock-wait-timeout=10s'], stdout=output, stderr=subprocess.PIPE, timeout=300)
            if result.returncode: raise RuntimeError('PostgreSQL dump failed; private diagnostics suppressed')
            source, returned = root / 'source.tar.gz', root / 'returned.tar.gz'
            manifest = create_bundle(MEDIA, dump, source); digest = sha(source)
            key = 'astro-telekom/editorial-backups/' + digest + '.tar.gz'
            bridge = CONTAINER_STAGING + '/editorial-backup-s3.php'
            remote = lambda path: CONTAINER_STAGING + '/' + root.name + '/' + path.name
            proof = json.loads(run(['docker', 'exec', '--user', '0', 'coolify', 'php', bridge, str(storage_id), key, remote(source), remote(returned)], timeout=600))
            if proof['downloadSha256'] != digest or sha(returned) != digest or proof['downloadBytes'] != source.stat().st_size: raise RuntimeError('Off-server backup readback mismatch')
            restore = root / 'restore'; verify_bundle(returned, manifest, restore)
            db = verify_database(restore / 'database.dump', restore)
            result = {'version': 1, 'verifiedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'resource': RESOURCE, 'apiOrigin': api_origin.rstrip('/'), 'editorialMediaCovered': True, 'restoreVerified': True, 'archiveSha256': digest, 'archiveBytes': returned.stat().st_size, 'objectKey': key, 'database': db}
            state = Path('/var/lib/astro-editorial-backup'); state.mkdir(mode=0o700, parents=True, exist_ok=True)
            if state.is_symlink() or state.resolve() != state: raise ValueError('Unsafe backup proof directory')
            os.chmod(state, 0o700)
            output = state / (digest + '.json'); output.write_text(json.dumps(result, indent=2) + '\n'); os.chmod(output, 0o600)
            print(json.dumps(result))

if __name__ == '__main__':
    import signal
    def interrupted(signum, frame): raise InterruptedError('Backup interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(); parser.add_argument('--storage-id', type=int, default=1); parser.add_argument('--api-origin', required=True); options = parser.parse_args()
    try: backup(options.storage_id, options.api_origin)
    except Exception: raise SystemExit('Editorial backup/restore failed; site and production data unchanged; private diagnostics suppressed')
