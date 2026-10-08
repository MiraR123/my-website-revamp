"""Admin client filter and empty states, against the in-memory supabase-js
stand-in from check_documents.py with one extra client that has no records."""
import pathlib
import sys
from playwright.sync_api import sync_playwright

src = pathlib.Path(__file__).with_name("check_documents.py").read_text()
FAKE = src.split('FAKE = r"""', 1)[1].split('"""', 1)[0]
FAKE = FAKE.replace(
    "role: 'client', must_change_password: false }\n    ],",
    "role: 'client', must_change_password: false },\n"
    "      { id: 'c2', client_code: 'BAC-1006', full_name: 'Meena', company: 'Empty Ltd', phone: '98400', email: 'e@example.com', role: 'client', must_change_password: true }\n    ],",
    1,
).replace(
    "invoice_id: null }\n    ],\n    invoices: [],",
    "invoice_id: null },\n"
    "      { id: 'd-a', client_id: ADMIN, dc_number: 'DC-9000', dc_date: '2026-09-02', dc_file: null, invoice_id: null }\n    ],\n"
    "    invoices: [{ id: 'i1', client_id: CLIENT, invoice_number: 'INV-1', invoice_date: '2026-09-03', invoice_file: null }],",
    1,
)
assert "BAC-1006" in FAKE and "INV-1" in FAKE

ok = True
errors = []


def check(label, cond):
    global ok
    ok = ok and bool(cond)
    print(("PASS " if cond else "FAIL ") + label)


def text(page, sel):
    return page.text_content(sel).strip()


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/supabase-js@*/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    page.goto("http://localhost:3100/dashboard.html#dc", wait_until="networkidle")
    page.wait_for_timeout(300)

    check("filter shown on DC tab", page.is_visible("#client-filter"))
    check("filter lists All + 3 clients", page.locator("#client-filter option").count() == 4)
    dc = text(page, "#dc-list")
    check("all clients: both DCs listed", "DC-4001" in dc and "DC-9000" in dc)

    page.select_option("#client-filter", "c1")
    page.wait_for_timeout(200)
    dc = text(page, "#dc-list")
    check("BAC-1005 only: DC-4001 without DC-9000", "DC-4001" in dc and "DC-9000" not in dc)
    check("BAC-1005 invoice listed", "INV-1" in text(page, "#inv-list"))

    page.select_option("#client-filter", "c2")
    page.wait_for_timeout(200)
    check("empty client DC message", text(page, "#dc-list") == "No unbilled delivery challans for BAC-1006.")
    check("empty client invoice message", text(page, "#inv-list") == "No invoices for BAC-1006 yet.")
    page.click("#tab-clients")
    cl = text(page, "#client-detail")
    check("clients tab shows only BAC-1006 with phone", page.is_visible("#client-detail") and not page.is_visible("#client-list")
          and "BAC-1006" in cl and "98400" in cl and "BAC-1005" not in cl)
    check("filter kept on Clients tab", page.is_visible("#client-filter"))

    page.click("#tab-documents")
    page.wait_for_timeout(200)
    check("filter hidden on Documents tab", not page.is_visible("#client-filter"))
    check("documents picker follows filter", page.input_value("#doc-client") == "c2")
    check("documents list shows my uploads", text(page, "#doc-list") == "You haven't uploaded any documents yet.")

    page.click("#tab-account")
    check("filter hidden on Account tab", not page.is_visible("#client-filter"))

    page.click("#tab-dc")
    page.select_option("#client-filter", "")
    page.wait_for_timeout(200)
    dc = text(page, "#dc-list")
    check("back to all clients", "DC-4001" in dc and "DC-9000" in dc)
    page.click("#tab-clients")
    check("clients tab lists everyone again", page.locator("#client-list tbody tr").count() == 3)

    page.set_viewport_size({"width": 390, "height": 844})
    check("no horizontal overflow on mobile", page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0)
    page.screenshot(path="/home/ubuntu/filter-mobile.png", full_page=False)
    page.set_viewport_size({"width": 1280, "height": 900})
    page.click("#tab-dc")
    page.select_option("#client-filter", "c2")
    page.wait_for_timeout(200)
    page.screenshot(path="/home/ubuntu/filter-empty.png", full_page=False)
    check("no console errors " + str(errors), not errors)
    browser.close()

sys.exit(0 if ok else 1)
