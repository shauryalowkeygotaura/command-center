"use client";

import { useEffect, useMemo, useState } from "react";
import { CallEntry, CALL_TARGET, callStore, parseNumbers } from "@/lib/callList";

export function CallList({ today }: { today: string }) {
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [raw, setRaw] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  useEffect(() => {
    const loaded = callStore.load();
    // Roll uncalled numbers from past days forward to today.
    const rolled = loaded.map((e) =>
      !e.called && e.dueDate < today ? { ...e, dueDate: today } : e,
    );
    setEntries(rolled);
    setMounted(true);
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

  function addBulk() {
    const parsed = parseNumbers(raw);
    if (!parsed.length) return;
    setEntries((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        id: crypto.randomUUID(),
        number: p.number,
        label: p.label,
        called: false,
        dueDate: today,
      })),
    ]);
    setRaw("");
    setShowPaste(false);
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          CALL LIST
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-cream-dim">
            {called}/{CALL_TARGET} called
          </span>
          <button
            onClick={() => setShowPaste((s) => !s)}
            className="rounded border border-line px-2 py-0.5 font-mono text-xs text-cream hover:border-burgundy-bright"
          >
            {showPaste ? "close" : "+ paste numbers"}
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

      {showPaste && (
        <div className="border-b border-line p-3">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder={"Paste today's numbers — one per line.\n9636180333 Marudhar Dental\n+91 96361 80333, Olive Green"}
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
          No numbers yet. Hit “+ paste numbers” and drop today&apos;s {CALL_TARGET}{" "}
          from your sheet / pipeline.
        </p>
      ) : (
        <ul className="grid gap-x-4 p-2 sm:grid-cols-2">
          {todays.map((e, i) => (
            <li
              key={e.id}
              className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-panel-2"
            >
              <span className="w-6 shrink-0 text-right font-mono text-[10px] text-cream-dim">
                {i + 1}
              </span>
              <button
                aria-label={e.called ? "mark not called" : "mark called"}
                onClick={() =>
                  setEntries((prev) =>
                    prev.map((x) => (x.id === e.id ? { ...x, called: !x.called } : x)),
                  )
                }
                className="font-mono text-sm leading-none text-burgundy-bright"
              >
                {e.called ? "[x]" : "[ ]"}
              </button>
              <span
                className={`font-mono text-sm tabular-nums ${
                  e.called ? "text-cream-dim line-through" : "text-cream"
                }`}
              >
                {e.number}
              </span>
              {e.label && (
                <span className="truncate font-sans text-xs text-cream-dim">
                  {e.label}
                </span>
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
          ))}
        </ul>
      )}
    </section>
  );
}
