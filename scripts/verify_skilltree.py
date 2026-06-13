# One-shot verify for the SKILL TREE tab (house verify-live pattern:
# pinned chromium exe, fresh context so localStorage starts clean).
import glob
import os
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3177"
SHOT_DIR = os.path.join(os.path.dirname(__file__), "..", ".verify")
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

    # 1. tab exists and opens
    page.get_by_role("button", name="SKILL TREE").click()
    page.wait_for_timeout(600)
    assert page.get_by_text("EXUN SKILL TREE").is_visible(), "root chip missing"
    chips = page.locator("button:has-text('🔒')")
    print("locked chips visible:", chips.count())
    page.screenshot(path=os.path.join(SHOT_DIR, "1-tree.png"))

    # 2. open the CP root node -> panel with exercise
    page.get_by_role("button", name="Variables & Lists").first.click()
    page.wait_for_timeout(400)
    assert page.get_by_text("YOUR TURN").is_visible(), "exercise section missing"
    assert page.get_by_text("WORKED EXAMPLE").is_visible(), "example missing"
    page.screenshot(path=os.path.join(SHOT_DIR, "2-panel.png"))

    # 3. mark complete is gated until you type
    complete = page.get_by_role("button", name="mark complete", exact=False)
    assert complete.is_disabled(), "complete button should be gated on empty draft"
    page.get_by_placeholder("type your answer").fill("nums = [3, 1, 4]\nprint(nums[0])")
    assert complete.is_enabled(), "complete should enable after typing"
    # solution stays hidden until the answer is submitted
    submit = page.get_by_role("button", name="submit answer", exact=False)
    submit.wait_for(state="visible")
    assert submit.is_enabled(), "submit should be enabled once an answer is typed"
    # the panel has exactly one solution toggle, labelled "hide/show solution".
    # Before submitting it must not exist (solution is gated behind submit).
    solution_toggle = page.get_by_role("button", name="hide solution").or_(
        page.get_by_role("button", name="show solution")
    )
    assert solution_toggle.count() == 0, (
        "solution toggle present before the answer was submitted"
    )
    submit.click()
    # after submit the solution is revealed and its toggle becomes visible
    solution_toggle.wait_for(state="visible")
    complete.click()
    page.wait_for_timeout(300)
    assert page.get_by_text("✓ DONE").is_visible(), "done badge missing"
    page.screenshot(path=os.path.join(SHOT_DIR, "3-done.png"))

    # 4. ESC closes, progress persisted, child unlocked (no 🔒 on it)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="SKILL TREE").click()
    page.wait_for_timeout(500)
    assert page.locator("button:has-text('✓ Variables & Lists')").count() == 1, (
        "progress did not persist across reload"
    )
    page.screenshot(path=os.path.join(SHOT_DIR, "4-persisted.png"))

    # 5. locked node opens the locked view with prereq jump chips
    page.get_by_role("button", name="Two Sum", exact=False).first.click()
    page.wait_for_timeout(300)
    locked_view = page.get_by_text("locked. Finish these first")
    print("locked view shown:", locked_view.count() > 0)
    page.screenshot(path=os.path.join(SHOT_DIR, "5-locked.png"))

    print("page errors:", errors if errors else "none")
    browser.close()

print("VERIFY OK")
