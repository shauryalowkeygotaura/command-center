"use client";

import { useEffect, useState } from "react";
import { ChecklistItem, mergeChecklistSeed } from "@/lib/lists";

interface Store {
  load: () => ChecklistItem[];
  save: (items: ChecklistItem[]) => void;
}

export function Checklist({
  title,
  store,
  seed,
  placeholder,
  emptyText,
}: {
  title: string;
  store: Store;
  seed?: ChecklistItem[];
  placeholder: string;
  emptyText: string;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const loaded = store.load();
    setItems(seed ? mergeChecklistSeed(loaded, seed) : loaded);
    setMounted(true);
    // store/seed are module-level constants; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mounted) store.save(items);
  }, [items, mounted, store]);

  function add() {
    const text = draft.trim();
    if (!text) return;
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, done: false },
    ]);
    setDraft("");
  }

  const done = items.filter((i) => i.done).length;

  return (
    <section className="mt-6 rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          {title}
        </span>
        <span className="font-mono text-xs tabular-nums text-cream-dim">
          {done}/{items.length} done
        </span>
      </div>

      {!mounted ? (
        <p className="p-3 font-mono text-xs text-cream-dim">loading…</p>
      ) : items.length === 0 ? (
        <p className="p-4 font-mono text-xs text-cream-dim">{emptyText}</p>
      ) : (
        <ul className="space-y-0.5 p-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="group rounded px-2 py-1.5 hover:bg-panel-2"
            >
              <div className="flex items-start gap-2">
                <button
                  aria-label={it.done ? "mark not done" : "mark done"}
                  onClick={() =>
                    setItems((prev) =>
                      prev.map((x) =>
                        x.id === it.id ? { ...x, done: !x.done } : x,
                      ),
                    )
                  }
                  className={`mt-0.5 font-mono text-sm leading-none ${
                    it.done ? "text-burgundy-bright" : "text-cream-dim"
                  }`}
                >
                  {it.done ? "[█]" : "[ ]"}
                </button>
                <span
                  className={`flex-1 font-sans text-sm leading-snug ${
                    it.done ? "text-cream-dim line-through" : "text-cream"
                  }`}
                >
                  {it.text}
                  {it.seeded && (
                    <span className="ml-1.5 align-middle font-mono text-[10px] text-indigo">
                      ⮐ for-you
                    </span>
                  )}
                </span>
                <button
                  aria-label="remove"
                  onClick={() =>
                    setItems((prev) => prev.filter((x) => x.id !== it.id))
                  }
                  className="font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
                >
                  ✕
                </button>
              </div>
              {it.note && !it.done && (
                <p className="ml-7 mt-0.5 font-mono text-[11px] leading-snug text-cream-dim">
                  {it.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="border-t border-line p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
        />
      </form>
    </section>
  );
}
