/* Local redesign behaviour: mobile navigation, header state, back-to-top. */
(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-nav");
  var header = document.querySelector(".site-header");
  var toTop = document.querySelector(".to-top");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1220) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function onScroll() {
    var y = window.pageYOffset;
    if (header) header.classList.toggle("is-scrolled", y > 8);
    if (toTop) toTop.classList.toggle("is-visible", y > 400);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
})();

/* Client account forms: front-end only validation for the local demo pages. */
(function () {
  "use strict";

  var STORE_KEY = "bac.clients";
  var forms = document.querySelectorAll("form[data-auth]");
  if (!forms.length) return;

  function readClients() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeClients(clients) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(clients));
    } catch (e) {
      /* storage unavailable (private mode): the demo still validates */
    }
  }

  function setError(field, message) {
    var slot = field.querySelector(".error");
    field.classList.toggle("is-invalid", Boolean(message));
    if (slot) slot.textContent = message || "";
    var input = field.querySelector("input");
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function status(form, message, kind) {
    var box = form.querySelector(".form-status");
    if (!box) return;
    box.textContent = message;
    box.className = "form-status is-" + kind;
  }

  function validate(form) {
    var ok = true;
    var firstInvalid = null;
    var fields = form.querySelectorAll(".field");

    Array.prototype.forEach.call(fields, function (field) {
      var input = field.querySelector("input");
      if (!input) return;
      var value = input.value.trim();
      var message = "";

      if (input.required && !value) {
        message = "This field is required.";
      } else if (value && input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        message = "Enter a valid email address.";
      } else if (value && input.type === "tel" && !/^[0-9+\-\s()]{8,16}$/.test(value)) {
        message = "Enter a valid phone number.";
      } else if (value && input.type === "password" && input.dataset.minlength && value.length < Number(input.dataset.minlength)) {
        message = "Use at least " + input.dataset.minlength + " characters.";
      } else if (input.dataset.matches) {
        var other = form.querySelector("#" + input.dataset.matches);
        if (other && value !== other.value) message = "Passwords do not match.";
      }

      setError(field, message);
      if (message) {
        ok = false;
        if (!firstInvalid) firstInvalid = input;
      }
    });

    var terms = form.querySelector("input[type=checkbox][required]");
    if (terms && !terms.checked) {
      ok = false;
      if (!firstInvalid) firstInvalid = terms;
      status(form, "Please accept the terms to continue.", "error");
    }

    if (firstInvalid) firstInvalid.focus();
    return ok;
  }

  Array.prototype.forEach.call(document.querySelectorAll(".pw-toggle"), function (button) {
    button.addEventListener("click", function () {
      var input = document.getElementById(button.dataset.toggle);
      if (!input) return;
      var shown = input.type === "text";
      input.type = shown ? "password" : "text";
      button.textContent = shown ? "Show" : "Hide";
      input.focus();
    });
  });

  Array.prototype.forEach.call(forms, function (form) {
    form.setAttribute("novalidate", "novalidate");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate(form)) return;

      var clients = readClients();
      var email = (form.querySelector("input[type=email]") || {}).value;
      email = (email || "").trim().toLowerCase();

      if (form.dataset.auth === "signup") {
        if (clients[email]) {
          status(form, "An account already exists for " + email + ". Try signing in instead.", "error");
          return;
        }
        clients[email] = {
          name: (form.querySelector("#name") || {}).value || "",
          company: (form.querySelector("#company") || {}).value || "",
          phone: (form.querySelector("#phone") || {}).value || ""
        };
        writeClients(clients);
        status(form, "Account created for " + email + ". This is a local demo — no data leaves your browser.", "success");
        form.reset();
      } else {
        if (!clients[email]) {
          status(form, "No local account found for " + email + ". Sign up first — this demo stores accounts in your browser only.", "error");
          return;
        }
        status(form, "Signed in as " + email + ". This is a local demo — there is no server behind it.", "success");
        form.reset();
      }
    });

    form.addEventListener("input", function (e) {
      var field = e.target.closest(".field");
      if (field && field.classList.contains("is-invalid")) setError(field, "");
    });
  });
})();

/* Client account tabs: sign in / new client registration on one page. */
(function () {
  "use strict";

  var tabs = document.querySelectorAll(".auth-tabs [role=tab]");
  if (!tabs.length) return;

  function activate(id, focus) {
    Array.prototype.forEach.call(tabs, function (tab) {
      var selected = tab.id === id;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      var panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
      if (selected && focus) tab.focus();
    });
    var aside = document.getElementById("aside-register");
    if (aside) aside.hidden = id === "tab-register";
    history.replaceState(null, "", id === "tab-register" ? "#register" : "#signin");
  }

  Array.prototype.forEach.call(tabs, function (tab) {
    tab.addEventListener("click", function () { activate(tab.id, false); });
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-open-tab]"), function (button) {
    button.addEventListener("click", function () {
      activate(button.dataset.openTab, true);
      document.querySelector(".auth-card").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (location.hash === "#register") activate("tab-register", false);
})();
