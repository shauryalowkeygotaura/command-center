"use client";

// KAUN tab: VayuVani's pollution source attributions as complaint cards.
// Data is the public Kaun feed (vayuvani repo, GitHub Pages, written hourly).
// Nothing is filed automatically: each card copies a ready complaint for the
// agency's app (Green Delhi / MCD 311 / Sameer have no web form or API) or
// opens a pre-written X post. "Filed" marks are localStorage-only.

import { useEffect, useMemo, useState } from "react";

const FEED = "https://shauryalowkeygotaura.github.io/vayuvani/data/history.json";
const FILED_KEY = "cc.kaun.filed.v1";

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
      (a) => a.confidence !== "low" && AGENCY[a.top_source],
    );
    const count = new Map<string, number>();
    for (const a of usable) {
      const k = `${a.station_id}|${a.top_source}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return usable
      .map((a) => ({ a, repeats: count.get(`${a.station_id}|${a.top_source}`) ?? 1 }))
      .sort((x, y) => y.a.window_end.localeCompare(x.a.window_end));
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
          Medium/high-confidence spikes from the last 7 days. Copy the complaint into the agency app
          (photo + location needed there), or post it on X. Nothing is sent for you.
        </p>
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
              className={`rounded-lg border border-line bg-panel p-4 ${isFiled ? "opacity-50" : ""}`}
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
