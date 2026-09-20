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

  function money(value) {
    var number = Number(value || 0);
    return "₹" + number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  /* delivery_challans rows carry invoice_id, so "billed" is derived from the
     link rather than a separate status column that could drift out of step. */
  function isBilled(dc) {
    return Boolean(dc.invoice_id);
  }

  function renderChallans(list) {
    var host = document.getElementById("dc-list");
    var statHost = document.getElementById("dc-stats");
    if (!host) return;

    if (list === null) {
      stats(statHost, []);
      note(host, "Delivery challan records are not switched on for this account yet. Call the office and we will enable them.");
      return;
    }

    var billed = list.filter(isBilled);
    var unbilled = list.filter(function (dc) { return !isBilled(dc); });
    var sum = function (rows) {
      return rows.reduce(function (total, dc) { return total + Number(dc.amount || 0); }, 0);
    };

    stats(statHost, [
      ["Challans uploaded", String(list.length)],
      ["Billed", money(sum(billed))],
      ["Unbilled", money(sum(unbilled))]
    ]);

    if (!list.length) {
      note(host, "No delivery challans yet. Each despatch we make against your client ID will appear here.");
      return;
    }

    var rows = list.map(function (dc) {
      var invoice = dc.invoices;
      return "<tr data-dc-state=\"" + (isBilled(dc) ? "billed" : "unbilled") + "\">" +
        "<td><strong>" + escape(dc.dc_number) + "</strong></td>" +
        "<td>" + date(dc.dc_date) + "</td>" +
        "<td>" + escape(dc.description || dc.service || "—") + "</td>" +
        "<td>" + (dc.quantity == null ? "—" : escape(dc.quantity) + (dc.uom ? " " + escape(dc.uom) : "")) + "</td>" +
        "<td class=\"num\">" + money(dc.amount) + "</td>" +
        "<td><span class=\"job-status " + (isBilled(dc) ? "is-billed" : "is-unbilled") + "\">" +
          (isBilled(dc) ? "Billed" : "Unbilled") + "</span></td>" +
        "<td>" + (invoice ? escape(invoice.invoice_number) : "—") + "</td></tr>";
    }).join("");

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>DC no.</th><th>Date</th><th>Description</th><th>Qty</th><th class=\"num\">Value</th><th>Status</th><th>Invoice</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";

    var filters = Array.prototype.slice.call(document.querySelectorAll("[data-dc-filter]"));
    filters.forEach(function (button) {
      button.addEventListener("click", function () {
        var want = button.dataset.dcFilter;
        filters.forEach(function (other) { other.classList.toggle("is-active", other === button); });
        Array.prototype.forEach.call(host.querySelectorAll("tr[data-dc-state]"), function (row) {
          row.hidden = want !== "all" && row.dataset.dcState !== want;
        });
      });
    });
  }

  function renderInvoices(invoices, challans) {
    var host = document.getElementById("inv-list");
    var statHost = document.getElementById("inv-stats");
    if (!host) return;

    if (invoices === null) {
      stats(statHost, []);
      note(host, "Invoice records are not switched on for this account yet. Call the office and we will enable them.");
      return;
    }

    var outstanding = invoices.filter(function (inv) { return inv.status !== "paid" && inv.status !== "cancelled"; });
    stats(statHost, [
      ["Invoices raised", String(invoices.length)],
      ["Invoiced value", money(invoices.reduce(function (t, i) { return t + Number(i.total || 0); }, 0))],
      ["Outstanding", money(outstanding.reduce(function (t, i) { return t + Number(i.total || 0); }, 0))]
    ]);

    if (!invoices.length) {
      note(host, "No invoices raised yet. Once your billed challans are invoiced they will be listed here.");
      return;
    }

    var byInvoice = {};
    (challans || []).forEach(function (dc) {
      if (!dc.invoice_id) return;
      (byInvoice[dc.invoice_id] = byInvoice[dc.invoice_id] || []).push(dc);
    });

    var rows = invoices.map(function (inv, index) {
      var dcs = byInvoice[inv.id] || [];
      var detailId = "inv-dcs-" + index;
      var detail = dcs.length
        ? "<ul class=\"dc-chips\">" + dcs.map(function (dc) {
            return "<li><strong>" + escape(dc.dc_number) + "</strong><span>" + date(dc.dc_date) +
              " · " + money(dc.amount) + "</span></li>";
          }).join("") + "</ul>"
        : "<p class=\"tight\">No challans are linked to this invoice.</p>";

      return "<tr>" +
          "<td><strong>" + escape(inv.invoice_number) + "</strong></td>" +
          "<td>" + date(inv.invoice_date) + "</td>" +
          "<td>" + date(inv.due_date) + "</td>" +
          "<td class=\"num\">" + money(inv.amount) + "</td>" +
          "<td class=\"num\">" + money(inv.tax_amount) + "</td>" +
          "<td class=\"num\"><strong>" + money(inv.total) + "</strong></td>" +
          "<td><span class=\"job-status is-" + escape((inv.status || "unpaid").replace(/\s+/g, "-")) + "\">" +
            escape(inv.status || "unpaid") + "</span></td>" +
          "<td><button type=\"button\" class=\"btn-link\" data-inv-toggle=\"" + detailId + "\" aria-expanded=\"false\">" +
            "View DCs (" + dcs.length + ")</button></td>" +
        "</tr>" +
        "<tr class=\"dc-detail\" id=\"" + detailId + "\" hidden><td colspan=\"8\">" +
          "<p class=\"mail-head\">Delivery challans on " + escape(inv.invoice_number) + "</p>" + detail +
        "</td></tr>";
    }).join("");

    host.innerHTML = "<div class=\"table-wrap\"><table class=\"dash-table\">" +
      "<thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class=\"num\">Value</th><th class=\"num\">Tax</th>" +
      "<th class=\"num\">Total</th><th>Status</th><th>Challans</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";

    Array.prototype.forEach.call(host.querySelectorAll("[data-inv-toggle]"), function (button) {
      button.addEventListener("click", function () {
        var row = document.getElementById(button.dataset.invToggle);
        if (!row) return;
        row.hidden = !row.hidden;
        button.setAttribute("aria-expanded", row.hidden ? "false" : "true");
        button.textContent = (row.hidden ? "View DCs (" : "Hide DCs (") +
          button.textContent.replace(/\D+/g, "") + ")";
      });
    });
  }

  function render(user, profile) {
    var meta = user.user_metadata || {};
    var name = (profile && profile.full_name) || meta.full_name || "there";

    set("greeting", "Welcome back, " + name + ".");
    set("client-code", (profile && profile.client_code) || "Pending");
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
    tabs();
    auth.getProfile(user.id).then(function (profile) {
      render(user, profile);
      return Promise.all([
        auth.getJobs(user.id).then(renderJobs),
        Promise.all([auth.getChallans(user.id), auth.getInvoices(user.id)]).then(function (r) {
          renderChallans(r[0]);
          renderInvoices(r[1], r[0]);
        })
      ]);
    });
  });
})();
