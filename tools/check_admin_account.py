"""Account tab for an admin vs a client, against the in-memory supabase-js
stand-in from check_client_filter.py / check_documents.py."""
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright

src = pathlib.Path(__file__).with_name("check_client_filter.py").read_text()
ns = {"__file__": __file__}
exec(compile(src.split("ok = True", 1)[0].replace("from playwright.sync_api import sync_playwright", ""), "filter", "exec"), ns)
FAKE = ns["FAKE"]
CLIENT_FAKE = FAKE.replace("var session = { user: { id: ADMIN, email: 'admin@example.com'",
                           "var session = { user: { id: CLIENT, email: 'client@example.com'")

ok = True
errors = []


def check(label, cond):
    global ok
    ok = ok and bool(cond)
    print(("PASS " if cond else "FAIL ") + label)


def visible_text(page):
    return page.inner_text("#panel-account")


with sync_playwright() as p:
    browser = p.chromium.launch()
    for who, body in (("admin", FAKE), ("client", CLIENT_FAKE)):
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/supabase-js@*/**", (lambda b: lambda r: r.fulfill(status=200, content_type="application/javascript", body=b))(body))
        page.goto("http://localhost:3100/dashboard.html", wait_until="networkidle")
        page.wait_for_timeout(400)
        txt = visible_text(page)
        if who == "admin":
            check("admin heading", page.text_content("h1").strip() == "Admin dashboard")
            check("admin chip", "Admin" in page.inner_text(".page-hero-meta") and "Client ID" not in page.inner_text(".page-hero-meta"))
            check("client-only blocks hidden", all(s not in txt for s in ("Your client ID", "Recent jobs", "What you can do here", "Contact the office")))
            check("admin blocks shown", all(s in txt for s in ("Administrator account", "Overview", "Admin tasks", "Admin since", "Role")) and "Supabase" not in txt)
            stats = page.inner_text("#admin-stats")
            check("overview counts " + re.sub(r"\s+", " ", stats), re.search(r"Clients\s+2", stats) and re.search(r"Unbilled challans\s+2", stats)
                  and re.search(r"Invoices\s+1", stats) and "temporary" not in stats)
            page.screenshot(path="/home/ubuntu/admin-account.png", full_page=True)
            tabs = page.locator(".dash-tabs [role=tab]:visible").all_inner_texts()
            check("tab order " + str(tabs), tabs[:2] == ["Account", "Clients"])
            page.click("[data-goto-tab=tab-clients]")
            check("Manage clients opens Clients list", page.is_visible("#client-list") and page.locator("#client-list tbody tr").count() == 3)
            page.click("#client-list tr[data-client-id=c1]")
            page.wait_for_timeout(300)
            cd = page.inner_text("#client-detail")
            check("client detail shows profile", page.is_visible("#client-detail") and not page.is_visible("#client-list")
                  and all(s in cd for s in ("BAC-1005", "Acme PCB", "Ravi", "client@example.com", "Active")))
            check("client detail shows own DC and invoice only", "DC-4001" in cd and "INV-1" in cd and "DC-9000" not in cd)
            check("filter follows selection", page.input_value("#client-filter") == "c1")
            page.screenshot(path="/home/ubuntu/client-detail.png", full_page=True)
            page.set_viewport_size({"width": 390, "height": 844})
            check("detail: no horizontal overflow on mobile", page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0)
            page.set_viewport_size({"width": 1280, "height": 900})
            page.click("#cd-back")
            page.wait_for_timeout(200)
            check("back returns to all clients", page.is_visible("#client-list") and not page.is_visible("#client-detail")
                  and page.input_value("#client-filter") == "" and page.locator("#client-list tbody tr").count() == 3)
            page.select_option("#client-filter", "c2")
            page.wait_for_timeout(300)
            cd = page.inner_text("#client-detail")
            check("empty client detail messages", "No unbilled delivery challans for BAC-1006." in cd and "No invoices for BAC-1006 yet." in cd)
            page.select_option("#client-filter", "")
            page.click("#tab-account")
            page.click("[data-goto-tab=tab-documents]")
            check("Upload documents button opens Documents", page.is_visible("#panel-documents"))
            page.set_viewport_size({"width": 390, "height": 844})
            page.click("#tab-account")
            check("no horizontal overflow on mobile", page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0)
        else:
            check("client sees client blocks", all(s in txt for s in ("Your client ID", "Recent jobs", "What you can do here", "Client since")))
            check("client sees no admin blocks", all(s not in txt for s in ("Administrator account", "Overview", "Admin tasks", "Admin since")))
            check("client chip keeps Client ID", "Client ID" in page.inner_text(".page-hero-meta"))
        page.close()
    check("no console errors " + str(errors), not errors)
    browser.close()

sys.exit(0 if ok else 1)
