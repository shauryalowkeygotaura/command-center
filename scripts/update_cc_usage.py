"""Generate public/status/cc-usage.json for the Command Center TOKENS panel.

Claude Code has no public usage API, so we read the local transcript JSONL files
in ~/.claude/projects/**/*.jsonl, sum the token usage on assistant messages, and
estimate cost from per-model published rates.

This is wired to a Claude Code Stop hook so it runs after every turn and the panel
stays live with zero manual steps. To keep it fast enough for that (the full
history is hundreds of MB), we skip any transcript file whose mtime is older than
our widest window (7d) -- only files touched recently can hold today/5h/10min data.

You can still run it by hand any time:

    python scripts/update_cc_usage.py

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
# Tuple order: (input, output, cache_creation, cache_read).
RATES = {
    "opus":   (15e-6, 75e-6, 18.75e-6, 1.5e-6),
    "sonnet": (3e-6, 15e-6, 3.75e-6, 0.3e-6),
    "haiku":  (1e-6, 5e-6, 1.25e-6, 0.1e-6),
}

# Live "token burn" window. Claude Code / Max plan meters usage on a rolling
# ~5-hour block, so that's the gauge people care about while working.
LIVE_WINDOW = timedelta(hours=5)
# Burn rate is measured over a short trailing window so it reacts fast.
BURN_WINDOW = timedelta(minutes=10)


def _rate(model: str):
    m = (model or "").lower()
    for key, r in RATES.items():
        if key in m:
            return r
    return RATES["sonnet"]


def _cost(usage: dict, model: str) -> float:
    ir, orr, cwr, crr = _rate(model)
    return (
        (usage.get("input_tokens", 0) or 0) * ir
        + (usage.get("output_tokens", 0) or 0) * orr
        + (usage.get("cache_creation_input_tokens", 0) or 0) * cwr
        + (usage.get("cache_read_input_tokens", 0) or 0) * crr
    )


def main() -> None:
    now = datetime.now(timezone.utc)
    today = now.date()
    week_ago = now - timedelta(days=7)
    live_start = now - LIVE_WINDOW
    burn_start = now - BURN_WINDOW

    today_tokens = 0
    today_cost = 0.0
    week_tokens = 0
    live5h_tokens = 0
    live5h_cost = 0.0
    burn_tokens = 0  # input+output (NOT cache) in the last BURN_WINDOW
    burn_cost = 0.0  # USD in the last BURN_WINDOW
    events: list[tuple[datetime, int]] = []  # (ts, total) this week, for the peak-5h scan

    if PROJECTS.exists():
        for jsonl in PROJECTS.glob("**/*.jsonl"):
            # Fast path: a file last written more than a week ago cannot hold any
            # row inside our widest window. Skipping these turns a multi-second
            # full-history scan into a sub-second read of just the active files.
            try:
                mtime = datetime.fromtimestamp(jsonl.stat().st_mtime, timezone.utc)
            except OSError:
                continue
            if mtime < week_ago:
                continue

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
                        events.append((ts, total))
                    if ts.date() == today:
                        today_tokens += total
                        today_cost += _cost(usage, msg.get("model", ""))
                    if ts >= live_start:
                        live5h_tokens += total
                        live5h_cost += _cost(usage, msg.get("model", ""))
                    if ts >= burn_start:
                        # Exclude cache tokens from the burn indicator -- cache
                        # reads dominate raw counts but are nearly free, so they
                        # make the rate look alarming and meaningless (ccusage
                        # does the same via tokensPerMinuteForIndicator).
                        burn_tokens += inp + out
                        burn_cost += _cost(usage, msg.get("model", ""))
            except Exception:
                continue

    # Peak rolling-5h burn this week: the de facto rate-limit ceiling (we hit
    # the limit often enough that the weekly max ~= the cap), used by the panel
    # to scale the live gauge bar. Two-pointer sweep over time-sorted events.
    events.sort(key=lambda e: e[0])
    peak5h_tokens = 0
    window_sum = 0
    lo = 0
    for hi, (ts_hi, tok_hi) in enumerate(events):
        window_sum += tok_hi
        # lo can't pass hi (events[hi] always fails the age test), but bound it anyway.
        while lo < hi and events[lo][0] < ts_hi - LIVE_WINDOW:
            window_sum -= events[lo][1]
            lo += 1
        peak5h_tokens = max(peak5h_tokens, window_sum)

    burn_minutes = BURN_WINDOW.total_seconds() / 60
    # Token rate excludes cache (readable indicator); cost rate includes every
    # billed token at its own rate (the honest $/hr) -- the asymmetry is deliberate.
    burn_per_min = round(burn_tokens / burn_minutes)
    burn_cost_per_hour = round(burn_cost / burn_minutes * 60, 2)

    payload = {
        "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "todayTokens": today_tokens,
        "todayCostUsd": round(today_cost, 2),
        "weekTokens": week_tokens,
        # Live burn: the rolling 5-hour window + a fast-reacting trailing rate.
        "live5hTokens": live5h_tokens,
        "live5hCostUsd": round(live5h_cost, 2),
        # Scale for the gauge bar: this week's max rolling-5h burn.
        "peak5hTokens": peak5h_tokens,
        "burnTokPerMin": burn_per_min,
        "burnCostPerHour": burn_cost_per_hour,
        "limitNote": "Estimated from local transcripts (list-price cost). Rate limits reset on a rolling 5h + weekly window.",
    }
    # This runs unattended from a Stop hook, so a transient write failure
    # (OneDrive lock, disk full, permissions) must fail soft, not crash.
    try:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError as e:
        print(f"WARN: could not write {OUT}: {e}")
        return
    print(
        f"Wrote {OUT}: {today_tokens} tok today (${today_cost:.2f}), "
        f"{live5h_tokens} tok / 5h, {burn_per_min}/min burn"
    )


if __name__ == "__main__":
    main()
