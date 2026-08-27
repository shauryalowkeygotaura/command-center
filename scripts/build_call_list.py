#!/usr/bin/env python3
"""
build_call_list.py - produce today's fresh clinic leads for the dashboard.

Pulls local-business listings (dental clinics, dentists) from Google Maps via
SerpAPI, dedupes against every lead ever emitted (public/calls/_seen.json), and
writes the next TARGET fresh leads to ../public/calls/<today>.json. A number is
withheld only for CALL_OFFER_COOLDOWN_DAYS after it is handed out, not forever:
being listed once is not evidence it was ever called, and the old permanent
retirement burned entire cities of un-dialled numbers. The
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
    CALL_FALLBACK_CITIES
                   reserve cities walked once CALL_CITIES is deduped dry, so a
                   used-up pond extends itself instead of returning 0 forever.
    CALL_QUERIES   default "dental clinic,dentist,dental hospital,orthodontist"
    CALL_TARGET    default 50
    CALL_PAGES     pages per (city, query) to walk, default 3 (20 results/page)

Local run (uses Doppler-held keys):
    doppler run --project client-acquisition-pipeline --config dev -- \
        python scripts/build_call_list.py

In CI this runs daily and commits the new file (see
.github/workflows/leads-daily.yml).

SOURCE CASCADE (2026-08-15): SerpAPI first, OpenStreetMap/Overpass as the floor.
SerpAPI's free quota was spent, so the script had been exiting without writing
anything — the CALL panel read 0 every day while the workflow stayed green. The
OSM pass is keyless and quota-free, so no-keys or spent-quota now still produces
a (shorter) list rather than nothing. Both sources share one dedupe pool, so OSM
never re-surfaces a number Maps already gave you.
"""
import datetime
import json
import os
import pathlib
import re
import sys
import time
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

# Days before a handed-out number may be offered again. This is a COOLDOWN, not
# a retirement: the script cannot see which numbers were actually called (that
# state lives in the dashboard's localStorage), so it must not assume that
# handing a number over means the number is finished. Anything you never worked
# comes back after the window; anything you ticked off is suppressed by the
# dashboard when it returns. 0 disables re-offering entirely (old behaviour).
OFFER_COOLDOWN_DAYS = int(os.environ.get("CALL_OFFER_COOLDOWN_DAYS", "14"))
PAGES = int(os.environ.get("CALL_PAGES", "3"))

# Reserve cities, walked only after CITIES is exhausted.
#
# Why: a city's OSM pond is FINITE. Delhi returns ~143 clinics with a phone
# number, and once those are in _seen.json every later run finds 143 listings
# and 0 fresh ones. That is exactly what happened here: the OSM fallback
# produced lists on 08-17 and 08-19, then went to 0 from 08-20 onward while the
# workflow kept reporting success, because CALL_CITIES was a single city.
#
# So "which cities" cannot be a fixed setting — it has to extend on its own when
# the current pond runs dry, or the panel silently returns to 0 every time a
# city is used up. These are ordered roughly by clinic density.
FALLBACK_CITIES = [
    c.strip()
    for c in os.environ.get(
        "CALL_FALLBACK_CITIES",
        "Jaipur,Pune,Lucknow,Indore,Chandigarh,Bhopal,Nagpur,Surat,"
        "Kanpur,Patna,Ludhiana,Agra,Vadodara,Nashik,Coimbatore",
    ).split(",")
    if c.strip()
]

CALLS_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "calls"
SEEN_FILE = CALLS_DIR / "_seen.json"


