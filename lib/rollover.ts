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

/** Add today's seed tasks that aren't already present (idempotent merge). */
export function mergeSeed(existing: Task[], seeds: Task[]): Task[] {
  const ids = new Set(existing.map((t) => t.id));
  return [...existing, ...seeds.filter((s) => !ids.has(s.id))];
}
