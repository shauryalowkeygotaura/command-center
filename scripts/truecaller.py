"""truecaller.py -- who actually answers a clinic number: the doctor, or the desk.

WHY THIS EXISTS
---------------
Shaurya tested it by hand (2026-10-22): Truecaller names the person behind a
clinic number more accurately, and across more clinics, than anything in our
scrape. lead_quality.rank() can only guess from the number's shape ("mobile,
likely the owner"). This replaces the guess with what Truecaller says.

There is no official lookup API. This speaks the Android app's private search
endpoint with an installation id minted by scripts/truecaller_login.py (his
explicit choice over a manual lookup box, made knowing the risk): Truecaller's
terms forbid it and can ban the number behind the id. So it is built to look
like one person searching, not a scraper:
  - a hard daily budget (TRUECALLER_BUDGET, default 40), well under what one
    phone does,
  - a randomised pause between searches,
  - it stops for the whole run on the first 401/403/429. It never retries
    through a refusal.

PRIVACY. public/calls is a PUBLIC repo. The name Truecaller returns is a
private person's name, so it never leaves this module: only the derived role
("doctor" / "person" / "clinic_line" / "unknown") is written to the row.

Inert without TRUECALLER_INSTALLATION_ID: every lookup returns None and the
call list builds exactly as before.
"""
from __future__ import annotations

import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SEARCH_URL = "https://search5-noneu.truecaller.com/v2/search"
USER_AGENT = "Truecaller/11.75.5 (Android;10)"

DOCTOR, PERSON, CLINIC_LINE, UNKNOWN = "doctor", "person", "clinic_line", "unknown"
# Best first: when a row has several numbers, the most useful role wins.
_ROLE_ORDER = (DOCTOR, PERSON, CLINIC_LINE, UNKNOWN)

# Words that mean the number is saved under the business, not a person, so it
# is the clinic's own line, which the front desk answers.
_BUSINESS_RE = re.compile(
    r"\b(dental|dentist|dentistry|clinic|clinics|hospital|care|centre|center|"
    r"smile|smiles|ortho\w*|implant\w*|health\w*|pvt|ltd|llp|reception|enquiry|"
    r"inquiry|appointment|front ?desk|hosp|medical|polyclinic|studio)\b", re.I)
_DR_RE = re.compile(r"^\s*(dr|doctor)\b\.?", re.I)
# Tokens that say nothing about who the person is.
_STOP = {"dr", "doctor", "the", "and", "of", "sri", "shri", "smt", "mr", "mrs", "ms"}


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]+", (text or "").lower()) if len(t) >= 3 and t not in _STOP}


def classify(tc_name: str, label: str) -> str:
    """Role of whoever Truecaller says owns the number, judged against the clinic.

    - saved under a business name                -> clinic_line (the desk)
    - "Dr ..."                                     -> doctor
    - a person whose name appears in the clinic's  -> doctor (eponymous owner,
      name ("Meera" in "Doctor Meera Dental")       "Dr. Dubey's Clinic")
    - any other person                             -> person (could be staff;
                                                      ask for the doctor)
    """
    name = (tc_name or "").strip()
    if not name:
        return UNKNOWN
    if _BUSINESS_RE.search(name):
        return CLINIC_LINE
    if _DR_RE.search(name):
        return DOCTOR
    if _tokens(name) & _tokens(label):
        return DOCTOR
    return PERSON


def best_role(roles: list[str]) -> str:
    present = [r for r in roles if r in _ROLE_ORDER]
    return min(present, key=_ROLE_ORDER.index) if present else UNKNOWN


class _State:
    used = 0
    stopped = ""  # why lookups are off for the rest of the run


def _budget() -> int:
    try:
        return max(0, int(os.environ.get("TRUECALLER_BUDGET", "40")))
    except ValueError:
        return 40


def _national(number: str) -> str:
    """Last ten digits of an Indian number ('+91-90000-00001' -> 9000000001)."""
    digits = re.sub(r"\D", "", number or "")
    return digits[-10:] if len(digits) >= 10 else ""


def search_name(number: str) -> str | None:
    """Name Truecaller shows for an Indian number; '' if it has none; None if
    no lookup happened (no id, budget spent, refused, or a network error)."""
    install_id = os.environ.get("TRUECALLER_INSTALLATION_ID", "").strip()
    if not install_id or _State.stopped:
        return None
    if _State.used >= _budget():
        _State.stopped = "daily budget of %d spent" % _budget()
        return None
    q = _national(number)
    if not q:
        return None

    if _State.used:
        time.sleep(random.uniform(4.0, 9.0))
    _State.used += 1
    params = urllib.parse.urlencode({
        "q": q, "countryCode": "IN", "type": 4, "locAddr": "",
        "placement": "SEARCHRESULTS,HISTORY,DETAILS", "encoding": "json",
    })
    req = urllib.request.Request(
        "%s?%s" % (SEARCH_URL, params),
        headers={"User-Agent": USER_AGENT, "Authorization": "Bearer %s" % install_id,
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            body = res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403, 429):
            # Refused or throttled: stop for the run, never push through it.
            _State.stopped = "Truecaller answered %d" % exc.code
            print("[truecaller] %s, lookups off for this run" % _State.stopped, file=sys.stderr)
        else:
            print("[truecaller] HTTP %d, skipping this number" % exc.code, file=sys.stderr)
        return None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print("[truecaller] network error, skipping: %s" % exc, file=sys.stderr)
        return None
    try:
        data = json.loads(body).get("data") or []
    except (ValueError, AttributeError):
        print("[truecaller] unreadable response, skipping", file=sys.stderr)
        return None
    if not data or not isinstance(data[0], dict):
        return ""
    return str(data[0].get("name") or "").strip()


def role_for(number_field: str, label: str) -> str | None:
    """Role for a row's number field (may hold several, ';'-separated).
    None when no lookup ran at all, so the row stays exactly as before."""
    roles: list[str] = []
    for num in re.split(r"[;,/]", number_field or ""):
        if not num.strip():
            continue
        name = search_name(num)
        if name is None:
            continue
        roles.append(classify(name, label))
        if roles[-1] == DOCTOR:
            break  # nothing beats it; save the budget
    return best_role(roles) if roles else None


def summary() -> str:
    if not os.environ.get("TRUECALLER_INSTALLATION_ID", "").strip():
        return "truecaller: off (no TRUECALLER_INSTALLATION_ID)"
    tail = ", stopped: %s" % _State.stopped if _State.stopped else ""
    return "truecaller: %d lookups%s" % (_State.used, tail)
