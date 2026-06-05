"""Regenerate the Command Center token feed and publish it to the PUBLIC repo.

This is what the Claude Code Stop hook calls after every turn. It:
  1. runs update_cc_usage.py to refresh public/status/cc-usage.json, then
  2. (throttled) commits & pushes ONLY that file to main.

The live deployed dashboard reads the file from raw.githubusercontent, so a push
makes it current with no Pages rebuild (deploy.yml paths-ignores the file). raw
has a ~5-min CDN cache, so pushing more often than that is wasted -> THROTTLE=300s.

Everything fails soft: this runs unattended and must never disrupt a session. It
also takes a lock so overlapping turns don't race git.

NOTE: token usage (tokens, $/day, $/hr burn) becomes PUBLICLY visible by design.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
REL_JSON = "public/status/cc-usage.json"
MARKER = REPO / "public" / "status" / ".last_push"   # gitignored
LOCK = REPO / "public" / "status" / ".push_lock"     # gitignored
THROTTLE_SECONDS = 300
LOCK_STALE_SECONDS = 120  # a lock older than this is presumed orphaned


def _git(*args: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(REPO), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def main() -> None:
    # 1. Always refresh the data, even if we won't push this time -- a local
    #    `npm run dev` or the next push will pick up the freshest file.
    try:
        subprocess.run(
            [sys.executable, str(REPO / "scripts" / "update_cc_usage.py")],
            timeout=60,
            check=False,
        )
    except Exception as e:
        print(f"WARN: regen failed: {e}")
        return

    # 2. Throttle: skip the push if we pushed recently (raw caches ~5min anyway).
    now = time.time()
    try:
        if MARKER.exists() and now - MARKER.stat().st_mtime < THROTTLE_SECONDS:
            return
    except OSError:
        pass

    # 3. Lock so two overlapping turns don't both push and race git.
    try:
        if LOCK.exists() and now - LOCK.stat().st_mtime < LOCK_STALE_SECONDS:
            return
        LOCK.write_text(str(now))
    except OSError:
        return

    try:
        # Stage only the token file -- never sweep up unrelated working changes.
        if _git("add", REL_JSON).returncode != 0:
            return
        # Nothing staged (file unchanged) -> diff --cached is quiet, exit 0.
        if _git("diff", "--cached", "--quiet", "--", REL_JSON).returncode == 0:
            return
        commit = _git("commit", "-m", "chore: refresh cc token usage", "--", REL_JSON)
        if commit.returncode != 0:
            print(f"WARN: commit failed: {commit.stderr.strip()}")
            return
        push = _git("push", "origin", "HEAD:main", timeout=45)
        if push.returncode != 0:
            print(f"WARN: push failed: {push.stderr.strip()}")
            return
        try:
            MARKER.write_text(str(now))
        except OSError:
            pass
        print("Published cc-usage.json to main")
    finally:
        try:
            LOCK.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    main()
