"""One-off cleanup (already applied; `how` must be a list of steps, see lib/lockin.ts) of data/lockin.json (2026-11-23).

Retires dated items whose event has passed or that are superseded, re-dates the
still-live ones to today so they stop reading as 'slipped 30 days', adds the two
focus asks that only Shaurya can do, and re-weights goals to the 2026-11-18 focus:
voice agents (clinic) > VayuVani Kaun (t20) > nightcrew (systems) > seniors = brand.
"""
import json
from pathlib import Path

TODAY, TOMORROW = "2026-11-23", "2026-11-24"
path = Path(__file__).resolve().parents[1] / "data" / "lockin.json"
d = json.loads(path.read_text(encoding="utf-8"))

RETIRE = {
    "d-linkedin-token",           # carousel autopost to LinkedIn is green daily; token is fine
    "d-li-w1-setup", "d-li-w1-mon",  # October week-1 batch, long past
    "d-auto-2026-10-16-improve-revengine-ig-autoposter-script",  # vague; autoposter is fixed
    "d-exun-minet-x",             # event was 12-13 Nov
    "d-conrad-check",             # Activation Stage closed 29 Oct
    "d-spaceapps-scope", "d-spaceapps-check", "d-spaceapps-weekend",  # Space Apps was 14-15 Nov
}
REDATE = {
    "d-diamond-team": TODAY,
    "d-auto-2026-11-13-call-dua-care-homes-for-scam-safety-sess": TODAY,
    "d-iris-result": TODAY,
    "d-rise-check": TOMORROW,
    "d-exun-national-youth-robotics-challenge-nyrc-2027": TODAY,
    "d-auto-2026-10-28-pick-niche-for-revengineee": TOMORROW,
    "d-li-w1-review": TOMORROW,
    "d-li-comments-2026-11": TOMORROW,
}
NEW = [
    {
        "id": "d-vayuvani-answer-key",
        "date": TODAY,
        "track": "t20",
        "title": "VayuVani: send the two answer-key requests (Dr Shahzad Gani email + RTI for hourly source data)",
        "minutes": 30,
        "how": "Kaun failed its blind test: local source calls are at chance level, and only measured hourly source data can tune it. Both drafts are ready in Code/vayuvani/docs/outreach/answer_key_requests.md, with what to check before sending. Send the Gani email from your own Gmail (it doubles as a mentorship and rec-letter opening) and file the RTI online. Then tell Claude what came back.",
    },
    {
        "id": "d-roblox-2fa",
        "date": TODAY,
        "track": "systems",
        "title": "Roblox account: turn on 2FA and do the age check (nightcrew games are 16+ only until you do)",
        "minutes": 10,
        "how": "roblox.com > Settings > Security: turn on 2-Step Verification. Then Settings > Account Info > Verify My Age (facial estimation is fine under 18). Without both, every nightcrew game stays visible to 16+ players only and can never reach Roblox Kids or Select, where most players are. Reply to Claude `roblox = 2fa + age checked`.",
    },
]
GOALS = {
    "clinic": (5, "Land the FIRST paying clinic for the voice-agent receptionist (Pipecat + Groq, Rs 3,000/month retainer). Voice agents are the business focus."),
    "t20": (4, "Build the T20 (MIT-level) application around VayuVani Kaun, the live pollution cause engine: get it a real answer key, then Diamond Challenge (concept due 14 Jan 2027) and other competitions."),
    "systems": (3, "nightcrew passive income: Roblox games built and published on autopilot (account readiness, Studio plugin, first live game), plus keeping pipelines and credentials healthy."),
    "seniors": (2, None),
    "brand": (2, None),
}

before = len(d["dated"])
kept = [x for x in d["dated"] if x["id"] not in RETIRE]
for x in kept:
    if x["id"] in REDATE:
        x["date"] = REDATE[x["id"]]
existing = {x["id"] for x in kept}
kept += [n for n in NEW if n["id"] not in existing]
d["dated"] = sorted(kept, key=lambda x: (x["date"], x["id"]))
for g in d["goals"]:
    if g["id"] in GOALS:
        w, text = GOALS[g["id"]]
        g["weight"] = w
        if text:
            g["text"] = text
path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"dated: {before} -> {len(d['dated'])} (retired {len(RETIRE)}, added {len(NEW)})")
