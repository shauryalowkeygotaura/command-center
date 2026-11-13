"use client";

// KAUN tab: VayuVani's pollution source attributions as complaint cards.
// Data is the public Kaun feed (vayuvani repo, GitHub Pages, written hourly).
// Nothing is filed automatically. Each card explains the cause (local part
// with named candidate sites, region-wide part with its mechanism), and can
// open a grievance portal with the complaint ready to paste in (the Kaun
// extension / userscript fills the form; you log in, check, solve the captcha
// and press Submit), copy the complaint for an app (Green Delhi / MCD 311
// have no web form), or open a pre-written X post.
// "Filed" marks and your contact details are localStorage-only: this repo and
// site are public, so they never leave your browser except inside the link.

import { useEffect, useMemo, useRef, useState } from "react";

const FEED = "https://shauryalowkeygotaura.github.io/vayuvani/data/history.json";
const FILED_KEY = "cc.kaun.filed.v1";
const DETAILS_KEY = "cc.kaun.details.v1";
const USERSCRIPT = "kaun-fill.user.js";

// Portals that take a citizen's air pollution complaint on the web. All of
// them sit behind a login/OTP, so the filler keeps the complaint for two hours
// and offers a "Fill with Kaun" button once the form is on screen.
const PORTALS = {
  cpgrams: { label: "CPGRAMS", url: "https://pgportal.gov.in/Home/LodgeGrievance", note: "Central grievance portal, routes to any ministry / state board" },
  jansunwai: { label: "UP Jansunwai", url: "https://jansunwai.up.gov.in/", note: "UP stations (Noida, Ghaziabad)" },
  pgms: { label: "Delhi PGMS", url: "https://pgms.delhi.gov.in/", note: "Delhi government grievance system" },
};

