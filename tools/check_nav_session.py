"""Public pages show "My dashboard" while a Supabase session is stored."""
import sys
from playwright.sync_api import sync_playwright

PAGES = ["index.html", "services.html", "infrastructure.html", "info.html", "contact.html", "404.html", "login.html"]
KEY = "sb-ixxztgikddrwifiexoqi-auth-token"
ok = True
errors = []


def check(label, cond):
    global ok
    ok = ok and bool(cond)
    print(("PASS " if cond else "FAIL ") + label)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/supabase-js@*/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=""))
    base = "http://localhost:3100/"
    page.goto(base + "index.html")
    check("signed out: Client login", page.inner_text(".nav-cta a").strip() == "Client login")
    page.evaluate("k => localStorage.setItem(k, JSON.stringify({access_token: 'x', refresh_token: 'y', user: {id: 'u'}}))", KEY)
    for name in PAGES:
        page.goto(base + name)
        cta = page.locator(".nav-cta a")
        check(name + ": nav shows My dashboard", cta.inner_text().strip() == "My dashboard" and cta.get_attribute("href") == "dashboard.html")
        check(name + ": no Client login links left", page.locator("a[href='login.html']").count() == 0)
    page.evaluate("k => localStorage.removeItem(k)", KEY)
    page.goto(base + "contact.html")
    check("after sign-out: Client login again", page.inner_text(".nav-cta a").strip() == "Client login")
    check("no console errors " + str(errors), not errors)
    browser.close()
sys.exit(0 if ok else 1)
