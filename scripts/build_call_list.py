#!/usr/bin/env python3
"""
build_call_list.py - produce today's fresh clinic leads for the dashboard.

Pulls local-business listings (dental clinics, dentists) from Google Maps via
SerpAPI, dedupes against every lead ever emitted (public/calls/_seen.json), and
writes the next TARGET fresh leads to ../public/calls/<today>.json. The
dashboard's CALL + MESSAGE panel auto-loads that file on open (CallList.tsx).

Each lead is {number, label, whatsapp, area, website}:
  - whatsapp : wa.me-ready digits (91XXXXXXXXXX) for mobiles, "" for landlines
                so the panel can offer a one-tap WhatsApp message.

KEY ROTATION (stay on the free tier)
------------------------------------
SerpAPI's free tier is ~100 searches/month per account. Set SERPAPI_KEYS to a
comma-separated list of keys from several free accounts; this script rotates to
the next key when one runs out of quota, multiplying the free budget at $0.
A single legacy SERPAPI_KEY is still accepted.

Env knobs:
    SERPAPI_KEYS   comma-separated keys (preferred). Falls back to SERPAPI_KEY.
    CALL_CITY      default "Delhi"
    CALL_CITIES    comma-separated, rotated for freshness. Overrides CALL_CITY.
    CALL_QUERIES   default "dental clinic,dentist,dental hospital,orthodontist"
    CALL_TARGET    default 50
    CALL_PAGES     pages per (city, query) to walk, default 3 (20 results/page)

Local run (uses Doppler-held keys):
    doppler run --project client-acquisition-pipeline --config dev -- \
        python scripts/build_call_list.py

In CI this runs daily and commits the new file (see
.github/workflows/leads-daily.yml). If no keys are set it exits cleanly without
writing, so the workflow stays green and inert until keys are configured.
"""
import datetime
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

CITIES = [
    c.strip()
    for c in os.environ.get("CALL_CITIES", os.environ.get("CALL_CITY", "Delhi")).split(",")
    if c.strip()
]
QUERIES = [
    q.strip()
    for q in os.environ.get(
        "CALL_QUERIES", "dental clinic,dentist,dental hospital,orthodontist"
    ).split(",")
    if q.strip()
]
TARGET = int(os.environ.get("CALL_TARGET", "50"))
PAGES = int(os.environ.get("CALL_PAGES", "3"))

CALLS_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "calls"
SEEN_FILE = CALLS_DIR / "_seen.json"


def load_keys() -> list[str]:
    raw = os.environ.get("SERPAPI_KEYS") or os.environ.get("SERPAPI_KEY") or ""
    return [k.strip() for k in raw.split(",") if k.strip()]


def load_seen() -> set[str]:
    try:
        data = json.loads(SEEN_FILE.read_text(encoding="utf-8"))
        return set(data) if isinstance(data, list) else set()
    except (OSError, json.JSONDecodeError):
        return set()


def phone_key(phone: str) -> str:
    """Digits-only key for dedupe (last 10 digits, ignoring country code)."""
    d = re.sub(r"\D", "", phone)
    return d[-10:] if len(d) >= 10 else d


def to_whatsapp(phone: str) -> str:
    """Indian mobile -> 91XXXXXXXXXX for wa.me. Landlines return ''. """
    d = re.sub(r"\D", "", phone)
    if d.startswith("00"):
        d = d[2:]
    if len(d) == 12 and d.startswith("91") and d[2] in "6789":
        return d
    if len(d) == 10 and d[0] in "6789":
        return "91" + d
    if len(d) == 11 and d.startswith("0") and d[1] in "6789":
        return "91" + d[1:]
    return ""


class KeyRotator:
    """Hands out the active SerpAPI key, advancing past exhausted ones."""

    def __init__(self, keys: list[str]):
        self.keys = keys
        self.i = 0

    def current(self) -> str | None:
        return self.keys[self.i] if self.i < len(self.keys) else None

    def advance(self) -> str | None:
        self.i += 1
        nxt = self.current()
        if nxt:
            print(f"  [keys] rotating to key #{self.i + 1}/{len(self.keys)}")
        return nxt


def search(query: str, city: str, start: int, key: str) -> dict:
    params = {
        "engine": "google_maps",
        "type": "search",
        "q": f"{query} in {city}",
        "start": start,
        "hl": "en",
        "api_key": key,
    }
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def is_quota_error(data: dict) -> bool:
    err = (data.get("error") or "").lower()
    return any(s in err for s in ("run out", "ran out", "exceeded", "plan", "limit"))


def fetch_query(query: str, city: str, rotator: KeyRotator) -> list[dict]:
    """Walk PAGES of one (query, city), rotating keys on quota/auth errors."""
    results: list[dict] = []
    for page in range(PAGES):
        key = rotator.current()
        if not key:
            return results
        start = page * 20
        try:
            data = search(query, city, start, key)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429):  # bad/exhausted key -> try the next
                if rotator.advance():
                    continue
                return results
            print(f"  [maps] '{query} in {city}' p{page} HTTP {e.code}")
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
            print(f"  [maps] '{query} in {city}' p{page} failed: {e}")
            break

        if not isinstance(data, dict):  # SerpAPI should return an object
            print(f"  [maps] '{query} in {city}' p{page} unexpected response shape")
            break
        if is_quota_error(data):
            if rotator.advance():
                continue
            return results  # all keys spent
        if data.get("error"):
            print(f"  [maps] '{query} in {city}' error: {data['error']}")
            break

        local = data.get("local_results", [])
        results.extend(local)
        if len(local) < 20:  # no more pages
            break
    return results


def main() -> None:
    keys = load_keys()
    if not keys:
        print("No SERPAPI_KEYS / SERPAPI_KEY set — nothing to do (exiting clean).")
        return

    rotator = KeyRotator(keys)
    seen = load_seen()
    run_seen: set[str] = set()
    out: list[dict] = []

    for city in CITIES:
        for query in QUERIES:
            if len(out) >= TARGET or rotator.current() is None:
                break
            for it in fetch_query(query, city, rotator):
                phone = (it.get("phone") or "").strip()
                name = (it.get("title") or "").strip()
                if not phone:
                    continue
                pk = phone_key(phone)
                if not pk or pk in seen or pk in run_seen:
                    continue
                run_seen.add(pk)
                out.append({
                    "number": phone,
                    "label": name,
                    "whatsapp": to_whatsapp(phone),
                    "area": (it.get("address") or "").strip(),
                    "website": (it.get("website") or "").strip(),
                })
                if len(out) >= TARGET:
                    break
            print(f"  [maps] '{query} in {city}' -> running total {len(out)}")
        if len(out) >= TARGET or rotator.current() is None:
            break

    if not out:
        print("No fresh leads found this run (pond may be exhausted, or quota out).")
        return

    today = datetime.date.today().isoformat()
    CALLS_DIR.mkdir(parents=True, exist_ok=True)
    dest = CALLS_DIR / f"{today}.json"
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    seen |= run_seen
    SEEN_FILE.write_text(
        json.dumps(sorted(seen), indent=0, ensure_ascii=False), encoding="utf-8"
    )

    wa = sum(1 for x in out if x["whatsapp"])
    print(f"wrote {len(out)} fresh leads -> {dest}  ({wa} messageable on WhatsApp)")
    print(f"seen pool now {len(seen)} numbers")


if __name__ == "__main__":
    main()
