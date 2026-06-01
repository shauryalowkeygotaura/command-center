import { Task } from "./types";

/**
 * Decide what happens to unfinished tasks from previous days when a new
 * day opens. This is the one behavioral knob worth tuning to your own
 * workflow — edit freely.
 *
 * Current policy:
 *   - Hand-added tasks left undone in the past are CARRIED FORWARD to
 *     today (dueDate bumped, flagged `rolledOver` so the UI can mark them).
 *   - Seeded daily-cadence tasks are NOT carried forward — tomorrow's
 *     seed re-creates a fresh copy, so dragging stale ones along would
 *     just duplicate the cadence. Past seeded tasks are left in history.
 *
 * Alternatives you might prefer:
 *   - Carry EVERYTHING (drop the `!t.seeded` guard) for a strict "nothing
 *     escapes" board.
 *   - Carry NOTHING (return tasks unchanged) for a clean slate each day.
 *   - Carry only `leads` (revenue-critical) and let brand items reset.
 */
export function rolloverIncompleteTasks(tasks: Task[], todayISO: string): Task[] {
  return tasks.map((t) => {
    if (!t.done && !t.seeded && t.dueDate < todayISO) {
      return { ...t, dueDate: todayISO, rolledOver: true };
    }
    return t;
  });
}

/** Merge today's seed into existing tasks:
 *  - existing seeded tasks get their title/note refreshed from the current
 *    seed (so plan edits show up) while keeping their done state
 *  - brand-new seeds are appended
 *  - user-added tasks are left untouched */
export function mergeSeed(existing: Task[], seeds: Task[]): Task[] {
  const seedById = new Map(seeds.map((s) => [s.id, s]));
  const refreshed = existing.map((t) => {
    const s = seedById.get(t.id);
    return s ? { ...t, title: s.title, note: s.note } : t;
  });
  const ids = new Set(existing.map((t) => t.id));
  return [...refreshed, ...seeds.filter((s) => !ids.has(s.id))];
}
