"use client";

// STUDIO tab: the local Reel Studio (Code/reel-dump, `python reel_dump.py serve`)
// iframed from http://127.0.0.1:7417 when this machine is running it.
// Chrome treats loopback as potentially trustworthy, so an https page may frame
// it (no mixed-content block); Chrome may ask once to allow local network
// access. If the frame never says hello, we fall back to an "Open studio"
// button. When the server is not reachable (another device, PC off), we show
// a read-only status the processor publishes to public/status/reel-dump.json
// (titles, stages, counts, times; never captions or paths).

import { useCallback, useEffect, useRef, useState } from "react";
import { GH_OWNER } from "@/lib/pipelines";

const STUDIO_ORIGIN = "http://127.0.0.1:7417";
const STUDIO_URL = `${STUDIO_ORIGIN}/`;
const TOKEN_KEY = "cc.reelStudio.token.v1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const RAW_URL = `https://raw.githubusercontent.com/${GH_OWNER}/command-center/main/public/status/reel-dump.json`;
const STAGES = ["transcribe", "cut", "audio", "grade", "captions", "broll", "encode"] as const;

type PubJob = {
  title: string;
  state: string;
  stage: string | null;
  stages: Record<string, string>;
  rerender: boolean;
  started: number | null;
  finished: number | null;
  updated: number | null;
};
type PubStatus = {
  generated: number | null;
  running: boolean;
  jobs: PubJob[];
  counts: { inbox: number; ready: number; approved: number; failed: number };
  last_run: { state?: string; finished: number | null; ok?: number; failed?: number; error: boolean };
};
type Conn = "probing" | "live" | "offline";

