"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PIPELINES,
  PipelineState,
  CCUsage,
  CC_RAW_URL,
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
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const alive = useRef(true);

  // Token usage comes from raw GitHub (the Stop hook pushes cc-usage.json after
  // your Claude turns), so the live deployed site stays current without a Pages
  // rebuild. Fall back to the file baked into this build if raw is unreachable.
  const refreshCc = useCallback(() => {
    (async () => {
      for (const url of [CC_RAW_URL, `${BASE}/status/cc-usage.json`]) {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) continue;
          const d: CCUsage = await r.json();
          if (alive.current && d) {
            setCc(d);
            return;
          }
        } catch {
          /* try next source */
        }
      }
    })();
  }, []);

  const refresh = useCallback(() => {
    PIPELINES.forEach(async (cfg, i) => {
      const [actions, metrics] = await Promise.all([
        fetchActions(cfg),
        fetchMetrics(cfg),
      ]);
      if (!alive.current) return;
      setStates((prev) => {
        const next = [...prev];
        next[i] = { cfg, actions, metrics };
        return next;
      });
    });

    refreshCc();
    setUpdatedAt(new Date().toISOString());
  }, [refreshCc]);

  useEffect(() => {
    alive.current = true;
    setMounted(true);
    refresh();

    // Everything is now a remote GitHub fetch (raw cc-usage caches ~5min), so a
    // single 60s poll is plenty; refresh() already pulls the token feed too. Also
    // refresh on tab focus so the board is current the moment you look at it.
    const pipeId = setInterval(refresh, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive.current = false;
      clearInterval(pipeId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          PIPELINES
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-cream-dim">
            {mounted && updatedAt
              ? `auto · updated ${relTime(updatedAt)}`
              : "live from GitHub Actions"}
          </span>
          <button
            onClick={refresh}
            aria-label="refresh now"
            className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-cream hover:border-burgundy-bright"
          >
            ↻
          </button>
        </div>
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
                {s.cfg.site && (
                  <a
                    href={s.cfg.site}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-cream-dim underline hover:text-burgundy-bright"
                  >
                    open
                  </a>
                )}
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

        {/* Live 5-hour token burn — the headline gauge, polled every 15s. */}
        {cc?.live5hTokens != null && (
          <div className="mt-1.5 rounded border border-line bg-ink px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-cream-dim">
                  5h burn
                </span>
                <span className="font-mono text-base font-bold tabular-nums text-cream">
                  {fmt(cc.live5hTokens)} tok
                </span>
                {cc.live5hCostUsd != null && (
                  <span className="font-mono text-[11px] tabular-nums text-cream-dim">
                    ${cc.live5hCostUsd.toFixed(2)}
                  </span>
                )}
              </div>
              {cc.burnTokPerMin != null && (
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    cc.burnTokPerMin > 0 ? "text-amber" : "text-cream-dim"
                  }`}
                >
                  ↑ {fmt(cc.burnTokPerMin)}/min
                  {cc.burnCostPerHour != null && cc.burnCostPerHour > 0
                    ? ` · $${cc.burnCostPerHour.toFixed(0)}/hr`
                    : ""}
                </span>
              )}
            </div>

            {/* Gauge bar: current 5h window vs this week's peak 5h burn (the
                de facto rate-limit ceiling). Amber from 70%, burgundy from 90%. */}
            {cc.peak5hTokens != null && cc.peak5hTokens > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-line">
                  <div
                    className={`h-full transition-all duration-500 ${
                      cc.live5hTokens / cc.peak5hTokens >= 0.9
                        ? "bg-burgundy-bright"
                        : cc.live5hTokens / cc.peak5hTokens >= 0.7
                          ? "bg-amber"
                          : "bg-term"
                    }`}
                    style={{
                      width: `${Math.min(100, (cc.live5hTokens / cc.peak5hTokens) * 100)}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] tabular-nums text-cream-dim">
                  {Math.min(100, Math.round((cc.live5hTokens / cc.peak5hTokens) * 100))}%
                  <span className="text-cream-dim/60"> of wk peak</span>
                </span>
              </div>
            )}
          </div>
        )}

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