// Compact copy of the extension's filler as a bookmarklet, for a browser
// without the extension: click it on the portal page (after login) and it
// fills from the data the "fill" link stored in sessionStorage. Same rules:
// whitelisted fields only, never captcha/OTP/password, never submits.
const FILLER_SRC = `(function(){
var K="kaun.payload",rec=null;try{rec=JSON.parse(sessionStorage.getItem(K)||"null")}catch(e){}
var m=location.hash.match(/^#kaun=(.+)$/);if(m){try{rec={data:JSON.parse(decodeURIComponent(m[1])),at:Date.now()};sessionStorage.setItem(K,JSON.stringify(rec))}catch(e){}}
function b(t,w){var d=document.createElement("div");d.textContent=t;d.style.cssText="position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;font:14px/1.4 system-ui,sans-serif;color:#fff;background:"+(w?"#9a3412":"#6b1d2a");document.body.appendChild(d);setTimeout(function(){d.remove()},15000)}
if(!rec||!rec.data||Date.now()-rec.at>7200000){b("Kaun: open the portal from a card's FILL link first (same tab), then click this bookmark on the form.",true);return}
var x=rec.data,F={first_name:[/\\b(first[\\s_-]*name|fname|name1)\\b/i,80],last_name:[/\\b(last[\\s_-]*name|lname|name2|surname)\\b/i,80],email:[/\\be[\\s_-]*mail\\b/i,120],mobile:[/\\b(mobile|phone|contact[\\s_-]*no)\\b/i,15],pincode:[/\\b(pin[\\s_-]*code|pincode|postal)\\b/i,6],subject:[/\\b(subject|title|summary|heading)\\b/i,150],location:[/\\b(location|address|area|locality|landmark|place)\\b/i,300],message:[/\\b(message|description|details|grievance|complaint|query|remarks)\\b/i,4000],full_name:[/^(?!.*(user|login|file|company|father|mother|address)).*\\b(name|applicant|complainant)\\b/i,120]},N=/\\b(captcha|otp|password|pass|pwd|token|verify|file|upload|aadhaar|aadhar|pan)\\b/i;
x.full_name=[x.first_name,x.last_name].filter(Boolean).join(" ");
function id(e){var p=[e.id,e.name,e.placeholder,e.getAttribute("aria-label")];if(e.labels)for(var i=0;i<e.labels.length;i++)p.push(e.labels[i].textContent);var c=e.closest("td,div.form-group,li");if(c&&c.previousElementSibling)p.push(c.previousElementSibling.textContent);return p.filter(Boolean).join(" | ").replace(/\\s+/g," ").slice(0,300)}
function sv(e,v){var pr=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,s=Object.getOwnPropertyDescriptor(pr,"value");if(s&&s.set)s.set.call(e,v);else e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))}
var done=[],used=[],els=Array.prototype.filter.call(document.querySelectorAll("input,textarea"),function(e){var r=e.getBoundingClientRect(),t=(e.type||"text").toLowerCase();return r.width>0&&!e.disabled&&!e.readOnly&&(e.tagName==="TEXTAREA"||["text","email","tel","search","number"].indexOf(t)>=0)});
var ta=els.filter(function(e){return e.tagName==="TEXTAREA"});if(ta.length&&x.message){ta.sort(function(a,c){return (c.rows||0)*(c.cols||60)-(a.rows||0)*(a.cols||60)});if(!N.test(id(ta[0]))){sv(ta[0],x.message.slice(0,4000));used.push(ta[0]);done.push("message")}}
els.forEach(function(e){if(used.indexOf(e)>=0)return;var s=id(e);if(N.test(s))return;for(var f in F){if(done.indexOf(f)>=0||(f==="message"&&e.tagName!=="TEXTAREA"))continue;var v=x[f];if(typeof v!=="string"||!v||!F[f][0].test(s))continue;if(f==="full_name"&&(F.first_name[0].test(s)||F.last_name[0].test(s)))continue;if(e.value&&e.value.trim())break;sv(e,v.slice(0,F[f][1]));used.push(e);done.push(f);break}});
var want=[x.subject,"air pollution","pollution","environment"].filter(Boolean).map(function(s){return String(s).toLowerCase()});
Array.prototype.forEach.call(document.querySelectorAll("select"),function(s){if(s.disabled||N.test(id(s))||(s.selectedIndex>0&&s.options[s.selectedIndex].value))return;var o=Array.prototype.slice.call(s.options),h=null;want.forEach(function(w){if(!h)h=o.filter(function(p){return p.text.trim().toLowerCase()===w})[0]});if(!h)h=o.filter(function(p){return /air\\s*pollution/i.test(p.text)})[0];if(h){s.value=h.value;s.dispatchEvent(new Event("change",{bubbles:true}));done.push("select:"+h.text.trim().slice(0,30))}});
if(Array.prototype.some.call(document.forms,function(f){return /Error while submitting form/i.test(f.getAttribute("onsubmit")||"")}))return b("This form is switched off on the portal's side (every Submit fails). Use another channel.",true);
b(done.length?"Kaun filled: "+done.join(", ")+". Check every field, solve the captcha, then press Submit yourself.":"Kaun: no complaint fields on this page yet. Log in / open the complaint form, then click again.",!done.length)
})();`;
const BOOKMARKLET = "javascript:" + encodeURIComponent(FILLER_SRC.replace(/\n/g, ""));

type Details = { first_name: string; last_name: string; email: string; mobile: string };
const NO_DETAILS: Details = { first_name: "", last_name: "", email: "", mobile: "" };

type Candidate = { name: string; type: string; km: number; sector: string; lat?: number; lon?: number };
type Cause = {
  top: string | null;
  shares: Record<string, number>;
  local: { share: number; top: string | null; candidates: Candidate[]; sector?: string | null; calm?: boolean | null };
  regional: {
    share: number;
    mechanism: "stagnation" | "transport" | "regional_rise" | "unclear";
    composition: Record<string, number>;
    wind_ms?: number | null;
    pbl_ratio?: number | null;
    upwind_fires?: number;
    transported?: boolean;
  };
  text_en: string;
  text_hi?: string;
};

