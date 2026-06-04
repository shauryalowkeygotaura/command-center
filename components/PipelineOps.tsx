"use client";

import { useEffect, useState } from "react";
import {
  PIPELINES,
  PipelineState,
  CCUsage,
  fetchActions,
  fetchMetrics,
  severity,
  relTime,
} from "@/lib/pipelines";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

// `term` green is the brand's reserved code/status color (see globals.css);
// the "no green chrome" rule is about surfaces, not a health indicator.
const DOT: Record<string, string> = {
  ok: "bg-term",
  warn: "bg-amber",
  bad: "bg-burgundy-bright",
  idle: "bg-cream-dim",
};
const WORD: Record<string, string> = {
  ok: "live",
  warn: "degraded",
  bad: "failed",
  idle: "no data",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function PipelineOps() {
  const [states, setStates] = useState<PipelineState[]>(
    PIPELINES.map((cfg) => ({ cfg })),
  );
  const [cc, setCc] = useState<CCUsage | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMounted(true);

    PIPELINES.forEach(async (cfg, i) => {
      const [actions, metrics] = await Promise.all([
        fetchActions(cfg),
        fetchMetrics(cfg),
      ]);
      if (cancelled) return;
      setStates((prev) => {
        const next = [...prev];
        next[i] = { cfg, actions, metrics };
        return next;
      });
    });

    fetch(`${BASE}/status/cc-usage.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CCUsage | null) => !cancelled && d && setCc(d))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-6 rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          PIPELINES
        </span>
        <span className="font-mono text-[10px] text-cream-dim">
          live from GitHub Actions + run metrics
        </span>
      </div>

      <ul className="divide-y divide-line">
        {states.map((s) => {
          const sev = severity(s);
          const m = s.metrics;
          return (
            <li key={s.cfg.key} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[sev]}`} />
                <span className="font-mono text-sm font-bold text-cream">
                  {s.cfg.label}
                </span>
                <span className="font-mono text-[10px] uppercase text-cream-dim">
                  {WORD[sev]}
                </span>
                <span className="ml-auto font-mono text-[10px] text-cream-dim">
                  {relTime(m?.ts || s.actions?.createdAt)}
                </span>
                {s.actions?.url && (
                  <a
                    href={s.actions.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-cream-dim underline hover:text-burgundy-bright"
                  >
                    logs
                  </a>
                )}
              </div>

              <p className="ml-4 mt-1 font-sans text-xs leading-snug text-cream-dim">
                {mounted
                  ? m?.summary || "Waiting for first metrics commit…"
                  : "loading…"}
              </p>

              {/* free-tier budget chips from the run's budgets block */}
              {m?.budgets && Object.keys(m.budgets).length > 0 && (
                <div className="ml-4 mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(m.budgets).map(([svc, b]) => {
                    const exhausted = b.note === "exhausted";
                    return (
                      <span
                        key={svc}
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                          exhausted
                            ? "border-burgundy-bright text-burgundy-bright"
                            : "border-line text-cream-dim"
                        }`}
                      >
                        {svc}
                        {b.limit ? ` ·${b.limit}/mo` : ""}
                        {b.note ? ` · ${b.note}` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Token / free-budget footer: Claude Code usage + free model note */}
      <div className="border-t border-line px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold text-cream">
            TOKENS &amp; LIMITS
          </span>
          <span className="font-mono text-[10px] text-cream-dim">
            {cc ? `Claude Code · as of ${relTime(cc.ts)}` : "Claude Code · no data"}
          </span>
        </div>
        <div className="mt-1.5 grid gap-1 font-mono text-[11px] text-cream-dim sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <span>Claude Code · today</span>
            <span className="tabular-nums text-cream">
              {cc ? `${fmt(cc.todayTokens)} tok · $${cc.todayCostUsd.toFixed(2)}` : "—"}
            </span>
          </div>
          {cc?.weekTokens != null && (
            <div className="flex justify-between gap-2">
              <span>Claude Code · 7d</span>
              <span className="tabular-nums text-cream">{fmt(cc.weekTokens)} tok</span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span>Groq · edge-tts</span>
            <span className="text-cream">free tier</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>SerpAPI</span>
            <span className="text-cream">100 searches/mo</span>
          </div>
        </div>
        {cc?.limitNote && (
          <p className="mt-1 font-mono text-[10px] text-cream-dim">{cc.limitNote}</p>
        )}
      </div>
    </section>
  );
}
