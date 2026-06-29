"use client";

import { useEffect, useState } from "react";

// HANDOFFS - the short list of things only Shaurya can do (accounts, OAuth, human
// review) that unblock automation I cannot finish headless. Each card states WHAT
// to do and WHY it matters. Data-driven so items are trivial to add/retire; done
// state is persisted in localStorage, burgundy/cream chrome, no green.

interface Handoff {
  id: string;
  title: string;
  /** concrete steps Shaurya runs. */
  what: string;
  /** what unblocks once this is handed over. */
  why: string;
  critical?: boolean;
  /** optional console/registration link. */
  link?: string;
}

// Edit this array to add or retire asks. Newest/most-urgent first.
const HANDOFFS: Handoff[] = [
  {
    id: "ho-upstash-db",
    title: "Recreate the Upstash Redis DB",
    critical: true,
    what: "The free Upstash DB (apt-starfish-75347.upstash.io) is DEAD - NXDOMAIN globally, it no longer resolves. Create a fresh free database at console.upstash.io, then hand over UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN so I can re-point the secrets.",
    why: "Reviving it brings back BOTH the per-lead demo KV automation AND the portfolio personalization cache in one move. Until then both read against a host that does not exist.",
    link: "https://console.upstash.io",
  },
  {
    id: "ho-youtube-oauth",
    title: "YouTube OAuth for football autopost",
    what: "Run auth_youtube.py locally (it opens a browser, you approve once). It mints YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN; they then get set as football repo secrets.",
    why: "Autopost is wired and green in dry-run; the OAuth token is the only missing piece before clips can actually publish. It needs your Google login, which I cannot do headless.",
  },
  {
    id: "ho-football-data-token",
    title: "football-data.org token",
    what: "Register free at football-data.org/client/register and hand over FOOTBALL_DATA_TOKEN.",
    why: "The fixtures/results source needs an API key on the free tier. Without it the football pipeline has no match data to build clips from.",
    link: "https://www.football-data.org/client/register",
  },
  {
    id: "ho-promote-portfolio",
    title: "Promote portfolio to production",
    what: "Review the latest portfolio preview deploy, then run vercel promote on it. The main loop only ever ships a preview, never prod.",
    why: "Preview changes stay invisible to visitors until promoted. This is the last manual gate so a bad preview can never auto-replace the live site.",
  },
];

const STORE_KEY = "revengine.command-center.handoffboard.v1";

function loadDone(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function HandoffCards() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDone(loadDone());
    setMounted(true);
  }, []);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* private mode / quota - state just won't persist */
      }
      return next;
    });
  }

  const openCount = mounted
    ? HANDOFFS.filter((h) => !done[h.id]).length
    : HANDOFFS.length;

  return (
    <div className="flex flex-col gap-5">
      <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-sm font-bold text-burgundy-bright">
              HANDOFFS
            </h2>
            <p className="font-mono text-[11px] text-cream-dim">
              things only you can do - accounts, OAuth, human review
            </p>
          </div>
          <div className="text-right font-mono">
            <div className="text-sm font-bold tabular-nums text-amber">
              {openCount}
            </div>
            <div className="text-[10px] text-cream-dim">OPEN</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {HANDOFFS.map((h) => {
          const isDone = mounted && done[h.id];
          return (
            <section
              key={h.id}
              className={`hud flex flex-col rounded-lg border bg-panel transition ${
                isDone ? "border-line opacity-60" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {h.critical && !isDone && (
                    <span className="rounded border border-burgundy-bright px-1.5 py-0.5 font-mono text-[10px] font-bold text-burgundy-bright">
                      CRITICAL
                    </span>
                  )}
                  <h3
                    className={`font-mono text-sm font-bold ${
                      isDone ? "text-cream-dim line-through" : "text-cream"
                    }`}
                  >
                    {h.title}
                  </h3>
                </div>
                <button
                  onClick={() => toggle(h.id)}
                  aria-label={isDone ? "mark not done" : "mark done"}
                  className={`shrink-0 font-mono text-sm leading-none ${
                    isDone ? "text-burgundy-bright" : "text-cream-dim"
                  }`}
                >
                  {isDone ? "[x]" : "[ ]"}
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-3 px-4 py-3">
                <div>
                  <span className="font-mono text-[10px] text-amber">
                    WHAT TO DO
                  </span>
                  <p className="mt-0.5 font-sans text-sm leading-relaxed text-cream">
                    {h.what}
                  </p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-indigo">
                    WHY IT MATTERS
                  </span>
                  <p className="mt-0.5 font-sans text-[13px] leading-relaxed text-cream-dim">
                    {h.why}
                  </p>
                </div>
                {h.link && (
                  <a
                    href={h.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-burgundy-bright underline-offset-2 hover:underline"
                  >
                    {h.link.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
