#!/usr/bin/env python3
"""
clean_call_lists.py - retrofit the sellability gate and descriptions onto the
daily call files that were written before either existed.

build_call_list.py now drops government listings and writes a description for
every row, but public/calls/*.json already holds 13 days of leads produced
without those. Re-running the generator cannot fix them: every number in there
is stamped in _seen.json, so a fresh run would skip them all and write an empty
file. This rewrites the files in place instead.

    python scripts/clean_call_lists.py --dry-run    # show what would change
    python scripts/clean_call_lists.py              # apply

Idempotent: running it twice changes nothing the second time. Numbers dropped
here stay in _seen.json on purpose, so no later run re-offers them.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

from lead_quality import classify, describe

CALLS_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "calls"


class Result:
    """What one file's pass produced."""

    def __init__(self) -> None:
        self.before = 0
        self.kept: list[dict] = []
        self.rejected: dict[str, int] = {}
        self.described = 0
        self.tagged = 0

    @property
    def changed(self) -> bool:
        return bool(self.rejected) or bool(self.described) or bool(self.tagged)


def clean_file(path: pathlib.Path) -> Result:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError(f"{path.name} is not a list of leads")

    r = Result()
    r.before = len(rows)

    for row in rows:
        if not isinstance(row, dict):
            continue
        verdict = classify(row.get("label") or "")
        if not verdict.sellable:
            r.rejected[verdict.kind] = r.rejected.get(verdict.kind, 0) + 1
            continue
        if not row.get("description"):
            # These files carry only label/area/website, so the description is
            # whatever can honestly be read off those. Thinner than a fresh
            # row, which also gets type, rating and hours from the source.
            row["description"] = describe(row, verdict)
            r.described += 1
        if not row.get("kind"):
            r.tagged += 1
            row["kind"] = verdict.kind
        r.kept.append(row)

    return r


def write_atomic(path: pathlib.Path, rows: list[dict]) -> None:
    """Replace `path` only once the new content is fully on disk.

    These files cannot be regenerated - every number in them is stamped in
    _seen.json, so a fresh generator run would write an empty file - so a
    truncating write that dies halfway would destroy the data outright.
    """
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would change without writing")
    args = ap.parse_args()

    files = sorted(p for p in CALLS_DIR.glob("*.json") if not p.name.startswith("_"))
    if not files:
        print(f"No daily files in {CALLS_DIR}")
        return 1

    total_before = total_after = total_described = total_tagged = 0
    total_rejected: dict[str, int] = {}
    failures = 0

    for path in files:
        try:
            r = clean_file(path)
        except (OSError, ValueError) as e:
            # One malformed file must not stop the rest from being cleaned.
            print(f"  {path.name}: SKIPPED ({e})")
            failures += 1
            continue

        total_before += r.before
        total_after += len(r.kept)
        total_described += r.described
        total_tagged += r.tagged
        for k, v in r.rejected.items():
            total_rejected[k] = total_rejected.get(k, 0) + v

        if not r.changed:
            print(f"  {path.name}: already clean")
            continue

        notes = []
        if r.rejected:
            notes.append(", ".join(f"-{v} {k}" for k, v in sorted(r.rejected.items())))
        if r.described:
            notes.append(f"+{r.described} descriptions")
        if r.tagged:
            notes.append(f"+{r.tagged} kind")
        print(f"  {path.name}: {r.before} -> {len(r.kept)}  ({'; '.join(notes)})")

        if not args.dry_run:
            try:
                write_atomic(path, r.kept)
            except OSError as e:
                print(f"    write failed, file left untouched: {e}")
                failures += 1

    dropped = total_before - total_after
    print(f"\n{len(files)} files | {total_before} entries -> {total_after} "
          f"({dropped} dropped, {total_described} descriptions added, "
          f"{total_tagged} tagged)")
    if total_rejected:
        print("dropped by kind: "
              + ", ".join(f"{v} {k}" for k, v in sorted(total_rejected.items())))
    if args.dry_run:
        print("\n(dry run - nothing was written)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