type Attribution = {
  id: string;
  station_id: string;
  station_name: string;
  latitude: number;
  longitude: number;
  window_start: string;
  window_end: string;
  peak_pm25: number;
  baseline_pm25: number;
  shares: Record<string, number>;
  top_source: string;
  sector?: string | null;
  confidence: "low" | "medium" | "high";
  summary_en: string;
  summary_hi?: string;
  cause?: Cause;
};

// Mirrors vayuvani reporting/agencies.py PRIMARY_AGENCY. Region-wide causes
// (stagnation, transported smoke, secondary aerosol) have no single owner:
// those cards go to CAQM / DPCC as pattern evidence, not as site complaints.
const AGENCY: Record<string, { name: string; channel: string; x: string; portal: keyof typeof PORTALS }> = {
  biomass_burning: { name: "MCD", channel: "MCD 311 app / Green Delhi app", x: "@DPCC_pollution", portal: "cpgrams" },
  industry: { name: "DPCC", channel: "Green Delhi app", x: "@DPCC_pollution", portal: "cpgrams" },
  dust: { name: "DPCC", channel: "Green Delhi app", x: "@DPCC_pollution", portal: "cpgrams" },
  traffic: { name: "Delhi Traffic Police", channel: "X (@dtptraffic)", x: "@dtptraffic", portal: "cpgrams" },
};
const REGIONAL_AGENCY = { name: "CAQM / DPCC (region-wide)", channel: "X, pattern evidence", x: "@DPCC_pollution", portal: "cpgrams" as const };

// Mirrors reporting/agencies.py routing_source: the local part owns the
// complaint only when it carries at least 40% of the excess.
const MIN_LOCAL_TO_ROUTE = 0.4;
function routingSource(a: Attribution): string | null {
  const loc = a.cause?.local;
  if (loc?.top && loc.share >= MIN_LOCAL_TO_ROUTE) return loc.top;
  return a.top_source in AGENCY ? a.top_source : null;
}

const RANK: Record<Attribution["confidence"], number> = { high: 0, medium: 1, low: 2 };

const SOURCE_LABEL: Record<string, string> = {
  biomass_burning: "burning (garbage / biomass)",
  industry: "industry / power",
  dust: "construction / road dust",
  traffic: "traffic",
  secondary: "secondary particles (humid, stagnant air)",
  regional_background: "region-wide background",
  transported_smoke: "smoke from upwind fires",
};
const MECHANISM_LABEL: Record<Cause["regional"]["mechanism"], string> = {
  stagnation: "stagnant air trapped the city's own emissions",
  transport: "smoke carried in from fires upwind",
  regional_rise: "the whole region rose together",
  unclear: "region-wide rise, cause unclear",
};
const SECTOR_NAME: Record<string, string> = {
  N: "north", NE: "north-east", E: "east", SE: "south-east",
  S: "south", SW: "south-west", W: "west", NW: "north-west",
};

const ist = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const pct = (v: number) => `${Math.round(v * 100)}%`;
const isUP = (a: Attribution) => /UPPCB/i.test(a.station_name);
const stationInDelhi = (a: Attribution) => /Delhi|New Delhi/i.test(a.station_name) && !/UPPCB|HSPCB/i.test(a.station_name);

