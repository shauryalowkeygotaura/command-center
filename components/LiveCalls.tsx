"use client";

// LIVE CALLS — supervisor view of voice-agent calls running on THIS machine.
// Reads paralang's local feed (paralang/live.py) at http://127.0.0.1:8765/calls.
// The feed binds to loopback and checks the Host header, so call data never
// leaves the machine: this page is only a viewer. On any other device (or with
// no agent running) the panel just says "offline" and polls slowly.

import { useEffect, useRef, useState } from "react";

const FEED = "http://127.0.0.1:8765/calls";
const FAST_MS = 1500; // while an agent answers
const SLOW_MS = 5000; // while offline: an idle tab must cost nothing

type Cue = { name: string; strength: number };
type Turn = {
  turn: number;
  tag: string;
  text: string;
  cues: Cue[];
  engagement: number;
  coach: string | null;
  lang: string | null;
  t: number;
};
type Call = {
  id: string;
  status: "live" | "ended";
  started: number;
  updated: number;
  meta: { lead?: string; agent?: string };
  turns: Turn[];
  result?: { score?: number; tier?: string; action?: string };
};

const NEGATIVE = new Set(["hesitant", "flat", "agitated", "sighed", "long_think", "machine"]);

function Spark({ values }: { values: number[] }) {
  const w = 160;
  const h = 32;
  if (values.length === 0) return null;
  const n = Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * w) / n},${h - (v / 100) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`-2 -2 ${w + 4} ${h + 4}`} aria-label="engagement trend">
      <line x1={0} y1={h * 0.4} x2={w} y2={h * 0.4} stroke="var(--color-line)" strokeDasharray="3 3" />
      <polyline fill="none" stroke="var(--color-burgundy-bright)" strokeWidth={2} points={pts} />
    </svg>
  );
}

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round(now - ts));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function LiveCalls() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      let next = SLOW_MS;
      try {
        const r = await fetch(FEED, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { calls?: Call[]; ts?: number };
        if (!alive) return;
        setCalls(Array.isArray(data.calls) ? data.calls : []);
        setNow(data.ts ?? Date.now() / 1000);
        setOnline(true);
        next = FAST_MS;
      } catch {
        if (!alive) return;
        setOnline(false);
      }
      timer.current = setTimeout(poll, next);
    };
    poll();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const live = calls.filter((c) => c.status === "live").length;

  return (
    <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
      <div className="flex items-baseline gap-3">
        <h2 className="font-mono text-sm font-bold text-cream">LIVE CALLS</h2>
        <span className="font-mono text-xs tabular-nums text-cream-dim">
          {online === null ? "connecting…" : online ? `${live} live · ${calls.length - live} recent` : "offline"}
        </span>
        <span
          className={`ml-auto h-2 w-2 rounded-full ${online ? "bg-burgundy-bright animate-pulse" : "bg-line"}`}
          aria-hidden
        />
      </div>

      {online === false && (
        <p className="mt-2 font-mono text-[11px] leading-snug text-cream-dim">
          No agent on this machine. Start one and calls appear here as they happen:{" "}
          <code className="text-cream">rt_agent.py</code> (paralang feed on 127.0.0.1:8765, local only).
        </p>
      )}
      {online && calls.length === 0 && (
        <p className="mt-2 font-mono text-[11px] text-cream-dim">Agent running, no calls yet.</p>
      )}

      <div className="mt-3 flex flex-col gap-3">
        {calls.map((c) => {
          const last = c.turns[c.turns.length - 1];
          const coach = [...c.turns].reverse().find((t) => t.coach)?.coach;
          return (
            <article key={c.id} className="rounded border border-line bg-panel-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    c.status === "live" ? "bg-burgundy text-cream" : "border border-line text-cream-dim"
                  }`}
                >
                  {c.status === "live" ? "LIVE" : (c.result?.tier ?? "ended").toUpperCase()}
                </span>
                <span className="text-cream">{c.meta.lead || c.id}</span>
                <span className="text-cream-dim">
                  {c.turns.length} turns · {ago(c.started, now)}
                  {c.result?.score !== undefined && ` · score ${c.result.score}`}
                  {last?.lang && ` · ${last.lang.toUpperCase()}`}
                </span>
                <span className="ml-auto">
                  <Spark values={c.turns.map((t) => t.engagement)} />
                </span>
              </div>
              {last && (
                <div className="mt-1.5 flex flex-col gap-1 font-mono text-[11px] leading-snug">
                  <div className="flex flex-wrap gap-1">
                    {last.cues.length === 0 && <span className="text-cream-dim">no cues</span>}
                    {last.cues.map((cue) => (
                      <span
                        key={cue.name}
                        className={`rounded border px-1 ${
                          NEGATIVE.has(cue.name) ? "border-amber/60 text-amber" : "border-line text-cream"
                        }`}
                      >
                        {cue.name} {cue.strength.toFixed(1)}
                      </span>
                    ))}
                  </div>
                  <span className="text-cream-dim">caller: “{last.text}”</span>
                  {coach && <span className="text-indigo">coach: {coach}</span>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
