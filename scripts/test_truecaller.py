"""Tests for truecaller.py and its effect on lead ranking. No network."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import truecaller  # noqa: E402
from lead_quality import apply_tc, rank  # noqa: E402
from truecaller import CLINIC_LINE, DOCTOR, PERSON, UNKNOWN, classify  # noqa: E402

LABEL = "Doctor Meera Dental and Orthodontal Clinic"


def test_business_name_is_the_desk():
    assert classify("Meera Dental Clinic", LABEL) == CLINIC_LINE
    assert classify("Smile Care Reception", "Smile Care") == CLINIC_LINE


def test_dr_prefix_is_the_doctor():
    assert classify("Dr. Rakesh Gupta", "Pearl Dental") == DOCTOR
    assert classify("dr rakesh", "Pearl Dental") == DOCTOR


def test_name_in_clinic_label_is_the_owner():
    assert classify("Meera Sharma", LABEL) == DOCTOR


def test_unrelated_person_is_just_a_person():
    assert classify("Ramesh Kumar", LABEL) == PERSON


def test_no_name_is_unknown():
    assert classify("", LABEL) == UNKNOWN


def test_role_for_prefers_doctor_and_stops(monkeypatch):
    calls = []
    names = {"9000000001": "Meera Sharma", "1100000002": "Meera Dental Clinic"}

    def fake(num):
        calls.append(num)
        return names.get(truecaller._national(num), "")
    monkeypatch.setattr(truecaller, "search_name", fake)
    assert truecaller.role_for("+91-90000-00001;+91-11-0000-0002", LABEL) == DOCTOR
    assert len(calls) == 1  # doctor found first, budget saved


def test_role_for_none_when_no_lookup(monkeypatch):
    monkeypatch.setattr(truecaller, "search_name", lambda n: None)
    assert truecaller.role_for("+91-90000-00001", LABEL) is None


def test_lookups_off_without_id(monkeypatch):
    monkeypatch.delenv("TRUECALLER_INSTALLATION_ID", raising=False)
    assert truecaller.search_name("+91-90000-00001") is None


def test_rank_doctor_beats_desk():
    base = {"label": LABEL, "number": "+91-11-0000-0002", "area": "New Delhi", "type": "dentist"}
    doc = rank({**base, "tc_role": "doctor"})
    desk = rank({**base, "tc_role": "clinic_line"})
    plain = rank(base)
    assert doc["score"] > plain["score"] > desk["score"]
    assert doc["tier"] == "A"  # a landline confirmed as the doctor's reaches him
    assert "Truecaller: the doctor's own number" in doc["reasons"]


def test_apply_tc_matches_rank():
    base = {"label": LABEL, "number": "+91-11-0000-0002", "area": "New Delhi", "type": "dentist", "kind": "private"}
    row = {**base, **rank(base)}
    apply_tc(row, "doctor")
    direct = rank({**base, "tc_role": "doctor"})
    assert (row["tier"], row["score"]) == (direct["tier"], direct["score"])
