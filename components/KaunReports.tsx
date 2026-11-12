"use client";

// KAUN tab: VayuVani's pollution source attributions as complaint cards.
// Data is the public Kaun feed (vayuvani repo, GitHub Pages, written hourly).
// Nothing is filed automatically. Each card can open CPCB's Delhi NCR air
// pollution web form pre-filled (via the kaun-fill userscript; you type the
// captcha and press Submit), copy the complaint for an app (Green Delhi /
// MCD 311 have no web form), or open a pre-written X post.
// "Filed" marks and your contact details are localStorage-only: this repo and
// site are public, so they never leave your browser except inside the link.

import { useEffect, useMemo, useRef, useState } from "react";

const FEED = "https://shauryalowkeygotaura.github.io/vayuvani/data/history.json";
const FILED_KEY = "cc.kaun.filed.v1";
const DETAILS_KEY = "cc.kaun.details.v1";
const CPCB_FORM = "https://cpcb.gov.in/query-form1.php";
const USERSCRIPT = "kaun-fill.user.js";

// Same filler as public/kaun-fill.user.js, as a bookmarklet: no extension
// needed. Click it on the CPCB page that "fill cpcb form" opens. Writes only
// whitelisted fields, never the captcha, never submits.
const FILLER_SRC = `(function(){
var m=location.hash.match(/^#kaun=(.+)$/);
function b(t,w){var d=document.createElement("div");d.textContent=t;d.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;font:14px/1.4 system-ui,sans-serif;color:#fff;background:"+(w?"#9a3412":"#6b1d2a");document.body.appendChild(d);setTimeout(function(){d.remove()},12000)}
if(location.hostname!=="cpcb.gov.in"||!m){b("Kaun: open this from a card's FILL CPCB FORM button first, then click the bookmark.",true);return}
var x;try{x=JSON.parse(decodeURIComponent(m[1]))}catch(e){b("Kaun: could not read the complaint data.",true);return}
if(Array.prototype.some.call(document.forms,function(f){return /Error while submitting form/i.test(f.getAttribute("onsubmit")||"")})){b("CPCB has switched this form off on their side (every Submit fails). Kaun did not fill it. Use Copy complaint in the Green Delhi app, or Post on X.",true);return}
var F={name1:["first_name",80],name2:["last_name",80],email:["email",120],mobile:["mobile",15],location:["location",300],message:["message",1000]},miss=[];
for(var id in F){var el=document.getElementById(id),v=typeof x[F[id][0]]==="string"?x[F[id][0]].slice(0,F[id][1]):"";if(!el){miss.push(id);continue}if(!v)continue;el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
var s=document.getElementById("subject");if(s&&typeof x.subject==="string"){var o=Array.prototype.find.call(s.options,function(o){return o.text.trim()===x.subject});if(o){s.value=o.value;s.dispatchEvent(new Event("change",{bubbles:true}))}else miss.push("subject")}
var c=document.getElementById("captcha_code");if(c){c.scrollIntoView({block:"center"});c.focus()}
b(miss.length?"Kaun filled what it could; not filled: "+miss.join(", ")+". Check before submitting.":"Kaun filled the complaint. Check it, type the captcha, then press Submit.",miss.length>0)
})();`;
const BOOKMARKLET = "javascript:" + encodeURIComponent(FILLER_SRC.replace(/\n/g, ""));

// Kaun source -> CPCB form's own subject text (must match exactly; the
// userscript refuses anything not in CPCB's dropdown).
const CPCB_SUBJECT: Record<string, string> = {
  biomass_burning: "Open/Garbage Burning",
  traffic: "Visible Vehicular Emission",
  industry: "Industrial Emission",
  dust: "Road Dust",
};

type Details = { first_name: string; last_name: string; email: string; mobile: string };
const NO_DETAILS: Details = { first_name: "", last_name: "", email: "", mobile: "" };

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
};

// Mirrors vayuvani reporting/agencies.py PRIMARY_AGENCY. Sources missing here
// (regional background, transported smoke, secondary aerosol) have no local
// owner, so they never become cards.
const AGENCY: Record<string, { name: string; channel: string; x: string }> = {
  biomass_burning: { name: "MCD", channel: "MCD 311 app / Green Delhi app", x: "@DPCC_pollution" }, // MCD's X handle unverified; DPCC runs Green Delhi
  industry: { name: "DPCC", channel: "Green Delhi app", x: "@DPCC_pollution" },
  dust: { name: "DPCC", channel: "Green Delhi app", x: "@DPCC_pollution" },
  traffic: { name: "Delhi Traffic Police", channel: "X (@dtptraffic)", x: "@dtptraffic" },
};

const RANK: Record<Attribution["confidence"], number> = { high: 0, medium: 1, low: 2 };

