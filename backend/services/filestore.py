"""
Durable file store for uploaded source documents.

Two interchangeable backends, selected by environment:
  - s3:    real S3 (boto3) — used on Alfred. Configure S3_BUCKET plus the
           usual AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (and optionally
           S3_ENDPOINT_URL for R2/MinIO-compatible stores).
  - local: a folder that mimics S3 keys on disk — used for local dev.
           Root: FILE_STORE_DIR (default backend/data/s3).

Selection: STORAGE_BACKEND=s3|local wins; otherwise s3 iff S3_BUCKET is set.

Keys are flat S3-style paths, e.g. "uploads/<md5><ext>". The store holds the
durable copy; rendering code works off a local cache (see services/uploads.py).
"""
import logging
import os

from dotenv import load_dotenv

load_dotenv()  # env is read at import time — don't depend on config.py's import order

log = logging.getLogger("roi.filestore")

S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_PREFIX = os.getenv("S3_PREFIX", "roi-tracker").strip("/")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL") or None
FILE_STORE_DIR = os.getenv(
    "FILE_STORE_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data", "s3"),
)

STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "").lower() or (
    "s3" if S3_BUCKET else "local"
)


class LocalFileStore:
    """Folder-backed store that mimics S3 keys on the local filesystem."""

    name = "local"

    def __init__(self, root: str):
        self.root = os.path.abspath(root)

    def _path(self, key: str) -> str:
        # Normalise and confine the key inside the store root.
        safe = os.path.normpath(key.replace("\\", "/")).lstrip("./\\")
        full = os.path.abspath(os.path.join(self.root, safe))
        if not full.startswith(self.root):
            raise ValueError(f"Key escapes store root: {key}")
        return full

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)

    def get(self, key: str) -> bytes:
        with open(self._path(key), "rb") as f:
            return f.read()

    def exists(self, key: str) -> bool:
        return os.path.isfile(self._path(key))

    def delete(self, key: str) -> bool:
        path = self._path(key)
        if os.path.isfile(path):
            os.remove(path)
            return True
        return False

    def list_keys(self, prefix: str = "") -> list[str]:
        base = self._path(prefix) if prefix else self.root
        keys = []
        for root, _dirs, files in os.walk(base):
            for f in files:
                if f.endswith(".tmp"):
                    continue
                rel = os.path.relpath(os.path.join(root, f), self.root)
                keys.append(rel.replace("\\", "/"))
        return sorted(keys)

    def uri(self, key: str) -> str:
        return "file://" + self._path(key).replace("\\", "/")


class S3FileStore:
    """S3-backed store. All keys are namespaced under S3_PREFIX."""

    name = "s3"

    def __init__(self, bucket: str, prefix: str = "", endpoint_url: str | None = None):
        import boto3  # imported lazily so local dev never needs AWS config

        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.client = boto3.client("s3", endpoint_url=endpoint_url)

    def _key(self, key: str) -> str:
        key = key.replace("\\", "/").lstrip("/")
        return f"{self.prefix}/{key}" if self.prefix else key

    def put(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=self._key(key), Body=data)

    def get(self, key: str) -> bytes:
        resp = self.client.get_object(Bucket=self.bucket, Key=self._key(key))
        return resp["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._key(key))
            return True
        except self.client.exceptions.ClientError:
            return False

    def delete(self, key: str) -> bool:
        existed = self.exists(key)
        self.client.delete_object(Bucket=self.bucket, Key=self._key(key))
        return existed

    def list_keys(self, prefix: str = "") -> list[str]:
        full_prefix = self._key(prefix) if prefix else (self.prefix + "/" if self.prefix else "")
        keys = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=full_prefix):
            for obj in page.get("Contents", []):
                k = obj["Key"]
                if self.prefix and k.startswith(self.prefix + "/"):
                    k = k[len(self.prefix) + 1:]
                keys.append(k)
        return sorted(keys)

    def uri(self, key: str) -> str:
        return f"s3://{self.bucket}/{self._key(key)}"


def _build_store():
    if STORAGE_BACKEND == "s3":
        if not S3_BUCKET:
            raise RuntimeError("STORAGE_BACKEND=s3 requires S3_BUCKET to be set")
        log.info("File store: S3 bucket=%s prefix=%s", S3_BUCKET, S3_PREFIX)
        return S3FileStore(S3_BUCKET, S3_PREFIX, S3_ENDPOINT_URL)
    log.info("File store: local folder %s", os.path.abspath(FILE_STORE_DIR))
    return LocalFileStore(FILE_STORE_DIR)


store = _build_store()
