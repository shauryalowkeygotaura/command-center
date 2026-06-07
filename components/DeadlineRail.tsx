"use client";

// DEADLINES — a slide-out rail docked on the right edge of every tab.
// Counts down to hard dates from three sources: hand-added, DEADLINE_SEED
// (Claude), and Google Classroom coursework (synced JSON, see
// lib/deadlines.ts). Urgency chips: ≤2d burgundy, ≤7d amber.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Deadline,
  DEADLINE_SEED,
  CLASSROOM_RAW_URL,
  ClassroomFeed,
  classroomToDeadlines,
  deadlineStore,
  mergeDeadlines,
  daysLeft,
} from "@/lib/deadlines";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const OPEN_KEY = "cc.deadlines.open.v1";

export function DeadlineRail({ today }: { today: string }) {
  const [stored, setStored] = useState<Deadline[]>([]);
  const [classroom, setClassroom] = useState<Deadline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setStored(deadlineStore.load());
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {
      /* blocked storage — rail just starts collapsed */
    }
    setLoaded(true);

    // Classroom feed: raw GitHub first (always current), baked file as
    // fallback. 404 just means the sync hasn't run yet — rail works without.
    (async () => {
      for (const url of [CLASSROOM_RAW_URL, `${BASE}/status/classroom-deadlines.json`]) {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) continue;
          const feed = (await r.json()) as ClassroomFeed;
          if (alive.current) setClassroom(classroomToDeadlines(feed));
          return;
        } catch {
          /* try next source */
        }
      }
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (loaded) deadlineStore.save(stored);
  }, [stored, loaded]);

  function setOpenPersist(v: boolean) {
    setOpen(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* private mode */
    }
  }

  function upsert(d: Deadline) {
    setStored((prev) =>
      prev.some((x) => x.id === d.id)
        ? prev.map((x) => (x.id === d.id ? d : x))
        : [...prev, d],
    );
  }
  function toggle(d: Deadline) {
    upsert({ ...d, done: !d.done });
  }
  function remove(d: Deadline) {
    if (d.seeded) upsert({ ...d, removed: true }); // tombstone
    else setStored((prev) => prev.filter((x) => x.id !== d.id));
  }
  function add(date: string, title: string) {
    const clean = title.trim();
    if (!clean || !date) return;
    upsert({
      id: crypto.randomUUID(),
      title: clean,
      date,
      done: false,
      source: "manual",
    });
  }

  const items = useMemo(
    () => mergeDeadlines(stored, [...DEADLINE_SEED, ...classroom]),
    [stored, classroom],
  );
  const urgent = items.filter((d) => !d.done && daysLeft(d.date, today) <= 7).length;

  if (!loaded) return null;

  return (
    <>
      {/* collapsed handle — always visible on the right edge */}
      {!open && (
        <button
          onClick={() => setOpenPersist(true)}
          aria-label="open deadlines"
          className="fixed right-0 top-1/3 z-30 flex flex-col items-center gap-1 rounded-l border border-r-0 border-line bg-panel px-1 py-2.5 font-mono text-[9px] tracking-widest text-cream-dim transition hover:text-cream"
          style={
            urgent > 0
              ? { animation: "cc-pulse 2.4s ease-in-out infinite" }
              : undefined
          }
        >
          <span style={{ writingMode: "vertical-rl" }}>DEADLINES</span>
          {urgent > 0 && (
            <span className="rounded-sm bg-burgundy-bright px-1 font-bold text-cream">
              {urgent}
            </span>
          )}
        </button>
      )}

      {/* slide-out panel */}
      {open && (
        <aside
          className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[90vw] flex-col border-l border-line bg-panel shadow-2xl"
          style={{ animation: "cc-slide .2s ease-out" }}
        >
          <header className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-sm font-bold text-burgundy-bright">
            <span>
              DEADLINES{" "}
              <span className="text-cream-dim">
                {items.filter((d) => !d.done).length} open
              </span>
            </span>
            <button
              onClick={() => setOpenPersist(false)}
              aria-label="close deadlines"
              className="font-mono text-xs text-cream-dim hover:text-cream"
            >
              ✕
            </button>
          </header>

          <ul className="flex-1 space-y-1 overflow-y-auto p-2">
            {items.length === 0 && (
              <li className="px-2 py-3 font-mono text-xs text-cream-dim">
                no deadlines — add one below
              </li>
            )}
            {items.map((d) => (
              <DeadlineRow
                key={d.id}
                d={d}
                today={today}
                onToggle={toggle}
                onRemove={remove}
              />
            ))}
          </ul>

          <AddDeadlineForm onAdd={add} today={today} />

          <p className="border-t border-line px-3 py-1.5 font-mono text-[9px] text-cream-dim">
            sources: you · claude (seed) · google classroom (auto-sync)
          </p>
        </aside>
      )}
    </>
  );
}

function DeadlineRow({
  d,
  today,
  onToggle,
  onRemove,
}: {
  d: Deadline;
  today: string;
  onToggle: (d: Deadline) => void;
  onRemove: (d: Deadline) => void;
}) {
  const left = daysLeft(d.date, today);
  const chip =
    left < 0
      ? { text: `${-left}d over`, cls: "bg-burgundy-bright text-cream" }
      : left === 0
        ? { text: "TODAY", cls: "bg-burgundy-bright text-cream" }
        : left <= 2
          ? { text: `${left}d`, cls: "bg-burgundy-bright text-cream" }
          : left <= 7
            ? { text: `${left}d`, cls: "bg-amber text-ink" }
            : { text: `${left}d`, cls: "border border-line text-cream-dim" };

  return (
    <li
      className={`group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-panel-2 ${
        d.done ? "opacity-45" : ""
      }`}
    >
      <button
        aria-label={d.done ? "mark not done" : "mark done"}
        onClick={() => onToggle(d)}
        className={`mt-0.5 font-mono text-sm leading-none ${
          d.done ? "text-burgundy-bright" : "text-cream-dim"
        }`}
      >
        {d.done ? "[x]" : "[ ]"}
      </button>
      <span
        className={`min-w-12 rounded px-1 py-0.5 text-center font-mono text-[10px] font-bold tabular-nums ${chip.cls}`}
      >
        {chip.text}
      </span>
      <span className="flex-1">
        <span
          className={`block font-sans text-xs leading-snug ${
            d.done ? "text-cream-dim line-through" : "text-cream"
          }`}
        >
          {d.source === "classroom" && (
            <span className="mr-1 font-mono text-[9px] text-indigo">GC</span>
          )}
          {d.title}
        </span>
        <span className="font-mono text-[9px] text-cream-dim">
          {d.date}
          {d.note ? ` · ${d.note}` : ""}
        </span>
      </span>
      <button
        aria-label="delete deadline"
        onClick={() => onRemove(d)}
        className="font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
      >
        ✕
      </button>
    </li>
  );
}

function AddDeadlineForm({
  onAdd,
  today,
}: {
  onAdd: (date: string, title: string) => void;
  today: string;
}) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(date, title);
        setTitle("");
        ref.current?.focus();
      }}
      className="flex gap-1.5 border-t border-line p-2"
    >
      <input
        type="date"
        value={date}
        min={today}
        onChange={(e) => setDate(e.target.value)}
        aria-label="deadline date"
        className="rounded bg-ink px-1.5 py-1 font-mono text-[10px] text-cream outline-none [color-scheme:dark] focus:ring-1 focus:ring-burgundy-bright"
      />
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="+ deadline"
        aria-label="deadline title"
        className="min-w-0 flex-1 rounded bg-ink px-2 py-1 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
      />
    </form>
  );
}
