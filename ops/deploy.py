#!/usr/bin/env python3
"""
Deploy script for the ROI prototype (roi-prototype on Alfred).

Self-contained deployer, same pattern as app-delivery-hub-embeddings:
  1. Authenticates via the shared token in app-delivery-hub
  2. Packages the project directory as a tarball (honoring the
     "exclude" globs in ops/alfred.config.json)
  3. Uploads to Alfred
  4. Polls until the build succeeds or fails

Usage:
    python -u ops/deploy.py                    # Deploy this project
    python -u ops/deploy.py --skip-build-wait  # Upload but don't poll build status

Prerequisites:
    - Auth token from app-delivery-hub (any hub script triggers the
      device auth flow if the token is expired)
    - Project must be registered in ops/alfred.config.json with a valid ID
      (run app-delivery-hub/ops/fetch_project_ids.py to populate it)

Architecture Note:
    Auth is shared across all microservices via app-delivery-hub/scripts/.
    This avoids duplicating auth code in every microservice.
"""
import fnmatch
import json
import os
import sys
import tarfile
import time

# ── Resolve shared auth from app-delivery-hub ─────────────────────────
_this_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.normpath(os.path.join(_this_dir, ".."))
_ai_employees_root = os.path.normpath(os.path.join(_project_root, ".."))
_hub_scripts_lib = os.path.join(_ai_employees_root, "app-delivery-hub", "scripts", "lib")

if not os.path.isdir(_hub_scripts_lib):
    print(f"ERROR: Cannot find shared auth library at {_hub_scripts_lib}")
    print("       Make sure app-delivery-hub/ is a sibling directory.")
    sys.exit(1)

if _hub_scripts_lib not in sys.path:
    sys.path.insert(0, _hub_scripts_lib)

from alfredo_utils import alfred_api, ensure_token  # noqa: E402

# ── Load project config ──────────────────────────────────────────────
_config_path = os.path.join(_this_dir, "alfred.config.json")

def load_config():
    if not os.path.isfile(_config_path):
        print(f"ERROR: Missing {_config_path}")
        print("       Create it with your Alfred project ID.")
        sys.exit(1)
    with open(_config_path, encoding="utf-8") as f:
        return json.load(f)

# ── Packaging ─────────────────────────────────────────────────────────
DEFAULT_EXCLUDES = {
    "__pycache__", ".git", ".venv", "venv", ".env", "*.pyc", ".DS_Store",
    "Thumbs.db", "ops", ".gitignore", "*.md", "temp_*",
    "node_modules", "dist", ".next", "*.tar.gz",
}

def should_exclude(arcname, extra_excludes=None):
    """Check if a file should be excluded from the tarball.

    Patterns are fnmatch globs, tested against each path segment and the
    full forward-slash path. A trailing "/" marks a directory prefix
    (e.g. "cd_ui_template/"), and "backend/data/*" style paths match the
    whole relative path.
    """
    excludes = DEFAULT_EXCLUDES | (extra_excludes or set())
    path = arcname.replace("\\", "/")
    parts = path.split("/")
    for part in parts:
        if part.startswith("."):
            return True
    for pattern in excludes:
        pattern = pattern.replace("\\", "/").rstrip("/")
        if "/" in pattern:
            if fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch(path, pattern + "/*"):
                return True
        else:
            if any(fnmatch.fnmatch(part, pattern) for part in parts):
                return True
    return False


def package_project(src_dir, tarball_name, extra_excludes=None):
    """Create a tarball of the project directory."""
    print(f"[*] Packaging {src_dir}...")
    file_count = 0
    with tarfile.open(tarball_name, "w:gz") as tar:
        for root, dirs, files in os.walk(src_dir):
            # Prune excluded dirs in-place (match against relative path)
            keep = []
            for d in dirs:
                rel = os.path.relpath(os.path.join(root, d), src_dir)
                if not should_exclude(rel, extra_excludes):
                    keep.append(d)
            dirs[:] = keep
            for f in files:
                full = os.path.join(root, f)
                arcname = os.path.relpath(full, src_dir)
                if not should_exclude(arcname, extra_excludes):
                    tar.add(full, arcname=arcname)
                    file_count += 1

    size_kb = os.path.getsize(tarball_name) / 1024
    print(f"    Tarball: {size_kb:.1f} KB ({file_count} files)")
    return file_count


