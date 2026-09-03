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
)

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
