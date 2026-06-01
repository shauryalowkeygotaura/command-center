#!/usr/bin/env python3
"""
build_call_list.py — produce today's 50 clinic numbers for the dashboard.

Pulls local-business listings (clinics, dentists) from Google Maps via SerpAPI
— the same source the client-acquisition-pipeline uses — dedupes by phone, and
writes the first 50 to ../public/calls/<today>.json. The dashboard auto-loads
that file on open (see components/CallList.tsx).

Run it with the pipeline's SerpAPI key in env (Doppler):
    doppler run --project client-acquisition-pipeline --config dev -- \
        python scripts/build_call_list.py

Then commit + push so GitHub Pages serves the new file:
    git add public/calls && git commit -m "data: call list <date>" && git push

Env knobs:
    SERPAPI_KEY   (required)
    CALL_CITY     default "Jaipur"
    CALL_QUERIES  comma-separated, default "dental clinic,dentist,clinic"
    CALL_TARGET   default 50
"""
import datetime
import json
import os
import pathlib
import sys
import urllib.parse
import urllib.request

KEY = os.environ.get("SERPAPI_KEY")
CITY = os.environ.get("CALL_CITY", "Jaipur")
QUERIES = [q.strip() for q in os.environ.get("CALL_QUERIES", "dental clinic,dentist,clinic").split(",") if q.strip()]
TARGET = int(os.environ.get("CALL_TARGET", "50"))


def search(query: str) -> dict:
    params = {
        "engine": "google_maps",
        "type": "search",
        "q": f"{query} in {CITY}",
        "hl": "en",
        "api_key": KEY,
    }
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main() -> None:
    if not KEY:
        sys.exit("SERPAPI_KEY not set — run via `doppler run -- python ...`.")

    seen: set[str] = set()
    out: list[dict] = []
    for q in QUERIES:
        if len(out) >= TARGET:
            break
        try:
            data = search(q)
        except Exception as e:  # noqa: BLE001
            print(f"  [maps] '{q}' failed: {e}")
            continue
        for it in data.get("local_results", []):
            phone = (it.get("phone") or "").strip()
            name = (it.get("title") or "").strip()
            if not phone or phone in seen:
                continue
            seen.add(phone)
            out.append({"number": phone, "label": name})
            if len(out) >= TARGET:
                break
        print(f"  [maps] '{q}' -> running total {len(out)}")

    today = datetime.date.today().isoformat()
    dest = pathlib.Path(__file__).resolve().parent.parent / "public" / "calls" / f"{today}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(out)} numbers -> {dest}")


if __name__ == "__main__":
    main()
