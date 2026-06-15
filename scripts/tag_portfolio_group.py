# One-shot: tag the self-iterating-site path (Next.js -> ... -> Self-Iterating
# Site) with group="portfolio" so the UI can hide that optional branch.
# Idempotent + atomic. ASCII-only.

import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
TARGET = os.path.join(DATA, "skilltree-webdev.json")

GROUP = "portfolio"
PORTFOLIO_IDS = {
    "web-nextjs",
    "web-server-routes",
    "web-vercel-cron",
    "web-llm-in-app",
    "web-self-iterating-site",
}


def main():
    if not os.path.isfile(TARGET):
        sys.exit(f"not found: {TARGET}")
    try:
        with open(TARGET, encoding="utf-8") as f:
            nodes = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        sys.exit(f"could not read {TARGET}: {e}")
    if not isinstance(nodes, list):
        sys.exit("expected a JSON array")
    if not all(isinstance(n, dict) and isinstance(n.get("id"), str) for n in nodes):
        sys.exit("malformed data: every node must be an object with a string id")

    present = {n["id"] for n in nodes}
    missing = PORTFOLIO_IDS - present
    if missing:
        sys.exit(f"these portfolio ids are not in the file: {missing}")

    changed = 0
    for n in nodes:
        if n["id"] in PORTFOLIO_IDS and n.get("group") != GROUP:
            n["group"] = GROUP
            changed += 1

    if changed == 0:
        print(f"already tagged ({len(PORTFOLIO_IDS)} portfolio nodes)")
        return

    tmp = TARGET + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nodes, f, indent=2, ensure_ascii=True)
            f.write("\n")
        os.replace(tmp, TARGET)
    except OSError as e:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        sys.exit(f"could not write {TARGET}: {e}")

    print(f"tagged {changed} nodes with group={GROUP}")


if __name__ == "__main__":
    main()
