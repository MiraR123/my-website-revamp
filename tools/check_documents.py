"""Drives the admin Documents tab against an in-memory stand-in for
supabase-js, so the real supabase-auth.js and dashboard.js run end to end:
upload a DC, upload an invoice that bills it, replace and delete."""
import sys
from playwright.sync_api import sync_playwright

FAKE = r"""
(function () {
  var ADMIN = 'a0', CLIENT = 'c1';
  var db = {
    clients: [
      { id: ADMIN, client_code: 'BAC-1004', full_name: 'Office Admin', company: 'BAC', email: 'admin@example.com', role: 'admin', must_change_password: false },
      { id: CLIENT, client_code: 'BAC-1005', full_name: 'Ravi', company: 'Acme PCB', email: 'client@example.com', role: 'client', must_change_password: false }
    ],
    delivery_challans: [
      { id: 'd-old', client_id: CLIENT, dc_number: 'DC-4001', dc_date: '2026-09-01', dc_file: null, invoice_id: null }
    ],
    invoices: [], jobs: []
  };
  var files = {};
  var seq = 0;
  window.__fake = { db: db, files: files, log: [] };

  function embed(table, row) {
    var out = Object.assign({}, row);
    var cl = db.clients.find(function (c) { return c.id === row.client_id; });
    if (table !== 'clients') out.clients = cl ? { client_code: cl.client_code } : null;
    if (table === 'delivery_challans') {
      var inv = db.invoices.find(function (i) { return i.id === row.invoice_id; });
      out.invoices = inv ? { invoice_number: inv.invoice_number } : null;
    }
    if (table === 'invoices') {
      out.delivery_challans = [{ count: db.delivery_challans.filter(function (d) { return d.invoice_id === row.id; }).length }];
    }
    return out;
  }

  function Query(table) {
    this.table = table; this.filters = []; this.op = 'select'; this.one = null;
  }
  Query.prototype.select = function () { if (this.op === 'select') this.op = 'select'; this.returning = true; return this; };
  Query.prototype.eq = function (k, v) { this.filters.push(function (r) { return r[k] === v; }); return this; };
  Query.prototype.is = function (k, v) { this.filters.push(function (r) { return (r[k] == null) === (v === null); }); return this; };
  Query.prototype.in = function (k, vs) { this.filters.push(function (r) { return vs.indexOf(r[k]) >= 0; }); return this; };
  Query.prototype.order = function () { return this; };
  Query.prototype.limit = function () { return this; };
  Query.prototype.maybeSingle = function () { this.one = 'maybe'; return this; };
  Query.prototype.single = function () { this.one = 'single'; return this; };
  Query.prototype.insert = function (row) { this.op = 'insert'; this.payload = row; return this; };
  Query.prototype.update = function (obj) { this.op = 'update'; this.payload = obj; return this; };
  Query.prototype.delete = function () { this.op = 'delete'; return this; };
  Query.prototype.run = function () {
    var rows = db[this.table] || [];
    var f = this.filters;
    var match = function (r) { return f.every(function (fn) { return fn(r); }); };
    window.__fake.log.push(this.op + ' ' + this.table);
    if (this.op === 'insert') {
      var row = Object.assign({ id: 'n' + (++seq), created_by: ADMIN, created_at: new Date(Date.now() + seq * 1000).toISOString() }, this.payload);
      var num = row.dc_number || row.invoice_number;
      var dup = rows.some(function (r) { return (r.dc_number || r.invoice_number) === num && r.client_id === row.client_id; });
      if (dup) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
      rows.push(row);
      return { data: { id: row.id }, error: null };
    }
    if (this.op === 'update') {
      var p = this.payload;
      rows.filter(match).forEach(function (r) { Object.assign(r, p); });
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      var t = this.table, gone = rows.filter(match);
      db[t] = rows.filter(function (r) { return !match(r); });
      if (t === 'invoices') gone.forEach(function (g) {
        db.delivery_challans.forEach(function (d) { if (d.invoice_id === g.id) d.invoice_id = null; });
      });
      return { data: null, error: null };
    }
    var t2 = this.table;
    var out = rows.filter(match).map(function (r) { return embed(t2, r); });
    if (this.one) out = out[0] || null;
    return { data: out, error: null };
  };
  Query.prototype.then = function (ok, bad) {
    var self = this;
    return Promise.resolve().then(function () { return self.run(); }).then(ok, bad);
  };

  function Bucket(name) { this.name = name; }
  Bucket.prototype.upload = function (path, file, opts) {
    var key = this.name + '/' + path;
    window.__fake.log.push('upload ' + key + (opts.upsert ? ' (upsert)' : ''));
    if (files[key] && !opts.upsert) return Promise.resolve({ data: null, error: { message: 'The resource already exists' } });
    files[key] = { name: file.name, size: file.size, type: opts.contentType };
    return Promise.resolve({ data: { path: path }, error: null });
  };
  Bucket.prototype.remove = function (paths) {
    var b = this.name;
    paths.forEach(function (p) { window.__fake.log.push('remove ' + b + '/' + p); delete files[b + '/' + p]; });
    return Promise.resolve({ data: [], error: null });
  };
  Bucket.prototype.createSignedUrl = function (path) {
    var key = this.name + '/' + path;
    return Promise.resolve(files[key] ? { data: { signedUrl: 'about:blank#' + key }, error: null } : { data: null, error: { message: 'Object not found' } });
  };

  var session = { user: { id: ADMIN, email: 'admin@example.com', created_at: '2026-01-01', user_metadata: {} } };
  window.supabase = {
    createClient: function () {
      return {
        from: function (t) { return new Query(t); },
        storage: { from: function (b) { return new Bucket(b); } },
        rpc: function () { return Promise.resolve({ data: null, error: null }); },
        functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } },
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: session } }); },
          onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
          signOut: function () { return Promise.resolve({}); }
        }
      };
    }
  };
})();
"""

