/* Client dashboard: renders the signed-in Supabase user plus their row in
   public.clients. Any visitor without a session is sent back to the login
   page, so the page is only ever a view of data RLS already allowed. */
(function () {
  "use strict";

  var auth = window.BACAuth;
  var cfg = window.BAC_SUPABASE || {};
  var errorBox = document.getElementById("dash-error");

  function set(key, text) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-dash=" + key + "]"), function (node) {
      node.textContent = text;
    });
  }

  function fail(message, tone) {
    if (!errorBox || !message) return;
    errorBox.className = "form-status is-" + (tone || "error");
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  function date(value) {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function dateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderJobs(jobs) {
    var host = document.getElementById("dash-jobs");
    if (!host) return;

    if (jobs === null) {
      host.innerHTML = "<p class=\"tight\">Job tracking is not switched on for this account yet. Call the office and we will add your current jobs here.</p>";
      return;
    }
    if (!jobs.length) {
      host.innerHTML = "<p class=\"tight\">No jobs recorded yet. Once we receive your artwork, every job appears here with its status.</p>";
      return;
    }

    var rows = jobs.map(function (job) {
      return "<tr><td>" + (job.reference || job.id) + "</td><td>" + (job.title || "—") +
        "</td><td>" + (job.service || "—") + "</td><td><span class=\"job-status\">" +
        (job.status || "received") + "</span></td><td>" + date(job.created_at) + "</td></tr>";
    }).join("");

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>Reference</th><th>Job</th><th>Service</th><th>Status</th><th>Received</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
  }

  function stats(host, items) {
    if (!host) return;
    host.innerHTML = items.map(function (item) {
      return "<div class=\"dash-stat\"><span>" + escape(item[0]) + "</span><strong>" + escape(item[1]) + "</strong></div>";
    }).join("");
  }

  function note(host, text) {
    if (host) host.innerHTML = "<p class=\"tight\">" + escape(text) + "</p>";
  }

  function tabs() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".dash-tabs [role=tab]"));
    if (!buttons.length) return;

    function show(id) {
      buttons.forEach(function (button) {
        var on = button.id === id;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-selected", on ? "true" : "false");
        var panel = document.getElementById(button.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      syncFilter(id);
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        show(button.id);
        history.replaceState(null, "", "#" + button.id.replace("tab-", ""));
      });
    });

    var wanted = "tab-" + location.hash.replace("#", "");
    if (document.getElementById(wanted)) show(wanted);
  }

  /* The customer code belongs to the account rather than to each row, so it
     is read once from public.clients and printed against every line. */
  var customerCode = "—";
  var clientId = "";
  var isAdmin = false;

  /* Admin filter: "" shows every client, otherwise one client's records. */
  var allClients = [];
  var filterId = "";
  var FILTER_TABS = ["tab-dc", "tab-invoices", "tab-clients"];

  function filterClient() {
    for (var i = 0; i < allClients.length; i++) if (allClients[i].id === filterId) return allClients[i];
    return null;
  }

  function filterName() {
    var row = filterClient();
    return row ? row.client_code : "";
  }

  function syncFilter(tabId) {
    var wrap = document.getElementById("client-filter-wrap");
    if (!wrap) return;
    var active = tabId || ((document.querySelector(".dash-tabs [aria-selected=true]") || {}).id);
    wrap.hidden = !isAdmin || FILTER_TABS.indexOf(active) < 0;
  }

  /* A one-page PDF written by hand: five objects, then an xref table holding
     the byte offset of each, which is why the objects are concatenated in
     order and measured as they go. Keeps a PDF library out of a static site
     for what is three lines of text. */
  function simplePdf(heading, fields) {
    var lines = ["Business Automation Centre", heading, ""].concat(
      fields.map(function (f) { return f[0] + ": " + f[1]; })
    );

    var text = lines.map(function (line, index) {
      var size = index === 0 ? 16 : index === 1 ? 13 : 11;
      return "BT /F1 " + size + " Tf 64 " + (720 - index * 26) + " Td (" +
        String(line).replace(/([\\()])/g, "\\$1") + ") Tj ET";
    }).join("\n");

    var objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      "<< /Length " + text.length + " >>\nstream\n" + text + "\nendstream",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    ];

    var pdf = "%PDF-1.4\n";
    var offsets = objects.map(function (body, index) {
      var start = pdf.length;
      pdf += (index + 1) + " 0 obj\n" + body + "\nendobj\n";
      return start;
    });

    var xref = pdf.length;
    pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n" +
      offsets.map(function (offset) {
        return ("0000000000" + offset).slice(-10) + " 00000 n \n";
      }).join("") +
      "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\n" +
      "startxref\n" + xref + "\n%%EOF";

    return pdf;
  }

  function saveAs(name, type, body) {
    var url = URL.createObjectURL(new Blob([body], { type: type }));
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* A client's own code comes from their profile; an admin sees rows from
     every client, each carrying its own code through the join. */
  function code(row) {
    return (row.clients && row.clients.client_code) || customerCode;
  }

  /* Both tabs are the same table: reference, date, customer code and a PDF
     of the office's own document. Storage keeps one folder per client with
     the file named after the reference, so a row needs no extra bookkeeping;
     where nothing has been uploaded the row prints a generated PDF instead. */
  function renderDocuments(opts, rows) {
    var host = document.getElementById(opts.host);
    var statHost = document.getElementById(opts.stats);
    if (!host) return;

    if (rows === null) {
      stats(statHost, []);
      note(host, opts.offText);
      return;
    }

    stats(statHost, [[opts.statLabel, String(rows.length)]]);

    if (!rows.length) {
      note(host, opts.emptyText);
      return;
    }

    var body = rows.map(function (row, index) {
      var number = escape(row[opts.numberKey]);
      return "<tr>" +
        "<td>" + (opts.expand
          ? "<button type=\"button\" class=\"link-btn\" aria-expanded=\"false\" data-expand=\"" + index + "\"><strong>" + number + "</strong></button>"
          : "<strong>" + number + "</strong>") + "</td>" +
        "<td>" + date(row[opts.dateKey]) + "</td>" +
        "<td>" + escape(code(row)) + "</td>" +
        "<td><button type=\"button\" class=\"btn btn-sm\" data-row=\"" + index +
          "\">Download PDF</button></td></tr>";
    }).join("");

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>" + escape(opts.numberLabel) + "</th><th>" + escape(opts.dateLabel) +
      "</th><th>Customer code</th><th>Download</th></tr></thead>" +
      "<tbody>" + body + "</tbody></table></div>";

    host.onclick = function (event) {
      var toggle = event.target.closest("[data-expand]");
      if (toggle) return expandInvoice(toggle, rows[Number(toggle.dataset.expand)]);

      var dcButton = event.target.closest("[data-dc]");
      if (dcButton) return downloadDocument(CHALLAN, dcButton.closest("tr").__challans[Number(dcButton.dataset.dc)], dcButton);

      var button = event.target.closest("[data-row]");
      if (button) downloadDocument(opts, rows[Number(button.dataset.row)], button);
    };
  }

  function downloadDocument(opts, row, button) {
    var name = String(row[opts.numberKey] || opts.heading).replace(/[^\w.-]+/g, "-");
    var path = row[opts.fileKey] || ((row.client_id || clientId) + "/" + name + ".pdf");

    button.disabled = true;
    auth.getFileUrl(opts.bucket, path, name + ".pdf").then(function (url) {
      button.disabled = false;
      if (url) { location.href = url; return; }
      saveAs(name + ".pdf", "application/pdf", simplePdf(opts.heading, [
        [opts.numberLabel, String(row[opts.numberKey] || "")],
        [opts.dateLabel, date(row[opts.dateKey])],
        ["Customer code", code(row)]
      ]));
    });
  }

  /* Clicking an invoice number opens a row listing the challans billed on it. */
  function expandInvoice(toggle, invoice) {
    var tr = toggle.closest("tr");
    var next = tr.nextElementSibling;
    if (next && next.classList.contains("inv-dcs")) {
      next.remove();
      toggle.setAttribute("aria-expanded", "false");
      return;
    }
    toggle.setAttribute("aria-expanded", "true");
    var detail = document.createElement("tr");
    detail.className = "inv-dcs";
    detail.innerHTML = "<td colspan=\"4\"><p class=\"tight\">Loading challans…</p></td>";
    tr.parentNode.insertBefore(detail, tr.nextSibling);

    auth.getInvoiceChallans(invoice.id).then(function (list) {
      var cell = detail.firstChild;
      if (list === null) return note(cell, "The challans for this invoice could not be loaded. Please refresh the page.");
      if (!list.length) return note(cell, "No delivery challans are linked to " + invoice.invoice_number + ".");
      detail.__challans = list;
      cell.innerHTML = "<p class=\"inv-dcs-head\">Delivery challans billed on " + escape(invoice.invoice_number) + "</p>" +
        "<ul class=\"inv-dcs-list\">" + list.map(function (dc, index) {
          return "<li><span><strong>" + escape(dc.dc_number) + "</strong> · " + date(dc.dc_date) + "</span>" +
            "<button type=\"button\" class=\"btn btn-sm\" data-dc=\"" + index + "\">Download PDF</button></li>";
        }).join("") + "</ul>";
    });
  }

  var CHALLAN = {
    heading: "Delivery challan",
    numberKey: "dc_number",
    numberLabel: "DC no.",
    dateKey: "dc_date",
    dateLabel: "DC date",
    fileKey: "dc_file",
    bucket: cfg.challanBucket || "challans"
  };

  function renderChallans(list, target) {
    renderDocuments(Object.assign({}, CHALLAN, {
      host: (target && target.host) || "dc-list",
      stats: (target && target.stats) || "dc-stats",
      statLabel: "Challans pending billing",
      offText: "Delivery challans could not be loaded right now. Please refresh the page in a moment.",
      emptyText: filterName()
        ? "No unbilled delivery challans for " + filterName() + "."
        : isAdmin ? "No unbilled delivery challans for any client." : "No delivery challans available."
    }), list);
  }

  function renderInvoices(list, target) {
    renderDocuments({
      host: (target && target.host) || "inv-list",
      stats: (target && target.stats) || "inv-stats",
      heading: "Invoice",
      numberKey: "invoice_number",
      numberLabel: "Invoice no.",
      dateKey: "invoice_date",
      dateLabel: "Invoice date",
      fileKey: "invoice_file",
      bucket: cfg.invoiceBucket || "invoices",
      expand: true,
      statLabel: "Invoices raised",
      offText: "Invoices could not be loaded right now. Please refresh the page in a moment.",
      emptyText: filterName()
        ? "No invoices for " + filterName() + " yet."
        : isAdmin ? "No invoices for any client yet." : "No invoices available."
    }, list);
  }

  function render(user, profile) {
    var meta = user.user_metadata || {};
    var name = (profile && profile.full_name) || meta.full_name || "there";

    var owner = (profile && (profile.company || profile.full_name)) || meta.company || meta.full_name;
    set("heading", owner ? owner + " — dashboard" : "Client dashboard");
    set("greeting", "Welcome back, " + name + ".");
    customerCode = (profile && profile.client_code) || "Pending";
    set("client-code", customerCode);
    set("full_name", (profile && profile.full_name) || meta.full_name || "—");
    set("company", (profile && profile.company) || meta.company || "—");
    set("email", user.email || "—");
    set("verified", user.email_confirmed_at ? "Yes, on " + date(user.email_confirmed_at) : "Not yet confirmed");
    set("phone", (profile && profile.phone) || meta.phone || "—");
    set("created", date(user.created_at));
    set("last-signin", dateTime(user.last_sign_in_at));
    set("uid", user.id);
    document.title = name + " — Client dashboard — Business Automation Centre";

    if (!profile) {
      fail("Your profile row is not available yet, so the client ID shows as pending. Details below come from your sign-up.", "info");
    }
  }

  function status(box, text, tone) {
    if (!box) return;
    box.className = "form-status is-" + (tone || "info");
    box.hidden = false;
    box.textContent = text;
  }

  /* The office opens the account with a temporary password, so the rest of
     the dashboard stays out of reach until the client has replaced it. The
     flag itself lives in public.clients and is cleared by the database. */
  function firstLoginGate() {
    var panel = document.getElementById("first-login");
    var form = document.getElementById("first-login-form");
    if (!panel || !form) return;

    var box = document.getElementById("first-login-status");
    var hidden = Array.prototype.slice.call(document.querySelectorAll(".dash-tabs, .dash-panel"));
    hidden.forEach(function (node) { node.hidden = true; });
    panel.hidden = false;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var password = document.getElementById("new-password").value;
      if (password.length < 8) return status(box, "Use at least 8 characters.", "error");
      if (password !== document.getElementById("new-password-2").value) {
        return status(box, "Both passwords must match.", "error");
      }

      status(box, "Saving…", "info");
      auth.changePassword(password).then(function (r) {
        if (r.error) return status(box, r.error, "error");
        panel.hidden = true;
        hidden.forEach(function (node) {
          node.hidden = node.classList.contains("dash-panel") && node.id !== "panel-account";
        });
        fail("Password updated. Welcome aboard.", "success");
      });
    });
  }

  function loginState(row) {
    return row.role === "admin" ? "Admin" : row.must_change_password ? "Temporary password" : "Active";
  }

  function chooseClient(id) {
    var filter = document.getElementById("client-filter");
    if (filter) {
      filter.value = id;
      filter.dispatchEvent(new Event("change"));
    } else {
      filterId = id;
      renderClients(allClients);
    }
    var top = document.getElementById("panel-clients");
    if (top && top.scrollIntoView) top.scrollIntoView({ block: "start" });
  }

  /* One client's profile plus their unbilled challans and invoices. */
  var detailToken = 0;
  function clientDetail(row) {
    var title = document.getElementById("cd-title");
    if (title) title.textContent = row.client_code + (row.company ? " — " + row.company : "");
    var info = document.getElementById("cd-info");
    if (info) {
      info.innerHTML = [
        ["Client ID", row.client_code],
        ["Company", row.company || "—"],
        ["Contact name", row.full_name || "—"],
        ["Email", row.email || "—"],
        ["Phone", row.phone || "—"],
        ["Login", loginState(row)],
        ["Client since", date(row.created_at)]
      ].map(function (item) {
        return "<div><dt>" + escape(item[0]) + "</dt><dd>" + escape(item[1]) + "</dd></div>";
      }).join("");
    }

    var dcTarget = { host: "cd-dc-list", stats: "cd-dc-stats" };
    var invTarget = { host: "cd-inv-list", stats: "cd-inv-stats" };
    loadingList(dcTarget.host);
    loadingList(invTarget.host);
    var token = ++detailToken;
    Promise.all([
      auth.getChallans(clientId, true, row.id).catch(function () { return null; }),
      auth.getInvoices(clientId, true, row.id).catch(function () { return null; })
    ]).then(function (r) {
      if (token !== detailToken) return;
      renderChallans(r[0], dcTarget);
      renderInvoices(r[1], invTarget);
    });
  }

  function renderClients(rows) {
    var host = document.getElementById("client-list");
    if (!host) return;
    var chosen = rows ? filterClient() : null;
    ["client-create", "client-list-panel"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.hidden = !!chosen;
    });
    var detail = document.getElementById("client-detail");
    if (detail) detail.hidden = !chosen;
    if (chosen) return clientDetail(chosen);

    if (rows === null) return note(host, "Client accounts could not be loaded right now. Please refresh the page in a moment.");
    if (!rows.length) return note(host, "No client accounts yet.");

    var body = rows.map(function (row) {
      return "<tr class=\"is-link\" data-client-id=\"" + escape(row.id) + "\"><td><strong>" + escape(row.client_code) + "</strong></td><td>" +
        escape(row.company || row.full_name || "—") + "</td><td>" + escape(row.full_name || "—") +
        "</td><td>" + escape(row.email || "—") + "</td><td>" + escape(row.phone || "—") +
        "</td><td>" + loginState(row) + "</td><td><button type=\"button\" class=\"btn btn-sm\">View</button></td></tr>";
    }).join("");

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>Client ID</th><th>Company</th><th>Contact</th><th>Email</th><th>Phone</th><th>Login</th><th>Details</th></tr></thead>" +
      "<tbody>" + body + "</tbody></table></div>";

    host.onclick = function (event) {
      var row = event.target.closest("[data-client-id]");
      if (row) chooseClient(row.dataset.clientId);
    };
  }

  /* Admin Documents tab: upload a DC or invoice PDF for a chosen client,
     tick the challans an invoice covers, and replace or delete entries. */
  var MAX_PDF = 10 * 1024 * 1024;
  var docState = { clientId: "", bill: null, docs: null, scope: "mine", replace: null };

  function clientOptions(rows) {
    return (rows || []).map(function (row) {
      return "<option value=\"" + escape(row.id) + "\">" + escape(row.client_code) + " — " +
        escape(row.company || row.full_name || row.email || "") + "</option>";
    }).join("");
  }

  function fillClientSelect(rows) {
    var select = document.getElementById("doc-client");
    if (select) {
      var current = select.value;
      select.innerHTML = "<option value=\"\">Choose a client…</option>" + clientOptions(rows);
      select.value = current;
    }
    var filter = document.getElementById("client-filter");
    if (filter) {
      filter.innerHTML = "<option value=\"\">All clients</option>" + clientOptions(rows);
      filter.value = filterId;
      if (filter.value !== filterId) filterId = filter.value = "";
    }
  }

  function loadingList(id) {
    note(document.getElementById(id), "Loading…");
  }

  function refreshClientTabs() {
    loadingList("dc-list");
    loadingList("inv-list");
    return Promise.all([
      auth.getChallans(clientId, isAdmin, filterId).then(renderChallans, function () { renderChallans(null); }),
      auth.getInvoices(clientId, isAdmin, filterId).then(renderInvoices, function () { renderInvoices(null); })
    ]);
  }

  function clientFilter() {
    var filter = document.getElementById("client-filter");
    if (!filter) return;
    filter.addEventListener("change", function () {
      filterId = filter.value;
      renderClients(allClients);
      refreshClientTabs();
      var docSelect = document.getElementById("doc-client");
      if (docSelect && filterId && docSelect.value !== filterId) {
        docSelect.value = filterId;
        docSelect.dispatchEvent(new Event("change"));
      }
    });
  }

  function pdfProblem(file) {
    if (!file) return "Choose the PDF file.";
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return "Only PDF files can be uploaded.";
    if (file.size > MAX_PDF) return "The PDF is larger than 10 MB.";
    return "";
  }

  function renderBillList() {
    var host = document.getElementById("doc-bill-list");
    if (!host) return;
    if (!docState.clientId) return note(host, "Choose a client to see their unbilled challans.");
    if (!docState.bill) return note(host, "Loading…");
    if (docState.bill.error) return note(host, docState.bill.error);
    var open = docState.bill.dc.filter(function (row) { return !row.invoice_id; });
    if (!open.length) return note(host, "This client has no unbilled challans.");
    host.innerHTML = open.map(function (row) {
      return "<label class=\"check\"><input type=\"checkbox\" name=\"doc-dc\" value=\"" + escape(row.id) + "\"> <span><strong>" +
        escape(row.dc_number) + "</strong> · " + date(row.dc_date) + "</span></label>";
    }).join("");
  }

  function renderDocList() {
    var host = document.getElementById("doc-list");
    if (!host) return;
    if (!docState.docs) return note(host, "Loading…");
    if (docState.docs.error) return note(host, docState.docs.error);

    var code = function (row) { return (row.clients && row.clients.client_code) || "—"; };
    var clientName = function (row) { return (row.clients && (row.clients.company || row.clients.full_name)) || ""; };
    var rows = docState.docs.dc.map(function (row) {
      return { kind: "dc", id: row.id, client: code(row), clientName: clientName(row), label: "Delivery challan", number: row.dc_number, date: row.dc_date,
        uploaded: row.created_at, path: row.dc_file || auth.documentPath(row.client_id, row.dc_number),
        detail: row.invoice_id ? "Billed on " + ((row.invoices && row.invoices.invoice_number) || "an invoice") : "Unbilled" };
    }).concat(docState.docs.invoice.map(function (row) {
      var count = docState.docs.billed[row.id] || 0;
      return { kind: "invoice", id: row.id, client: code(row), clientName: clientName(row), label: "Invoice", number: row.invoice_number, date: row.invoice_date,
        uploaded: row.created_at, path: row.invoice_file || auth.documentPath(row.client_id, row.invoice_number),
        detail: count + (count === 1 ? " challan" : " challans") };
    })).sort(function (a, b) { return String(b.uploaded || "").localeCompare(String(a.uploaded || "")); });
    docState.rows = rows;

    if (!rows.length) {
      return note(host, docState.scope === "mine" ? "You haven't uploaded any documents yet." : "No documents have been uploaded yet.");
    }

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>Client</th><th>Client name</th><th>Type</th><th>Number</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>" +
      rows.map(function (row, index) {
        return "<tr><td>" + escape(row.client) + "</td><td>" + escape(row.clientName || "—") + "</td><td>" + escape(row.label) + "</td><td><strong>" + escape(row.number) +
          "</strong></td><td>" + date(row.date) + "</td><td>" + escape(row.detail) + "</td><td class=\"doc-actions\">" +
          "<button type=\"button\" class=\"btn btn-sm\" data-doc-view=\"" + index + "\">View</button>" +
          "<button type=\"button\" class=\"btn btn-sm\" data-doc-replace=\"" + index + "\">Replace PDF</button>" +
          "<button type=\"button\" class=\"btn btn-sm btn-danger\" data-doc-delete=\"" + index + "\">Delete</button></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function loadBill() {
    docState.bill = null;
    renderBillList();
    if (!docState.clientId) return Promise.resolve();
    var wanted = docState.clientId;
    return auth.getDocuments({ clientId: wanted }).then(function (docs) {
      if (wanted !== docState.clientId) return;
      docState.bill = docs.error ? { error: docs.error, dc: [] } : docs;
      renderBillList();
    });
  }

  function loadDocList() {
    docState.docs = null;
    renderDocList();
    var scope = docState.scope;
    return auth.getDocuments({ uploadedBy: scope === "mine" ? clientId : "" }).then(function (docs) {
      if (scope !== docState.scope) return;
      docState.docs = docs.error ? { error: docs.error, dc: [], invoice: [], billed: {} } : docs;
      renderDocList();
    });
  }

  function reloadDocs() {
    loadBill();
    loadDocList();
  }

  function documentsPanel(clients) {
    var form = document.getElementById("doc-form");
    if (!form || !auth.uploadDocument) return;
    fillClientSelect(clients);

    var box = document.getElementById("doc-status");
    var select = document.getElementById("doc-client");
    var kind = document.getElementById("doc-kind");
    var bill = document.getElementById("doc-bill");
    var dateInput = document.getElementById("doc-date");
    var numberInput = document.getElementById("doc-number");
    var replaceInput = document.getElementById("doc-replace");
    var listHost = document.getElementById("doc-list");

    dateInput.value = new Date().toISOString().slice(0, 10);

    function syncKind() {
      var invoice = kind.value === "invoice";
      bill.hidden = !invoice;
      document.querySelector("[data-doc-label=number]").textContent = invoice ? "Invoice number" : "DC number";
      document.querySelector("[data-doc-label=date]").textContent = invoice ? "Invoice date" : "DC date";
      numberInput.placeholder = invoice ? "e.g. INV-2026-1001" : "e.g. DC-4006";
    }

    kind.addEventListener("change", syncKind);
    select.addEventListener("change", function () {
      docState.clientId = select.value;
      loadBill();
    });
    var scope = document.getElementById("doc-scope");
    if (scope) {
      scope.addEventListener("change", function () {
        docState.scope = scope.value;
        loadDocList();
      });
    }
    syncKind();
    loadDocList();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var file = document.getElementById("doc-file").files[0];
      var number = numberInput.value.trim();
      if (!select.value) return status(box, "Choose the client.", "error");
      if (!number) return status(box, "Enter the document number.", "error");
      if (!dateInput.value) return status(box, "Enter the document date.", "error");
      var problem = pdfProblem(file);
      if (problem) return status(box, problem, "error");

      var dcIds = Array.prototype.map.call(form.querySelectorAll("input[name=doc-dc]:checked"), function (input) {
        return input.value;
      });
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status(box, "Uploading…", "info");

      auth.uploadDocument(kind.value, {
        clientId: select.value,
        number: number,
        date: dateInput.value,
        file: file,
        dcIds: kind.value === "invoice" ? dcIds : []
      }).then(function (r) {
        button.disabled = false;
        if (r.error && !r.id) return status(box, r.error, "error");
        status(box, r.error || (number + " uploaded" +
          (dcIds.length && kind.value === "invoice" ? " and " + dcIds.length + " challan(s) marked billed." : ".")),
          r.error ? "error" : "success");
        numberInput.value = "";
        document.getElementById("doc-file").value = "";
        reloadDocs();
        refreshClientTabs();
      }).catch(function () {
        button.disabled = false;
        status(box, "Upload failed. Check your connection and try again.", "error");
      });
    });

    listHost.addEventListener("click", function (event) {
      var target = event.target.closest("button");
      if (!target || !docState.rows) return;

      if (target.dataset.docView) {
        var view = docState.rows[Number(target.dataset.docView)];
        target.disabled = true;
        auth.getFileUrl(auth.documentKinds[view.kind].bucket, view.path).then(function (url) {
          target.disabled = false;
          if (url) window.open(url, "_blank", "noopener");
          else status(box, "No PDF is stored for " + view.number + " yet. Use Replace PDF to add one.", "info");
        });
      } else if (target.dataset.docReplace) {
        docState.replace = docState.rows[Number(target.dataset.docReplace)];
        replaceInput.value = "";
        replaceInput.click();
      } else if (target.dataset.docDelete) {
        var row = docState.rows[Number(target.dataset.docDelete)];
        var warning = "Delete " + row.number + " and its PDF? This cannot be undone." +
          (row.kind === "invoice" ? " Its challans go back to the unbilled list." : "");
        if (!window.confirm(warning)) return;
        target.disabled = true;
        auth.deleteDocument(row.kind, row.id, row.path).then(function (r) {
          if (r.error) { target.disabled = false; return status(box, r.error, "error"); }
          status(box, row.number + " deleted.", "success");
          reloadDocs();
          refreshClientTabs();
        });
      }
    });

    replaceInput.addEventListener("change", function () {
      var row = docState.replace;
      var file = replaceInput.files[0];
      if (!row || !file) return;
      var problem = pdfProblem(file);
      if (problem) return status(box, problem, "error");
      status(box, "Replacing the PDF for " + row.number + "…", "info");
      auth.replaceDocumentFile(row.kind, row.path, file).then(function (r) {
        status(box, r.error || "PDF for " + row.number + " replaced.", r.error ? "error" : "success");
      });
    });
  }

  function adminOverview(rows) {
    var host = document.getElementById("admin-stats");
    if (!host) return;
    if (rows === null) return note(host, "The totals could not be loaded right now. Please refresh the page in a moment.");
    var clients = rows.filter(function (row) { return row.role !== "admin"; });
    Promise.all([
      auth.getChallans(clientId, true, "").catch(function () { return null; }),
      auth.getInvoices(clientId, true, "").catch(function () { return null; })
    ]).then(function (r) {
      stats(host, [
        ["Clients", String(clients.length)],
        ["Unbilled challans", r[0] ? String(r[0].length) : "—"],
        ["Invoices", r[1] ? String(r[1].length) : "—"]
      ]);
    });
  }

  function adminPanel() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-admin-only]"), function (node) {
      node.hidden = false;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-client-only]"), function (node) {
      node.hidden = true;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-goto-tab]"), function (button) {
      button.addEventListener("click", function () {
        var tab = document.getElementById(button.dataset.gotoTab);
        if (tab) tab.click();
      });
    });
    set("heading", "Admin dashboard");
    set("code-label", "Admin");
    set("name-label", "Name");
    set("since-label", "Admin since");
    document.title = "Admin dashboard — Business Automation Centre";

    clientFilter();
    syncFilter();
    var back = document.getElementById("cd-back");
    if (back) back.addEventListener("click", function () { chooseClient(""); });
    auth.getAllClients().then(function (rows) {
      allClients = rows || [];
      renderClients(rows);
      documentsPanel(allClients);
      adminOverview(rows);
    }, function () { renderClients(null); adminOverview(null); });

    var form = document.getElementById("new-client-form");
    if (!form) return;
    var box = document.getElementById("new-client-status");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status(box, "Creating the login…", "info");

      auth.createClientLogin({
        email: document.getElementById("client-email").value.trim(),
        full_name: document.getElementById("client-name").value.trim(),
        company: document.getElementById("client-company").value.trim(),
        phone: document.getElementById("client-phone").value.trim()
      }).then(function (r) {
        button.disabled = false;
        if (!r || r.error) return status(box, (r && r.error) || "Could not create the login.", "error");
        status(box, "Account " + (r.client_code || "") + " created for " + r.email +
          ". Temporary password: " + r.password +
          " — share it with the client; they must change it at first sign-in.", "success");
        form.reset();
        auth.getAllClients().then(function (rows) {
          allClients = rows || allClients;
          renderClients(rows);
          fillClientSelect(allClients);
        });
      });
    });
  }

  if (!auth) {
    fail("Could not reach the accounts service. Check your connection and reload the page.");
    return;
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-signout]"), function (button) {
    button.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll("[data-signout]"), function (other) {
        other.disabled = true;
      });
      auth.signOut().then(function () { location.href = cfg.login || "login.html"; });
    });
  });

  auth.getSession().then(function (session) {
    if (!session) {
      location.replace((cfg.login || "login.html") + "?next=dashboard");
      return;
    }
    var user = session.user;
    clientId = user.id;
    tabs();
    auth.getProfile(user.id).then(function (profile) {
      render(user, profile);
      isAdmin = !!(profile && profile.role === "admin");

      if (profile && profile.must_change_password) {
        firstLoginGate();
        return;
      }
      if (isAdmin) adminPanel();

      return Promise.all([
        auth.getJobs(user.id).then(renderJobs, function () { renderJobs(null); }),
        refreshClientTabs()
      ]);
    }).catch(function () {
      /* Never leave the placeholders reading "Loading…" when a lookup breaks. */
      set("greeting", "Welcome back.");
      renderJobs(null);
      renderChallans(null);
      renderInvoices(null);
    });
  }).catch(function () {
    fail("Could not reach the accounts service. Check your connection and reload the page.");
    set("greeting", "Your account could not be loaded.");
    renderJobs(null);
    renderChallans(null);
    renderInvoices(null);
  });
})();
