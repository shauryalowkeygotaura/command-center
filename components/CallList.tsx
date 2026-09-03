"use client";

import { useEffect, useMemo, useState } from "react";
import {
  byRank,
  CallEntry,
  CallOutcome,
  CALL_TARGET,
  callStore,
  outcomeExport,
  outcomeStats,
  OUTCOMES,
  parseNumbers,
} from "@/lib/callList";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Keep cold WhatsApp volume low so the personal number does not get banned.
const WA_DAILY_CAP = 20;

// Matches the pipeline's persona (client-acquisition-pipeline/modules/persona.py):
// school project first, the demo is something he HAS, and the ask is a
// conversation for feedback — not "let me send you a thing". Keep the two in
// step; a prospect who gets this by hand and the pipeline copy by DM should not
// meet two different people. No link: a cold WhatsApp with a URL reads as spam.
const WA_MSG = (label?: string) =>
  `Hi, I'm Shaurya, I'm a student at DPS RKP and I'm doing a school project. I built a voice agent that picks up the clinic phone when nobody can get to it and books the appointment${
    label ? ` — set up for ${label}` : ""
  }. 2 clinics are already using it, and I can set a free demo up on your details. Can I talk to you about it sometime? Just want some feedback on it.`;

// STD (landline) codes for every city the generator targets, minus the trunk 0.
// Mirrors _STD_CODES in scripts/lead_quality.py, which is the source of truth.
//
// "0731-2551733" is an Indore landline; strip the trunk 0 and "7312551733" is
// shaped exactly like a mobile in the 73xx series, so the old rule handed it a
// wa.me link pointing at a stranger. 37 of 395 rows in public/calls were like
// that. Cold WhatsApp to strangers is precisely what gets the personal number
// banned, and losing a [wa] button costs nothing because the number is still
// callable, so this errs toward landline on purpose.
const STD_PREFIXES = [
  "11", "20", "22", "33", "40", "44", "79", "80",
  "141", "161", "172", "253", "261", "265", "422",
  "484", "512", "522", "562", "612", "712", "731", "755",
];

/** Indian mobile -> wa.me digits (91XXXXXXXXXX). Landlines return "". */
function waDigits(num: string): string {
  const d = num.replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return "91" + d;
  if (d.length === 12 && d.startsWith("91") && /^[6-9]/.test(d.slice(2))) return d;
  if (d.length === 11 && d.startsWith("0") && /^[6-9]/.test(d.slice(1))) {
    const rest = d.slice(1);
    // A known STD code here means the trunk 0 was dialling a landline, not
    // prefixing a mobile.
    if (STD_PREFIXES.some((p) => rest.startsWith(p))) return "";
    return "91" + rest;
  }
  return "";
}

function telHref(num: string): string {
  const d = num.replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `tel:+91${d}`;
  if (d.startsWith("91")) return `tel:+${d}`;
  if (d.startsWith("0")) return `tel:+91${d.slice(1)}`;
  return `tel:${d}`;
}

function waHref(entry: CallEntry): string {
  // Derived from the number every time. `entry.whatsapp` can be a value
  // stored before the STD-code fix, i.e. a wa.me link to a stranger, and
  // `stored || derived` would keep preferring it.
  const wa = waDigits(entry.number);
  if (!wa) return "";
  return `https://wa.me/${wa}?text=${encodeURIComponent(WA_MSG(entry.label))}`;
}

/** Canonical key for a phone number: +91 98..., 098..., 98... collapse to one.
 *  Auto-loaded lead ids are built from this and NOT from the date, so when the
 *  daily top-up offers a number again (it now re-offers anything you never
 *  worked, instead of retiring it forever) it merges into the entry you already
 *  have and keeps its checked-off state, rather than returning as fresh work. */
function leadKey(num: string): string {
  let d = (num || "").replace(/\D/g, "");
  // Strip the country code, then the trunk 0, in that order. Both sources can
  // render one clinic differently ("+91 11 3218206" vs "011-3218206"), and
  // without collapsing those the same number would occupy two rows and a tick
  // on one would leave the other looking un-worked.
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d;
}

function autoId(num: string): string {
  return `auto:${leadKey(num)}`;
}

/** Forget a recorded call, snapshot and all.
 *
 *  The snapshot has to go with it. Leaving `tierAtCall` behind means the
 *  next outcome on that row is filed under the tier the row had BEFORE a
 *  re-score, which is the stale-attribution bug the snapshot exists to
 *  prevent — the same one that orphaned 134 rewards in the philosopher
 *  bandit when its hook text changed. */
