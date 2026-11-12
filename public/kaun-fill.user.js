// ==UserScript==
// @name         Kaun: fill CPCB air pollution complaint
// @namespace    https://shauryalowkeygotaura.github.io/command-center/
// @version      1.0.0
// @description  Fills CPCB's Delhi NCR air pollution complaint form from a Kaun card. You type the captcha and press Submit yourself.
// @match        https://cpcb.gov.in/query-form1.php*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// The command center KAUN tab opens this page as
//   https://cpcb.gov.in/query-form1.php#kaun=<url-encoded JSON>
// The hash never reaches CPCB's server. This script only writes into the
// whitelisted fields below, never submits, and never touches the captcha.
(function () {
  "use strict";

  const m = location.hash.match(/^#kaun=(.+)$/);
  if (!m) return;

  let data;
  try {
    data = JSON.parse(decodeURIComponent(m[1]));
  } catch (e) {
    return banner("Kaun: could not read the complaint data from the link.", true);
  }
  if (!data || typeof data !== "object") return;

  // Field id -> (key in data, max length). Whitelist: nothing else is written.
  const FIELDS = {
    name1: ["first_name", 80],
    name2: ["last_name", 80],
    email: ["email", 120],
    mobile: ["mobile", 15],
    location: ["location", 300],
    message: ["message", 1000],
  };

  const missing = [];
  for (const [id, [key, max]] of Object.entries(FIELDS)) {
    const el = document.getElementById(id);
    const value = typeof data[key] === "string" ? data[key].slice(0, max) : "";
    if (!el) { missing.push(id); continue; }
    if (!value) continue;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Subject must match one of CPCB's own options exactly.
  const subject = document.getElementById("subject");
  if (subject && typeof data.subject === "string") {
    const opt = Array.from(subject.options).find((o) => o.text.trim() === data.subject);
    if (opt) {
      subject.value = opt.value;
      subject.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      missing.push("subject '" + data.subject + "'");
    }
  }

  // Drop the data from the address bar so a refresh doesn't refill it.
  history.replaceState(null, "", location.pathname + location.search);

  const captcha = document.getElementById("captcha_code");
  if (captcha) {
    captcha.scrollIntoView({ block: "center" });
    captcha.focus();
  }

  if (missing.length) {
    banner("Kaun filled what it could. CPCB's form changed, not filled: " + missing.join(", ") + ". Check before submitting.", true);
  } else {
    banner("Kaun filled the complaint. Check it, type the captcha, then press Submit. Attach a photo if you have one.", false);
  }

  function banner(text, warn) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;font:14px/1.4 system-ui,sans-serif;" +
      "color:#fff;background:" + (warn ? "#9a3412" : "#6b1d2a") + ";box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 12000);
  }
})();