# ── Keyless fallback source: OpenStreetMap via Overpass ─────────────────────
# Why this exists: every lead this script has ever produced came from SerpAPI,
# whose free tier is ~100 searches/month. Once that runs out the script exits
# clean and writes nothing, which is why public/calls/ held no date files at all
# and the dashboard's CALL panel showed 0 — silently, every day, with a green
# workflow. Overpass has no key and no quota, so the panel now has a floor it
# can always fall back to.
#
# Coverage trade-off: OSM phone-tag density in India is thinner than Google
# Maps, so this yields a reliable trickle rather than a full 50. A short list
# beats an empty one.
# The main overpass-api.de endpoint is heavily shared and answers 504/429 often
# enough that a single attempt is not a dependable floor, so these are tried in
# order. OVERPASS_URL overrides the list.
#
# EVERY MIRROR HERE IS VERIFIED TO CARRY INDIAN DATA. That is not a given:
# overpass.osm.ch was in this list and looked healthy — HTTP 200, well-formed
# JSON — while returning ZERO elements for every Indian query, because it only
# hosts Swiss extracts. An empty 200 is indistinguishable from "this city has no
# clinics", so it quietly marked real cities as dry. Probe any mirror against a
# known-good Indian city before adding it.
OVERPASS_MIRRORS = [
    u.strip() for u in os.environ.get(
        "OVERPASS_URL",
        "https://overpass-api.de/api/interpreter,"
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter,"
        "https://overpass.kumi.systems/api/interpreter",
    ).split(",") if u.strip()
]
OVERPASS_TIMEOUT = int(os.environ.get("OVERPASS_TIMEOUT_S", "60"))

# Hard wall-clock cap on the whole OSM pass. Overpass is a shared free service
# and a slow mirror can sit near the per-query timeout, so without a ceiling the
# daily job runs for many minutes. Partial results are fine here: the rotation
# above means the next run covers different ground anyway.
OSM_BUDGET_S = int(os.environ.get("OSM_BUDGET_S", "150"))

# Overpass element filters, unioned per city. Mirrors the niches the call script
# targets via QUERIES.
_OSM_FILTERS = [
    'nwr["amenity"="dentist"](area.a);',
    'nwr["healthcare"="dentist"](area.a);',
    'nwr["amenity"="clinic"](area.a);',
    'nwr["healthcare"="clinic"](area.a);',
]


def _osm_area(city: str) -> str:
    """'Delhi, Delhi' -> 'Delhi', whitelisted to a safe charset.

    Overpass QL is a query language, so the city string is restricted to known-
    good characters rather than having bad ones escaped out.
    """
    raw = city.split(",")[0].strip()
    return re.sub(r"[^A-Za-z0-9 .\-]", "", raw).strip()


def fetch_osm(city: str) -> list[dict]:
    """Clinic listings for a city from OpenStreetMap. [] on any failure."""
    area = _osm_area(city)
    if not area:
        return []
    query = (
        f'[out:json][timeout:{OVERPASS_TIMEOUT}];\n'
        f'area["name"="{area}"]["boundary"="administrative"]->.a;\n'
        f'(\n  ' + "\n  ".join(_OSM_FILTERS) + '\n);\n'
        f'out center tags 200;'
    )
    data = urllib.parse.urlencode({"data": query}).encode()
    payload = None
    for url in OVERPASS_MIRRORS:
        try:
            req = urllib.request.Request(
                url, data=data,
                headers={"User-Agent": "command-center-call-list/1.0 (lead research)"},
            )
            with urllib.request.urlopen(req, timeout=OVERPASS_TIMEOUT + 10) as resp:
                candidate = json.load(resp)
            # An empty result is NOT taken as authoritative. A mirror missing
            # this region answers 200 with no elements, which reads exactly like
            # a genuinely dry city. Keep the answer but try the next mirror; a
            # non-empty reply from anyone wins. Only if they all come back empty
            # is the city really worked out.
            payload = candidate
            if isinstance(candidate, dict) and (candidate.get("elements") or []):
                break
            print(f"  [osm] '{city}' via {urllib.parse.urlparse(url).netloc}: "
                  f"empty — confirming against the next mirror")
            continue
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
            # 504/429 from the busiest mirror is routine, not exceptional — say
            # so quietly and move to the next one.
            print(f"  [osm] '{city}' via {urllib.parse.urlparse(url).netloc}: {e}")
            continue

    if payload is None:
        print(f"  [osm] '{city}' — every mirror failed")
        return []

    # Overpass can answer 200 with a non-object body (proxy error pages, or a
    # bare list). Guard the shape before .get, or the "floor" source takes the
    # whole run down with an AttributeError and no file gets written at all.
    if not isinstance(payload, dict):
        print(f"  [osm] '{city}' unexpected response shape")
        return []

    elements = payload.get("elements", []) or []
    if not elements:
        # Overpass answers 200 + empty for BOTH "this city has no clinics" and
        # "no admin boundary is named that" (a typo, or a city OSM spells
        # differently). Those need different fixes, and neither should look like
        # a normal quiet day, so say it out loud rather than returning 0 silently.
        print(f"  [osm] '{city}' -> 0 elements. Either the pond is dry or no OSM "
              f"admin boundary is named '{area}' — check the spelling against "
              f"openstreetmap.org before assuming the former.")
        return []

    items: list[dict] = []
    for el in elements:
        tags = el.get("tags") or {}
        name = (tags.get("name") or "").strip()
        phone = (tags.get("phone") or tags.get("contact:phone") or "").strip()
        if not name or not phone:
            continue
        addr = ", ".join(
            p for p in (tags.get("addr:street"), tags.get("addr:suburb"),
                        tags.get("addr:city")) if p
        )
        items.append({
            "title": name,
            "phone": phone,
            "address": addr,
            "website": (tags.get("website") or tags.get("contact:website") or "").strip(),
        })
    print(f"  [osm] '{city}' -> {len(items)} listings with a phone number")
    return items


