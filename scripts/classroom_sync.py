"""Google Classroom -> deadlines feed for the command-center rail.

Pulls every ACTIVE course's pending coursework (skips TURNED_IN/RETURNED),
converts due dates to IST calendar days, and writes
public/status/classroom-deadlines.json. The DeadlineRail reads that file via
raw.githubusercontent (cc-usage pattern), so committing it is "deploying" it.

Auth: reuses the refresh token cached by the one-time mcp-classroom OAuth
(`~/.mcp-classroom/tokens.json`). In GitHub Actions, put that file's contents
in the CLASSROOM_TOKEN_JSON secret. The blob is self-contained (token +
refresh_token + client id/secret), so no other config is needed.

Run locally:  python scripts/classroom_sync.py
Run in CI:    .github/workflows/classroom.yml (cron, skips if secret unset)
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

IST = timezone(timedelta(hours=5, minutes=30))
OUT_PATH = Path(__file__).resolve().parent.parent / "public" / "status" / "classroom-deadlines.json"
TOKEN_PATH = Path.home() / ".mcp-classroom" / "tokens.json"
# Read-only is all this feed needs; the cached token may carry broader scopes
# (it was minted by mcp-classroom) — that's fine, we just don't use them.
SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me",
]
# Keep recently-overdue items visible (nag value), drop ancient ones.
WINDOW_PAST_DAYS = 7
WINDOW_FUTURE_DAYS = 180


def load_credentials() -> Credentials:
    raw = os.environ.get("CLASSROOM_TOKEN_JSON", "").strip()
    if not raw and TOKEN_PATH.exists():
        raw = TOKEN_PATH.read_text(encoding="utf-8")
    if not raw:
        sys.exit("no CLASSROOM_TOKEN_JSON env and no ~/.mcp-classroom/tokens.json — run the one-time OAuth first")
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        sys.exit(f"token blob is not valid JSON ({exc}) — re-copy tokens.json into the secret")

    creds = Credentials.from_authorized_user_info(info)
    if not creds.valid:
        if not creds.refresh_token:
            sys.exit("cached token has no refresh_token — redo the one-time OAuth")
        creds.refresh(Request())
    return creds


def due_to_ist_date(due_date: dict, due_time: dict | None) -> str | None:
    """Classroom dueDate/dueTime are UTC; convert to the IST calendar day."""
    year = due_date.get("year")
    month = due_date.get("month")
    day = due_date.get("day")
    if not (year and month and day):
        return None
    hours = (due_time or {}).get("hours", 23)
    minutes = (due_time or {}).get("minutes", 59)
    dt = datetime(year, month, day, hours, minutes, tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime("%Y-%m-%d")


def main() -> None:
    creds = load_credentials()
    service = build("classroom", "v1", credentials=creds)

    today = datetime.now(IST).date()
    lo = today - timedelta(days=WINDOW_PAST_DAYS)
    hi = today + timedelta(days=WINDOW_FUTURE_DAYS)

    items: list[dict] = []
    courses = service.courses().list(courseStates="ACTIVE").execute().get("courses", [])
    print(f"courses: {len(courses)}")

    for course in courses:
        course_id = course.get("id")
        if not course_id:
            continue
        course_name = course.get("name", "Class")

        coursework = (
            service.courses().courseWork().list(courseId=course_id).execute().get("courseWork", [])
        )
        # Submission states for "me" across all coursework in the course.
        try:
            subs = (
                service.courses()
                .courseWork()
                .studentSubmissions()
                .list(courseId=course_id, courseWorkId="-", userId="me")
                .execute()
                .get("studentSubmissions", [])
            )
            state_by_cw = {s.get("courseWorkId"): s.get("state") for s in subs}
        except Exception as exc:  # noqa: BLE001 — a course without access shouldn't kill the run
            print(f"  ! submissions unavailable for {course_name}: {exc}")
            state_by_cw = {}

        for cw in coursework:
            cw_id = cw.get("id")
            if not cw_id:
                continue
            if state_by_cw.get(cw_id) in ("TURNED_IN", "RETURNED"):
                continue
            due = cw.get("dueDate")
            if not due:
                continue
            date_str = due_to_ist_date(due, cw.get("dueTime"))
            if not date_str:
                continue
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            if not (lo <= d <= hi):
                continue
            items.append(
                {
                    "id": cw_id,
                    "title": cw.get("title", "Untitled"),
                    "course": course_name,
                    "date": date_str,
                }
            )

    items.sort(key=lambda it: (it["date"], it["title"]))
    feed = {"ts": datetime.now(timezone.utc).isoformat(), "items": items}

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(items)} deadlines -> {OUT_PATH}")


if __name__ == "__main__":
    main()
