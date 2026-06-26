"use client";

import { useEffect, useMemo, useState } from "react";
import { CallEntry, CALL_TARGET, callStore, parseNumbers } from "@/lib/callList";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Keep cold WhatsApp volume low so the personal number does not get banned.
const WA_DAILY_CAP = 20;

const WA_MSG = (label?: string) =>
  `Hi, this is Shaurya, a student at DPS R.K. Puram. I set up free AI chatbots and missed-call text-back for clinics${
    label ? ` like ${label}` : ""
  }. Can I send you a quick 1-min demo? clinic-demo-blond.vercel.app`;

/** Indian mobile -> wa.me digits (91XXXXXXXXXX). Landlines return "". */
function waDigits(num: string): string {
  const d = num.replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return "91" + d;
  if (d.length === 12 && d.startsWith("91") && /^[6-9]/.test(d.slice(2))) return d;
  if (d.length === 11 && d.startsWith("0") && /^[6-9]/.test(d.slice(1)))
    return "91" + d.slice(1);
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
  const wa = entry.whatsapp || waDigits(entry.number);
  if (!wa) return "";
  return `https://wa.me/${wa}?text=${encodeURIComponent(WA_MSG(entry.label))}`;
}

type AutoLead = {
  number: string;
  label?: string;
  whatsapp?: string;
  area?: string;
};

export function CallList({ today }: { today: string }) {
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [raw, setRaw] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loaded = callStore.load();
    // Roll uncalled numbers from past days forward to today.
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
          const ids = new Set(prev.map((e) => e.id));
          const additions = list
            .filter((x) => x && x.number)
            .map((x) => ({
              id: `auto:${today}:${x.number}`,
              number: x.number,
              label: x.label,
              whatsapp: x.whatsapp,
              area: x.area,
              called: false,
              dueDate: today,
            }))
            .filter((e) => !ids.has(e.id));
          setAutoLoaded(additions.length);
          return additions.length ? [...prev, ...additions] : prev;
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

  const todays = useMemo(
    () => entries.filter((e) => e.dueDate === today),
    [entries, today],
  );
  const called = todays.filter((e) => e.called).length;
  const pct = Math.min(100, (called / CALL_TARGET) * 100);
  const messageable = todays.filter((e) => e.whatsapp || waDigits(e.number)).length;

  function addBulk() {
    const parsed = parseNumbers(raw);
    if (!parsed.length) return;
    setEntries((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        id: crypto.randomUUID(),
        number: p.number,
        label: p.label,
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
            placeholder={"Paste numbers — one per line.\n9636180333 Marudhar Dental\n+91 96361 80333, Olive Green"}
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
                className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-panel-2"
              >
                <span className="w-6 shrink-0 text-right font-mono text-[10px] text-cream-dim">
                  {i + 1}
                </span>
                <button
                  aria-label={e.called ? "mark not done" : "mark done"}
                  onClick={() =>
                    setEntries((prev) =>
                      prev.map((x) =>
                        x.id === e.id ? { ...x, called: !x.called } : x,
                      ),
                    )
                  }
                  className="font-mono text-sm leading-none text-burgundy-bright"
                >
                  {e.called ? "[x]" : "[ ]"}
                </button>
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
