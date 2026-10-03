"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GH_OWNER } from "@/lib/pipelines";
import { decryptDesk, EncBlob, WrongPassphrase } from "./desk/crypto";

// DESK: Harvey's dashboard (Today / Conversations / Sends / Campaigns /
// Activity / Controls), rebranded into the Command Center and fed by
// client-acquisition-pipeline. Harvey itself is not running; its good ideas
// were moved into the pipeline (send gate, kill switch, bounce guard) and this
// is the window onto them.
//
// Data, all from the pipeline repo (PUBLIC) via raw.githubusercontent:
//   runs/desk.json      counts only, readable by anyone
//   runs/desk.enc.json  names, AES-GCM, unlocked with DESK_PASSPHRASE
//   runs/history.jsonl  every run's one-line summary (already public)

const RAW = `https://raw.githubusercontent.com/${GH_OWNER}/client-acquisition-pipeline/master/runs`;
const KEY_STORE = "cc.desk.passphrase.v1";
const VIEW_STORE = "cc.desk.view.v1";

type Stage = "found" | "contacted" | "replied" | "interested" | "handoff" | "booked" | "client" | "dead" | "bounced";
type Tone = "good" | "wait" | "bad" | "idle";

interface Row {
  company: string; niche: string; stage: Stage; category: string; objection: string;
  channels: string[]; followups: number; sent_at: string; replied_at: string;
}
interface Camp { niche: string; sent: number; replied: number; interested: number; booked: number }
interface Blocked { ts: string; company: string; kind: string; reasons: string[] }
interface PublicDesk {
  ts: string; sending: { paused: boolean; by?: string; reason?: string; since?: string };
  funnel: Record<string, number>; sent_14d: number; bounced_14d: number; replied_14d: number;
  waiting: number; gate_blocks: number;
}
interface PrivateDesk extends PublicDesk {
  waiting_on_you: Row[]; conversations: Row[]; sends: Row[]; campaigns: Camp[]; gate_rejections: Blocked[];
}
interface Run { ts: string; mode: string; status: string; summary: string }

// One status vocabulary everywhere (Harvey's rule): a hue always means the same thing.
const STAGE_TONE: Record<Stage, Tone> = {
  found: "idle", contacted: "idle", replied: "wait", interested: "good", handoff: "wait",
  booked: "good", client: "good", dead: "idle", bounced: "bad",
};
const TONE_CLASS: Record<Tone, string> = {
  good: "text-term border-term/40",
  wait: "text-amber border-amber/40",
  bad: "text-burgundy-bright border-burgundy-bright/50",
  idle: "text-cream-dim border-cream-dim/25",
};
const FUNNEL = ["found", "contacted", "replied", "interested", "handoff", "booked", "client"] as const;

const VIEWS = [
  { id: "today", label: "Today" },
  { id: "conversations", label: "Conversations" },
  { id: "sends", label: "Sends" },
  { id: "campaigns", label: "Campaigns" },
  { id: "activity", label: "Activity" },
  { id: "controls", label: "Controls" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return "-";
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 60) return `${Math.max(m, 0)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-block rounded border px-1.5 py-px text-[11px] uppercase tracking-wide ${TONE_CLASS[tone]}`}>{children}</span>;
}