def verify_tarball(tarball_name, required_files):
    """Verify required files are in the tarball."""
    with tarfile.open(tarball_name, "r:gz") as tar:
        names = tar.getnames()
        all_ok = True
        for req in required_files:
            found = req in names or any(n.startswith(req) for n in names)
            status = "OK" if found else "MISSING"
            print(f"    {req}: {status}")
            if not found:
                all_ok = False
        return all_ok


def deploy_to_alfred(config, tarball_name, skip_wait=False):
    """Upload tarball to Alfred and optionally poll build status."""
    project_name = config["project_name"]
    pid = config["project_id"]

    if not pid:
        print(f"ERROR: Project ID for '{project_name}' is null in alfred.config.json")
        print("       Run: python ../app-delivery-hub/ops/fetch_project_ids.py")
        sys.exit(1)

    # Ensure auth
    print(f"\n[*] Authenticating...")
    ensure_token()

    print(f"\n[*] Deploying '{project_name}' ({pid})...")
    with open(tarball_name, "rb") as f:
        resp = alfred_api(
            "POST",
            f"/api/projects/{pid}/deploy",
            headers={
                "Content-Type": "application/gzip",
                "X-Alfred-Message": f"deploy {project_name}",
            },
            data=f,
            timeout=120,
        )

    print(f"    Response: {resp.status_code}")
    if resp.status_code not in (200, 201, 202):
        print(f"    Deploy failed: {resp.text[:500]}")
        sys.exit(1)

    data = resp.json()
    ver = data.get("version", {}).get("version_number", "?")
    print(f"    Deploy accepted as v{ver}!")
    dep_id = data.get("id")

    if skip_wait or not dep_id:
        print("    Skipping build wait. Check Alfred UI for build status.")
        return

    # Poll build status
    print(f"    Polling build status (Docker build, ~2-5 min)...")
    for i in range(60):  # up to 5 minutes
        time.sleep(5)
        r = alfred_api("GET", f"/api/projects/{pid}/deployments/{dep_id}")
        if r.status_code == 200:
            try:
                d = r.json()
                status = d.get("status")
                elapsed = (i + 1) * 5
                print(f"    [{elapsed}s] status={status}")
                if status == "success":
                    print(f"\n    [OK] DEPLOYED AND LIVE — v{ver}")
                    return
                elif status in ("failed", "error"):
                    print(f"\n    [X] DEPLOY FAILED: {d.get('error_message', 'unknown')}")
                    sys.exit(1)
            except Exception as e:
                pass


    print("    Timed out waiting for build. Check Alfred UI.")


# ── Main ──────────────────────────────────────────────────────────────
def main():
    config = load_config()
    project_name = config["project_name"]
    project_id = config["project_id"]
    required_files = config.get("required_files", ["Dockerfile"])
    extra_excludes = set(config.get("exclude", []))

    skip_wait = "--skip-build-wait" in sys.argv

    tarball = f"{project_name}-deploy.tar.gz"

    file_count = package_project(_project_root, tarball, extra_excludes)
    if file_count == 0:
        print("ERROR: Tarball is empty!")
        sys.exit(1)

    if not verify_tarball(tarball, required_files):
        print("ERROR: Required files missing from tarball!")
        sys.exit(1)

    deploy_to_alfred(
        {"project_name": project_name, "project_id": project_id},
        tarball,
        skip_wait=skip_wait,
    )

    # Cleanup
    os.remove(tarball)
    print(f"    Cleaned up {tarball}")


if __name__ == "__main__":
    main()
