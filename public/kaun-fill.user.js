// ==UserScript==
// @name         Kaun: fill pollution complaint forms
// @namespace    https://shauryalowkeygotaura.github.io/command-center/
// @version      2.0.0
// @description  Fills government grievance forms (CPGRAMS, UP Jansunwai, Delhi PGMS, CPCB) from a command center KAUN card. You check, solve the captcha and press Submit yourself.
// @match        https://pgportal.gov.in/*
// @match        https://jansunwai.up.gov.in/*
// @match        https://pgms.delhi.gov.in/*
// @match        https://cpcb.gov.in/*
// @match        https://caqm.nic.in/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// Kaun complaint filler, v2: fills government grievance forms from a Kaun card.
//
// How it gets the data: the command center KAUN tab opens a portal as
//   https://<portal>/...#kaun=<url-encoded JSON>
// The hash never reaches the server. Most portals (CPGRAMS, UP Jansunwai,
// Delhi PGMS) make you log in first and drop the hash on the way, so the
// payload is kept in chrome.storage for two hours and a floating "Fill with
// Kaun" button appears on every page of the portal until you use it.
//
// How it fills: there is no agreed field naming across Indian portals, so
// fields are matched by their id, name, label, placeholder and aria-label
// (whitelisted regexes below). Only text inputs, textareas and selects are
// written; captchas, passwords, OTPs, file inputs and anything that looks
// like a consent box are never touched, and nothing is ever submitted.
(function () {
  "use strict";

  const TTL_MS = 2 * 60 * 60 * 1000;
  const KEY = "kaun.payload";

  // field -> [regex on the field's identity text, max length]. Order matters:
  // specific identities first, the loose "name" match last. Each field is
  // written once (the first matching input wins), so Address2/3 or a second
  // phone box stay empty for you.
  const TEXT_FIELDS = {
    first_name: [/\b(first[\s_-]*name|fname|name1|givenname)\b/i, 80],
    last_name: [/\b(last[\s_-]*name|lname|name2|surname|familyname)\b/i, 80],
    email: [/\b(e[\s_-]*mail)\b/i, 120],
    mobile: [/\b(mobile|phone|contact[\s_-]*no|cell)\b/i, 15],
    pincode: [/\b(pin[\s_-]*code|pincode|postal|zip)\b/i, 6],
    subject: [/\b(subject|title|summary|heading|brief)\b/i, 150],
    location: [/\b(location|address|area|locality|landmark|place|site|where)\b/i, 300],
    message: [/\b(message|description|details|grievance|complaint|query|remarks|text)\b/i, 4000],
    full_name: [/^(?!.*(user|login|file|company|org|father|mother|address)).*\b(name|applicant|complainant|citizen)\b/i, 120],
  };
  const NEVER = /\b(captcha|otp|password|pass|pwd|token|verify|file|upload|aadhaar|aadhar|pan)\b/i;

  function identity(el) {
    const parts = [el.id, el.name, el.placeholder, el.getAttribute("aria-label"), el.title];
    if (el.labels) for (const l of el.labels) parts.push(l.textContent);
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) parts.push(l.textContent);
    }
    // Table-style layouts: the label is the previous cell.
    const cell = el.closest("td, div.form-group, div.col, li");
    if (cell && cell.previousElementSibling) parts.push(cell.previousElementSibling.textContent);
    return parts.filter(Boolean).join(" | ").replace(/\s+/g, " ").slice(0, 300);
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  function setValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;  // React/Angular-aware
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fill(data) {
    const filled = [], skipped = [];
    const used = new Set();
    const text = Array.from(document.querySelectorAll("input, textarea")).filter((el) => {
      const t = (el.type || "text").toLowerCase();
      return visible(el) && !el.disabled && !el.readOnly
        && ["text", "email", "tel", "search", "url", "number", "textarea"].includes(el.tagName === "TEXTAREA" ? "textarea" : t);
    });
    const full = [data.first_name, data.last_name].filter(Boolean).join(" ");
    const values = { ...data, full_name: full };
    // Longest textarea is the message even when its label is unhelpful.
    const areas = text.filter((el) => el.tagName === "TEXTAREA");
    if (areas.length && typeof data.message === "string") {
      const big = areas.sort((a, b) => (b.rows || 0) * (b.cols || 60) - (a.rows || 0) * (a.cols || 60))[0];
      if (!NEVER.test(identity(big))) { setValue(big, data.message.slice(0, 4000)); used.add(big); filled.push("message"); }
    }
    const done = new Set(filled);
    for (const el of text) {
      if (used.has(el)) continue;
      const id = identity(el);
      if (NEVER.test(id)) { skipped.push(id.slice(0, 30)); continue; }
      for (const [field, [re, max]] of Object.entries(TEXT_FIELDS)) {
        if (done.has(field) || (field === "message" && el.tagName !== "TEXTAREA")) continue;
        const v = values[field];
        if (typeof v !== "string" || !v || !re.test(id)) continue;
        if (field === "full_name" && (TEXT_FIELDS.first_name[0].test(id) || TEXT_FIELDS.last_name[0].test(id))) continue;
        if (el.value && el.value.trim() && field !== "message") break;   // never overwrite what you typed
        setValue(el, v.slice(0, max));
        used.add(el);
        done.add(field);
        filled.push(field);
        break;
      }
    }
    // Selects: only when an option clearly means the complaint's subject or "air pollution".
    const wanted = [data.subject, "air pollution", "pollution", "environment"].filter(Boolean).map((s) => String(s).toLowerCase());
    for (const sel of document.querySelectorAll("select")) {
      if (!visible(sel) || sel.disabled || NEVER.test(identity(sel))) continue;
      if (sel.selectedIndex > 0 && sel.options[sel.selectedIndex].value) continue;
      const opts = Array.from(sel.options);
      const hit = wanted.map((w) => opts.find((o) => o.text.trim().toLowerCase() === w)).find(Boolean)
        || opts.find((o) => /air\s*pollution/i.test(o.text));
      if (hit) { sel.value = hit.value; sel.dispatchEvent(new Event("change", { bubbles: true })); filled.push("select:" + hit.text.trim().slice(0, 30)); }
    }
    return { filled, skipped };
  }

  function banner(text, warn) {
    const old = document.getElementById("kaun-banner");
    if (old) old.remove();
    const div = document.createElement("div");
    div.id = "kaun-banner";
    div.textContent = text;
    div.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;font:14px/1.4 system-ui,sans-serif;"
      + "color:#fff;background:" + (warn ? "#9a3412" : "#6b1d2a") + ";box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 15000);
  }

  function button(data) {
    if (document.getElementById("kaun-fill-btn")) return;
    const b = document.createElement("button");
    b.id = "kaun-fill-btn";
    b.type = "button";
    b.textContent = "Fill with Kaun complaint";
    b.title = (data.station || "Kaun") + ": fills name, contact, location and the complaint text on this page. You check and submit.";
    b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border:0;border-radius:6px;"
      + "font:600 13px system-ui,sans-serif;color:#fff;background:#6b1d2a;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer";
    b.onclick = () => report(fill(data));
    document.body.appendChild(b);
  }

  function report(r) {
    const dead = Array.from(document.forms).some((f) => /Error while submitting form/i.test(f.getAttribute("onsubmit") || ""));
    if (dead) return banner("This form is switched off on the portal's side (every Submit fails). Use another channel.", true);
    if (!r.filled.length) return banner("Kaun: no fillable complaint fields on this page. Log in / open the complaint form, then press the button again.", true);
    banner("Kaun filled: " + r.filled.join(", ") + ". Check every field, add a photo if asked, solve the captcha, then press Submit yourself.", false);
  }

  function parseHash() {
    const m = location.hash.match(/^#kaun=(.+)$/);
    if (!m) return null;
    try {
      const d = JSON.parse(decodeURIComponent(m[1]));
      return d && typeof d === "object" ? d : null;
    } catch (e) {
      return null;
    }
  }

  function remember(data) {
    const rec = { data, at: Date.now() };
    try { sessionStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* storage blocked */ }
    try { chrome.storage.local.set({ [KEY]: rec }); } catch (e) { /* not an extension context */ }
  }

  function recall(cb) {
    const fresh = (rec) => rec && rec.data && Date.now() - rec.at < TTL_MS ? rec.data : null;
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (fresh(s)) return cb(fresh(s));
    } catch (e) { /* ignore */ }
    try {
      chrome.storage.local.get(KEY, (o) => cb(fresh(o && o[KEY])));
    } catch (e) {
      cb(null);
    }
  }

  const fromHash = parseHash();
  if (fromHash) {
    remember(fromHash);
    history.replaceState(null, "", location.pathname + location.search);   // keep the data out of the address bar
    const r = fill(fromHash);
    if (r.filled.length) report(r);
    else banner("Kaun has your complaint ready. Log in / open the complaint form; the button at the bottom right fills it.", false);
    button(fromHash);
  } else {
    recall((data) => { if (data) button(data); });
  }
})();
