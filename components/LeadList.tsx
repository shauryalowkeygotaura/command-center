"use client";

import { useEffect, useState } from "react";

// The automated client-acquisition pipeline commits runs/leads.json at the end
// of every run (qualified leads + their source + which channels auto-fired).
// We read it the same way PipelineOps reads runs/latest.json: a public
// raw.githubusercontent fetch, no backend, ~5-min CDN cache.
const LEADS_URL =
  "https://raw.githubusercontent.com/shauryalowkeygotaura/client-acquisition-pipeline/master/runs/leads.json";

type Channels = {
  email?: boolean;
  linkedin?: boolean;
  whatsapp?: boolean;
  instagram?: boolean;
};

type Lead = {
  label: string;
  source: string;
  niche: string;
  score: number;
  city?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  channels?: Channels;
};

type LeadsFile = { ts?: string; count?: number; leads?: Lead[] };

// Source → short label. Burgundy/amber palette only (house rule: no green).
const SOURCE_LABEL: Record<string, string> = {
  indeed: "indeed",
  google_jobs: "g.jobs",
  apollo: "apollo",
  maps: "maps",
  osm: "osm",
};

const CHANNELS: { key: keyof Channels; label: string }[] = [
  { key: "email", label: "email" },
  { key: "linkedin", label: "li" },
  { key: "whatsapp", label: "wa" },
  { key: "instagram", label: "ig" },
];

function telHref(num?: string): string {
  const d = (num || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `tel:+91${d}`;
  if (d.startsWith("91")) return `tel:+${d}`;
  if (d.startsWith("0")) return `tel:+91${d.slice(1)}`;
  return `tel:${d}`;
}

function waHref(wa?: string): string {
  const d = (wa || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}

export function LeadList() {
  const [data, setData] = useState<LeadsFile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(LEADS_URL, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as LeadsFile;
        if (!cancelled) {
          setData(json);
          setState("ok");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const leads = data?.leads ?? [];

  // Source breakdown chip row (indeed: 12 · maps: 3 …).
  const breakdown = leads.reduce<Record<string, number>>((acc, l) => {
    const s = l.source || "?";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="hud flex flex-col rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 font-mono text-sm font-bold text-burgundy-bright">
        <span>AUTOMATED LEADS</span>
        <span className="font-normal tabular-nums text-cream-dim">
          {state === "ok" ? `${leads.length} leads` : ""}
          {data?.ts ? ` · ${data.ts.slice(0, 10)}` : ""}
        </span>
      </div>

      {Object.keys(breakdown).length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2 font-mono text-[10px] text-cream-dim">
          {Object.entries(breakdown).map(([src, n]) => (
            <span key={src} className="rounded bg-panel-2 px-1.5 py-0.5">
              {SOURCE_LABEL[src] ?? src}: <span className="text-amber">{n}</span>
            </span>
          ))}
        </div>
      )}

      {state === "loading" && (
        <p className="px-3 py-4 font-mono text-xs text-cream-dim">loading leads…</p>
      )}
      {state === "error" && (
        <p className="px-3 py-4 font-mono text-xs text-cream-dim">
          no leads file yet — the pipeline writes runs/leads.json on its next run.
        </p>
      )}
      {state === "ok" && leads.length === 0 && (
        <p className="px-3 py-4 font-mono text-xs text-cream-dim">
          last run saved 0 qualified leads.
        </p>
      )}

      <ul className="divide-y divide-line">
        {leads.map((l, i) => (
          <li key={`${l.label}-${i}`} className="px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-sans text-sm text-cream">
                    {l.label}
                  </span>
                  <span className="shrink-0 rounded bg-burgundy px-1.5 py-0.5 font-mono text-[10px] text-cream">
                    {SOURCE_LABEL[l.source] ?? (l.source || "?")}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-cream-dim">
                  {l.niche || "?"}
                  {l.city ? ` · ${l.city}` : ""} · score{" "}
                  <span className="text-amber">{l.score}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {telHref(l.phone) && (
                  <a
                    href={telHref(l.phone)}
                    className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-cream-dim hover:border-burgundy-bright hover:text-cream"
                  >
                    call
                  </a>
                )}
                {waHref(l.whatsapp) && (
                  <a
                    href={waHref(l.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-cream-dim hover:border-burgundy-bright hover:text-cream"
                  >
                    wa
                  </a>
                )}
              </div>
            </div>

            {/* channel chips — lit (amber) when that channel auto-fired */}
            <div className="mt-1 flex gap-1 font-mono text-[10px]">
              {CHANNELS.map(({ key, label }) => {
                const fired = !!l.channels?.[key];
                return (
                  <span
                    key={key}
                    className={`rounded px-1.5 py-0.5 ${
                      fired
                        ? "bg-amber/20 text-amber"
                        : "bg-panel-2 text-cream-dim/50"
                    }`}
                    title={fired ? `${label} sent` : `${label} not sent`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
