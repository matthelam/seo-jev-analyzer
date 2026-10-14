# End-to-end test against a production build: run with three servers already started (see run-e2e.sh).
import asyncio, json, sys, time, urllib.request
from playwright.async_api import async_playwright, expect

A = "http://localhost:3100"   # test mode, open
B = "http://localhost:3101"   # test mode, password gate
C = "http://localhost:3102"   # no key, no password: must refuse
FIX = sys.argv[1]
SHOTS = sys.argv[2]
results = []

def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""), flush=True)

async def count(page, store):
    return await page.evaluate("""(store) => new Promise((res) => {
      const r = indexedDB.open('seo-jev-analyzer');
      r.onsuccess = () => { const tx = r.result.transaction(store, 'readonly'); const c = tx.objectStore(store).count(); c.onsuccess = () => res(c.result); };
    })""", store)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(color_scheme="dark", viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # 1. Empty state shows setup; sitemap discovery and path filter
        await pg.goto(A + "/dashboard")
        await expect(pg.get_by_text("Set up a profile")).to_be_visible()
        await pg.get_by_label("Site address").fill("http://localhost:3200")
        await pg.get_by_role("button", name="Find pages").click()
        await expect(pg.get_by_text("5 shown")).to_be_visible(timeout=15000)
        check("sitemap found through robots.txt: 5 pages", True)
        await pg.get_by_label("Filter by path").fill("localhost:3200/course")
        await expect(pg.get_by_text("3 shown")).to_be_visible()
        check("filter 'localhost:3200/course' keeps /courses/, its sub-page and /course-payments", True)
        await pg.screenshot(path=f"{SHOTS}/e2e-1-pages.png")

        # 2. Import the fixture profile
        await pg.get_by_role("button", name="Back").click()
        await pg.locator("input[type=file]").set_input_files(FIX)
        await expect(pg.get_by_role("heading", name="Pottery fixture")).to_be_visible()
        check("profile imported from a file", True)

        # 3. Calibrate, interrupt with a reload, resume
        await pg.get_by_role("button", name="Calibrate").click()
        await expect(pg.get_by_text("Calibrating:")).to_be_visible(timeout=20000)
        for _ in range(100):
            if await count(pg, "calibrationRuns") >= 150: break
            await asyncio.sleep(0.2)
        await pg.reload()
        await expect(pg.get_by_role("button", name="Resume calibration")).to_be_visible(timeout=10000)
        mid = await count(pg, "calibrationRuns")
        check("calibration survives a reload part-way", 0 < mid < 600, f"{mid} of 600 stored")
        await pg.get_by_role("button", name="Resume calibration").click()
        await expect(pg.get_by_text("Calibration complete")).to_be_visible(timeout=240000)
        n = await count(pg, "calibrationRuns")
        check("calibration stores 100 runs x 3 pages x 2 scopes", n == 600, f"{n}")
        await expect(pg.get_by_text("100 runs")).to_be_visible()

        # 4. First run
        await pg.get_by_role("button", name="Run now").click()
        await expect(pg.get_by_text("Metadata score, profile")).to_be_visible(timeout=60000)
        rows = await pg.locator(".MuiDataGrid-row").count()
        check("baseline run scores every page", rows == 3, f"{rows} rows")
        check("band chart drawn", await pg.locator("svg[aria-label^='Score by page']").count() == 1)
        txt = await pg.locator(".MuiDataGrid-row").first.inner_text()
        check("scores carry a band", "±" in txt, txt.replace("\n", " | "))
        await pg.screenshot(path=f"{SHOTS}/e2e-2-dashboard-dark.png", full_page=True)
        await pg.locator(".MuiDataGrid-row").first.click()
        await expect(pg.get_by_text("Points available, largest first")).to_be_visible()
        await expect(pg.get_by_text("Metadata as read")).to_be_visible()
        check("page detail shows metadata, term ratings and points available", True)
        await asyncio.sleep(0.6)
        box = await pg.locator(".MuiDrawer-paper").bounding_box()
        check("page detail sheet sits fully on screen", box and box["x"] + box["width"] <= 1400.5, str(box))
        await pg.screenshot(path=f"{SHOTS}/e2e-3-detail.png")
        await pg.keyboard.press("Escape")

        # 5. Second run compares with the first
        await pg.get_by_role("button", name="Run now").click()
        await expect(pg.get_by_text("Run 2 vs Baseline")).to_be_visible(timeout=60000)
        change = await pg.locator(".MuiDataGrid-row").first.inner_text()
        check("second run shows change against the baseline", ("level" in change) or ("+" in change) or ("−" in change), change.replace("\n", " | "))
        runs = await count(pg, "runs")
        check("past runs kept", runs == 2, f"{runs}")

        # 5b. Saved automatically: confirmation, a fresh tab with no import, a second profile, switching back
        await expect(pg.get_by_text("Run saved in this browser")).to_be_visible(timeout=5000)
        check("finished run confirms it was saved", True)
        check("save status shown in the top bar", await pg.get_by_text("Saved in this browser", exact=True).count() == 1)
        tab = await ctx.new_page()
        await tab.goto(A + "/dashboard")
        await expect(tab.get_by_text("Run 2 vs Baseline")).to_be_visible(timeout=15000)
        check("a new tab shows the saved profile, calibration and runs without importing", await tab.locator(".MuiDataGrid-row").count() == 3)
        await tab.close()
        await pg.get_by_label("Profile", exact=True).click()
        await pg.get_by_role("option", name="New profile or import").click()
        await pg.get_by_role("button", name="Load the Boulderfest example").click()
        await expect(pg.get_by_text("18 pages · 60 terms")).to_be_visible(timeout=10000)
        await pg.get_by_label("Profile", exact=True).click()
        await pg.get_by_role("option", name="Pottery fixture").click()
        await expect(pg.get_by_text("Run 2 vs Baseline")).to_be_visible(timeout=10000)
        check("two profiles kept side by side; switching back shows the first profile's runs", await count(pg, "profiles") == 2)
        await pg.reload()
        await expect(pg.get_by_role("heading", name="Pottery fixture")).to_be_visible(timeout=10000)
        check("the selected profile is remembered after a reload", True)

        # 6. Export
        async with pg.expect_download() as dl:
            await pg.get_by_role("button", name="Export").click()
        path = await (await dl.value).path()
        import shutil; shutil.copy(path, f"{SHOTS}/export.json")
        data = json.load(open(path))
        check("export holds profile, calibration, runs and results", len(data["runs"]) == 2 and len(data["calibrationRuns"]) == 600 and len(data["results"]) == 12)
        score_before = data["runs"][0]["profileScore"]["meta"]

        # 7. Editing an intent statement makes the calibration stale
        await pg.get_by_role("button", name="Edit profile").click()
        await pg.get_by_role("button", name="Next").click()
        first_intent = pg.get_by_label("Intent statement").first
        await first_intent.fill("Which pottery courses run this term?")
        await pg.get_by_role("button", name="Next").click()
        await pg.get_by_role("button", name="Save", exact=True).click()
        await expect(pg.get_by_text("Recalibrate before new runs")).to_be_visible(timeout=10000)
        check("changed intent marks the calibration stale and hides Run now", await pg.get_by_role("button", name="Run now").count() == 0)
        await pg.screenshot(path=f"{SHOTS}/e2e-4-stale.png")

        # 8. Import the export into a clean browser
        ctx2 = await b.new_context(color_scheme="light", viewport={"width": 1400, "height": 1000})
        pg2 = await ctx2.new_page()
        await pg2.goto(A + "/dashboard")
        await pg2.locator("input[type=file]").set_input_files(path)
        await expect(pg2.get_by_text("Metadata score, profile")).to_be_visible(timeout=15000)
        check("exported file reproduces the dashboard in a clean browser", await pg2.locator(".MuiDataGrid-row").count() == 3)
        await pg2.screenshot(path=f"{SHOTS}/e2e-5-imported-light.png", full_page=True)

        # 9. Example profile loads with 18 pages
        ctx3 = await b.new_context()
        pg3 = await ctx3.new_page()
        await pg3.goto(A + "/dashboard")
        await pg3.get_by_role("button", name="Load the Boulderfest example").click()
        await expect(pg3.get_by_text("18 pages · 60 terms")).to_be_visible(timeout=10000)
        check("Boulderfest example loads: 18 pages, 60 terms", True)

        # 10. Password gate
        ctx4 = await b.new_context()
        pg4 = await ctx4.new_page()
        await pg4.goto(B + "/dashboard")
        check("password gate redirects to sign-in", "/login" in pg4.url, pg4.url)
        r = await pg4.request.post(B + "/api/jev", data={"kind": "intent"})
        check("API refuses without signing in", r.status == 401, str(r.status))
        await pg4.get_by_label("Password").fill("wrong")
        await pg4.get_by_role("button", name="Sign in").click()
        await expect(pg4.get_by_text("Wrong password")).to_be_visible(timeout=5000)
        await pg4.get_by_label("Password").fill("secret-for-tests")
        await pg4.get_by_role("button", name="Sign in").click()
        await pg4.wait_for_url("**/dashboard", timeout=10000)
        check("correct password opens the dashboard", True)

        # 11. No key and no gate in production: refuses
        r = urllib.request.urlopen(urllib.request.Request(C + "/dashboard"), timeout=10) if False else None
        try:
            urllib.request.urlopen(C + "/dashboard", timeout=10); check("open production deployment refused", False)
        except urllib.error.HTTPError as e:
            check("open production deployment refused", e.code == 503, str(e.code))

        # 12. Theme
        dark_bg = await pg.evaluate("getComputedStyle(document.body).backgroundColor")
        light_bg = await pg2.evaluate("getComputedStyle(document.body).backgroundColor")
        check("system dark and light themes differ", dark_bg != light_bg, f"{dark_bg} vs {light_bg}")
        check("no browser errors", not errors, "; ".join(errors[:3]))
        await b.close()
    fails = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(fails)} of {len(results)} checks passed")
    sys.exit(1 if fails else 0)

asyncio.run(main())
