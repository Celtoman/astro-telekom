#!/usr/bin/env python3
"""Archive, restore-verify and collect Astro publication HTML. Root-only host service."""
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
from contextlib import contextmanager

RESOURCE = "jlrsktdos9yhchkgnrd9f5fj"
ROOT = Path("/var/lib/docker/volumes") / (RESOURCE + "_web-publication") / "_data"
STAGING = Path("/data/coolify/backups/publication-retention")
CONTAINER_STAGING = "/var/www/html/storage/app/backups/publication-retention"
WEB = "web-" + RESOURCE

class MaintenanceBusy(RuntimeError):
    pass

@contextmanager
def process_lock(path="/run/astro-publication-retention.lock"):
    import fcntl
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield

def run(args, timeout=120, **kw):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, **kw)
    if p.returncode:
        raise RuntimeError("Command failed: " + " ".join(args[:3]) + "; see service journal")
    return p.stdout

def log(event, **kw):
    print(json.dumps(dict(event=event, **kw)), flush=True)

def rpc(path, body=None):
    js = """const [path,raw]=process.argv.slice(1);
const r=await fetch('http://127.0.0.1:8081'+path,{method:raw?'POST':'GET',
headers:{'x-admin-token':process.env.ADMIN_API_TOKEN,'content-type':'application/json'},
...(raw?{body:raw}:{}),signal:AbortSignal.timeout(600000)});
if(r.status!==200)throw new Error('Retention controller HTTP '+r.status);
console.log(JSON.stringify(await r.json()));"""
    args = ["docker", "exec", WEB, "node", "--input-type=module", "-e", js, path]
    if body is not None:
        args.append(json.dumps(body, separators=(",", ":")))
    return json.loads(run(args, timeout=630))

