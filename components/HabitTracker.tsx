"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SyncedHabitState,
  loadSyncToken,
  saveSyncToken,
  clearSync,
  findOrCreateGist,
  pullRemote,
  pushRemote,
  mergeStates,
} from "@/lib/habitsSync";

// Replicates the "Automated Habit Tracker" Google Sheet (Drive): the same 12
// habits, a habit × day-of-month checkbox grid, Done/Left counters and a
// monthly completion % — plus per-habit streaks the sheet doesn't have.
// localStorage-first like every other panel; optional cross-device sync via a
// secret GitHub Gist (free, no backend) — paste a gist-scoped PAT once per
// device. The sheet stays the long-term archive; this is the daily surface.

interface Habit {
  id: string;
  name: string;
}

type HabitState = SyncedHabitState;

type SyncStatus = "off" | "syncing" | "synced" | "error";

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
  const [tokenDraft, setTokenDraft] = useState("");
  const [sync, setSync] = useState<SyncStatus>("off");
  const tokenRef = useRef("");
  const gistRef = useRef("");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the debounced push: skip while the initial pull-merge is in flight
  // so we never overwrite the gist with a not-yet-merged local state.
  const readyToPush = useRef(false);

  // Pull remote, merge with whatever is local, adopt + push the result.
  const startSync = useCallback(async (token: string, local: HabitState) => {
    setSync("syncing");
    try {
      const gistId = await findOrCreateGist(token);
      tokenRef.current = token;
      gistRef.current = gistId;
      const remote = await pullRemote(token, gistId);
      const merged = remote ? mergeStates(local, remote) : local;
      setState(merged);
      await pushRemote(token, gistId, merged);
      readyToPush.current = true;
      setSync("synced");
    } catch {
      readyToPush.current = false;
      setSync("error");
    }
  }, []);

  useEffect(() => {
    const local = loadState();
    setState(local);
    setMounted(true);
    const token = loadSyncToken();
    if (token) void startSync(token, local);
  }, [startSync]);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full/blocked — panel still works in-memory */
    }
    // Debounced cloud push: batch rapid toggles into one gist write.
    if (readyToPush.current && tokenRef.current && gistRef.current) {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        setSync("syncing");
        pushRemote(tokenRef.current, gistRef.current, state)
          .then(() => setSync("synced"))
          .catch(() => setSync("error"));
      }, 2500);
    }
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [state, mounted]);

  function connectSync() {
    const token = tokenDraft.trim();
    if (!token) return;
    saveSyncToken(token);
    setTokenDraft("");
    void startSync(token, state);
  }

  function disconnectSync() {
    clearSync();
    tokenRef.current = "";
    gistRef.current = "";
    readyToPush.current = false;
    setSync("off");
  }

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
      return {
        ...prev,
        marks: { ...prev.marks, [k]: next },
        // Day-level stamp drives the cross-device merge (newer day wins).
        stamps: { ...prev.stamps, [k]: new Date().toISOString() },
      };
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
      habitsStamp: new Date().toISOString(),
    }));
    setDraft("");
  }

  function removeHabit(id: string) {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== id),
      habitsStamp: new Date().toISOString(),
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
        <div className="flex items-center gap-3">
          {mounted && sync !== "off" && (
            <button
              onClick={disconnectSync}
              title="Synced to a secret GitHub Gist — click to disconnect this device"
              className={`font-mono text-[10px] uppercase tracking-wide transition hover:text-burgundy-bright ${
                sync === "synced"
                  ? "text-indigo"
                  : sync === "syncing"
                    ? "text-cream-dim"
                    : "text-amber"
              }`}
            >
              {sync === "synced" ? "cloud ✓" : sync === "syncing" ? "syncing…" : "sync error"}
            </button>
          )}
          <span className="font-mono text-xs tabular-nums text-cream-dim">
            {mounted
              ? `today ${todayDone}/${state.habits.length} · month ${monthDone}/${monthTotal}`
              : "loading…"}
          </span>
        </div>
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

      {/* Daily completion graph: one bar per day, height = share of habits
          done that day. Today burns bright; past days fade; future days are
          ghost stubs so the month's runway stays visible. */}
      {mounted && state.habits.length > 0 && (
        <div className="px-3 pt-2">
          <div className="flex h-14 items-end gap-[3px]">
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const done = state.habits.filter((h) => isDone(h.id, d)).length;
              const pct = done / state.habits.length;
              return (
                <div
                  key={d}
                  title={`${monthName.slice(0, 3)} ${d}: ${done}/${state.habits.length}`}
                  className={`flex-1 rounded-t-sm transition-all duration-300 ${
                    d === todayDay
                      ? "bg-burgundy-bright"
                      : done > 0
                        ? "bg-burgundy-bright/45"
                        : d < todayDay
                          ? "bg-line"
                          : "bg-line/40"
                  }`}
                  style={{ height: `${Math.max(6, pct * 100)}%` }}
                />
              );
            })}
          </div>
          <div className="mt-0.5 flex justify-between font-mono text-[9px] text-cream-dim/60">
            <span>1</span>
            <span className="text-burgundy-bright">{todayDay}</span>
            <span>{daysInMonth}</span>
          </div>
        </div>
      )}

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

      {/* Cross-device sync: paste a gist-scoped GitHub PAT once per device.
          Same trust model as the KEYS panel: localStorage only, never deployed. */}
      {mounted && sync === "off" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            connectSync();
          }}
          className="flex items-center gap-2 border-t border-line p-2"
        >
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            type="password"
            placeholder="sync across devices: paste a GitHub token (classic, gist scope only)"
            className="flex-1 rounded bg-ink px-2 py-1.5 font-mono text-[11px] text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
          />
          <button
            type="submit"
            className="rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-cream-dim transition hover:border-burgundy-bright hover:text-cream"
          >
            connect
          </button>
        </form>
      )}
    </section>
  );
}
