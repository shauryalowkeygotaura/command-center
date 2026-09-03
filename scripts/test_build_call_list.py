"""Tests for the collection gate in build_call_list.

    python -m pytest scripts/test_build_call_list.py -q
"""
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


def test_description_uses_the_serpapi_field_names_too():
    """Maps rows carry `type`/`rating`/`reviews` rather than OSM's tags."""
    out, _ = _run([{
        "title": "Chopra Dental Clinic", "phone": "9425053654",
        "address": "Indore", "website": "https://x.in",
        "type": "dentist", "rating": 4.7, "reviews": 212,
    }])
    d = out[0]["description"]
    assert "Dental clinic" in d and "4.7*" in d and "(212)" in d and "has website" in d
