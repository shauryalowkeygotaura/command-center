"""Emit public/status/now.json - the "site-alive" feed the portfolio reads.

Two halves, exactly per the integration contract's nowJsonSchema:

  shipping{ last_commit{repo,message,sha,at,url}, commits_7d, active_repo }
      Pulled live from the GitHub events API for GH_OWNER using GITHUB_TOKEN
      (Doppler-provided; run `doppler run -- python scripts/build_now.py`).
      Token is optional here - the endpoint works unauthenticated at a lower
      rate limit, so a missing token degrades, never crashes.

  studying{ sat_target, sat_test_date, cards_due, cards_reviewed_today,
            streak_days, current_focus, last_session_at }
      Comes from the SAT GRIND tab's SM-2 localStorage state, exported by the
      tab as data/now-studying.json (the only bridge from client state to this
      static feed). If that snapshot is missing/stale we fall back to seed
      defaults so the feed still renders.

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
STUDY_SNAPSHOT = REPO / "data" / "now-studying.json"

# Seed defaults for the studying half - used until the SAT tab exports a
# fresher data/now-studying.json. Keep in sync with lib/sat.ts SAT_TARGET /
# SAT_TEST_DATE.
STUDY_DEFAULT = {
    "sat_target": 1550,
    "sat_test_date": "2026-08",
    "cards_due": 0,
    "cards_reviewed_today": 0,
    "streak_days": 0,
    "current_focus": "SAT math fundamentals",
    "last_session_at": None,
}

# Only these keys are accepted from the snapshot (whitelist over trusting the
# file wholesale) so a malformed export can never inject arbitrary fields.
STUDY_KEYS = set(STUDY_DEFAULT.keys())


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


def _studying() -> dict:
    """Studying half from the SAT tab snapshot, falling back to seed defaults.
    Whitelist the known keys so a bad export can't inject fields."""
    out = dict(STUDY_DEFAULT)
    if not STUDY_SNAPSHOT.exists():
        return out
    try:
        snap = json.loads(STUDY_SNAPSHOT.read_text(encoding="utf-8"))
    except (ValueError, OSError) as e:
        print(f"WARN: now-studying snapshot unreadable, using defaults: {e}")
        return out
    if not isinstance(snap, dict):
        return out
    for k in STUDY_KEYS:
        if k in snap:
            out[k] = snap[k]
    return out


def _status_line(shipping: dict, studying: dict) -> str:
    """One pre-rendered human line so the portfolio needs zero logic."""
    parts: list[str] = []
    active = shipping.get("active_repo")
    if active:
        parts.append(f"shipping {active}")
    elif shipping.get("commits_7d"):
        parts.append(f"{shipping['commits_7d']} commits this week")
    due = studying.get("cards_due", 0)
    target = studying.get("sat_target")
    if due:
        parts.append(f"{due} SAT cards due (target {target})")
    else:
        parts.append(f"SAT deck clear (target {target})")
    return " · ".join(parts) if parts else "building in public"


def main() -> None:
    shipping = _shipping()
    studying = _studying()
    feed = {
        "generated_at": _utc_now_iso(),
        "status_line": _status_line(shipping, studying),
        "shipping": shipping,
        "studying": studying,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
