"""Opens login.html the way the emailed reset link does and checks that the
new-password step (or an expired-link message) shows instead of sign-in."""
from playwright.sync_api import sync_playwright

FAKE = r"""
window.supabase = { createClient: function () {
  var cbs = [];
  setTimeout(function () {
    if (/type=recovery/.test(location.hash)) cbs.forEach(function (cb) { cb('PASSWORD_RECOVERY', {}); });
  }, 50);
  return { auth: {
    getSession: function () { return Promise.resolve({ data: { session: null } }); },
    onAuthStateChange: function (cb) { cbs.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
    resetPasswordForEmail: function (e, o) { window.__redirect = o.redirectTo; return Promise.resolve({ error: null }); }
  }, from: function () { return {}; } };
} };
"""
BASE = "http://localhost:3100/login.html"
ok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    for url, expect in [
        (BASE + "?reset=1#access_token=x&refresh_token=y&type=recovery", "step2"),
        (BASE + "?reset=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", "error"),
        (BASE, "signin"),
    ]:
        page = b.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.route("**/supabase-js@*/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        page.goto(url); page.wait_for_timeout(400)
        st = page.evaluate("""() => ({
          signin: !document.getElementById('panel-signin').hidden,
          reset: !document.getElementById('panel-reset').hidden,
          step2: !document.getElementById('reset-step-2').hidden,
          msg: (document.querySelector('form[data-auth=reset-request] .form-status')||{}).textContent || ''
        })""")
        good = {"step2": st["step2"] and st["reset"] and not st["signin"],
                "error": st["reset"] and not st["step2"] and "expired" in st["msg"],
                "signin": st["signin"] and not st["reset"]}[expect]
        print(expect, "OK" if good and not errs else "FAIL", st, errs)
        ok &= good and not errs
    page = b.new_page()
    page.route("**/supabase-js@*/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    page.goto(BASE + "#reset"); page.wait_for_timeout(300)
    page.fill("#reset-email", "a@b.com"); page.click("form[data-auth=reset-request] button[type=submit]"); page.wait_for_timeout(300)
    r = page.evaluate("window.__redirect"); print("redirectTo", r); ok &= r == BASE + "?reset=1"
    b.close()
print("ALL OK" if ok else "FAILED")