function Locked({ onUnlock }: { onUnlock: (p: string) => void }) {
  const [p, setP] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (p.trim()) onUnlock(p.trim()); }}
      className="rounded border border-cream-dim/20 p-4">
      <p className="text-cream">Names are encrypted.</p>
      <p className="mt-1 text-cream-dim">The pipeline repo is public, so which clinic said what only travels encrypted.
        Paste the passphrase once: <span className="text-term">doppler secrets get DESK_PASSPHRASE --plain</span> (in Code/client-acquisition-pipeline).
        It stays in this browser.</p>
      <div className="mt-3 flex gap-2">
        <input type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="DESK_PASSPHRASE"
          className="flex-1 rounded border border-cream-dim/30 bg-transparent px-2 py-1 text-cream outline-none focus:border-cream" />
        <button className="rounded border border-cream-dim/30 px-3 py-1 text-cream hover:bg-cream-dim/10">unlock</button>
      </div>
    </form>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="text-cream-dim">Nothing yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left tabular-nums">
        <thead className="text-xs uppercase tracking-wide text-cream-dim">
          <tr>{head.map((h) => <th key={h} className="border-b border-cream-dim/20 py-2 pr-4 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-cream-dim/10 align-top">
              {r.map((c, j) => <td key={j} className="py-2 pr-4">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OutreachDesk() {
  const [pub, setPub] = useState<PublicDesk | null>(null);
  const [priv, setPriv] = useState<PrivateDesk | null>(null);
  const [blob, setBlob] = useState<EncBlob | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>("today");

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_STORE) as ViewId | null; if (v && VIEWS.some((x) => x.id === v)) setView(v); } catch { /* storage blocked */ }
    const get = (f: string) => fetch(`${RAW}/${f}`, { cache: "no-store" });
    get("desk.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`desk.json HTTP ${r.status}`))))
      // Defaults: the CDN can serve an older desk.json for ~5 min after a format change.
      .then((x: Partial<PublicDesk>) => setPub({
        ts: x.ts ?? "", sending: x.sending ?? { paused: false }, funnel: x.funnel ?? {},
        sent_14d: x.sent_14d ?? 0, bounced_14d: x.bounced_14d ?? 0, replied_14d: x.replied_14d ?? 0,
        waiting: x.waiting ?? 0, gate_blocks: x.gate_blocks ?? 0,
      })).catch((e: Error) => setErr(e.message));
    get("desk.enc.json").then((r) => (r.ok ? r.json() : null)).then((b) => b && setBlob(b)).catch(() => {});
    get("history.jsonl").then((r) => (r.ok ? r.text() : ""))
      .then((t) => setRuns(t.split("\n").filter(Boolean).slice(-60).reverse()
        .flatMap((l) => { try { return [JSON.parse(l) as Run]; } catch { return []; } })))
      .catch(() => {});
  }, []);

  const unlock = useCallback(async (pass: string) => {
    if (!blob) return;
    try {
      setPriv(await decryptDesk<PrivateDesk>(blob, pass));
      setLockMsg(null);
      try { localStorage.setItem(KEY_STORE, pass); } catch { /* storage blocked: unlocks for this visit only */ }
    } catch (e) {
      setLockMsg(e instanceof WrongPassphrase ? "That passphrase doesn't open it." : (e as Error).message);
      try { localStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
    }
  }, [blob]);

  useEffect(() => {
    if (!blob || priv) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY_STORE); } catch { /* ignore */ }
    if (saved) void unlock(saved);
  }, [blob, priv, unlock]);

  const pick = (v: ViewId) => { setView(v); try { localStorage.setItem(VIEW_STORE, v); } catch { /* ignore */ } };
  const d: PublicDesk | null = priv ?? pub;
  const funnelMax = useMemo(() => Math.max(1, ...(d ? FUNNEL.map((f) => d.funnel?.[f] ?? 0) : [1])), [d]);

  if (err && !d) return <p className="font-mono text-sm text-cream-dim">Desk unavailable ({err}). It appears after the pipeline's next replies run.</p>;
  if (!d) return <p className="font-mono text-sm text-cream-dim">loading the desk...</p>;

  const needKey = (node: React.ReactNode) =>
    priv ? node : blob ? <div className="flex flex-col gap-2"><Locked onUnlock={unlock} />{lockMsg && <p className="text-burgundy-bright">{lockMsg}</p>}</div>
      : <p className="text-cream-dim">No encrypted desk yet: it is written by the next replies run (needs the DESK_PASSPHRASE repo secret).</p>;
  const rate = d.sent_14d ? d.bounced_14d / d.sent_14d : 0;
  const lastRun = runs[0];

  return (
    <div className="font-mono text-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-cream-dim/20 pb-3">
        <div>
          <h1 className="text-cream text-xl tracking-tight">Outreach desk</h1>
          <p className="text-cream-dim">client-acquisition-pipeline · Harvey&apos;s desk, running on your pipeline</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Tag tone={d.sending.paused ? "bad" : "good"}>{d.sending.paused ? "sending paused" : "sending live"}</Tag>
          <span className="text-cream-dim">desk {ago(d.ts)}{lastRun ? ` · last run ${ago(lastRun.ts)}` : ""}</span>
          {priv ? <span className="text-term">unlocked</span> : <span className="text-cream-dim">locked</span>}
        </div>
      </header>

      <nav className="mt-3 flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" onClick={() => pick(v.id)}
            className={`rounded px-2.5 py-1 ${view === v.id ? "bg-burgundy text-cream" : "text-cream-dim hover:text-cream"}`}>
            {v.label}
            {v.id === "today" && d.waiting > 0 && <span className="ml-1.5 text-amber">{d.waiting}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {view === "today" && (
          <div className="grid gap-8 md:grid-cols-[1.6fr_1fr]">
            <section>
              <h2 className="text-cream text-lg">Waiting on you <span className="text-cream-dim">({d.waiting})</span></h2>
              <ul className="mt-3 flex flex-col gap-3">
                {d.sending.paused && (
                  <li className="border-l-2 border-burgundy-bright pl-3">
                    <p className="text-cream">All email sending is paused</p>
                    <p className="text-cream-dim">{priv?.sending.reason ?? "unlock for the reason"} · see Controls</p>
                  </li>
                )}
                {priv ? priv.waiting_on_you.map((h) => (
                  <li key={h.company + h.replied_at} className="border-l-2 border-amber pl-3">
                    <p className="text-cream">{h.company} is ready to talk. The bot has stopped; the thread is yours.</p>
                    <p className="text-cream-dim">{h.niche} · {h.category || "replied"} · {ago(h.replied_at)}</p>
                  </li>
                )) : d.waiting > (d.sending.paused ? 1 : 0) && (
                  <li className="border-l-2 border-amber pl-3 text-cream-dim">
                    {d.waiting - (d.sending.paused ? 1 : 0)} lead(s) handed to you. Unlock to see who.
                  </li>
                )}
                {d.waiting === 0 && <li className="text-cream-dim">Nothing. The pipeline is running on its own.</li>}
              </ul>

              <h2 className="mt-8 text-cream text-lg">Activity</h2>
              <ul className="mt-3 flex flex-col gap-1.5">
                {runs.slice(0, 8).map((r) => (
                  <li key={r.ts + r.mode} className="flex gap-3">
                    <span className="w-16 shrink-0 text-cream-dim">{ago(r.ts)}</span>
                    <Tag tone={r.status === "ok" ? "idle" : "bad"}>{r.mode}</Tag>
                    <span className="text-cream/90">{r.summary}</span>
                  </li>
                ))}
                {!runs.length && <li className="text-cream-dim">No runs recorded yet.</li>}
              </ul>
            </section>

            <aside>
              <h2 className="text-xs uppercase tracking-wide text-cream-dim">Pipeline</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {FUNNEL.map((f) => {
                  const n = d.funnel?.[f] ?? 0;
                  return (
                    <li key={f} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2">
                      <span className="text-cream-dim">{f}</span>
                      <span className="h-1.5 rounded bg-cream-dim/10">
                        <span className={`block h-1.5 rounded ${STAGE_TONE[f] === "good" ? "bg-term" : STAGE_TONE[f] === "wait" ? "bg-amber" : "bg-cream-dim/50"}`}
                          // sqrt scale: with 500+ found, a linear bar makes every later stage invisible
                          style={{ width: `${n ? Math.max(2, Math.sqrt(n / funnelMax) * 100) : 0}%` }} />
                      </span>
                      <span className="text-right tabular-nums text-cream">{n}</span>
                    </li>
                  );
                })}
              </ul>
              <h2 className="mt-6 text-xs uppercase tracking-wide text-cream-dim">Last 14 days</h2>
              {[["sent", `${d.sent_14d}`, false], ["replied", `${d.replied_14d}`, false],
                ["bounced", `${d.bounced_14d} (${(rate * 100).toFixed(1)}%)`, rate >= 0.05],
                ["blocked by gate", `${d.gate_blocks}`, d.gate_blocks > 0]].map(([k, v, w]) => (
                <div key={k as string} className="flex justify-between border-b border-cream-dim/15 py-1.5">
                  <span className="text-cream-dim">{k}</span>
                  <span className={`tabular-nums ${w ? "text-burgundy-bright" : "text-cream"}`}>{v}</span>
                </div>
              ))}
            </aside>
          </div>
        )}

        {view === "conversations" && needKey(
          <Table head={["company", "niche", "stage", "said", "objection", "when"]}
            rows={(priv?.conversations ?? []).map((r) => [
              <span key="c" className="text-cream">{r.company}</span>, r.niche,
              <Tag key="s" tone={STAGE_TONE[r.stage] ?? "idle"}>{r.stage}</Tag>,
              r.category.replace("_", " "), r.objection || "-", ago(r.replied_at)])} />)}

        {view === "sends" && needKey(
          <Table head={["company", "niche", "channels", "follow-ups", "stage", "first sent"]}
            rows={(priv?.sends ?? []).map((r) => [
              <span key="c" className="text-cream">{r.company}</span>, r.niche,
              r.channels.join(", ") || "-", r.followups,
              <Tag key="s" tone={STAGE_TONE[r.stage] ?? "idle"}>{r.stage}</Tag>, ago(r.sent_at)])} />)}

        {view === "campaigns" && needKey(
          <Table head={["niche", "contacted", "replied", "interested", "booked", "reply rate"]}
            rows={(priv?.campaigns ?? []).map((c) => [
              <span key="n" className="text-cream">{c.niche}</span>, c.sent, c.replied, c.interested, c.booked,
              <span key="r" className={c.replied ? "text-term" : "text-cream-dim"}>
                {c.sent ? `${((c.replied / c.sent) * 100).toFixed(0)}%` : "-"}</span>])} />)}

        {view === "activity" && (
          <Table head={["when", "run", "status", "summary"]}
            rows={runs.map((r) => [ago(r.ts), r.mode,
              <Tag key="s" tone={r.status === "ok" ? "good" : "bad"}>{r.status}</Tag>,
              <span key="m" className="text-cream/90">{r.summary}</span>])} />
        )}

        {view === "controls" && (
          <div className="grid max-w-3xl gap-6">
            <section>
              <h2 className="text-cream text-lg">Kill switch</h2>
              <p className="mt-1 text-cream-dim">Stops every cold email, follow-up and reply. Your own handoff alerts still arrive.</p>
              <pre className="mt-2 overflow-x-auto text-term">gh variable set SENDING_PAUSED --body 1 -R {GH_OWNER}/client-acquisition-pipeline</pre>
              <pre className="overflow-x-auto text-term">gh variable set SENDING_PAUSED --body 0 -R {GH_OWNER}/client-acquisition-pipeline</pre>
              <p className="mt-2 text-cream-dim">It also trips by itself at 5% bounces over 14 days (min 20 sends). An auto-pause only clears when runs/sending_paused.json is deleted.</p>
              {d.sending.paused && <p className="mt-2 text-burgundy-bright">Currently paused: {priv?.sending.reason ?? "unlock for the reason"}</p>}
            </section>
            <section>
              <h2 className="text-cream text-lg">Send gate</h2>
              <p className="mt-1 text-cream-dim">Every email is checked in code before it leaves. Blocked: persona banned phrases, invented excuses (confidentiality, privacy, NDA), a client count that isn&apos;t the real one, unfilled {"{{tags}}"}, too long, too many links, HTML.</p>
              <div className="mt-3">{needKey(
                <Table head={["when", "company", "kind", "why"]}
                  rows={(priv?.gate_rejections ?? []).map((g) => [ago(g.ts), g.company, g.kind, g.reasons.join("; ")])} />)}</div>
            </section>
            {priv && (
              <section>
                <button type="button" className="rounded border border-cream-dim/30 px-3 py-1 text-cream-dim hover:text-cream"
                  onClick={() => { try { localStorage.removeItem(KEY_STORE); } catch { /* ignore */ } setPriv(null); }}>
                  lock this browser (forget passphrase)
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
