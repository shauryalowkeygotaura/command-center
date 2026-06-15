# Merge the subagent-generated interview notes (scripts/_interview_<track>.json,
# each a {node_id: note} map) into the curriculum JSON as the optional
# `interview` field. Validates ids exist and notes are clean ASCII with no
# em dashes. Idempotent + atomic.

import json
import os
import sys

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data")

TRACKS = {
    "webdev": ("_interview_webdev.json", "skilltree-webdev.json"),
    "cp": ("_interview_cp.json", "skilltree-cp.json"),
    "ml": ("_interview_ml.json", "skilltree-ml.json"),
}

EM_DASHES = ("—", "–")  # em dash, en dash — not allowed


def load_json(path):
    if not os.path.isfile(path):
        sys.exit(f"missing: {path}")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        sys.exit(f"could not read {path}: {e}")


def atomic_write(path, obj):
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2, ensure_ascii=True)
            f.write("\n")
        os.replace(tmp, path)
    except OSError as e:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        sys.exit(f"could not write {path}: {e}")


def main():
    # PHASE 1: load + validate everything. Nothing is written until all tracks
    # pass, so a failure on a later track cannot leave earlier ones half-applied.
    staged = []  # (data_path, nodes, patch)
    for patch_name, data_name in TRACKS.values():
        patch = load_json(os.path.join(HERE, patch_name))
        if not isinstance(patch, dict):
            sys.exit(f"{patch_name}: expected an object of id -> note")

        data_path = os.path.join(DATA, data_name)
        nodes = load_json(data_path)
        if not isinstance(nodes, list):
            sys.exit(f"{data_name}: expected a JSON array")
        by_id = {n["id"]: n for n in nodes if isinstance(n, dict) and "id" in n}

        for nid, note in patch.items():
            if nid not in by_id:
                sys.exit(f"{patch_name}: id {nid} not in {data_name}")
            if not isinstance(note, str) or not note.strip():
                sys.exit(f"{patch_name}: note for {nid} must be a non-empty string")
            if any(ch in note for ch in EM_DASHES):
                sys.exit(f"{patch_name}: note for {nid} contains a dash char")
            if any(ord(ch) > 127 for ch in note):
                sys.exit(f"{patch_name}: note for {nid} has non-ASCII chars")
        staged.append((data_path, data_name, nodes, by_id, patch))

    # PHASE 2: apply + write (all inputs already validated).
    total = 0
    for data_path, data_name, nodes, by_id, patch in staged:
        changed = 0
        for nid, note in patch.items():
            if by_id[nid].get("interview") != note:
                by_id[nid]["interview"] = note
                changed += 1
        atomic_write(data_path, nodes)
        print(f"{data_name}: {len(patch)} notes ({changed} new/changed)")
        total += len(patch)

    print(f"OK: {total} interview notes merged across {len(TRACKS)} tracks")


if __name__ == "__main__":
    main()
