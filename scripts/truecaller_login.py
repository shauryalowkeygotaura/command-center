"""One-time Truecaller login for scripts/truecaller.py. Run it yourself:

    python scripts/truecaller_login.py

It sends an OTP to the number you enter, and once you type the code it stores
the resulting installation id as the repo secret TRUECALLER_INSTALLATION_ID
(via `gh secret set`, over stdin, never printed). From then on the daily lead
top-up looks up the best rows automatically.

READ FIRST. Truecaller allows one active install per number. Logging in here
registers a NEW install, so the Truecaller app on the phone that uses this
number will most likely be signed out. Use a spare number (a second SIM, a
family number with permission) rather than the one you rely on. This also
breaks Truecaller's terms, so that number can be banned. Both risks are why the
daily budget is small and lookups stop on the first refusal.
"""
from __future__ import annotations

import json
import random
import re
import string
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "shauryalowkeygotaura/command-center"
SEND_URL = "https://account-asia-south1.truecaller.com/v2/sendOnboardingOtp"
VERIFY_URL = "https://account-asia-south1.truecaller.com/v1/verifyOnboardingOtp"
HEADERS = {
    "content-type": "application/json; charset=UTF-8",
    "user-agent": "Truecaller/11.75.5 (Android;10)",
    # The Android app's public client secret, the same value every
    # open-source client uses. Not one of Shaurya's credentials.
    "clientsecret": "lvc22mp3l1sfv6ujg83rd17btt",
}


def _post(url: str, payload: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:300]
        sys.exit("Truecaller answered HTTP %d: %s" % (exc.code, body))
    except (urllib.error.URLError, ValueError) as exc:
        sys.exit("Could not reach Truecaller: %s" % exc)


def main() -> None:
    print(__doc__.split("READ FIRST.")[1].strip(), "\n")
    raw = input("Indian mobile to log in with (10 digits): ").strip()
    number = re.sub(r"\D", "", raw)[-10:]
    if not re.fullmatch(r"[6-9]\d{9}", number):
        sys.exit("That is not a 10-digit Indian mobile number.")

    device_id = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(16))
    sent = _post(SEND_URL, {
        "countryCode": "IN", "dialingCode": 91, "phoneNumber": number,
        "region": "region-2", "sequenceNo": 2,
        "installationDetails": {
            "app": {"buildVersion": 5, "majorVersion": 11, "minorVersion": 7, "store": "GOOGLE_PLAY"},
            "device": {"deviceId": device_id, "language": "en", "manufacturer": "Xiaomi",
                       "model": "Redmi Note 10", "osName": "Android", "osVersion": "10",
                       "mobileServices": ["GMS"]},
            "language": "en",
        },
    })
    request_id = sent.get("requestId")
    if not request_id:
        sys.exit("No OTP was sent. Truecaller said: %s" % json.dumps(sent)[:300])
    print("OTP sent by %s." % ("SMS" if sent.get("method") != "call" else "a call"))

    code = re.sub(r"\D", "", input("OTP: "))
    done = _post(VERIFY_URL, {"countryCode": "IN", "dialingCode": 91, "phoneNumber": number,
                              "requestId": request_id, "token": code})
    install_id = done.get("installationId")
    if not install_id:
        sys.exit("Login failed. Truecaller said: %s" % json.dumps(done)[:300])

    res = subprocess.run(["gh", "secret", "set", "TRUECALLER_INSTALLATION_ID", "-R", REPO],
                         input=install_id, text=True, capture_output=True)
    if res.returncode != 0:
        sys.exit("Logged in, but storing the secret failed: %s\nRe-run once gh works." % res.stderr.strip())
    print("Done. TRUECALLER_INSTALLATION_ID is set on %s; tomorrow's 06:30 lead top-up uses it." % REPO)


if __name__ == "__main__":
    main()
