"""Tests for lead_quality.

The fixtures are REAL names taken from public/calls/*.json and from live
Overpass results for Delhi and Jaipur, not invented ones. The whole risk in
this module is a marker that reads well in the abstract and then deletes a real
prospect, so the negatives matter more than the positives.

    python -m pytest scripts/test_lead_quality.py -q
"""
import pytest

from lead_quality import (
    CHAIN, GOVERNMENT, INSTITUTION, PRIVATE, classify, describe, infer_type,
    rank, sort_key,
)

# The only two clinics that have actually paid, from
# Code/dental-receptionist/assistant/clinics/*_CLIENT.md. n=2 sets no weights;
# it is here so the ranking cannot quietly bury its own customers.
MARUDHAR = {
    "label": "Marudhar Dental Centre", "number": "+91 9636180333",
    "area": "Vaishali Nagar, Jaipur", "website": "https://marudhardentalclinic.com",
    "business_type": "dentist", "reviews": 1150, "rating": "4.9",
    "hours": "Mo-Sa 09:30-14:00,17:30-20:00",
}
OLIVE_GREEN = {
    "label": "Olive Green Dental", "number": "+91 8112276936",
    "area": "Vaishali Nagar, Jaipur", "website": "https://olivegreendental.com",
    "business_type": "dentist",
}

# Every one of these was in a daily call list and cannot buy anything.
GOVERNMENT_NAMES = [
    "CGHS Dispensary Inderpuri",
    "CGHS Wellness Centre Lodhi Road II",
    "CGHS, Malviya Nagar",
    "ESI Dispensary Factory Road",
    "ESI Najafgarh",
    "ESI Civil Dispensary Sector- 29",
    "MCD Dispensary, Mundka",
    "MCD Nangloi",
    "NDMC Dispensary",
    "New Delhi Municipal Council Polyclinic",
    "Maternal And Child Welfare Centre (MCD), Nangal Raya",
    "Delhi Govt Dispensary, Jharoda Majra",
    "Delhi Government Dispensary Jahangirpuri H Block",
    "Government hospital, Madangir",
    "Government Homeopathic and Ayurvedic Dispensary",
    "Civil Dispensary - Dhanas",
    "Ayurvedic Dispensary Sector-28",
    "Unani Dispensary, Ballimaran",
    "Golf Link Allopathic Dispensary",
    "Aam Aadmi Polyclinic Tilak Vihar",
    "Rural Community Health Care Centre",
    "Air Force Station Palam",
    "1 Air Force Dental Centre",
    "JNU CGHS Dispensary",
]

# Real private practices whose names contain words a lazier filter would catch.
# If any of these starts failing, the filter is eating the pond.
PRIVATE_NAMES = [
    "Shri Ganesh Dental Hospital, Jaipur",   # "hospital" is normal here
    "Bharti Dental Hospital",
    "Rama Dental Hospital",
    "Kaushik Dental Hospital",
    "Dr. Lall Dental Hospital",
    "Amol Liver and Gastro Hospital",
    "V-Care Hospital & Research Centre",
    "Aggarwal Eye Institute",               # "institute" alone is not public
    "Delhi Institute Of Trauma and Orthopaedics",
    "R D Jindal Charitable Clinic",          # caught as institution, not private
    "Centre For Sight",
    "Dr Rasika's Dental Wellness Centre",    # "wellness centre" alone is fine
    "Yash Health Care Clinic",
    "Dr. Sethi's Dental Hub and Implant Center",
    "Perfect 32 Dental Centre",
    "Elegance Dental Clinic",
    "Maa Narmada Dental Clinic",
    "Chopra Dental Clinic",
]


@pytest.mark.parametrize("name", GOVERNMENT_NAMES)
def test_government_is_blocked(name):
    v = classify(name)
    assert v.kind == GOVERNMENT, f"{name!r} classified {v.kind}"
    assert v.sellable is False
    assert v.reason


