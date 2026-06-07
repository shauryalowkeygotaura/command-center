"""Google Classroom -> deadlines feed WITHOUT the API.

The school Workspace admin blocks third-party OAuth (verified 2026-06-08),
so this drives a real Chrome session against classroom.google.com instead:
a persistent browser profile holds the login, the To-do page gets scraped,
and the result is written to public/status/classroom-deadlines.json and
pushed (the DeadlineRail reads it via raw.githubusercontent).

One-time:  python scripts/classroom_scrape.py --login
           (a window opens; log into the SCHOOL account; it closes itself)
Cron:      python scripts/classroom_scrape.py
           (headless scrape + throttled commit/push, scheduled-task friendly)

The profile lives in ~/.claude/classroom-profile (outside OneDrive on
purpose; sync would corrupt the Chrome profile locks).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

PROFILE = Path.home() / ".claude" / "classroom-profile"
REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "public" / "status" / "classroom-deadlines.json"
DEBUG_HTML = Path.home() / ".claude" / "classroom-last.html"
TODO_URL = "https://classroom.google.com/a/not-turned-in/all"

MONTHS = {
    m.lower(): i + 1
    for i, m in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    )
}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def find_chrome() -> str | None:
    """The pip-pinned chromium rev may not be downloaded; reuse any cached one."""
    base = Path.home() / "AppData" / "Local" / "ms-playwright"
    hits = sorted(base.glob("chromium-*/chrome-win64/chrome.exe"))
    return str(hits[-1]) if hits else None


def parse_due(text: str, now: datetime) -> str | None:
    """'Due today' / 'Due tomorrow' / 'Due Monday' / 'Due 12 Jun' /
    'Due Jun 12' / 'Due Jun 12, 2027' -> YYYY-MM-DD (best effort)."""
    t = text.lower().replace("due", " ").strip()
    if "today" in t:
        return now.strftime("%Y-%m-%d")
    if "tomorrow" in t:
        return (now + timedelta(days=1)).strftime("%Y-%m-%d")
    for i, wd in enumerate(WEEKDAYS):
        if wd in t:
            delta = (i - now.weekday()) % 7 or 7  # "Due Monday" = the NEXT one
            return (now + timedelta(days=delta)).strftime("%Y-%m-%d")
    # "12 jun [2027]" or "jun 12[, 2027]"
    m = re.search(r"(\d{1,2})\s+([a-z]{3,9})(?:,?\s+(\d{4}))?", t) or re.search(
        r"([a-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?", t
    )
    if not m:
        return None
    g = m.groups()
    if g[0].isdigit():
        day, mon_name, year_s = int(g[0]), g[1][:3], g[2]
    else:
        day, mon_name, year_s = int(g[1]), g[0][:3], g[2]
    mon = MONTHS.get(mon_name)
    if not mon or not (1 <= day <= 31):
        return None
    year = int(year_s) if year_s else now.year
    if not year_s and (mon, day) < (now.month, now.day):
        year += 1  # bare "Jan 14" seen in June means next year
    try:
        return datetime(year, mon, day).strftime("%Y-%m-%d")
    except ValueError:
        return None


def scrape(headless: bool) -> list[dict]:
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE),
            headless=headless,
            executable_path=find_chrome(),
            viewport={"width": 1280, "height": 900},
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(TODO_URL, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(5_000)
            if "accounts.google.com" in page.url:
                sys.exit("not logged in — run with --login first")
            DEBUG_HTML.write_text(page.content(), encoding="utf-8")

            now = datetime.now()
            items: list[dict] = []
            seen: set[str] = set()
            # Assignment rows link into /c/<course>/a/<coursework>/details.
            for link in page.locator('a[href*="/a/"]').all():
                href = link.get_attribute("href") or ""
                m = re.search(r"/c/([\w-]+)/a/([\w-]+)", href)
                if not m:
                    continue
                cw_id = m.group(2)
                if cw_id in seen:
                    continue
                lines = [s.strip() for s in (link.inner_text() or "").split("\n") if s.strip()]
                if not lines:
                    continue
                due_line = next((s for s in lines if re.search(r"due", s, re.I)), None)
                date = parse_due(due_line, now) if due_line else None
                if not date:
                    continue
                title = lines[0]
                course = next(
                    (s for s in lines[1:] if s != due_line and not re.search(r"due", s, re.I)),
                    "",
                )
                seen.add(cw_id)
                items.append({"id": cw_id, "title": title, "course": course, "date": date})
        finally:
            ctx.close()
    items.sort(key=lambda it: (it["date"], it["title"]))
    return items


def login() -> None:
    """Open a headful window and wait until the school login sticks."""
    PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE),
            headless=False,
            executable_path=find_chrome(),
            viewport={"width": 1280, "height": 900},
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://classroom.google.com", timeout=60_000)
        print("log into the SCHOOL account in the window…")
        for _ in range(100):  # up to ~5 minutes
            page.wait_for_timeout(3_000)
            if "classroom.google.com" in page.url and "accounts.google" not in page.url:
                page.wait_for_timeout(3_000)
                print("login captured — profile saved, closing.")
                break
        else:
            print("timed out waiting for login (5 min) — run --login again")
        ctx.close()


def push(count: int) -> None:
    def git(*args: str) -> None:
        r = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)
        if r.returncode:
            sys.exit(f"git {args[0]} failed: {r.stderr.strip()}")

    # These two PROBE git state: returncode is the answer (1 = changed /
    # untracked), not an error. Real failures get caught by the git() helper
    # on the very next mutating call.
    diff = subprocess.run(
        ["git", "diff", "--quiet", "--", str(OUT.relative_to(REPO))], cwd=REPO
    )
    untracked = not diff.returncode and subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(OUT.relative_to(REPO))],
        cwd=REPO,
        capture_output=True,
    ).returncode
    if diff.returncode or untracked:
        git("add", str(OUT.relative_to(REPO)))
        git("commit", "-m", f"chore: refresh classroom deadlines ({count} items)")
        git("pull", "--rebase", "origin", "main")
        git("push")
        print("pushed feed")
    else:
        print("feed unchanged — no push")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true", help="one-time interactive login")
    ap.add_argument("--no-push", action="store_true", help="scrape only, skip git push")
    ap.add_argument("--headful", action="store_true", help="visible browser (debugging)")
    args = ap.parse_args()

    if args.login:
        login()
        return

    items = scrape(headless=not args.headful)
    feed = {"ts": datetime.utcnow().isoformat() + "Z", "items": items}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(items)} deadlines -> {OUT}")
    for it in items:
        print(f"  {it['date']}  [{it['course']}] {it['title']}")
    if not args.no_push:
        push(len(items))


if __name__ == "__main__":
    main()
