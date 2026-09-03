#!/usr/bin/env python3
"""
lead_quality.py - decide whether a scraped listing is a business that can
actually buy, and write the one-line description the CALL panel shows.

WHY THIS EXISTS
---------------
Measured on the 13 daily files in public/calls/ (516 entries, 2026-08-15 to
2026-09-03): 124 of them, 24%, were government facilities. CGHS dispensaries,
ESI dispensaries, MCD/NDMC dispensaries, Aam Aadmi polyclinics, Chandigarh
civil and ayurvedic dispensaries. Two whole days (08-17, 08-27) were almost
nothing else.

They arrive because build_call_list.py's Overpass fallback queries
`amenity=clinic` and `healthcare=clinic` alongside the dentist tags, and in
Indian OSM data that branch is largely public health infrastructure. It is
over-represented on top of that: government facilities were mapped from civic
data WITH phone numbers, while private clinics often carry no phone tag, and
the only filter in _collect() was "has a phone".

None of them can buy. There is no owner, no P&L, no marketing budget, and any
spend goes through a tender. A call to one is a call not made to a clinic that
could say yes.

WHAT IT DOES NOT DO
-------------------
Chains (Clove Dental, Sabka Dentist, Apollo) are labelled, not dropped. They
are unlikely to buy from a cold call either, because procurement is central,
but that is a judgement about the offer rather than a fact about the entity,
so the row stays and simply says what it is.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

GOVERNMENT = "government"
INSTITUTION = "institution"
CHAIN = "chain"
PRIVATE = "private"


@dataclass(frozen=True)
class Verdict:
    kind: str
    sellable: bool
    reason: str = ""


# Markers are deliberately narrow. A false positive here silently deletes a
# real prospect, which is worse than letting one dispensary through, so
# anything ambiguous in Indian clinic naming is left OUT:
#
#   "trust", "seva", "welfare", "society", "institute", "foundation", and
#   "college" on its own all appear in private brand names (Aggarwal Eye
#   Institute, Trust Dental Care), so none of them is used alone.
#
#   "hospital" is NOT a marker. "X Dental Hospital" is the standard name for a
#   private Indian dental practice: 20 of the 71 Jaipur listings call
#   themselves hospitals and every one is private. Blocking the word would
#   empty the pond.
_GOVERNMENT_PATTERNS = [
    # Central / state / municipal health schemes
    r"\bcghs\b", r"\besic?\b", r"employees.{0,3}state insurance",
    r"\bmcd\b", r"\bndmc\b", r"\bsdmc\b", r"\bedmc\b",
    r"\bmunicipal\b", r"nagar nigam", r"nagar palika", r"\bpanchayat\b",
    r"\bgovt\.?\b", r"\bgovernment\b", r"\bsarkari\b",
    r"\bjan aushadhi\b",
    # A "dispensary" in India is a public facility. Private practices call
    # themselves clinics. Across all 124 flagged rows in public/calls/, every
    # single "Dispensary"/"Dispensery" was government: CGHS, ESI, MCD, civil,
    # allopathic, unani, ayurvedic.
    r"\bdispensar(y|ies)\b", r"\bdispensery\b",
    r"\bcivil (dispensary|hospital)\b", r"\bdistrict hospital\b",
    r"\bprimary health\b", r"\bcommunity health\b", r"health sub.?cent",
    r"\bphc\b", r"\bchc\b", r"\buphc\b",
    r"\bmohalla clinic\b", r"\baam aadmi\b",
    # Uniformed and departmental services
    r"\brailway\b", r"\barmy\b", r"\bair ?force\b", r"\bnavy\b", r"\bnaval\b",
    r"\bmilitary\b", r"\bcantonment\b", r"\bcrpf\b", r"\bbsf\b", r"\bitbp\b",
    r"\bpolice\b", r"\bjail\b", r"\bprison\b", r"\bcoast guard\b",
    # Named public hospitals whose OPDs get tagged as clinics
    r"\baiims\b", r"\bsafdarjung\b", r"\blok nayak\b", r"\brml\b",
    r"ram manohar lohia", r"lady hardinge", r"hindu rao",
    r"guru teg ?bahadur", r"\bgtb hospital\b", r"deen dayal upadhyay",
    r"\bsms hospital\b",
]

_INSTITUTION_PATTERNS = [
    r"\bdental college\b", r"\bmedical college\b", r"college of dental",
    r"\buniversity\b", r"institute of medical sciences",
    r"\bcharitable\b", r"\bcharity\b", r"\bteaching hospital\b",
]

# Multi-city groups with central procurement. Kept, not dropped: see docstring.
_CHAIN_PATTERNS = [
    r"\bclove dental\b", r"\bclove\b", r"\bsabka dentist\b", r"\bapollo\b",
    r"\bfortis\b", r"\bmax (healthcare|hospital)\b", r"\bmanipal\b",
    r"\bnarayana health\b", r"\bpartha dental\b", r"\baxiss dental\b",
    r"\bdentzz\b", r"\bfms dental\b", r"\bindira ivf\b", r"\bdr\.? ?lal ?path\b",
    r"\bmetropolis\b", r"\bthyrocare\b", r"\bmedanta\b", r"\bcloudnine\b",
]

_GOVERNMENT_RE = re.compile("|".join(_GOVERNMENT_PATTERNS), re.I)
_INSTITUTION_RE = re.compile("|".join(_INSTITUTION_PATTERNS), re.I)
_CHAIN_RE = re.compile("|".join(_CHAIN_PATTERNS), re.I)


def classify(name: str, *, operator: str = "", operator_type: str = "") -> Verdict:
    """Judge one listing from its name and OSM operator tags.

    `operator_type` is OSM's own `operator:type`. Where present it is
    authoritative and beats the name, but it is set on well under 1% of Indian
    clinic nodes (1 of 109 Delhi dentists carried it), so the name does the work.
    """
    ot = (operator_type or "").strip().lower()
    if ot in ("government", "public"):
        return Verdict(GOVERNMENT, False, "operator:type=%s" % ot)

    hay = "%s %s" % (name or "", operator or "")

    m = _GOVERNMENT_RE.search(hay)
    if m:
        return Verdict(GOVERNMENT, False, "government marker %r" % m.group(0).strip())

    m = _INSTITUTION_RE.search(hay)
    if m:
        return Verdict(INSTITUTION, False, "institution marker %r" % m.group(0).strip())

    m = _CHAIN_RE.search(hay)
    if m:
        return Verdict(CHAIN, True, "chain %r" % m.group(0).strip())

    return Verdict(PRIVATE, True)


# --- Description -----------------------------------------------------------
# What a row has to say before you dial it: what kind of place it is, whether
# it already has a website (the free-chatbot opener only lands on clinics that
# do not), and any signal of size. Everything else is noise on a call sheet.

_TYPE_LABELS = {
    "dentist": "Dental clinic",
    "dental_clinic": "Dental clinic",
    "doctors": "Doctor's clinic",
    "clinic": "Clinic",
    "hospital": "Hospital",
    "orthodontist": "Orthodontist",
    "optometrist": "Optician",
    "physiotherapist": "Physiotherapist",
    "diagnostics": "Diagnostics lab",
    "homeopathy": "Homeopathy clinic",
    "ayurveda": "Ayurvedic clinic",
    "unani": "Unani clinic",
}


# Sources disagree on how much they tell you. OSM often has amenity/healthcare
# tags; SerpAPI has `type`; a row rescued from an older daily file has neither,
# only a name. Reading the type off the name is a last resort, but "Dental
# clinic - no website" is a usable call-sheet row and "no website" is not.
_NAME_TYPE_HINTS = [
    (r"orthodont", "orthodontist"),
    (r"dental|dentist|dento|\btooth\b|\bteeth\b|\bsmile", "dentist"),
    (r"physiotherap|\bphysio\b", "physiotherapist"),
    (r"optical|\boptom|optician|\beye\b|\bvision\b", "optometrist"),
    (r"diagnost|imaging|path ?lab|\bx.?ray\b", "diagnostics"),
    (r"homeo", "homeopathy"),
    (r"ayurved", "ayurveda"),
    (r"\bunani\b", "unani"),
    (r"\bhospital\b", "hospital"),
    (r"\bclinic\b|\bcentre\b|\bcenter\b|\bcare\b", "clinic"),
]
_NAME_TYPE_RES = [(re.compile(pat, re.I), label) for pat, label in _NAME_TYPE_HINTS]


def infer_type(name: str) -> str:
    """Best guess at what a place is, from its name alone. '' when unsure."""
    for rx, label in _NAME_TYPE_RES:
        if rx.search(name or ""):
            return label
    return ""


def _speciality(raw: str) -> str:
    """OSM healthcare:speciality is a semicolon-separated list of tokens."""
    if not raw:
        return ""
    parts = [p.strip().replace("_", " ") for p in re.split(r"[;,]", raw) if p.strip()]
    return ", ".join(parts[:2])


def describe(listing: dict, verdict: Verdict | None = None) -> str:
    """The one line shown under the number in the CALL panel."""
    bits: list[str] = []

    kind = (listing.get("business_type") or listing.get("type") or "").strip().lower()
    if not kind:
        kind = infer_type(listing.get("title") or listing.get("label") or "")
    label = _TYPE_LABELS.get(kind, kind.replace("_", " ").title() if kind else "")
    if verdict and verdict.kind == CHAIN:
        label = (label + " (chain)").strip() if label else "Chain"
    if label:
        bits.append(label)

    spec = _speciality(listing.get("speciality", ""))
    if spec:
        bits.append(spec)

    rating = str(listing.get("rating") or "").strip()
    reviews = str(listing.get("reviews") or "").strip()
    if rating:
        bits.append(rating + "*" + (" (%s)" % reviews if reviews else ""))

    bits.append("has website" if (listing.get("website") or "").strip() else "no website")

    hours = (listing.get("hours") or "").strip()
    if hours and len(hours) <= 24:
        bits.append(hours)

    return " · ".join(b for b in bits if b)
