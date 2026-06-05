"use client";

import { useEffect, useState } from "react";

// Replicates the "Automated Habit Tracker" Google Sheet (Drive): the same 12
// habits, a habit × day-of-month checkbox grid, Done/Left counters and a
// monthly completion % — plus per-habit streaks the sheet doesn't have.
// localStorage-backed like every other panel: no backend, marks live in this
// browser. The sheet stays the long-term archive; this is the daily surface.

interface Habit {
  id: string;
  name: string;
}

interface HabitState {
  habits: Habit[];
  // marks["2026-06-05"] = ids of habits done that day.
  marks: Record<string, string[]>;
}

const KEY = "revengine.command-center.habits.v1";

// Seeded verbatim from the Drive sheet's DAILY HABITS column.
const SEED_HABITS: Habit[] = [
  { id: "hb-internship", name: "Apply to 1 Internship / Job" },
  { id: "hb-gym", name: "Gym / Sprint" },
  { id: "hb-nofap", name: "Stop Gooning" },
  { id: "hb-read", name: "Read 1 page" },
  { id: "hb-study", name: "Study for 2 hrs" },
  { id: "hb-agency", name: "Automation Agency" },
  { id: "hb-meditate", name: "Meditate for 2 mins" },
  { id: "hb-guitar", name: "Guitar for 10 mins" },
  { id: "hb-collage", name: "Collage app" },
  { id: "hb-journal", name: "Journal a Page" },
  { id: "hb-course", name: "Course" },
  { id: "hb-awaragardi", name: "Awaragardi" },
];

function loadState(): HabitState {
  if (typeof window === "undefined") return { habits: SEED_HABITS, marks: {} };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { habits: SEED_HABITS, marks: {} };
    const parsed = JSON.parse(raw) as HabitState;
    if (!Array.isArray(parsed.habits) || typeof parsed.marks !== "object") {
      return { habits: SEED_HABITS, marks: {} };
    }
    // Drop malformed habit entries so a corrupted store can't crash the render.
    parsed.habits = parsed.habits.filter(
      (h) => h && typeof h.id === "string" && typeof h.name === "string",
    );
    return parsed;
  } catch {
    return { habits: SEED_HABITS, marks: {} };
  }
}

// Local-date key — habit days are wall-clock days, never UTC.
function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function HabitTracker() {
  const [state, setState] = useState<HabitState>({ habits: [], marks: {} });
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setState(loadState());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* storage full/blocked — panel still works in-memory */
      }
    }
  }, [state, mounted]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = now.getDate();
  const todayKey = dayKey(now);

  const isDone = (habitId: string, day: number) =>
    (state.marks[dayKey(new Date(year, month, day))] ?? []).includes(habitId);

  function toggle(habitId: string, day: number) {
    const k = dayKey(new Date(year, month, day));
    setState((prev) => {
      const cur = prev.marks[k] ?? [];
      const next = cur.includes(habitId)
        ? cur.filter((id) => id !== habitId)
        : [...cur, habitId];
      return { ...prev, marks: { ...prev.marks, [k]: next } };
    });
  }

  // Streak: consecutive days marked, counting back from today (today counts
  // only if already marked — an unmarked today doesn't break yesterday's run).
  // Capped at 365: bounds the walk and "365d+" is all anyone needs to know.
  function streak(habitId: string): number {
    let n = 0;
    const d = new Date(now);
    if (!(state.marks[dayKey(d)] ?? []).includes(habitId)) {
      d.setDate(d.getDate() - 1);
    }
    while (n < 365 && (state.marks[dayKey(d)] ?? []).includes(habitId)) {
      n += 1;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function addHabit() {
    const name = draft.trim().slice(0, 80);
    if (!name) return;
    setState((prev) => ({
      ...prev,
      habits: [...prev.habits, { id: crypto.randomUUID(), name }],
    }));
    setDraft("");
  }

  function removeHabit(id: string) {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== id),
    }));
  }

  const monthDone = state.habits.reduce((acc, h) => {
    let c = 0;
    for (let d = 1; d <= daysInMonth; d++) if (isDone(h.id, d)) c += 1;
    return acc + c;
  }, 0);
  const monthTotal = state.habits.length * daysInMonth;
  const todayDone = (state.marks[todayKey] ?? []).filter((id) =>
    state.habits.some((h) => h.id === id),
  ).length;
  const monthName = now.toLocaleString("en", { month: "long" }).toUpperCase();

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          HABITS · {monthName} {year}
        </span>
        <span className="font-mono text-xs tabular-nums text-cream-dim">
          {mounted
            ? `today ${todayDone}/${state.habits.length} · month ${monthDone}/${monthTotal}`
            : "loading…"}
        </span>
      </div>

      {/* month completion meter — same visual language as the board's progress bar */}
      <div className="px-3 pt-2">
        <div className="h-1 w-full overflow-hidden rounded bg-line">
          <div
            className="h-full bg-burgundy-bright transition-all duration-300"
            style={{
              width: monthTotal ? `${(monthDone / monthTotal) * 100}%` : "0%",
            }}
          />
        </div>
      </div>

      {!mounted ? (
        <p className="p-3 font-mono text-xs text-cream-dim">loading…</p>
      ) : (
        <div className="overflow-x-auto p-2">
          <table className="border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-panel pr-2 text-left font-mono text-[10px] font-normal text-cream-dim">
                  habit
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <th
                    key={d}
                    className={`w-5 min-w-5 text-center font-mono text-[9px] font-normal tabular-nums ${
                      d === todayDay ? "text-burgundy-bright" : "text-cream-dim/60"
                    }`}
                  >
                    {d}
                  </th>
                ))}
                <th className="pl-2 text-right font-mono text-[10px] font-normal text-cream-dim">
                  streak
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.habits.map((h) => {
                const run = streak(h.id);
                return (
                <tr key={h.id} className="group">
                  <td className="sticky left-0 z-10 max-w-44 truncate bg-panel pr-2 font-sans text-xs leading-tight text-cream">
                    {h.name}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                    (d) => {
                      const done = isDone(h.id, d);
                      return (
                        <td key={d} className="p-0">
                          <button
                            aria-label={`${h.name} day ${d}: ${done ? "done" : "not done"}`}
                            onClick={() => toggle(h.id, d)}
                            className={`block h-4.5 w-4.5 rounded-sm border transition ${
                              done
                                ? "border-burgundy-bright bg-burgundy-bright"
                                : d === todayDay
                                  ? "border-burgundy-bright/60 bg-ink hover:bg-burgundy-bright/30"
                                  : "border-line bg-ink hover:bg-burgundy-bright/20"
                            }`}
                          />
                        </td>
                      );
                    },
                  )}
                  <td className="pl-2 text-right font-mono text-[11px] tabular-nums text-cream-dim">
                    {run > 0 ? `${run}d` : "—"}
                  </td>
                  <td className="pl-1">
                    <button
                      aria-label={`remove ${h.name}`}
                      onClick={() => removeHabit(h.id)}
                      className="font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addHabit();
        }}
        className="border-t border-line p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ add a habit"
          className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
        />
      </form>
    </section>
  );
}