function clearOutcome(e: CallEntry): CallEntry {
  const next = { ...e };
  delete next.outcome;
  delete next.outcomeAt;
  delete next.tierAtCall;
  delete next.scoreAtCall;
  return next;
}

/** Collapse legacy date-stamped auto ids (`auto:2026-08-17:<num>`) onto the
 *  stable key. Without this, the same clinic could sit in storage several times
 *  over and a tick on one copy would not silence the others. Merging is
 *  called-wins: if any copy was checked off, the survivor is checked off. */
function normalize(list: CallEntry[]): CallEntry[] {
  const byId = new Map<string, CallEntry>();
  for (const e of list) {
    const id = e.id.startsWith("auto:") ? autoId(e.number) : e.id;
    // whatsapp is DERIVED from the number, so it is recomputed on every load
    // rather than trusted. Rows stored before the STD-code fix carry a wa.me
    // link built from a landline, which points at a stranger; merging "keep
    // whatever is already there" would leave those live in the browser
    // forever, since the corrected daily file supplies an empty string and an
    // empty string loses every `||`.
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...e, id, whatsapp: waDigits(e.number) });
      continue;
    }
    byId.set(id, {
      ...prev,
      called: prev.called || e.called,
      dueDate: prev.dueDate > e.dueDate ? prev.dueDate : e.dueDate,
      label: prev.label || e.label,
      // From the SURVIVOR's number: `prev` is the row that is kept and
      // displayed, and leadKey collapses two renderings of one number, so
      // deriving from `e` could attach a link to a number nobody sees.
      whatsapp: waDigits(prev.number),
      area: prev.area || e.area,
      description: prev.description || e.description,
      kind: prev.kind || e.kind,
      tier: prev.tier || e.tier,
      score: prev.score ?? e.score,
      reasons: prev.reasons ?? e.reasons,
      // Recorded evidence, never dropped by a merge.
      outcome: prev.outcome ?? e.outcome,
      outcomeAt: prev.outcomeAt ?? e.outcomeAt,
      tierAtCall: prev.tierAtCall ?? e.tierAtCall,
      scoreAtCall: prev.scoreAtCall ?? e.scoreAtCall,
    });
  }
  return [...byId.values()];
}

type AutoLead = {
  number: string;
  label?: string;
  whatsapp?: string;
  area?: string;
  description?: string;
  kind?: string;
  tier?: string;
  score?: number;
  reasons?: string[];
};

