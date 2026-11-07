"""Emit public/status/now.json - the "site-alive" feed the portfolio reads.

One half (the SAT "studying" half was removed 2026-11-07 with the SAT tab):

  shipping{ last_commit{repo,message,sha,at,url}, commits_7d, active_repo }
      Pulled live from the GitHub events API for GH_OWNER using GITHUB_TOKEN
      (Doppler-provided; run `doppler run -- python scripts/build_now.py`).
      Token is optional here - the endpoint works unauthenticated at a lower
      rate limit, so a missing token degrades, never crashes.


Plus generated_at (ISO8601 UTC) and a pre-rendered status_line so the portfolio
needs zero logic.

Hard rules honored: every HTTP call checks status and wraps JSON parsing in
try/except; no half is ever allowed to throw; FREE only (GitHub API, no paid
service); no secrets hardcoded.

Run:  doppler run -- python scripts/build_now.py
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

GH_OWNER = "shauryalowkeygotaura"  # mirrors lib/pipelines.ts GH_OWNER
REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "public" / "status" / "now.json"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _gh_events() -> list:
    """Most recent public events for GH_OWNER, or [] on any failure."""
    url = f"https://api.github.com/users/{GH_OWNER}/events/public?per_page=100"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "command-center-now-feed",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                print(f"WARN: GitHub events HTTP {resp.status}")
                return []
            raw = resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        print(f"WARN: GitHub events fetch failed: {e}")
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError) as e:
        print(f"WARN: GitHub events JSON parse failed: {e}")
        return []
    return data if isinstance(data, list) else []


def _shipping() -> dict:
    """Build the shipping half from push events. Every field individually
    optional - the panel renders whatever exists."""
    events = _gh_events()
    pushes = [e for e in events if isinstance(e, dict) and e.get("type") == "PushEvent"]
    if not pushes:
        return {}

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    commits_7d = 0
    for e in pushes:
        at = _parse_iso(e.get("created_at"))
        if at and at >= cutoff:
            commits_7d += len(e.get("payload", {}).get("commits", []) or [])

    latest = pushes[0]
    repo_name = (latest.get("repo", {}) or {}).get("name", "")  # "owner/repo"
    short_repo = repo_name.split("/")[-1] if repo_name else None
    commits = latest.get("payload", {}).get("commits", []) or []
    head = commits[-1] if commits else {}
    sha = head.get("sha")

    last_commit = {}
    if short_repo:
        last_commit["repo"] = short_repo
    if head.get("message"):
        last_commit["message"] = head["message"].splitlines()[0][:160]
    if sha:
        last_commit["sha"] = sha[:7]
    if latest.get("created_at"):
        last_commit["at"] = latest["created_at"]
    if repo_name and sha:
        last_commit["url"] = f"https://github.com/{repo_name}/commit/{sha}"

    shipping: dict = {}
    if last_commit:
        shipping["last_commit"] = last_commit
    shipping["commits_7d"] = commits_7d
    if short_repo:
        shipping["active_repo"] = short_repo
    return shipping


def _parse_iso(s: str | None):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _status_line(shipping: dict) -> str:
    """One pre-rendered human line so the portfolio needs zero logic."""
    parts: list[str] = []
    active = shipping.get("active_repo")
    if active:
        parts.append(f"shipping {active}")
    elif shipping.get("commits_7d"):
        parts.append(f"{shipping['commits_7d']} commits this week")
    return " · ".join(parts) if parts else "building in public"


def main() -> None:
    shipping = _shipping()
    feed = {
        "generated_at": _utc_now_iso(),
        "status_line": _status_line(shipping),
        "shipping": shipping,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
