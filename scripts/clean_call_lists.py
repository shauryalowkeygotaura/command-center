#!/usr/bin/env python3
"""
clean_call_lists.py - retrofit onto the daily call files everything that
build_call_list.py only started doing later.

Four passes, all idempotent:

  1. Drop listings that cannot buy. Government facilities were 121 of 516
     entries: CGHS, ESI, MCD/NDMC and civil dispensaries. No owner, no budget,
     no authority.
  2. Correct `whatsapp`. A trunk-dialled landline like 0731-2551733 (Indore)
     was being turned into a wa.me link to a stranger. 49 of 395 rows.
  3. Add a `description` so a row says what the place is.
  4. Score and reorder, best first.

    python scripts/clean_call_lists.py --dry-run    # show what would change
    python scripts/clean_call_lists.py              # apply

Re-running the generator cannot do any of this: every number in these files is
stamped in _seen.json, so a fresh run would skip them all and write an empty
file. Numbers dropped here stay stamped on purpose, so nothing re-offers them.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

from lead_quality import classify, describe, rank, sort_key, whatsapp_digits

CALLS_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "calls"


class Result:
    """What one file's pass produced."""

    def __init__(self) -> None:
        self.before = 0
        self.rows: list[dict] = []
        self.rejected: dict[str, int] = {}
        self.described = 0
        self.tagged = 0
        self.rewhatsapped = 0


def clean_file(path: pathlib.Path) -> tuple[Result, str, str]:
    """Return (result, original text, rewritten text)."""
    original = path.read_text(encoding="utf-8")
    rows = json.loads(original)
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

        # A landline that was handed a wa.me link points at a stranger, and
        # cold WhatsApp to strangers is what gets the personal number banned.
        wa = whatsapp_digits(row.get("number") or "")
        if (row.get("whatsapp") or "") != wa:
            r.rewhatsapped += 1
            row["whatsapp"] = wa

        if not row.get("description"):
            # These files carry only label/area/website, so the description is
            # whatever can honestly be read off those. Thinner than a fresh
            # row, which also gets type, rating and hours from the source.
            row["description"] = describe(row, verdict)
            r.described += 1
        if not row.get("kind"):
            r.tagged += 1
            row["kind"] = verdict.kind

        # Always recomputed rather than preserved: the scoring rules change,
        # and a stale score silently outranks a fresh one.
        row.update(rank(row, verdict))
        r.rows.append(row)

    r.rows.sort(key=sort_key)
    rewritten = json.dumps(r.rows, indent=2, ensure_ascii=False)
    return r, original, rewritten


def write_atomic(path: pathlib.Path, text: str) -> None:
    """Replace `path` only once the new content is fully on disk.

    These files cannot be regenerated - every number in them is stamped in
    _seen.json, so a fresh generator run would write an empty file - so a
    truncating write that dies halfway would destroy the data outright.
    """
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would change without writing")
    args = ap.parse_args(argv)

    files = sorted(p for p in CALLS_DIR.glob("*.json") if not p.name.startswith("_"))
    if not files:
        print(f"No daily files in {CALLS_DIR}")
        return 1

    total_before = total_after = 0
    totals = {"described": 0, "tagged": 0, "rewhatsapped": 0}
    total_rejected: dict[str, int] = {}
    tiers: dict[str, int] = {}
    failures = 0

    for path in files:
        try:
            r, original, rewritten = clean_file(path)
        except (OSError, ValueError) as e:
            # One malformed file must not stop the rest from being cleaned.
            print(f"  {path.name}: SKIPPED ({e})")
            failures += 1
            continue

        total_before += r.before
        total_after += len(r.rows)
        totals["described"] += r.described
        totals["tagged"] += r.tagged
        totals["rewhatsapped"] += r.rewhatsapped
        for k, v in r.rejected.items():
            total_rejected[k] = total_rejected.get(k, 0) + v
        for row in r.rows:
            tiers[row["tier"]] = tiers.get(row["tier"], 0) + 1

        # Content comparison, not a counter, so "nothing to do" is exact and
        # a second run is provably a no-op.
        if rewritten == original.rstrip("\n"):
            print(f"  {path.name}: already clean")
            continue

        notes = []
        if r.rejected:
            notes.append(", ".join(f"-{v} {k}" for k, v in sorted(r.rejected.items())))
        if r.rewhatsapped:
            notes.append(f"{r.rewhatsapped} whatsapp corrected")
        if r.described:
            notes.append(f"+{r.described} descriptions")
        if r.tagged:
            notes.append(f"+{r.tagged} kind")
        print(f"  {path.name}: {r.before} -> {len(r.rows)}"
              + (f"  ({'; '.join(notes)})" if notes else "  (reordered)"))

        if not args.dry_run:
            try:
                write_atomic(path, rewritten)
            except OSError as e:
                print(f"    write failed, file left untouched: {e}")
                failures += 1

    dropped = total_before - total_after
    print(f"\n{len(files)} files | {total_before} entries -> {total_after} "
          f"({dropped} dropped, {totals['described']} descriptions added, "
          f"{totals['rewhatsapped']} whatsapp corrected)")
    if total_rejected:
        print("dropped by kind: "
              + ", ".join(f"{v} {k}" for k, v in sorted(total_rejected.items())))
    if tiers:
        print("tiers: " + ", ".join(f"{k}:{v}" for k, v in sorted(tiers.items())))
    if args.dry_run:
        print("\n(dry run - nothing was written)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
