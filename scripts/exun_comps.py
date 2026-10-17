"""Pick the inter-school comps worth signing up for from Exun's sheet.

Exun (DPS RK Puram's tech club) keeps one public Google Sheet of every
symposium it is sending teams to: school, date, registration deadline, and
each event's eligibility and team slots. Members register by putting their
name in the row under an event's green (finalized) row.

This reads that sheet as CSV (public, no key), keeps the symposiums that are
still upcoming, and ranks each one by how recognized it is, using the signals
the sheet itself carries: Exun's own priority tag ("AT ALL COSTS"), how many
Exun members want in, how many events it runs, and whether it is in person.
It keeps the top PER_MONTH symposiums per calendar month (fests you are
already on count toward that), picks the best event at each for Class 11,
and writes:

  data/exun-comps.json   every upcoming symposium and event, scored, with reasons
  data/lockin.json       one "d-exun-*" dated item per picked symposium, so it
                         shows up in LOCK IN; stale ones are removed
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
PER_MONTH = 4  # symposiums to attend per calendar month
MIN_RANK = 4.0  # a symposium below this (0-10) is skipped even if the month has room
ID_PREFIX = "d-exun-"

# Fests you know are big that the sheet's signals undersell: name fragment -> bonus.
PRESTIGE: dict[str, float] = {}

MODES = {"online", "hybrid", "offline"}
STATUSES = ("to be conquered", "over", "conquered")
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# Which event to enter once a symposium is picked. First match wins: gaming,
# robotics and media go first ("Quizzard (AI Quiz)" is a quiz, not an AI build),
# then the specific build words above the generic ones.
FIT = [
    (2, "gaming / robotics / media: not your lane",
     r"valorant|bedwar|strike|counter|gaming|game|robo|drone|line ?follow|soccer|war\b|race|flying|"
     r"meme|video|cine|reel|frame|edit|photo|snap|nocturne|ready player|virtual warrior|fold"),
    (9, "hackathon / build sprint: ships a real project, strongest T20 and brand proof",
     r"hack|impactathon|build ?blitz|buildathon"),
    (9, "AI or innovation challenge: your exact lane",
     r"\bai\b|innovat|idea|impact|startup|pitch|entrepreneur|shark|venture"),
    (8, "product build (app / dashboard / web): demo-able, goes in the portfolio",
     r"app|dashboard|webd|web ?weav|webx|web ?wired|product|saas"),
    (7, "coding / crypto hunt: classic symposium event, judges know it",
     r"code|coding|algo|py|program|consol|crypt|cipher|bid|enigma|sherlock|mystery|hunt"),
    (6, "quiz / debate / pitch-style talk: recognized format, no build needed",
     r"quiz|trivia|rhetoric|debate|crossfire|aawaz|newsroom|math|advert|map"),
    (5, "design event: fine, not your strongest",
     r"\bui\b|\bux\b|design|vision"),
]
UNKNOWN = (4, "name doesn't say what it is: open the brochure")


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


def judge_event(s: dict, ev: dict) -> dict:
    score, why = fit(ev["event"])
    notes = [why]
    open_slots = max(ev["team"] - len(ev["finalized"]), 0)
    if open_slots:
        notes.append(f"{open_slots} of {ev['team']} slots open")
    else:
        score -= 2
        notes.append("team already full: you'd go in the row below as a reserve")
    return {
        "event": ev["event"], "eligibility": ev["eligibility"],
        "finalized": ev["finalized"], "signups": ev["signups"],
        "score": max(0, min(10, score)), "why": "; ".join(notes),
        "you_are_in": any(ME in n.lower() for n in ev["finalized"] + ev["signups"]),
    }


def rank(s: dict, events: list[dict], today: date) -> tuple[float, list[str]]:
    """0-10: how recognized the symposium is, from what the sheet says about it."""
    pts, why = 0.0, []
    status = s["status"]
    if "AT ALL COSTS" in status:
        pts += 3
        why.append("Exun tagged it TO BE CONQUERED AT ALL COSTS (their top priority)")
    elif "TO BE CONQUERED" in status:
        pts += 1
    people = {n.lower().split("[")[0].split("(")[0].strip()
              for ev in s["events"] for n in ev["finalized"] + ev["signups"]}
    pts += min(3.0, len(people) / 6)
    why.append(f"{len(people)} Exun members want in")
    pts += min(2.0, len(s["events"]) / 6)
    why.append(f"{len(s['events'])} events")
    if s["mode"].lower() in {"offline", "hybrid"}:
        pts += 1
        why.append("in person")
    elif s["mode"]:
        why.append("online only")
    else:
        pts += 0.5  # sheet doesn't say: don't punish it like an online-only fest
        why.append("format not listed")
    bonus = sum(b for frag, b in PRESTIGE.items() if frag.lower() in s["name"].lower())
    if bonus:
        pts += bonus
        why.append("on your prestige list")
    best = max((e["score"] for e in events), default=0)
    pts += best / 10
    if s["deadline"] and s["deadline"] < today:
        pts -= 3
        why.append("school's deadline has passed: only if the in-charge can still add names")
    return round(max(0.0, min(10.0, pts)), 1), why


def judge(syms: list[dict], today: date) -> list[dict]:
    out = []
    for s in syms:
        if s["status"].startswith(("OVER", "CONQUERED")):
            continue
        first = min(s["dates"]) if s["dates"] else None
        if first and (first - today).days <= 1:
            continue  # today/tomorrow or past: too late to sign up and prepare
        events = sorted((judge_event(s, ev) for ev in s["events"] if grade_ok(ev["eligibility"])),
                        key=lambda e: -e["score"])
        if not events:
            continue
        r, why = rank(s, events, today)
        out.append({
            "symposium": s["name"], "school": s["school"], "mode": s["mode"],
            "date": s.get("date_text", ""), "first_day": first.isoformat() if first else None,
            "deadline": s["deadline"].isoformat() if s["deadline"] else None,
            "incharge": s["incharge"], "rank": r, "why": why,
            "you_are_in": any(e["you_are_in"] for e in events), "events": events,
        })
    return sorted(out, key=lambda x: (-x["rank"], x["first_day"] or "9999"))


def choose(judged: list[dict]) -> list[dict]:
    """Top PER_MONTH per calendar month; fests you are already on use up a slot."""
    picks, used = [], {}
    for s in judged:
        if s["you_are_in"]:
            m = (s["first_day"] or "")[:7]
            used[m] = used.get(m, 0) + 1
    for s in judged:  # already sorted best first
        m = (s["first_day"] or "")[:7]
        if s["you_are_in"] or s["rank"] < MIN_RANK or used.get(m, 0) >= PER_MONTH:
            continue
        used[m] = used.get(m, 0) + 1
        picks.append(s)
    return picks


def slug(*parts: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", " ".join(parts).lower()).strip("-")[:48]


def lockin_item(s: dict, first_seen: str) -> dict:
    top = [e for e in s["events"] if e["score"] >= 5][:3] or s["events"][:1]
    best = top[0]
    dl = f", sign up by {s['deadline']}" if s["deadline"] else ""
    where = ", ".join(x for x in [s["school"], s["mode"]] if x)
    lines = [
        f"WHY THIS FEST (rank {s['rank']}/10): {'; '.join(s['why'])}.",
        f"WHERE: {where}.",
    ]
    for e in top:
        team = ", ".join(e["finalized"]) or "nobody yet"
        lines.append(f"EVENT: {e['event']} ({e['eligibility']}): {e['why']}. Team so far: {team}.")
    lines += [
        "HOW: open the Exun sheet, find the event, and type your name in the row UNDER the green boxes "
        "(green = finalized). Then message the student in-charge"
        + (f" ({s['incharge']})" if s["incharge"] and s["incharge"] != "TBD" else "")
        + " so they move you up.",
        f"SHEET: {SHEET_URL}",
        "Brochure and registration links are in the symposium's column on the sheet. Tick this once your name is in.",
    ]
    return {
        "id": ID_PREFIX + slug(s["symposium"]),
        "date": first_seen,
        "track": "t20",
        "title": f"Exun: get on {s['symposium']} ({s['date']}), best event for you: {best['event']}{dl}",
        "minutes": 10,
        "how": lines,
    }


def main() -> None:
    dry = "--dry" in sys.argv
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()  # IST, not the runner's UTC
    judged = judge(parse(fetch_rows(), today), today)
    picks = choose(judged)

    for s in judged:
        mark = "IN  " if s["you_are_in"] else "PICK" if s in picks else "    "
        best = s["events"][0]
        print(f"{mark} {s['rank']:>4}  {s['symposium'][:20]:<20} {(s['first_day'] or '?'):<10} "
              f"best: {best['event'][:26]:<26} | {'; '.join(s['why'])}")
    if dry:
        return

    data = json.loads(LOCKIN.read_text(encoding="utf-8"))
    old = {d["id"]: d for d in data["dated"] if d["id"].startswith(ID_PREFIX)}
    items = []
    for s in picks:
        iid = ID_PREFIX + slug(s["symposium"])
        items.append(lockin_item(s, old[iid]["date"] if iid in old else today.isoformat()))
    data["dated"] = [d for d in data["dated"] if not d["id"].startswith(ID_PREFIX)] + items
    LOCKIN.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    sc = json.loads(SCORES.read_text(encoding="utf-8")) if SCORES.exists() else {"scores": {}}
    sc["scores"] = {k: v for k, v in sc["scores"].items() if not k.startswith(ID_PREFIX)}
    for s, it in zip(picks, items):
        sc["scores"][it["id"]] = {"score": round(s["rank"]), "goal": "t20", "why": s["why"][0], "hash": "exun"}
    SCORES.write_text(json.dumps(sc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    OUT.write_text(json.dumps({"checked": today.isoformat(), "sheet": SHEET_URL, "per_month": PER_MONTH,
                               "symposiums": judged}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n{len(judged)} upcoming symposiums, {len(picks)} picked into LOCK IN ({PER_MONTH}/month)")


if __name__ == "__main__":
    main()