PDF = b"%PDF-1.4\n%fake\n"
errors = []
ok = True

def check(label, cond):
    global ok
    ok = ok and bool(cond)
    print(("PASS " if cond else "FAIL ") + label)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.route("**/supabase-js@*/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    page.on("dialog", lambda d: d.accept())
    page.goto("http://localhost:3100/dashboard.html#documents", wait_until="networkidle")

    check("Documents tab visible for admin", page.is_visible("#tab-documents"))
    page.click("#tab-documents")
    check("client dropdown lists both clients", page.locator("#doc-client option").count() == 3)

    page.wait_for_function("document.getElementById('doc-list').textContent.indexOf('Loading') < 0")
    check("my uploads empty at start", page.text_content("#doc-list").strip() == "You haven't uploaded any documents yet.")
    page.select_option("#doc-scope", "all")
    page.wait_for_selector("#doc-list table")
    lst = page.text_content("#doc-list")
    check("all uploads lists older DC with client", "DC-4001" in lst and "BAC-1005" in lst and "Unbilled" in lst)
    page.select_option("#doc-scope", "mine")
    page.wait_for_function("document.getElementById('doc-list').textContent.indexOf('DC-4001') < 0")

    page.select_option("#doc-client", "c1")

    # validation: no file
    page.fill("#doc-number", "DC-4006")
    page.click("#doc-form button[type=submit]")
    check("missing file rejected", "Choose the PDF file" in page.text_content("#doc-status"))

    # wrong type
    page.set_input_files("#doc-file", files=[{"name": "dc.png", "mimeType": "image/png", "buffer": b"x"}])
    page.click("#doc-form button[type=submit]")
    check("non-PDF rejected", "Only PDF" in page.text_content("#doc-status"))

    # upload a DC
    page.set_input_files("#doc-file", files=[{"name": "dc.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    page.fill("#doc-date", "2026-10-05")
    page.click("#doc-form button[type=submit]")
    page.wait_for_function("document.getElementById('doc-status').textContent.indexOf('uploaded') >= 0")
    fake = page.evaluate("window.__fake")
    dc = [d for d in fake["db"]["delivery_challans"] if d["dc_number"] == "DC-4006"]
    check("DC row inserted with file path", dc and dc[0]["dc_file"] == "c1/DC-4006.pdf" and dc[0]["dc_date"] == "2026-10-05")
    check("DC PDF stored in challans/c1/", "challans/c1/DC-4006.pdf" in fake["files"])
    page.wait_for_function("document.getElementById('doc-list').textContent.indexOf('DC-4006') >= 0")

    # duplicate DC
    page.fill("#doc-number", "DC-4006")
    page.set_input_files("#doc-file", files=[{"name": "dc.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    page.click("#doc-form button[type=submit]")
    page.wait_for_function("document.getElementById('doc-status').className.indexOf('is-error') >= 0")
    check("duplicate DC refused", "already" in page.text_content("#doc-status"))

    # upload invoice billing DC-4006 only
    page.select_option("#doc-kind", "invoice")
    check("bill list shown for invoice", page.is_visible("#doc-bill") and page.locator("input[name=doc-dc]").count() == 2)
    check("labels switch to invoice", page.text_content("[data-doc-label=number]") == "Invoice number")
    page.fill("#doc-number", "INV-2026-1001")
    page.set_input_files("#doc-file", files=[{"name": "inv.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    page.check("input[name=doc-dc][value='%s']" % dc[0]["id"])
    page.click("#doc-form button[type=submit]")
    page.wait_for_function("document.getElementById('doc-status').textContent.indexOf('marked billed') >= 0")
    fake = page.evaluate("window.__fake")
    inv = [i for i in fake["db"]["invoices"] if i["invoice_number"] == "INV-2026-1001"][0]
    billed = {d["dc_number"]: d["invoice_id"] for d in fake["db"]["delivery_challans"]}
    check("invoice row + PDF stored", inv["invoice_file"] == "c1/INV-2026-1001.pdf" and "invoices/c1/INV-2026-1001.pdf" in fake["files"])
    check("only ticked DC billed", billed["DC-4006"] == inv["id"] and billed["DC-4001"] is None)
    page.wait_for_function("document.getElementById('doc-list').textContent.indexOf('Billed on INV-2026-1001') >= 0")
    check("invoice shows 1 challan", "1 challan" in page.text_content("#doc-list"))
    page.screenshot(path="/home/ubuntu/doc-tab.png", full_page=True)

    # admin's DC tab refreshed: DC-4006 gone (billed), invoice tab shows INV
    check("DC tab drops billed DC", "DC-4006" not in page.text_content("#dc-list") and "DC-4001" in page.text_content("#dc-list"))
    check("Invoice tab lists new invoice", "INV-2026-1001" in page.text_content("#inv-list"))

    # replace PDF of the invoice
    rows = page.evaluate("Array.from(document.querySelectorAll('#doc-list tbody tr')).map(r => r.cells[2].textContent)")
    idx = rows.index("INV-2026-1001")
    with page.expect_file_chooser() as fc:
        page.click("[data-doc-replace='%d']" % idx)
    fc.value.set_files(files=[{"name": "inv-v2.pdf", "mimeType": "application/pdf", "buffer": PDF + b"v2"}])
    page.wait_for_function("document.getElementById('doc-status').textContent.indexOf('replaced') >= 0")
    fake = page.evaluate("window.__fake")
    check("replace upserts same path", fake["files"]["invoices/c1/INV-2026-1001.pdf"]["name"] == "inv-v2.pdf")

    # delete invoice -> DC back to unbilled, file removed
    page.click("[data-doc-delete='%d']" % idx)
    page.wait_for_function("document.getElementById('doc-status').textContent.indexOf('deleted') >= 0")
    fake = page.evaluate("window.__fake")
    check("invoice deleted with its PDF", not fake["db"]["invoices"] and "invoices/c1/INV-2026-1001.pdf" not in fake["files"])
    check("its DC is unbilled again", [d for d in fake["db"]["delivery_challans"] if d["dc_number"] == "DC-4006"][0]["invoice_id"] is None)
    page.wait_for_function("document.getElementById('dc-list').textContent.indexOf('DC-4006') >= 0")
    check("DC tab shows it again", True)

    # upload for a second client: my list spans both clients
    page.select_option("#doc-kind", "dc")
    page.select_option("#doc-client", "a0")
    page.fill("#doc-number", "DC-7000")
    page.set_input_files("#doc-file", files=[{"name": "dc7.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    page.click("#doc-form button[type=submit]")
    page.wait_for_function("document.getElementById('doc-list').textContent.indexOf('DC-7000') >= 0")
    clients = page.evaluate("Array.from(document.querySelectorAll('#doc-list tbody tr')).map(r => r.cells[0].textContent + ' ' + r.cells[2].textContent)")
    check("my uploads span clients, newest first " + str(clients), clients == ["BAC-1004 DC-7000", "BAC-1005 DC-4006"])
    page.screenshot(path="/home/ubuntu/doc-tab-mine.png", full_page=True)

    # mobile layout: no horizontal overflow
    page.set_viewport_size({"width": 390, "height": 844})
    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check("no horizontal overflow on mobile (%d px)" % over, over <= 0)
    page.screenshot(path="/home/ubuntu/doc-tab-mobile.png", full_page=True)

    browser.close()

check("no console errors " + str(errors), not errors)
sys.exit(0 if ok else 1)
