"""Pick the inter-school comps worth signing up for from Exun's sheet.

Exun (DPS RK Puram's tech club) keeps one public Google Sheet of every
symposium it is sending teams to: school, date, registration deadline, and
each event's eligibility and team slots. Members register by putting their
name in the row under an event's green (finalized) row.

This reads that sheet as CSV (public, no key), keeps the events that are
still upcoming and open to Class 11, scores each for fit with Shaurya's goals
(build / AI / pitch events beat gaming, robotics and quizzes), and writes:

  data/exun-comps.json   every upcoming event with its score and reason
  data/lockin.json       a "d-exun-*" dated item for each one worth doing,
                         so it shows up in LOCK IN; stale ones are removed
  data/lockin-scores.json  a score for those items so they rank without Groq

Run:  python scripts/exun_comps.py        (CI: .github/workflows/exun-comps.yml)
      python scripts/exun_comps.py --dry  (print the picks, write nothing)
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCKIN = ROOT / "data" / "lockin.json"
SCORES = ROOT / "data" / "lockin-scores.json"
OUT = ROOT / "data" / "exun-comps.json"

SHEET_ID = "1RLSXcAJ4t44M_wQ_hKlZqaTVmWjwAXrI8FInjHIZRTw"
GID = "1274846673"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}"

GRADE = 11
ME = "shaurya"  # matched case-insensitively against participant cells
PICK_AT = 8  # minimum score (0-10) to become a LOCK IN item: builds only, coding contests (6) stay out
ID_PREFIX = "d-exun-"

MODES = {"online", "hybrid", "offline"}
STATUSES = ("to be conquered", "over", "conquered")
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# Fit with the goals in lockin.json (T20 application, brand proof, AI builder).
# First match wins: low-fit words go first ("Quizzard (AI Quiz)" is a quiz, not
# an AI build), then the specific build words above the generic ones.
FIT = [
    (1, "gaming / robotics / media / quiz: low fit with your goals",
     r"valorant|bedwar|strike|counter|gaming|game|robo|drone|line ?follow|soccer|war\b|race|flying|"
     r"quiz|trivia|meme|video|cine|reel|frame|edit|photo|snap|rhetoric|debate|aawaz|newsroom|"
     r"math|fold|map|mystery|sherlock|check ?mate|chess|nocturne|ready player|surprise"),
    (9, "hackathon / build sprint: ships a real project, strongest T20 and brand proof",
     r"hack|impactathon|build ?blitz|buildathon"),
    (9, "AI build or innovation challenge: your exact lane (AI products that ship)",
     r"\bai\b|innovat|idea|impact|startup|pitch|entrepreneur|shark|venture"),
    (8, "product build (app / dashboard / web): demo-able, reusable for the portfolio",
     r"app|dashboard|webd|web ?weav|webx|web ?wired|product|saas"),
    (6, "coding contest: decent signal, less unique than a build",
     r"code|coding|algo|py|program|consol|crypt|cipher|bid"),
    (4, "design event: fine, but not your edge",
     r"\bui\b|\bux\b|design|vision"),
]
UNKNOWN = (3, "name doesn't say what it is: open the brochure if the school is one you want")


def fetch_rows() -> list[list[str]]:
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": "command-center/exun_comps"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status != 200:
                sys.exit(f"Exun sheet returned HTTP {r.status}")
            ctype = r.headers.get("Content-Type", "")
            body = r.read().decode("utf-8")
    except urllib.error.URLError as e:
        sys.exit(f"Could not fetch the Exun sheet: {e}")
    if "text/csv" not in ctype:
        # A private sheet redirects to a login page that still returns 200.
        sys.exit(f"Exun sheet did not come back as CSV ({ctype}). Has it stopped being public?")
    return [[c.strip() for c in row] for row in csv.reader(io.StringIO(body))]


def parse_dates(text: str, default_year: int) -> list[date]:
    """All dates in a free-text cell: '23-24 October 2026', 'October 27 & 28, 2026', '5th-14th Oct'."""
    t = text.lower()
    month = next((n for m, n in MONTHS.items() if re.search(rf"\b{m}[a-z]*\b", t)), None)
    if not month:
        return []
    years = [int(y) for y in re.findall(r"\b(20\d\d)\b", t)]
    year = years[0] if years else default_year
    days = [int(d) for d in re.findall(r"\b(\d{1,2})(?:st|nd|rd|th)?\b", re.sub(r"\b20\d\d\b", "", t))]
    out = []
    for d in days:
        try:
            out.append(date(year, month, d))
        except ValueError:
            pass
    return out


def grade_ok(elig: str) -> bool:
    e = elig.lower()
    if "open" in e:
        return True
    grades = [int(g) for g in re.findall(r"\b(\d{1,2})(?:st|nd|rd|th)\b", e)]
    if not grades:
        return True  # no grade rule written down: assume open
    return min(grades) <= GRADE <= max(grades)


def team_size(elig: str) -> int:
    m = re.search(r"(\d+)\s*x\s*(\d+)", elig.lower())
    return max(int(m.group(1)), int(m.group(2))) if m else 1


def names(cells: list[str]) -> list[str]:
    return [c for c in cells if c and c != "-"]


def parse(rows: list[list[str]], today: date) -> list[dict]:
    """Symposium blocks between the header row and 'PAST EVENTS'."""
    def a(i: int) -> str:
        return rows[i][0] if i < len(rows) and rows[i] else ""

    def is_header(i: int) -> bool:
        cur, nxt = a(i).lower(), a(i + 1).lower()
        if not cur or cur in MODES or cur.startswith(STATUSES):
            return False  # a mode/status line sits under the name, it is not a name itself
        return nxt in MODES or nxt.startswith(STATUSES)

    end = next((i for i, r in enumerate(rows) if r and r[0].upper() == "PAST EVENTS"), len(rows))
    starts = [i for i in range(2, end) if is_header(i)]
    syms = []
    for n, s in enumerate(starts):
        lo = 2 if n == 0 else s  # events listed above the first header belong to it
        hi = starts[n + 1] if n + 1 < len(starts) else end
        sym = {"name": a(s), "mode": "", "status": "", "school": "", "dates": [], "deadline": None,
               "registered": False, "incharge": "", "events": []}
        labels = []
        for i in range(s + 1, hi):
            v = a(i)
            lv = v.lower()
            if not v:
                continue
            if lv in MODES:
                sym["mode"] = v
            elif lv.startswith(STATUSES):
                sym["status"] = v.upper()
            elif lv.startswith("registration deadline"):
                d = parse_dates(v, today.year)
                sym["deadline"] = max(d) if d else None
            elif lv == "registered":
                sym["registered"] = True
            elif lv.startswith("student in"):
                sym["incharge"] = v.split(":", 1)[-1].strip()
            elif parse_dates(v, today.year) and not sym["dates"]:
                sym["dates"] = parse_dates(v, today.year)
                sym["date_text"] = v
            elif lv not in {"website", "brochure", "discord", "registration", "registration link",
                            "school registration", "more details"} and not sym["school"] and sym["status"]:
                sym["school"] = v
            labels.append(v)
        for i in range(lo, hi):
            r = rows[i]
            if len(r) > 2 and r[1] and r[2]:
                below = rows[i + 1] if i + 1 < hi else []
                signups = names(below[3:15]) if len(below) > 1 and not below[1] else []
                sym["events"].append({
                    "event": r[1], "eligibility": r[2], "team": team_size(r[2]),
                    "finalized": names(r[3:15]), "signups": signups,
                })
        syms.append(sym)
    return syms


def fit(event: str) -> tuple[int, str]:
    e = event.lower()
    for score, why, pat in FIT:
        if re.search(pat, e):
            return score, why
    return UNKNOWN


def judge(syms: list[dict], today: date) -> list[dict]:
    out = []
    for s in syms:
        if s["status"] in {"OVER", "CONQUERED"}:
            continue
        last = max(s["dates"]) if s["dates"] else None
        if last and last < today:
            continue
        for ev in s["events"]:
            if not grade_ok(ev["eligibility"]):
                continue
            score, why = fit(ev["event"])
            notes = [why]
            open_slots = max(ev["team"] - len(ev["finalized"]), 0)
            mine = [n for n in ev["finalized"] + ev["signups"] if ME in n.lower()]
            if open_slots:
                notes.append(f"{open_slots} of {ev['team']} slots open")
            else:
                score -= 2
                notes.append("team already full: you'd go in the row below as a reserve")
            if s["deadline"] and s["deadline"] < today:
                score -= 3
                notes.append("school's deadline has passed: only if the in-charge can still add names")
            if last and (last - today).days <= 1:
                score -= 4
                notes.append("happens within a day: too late to prepare")
            out.append({
                "symposium": s["name"], "school": s["school"], "mode": s["mode"],
                "date": s.get("date_text", ""), "last_day": last.isoformat() if last else None,
                "deadline": s["deadline"].isoformat() if s["deadline"] else None,
                "incharge": s["incharge"], "event": ev["event"], "eligibility": ev["eligibility"],
                "finalized": ev["finalized"], "signups": ev["signups"],
                "score": max(0, min(10, score)), "why": "; ".join(notes), "you_are_in": bool(mine),
            })
    return sorted(out, key=lambda x: (-x["score"], x["last_day"] or "9999"))


def slug(*parts: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", " ".join(parts).lower()).strip("-")[:48]


def lockin_item(p: dict, first_seen: str) -> dict:
    dl = f", sign up by {p['deadline']}" if p["deadline"] else ""
    where = ", ".join(x for x in [p["school"], p["mode"]] if x)
    team = ", ".join(p["finalized"]) or "nobody yet"
    queue = ", ".join(p["signups"]) or "nobody"
    return {
        "id": ID_PREFIX + slug(p["symposium"], p["event"]),
        "date": first_seen,
        "track": "t20",
        "title": f"Exun: put your name down for {p['event']} at {p['symposium']} ({p['date']}){dl}",
        "minutes": 10,
        "how": [
            f"WHY: {p['why']}.",
            f"WHAT: {p['event']} ({p['eligibility']}) at {p['symposium']}, {where}.",
            f"TEAM SO FAR: {team}. Signed up below them: {queue}.",
            "HOW: open the Exun sheet, find this event, and type your name in the row UNDER the green boxes "
            "(green = finalized). Then message the student in-charge"
            + (f" ({p['incharge']})" if p["incharge"] and p["incharge"] != "TBD" else "")
            + " so they move you up.",
            f"SHEET: {SHEET_URL}",
            "Brochure and registration links are in the symposium's column on the sheet. Tick this once your name is in.",
        ],
    }


def main() -> None:
    dry = "--dry" in sys.argv
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()  # IST, not the runner's UTC
    judged = judge(parse(fetch_rows(), today), today)
    picks = [p for p in judged if p["score"] >= PICK_AT and not p["you_are_in"]]

    for p in judged:
        mark = "PICK" if p in picks else "    "
        print(f"{mark} {p['score']:>2}  {p['event'][:28]:<28} {p['symposium'][:18]:<18} {p['why']}")
    if dry:
        return

    data = json.loads(LOCKIN.read_text(encoding="utf-8"))
    old = {d["id"]: d for d in data["dated"] if d["id"].startswith(ID_PREFIX)}
    items = []
    for p in picks:
        iid = ID_PREFIX + slug(p["symposium"], p["event"])
        items.append(lockin_item(p, old[iid]["date"] if iid in old else today.isoformat()))
    data["dated"] = [d for d in data["dated"] if not d["id"].startswith(ID_PREFIX)] + items
    LOCKIN.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    sc = json.loads(SCORES.read_text(encoding="utf-8")) if SCORES.exists() else {"scores": {}}
    sc["scores"] = {k: v for k, v in sc["scores"].items() if not k.startswith(ID_PREFIX)}
    for p, it in zip(picks, items):
        sc["scores"][it["id"]] = {"score": p["score"], "goal": "t20", "why": p["why"].split(";")[0], "hash": "exun"}
    SCORES.write_text(json.dumps(sc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    OUT.write_text(json.dumps({"checked": today.isoformat(), "sheet": SHEET_URL, "events": judged},
                              indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n{len(judged)} upcoming events you're eligible for, {len(picks)} picked into LOCK IN")


if __name__ == "__main__":
    main()