@pytest.mark.parametrize("name", [n for n in PRIVATE_NAMES if "Charitable" not in n])
def test_private_survives(name):
    v = classify(name)
    assert v.sellable is True, f"{name!r} was dropped: {v.reason}"
    assert v.kind in (PRIVATE, CHAIN)


def test_dental_hospital_is_not_a_government_marker():
    """The single most expensive false positive available.

    20 of 71 Jaipur listings are named "... Dental Hospital" and every one is a
    private practice. Blocking the word would empty the largest pond.
    """
    assert classify("Shahpura Dental Hospital").kind == PRIVATE


def test_charitable_is_an_institution_not_a_prospect():
    v = classify("R D Jindal Charitable Clinic")
    assert v.kind == INSTITUTION
    assert v.sellable is False


def test_chain_is_labelled_but_kept():
    v = classify("Clove Dental")
    assert v.kind == CHAIN
    assert v.sellable is True, "chains are a judgement about the offer, not a block"


def test_osm_operator_type_beats_the_name():
    v = classify("Smile Studio", operator_type="government")
    assert v.kind == GOVERNMENT and v.sellable is False


def test_operator_field_is_searched_too():
    v = classify("Sector 12 Clinic", operator="Municipal Corporation of Delhi")
    assert v.kind == GOVERNMENT


def test_unknown_name_defaults_to_private():
    """An unrecognised name must stay callable. Silence is not evidence."""
    v = classify("Kalpanta")
    assert v.kind == PRIVATE and v.sellable is True


# --- describe --------------------------------------------------------------

def test_describe_leads_with_type_and_website_state():
    d = describe({"business_type": "dentist", "website": ""})
    assert d == "Dental clinic · no website"


def test_describe_includes_speciality_rating_and_hours():
    d = describe({
        "business_type": "dentist", "speciality": "orthodontics;implantology",
        "rating": "4.6", "reviews": "128", "website": "https://x.com",
        "hours": "Mo-Sa 09:00-20:00",
    })
    assert "Dental clinic" in d
    assert "orthodontics, implantology" in d
    assert "4.6* (128)" in d
    assert "has website" in d
    assert "Mo-Sa 09:00-20:00" in d


def test_describe_marks_a_chain():
    d = describe({"business_type": "dentist"}, classify("Clove Dental"))
    assert "chain" in d.lower()


def test_describe_survives_an_empty_listing():
    assert describe({}) == "no website"


def test_describe_drops_a_freeform_hours_blob():
    """OSM opening_hours can be a paragraph; a call sheet row cannot hold it."""
    d = describe({"business_type": "clinic", "hours": "Mo-Fr 09:00-13:00,17:00-20:00; Sa 09:00-14:00; PH off"})
    assert "Mo-Fr" not in d


# --- infer_type ------------------------------------------------------------
# The fallback for rows whose source gave no type tag at all, which is every
# row rescued from an older daily file.

@pytest.mark.parametrize("name,expected", [
    ("Elegance Dental Clinic", "dentist"),
    ("Shri Ganesh Dental Hospital, Jaipur", "dentist"),
    ("Dr Rasika's Dental Wellness Centre", "dentist"),
    ("Smile Stone Dental Clinic", "dentist"),
    ("Star Diagnostic Center", "diagnostics"),
    ("Brar Eye Centre", "optometrist"),
    ("Arogya Homeopathic Clinic", "homeopathy"),
    ("Muskaan Clinic", "clinic"),
    ("Amol Liver and Gastro Hospital", "hospital"),
])
def test_infer_type_reads_the_name(name, expected):
    assert infer_type(name) == expected


def test_infer_type_prefers_dental_over_a_generic_word():
    """"Envision Dental" must not become an optician on the word 'vision',
    and a dental hospital must not become a hospital."""
    assert infer_type("Envision Dental") == "dentist"
    assert infer_type("Shri Ganesh Dental Hospital") == "dentist"


def test_infer_type_admits_when_it_does_not_know():
    assert infer_type("Kalpanta") == ""
    assert infer_type("") == ""


