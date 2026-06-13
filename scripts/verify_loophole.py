# Focused check for the loophole "field notes" callout. Seeds localStorage so
# a loophole-bearing node is unlocked, opens it, asserts the section renders.
import glob
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3177"
DATA = os.path.join(os.path.dirname(__file__), "..", "data")
KEY = "revengine.command-center.skilltree.v1"

# every node id, so we can mark all done -> target is definitely unlocked
ids = []
for f in ("skilltree-webdev.json", "skilltree-cp.json", "skilltree-ml.json"):
    with open(os.path.join(DATA, f), encoding="utf-8") as fh:
        ids += [n["id"] for n in json.load(fh)]
progress = {i: {"done": True} for i in ids}

SHOT_DIR = os.path.join(DATA, "..", ".verify")
os.makedirs(SHOT_DIR, exist_ok=True)

candidates = glob.glob(
    os.path.expanduser("~/AppData/Local/ms-playwright/chromium-*/chrome-win64/chrome.exe")
)
exe = candidates[-1] if candidates else None

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(URL, wait_until="networkidle")
    page.evaluate(
        "([k, v]) => localStorage.setItem(k, JSON.stringify(v))",
        [KEY, progress],
    )
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="SKILL TREE").click()
    page.wait_for_timeout(500)

    # the new web dev capstone exists
    assert page.get_by_text("Self-Iterating Site").count() > 0, "capstone node missing"

    # open a loophole node (MongoDB) -> FIELD NOTES callout shows
    page.get_by_role("button", name="MongoDB", exact=False).first.click()
    page.wait_for_timeout(400)
    assert page.get_by_text("THE SHORTCUT I SHIPPED").is_visible(), "loophole callout missing"
    assert page.get_by_text("mongodb-memory-server").first.is_visible(), "loophole text missing"
    page.screenshot(path=os.path.join(SHOT_DIR, "6-loophole.png"))

    # a node WITHOUT a loophole must not show the callout
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    page.get_by_role("button", name="Binary Search", exact=False).first.click()
    page.wait_for_timeout(400)
    assert page.get_by_text("THE SHORTCUT I SHIPPED").count() == 0, "callout leaked onto a node with no loophole"

    print("page errors:", errors if errors else "none")
    browser.close()

print("LOOPHOLE VERIFY OK")
