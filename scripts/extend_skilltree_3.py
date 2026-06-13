# Round 3: the true WebDev capstone - "AUTOMATIC", the fake startup site
# actually shipped for the Exun web dev induction (Task 2 promo site + Task 3
# API page + Assignment 2 backend). Sits above the vanilla web branch and the
# backend branch; the Next.js self-iterating-site node stays as a parallel
# capstone (the user wanted both kept).
#
# Same guarantees as rounds 1-2: schema + type checks, merged-DAG cycle check,
# atomic write, idempotent. ASCII-only, no em dashes.

import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
TARGET = os.path.join(DATA, "skilltree-webdev.json")

REQUIRED_KEYS = {
    "id", "track", "title", "subtitle", "level", "parents",
    "minutes", "explain", "example", "exercise", "solution", "checklist",
}
OPTIONAL_KEYS = {"loophole"}

NODE = {
    "id": "web-automatic",
    "track": "webdev",
    "title": "Ship AUTOMATIC",
    "subtitle": "the fake startup, end to end",
    "level": 10,
    "parents": ["web-websockets", "web-forms-events", "web-deploy-vercel"],
    "minutes": 55,
    "explain": "This is the WebDev capstone, and it is a real thing you shipped: AUTOMATIC, the fake startup whose entire pitch is \"yo. stop living ur life. ts runs itself now.\" It is the Exun web dev submission, and it stitches together almost every node beneath it.\n\nThe brief (Task 2) was: you are the founder of a tech startup, invent the details, build a 3-page promo site. Home with a logo, tagline and short pitch; a Contact form (name, a VALID email, a non-empty message); a Waitlist form (email plus a radio that always has one option selected) that pops the user's inputs back with `alert()` on submit. Task 3 bolts on a 4th page that GETs an API and renders it, with a filter for bonus marks. Then Assignment 2 turned the toy into a real app: one Express server hosting the same pages, a Mongo-backed messages and auth system (bcrypt plus httpOnly session cookies), and a websocket bonus that broadcasts live updates to every open tab.\n\nNothing here is a new concept. The skill being tested is ASSEMBLY: static pages and validated forms on the front (web-forms-events), a fetch-and-render page (web-fetch-api), a Node/Express/Mongo backend with auth (the whole backend branch), live updates over a socket (web-websockets), all deployed (web-deploy-vercel). If you can point at the node that supplies each layer, you own this build.\n\nThe part that makes it LAND is voice. Task 2 is judged partly on design and creativity, so the copy is deliberately unhinged slang and the product is openly a bit (the footer literally reads \"ts is not a real product, dw\"). Build the smallest correct thing the spec asks for, then give it a personality nobody forgets.",
    "example": "AUTOMATIC/                 # the shipped repo\n  index.html      <- Home: logo, tagline, pitch, nav\n  contact.html    <- name + valid email + non-empty message\n  waitlist.html   <- email + radio; alert() the inputs on submit\n  tech.html       <- Task 3: GET an API, render it, filter the results\n  account.html    <- Assignment 2: login / profile\n  server.js       <- Express: serves pages + /api (messages, auth, ws)\n# one server, vanilla front end, deployed to Vercel",
    "exercise": "From memory, list the three Task-2 pages of AUTOMATIC and the ONE required behaviour of each form (what makes the Contact form valid; what the Waitlist form must do on submit). Then, for the Assignment 2 version, name which skill-tree node supplies each layer: the forms, the API page, the auth, the live updates, and the deploy.",
    "solution": "Task 2 pages + form rules:\n  1. Home      -> logo, tagline, pitch, nav (no form)\n  2. Contact   -> name + a VALID email + a non-empty message\n  3. Waitlist  -> email + an always-selected radio; on submit, alert() the inputs\n\nAssignment 2 layers -> node:\n  forms / validation      -> web-forms-events\n  API fetch + filter page -> web-fetch-api\n  login / sessions / auth -> web-auth-sessions\n  live broadcast updates  -> web-websockets\n  shipping it live        -> web-deploy-vercel",
    "checklist": [
        "Name the three Task-2 pages and the one hard requirement of each form.",
        "Which node supplies the backend auth, and which supplies the live updates?",
        "Why does Task 2 reward voice/creativity, and how did AUTOMATIC lean into that?",
    ],
    "loophole": "Task 2 said the Waitlist form should, on submit, 'show the user's inputs with alert()'. So that is ALL it does: no backend, no database, no fetch, just a literal `alert()` echoing the inputs back. The spec asked for exactly that, so building more would have been wasted effort under a deadline. Same move on 'invent the details': the brief handed over naming, so AUTOMATIC leaned all the way into a bit (a startup that learns 'exactly how u live', footer admitting 'ts is not a real product, dw') and turned a requirement into the creativity marks. Read the spec literally, satisfy it exactly, and spend the saved time on the part that is actually scored."
}