def test_describe_falls_back_to_the_name_when_no_type_tag_exists():
    """A row with only a label still has to say what the place is."""
    assert describe({"label": "Elegance Dental Clinic"}) == "Dental clinic · no website"


# --- Ranking ---------------------------------------------------------------

def test_ranking_matches_real_clients():
    """The two clinics that actually bought must not sink.

    This is a guardrail, not a validation: n=2 proves nothing about the
    weights. It only fails loudly if a future weight change buries the exact
    profile that has already converted twice.
    """
    for client in (MARUDHAR, OLIVE_GREEN):
        r = rank(client)
        assert r["tier"] == "A", f"{client['label']} fell to {r['tier']}: {r['reasons']}"

    generic = rank({"label": "Poly Clinic", "number": "0731-2551733", "area": "Indore"})
    assert rank(MARUDHAR)["score"] > generic["score"]
    assert rank(OLIVE_GREEN)["score"] > generic["score"]


def test_tier_a_needs_both_reach_and_fit():
    r = rank({"label": "Elegance Dental Clinic", "number": "9009822818",
              "business_type": "dentist"})
    assert r["tier"] == "A"


def test_a_dental_clinic_on_a_landline_is_only_tier_b():
    """The landline reaches the front desk, which cannot buy."""
    r = rank({"label": "Dental Concepts", "number": "011-26499400",
              "business_type": "dentist"})
    assert r["tier"] == "B"
    assert any("front desk" in x for x in r["reasons"])


def test_a_mobile_non_dental_clinic_is_only_tier_b():
    r = rank({"label": "Muskaan Clinic", "number": "9811147070",
              "business_type": "clinic"})
    assert r["tier"] == "B"


def test_landline_non_dental_is_tier_c():
    r = rank({"label": "Star Diagnostic Center", "number": "0731-2551733"})
    assert r["tier"] == "C"


def test_a_chain_is_never_tier_a_however_good_it_looks():
    """Same authority test that removed the dispensaries: a branch cannot buy."""
    r = rank({"label": "Clove Dental", "number": "9811111111",
              "area": "Delhi", "business_type": "dentist", "website": "https://x.in",
              "reviews": 400})
    assert r["tier"] != "A"
    assert any("centrally" in x for x in r["reasons"])


def test_missing_data_is_never_a_penalty():
    """A source that gave no reviews is not evidence of an unpopular clinic.

    A bare row must score no worse than the same row with the optional fields
    explicitly empty, and must never go negative on absence alone.
    """
    bare = rank({"label": "Elegance Dental Clinic", "number": "9009822818"})
    empty = rank({"label": "Elegance Dental Clinic", "number": "9009822818",
                  "website": "", "reviews": "", "rating": "", "hours": "", "area": ""})
    assert bare["score"] == empty["score"]
    assert bare["score"] > 0


def test_reviews_and_website_are_bonus_only():
    base = rank({"label": "X Dental", "number": "9811111111"})["score"]
    busy = rank({"label": "X Dental", "number": "9811111111", "reviews": 300})["score"]
    sited = rank({"label": "X Dental", "number": "9811111111",
                  "website": "https://x.in"})["score"]
    assert busy > base and sited > base


def test_website_counts_in_favour_not_against():
    """Both paying clients had one, and this is a phone product, not a web one.

    The old acquisition README prioritised clinics WITHOUT a website; that
    belonged to the earlier free-website-chatbot offer.
    """
    r = rank({"label": "X Dental", "number": "9811111111", "website": "https://x.in"})
    assert any("website" in x for x in r["reasons"])


def test_a_mid_day_shutdown_is_recognised():
    """Marudhar, a paying client, runs 09:30-14:00 and 17:30-20:00."""
    r = rank({"label": "X Dental", "number": "9811111111",
              "hours": "Mo-Sa 09:30-14:00,17:30-20:00"})
    assert any("shuts mid-day" in x for x in r["reasons"])

    straight = rank({"label": "X Dental", "number": "9811111111",
                     "hours": "Mo-Su 09:00-21:00"})
    assert not any("shuts mid-day" in x for x in straight["reasons"])


