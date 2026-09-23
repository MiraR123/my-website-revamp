/* Supabase-backed client accounts.

   Loaded after supabase-js and before site.js: when this file manages to
   create a client it publishes window.BACAuth, and site.js hands every
   account form over to it instead of running the localStorage demo. If the
   CDN or the config is missing, window.BACAuth stays undefined and the pages
   fall back to the offline demo behaviour. */
(function () {
  "use strict";

  var cfg = window.BAC_SUPABASE;
  var lib = window.supabase;
  if (!cfg || !cfg.url || !cfg.anonKey || !lib || !lib.createClient) return;

  var sb = lib.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  function pageUrl(page) {
    return new URL(page, location.href).href;
  }

  function friendly(error) {
    var message = (error && error.message) || "Something went wrong. Please try again.";
    if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
    if (/email not confirmed/i.test(message)) return "Confirm your email address first — check your inbox for our confirmation link.";
    if (/already registered/i.test(message)) return "An account already exists for this email. Sign in instead.";
    return message;
  }

  var api = {
    client: sb,

    getSession: function () {
      return sb.auth.getSession().then(function (r) { return r.data.session; });
    },

    signOut: function () {
      return sb.auth.signOut();
    },

    /* The clients row is created by an auth.users trigger, so a fresh sign-up
       may race it; the dashboard falls back to user_metadata when it is null. */
    getProfile: function (userId) {
      return sb.from("clients").select("*").eq("id", userId).maybeSingle()
        .then(function (r) { return r.error ? null : r.data; })
        .catch(function () { return null; });
    },

    getJobs: function (userId) {
      return sb.from("jobs").select("*").eq("client_id", userId).order("created_at", { ascending: false }).limit(10)
        .then(function (r) { return r.error ? null : r.data; })
        .catch(function () { return null; });
    },

    /* Unbilled challans only: a challan leaves this list the moment the
       office links it to an invoice. An admin skips the client filter and
       the policies return every client's rows, each carrying its own code. */
    getChallans: function (userId, isAdmin) {
      var q = sb.from("delivery_challans")
        .select("dc_number, dc_date, dc_file, client_id, clients(client_code)")
        .is("invoice_id", null)
        .order("dc_date", { ascending: false });
      if (!isAdmin) q = q.eq("client_id", userId);
      return q
        .then(function (r) { return r.error ? null : r.data; })
        .catch(function () { return null; });
    },

    getInvoices: function (userId, isAdmin) {
      var q = sb.from("invoices")
        .select("invoice_number, invoice_date, invoice_file, client_id, clients(client_code)")
        .order("invoice_date", { ascending: false });
      if (!isAdmin) q = q.eq("client_id", userId);
      return q
        .then(function (r) { return r.error ? null : r.data; })
        .catch(function () { return null; });
    },

    /* Admin only in practice: the select policy returns nothing but the
       caller's own row unless public.is_admin(). */
    getAllClients: function () {
      return sb.from("clients")
        .select("client_code, full_name, company, email, role, must_change_password")
        .order("client_code")
        .then(function (r) { return r.error ? null : r.data; })
        .catch(function () { return null; });
    },

    /* Creating a login needs the service-role key, so it happens inside the
       admin-create-client Edge Function; the browser only forwards the
       admin's own session and receives the temporary password to pass on. */
    createClientLogin: function (details) {
      return sb.functions.invoke("admin-create-client", { body: details })
        .then(function (r) {
          if (r.error) {
            return r.error.context && r.error.context.json
              ? r.error.context.json().then(function (body) {
                  return { error: (body && body.error) || r.error.message };
                })
              : { error: r.error.message };
          }
          return r.data;
        });
    },

    /* First sign-in: set the real password, then let the database clear the
       flag — it is not writable from a normal update. */
    changePassword: function (password) {
      return sb.auth.updateUser({ password: password }).then(function (r) {
        if (r.error) return { error: friendly(r.error) };
        return sb.rpc("password_changed").then(function () { return {}; });
      });
    },

    /* The office uploads the real document to a private bucket, one folder
       per client, so the file is reached with a short-lived signed URL
       rather than a public link. Returns null when nothing is stored yet
       and the dashboard falls back to the generated document. */
    getFileUrl: function (bucket, path, downloadName) {
      if (!bucket || !path) return Promise.resolve(null);
      return sb.storage.from(bucket)
        .createSignedUrl(path, 60, downloadName ? { download: downloadName } : undefined)
        .then(function (r) { return r.error ? null : r.data.signedUrl; })
        .catch(function () { return null; });
    }
  };

  function value(form, id) {
    var input = form.querySelector("#" + id);
    return input ? input.value.trim() : "";
  }

  function busy(form, on) {
    var button = form.querySelector("button[type=submit]");
    if (button) button.disabled = on;
    form.classList.toggle("is-busy", on);
  }

  /* Called by site.js once its own field validation has passed. */
  api.handleForm = function (form, email, status) {
    var kind = form.dataset.auth;
    busy(form, true);
    var done = function () { busy(form, false); };

    if (kind === "signup") {
      status(form, "Creating your account…", "info");
      sb.auth.signUp({
        email: email,
        password: value(form, "signup-password"),
        options: {
          emailRedirectTo: pageUrl(cfg.dashboard),
          data: {
            full_name: value(form, "name"),
            company: value(form, "company"),
            phone: value(form, "phone")
          }
        }
      }).then(function (r) {
        done();
        if (r.error) return status(form, friendly(r.error), "error");
        if (r.data.session) {
          status(form, "Account created. Opening your dashboard…", "success");
          location.href = cfg.dashboard;
          return;
        }
        status(form, "Account created for " + email + ". Check your inbox and click the confirmation link, then sign in.", "success");
        form.reset();
      });
      return;
    }

    if (kind === "login") {
      status(form, "Signing you in…", "info");
      sb.auth.signInWithPassword({ email: email, password: value(form, "password") }).then(function (r) {
        done();
        if (r.error) return status(form, friendly(r.error), "error");
        status(form, "Signed in. Opening your dashboard…", "success");
        location.href = cfg.dashboard;
      });
      return;
    }

    if (kind === "reset-request") {
      status(form, "Sending the reset email…", "info");
      sb.auth.resetPasswordForEmail(email, { redirectTo: pageUrl(cfg.login) + "#reset" }).then(function (r) {
        done();
        if (r.error) return status(form, friendly(r.error), "error");
        status(form, "We have emailed a password reset link to " + email + ". Open it on this device to choose a new password.", "success");
      });
      return;
    }

    if (kind === "reset-confirm") {
      status(form, "Saving your new password…", "info");
      sb.auth.updateUser({ password: value(form, "reset-password") }).then(function (r) {
        done();
        if (r.error) {
          return status(form, /session|logged/i.test(r.error.message)
            ? "Open the reset link from your email first — this form only works from that link."
            : friendly(r.error), "error");
        }
        status(form, "Password updated. Opening your dashboard…", "success");
        location.href = cfg.dashboard;
      });
      return;
    }

    done();
  };

  window.BACAuth = api;

  /* Live pages: the reset flow is a real emailed link, so the on-page code
     field and the fake mail preview from the offline demo are removed. */
  function adaptResetPanel() {
    var codeField = document.getElementById("reset-code");
    if (codeField) {
      var wrap = codeField.closest(".field");
      codeField.required = false;
      codeField.remove();
      if (wrap) wrap.remove();
    }
    var preview = document.getElementById("reset-mail");
    if (preview) preview.remove();
    Array.prototype.forEach.call(document.querySelectorAll("[data-demo-note]"), function (note) {
      note.remove();
    });
    var requestButton = document.querySelector("form[data-auth=reset-request] button[type=submit]");
    if (requestButton) requestButton.textContent = "Email me a reset link";
  }

  function showRecoveryStep() {
    var panel = document.getElementById("panel-reset");
    var step = document.getElementById("reset-step-2");
    var request = document.querySelector("form[data-auth=reset-request]");
    if (!panel || !step) return;
    Array.prototype.forEach.call(document.querySelectorAll(".auth-tabs button"), function (tab) {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
      var p = document.getElementById(tab.getAttribute("aria-controls"));
      if (p) p.hidden = true;
    });
    panel.hidden = false;
    if (request) request.hidden = true;
    step.hidden = false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.querySelector("form[data-auth]")) return;
    adaptResetPanel();

    api.getSession().then(function (session) {
      if (!session) return;
      var login = document.querySelector("form[data-auth=login]");
      if (!login) return;
      var box = login.querySelector(".form-status");
      if (!box) return;
      box.className = "form-status is-info";
      box.innerHTML = "You are already signed in as " + session.user.email +
        ". <a href=\"" + cfg.dashboard + "\">Open your dashboard</a>.";
    });
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") showRecoveryStep();
  });
})();
