"""Tests for the collection gate in build_call_list.

    python -m pytest scripts/test_build_call_list.py -q
"""
import json

import build_call_list as b


def _run(items, target=50):
    """Drive _collect with a fresh dedupe state and return (rows, rejected)."""
    old = b.TARGET
    b.TARGET = target
    try:
        out, rejected = [], {}
        b._collect(items, set(), set(), out, rejected)
        return out, rejected
    finally:
        b.TARGET = old


# Shaped exactly like fetch_osm() output.
GOV = {
    "title": "CGHS Dispensary Inderpuri", "phone": "011-25100237",
    "address": "Inderpuri, Delhi", "website": "", "business_type": "clinic",
}
PRIVATE = {
    "title": "Elegance Dental Clinic", "phone": "9009822818",
    "address": "nanda nagar, Indore", "website": "", "business_type": "dentist",
}


def test_government_listing_never_reaches_the_file():
    out, rejected = _run([GOV])
    assert out == []
    assert rejected == {"government": 1}


def test_private_listing_survives_with_a_description():
    out, _ = _run([PRIVATE])
    assert len(out) == 1
    row = out[0]
    assert row["label"] == "Elegance Dental Clinic"
    assert row["whatsapp"] == "919009822818"
    assert row["kind"] == "private"
    assert row["description"] == "Dental clinic · no website"


def test_a_mixed_batch_keeps_only_the_sellable_half():
    out, rejected = _run([GOV, PRIVATE, dict(GOV, phone="011-26193167",
                                             title="ESI Dispensary Factory Road")])
    assert [r["label"] for r in out] == ["Elegance Dental Clinic"]
    assert rejected["government"] == 2


def test_a_rejected_number_is_burned_so_a_later_source_cannot_re_offer_it():
    """Maps and OSM share one run. Without burning the key, the same
    dispensary rejected from one source would be re-tested by the other."""
    out, rejected = [], {}
    run_seen: set[str] = set()
    b._collect([GOV], set(), run_seen, out, rejected)
    assert b.phone_key(GOV["phone"]) in run_seen
    b._collect([GOV], set(), run_seen, out, rejected)
    assert rejected["government"] == 1, "second pass should dedupe, not re-count"


def test_osm_operator_type_is_honoured():
    listing = dict(PRIVATE, title="Sector 9 Clinic", operator_type="government")
    out, rejected = _run([listing])
    assert out == [] and rejected == {"government": 1}


def test_listing_without_a_phone_is_still_skipped():
    out, rejected = _run([dict(PRIVATE, phone="")])
    assert out == [] and rejected == {}


def test_collect_scores_every_row_it_keeps():
    out, _ = _run([PRIVATE])
    row = out[0]
    assert row["tier"] == "A"
    assert isinstance(row["score"], int)
    assert any("dental" in r for r in row["reasons"])


def test_collect_scores_from_the_source_item_not_just_the_emitted_row():
    """hours/rating/speciality are dropped from the emitted row, so the score
    has to be taken while the richer source item is still in hand."""
    out, _ = _run([dict(PRIVATE, hours="Mo-Sa 09:30-14:00,17:30-20:00")])
    assert any("shuts mid-day" in r for r in out[0]["reasons"])


def test_collect_honours_an_explicit_limit():
    items = [dict(PRIVATE, phone="90098228%02d" % i, title="Clinic %d" % i)
             for i in range(10)]
    out, rejected = [], {}
    b._collect(items, set(), set(), out, rejected, 3)
    assert len(out) == 3


def test_main_ranks_a_pool_and_keeps_only_the_best(tmp_path, monkeypatch, capsys):
    """End to end: gather more than TARGET, rank, cut, and stamp ONLY what was
    handed over. Stamping the losers would retire numbers nobody ever saw,
    which is the mistake the 14-day cooldown exists to undo."""
    monkeypatch.setattr(b, "CALLS_DIR", tmp_path)
    monkeypatch.setattr(b, "SEEN_FILE", tmp_path / "_seen.json")
    monkeypatch.setattr(b, "load_keys", lambda: [])
    monkeypatch.setattr(b, "CITIES", ["Testville"])
    monkeypatch.setattr(b, "FALLBACK_CITIES", [])
    monkeypatch.setattr(b, "TARGET", 2)

    candidates = [
        # Two tier-A dental mobiles, the ones that should survive the cut.
        {"title": "Best Dental Clinic", "phone": "9009822801", "address": "Jaipur",
         "website": "https://a.in", "business_type": "dentist"},
        {"title": "Good Dental Clinic", "phone": "9009822802", "address": "Indore",
         "business_type": "dentist"},
        # Weaker: landline, non-dental, and a chain.
        {"title": "Some Clinic", "phone": "07312551733", "address": "Indore",
         "business_type": "clinic"},
        {"title": "Clove Dental", "phone": "9009822804", "address": "Delhi",
         "business_type": "dentist"},
        # Never a lead at all.
        {"title": "CGHS Dispensary Inderpuri", "phone": "9009822805",
         "address": "Delhi", "business_type": "clinic"},
    ]
    monkeypatch.setattr(b, "fetch_osm", lambda city: candidates)

    b.main()

    written = sorted(p for p in tmp_path.glob("*.json") if p.name != "_seen.json")
    assert len(written) == 1
    rows = json.loads(written[0].read_text(encoding="utf-8"))

    assert len(rows) == 2, "TARGET must cap the file even though the pool was bigger"
    assert [r["label"] for r in rows] == ["Best Dental Clinic", "Good Dental Clinic"]
    assert all(r["tier"] == "A" for r in rows)

    seen = json.loads((tmp_path / "_seen.json").read_text(encoding="utf-8"))
    assert set(seen) == {"9009822801", "9009822802"}, (
        "only the two emitted numbers may be stamped; the pool losers and the "
        "rejected dispensary must stay available"
    )

    out = capsys.readouterr().out
    assert "ranked" in out and "unsellable" in out


def test_description_uses_the_serpapi_field_names_too():
    """Maps rows carry `type`/`rating`/`reviews` rather than OSM's tags."""
    out, _ = _run([{
        "title": "Chopra Dental Clinic", "phone": "9425053654",
        "address": "Indore", "website": "https://x.in",
        "type": "dentist", "rating": 4.7, "reviews": 212,
    }])
    d = out[0]["description"]
    assert "Dental clinic" in d and "4.7*" in d and "(212)" in d and "has website" in d