def load_keys() -> list[str]:
    raw = os.environ.get("SERPAPI_KEYS") or os.environ.get("SERPAPI_KEY") or ""
    return [k.strip() for k in raw.split(",") if k.strip()]


def load_offered() -> dict[str, str]:
    """{phone_key: YYYY-MM-DD it was last handed out}.

    Legacy format was a flat list of "numbers ever emitted", which retired a
    number PERMANENTLY the moment it appeared in one day's file — whether or not
    it was ever actually called. That burned ~50 numbers a day on nothing: Delhi
    had 143 phone-tagged clinics, two runs consumed all of them, and the city
    read "dry" forever after while almost none had been dialled.

    A legacy list is therefore read as "offered long ago", which puts those
    never-worked numbers straight back in the pool. That is the intended
    migration, not a bug: they were retired by a rule that should not have
    existed. Numbers actually checked off stay suppressed on the dashboard side
    (see components/CallList.tsx — a re-offered number merges into its existing
    entry and keeps its called flag), so this cannot resurface finished work.
    """
    try:
        data = json.loads(SEEN_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if isinstance(data, dict):
        return {str(k): str(v) for k, v in data.items()}
    if isinstance(data, list):
        return {str(k): "1970-01-01" for k in data}
    return {}


def _recently_offered(offered: dict[str, str], today: datetime.date) -> set[str]:
    """Keys still inside the cooldown, i.e. genuinely not worth re-offering yet."""
    if OFFER_COOLDOWN_DAYS <= 0:
        return set()
    fresh = set()
    for key, when in offered.items():
        try:
            offered_on = datetime.date.fromisoformat(when)
        except ValueError:
            continue  # unparseable stamp -> treat as expired, offer it again
        if (today - offered_on).days < OFFER_COOLDOWN_DAYS:
            fresh.add(key)
    return fresh


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


def _collect(items, seen: set[str], run_seen: set[str], out: list[dict]) -> None:
    """Append fresh, phone-bearing listings to `out`, deduping as it goes."""
    for it in items:
        if len(out) >= TARGET:
            return
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


def main() -> None:
    keys = load_keys()
    today_d = datetime.date.today()
    offered = load_offered()
    # Only numbers still inside the cooldown are withheld. Everything older is
    # back in play, because being handed to you once is not evidence it was
    # worked — only your check-off is, and that lives in the dashboard.
    seen = _recently_offered(offered, today_d)
    expired = len(offered) - len(seen)
    if expired > 0:
        print(f"{expired} previously-offered number(s) are past the "
              f"{OFFER_COOLDOWN_DAYS}-day cooldown and are eligible again")
    run_seen: set[str] = set()
    out: list[dict] = []

    # SerpAPI first when it has budget; OSM is the floor below it. Without keys
    # we skip straight to OSM rather than exiting empty, which is what left the
    # dashboard's CALL panel at 0 every day.
    rotator = KeyRotator(keys) if keys else None
    if not keys:
        print("No SERPAPI_KEYS / SERPAPI_KEY set — going straight to the OSM fallback.")

    for city in CITIES if rotator else []:
        for query in QUERIES:
            if len(out) >= TARGET or rotator.current() is None:
                break
            _collect(fetch_query(query, city, rotator), seen, run_seen, out)
            print(f"  [maps] '{query} in {city}' -> running total {len(out)}")
        if len(out) >= TARGET or rotator.current() is None:
            break

    # OSM floor. Runs whenever SerpAPI could not fill the target — no keys,
    # spent quota, or a pond that has gone dry in these cities. Keyless, so it
    # cannot fail for budget reasons; the same dedupe applies, so it will not
    # re-surface a number that Maps already produced.
    if len(out) < TARGET:
        if rotator:
            print(f"[osm] SerpAPI produced {len(out)}/{TARGET} — topping up from OpenStreetMap.")
        # Configured cities first, then the reserve pool, skipping any city
        # already named so a duplicate entry does not cost a wasted request.
        # Walking into the reserve is normal operation, not an error: it just
        # means the earlier ponds are fully worked, which is the goal.
        reserve = [c for c in FALLBACK_CITIES if c.lower() not in {x.lower() for x in CITIES}]
        # Rotate the reserve by day-of-year. Each Overpass query costs up to a
        # minute, so walking all ~15 reserve cities in one run took over eight
        # minutes for a job that should take seconds. Rotating means a run tries
        # a DIFFERENT slice each day: every city still gets worked, just spread
        # across days instead of crammed into one run.
        if reserve:
            offset = datetime.date.today().timetuple().tm_yday % len(reserve)
            reserve = reserve[offset:] + reserve[:offset]

        deadline = time.monotonic() + OSM_BUDGET_S
        for city in CITIES + reserve:
            if len(out) >= TARGET:
                break
            if time.monotonic() > deadline:
                # Partial list beats an overrunning job. Tomorrow's run starts
                # at a different rotation offset and picks up where this left off.
                print(f"  [osm] time budget ({OSM_BUDGET_S}s) reached — "
                      f"stopping at {len(out)} leads, resuming tomorrow")
                break
            before = len(out)
            _collect(fetch_osm(city), seen, run_seen, out)
            gained = len(out) - before
            if gained:
                print(f"  [osm] after '{city}' -> running total {len(out)} (+{gained})")
            else:
                print(f"  [osm] '{city}' fully worked already (0 fresh) — moving on")

    if not out:
        print("No fresh leads found this run (pond may be exhausted in every city).")
        return

    today = datetime.date.today().isoformat()
    CALLS_DIR.mkdir(parents=True, exist_ok=True)
    dest = CALLS_DIR / f"{today}.json"
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    # Re-stamp everything handed out today; keep prior stamps for the rest so
    # each number ages out on its own schedule.
    stamp = today_d.isoformat()
    for key in run_seen:
        offered[key] = stamp
    SEEN_FILE.write_text(
        json.dumps(dict(sorted(offered.items())), indent=0, ensure_ascii=False),
        encoding="utf-8",
    )

    wa = sum(1 for x in out if x["whatsapp"])
    print(f"wrote {len(out)} fresh leads -> {dest}  ({wa} messageable on WhatsApp)")
    print(f"offered pool now {len(offered)} numbers "
          f"({len(seen) + len(run_seen)} inside the {OFFER_COOLDOWN_DAYS}-day cooldown)")


if __name__ == "__main__":
    main()
