"""Goal-score every LOCK IN item (Angus idea #42).

Angus Sewell's reel: feed each task to a SMALL model individually, with your
goals attached, and ask how much it actually moves the needle. This does that
for data/lockin.json + the P1 handoffs, and writes data/lockin-scores.json,
which the LOCK IN tab sorts on.

Run:  doppler run -p client-acquisition-pipeline -c dev -- python scripts/focus_score.py
      (any Doppler config holding GROQ_API_KEY works; add --force to rescore all)

Items are cached by a hash of goals + item text, so a rerun only pays for
items that changed. Instances that share one template (17 home calls, 4
clinic walk-ins) are scored once as a template.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "lockin.json"
OUT = ROOT / "data" / "lockin-scores.json"
LISTS = ROOT / "lib" / "lists.ts"

MODEL = "openai/gpt-oss-20b"  # the "much smaller AI" from the reel: fast, cheap, plenty for a 0-10 judgement
# (llama-3.1-8b-instant was retired by Groq; check /openai/v1/models if this one 404s too)
URL = "https://api.groq.com/openai/v1/chat/completions"


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as e:
        sys.exit(f"{path} is not valid JSON: {e}")


def p1_handoffs() -> list[tuple[str, str]]:
    """(id, text) for every P1 item in HANDOFF_SEED, read straight from lists.ts."""
    src = LISTS.read_text(encoding="utf-8")
    seed = src[src.index("HANDOFF_SEED") :]
    pairs = re.findall(r'id: "([^"]+)",\s*\n\s*text: "((?:[^"\\]|\\.)*)"', seed)
    return [(i, t) for i, t in pairs if t.startswith("P1")]


def candidates(data: dict) -> dict[str, str]:
    """scoreKey -> the text the model judges. Mirrors the keys lib/lockin.ts looks up."""
    c: dict[str, str] = {}
    for d in data["brandDays"]:
        n = d["day"]
        c[f"brand-d{n}"] = f"Film and post a short reel ({d['series']}): {d['reel']}. " + " ".join(d["how"][:2])
        for i, p in enumerate(d.get("posts", [])):
            c[f"brand-d{n}-post{i}"] = f"Write a brand post: {p}"
    c["brand-li"] = "Repost the day's reel story on LinkedIn as a PDF carousel."
    c["milestone"] = f"Hit the Day-21 milestone: {data['milestone']['label']}"
    for p in data["seniorPrep"]:
        c[p["id"]] = f"Senior AI-scam session prep: {p['title']}"
    c["home"] = "Phone one Delhi/Noida senior care home to book a free 45-minute AI-scam safety session for its residents."
    c["clinic"] = "Walk into one nearby dental clinic, demo the AI receptionist and offer a free 7-day trial (the path to the first paying client)."
    for d in data["dated"]:
        c[d["id"]] = f"[due {d['date']}] {d['title']}"
    for s in data["standing"]:
        c[s["id"]] = s["title"]
    covered = {"h-dental-targets-tier-a", "h-t20-deadlines", "h-revengine-linkedin-token"}  # same set as lib/lockin.ts
    for hid, text in p1_handoffs():
        if hid in covered:
            continue
        c[f"handoff:{hid}"] = text.replace("P1 · ", "")
    return c


def ask(key: str, goals: list[dict], task: str) -> dict:
    goal_lines = "\n".join(f"- {g['id']} (weight {g['weight']}): {g['text']}" for g in goals)
    body = {
        "model": MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "max_tokens": 600,
        "reasoning_effort": "low",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You score ONE task for a 16-year-old builder in Delhi against his real goals. "
                    "Score 0-10 for how much doing this task TODAY moves the needle on the goals, weighting "
                    "higher-weight goals more. Busywork and polish score low; anything that puts him in front "
                    "of a real customer, a real deadline or a real audience scores high. "
                    "A quick check or decision that GATES a deadline or a customer action scores as high as the thing it unblocks. "
                    'Reply as JSON: {"score": <int 0-10>, "goal": "<goal id it serves most>", "why": "<max 12 words>"}'
                ),
            },
            {"role": "user", "content": f"GOALS:\n{goal_lines}\n\nTASK:\n{task}"},
        ],
    }
    key_env = os.environ.get("GROQ_API_KEY", "")
    for attempt in range(4):
        req = urllib.request.Request(
            URL,
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {key_env}", "Content-Type": "application/json", "User-Agent": "focus-score/1"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                payload = json.loads(r.read())
            out = json.loads(payload["choices"][0]["message"]["content"])
            score = max(0, min(10, int(out["score"])))
            return {"score": score, "goal": str(out.get("goal", "")), "why": str(out.get("why", ""))[:120]}
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(int(e.headers.get("retry-after", "5") or 5) + 1)
                continue
            raise SystemExit(f"{key}: Groq HTTP {e.code}: {e.read()[:200]!r}")
        except (KeyError, ValueError, json.JSONDecodeError) as e:
            if attempt < 3:
                continue
            raise SystemExit(f"{key}: unparseable model reply ({e})")
    raise SystemExit(f"{key}: gave up after retries")


def main() -> None:
    if not os.environ.get("GROQ_API_KEY"):
        sys.exit("GROQ_API_KEY missing. Run under: doppler run -p client-acquisition-pipeline -c dev -- python scripts/focus_score.py")
    force = "--force" in sys.argv
    data = load_json(DATA)
    if not data:
        sys.exit(f"{DATA} missing")
    prev = load_json(OUT).get("scores", {})
    goals = data["goals"]
    goal_hash = hashlib.sha1(json.dumps(goals, sort_keys=True).encode()).hexdigest()[:8]

    scores: dict[str, dict] = {}
    asked = 0
    for key, text in candidates(data).items():
        h = hashlib.sha1(f"{goal_hash}|{text}".encode()).hexdigest()[:12]
        old = prev.get(key)
        if old and old.get("hash") == h and not force:
            scores[key] = old
            continue
        res = ask(key, goals, text)
        res["hash"] = h
        scores[key] = res
        asked += 1
        print(f"{res['score']:>2}  {key:<32} {res['why']}")
    OUT.write_text(
        json.dumps({"model": MODEL, "scores": scores}, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\n{len(scores)} items, {asked} scored fresh, {len(scores) - asked} cached -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