def require_idle():
    sql = """SELECT (SELECT count(*) FROM "SiteRebuild" WHERE status IN ('PENDING','QUEUED','RUNNING','RETRYING'))
+ (SELECT count(*) FROM "SitePublication" WHERE status IN ('PENDING','RUNNING'));"""
    value = run(["docker", "exec", "postgres-" + RESOURCE, "sh", "-c",
                 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "$1"', "sh", sql])
    if int(value.strip()) != 0:
        raise MaintenanceBusy("Publication SQL operations are not idle")
    for kind, queue in [("LLEN", "active"), ("LLEN", "wait"), ("LLEN", "paused"), ("ZCARD", "delayed")]:
        value = run(["docker", "exec", "redis-" + RESOURCE, "redis-cli", "--raw", kind, "bull:site-rebuilds:" + queue])
        if int(value.strip()) != 0:
            raise MaintenanceBusy("Publication queue is not idle")

def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def safe_manifest(root, artifact_id):
    if not re.fullmatch("[a-f0-9]{64}", artifact_id):
        raise ValueError("Invalid artifact ID")
    if root.resolve() != root or (root / "releases").resolve() != root / "releases":
        raise ValueError("Unsafe publication root")
    manifest_path = root / "manifests" / (artifact_id + ".json")
    if manifest_path.is_symlink():
        raise ValueError("Unsafe manifest")
    manifest = json.loads(manifest_path.read_text())
    if manifest["artifactId"] != artifact_id:
        raise ValueError("Manifest identity mismatch")
    return manifest

def create_archive(root, manifest, target):
    artifact_id = manifest["artifactId"]
    release = root / "releases" / artifact_id
    if release.is_symlink() or release.resolve() != release:
        raise ValueError("Unsafe release directory")
    with tarfile.open(target, "w:gz", compresslevel=3) as archive:
        archive.add(root / "manifests" / (artifact_id + ".json"), arcname="manifest.json", recursive=False)
        for item in manifest["files"]:
            rel = PurePosixPath(item["path"])
            if rel.is_absolute() or any(p.startswith(".") for p in rel.parts) or "\\" in item["path"]:
                raise ValueError("Unsafe manifest file")
            source = release.joinpath(*rel.parts)
            if source.resolve() != source or not source.is_file():
                raise ValueError("Unsafe or missing sealed file")
            archive.add(source, arcname="release/" + item["path"], recursive=False)

def verify_restore(archive_path, manifest, destination=None):
    """Decode every member and check the entire sealed inventory; optional real restore."""
    expected = {"release/" + f["path"]: f for f in manifest["files"]}
    expected["manifest.json"] = None
    seen = set()
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive:
            rel = PurePosixPath(member.name)
            if rel.is_absolute() or any(p.startswith(".") for p in rel.parts) or "\\" in member.name:
                raise ValueError("Unsafe archive path")
            if not member.isfile() or member.name not in expected or member.name in seen:
                raise ValueError("Unknown, duplicate or unsafe archive member")
            seen.add(member.name)
            h = hashlib.sha256()
            stream = archive.extractfile(member)
            out = None
            if destination is not None:
                rel = PurePosixPath(member.name)
                target = Path(destination).joinpath(*rel.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                out = target.open("xb")
            total = 0
            manifest_bytes = bytearray() if member.name == "manifest.json" else None
            try:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    h.update(chunk); total += len(chunk)
                    if out: out.write(chunk)
                    if manifest_bytes is not None: manifest_bytes.extend(chunk)
            finally:
                stream.close()
                if out: out.close()
            entry = expected[member.name]
            if entry is not None and (total != entry["size"] or h.hexdigest() != entry["sha256"]):
                raise ValueError("Restored file digest mismatch")
            if entry is None and json.loads(manifest_bytes) != manifest:
                raise ValueError("Restored manifest mismatch")
    if seen != set(expected):
        raise ValueError("Incomplete archive")

def archive_and_verify(candidate, storage_id):
    artifact_id = candidate["artifactId"]
    manifest = safe_manifest(ROOT, artifact_id)
    if manifest["manifestDigest"] != candidate["manifestDigest"]:
        raise ValueError("Controller/manifest mismatch")
    key = "astro-telekom/publications/" + artifact_id + "/" + manifest["manifestDigest"] + ".tar.gz"
    STAGING.mkdir(mode=0o700, parents=True, exist_ok=True)
    if STAGING.is_symlink() or STAGING.resolve() != STAGING:
        raise ValueError("Unsafe archive staging")
    available = shutil.disk_usage(STAGING).free
    if available < 2 * sum(f["size"] for f in manifest["files"]) + 1024**3:
        raise RuntimeError("Insufficient archive/restore scratch space")
    # Unique owned temporary directory; never a serving path.
    with tempfile.TemporaryDirectory(prefix="artifact-", dir=STAGING) as temporary:
        temporary = Path(temporary)
        source = temporary / "source.tar.gz"
        returned = temporary / "returned.tar.gz"
        existing = candidate.get("archive")
        if existing is None:
            create_archive(ROOT, manifest, source)
            verify_restore(source, manifest)
        else:
            # Bridge won't read this file when the immutable object already exists.
            source.touch()
        container_source = CONTAINER_STAGING + "/" + temporary.name + "/source.tar.gz"
        container_returned = CONTAINER_STAGING + "/" + temporary.name + "/returned.tar.gz"
        bridge = CONTAINER_STAGING + "/publication-retention-s3.php"
        evidence = json.loads(run(["docker", "exec", "--user", "0", "coolify", "php", bridge, str(storage_id), key,
                                   container_source, container_returned, "read-only" if existing else "create-or-read"], timeout=600))
        digest = file_sha(returned)
        if evidence["downloadSha256"] != digest or evidence["downloadBytes"] != returned.stat().st_size:
            raise ValueError("Off-server archive readback mismatch")
        if existing and (existing["archiveSha256"] != digest or existing["archiveBytes"] != returned.stat().st_size):
            raise ValueError("Immutable archive changed")
        # Restore the downloaded object, not the local source; verify all decoded bytes.
        restore = temporary / "restore"
        verify_restore(returned, manifest, destination=restore)
        timestamp = dt.datetime.now(dt.timezone.utc)
        proof = dict(artifactId=artifact_id, manifestDigest=manifest["manifestDigest"], storageId=storage_id,
            objectKey=key, archiveSha256=digest, archiveBytes=returned.stat().st_size, restoreVerified=True,
            verifiedAt=timestamp.isoformat(), retainUntil=(timestamp + dt.timedelta(days=90)).isoformat())
        proof = {k: v for k, v in proof.items() if k != "recordDigest"}
        log("archive_restored", artifactId=artifact_id, archiveBytes=returned.stat().st_size, archiveSha256=digest)
        return proof

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--storage-id", type=int, default=1)
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 100 or args.storage_id < 1:
        raise ValueError("Invalid retention limits")
    for attempt in range(7):
        try:
            require_idle()
            break
        except MaintenanceBusy:
            if attempt == 6:
                log("deferred", reason="Publication operations are busy; no files removed")
                return
            time.sleep(10)
    plan = rpc("/retention/plan")
    log("plan", activeArtifactId=plan["activeArtifactId"], candidates=len(plan["candidates"]),
        protected=len(plan["protected"]), apply=args.apply)
    if not args.apply:
        return
    for candidate in plan["candidates"][:args.limit]:
        require_idle()
        proof = archive_and_verify(candidate, args.storage_id)
        rpc("/retention/archive", proof)
        require_idle()
        # Controller re-reads serving/protected set under the same serial queue as CMS/CODE.
        result = rpc("/retention/collect", {"artifactId": candidate["artifactId"]})
        log("collected", **result)
    usage = shutil.disk_usage(ROOT)
    percent = (usage.total - usage.free) * 100 / usage.total
    log("finished", freeBytes=usage.free, usedPercent=round(percent, 2))
    if percent >= 75:
        log("disk_critical" if percent >= 85 else "disk_warning", usedPercent=round(percent, 2))
    allocated = int(run(["du", "-s", "-B1", str(ROOT)]).split()[0])
    if allocated >= 12 * 1024**3:
        log("publication_budget_warning", allocatedBytes=allocated, budgetBytes=12 * 1024**3,
            action="Protected artifacts are preserved; review the retention budget")

if __name__ == "__main__":
    try:
        with process_lock():
            main()
    except BlockingIOError:
        log("deferred", reason="Another retention process is running")
    except Exception as error:
        log("failed", errorType=type(error).__name__, error=str(error)[:300])
        sys.exit(1)