export function CallList({ today }: { today: string }) {
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [raw, setRaw] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loaded = normalize(callStore.load());
    // Roll uncalled numbers from past days forward to today. Anything you
    // ticked keeps its original date, so it drops off the list and stays off.
    const rolled = loaded.map((e) =>
      !e.called && e.dueDate < today ? { ...e, dueDate: today } : e,
    );
    setEntries(rolled);
    setMounted(true);

    // Auto-load today's leads written by the daily top-up (public/calls/<date>.json).
    // Merges by deterministic id so check-off state survives reloads.
    fetch(`${BASE}/calls/${today}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((list: AutoLead[] | null) => {
        if (cancelled || !Array.isArray(list)) return;
        setEntries((prev) => {
          const incoming = new Map(
            list
              .filter((x) => x && x.number)
              .map((x) => [autoId(x.number), x] as const),
          );
          // Backfill first. A row already in localStorage from an earlier load
          // keeps its id, so a pure "add what is new" merge would leave every
          // number you are working today without the description the generator
          // just started writing. Only ever fills blanks — never overwrites a
          // note you typed, and never touches `called`.
          const merged = prev.map((e) => {
            const x = incoming.get(e.id);
            if (!x) return e;
            if (e.description && e.kind && e.tier) return e;
            return {
              ...e,
              description: e.description || x.description,
              kind: e.kind || x.kind,
              tier: e.tier || x.tier,
              score: e.score ?? x.score,
              reasons: e.reasons ?? x.reasons,
              label: e.label || x.label,
              area: e.area || x.area,
              whatsapp: waDigits(e.number),
            };
          });
          const ids = new Set(prev.map((e) => e.id));
          const additions = [...incoming.entries()]
            .filter(([id]) => !ids.has(id))
            .map(([id, x]) => ({
              id,
              number: x.number,
              label: x.label,
              whatsapp: waDigits(x.number),
              area: x.area,
              description: x.description,
              kind: x.kind,
              tier: x.tier,
              score: x.score,
              reasons: x.reasons,
              called: false,
              dueDate: today,
            }));
          setAutoLoaded(additions.length);
          return [...merged, ...additions];
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [today]);

  useEffect(() => {
    if (mounted) callStore.save(entries);
  }, [entries, mounted]);

  // Best first. The day runs out before the list does, so working top-down
  // has to mean working the most promising numbers, not the ones the
  // scraper happened to return first.
  const todays = useMemo(
    () => entries.filter((e) => e.dueDate === today).sort(byRank),
    [entries, today],
  );
  const called = todays.filter((e) => e.called).length;
  const pct = Math.min(100, (called / CALL_TARGET) * 100);
  const messageable = todays.filter((e) => waDigits(e.number)).length;

  // Across ALL days, not just today. One day of calls cannot separate three
  // tiers; the question only answers itself over weeks.
  const stats = useMemo(() => outcomeStats(entries), [entries]);

  /** Record what a call did, freezing the tier as it stands now. */
  function setOutcome(id: string, outcome: CallOutcome | "") {
    setEntries((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        if (!outcome) return clearOutcome(x);
        return {
          ...x,
          called: true,
          outcome,
          outcomeAt: today,
          tierAtCall: x.tierAtCall ?? x.tier,
          scoreAtCall: x.scoreAtCall ?? x.score,
        };
      }),
    );
  }

  /** Un-ticking a row retracts the call, so the outcome goes with it.
   *  Otherwise a row marked `booked` and then un-ticked keeps counting in
   *  the scoreboard while its selector is hidden, so it cannot be cleared. */
  function toggleCalled(id: string) {
    setEntries((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        return x.called
          ? { ...clearOutcome(x), called: false }
          : { ...x, called: true };
      }),
    );
  }

  function copyOutcomes() {
    const rows = outcomeExport(entries);
    if (!rows.length) return;
    const text = JSON.stringify(rows, null, 2);
    const fallback = () => {
      // navigator.clipboard needs a secure context and can reject; this is
      // the path that works on a phone.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(rows.length);
      } catch {
        setCopied(-1);
      }
      document.body.removeChild(ta);
    };
    if (!navigator.clipboard) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(text).then(() => setCopied(rows.length), fallback);
  }

  function addBulk() {
    const parsed = parseNumbers(raw);
    if (!parsed.length) return;
    setEntries((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        id: crypto.randomUUID(),
        number: p.number,
        label: p.label,
        description: p.description,
        whatsapp: waDigits(p.number),
        called: false,
        dueDate: today,
      })),
    ]);
    setRaw("");
    setShowPaste(false);
  }

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          CALL + MESSAGE
        </span>
        <div className="flex items-center gap-3">
          {autoLoaded ? (
            <span className="font-mono text-[10px] text-cream-dim">
              auto-loaded {autoLoaded}
            </span>
          ) : null}
          <span className="font-mono text-xs tabular-nums text-cream-dim">
            {called}/{CALL_TARGET} done
          </span>
          <button
            onClick={() => setShowPaste((s) => !s)}
            className="rounded border border-line px-2 py-0.5 font-mono text-xs text-cream hover:border-burgundy-bright"
          >
            {showPaste ? "close" : "+ paste"}
          </button>
        </div>
      </div>

      {/* daily target meter */}
      <div className="mx-3 mt-3 h-1 overflow-hidden rounded bg-line">
        <div
          className="h-full bg-burgundy-bright transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Is the ranking real? Shown only once there is something to answer
          with — zeros would read as failure rather than as no data. */}
      {stats.length > 0 && (
        <div className="mx-3 mt-2 rounded border border-line bg-ink px-2 py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] text-cream-dim">
              does the ranking hold?
            </span>
            <button
              onClick={copyOutcomes}
              className="font-mono text-[10px] text-cream-dim underline hover:text-burgundy-bright"
            >
              {copied === null
                ? "copy"
                : copied < 0
                  ? "copy failed"
                  : `${copied} copied`}
            </button>
          </div>
          {stats.map((s) => (
            <p key={s.tier} className="font-mono text-[10px] text-cream-dim">
              <span className="text-cream">{s.tier}</span> · {s.called} called ·{" "}
              {s.reached} reached the owner · {s.warm} interested
              {s.dead ? ` · ${s.dead} dead` : ""}
            </p>
          ))}
          <p className="pt-1 font-mono text-[9px] leading-snug text-cream-dim">
            If A does not out-reach B and C over a few weeks, the weights in
            lead_quality.rank() are wrong and should change. Tiers are frozen
            at call time, so re-scoring later cannot rewrite this.
          </p>
        </div>
      )}

      {/* ban-safety advisory: calls are unlimited, cold WhatsApp is not */}
      <p className="px-3 pt-2 font-mono text-[10px] leading-snug text-cream-dim">
        {messageable} messageable · keep cold WhatsApp under ~{WA_DAILY_CAP}/day to
        avoid a ban, put the rest on calls. Tap the number to call, [wa] to message.
      </p>

      {showPaste && (
        <div className="border-b border-line p-3">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder={
              "Paste numbers — one per line.\n9636180333 Marudhar Dental\n+91 96361 80333, Olive Green\nUse | for a note: 9636180333 Marudhar Dental | no website"
            }
            className="w-full resize-y rounded border border-line bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:border-burgundy-bright"
          />
          <button
            onClick={addBulk}
            className="mt-2 rounded bg-burgundy px-3 py-1 font-mono text-xs font-bold text-cream hover:bg-burgundy-bright"
          >
            Add {parseNumbers(raw).length || ""} numbers
          </button>
        </div>
      )}

      {!mounted ? (
        <p className="p-3 font-mono text-xs text-cream-dim">loading…</p>
      ) : todays.length === 0 ? (
        <p className="p-4 font-mono text-xs text-cream-dim">
          No leads yet. They auto-load each day once the top-up publishes them —
          or hit “+ paste” to drop today&apos;s {CALL_TARGET} manually.
        </p>
      ) : (
        <ul className="grid gap-x-4 p-2 sm:grid-cols-2">
          {todays.map((e, i) => {
            const wa = waHref(e);
            const tel = telHref(e.number);
            return (
              <li
                key={e.id}
                className="group flex items-start gap-2 rounded px-2 py-1 hover:bg-panel-2"
              >
                <span
                  title={
                    e.reasons?.length
                      ? e.reasons.join(" · ")
                      : "no ranking data for this row"
                  }
                  className={`w-6 shrink-0 pt-1 text-right font-mono text-[10px] ${
                    e.tier === "A" ? "text-burgundy-bright" : "text-cream-dim"
                  }`}
                >
                  {e.tier ?? i + 1}
                </span>
                <button
                  aria-label={e.called ? "mark not done" : "mark done"}
                  onClick={() => toggleCalled(e.id)}
                  className="pt-1 font-mono text-sm leading-none text-burgundy-bright"
                >
                  {e.called ? "[x]" : "[ ]"}
                </button>
                {/* number + name on one line, the description under it. A bare
                    list of 50 numbers gives you nothing to choose with. */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                {tel ? (
                  <a
                    href={tel}
                    className={`font-mono text-sm tabular-nums hover:text-burgundy-bright ${
                      e.called ? "text-cream-dim line-through" : "text-cream"
                    }`}
                  >
                    {e.number}
                  </a>
                ) : (
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      e.called ? "text-cream-dim line-through" : "text-cream"
                    }`}
                  >
                    {e.number}
                  </span>
                )}
                    {e.label && (
                      <span className="truncate font-sans text-xs text-cream-dim">
                        {e.label}
                      </span>
                    )}
                    {e.kind === "chain" && (
                      <span
                        title="Multi-city group — buys centrally, a cold call rarely reaches the decision"
                        className="shrink-0 rounded border border-line px-1 font-mono text-[9px] uppercase text-cream-dim"
                      >
                        chain
                      </span>
                    )}
                  </div>
                  {e.description && (
                    <span className="truncate font-sans text-[10px] leading-tight text-cream-dim">
                      {e.description}
                    </span>
                  )}
                  {/* Only after the call happened: a selector on every
                      un-dialled row would make 50 rows unreadable. */}
                  {e.called && (
                    <select
                      aria-label="what did the call do"
                      value={e.outcome ?? ""}
                      onChange={(ev) =>
                        setOutcome(e.id, ev.target.value as CallOutcome | "")
                      }
                      className={`mt-0.5 w-fit rounded border border-line bg-ink px-1 py-0.5 font-mono text-[10px] outline-none focus:border-burgundy-bright ${
                        e.outcome ? "text-cream" : "text-cream-dim"
                      }`}
                    >
                      <option value="">outcome?</option>
                      {OUTCOMES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="message on WhatsApp"
                    className="shrink-0 rounded border border-line px-1.5 font-mono text-[10px] text-cream-dim hover:border-burgundy-bright hover:text-cream"
                  >
                    wa
                  </a>
                )}
                <button
                  aria-label="remove"
                  onClick={() =>
                    setEntries((prev) => prev.filter((x) => x.id !== e.id))
                  }
                  className="ml-auto font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