const SOURCE_LABEL: Record<string, string> = {
  biomass_burning: "burning (garbage / biomass)",
  industry: "industry",
  dust: "construction / road dust",
  traffic: "traffic",
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

function complaintText(a: Attribution, repeats: number): string {
  const ag = AGENCY[a.top_source];
  const share = Math.round((a.shares[a.top_source] ?? 0) * 100);
  return [
    `Air pollution complaint for ${ag.name}: ${a.station_name}`,
    `When: ${ist(a.window_start)} to ${ist(a.window_end)} IST`,
    `PM2.5 peaked at ${Math.round(a.peak_pm25)} µg/m³ vs a usual ${Math.round(a.baseline_pm25)} µg/m³ for this hour.`,
    `Likely source: ~${share}% ${SOURCE_LABEL[a.top_source]}${a.sector ? `, arriving from the ${a.sector}` : ""} (confidence ${a.confidence}).`,
    repeats > 1 ? `This is the ${repeats}th such spike at this station in 7 days.` : "",
    `Location: https://maps.google.com/?q=${a.latitude},${a.longitude}`,
    `Evidence: observation-based estimate from CPCB/DPCC station data, wind and NASA fire data (VayuVani Kaun). Please inspect the area.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const SECTOR_NAME: Record<string, string> = {
  N: "north", NE: "north-east", E: "east", SE: "south-east",
  S: "south", SW: "south-west", W: "west", NW: "north-west",
};

function cpcbLink(a: Attribution, repeats: number, d: Details): string {
  const sector = a.sector ? SECTOR_NAME[a.sector] ?? a.sector : null;
  const payload = {
    ...d,
    subject: CPCB_SUBJECT[a.top_source],
    location:
      `Around ${a.station_name} air quality monitoring station, Delhi ` +
      `(${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)})` +
      (sector ? `; source likely to the ${sector} of the station` : ""),
    message: complaintText(a, repeats).slice(0, 1000),
  };
  return `${CPCB_FORM}#kaun=${encodeURIComponent(JSON.stringify(payload))}`;
}

function xText(a: Attribution, repeats: number): string {
  const ag = AGENCY[a.top_source];
  return (
    `${ag.x} PM2.5 at ${a.station_name.split(",")[0]} hit ${Math.round(a.peak_pm25)} µg/m³ ` +
    `(${ist(a.window_start)} IST), likely ${SOURCE_LABEL[a.top_source]}` +
    `${repeats > 1 ? `, ${repeats}x this week` : ""}. Please act. #DelhiAirPollution`
  );
}

export function KaunReports() {
  const [rows, setRows] = useState<Attribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [showFiled, setShowFiled] = useState(false);
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

  // Only medium/high attributions with a local owner become cards. Repeats =
  // same station + same source in the feed's 7-day window.
  const cards = useMemo(() => {
    const usable = (rows ?? []).filter(
      (a) => AGENCY[a.top_source],
    );
    const count = new Map<string, number>();
    for (const a of usable) {
      const k = `${a.station_id}|${a.top_source}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return usable
      .map((a) => ({ a, repeats: count.get(`${a.station_id}|${a.top_source}`) ?? 1 }))
      // High first, then medium, then low; newest first within each.
      .sort(
        (x, y) =>
          RANK[x.a.confidence] - RANK[y.a.confidence] ||
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

  const shown = cards.filter((c) => showFiled || !filed[c.a.id]);
  const openCount = cards.filter((c) => !filed[c.a.id]).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-mono text-sm font-bold text-cream">KAUN · POLLUTION REPORTS</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFiled((v) => !v)}
              className="font-mono text-[10px] uppercase tracking-wide text-indigo transition hover:text-burgundy-bright"
            >
              {showFiled ? "hide filed" : "show filed"}
            </button>
            <span className="font-mono text-xs tabular-nums text-cream-dim">
              {cards.length} reports · {openCount} to file
            </span>
          </div>
        </div>
        <p className="mt-1 font-mono text-[11px] text-cream-dim">
          Spikes from the last 7 days, high confidence first, low last (low = weak evidence, check before filing). &quot;Fill CPCB form&quot; opens CPCB&apos;s Delhi
          NCR complaint form already filled in: you type the captcha and press Submit. Nothing is sent for you.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wide [&_button]:uppercase">
          <BookmarkletLink />
          <span className="normal-case text-cream-dim">
            ← no extension? drag to bookmarks, click it on the CPCB page. With the Kaun extension
            (repo: extension/kaun-filler, Chrome &gt; Load unpacked) the form fills by itself.
          </span>
          <a href={USERSCRIPT} className="text-cream-dim hover:text-cream" title="Optional: Tampermonkey version that fills automatically (Chrome needs 'Allow User Scripts' on)">
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
              Saved only in this browser. CPCB requires a name and email.
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
        <p className="font-mono text-sm text-cream-dim">No reports to file right now.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {shown.map(({ a, repeats }) => {
          const ag = AGENCY[a.top_source];
          const isFiled = Boolean(filed[a.id]);
          const text = complaintText(a, repeats);
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
              <p className="mt-2 text-sm text-cream">{a.summary_en}</p>
              <p className="mt-2 font-mono text-[11px] text-cream-dim">
                → {ag.name} via {ag.channel}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wide [&_button]:uppercase">
                {CPCB_SUBJECT[a.top_source] && (
                  <a
                    href={cpcbLink(a, repeats, details)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!detailsReady) {
                        e.preventDefault();
                        setEditDetails(true);
                      }
                    }}
                    className="font-bold text-burgundy-bright hover:text-cream"
                    title={detailsReady ? "Opens CPCB's form filled in; type the captcha and submit" : "Add your name and email first"}
                  >
                    fill cpcb form
                  </a>
                )}
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