function causeLines(a: Attribution): string[] {
  const c = a.cause;
  if (!c) return [`Likely source: ~${pct(a.shares[a.top_source] ?? 0)} ${SOURCE_LABEL[a.top_source] ?? a.top_source}${a.sector ? `, arriving from the ${SECTOR_NAME[a.sector] ?? a.sector}` : ""}.`];
  const out: string[] = [];
  if (c.top) out.push(`Biggest cause: ${SOURCE_LABEL[c.top] ?? c.top} (${pct(c.shares[c.top] ?? 0)} of the excess).`);
  if (c.local.share >= 0.25 && c.local.top) {
    const where = c.local.calm ? "calm air, so close to the station" : c.local.sector ? `wind from the ${SECTOR_NAME[c.local.sector] ?? c.local.sector}` : "";
    out.push(`Local part (${pct(c.local.share)}): ${SOURCE_LABEL[c.local.top] ?? c.local.top}${where ? `, ${where}` : ""}.`);
    if (c.local.candidates.length) {
      out.push(
        "Possible sites to inspect (OpenStreetMap, nearest first): " +
          c.local.candidates
            .map((s) => `${s.name} (${s.type}, ${s.km} km ${s.sector}${s.lat != null ? `, https://maps.google.com/?q=${s.lat},${s.lon}` : ""})`)
            .join("; ") +
          ".",
      );
    }
  }
  if (c.regional.share >= 0.3) {
    const r = c.regional;
    const detail: string[] = [];
    if (r.mechanism === "stagnation") {
      if (r.wind_ms != null) detail.push(`wind ${r.wind_ms.toFixed(1)} m/s`);
      if (r.pbl_ratio != null) detail.push(`mixing height ${Math.round(r.pbl_ratio * 100)}% of normal`);
    }
    if (r.mechanism === "transport" && r.upwind_fires) detail.push(`${r.upwind_fires} fires upwind`);
    const made = Object.entries(r.composition ?? {})
      .sort((x, y) => y[1] - x[1])
      .slice(0, 2)
      .map(([k, v]) => `${SOURCE_LABEL[k] ?? k} ${pct(v)}`)
      .join(" + ");
    out.push(`Region-wide part (${pct(r.share)}): ${MECHANISM_LABEL[r.mechanism]}${detail.length ? ` (${detail.join(", ")})` : ""}${made && !r.transported ? `; the shared air looks like ${made}` : ""}.`);
  }
  return out;
}

function complaintText(a: Attribution, repeats: number): string {
  const src = routingSource(a);
  const ag = src ? AGENCY[src] : REGIONAL_AGENCY;
  return [
    `Air pollution complaint for ${ag.name}: ${a.station_name}`,
    `When: ${ist(a.window_start)} to ${ist(a.window_end)} IST`,
    `PM2.5 peaked at ${Math.round(a.peak_pm25)} µg/m³ vs a usual ${Math.round(a.baseline_pm25)} µg/m³ for this hour (confidence ${a.confidence}).`,
    ...causeLines(a),
    repeats > 1 ? `This is the ${repeats}th such spike at this station in 7 days.` : "",
    `Station location: https://maps.google.com/?q=${a.latitude},${a.longitude}`,
    `Evidence: observation-based estimate from CPCB/DPCC station data, wind, mixing height, OpenStreetMap land use and NASA fire data (VayuVani Kaun). Named sites are places to look, not accusations. Please inspect.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function portalLink(portal: keyof typeof PORTALS, a: Attribution, repeats: number, d: Details): string {
  const src = routingSource(a);
  const c = a.cause;
  const sector = c?.local.sector ?? a.sector;
  const where = sector ? SECTOR_NAME[sector] ?? sector : null;
  const site = c?.local.candidates[0];
  const payload = {
    ...d,
    station: a.station_name,
    subject: `Air pollution: ${src ? SOURCE_LABEL[src] : "region-wide smog"} near ${a.station_name.split(",")[0]}`,
    location:
      `Around ${a.station_name} air quality monitoring station ` +
      `(${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)})` +
      (site ? `; possible site: ${site.name}, ${site.km} km ${site.sector}` : where ? `; source likely to the ${where} of the station` : ""),
    message: complaintText(a, repeats).slice(0, 4000),
  };
  return `${PORTALS[portal].url}#kaun=${encodeURIComponent(JSON.stringify(payload))}`;
}

function xText(a: Attribution, repeats: number): string {
  const src = routingSource(a);
  const ag = src ? AGENCY[src] : REGIONAL_AGENCY;
  const c = a.cause;
  const why = c?.top ? SOURCE_LABEL[c.top] ?? c.top : SOURCE_LABEL[a.top_source] ?? a.top_source;
  const site = c?.local.candidates[0];
  return (
    `${ag.x} PM2.5 at ${a.station_name.split(",")[0]} hit ${Math.round(a.peak_pm25)} µg/m³ ` +
    `(${ist(a.window_start)} IST), ${Math.round(a.peak_pm25 / Math.max(a.baseline_pm25, 1) * 10) / 10}x normal. Likely ${why}` +
    `${site ? `, possibly ${site.name} (${site.km} km ${site.sector})` : ""}` +
    `${c?.regional.mechanism === "stagnation" && c.regional.share >= 0.5 ? ", trapped by stagnant air" : ""}` +
    `${repeats > 1 ? `, ${repeats}x this week` : ""}. Please act. #DelhiAirPollution`
  );
}

export function KaunReports() {
  const [rows, setRows] = useState<Attribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [showFiled, setShowFiled] = useState(false);
  const [showRegional, setShowRegional] = useState(true);
  const [details, setDetails] = useState<Details>(NO_DETAILS);
  const [editDetails, setEditDetails] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(FILED_KEY) || "{}");
        if (alive && saved && typeof saved === "object") setFiled(saved);
      } catch {
        /* corrupt or blocked storage: start clean */
      }
      try {
        const d = JSON.parse(localStorage.getItem(DETAILS_KEY) || "null");
        if (alive && d && typeof d === "object") setDetails({ ...NO_DETAILS, ...d });
      } catch {
        /* no saved details yet */
      }
      try {
        const r = await fetch(FEED, { cache: "no-store" });
        if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
        const data = (await r.json()) as { attributions?: Attribution[] };
        if (alive) setRows(Array.isArray(data.attributions) ? data.attributions : []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "feed unreachable");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Every attribution becomes a card. Local ones (a routable source) carry an
  // agency; region-wide ones carry the mechanism. Repeats = same station +
  // same routed source in the feed's 7-day window.
  const cards = useMemo(() => {
    const all = rows ?? [];
    const count = new Map<string, number>();
    for (const a of all) {
      const k = `${a.station_id}|${routingSource(a) ?? "regional"}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return all
      .map((a) => {
        const src = routingSource(a);
        return { a, src, repeats: count.get(`${a.station_id}|${src ?? "regional"}`) ?? 1 };
      })
      // High first, then medium, then low; within a grade local cards before
      // region-wide ones; newest first after that.
      .sort(
        (x, y) =>
          RANK[x.a.confidence] - RANK[y.a.confidence] ||
          Number(x.src === null) - Number(y.src === null) ||
          y.a.window_end.localeCompare(x.a.window_end),
      );
  }, [rows]);

  function toggleFiled(id: string) {
    setFiled((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = new Date().toISOString();
      try {
        localStorage.setItem(FILED_KEY, JSON.stringify(next));
      } catch {
        /* quota / private mode */
      }
      return next;
    });
  }

  function saveDetail(key: keyof Details, value: string) {
    setDetails((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(DETAILS_KEY, JSON.stringify(next));
      } catch {
        /* quota / private mode */
      }
      return next;
    });
  }

  const detailsReady = Boolean(details.first_name.trim() && details.email.trim());

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  const shown = cards.filter((c) => (showFiled || !filed[c.a.id]) && (showRegional || c.src !== null));
  const openCount = cards.filter((c) => !filed[c.a.id] && c.src !== null).length;
  const regionalCount = cards.filter((c) => c.src === null).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-mono text-sm font-bold text-cream">KAUN · WHAT IS CAUSING IT</h2>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide">
            <button onClick={() => setShowRegional((v) => !v)} className="text-indigo transition hover:text-burgundy-bright">
              {showRegional ? `hide region-wide (${regionalCount})` : `show region-wide (${regionalCount})`}
            </button>
            <button onClick={() => setShowFiled((v) => !v)} className="text-indigo transition hover:text-burgundy-bright">
              {showFiled ? "hide filed" : "show filed"}
            </button>
            <span className="text-xs normal-case tabular-nums text-cream-dim">
              {cards.length} spikes · {openCount} with a local culprit to file
            </span>
          </div>
        </div>
        <p className="mt-1 font-mono text-[11px] text-cream-dim">
          Last 7 days, high confidence first. Each spike is split into a local part (source, wind direction, named
          sites from OpenStreetMap) and a region-wide part (stagnant air, transported smoke) with what that shared
          air is made of. &quot;Fill&quot; opens a grievance portal with the complaint ready; you log in, check,
          solve the captcha and press Submit. Nothing is sent for you.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wide [&_button]:uppercase">
          <BookmarkletLink />
          <span className="normal-case text-cream-dim">
            ← no extension? drag to bookmarks, click it on the portal form. With the Kaun extension (repo:
            extension/kaun-filler, Chrome &gt; Load unpacked) a &quot;Fill with Kaun&quot; button appears on the
            portal by itself.
          </span>
          <a href={USERSCRIPT} className="text-cream-dim hover:text-cream" title="Optional: Tampermonkey version (Chrome needs 'Allow User Scripts' on)">
            or userscript
          </a>
          <button onClick={() => setEditDetails((v) => !v)} className="text-indigo hover:text-burgundy-bright">
            {editDetails ? "done" : detailsReady ? `your details: ${details.first_name}` : "add your details"}
          </button>
        </div>
        {editDetails && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["first_name", "First name *"],
                ["last_name", "Last name"],
                ["email", "Email *"],
                ["mobile", "Mobile"],
              ] as [keyof Details, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 font-mono text-[10px] uppercase text-cream-dim">
                {label}
                <input
                  value={details[key]}
                  onChange={(e) => saveDetail(key, e.target.value)}
                  className="rounded border border-line bg-transparent px-2 py-1 font-mono text-xs normal-case text-cream"
                  autoComplete={key === "email" ? "email" : key === "mobile" ? "tel" : "name"}
                />
              </label>
            ))}
            <p className="font-mono text-[10px] text-cream-dim sm:col-span-2">
              Saved only in this browser. Portals ask for a name, email and usually a mobile number.
            </p>
          </div>
        )}
      </section>

      {error && (
        <p className="font-mono text-sm text-cream-dim">
          Kaun feed offline ({error}). It goes live once the vayuvani hourly job runs on master.
        </p>
      )}
      {!error && rows === null && <p className="font-mono text-sm text-cream-dim">loading reports…</p>}
      {!error && rows !== null && shown.length === 0 && (
        <p className="font-mono text-sm text-cream-dim">No spikes to show right now.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {shown.map(({ a, src, repeats }) => {
          const ag = src ? AGENCY[src] : REGIONAL_AGENCY;
          const isFiled = Boolean(filed[a.id]);
          const text = complaintText(a, repeats);
          const c = a.cause;
          const portals: (keyof typeof PORTALS)[] = ["cpgrams", ...(isUP(a) ? (["jansunwai"] as const) : []), ...(stationInDelhi(a) ? (["pgms"] as const) : [])];
          return (
            <article
              key={a.id}
              className={`rounded-lg border border-line bg-panel p-4 ${isFiled ? "opacity-50" : a.confidence === "low" ? "opacity-70" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-mono text-sm font-bold text-cream">{a.station_name}</h3>
                <span
                  className={`font-mono text-[10px] uppercase ${
                    a.confidence === "high" ? "text-burgundy-bright" : "text-cream-dim"
                  }`}
                >
                  {a.confidence}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-cream-dim">
                {ist(a.window_start)} to {ist(a.window_end)} IST · PM2.5 {Math.round(a.peak_pm25)} (usual{" "}
                {Math.round(a.baseline_pm25)})
                {repeats > 1 && <span className="text-burgundy-bright"> · {repeats}x this week</span>}
              </p>
              {c ? (
                <div className="mt-2 flex flex-col gap-1 text-sm text-cream">
                  <p>
                    <span className="font-bold">{c.top ? SOURCE_LABEL[c.top] ?? c.top : "unclear"}</span>
                    {c.top && <span className="text-cream-dim"> {pct(c.shares[c.top] ?? 0)}</span>}
                    {c.local.share >= 0.25 && c.local.top && (
                      <span className="text-cream-dim">
                        {" "}· local {pct(c.local.share)}: {SOURCE_LABEL[c.local.top] ?? c.local.top}
                        {c.local.calm ? " (calm, close by)" : c.local.sector ? ` from the ${SECTOR_NAME[c.local.sector] ?? c.local.sector}` : ""}
                      </span>
                    )}
                  </p>
                  {c.local.candidates.length > 0 && (
                    <ul className="font-mono text-[11px] text-cream-dim">
                      {c.local.candidates.map((s) => (
                        <li key={`${s.name}-${s.km}`}>
                          ↳{" "}
                          {s.lat != null ? (
                            <a
                              href={`https://maps.google.com/?q=${s.lat},${s.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo hover:text-burgundy-bright"
                            >
                              {s.name}
                            </a>
                          ) : (
                            s.name
                          )}{" "}
                          · {s.type} · {s.km} km {s.sector}
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.regional.share >= 0.3 && (
                    <p className="font-mono text-[11px] text-cream-dim">
                      region-wide {pct(c.regional.share)}: {MECHANISM_LABEL[c.regional.mechanism]}
                      {c.regional.mechanism === "stagnation" && c.regional.wind_ms != null && ` · wind ${c.regional.wind_ms.toFixed(1)} m/s`}
                      {c.regional.mechanism === "stagnation" && c.regional.pbl_ratio != null && ` · mixing height ${Math.round(c.regional.pbl_ratio * 100)}%`}
                      {c.regional.mechanism === "transport" && c.regional.upwind_fires ? ` · ${c.regional.upwind_fires} fires upwind` : ""}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-cream">{a.summary_en}</p>
              )}
              <p className="mt-2 font-mono text-[11px] text-cream-dim">
                → {ag.name} via {ag.channel}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wide [&_button]:uppercase">
                {portals.map((p) => (
                  <a
                    key={p}
                    href={portalLink(p, a, repeats, details)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!detailsReady) {
                        e.preventDefault();
                        setEditDetails(true);
                      }
                    }}
                    className={p === "cpgrams" ? "font-bold text-burgundy-bright hover:text-cream" : "text-burgundy-bright hover:text-cream"}
                    title={detailsReady ? `${PORTALS[p].note}. Opens with the complaint ready; log in, then the Kaun button fills it.` : "Add your name and email first"}
                  >
                    fill {PORTALS[p].label}
                  </a>
                ))}
                <button onClick={() => copy(a.id, text)} className="text-indigo hover:text-burgundy-bright">
                  {copied === a.id ? "copied ✓" : "copy complaint"}
                </button>
                <a
                  href={`https://x.com/intent/post?text=${encodeURIComponent(xText(a, repeats))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo hover:text-burgundy-bright"
                >
                  post on x
                </a>
                <a
                  href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo hover:text-burgundy-bright"
                >
                  map
                </a>
                <button onClick={() => toggleFiled(a.id)} className="text-cream-dim hover:text-cream">
                  {isFiled ? "unmark filed" : "mark filed"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// React refuses javascript: URLs in href, so the bookmarklet is set on the DOM
// node directly. Clicking it here does nothing; it is meant to be dragged.
function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", BOOKMARKLET);
  }, []);
  return (
    <a
      ref={ref}
      onClick={(e) => e.preventDefault()}
      className="rounded border border-burgundy-bright px-2 py-0.5 font-bold text-burgundy-bright"
      title="Drag me to your bookmarks bar"
    >
      Kaun fill
    </a>
  );
}