def load_nodes(path):
    if not os.path.isfile(path):
        sys.exit(f"data file not found: {path}")
    try:
        with open(path, encoding="utf-8") as f:
            nodes = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        sys.exit(f"could not read {path}: {e}")
    if not isinstance(nodes, list):
        sys.exit(f"{path}: expected a JSON array")
    return nodes


def atomic_write(path, nodes):
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nodes, f, indent=2, ensure_ascii=True)
            f.write("\n")
        os.replace(tmp, path)
    except OSError as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        sys.exit(f"could not write {path}: {e}")


def validate_schema(n):
    missing = REQUIRED_KEYS - n.keys()
    extra = n.keys() - REQUIRED_KEYS - OPTIONAL_KEYS
    if missing:
        sys.exit(f"node {n.get('id')} missing keys: {missing}")
    if extra:
        sys.exit(f"node {n.get('id')} has unknown keys: {extra}")
    for key in ("id", "track", "title", "subtitle", "explain",
                "example", "exercise", "solution"):
        if not isinstance(n[key], str) or not n[key].strip():
            sys.exit(f"{n.get('id')}: {key} must be a non-empty string")
    for key in ("level", "minutes"):
        if not isinstance(n[key], int) or isinstance(n[key], bool):
            sys.exit(f"{n.get('id')}: {key} must be an int")
    if not isinstance(n["parents"], list) or not n["parents"] or not all(
        isinstance(p, str) for p in n["parents"]
    ):
        sys.exit(f"{n.get('id')}: parents must be a non-empty list of strings")
    if not isinstance(n["checklist"], list) or not all(
        isinstance(c, str) for c in n["checklist"]
    ):
        sys.exit(f"{n.get('id')}: checklist must be a list of strings")
    if "loophole" in n and (not isinstance(n["loophole"], str) or not n["loophole"].strip()):
        sys.exit(f"{n.get('id')}: loophole must be a non-empty string")


def main():
    validate_schema(NODE)

    # load all tracks so cross-track parents resolve and we can cycle-check
    all_nodes = []
    for f in ("skilltree-webdev.json", "skilltree-cp.json", "skilltree-ml.json"):
        all_nodes += load_nodes(os.path.join(DATA, f))
    by_id = {n["id"]: n for n in all_nodes}

    prior = by_id.get(NODE["id"])
    if prior is not None and prior != NODE:
        sys.exit(f"id {NODE['id']} exists with different content")

    merged_ids = {"root"} | set(by_id) | {NODE["id"]}
    for p in NODE["parents"]:
        if p not in merged_ids:
            sys.exit(f"unknown parent {p}")

    full = {n["id"]: n["parents"] for n in all_nodes}
    full[NODE["id"]] = NODE["parents"]
    state = {}

    def visit(nid):
        if nid == "root" or nid not in full:
            return
        if state.get(nid) == 1:
            return
        if state.get(nid) == 0:
            sys.exit(f"cycle at {nid}")
        state[nid] = 0
        for p in full[nid]:
            visit(p)
        state[nid] = 1

    for nid in full:
        visit(nid)

    nodes = load_nodes(TARGET)
    if any(n["id"] == NODE["id"] for n in nodes):
        print(f"skilltree-webdev.json: already has {NODE['id']} ({len(nodes)} nodes)")
        return
    nodes.append(NODE)
    atomic_write(TARGET, nodes)
    print(f"skilltree-webdev.json: +1 -> {len(nodes)} nodes (added {NODE['id']})")
    print("OK: DAG validated, no cycles, all parents resolve")


if __name__ == "__main__":
    main()
