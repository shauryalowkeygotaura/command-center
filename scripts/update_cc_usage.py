"""Generate public/status/cc-usage.json for the Command Center TOKENS panel.

Claude Code has no public usage API, so we read the local transcript JSONL files
in ~/.claude/projects/**/*.jsonl, sum the token usage on assistant messages, and
estimate cost from per-model published rates. The dashboard shows this with an
"as of <time>" stamp, so re-run it (then commit) whenever you want fresh numbers:

    python scripts/update_cc_usage.py
    git add public/status/cc-usage.json && git commit -m "chore: cc usage" && git push

Everything here is local + free; nothing is sent anywhere.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECTS = Path.home() / ".claude" / "projects"
OUT = Path(__file__).resolve().parent.parent / "public" / "status" / "cc-usage.json"

# USD per token (published list prices / 1e6). Matched by substring of model id;
# unknown models fall back to Sonnet rates. Used only for a rough cost estimate.
RATES = {
    "opus":   (15e-6, 75e-6, 18.75e-6, 1.5e-6),
    "sonnet": (3e-6, 15e-6, 3.75e-6, 0.3e-6),
    "haiku":  (1e-6, 5e-6, 1.25e-6, 0.1e-6),
}


def _rate(model: str):
    m = (model or "").lower()
    for key, r in RATES.items():
        if key in m:
            return r
    return RATES["sonnet"]


def main() -> None:
    now = datetime.now(timezone.utc)
    today = now.date()
    week_ago = now - timedelta(days=7)

    today_tokens = 0
    today_cost = 0.0
    week_tokens = 0

    if PROJECTS.exists():
        for jsonl in PROJECTS.glob("**/*.jsonl"):
            try:
                for line in jsonl.read_text(encoding="utf-8", errors="ignore").splitlines():
                    if '"usage"' not in line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    msg = obj.get("message") or {}
                    usage = msg.get("usage") or {}
                    if not usage:
                        continue
                    inp = usage.get("input_tokens", 0) or 0
                    out = usage.get("output_tokens", 0) or 0
                    cw = usage.get("cache_creation_input_tokens", 0) or 0
                    cr = usage.get("cache_read_input_tokens", 0) or 0
                    total = inp + out + cw + cr
                    ts_raw = obj.get("timestamp") or ""
                    try:
                        ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                    except Exception:
                        continue
                    if ts >= week_ago:
                        week_tokens += total
                    if ts.date() == today:
                        today_tokens += total
                        ir, orr, cwr, crr = _rate(msg.get("model", ""))
                        today_cost += inp * ir + out * orr + cw * cwr + cr * crr
            except Exception:
                continue

    payload = {
        "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "todayTokens": today_tokens,
        "todayCostUsd": round(today_cost, 2),
        "weekTokens": week_tokens,
        "limitNote": "Estimated from local transcripts (list-price cost). Rate limits reset on a rolling 5h + weekly window.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}: {today_tokens} tok today (${today_cost:.2f}), {week_tokens} tok / 7d")


if __name__ == "__main__":
    main()
