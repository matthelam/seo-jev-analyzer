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

        # 3. First run (no calibration step): imported version 1 file, repeated lines found, every page scored
        await expect(pg.get_by_text("a change within ± 0.27 between runs of 1 counts as level")).to_be_visible(timeout=10000)
        check("noise floor shown from the engine's method", True)
        await pg.get_by_role("button", name="Run now").click()
        await expect(pg.get_by_text("Metadata score, profile")).to_be_visible(timeout=60000)
        rows = await pg.locator(".MuiDataGrid-row").count()
        check("baseline run scores every page", rows == 3, f"{rows} rows")
        check("band chart drawn", await pg.locator("svg[aria-label^='Score by page']").count() == 1)
        txt = await pg.locator(".MuiDataGrid-row").first.inner_text()
        check("scores carry the noise floor band", "± 0.19" in txt, txt.replace("\n", " | "))
        check("one stored result per page", await count(pg, "scores") == 3)
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

        # 4. Second run with 3 runs per page compares with the first; unchanged pages are level
        await pg.get_by_label("Runs per page").click()
        await pg.get_by_role("option", name="3", exact=True).click()
        await pg.get_by_role("button", name="Run now").click()
        await expect(pg.get_by_text("Run 2 vs Baseline")).to_be_visible(timeout=60000)
        change = await pg.locator(".MuiDataGrid-row").first.inner_text()
        check("second run shows level against the baseline for unchanged text", "level" in change, change.replace("\n", " | "))
        await expect(pg.get_by_text("Each score is the mean of 3 runs.")).to_be_visible()
        check("runs per page recorded", True)
        runs = await count(pg, "runs")
        check("past runs kept", runs == 2, f"{runs}")

        # 5b. Saved automatically: confirmation, a fresh tab with no import, a second profile, switching back
        await expect(pg.get_by_text("Run saved in this browser")).to_be_visible(timeout=5000)
        check("finished run confirms it was saved", True)
        check("save status shown in the top bar", await pg.get_by_text("Saved in this browser", exact=True).count() == 1)
        tab = await ctx.new_page()
        await tab.goto(A + "/dashboard")
        await expect(tab.get_by_text("Run 2 vs Baseline")).to_be_visible(timeout=15000)
        check("a new tab shows the saved profile and runs without importing", await tab.locator(".MuiDataGrid-row").count() == 3)
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

        # 6. Export: version 2 file with the profile document and both runs; the verifier agrees with every number
        async with pg.expect_download() as dl:
            await pg.get_by_role("button", name="Export file").click()
        path = await (await dl.value).path()
        import shutil, subprocess; shutil.copy(path, f"{SHOTS}/export.json")
        data = json.load(open(path))
        check("export holds the profile document and both runs", data["schemaVersion"] == 2 and data["profile"]["schema"] == "seo-jev-analyzer/profile@1" and len(data["runs"]) == 2 and all(len(r["results"]) == 3 for r in data["runs"]))
        check("exported profile carries the repeated lines found", data["profile"]["boilerplate"] == ["Book your first lesson today."], str(data["profile"]["boilerplate"]))
        v = subprocess.run(["npx", "tsx", "scripts/verify-export.ts", path], capture_output=True, text=True)
        check("verify-export agrees with every stored number", v.returncode == 0, v.stdout.strip().splitlines()[-1] if v.stdout else v.stderr[-200:])

        # 7. Editing an intent statement makes that page not comparable; other pages stay comparable
        await pg.get_by_role("button", name="Edit profile").click()
        await pg.get_by_role("button", name="Next").click()
        first_intent = pg.get_by_label("Intent statement").first
        await first_intent.fill("Which pottery courses run this term?")
        await pg.get_by_role("button", name="Next").click()
        await pg.get_by_role("button", name="Save", exact=True).click()
        await pg.get_by_role("button", name="Run now").click()
        await expect(pg.get_by_text("Run 3 vs Run 2")).to_be_visible(timeout=60000)
        grid = await pg.locator(".MuiDataGrid-root").inner_text()
        check("changed intent: that page is not comparable, the others are", grid.count("not comparable") == 1 and grid.count("level") >= 2, grid.replace("\n", " | ")[:200])
        await pg.screenshot(path=f"{SHOTS}/e2e-4-not-comparable.png")

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

        # 9b. A browser holding version 1 data (calibration era) is migrated: its run survives and shows its scores
        ctx5 = await b.new_context()
        pg5 = await ctx5.new_page()
        await pg5.goto(A + "/examples/boulderfest.json")
        seeded = await pg5.evaluate("""() => new Promise((res, rej) => {
          const r = indexedDB.open('seo-jev-analyzer', 10);
          r.onupgradeneeded = () => {
            const d = r.result;
            d.createObjectStore('profiles', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
            d.createObjectStore('pages', { keyPath: 'id' }).createIndex('profileId', 'profileId');
            const c = d.createObjectStore('calibrations', { keyPath: 'id' }); c.createIndex('profileId', 'profileId'); c.createIndex('createdAt', 'createdAt');
            d.createObjectStore('calibrationRuns', { keyPath: ['calibrationId', 'pageId', 'scope', 'run'] }).createIndex('calibrationId', 'calibrationId');
            const rn = d.createObjectStore('runs', { keyPath: 'id' }); rn.createIndex('profileId', 'profileId'); rn.createIndex('createdAt', 'createdAt');
            d.createObjectStore('results', { keyPath: ['runId', 'pageId', 'scope'] }).createIndex('runId', 'runId');
            d.createObjectStore('settings', { keyPath: 'key' });
          };
          r.onsuccess = () => {
            const d = r.result, tx = d.transaction(['profiles', 'pages', 'runs', 'results', 'calibrations'], 'readwrite');
            const terms = ['a','b','c','d','e','f','g','h','i','j','k'], exp = terms.slice(0, 10);
            const meta = { title: 'Old', description: '', ogTitle: '', ogDescription: '', jsonLd: [] };
            tx.objectStore('profiles').put({ id: 'p1', name: 'Legacy site', domain: 'https://legacy.test', sitemapUrl: '', pathFilter: '', terms, createdAt: 1, updatedAt: 2 });
            tx.objectStore('pages').put({ id: 'g1', profileId: 'p1', url: 'https://legacy.test/a', path: '/a', intent: 'What is a?', expected: exp, included: true });
            tx.objectStore('calibrations').put({ id: 'c1', profileId: 'p1', createdAt: 1, status: 'complete', pageIds: ['g1'], texts: {} });
            tx.objectStore('runs').put({ id: 'r1', profileId: 'p1', calibrationId: 'c1', createdAt: 1760000000000, label: 'Baseline', status: 'complete', profileScore: { meta: 1.5, page: 4 } });
            for (const [scope, sc] of [['meta', 1.5], ['page', 4]]) tx.objectStore('results').put({ runId: 'r1', pageId: 'g1', scope, text: { meta, body: 'x' }, intentFit: 0.5, intentProbabilities: { '2': 1 }, terms: terms.map(() => sc / 5), termSum: sc * 2, score: sc, model: 'jev-1.13.0' });
            tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
          };
          r.onerror = () => rej(r.error);
        })""")
        await pg5.goto(A + "/dashboard")
        await expect(pg5.get_by_role("heading", name="Legacy site")).to_be_visible(timeout=10000)
        await expect(pg5.get_by_text("Metadata score, profile")).to_be_visible(timeout=10000)
        try:
            await expect(pg5.locator(".MuiDataGrid-row").first).to_contain_text("1.50", timeout=10000)
        except Exception:
            pass
        legacy = await pg5.locator(".MuiDataGrid-row").first.inner_text()
        check("version 1 data migrates: the old run keeps its scores", seeded and "1.50" in legacy and "4.00" in legacy, legacy.replace("\n", " | "))
        check("migration drops the calibration tables", await pg5.evaluate("new Promise(r => { const o = indexedDB.open('seo-jev-analyzer'); o.onsuccess = () => r([...o.result.objectStoreNames].sort().join(',')); })") == "pages,profiles,runs,scores,settings")

        # 10. Password gate
        ctx4 = await b.new_context()
        pg4 = await ctx4.new_page()
        await pg4.goto(B + "/dashboard")
        check("password gate redirects to sign-in", "/login" in pg4.url, pg4.url)
        r = await pg4.request.post(B + "/api/v1/get_method", data={})
        check("API refuses without signing in", r.status == 401, str(r.status))
        r = await pg4.request.post(B + "/api/v1/get_method", data={}, headers={"Authorization": "Bearer mcp-key-for-tests-0123"})
        check("API accepts the bearer key", r.status == 200, str(r.status))
        mcp_headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18"}
        init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "e2e", "version": "1"}}}
        r = await pg4.request.post(B + "/api/mcp", data=json.dumps(init), headers=mcp_headers)
        check("MCP refuses without the key", r.status == 401, str(r.status))
        r = await pg4.request.post(B + "/api/mcp", data=json.dumps(init), headers={**mcp_headers, "Authorization": "Bearer mcp-key-for-tests-0123"})
        body = await r.json() if r.status == 200 else {}
        check("MCP initialises with the key", r.status == 200 and body.get("result", {}).get("serverInfo", {}).get("name") == "seo-jev-analyzer", str(r.status))
        call = {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "score_page", "arguments": {"profileUrl": "http://localhost:3101/examples/boulderfest.json", "page": "/climb/casual-entry", "text": {"meta": {"title": "Casual entry", "description": "", "ogTitle": "", "ogDescription": "", "jsonLd": []}, "body": "Casual entry"}}}}
        r = await pg4.request.post(B + "/api/mcp", data=json.dumps(call), headers={**mcp_headers, "Authorization": "Bearer mcp-key-for-tests-0123"})
        res = (await r.json()).get("result", {}) if r.status == 200 else {}
        sc = res.get("structuredContent") or {}
        check("MCP score_page reads inputs from a profileUrl", sc.get("inputs", {}).get("intent", "").startswith("How much") and len(sc.get("inputs", {}).get("expected", [])) == 10, (res.get("content") or [{}])[0].get("text", "")[:160])
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