def test_local_cities_get_the_local_angle():
    for area, city in (("Vaishali Nagar, Jaipur", "Jaipur"), ("Saket, Delhi", "Delhi")):
        r = rank({"label": "X Dental", "number": "9811111111", "area": area})
        assert any(city in x for x in r["reasons"])

    away = rank({"label": "X Dental", "number": "9811111111", "area": "nanda nagar, Indore"})
    assert not any("local angle" in x for x in away["reasons"])


def test_an_owner_named_clinic_scores_above_an_anonymous_one():
    named = rank({"label": "Doctor Dubey's Dental Clinic", "number": "9811111111"})
    anon = rank({"label": "Dental Concepts", "number": "9811111111"})
    assert named["score"] > anon["score"]


def test_sort_key_puts_tiers_in_order_regardless_of_score():
    """A high-scoring B must never outrank an A. Tier is the defensible part."""
    a = {"tier": "A", "score": 1}
    b = {"tier": "B", "score": 99}
    c = {"tier": "C", "score": 50}
    assert [r["tier"] for r in sorted([c, b, a], key=sort_key)] == ["A", "B", "C"]


def test_sort_is_stable_for_equal_rows():
    rows = [{"tier": "A", "score": 5, "label": str(i)} for i in range(5)]
    assert [r["label"] for r in sorted(rows, key=sort_key)] == ["0", "1", "2", "3", "4"]


def test_sort_key_tolerates_a_row_that_was_never_scored():
    """Hand-pasted rows reach the panel with no tier at all."""
    rows = [{"tier": "A", "score": 5}, {}, {"tier": "B", "score": 1}]
    assert [r.get("tier") for r in sorted(rows, key=sort_key)] == ["A", "B", None]


@pytest.mark.parametrize("number,label", [
    ("07312551733", "Indore 0731"),
    ("07314001400", "Indore 0731"),
    ("07312550202", "Indore 0731"),
    ("07123456789", "Nagpur 0712"),
    ("08012345678", "Bangalore 080"),
    ("07912345678", "Ahmedabad 079"),
    ("06123456789", "Patna 0612"),
])
def test_a_trunk_dialled_landline_gets_no_whatsapp(number, label):
    """These reach a stranger, and cold WhatsApp to strangers is what gets the
    personal number banned. 49 of 395 rows in public/calls were like this."""
    from lead_quality import whatsapp_digits
    assert whatsapp_digits(number) == "", label


@pytest.mark.parametrize("number,expected", [
    ("097838 11114", "919783811114"),   # real mobile with a trunk 0
    ("094225 66929", "919422566929"),
    ("9009822818", "919009822818"),     # plain 10-digit mobile
    ("+91 9636180333", "919636180333"),  # Marudhar, a paying client
    ("+91 8112276936", "918112276936"),  # Olive Green, a paying client
])
def test_real_mobiles_still_get_whatsapp(number, expected):
    from lead_quality import whatsapp_digits
    assert whatsapp_digits(number) == expected


def test_a_landline_is_not_scored_as_the_owners_mobile():
    """The bug fed the ranking too: 0731 numbers read as 'mobile, likely the
    owner' and were promoted to tier A on it."""
    r = rank({"label": "Surana Dental Clinic", "number": "07312571793",
              "business_type": "dentist"})
    assert r["tier"] == "B"
    assert any("front desk" in x for x in r["reasons"])


def test_mobile_detection_matches_the_generator():
    """rank() re-implements to_whatsapp so it can score un-generated rows.

    If the two drift, ranking and the [wa] button disagree about the same
    number, which is exactly the sort of split nobody notices.
    """
    import build_call_list as b
    from lead_quality import _whatsapp_digits
    for n in ("+91 9636180333", "+91 8112276936", "011-26499400", "9009822818",
              "07312551733", "+9101127054943", "", "12345", "0-91-11-4142-1000"):
        assert _whatsapp_digits(n) == b.to_whatsapp(n), n
