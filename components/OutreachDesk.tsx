"use client";

import { useEffect, useState } from "react";
import { GH_OWNER } from "@/lib/pipelines";

// The outreach "desk": Harvey's best screen (anything waiting on you first,
// then the pipeline) fed by client-acquisition-pipeline's own runs/desk.json.
// Replaced the embedded Harvey dashboard 2026-10-01: Harvey duplicated what
// the pipeline already does, so its good parts were moved INTO the pipeline
// (send gate, kill switch, bounce guard) and this tab shows that data.
// desk.json is committed to a PUBLIC repo: names and counts only, by design.
const DESK_URL =
  `https://raw.githubusercontent.com/${GH_OWNER}/client-acquisition-pipeline/master/runs/desk.json`;

interface Desk {
  ts: string;
  sending: { paused: boolean; by?: string; reason?: string; since?: string };
  handoffs: { company: string; niche: string; city: string; since: string }[];
  sent_14d: number;
  bounced_14d: number;
  replied_14d: number;
  gate_rejections: { ts: string; company: string; kind: string; reasons: string[] }[];
}

const ago = (iso: string) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-cream-dim/15 py-2">
      <span className="text-cream-dim">{label}</span>
      <span className={`tabular-nums ${warn ? "text-burgundy-bright" : "text-cream"}`}>{value}</span>
    </div>
  );
}

export function OutreachDesk() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(DESK_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      // Defaults, so an older or partial desk.json renders instead of crashing.
      .then((d: Partial<Desk>) => live && setDesk({
        ts: d.ts ?? "", sending: d.sending ?? { paused: false },
        handoffs: d.handoffs ?? [], gate_rejections: d.gate_rejections ?? [],
        sent_14d: d.sent_14d ?? 0, bounced_14d: d.bounced_14d ?? 0, replied_14d: d.replied_14d ?? 0,
      }))
      .catch((e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, []);

  if (err) return <p className="font-mono text-sm text-cream-dim">desk.json unavailable ({err}). It appears after the next replies run.</p>;
  if (!desk) return <p className="font-mono text-sm text-cream-dim">loading the desk...</p>;

  const rate = desk.sent_14d ? desk.bounced_14d / desk.sent_14d : 0;
  const waiting = desk.handoffs.length + (desk.sending.paused ? 1 : 0);

  return (
    <div className="grid gap-8 font-mono text-sm md:grid-cols-[1.6fr_1fr]">
      <section>
        <h2 className="text-cream text-lg">Waiting on you <span className="text-cream-dim">({waiting})</span></h2>
        <ul className="mt-3 flex flex-col gap-3">
          {desk.sending.paused && (
            <li className="border-l-2 border-burgundy-bright pl-3">
              <p className="text-cream">All email sending is PAUSED</p>
              <p className="text-cream-dim">{desk.sending.reason}</p>
              <p className="mt-1 text-cream-dim">
                {desk.sending.by === "manual"
                  ? "Resume: gh variable set SENDING_PAUSED --body 0"
                  : "Fix the bounces, then delete runs/sending_paused.json to resume."}
              </p>
            </li>
          )}
          {desk.handoffs.map((h) => (
            <li key={h.company + h.since} className="border-l-2 border-amber pl-3">
              <p className="text-cream">{h.company} is ready to talk. The bot has stopped; this thread is yours.</p>
              <p className="text-cream-dim">{[h.niche, h.city].filter(Boolean).join(" · ")} · {ago(h.since)}</p>
            </li>
          ))}
          {waiting === 0 && <li className="text-cream-dim">Nothing. The pipeline is running on its own.</li>}
        </ul>

        <h2 className="mt-8 text-cream text-lg">Blocked by the send gate</h2>
        <p className="text-cream-dim">Emails the deterministic check refused to send, newest first.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {desk.gate_rejections.length === 0 && <li className="text-cream-dim">None yet.</li>}
          {desk.gate_rejections.map((g, i) => (
            <li key={g.ts + i}>
              <span className="text-cream">{g.company}</span>{" "}
              <span className="text-cream-dim">({g.kind}, {ago(g.ts)}): {g.reasons.join("; ")}</span>
            </li>
          ))}
        </ul>
      </section>

      <aside>
        <h2 className="text-cream-dim uppercase tracking-wide text-xs">Last 14 days</h2>
        <Stat label="emails sent" value={`${desk.sent_14d}`} />
        <Stat label="replied" value={`${desk.replied_14d}`} />
        <Stat label="bounced" value={`${desk.bounced_14d} (${(rate * 100).toFixed(1)}%)`} warn={rate >= 0.05} />
        <Stat label="sending" value={desk.sending.paused ? "paused" : "live"} warn={desk.sending.paused} />
        <p className="mt-3 text-xs text-cream-dim">updated {ago(desk.ts)} · auto-pause at 5% bounces</p>
      </aside>
    </div>
  );
}