async function probe(): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(`${STUDIO_ORIGIN}/api/ping`, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) return false;
    const d = (await r.json()) as { app?: string };
    return d.app === "reel-studio";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function ago(t: number | null): string {
  if (!t) return "never";
  const s = Math.max(0, Math.round(Date.now() / 1000 - t));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function ReelStudio() {
  const [conn, setConn] = useState<Conn>("probing");
  const [framed, setFramed] = useState(false); // the iframe said hello
  const [blocked, setBlocked] = useState(false); // live, but the frame never loaded
  const [status, setStatus] = useState<PubStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const check = useCallback(async () => {
    setChecking(true);
    const ok = await probe();
    setConn(ok ? "live" : "offline");
    setChecking(false);
  }, []);

  // Probe on mount, and every 20s while offline (the server may be starting).
  useEffect(() => {
    const id = setTimeout(check, 0);
    return () => clearTimeout(id);
  }, [check]);
  useEffect(() => {
    if (conn !== "offline") return;
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, [conn, check]);

  // Read-only status when the studio is not reachable.
  useEffect(() => {
    if (conn !== "offline") return;
    let alive = true;
    (async () => {
      for (const url of [RAW_URL, `${BASE}/status/reel-dump.json`]) {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) continue;
          const d = (await r.json()) as PubStatus;
          if (alive) setStatus(d);
          return;
        } catch {
          /* next source */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [conn]);

  // Token handshake with the frame: it says "ready", we hand it the token we
  // hold; when the user unlocks inside the frame, it hands the token to us.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== STUDIO_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      const d = (e.data || {}) as { type?: string; token?: string; hasToken?: boolean };
      if (d.type === "reelstudio:ready") {
        setFramed(true);
        setBlocked(false);
        let tok = "";
        try {
          tok = localStorage.getItem(TOKEN_KEY) || "";
        } catch {
          /* storage blocked */
        }
        if (tok && !d.hasToken) frameRef.current?.contentWindow?.postMessage({ type: "reelstudio:token", token: tok }, STUDIO_ORIGIN);
      } else if (d.type === "reelstudio:token" && typeof d.token === "string" && d.token.length >= 24) {
        try {
          localStorage.setItem(TOKEN_KEY, d.token);
        } catch {
          /* storage blocked */
        }
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // If the frame has not said hello 8s after we mounted it, Chrome blocked it
  // (local network access denied, or an old browser): show the button instead.
  useEffect(() => {
    if (conn !== "live" || framed) return;
    const id = setTimeout(() => setBlocked(true), 8000);
    return () => clearTimeout(id);
  }, [conn, framed]);

  const openBtn = (
    <a
      href={STUDIO_URL}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-11 items-center justify-center rounded-md border border-burgundy-bright bg-burgundy px-4 font-mono text-sm font-bold tracking-wide text-cream transition hover:bg-burgundy-bright"
    >
      Open studio ↗
    </a>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="font-bold tracking-[0.16em] text-cream">REEL STUDIO</span>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
            conn === "live" ? "border-amber/40 text-cream" : "border-line text-cream-dim"
          }`}
          role="status"
        >
          <span className={`h-2 w-2 rounded-full ${conn === "live" ? "bg-amber" : "bg-cream-dim"}`} />
          {conn === "probing" ? "looking for the studio on this PC…" : conn === "live" ? "connected · this PC" : "studio not reachable"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="min-h-11 rounded-md border border-line px-3 text-cream-dim transition hover:border-burgundy-bright hover:text-cream disabled:opacity-50"
        >
          {checking ? "checking…" : "Retry"}
        </button>
        <a
          href={STUDIO_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-cream-dim transition hover:border-burgundy-bright hover:text-cream"
        >
          New tab ↗
        </a>
      </div>

      {conn === "live" && (
        <div className="hud relative overflow-hidden rounded-lg border border-line bg-panel">
          <iframe
            ref={frameRef}
            src={STUDIO_URL}
            title="Reel Studio"
            allow="clipboard-write; local-network-access"
            className="block w-full"
            style={{ height: "calc(100vh - 150px)", minHeight: 640, border: 0, background: "#0a0807" }}
          />
          {blocked && (
            <div className="absolute inset-0 grid place-items-center bg-ink/95 p-6 text-center">
              <div className="max-w-md space-y-3 font-mono text-sm">
                <p className="font-bold text-cream">The studio is running, but this browser would not show it inside the page.</p>
                <p className="text-cream-dim">
                  Chrome asks once to allow this site to reach devices on your local network. Allow it and press Retry, or open the
                  studio in its own tab. It works the same there.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {openBtn}
                  <button
                    type="button"
                    onClick={() => {
                      setBlocked(false);
                      setFramed(false);
                      if (frameRef.current) frameRef.current.src = STUDIO_URL;
                    }}
                    className="min-h-11 rounded-md border border-line px-4 text-cream-dim hover:text-cream"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {conn === "offline" && <Fallback status={status} openBtn={openBtn} />}
      {conn === "probing" && (
        <div className="hud h-40 animate-pulse rounded-lg border border-line bg-panel" aria-hidden />
      )}
    </section>
  );
}

function Fallback({ status, openBtn }: { status: PubStatus | null; openBtn: React.ReactNode }) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="hud rounded-lg border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-xs">
          <span className="font-bold tracking-[0.16em]">LAST KNOWN · READ ONLY</span>
          <span className="text-cream-dim">{status?.generated ? `updated ${ago(status.generated)}` : "no status yet"}</span>
        </div>
        <div className="space-y-2 p-3">
          {!status && <p className="font-mono text-xs text-cream-dim">No published status yet. It appears after the first render.</p>}
          {status?.jobs.length === 0 && <p className="font-mono text-xs text-cream-dim">No recent jobs.</p>}
          {status?.jobs.map((j, i) => (
            <div key={i} className="space-y-2 rounded-md border border-line bg-ink p-3 font-mono">
              <div className="flex flex-wrap items-baseline gap-2 text-xs">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    j.state === "done"
                      ? "bg-cream text-ink"
                      : j.state === "running"
                        ? "bg-burgundy text-cream"
                        : ["failed", "gave_up", "interrupted"].includes(j.state)
                          ? "border border-amber/50 text-amber"
                          : "border border-line text-cream-dim"
                  }`}
                >
                  {j.state === "done" ? "ready" : j.state.replace("_", " ")}
                </span>
                <span className="font-bold text-cream">{j.title}</span>
                {j.rerender && <span className="text-[10px] uppercase tracking-widest text-cream-dim">re-render</span>}
                <span className="ml-auto text-cream-dim">{ago(j.finished || j.updated)}</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {STAGES.map((s) => {
                  const st = j.stages[s] || "pending";
                  return (
                    <div key={s} className="min-w-0 space-y-1">
                      <div
                        className={`h-1.5 rounded-sm ${
                          st === "done"
                            ? "bg-cream-dim"
                            : st === "running"
                              ? "bg-burgundy-bright"
                              : st === "failed"
                                ? "bg-amber"
                                : "bg-panel-2"
                        }`}
                      />
                      <div className="truncate text-[9px] text-cream-dim">{s === "broll" ? "b-roll" : s}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hud space-y-3 rounded-lg border border-line bg-panel p-3 font-mono text-xs">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["ready", status?.counts.ready],
              ["approved", status?.counts.approved],
              ["in inbox", status?.counts.inbox],
              ["failed", status?.counts.failed],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-md border border-line bg-ink p-2">
              <div className="text-[10px] uppercase tracking-widest text-cream-dim">{k}</div>
              <div className="text-lg font-bold tabular-nums text-cream">{v ?? "–"}</div>
            </div>
          ))}
        </div>
        <p className="text-cream-dim">
          Last run {ago(status?.last_run.finished ?? null)}
          {status?.last_run.error ? " · it failed, open the studio to see why" : ""}.
        </p>
        <p className="text-cream-dim">
          The studio lives on Shaurya&apos;s PC (task <span className="text-cream">ReelDump Studio</span> starts it at logon). On that PC,
          open it directly:
        </p>
        {openBtn}
      </div>
    </div>
  );
}
