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
      return "<tr>" +
        "<td><strong>" + escape(row[opts.numberKey]) + "</strong></td>" +
        "<td>" + date(row[opts.dateKey]) + "</td>" +
        "<td>" + escape(code(row)) + "</td>" +
        "<td><button type=\"button\" class=\"btn btn-sm\" data-row=\"" + index +
          "\">Download PDF</button></td></tr>";
    }).join("");

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>" + escape(opts.numberLabel) + "</th><th>" + escape(opts.dateLabel) +
      "</th><th>Customer code</th><th>Download</th></tr></thead>" +
      "<tbody>" + body + "</tbody></table></div>";

    host.addEventListener("click", function (event) {
      var button = event.target.closest("[data-row]");
      if (!button) return;

      var row = rows[Number(button.dataset.row)];
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
    });
  }

  function renderChallans(list) {
    renderDocuments({
      host: "dc-list",
      stats: "dc-stats",
      heading: "Delivery challan",
      numberKey: "dc_number",
      numberLabel: "DC no.",
      dateKey: "dc_date",
      dateLabel: "DC date",
      fileKey: "dc_file",
      bucket: cfg.challanBucket || "challans",
      statLabel: "Challans pending billing",
      offText: "Delivery challan records are not switched on for this account yet. Call the office and we will enable them.",
      emptyText: "Nothing pending — every challan raised for you has been carried on to an invoice."
    }, list);
  }

  function renderInvoices(list) {
    renderDocuments({
      host: "inv-list",
      stats: "inv-stats",
      heading: "Invoice",
      numberKey: "invoice_number",
      numberLabel: "Invoice no.",
      dateKey: "invoice_date",
      dateLabel: "Invoice date",
      fileKey: "invoice_file",
      bucket: cfg.invoiceBucket || "invoices",
      statLabel: "Invoices raised",
      offText: "Invoice records are not switched on for this account yet. Call the office and we will enable them.",
      emptyText: "No invoices raised yet. Once your challans are billed they will be listed here."
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

  function renderClients(rows) {
    var host = document.getElementById("client-list");
    if (!host) return;
    if (!rows || !rows.length) return note(host, "No client accounts yet.");

    var body = rows.map(function (row) {
      return "<tr><td><strong>" + escape(row.client_code) + "</strong></td><td>" +
        escape(row.company || row.full_name || "—") + "</td><td>" + escape(row.email || "—") +
        "</td><td>" + (row.must_change_password ? "Temporary password" : "Active") + "</td></tr>";
    }).join("");

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>Client ID</th><th>Client</th><th>Email</th><th>Login</th></tr></thead>" +
      "<tbody>" + body + "</tbody></table></div>";
  }

  function adminPanel() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-admin-only]"), function (node) {
      node.hidden = false;
    });

    auth.getAllClients().then(renderClients);

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
        auth.getAllClients().then(renderClients);
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
        auth.getJobs(user.id).then(renderJobs),
        auth.getChallans(user.id, isAdmin).then(renderChallans),
        auth.getInvoices(user.id, isAdmin).then(renderInvoices)
      ]);
    });
  });
})();
