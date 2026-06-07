// Deadlines rail data layer — hard dates with countdowns, docked on the
// right edge of every tab.
//
// Three writers, one store:
//   - YOU add deadlines in the rail (localStorage).
//   - CLAUDE adds them in code via DEADLINE_SEED (same merge contract as
//     HANDOFF_SEED / PLAN_SEED — your done/edit state survives deploys).
//   - GOOGLE CLASSROOM coursework due dates arrive via the synced
//     public/status/classroom-deadlines.json (written by a scheduled GitHub
//     Action — scripts/classroom_sync.py) and merge in as `source:
//     "classroom"` items. Read via raw.githubusercontent like cc-usage.
//
// Deleting a seeded/synced deadline writes a `removed: true` tombstone so
// the next merge can't resurrect it.

import { MILESTONE_DATE } from "./day";
import { GH_OWNER } from "./pipelines";

export type DeadlineSource = "manual" | "seed" | "classroom";

export interface Deadline {
  id: string;
  title: string;
  /** YYYY-MM-DD the deadline lands on */
  date: string;
  note?: string;
  done: boolean;
  /** generated from code or sync, not hand-added */
  seeded?: boolean;
  source?: DeadlineSource;
  /** tombstone: user deleted a seeded/synced item */
  removed?: boolean;
}

const KEY = "revengine.command-center.deadlines.v1";

export const deadlineStore = {
  load(): Deadline[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as Deadline[]) : [];
    } catch {
      return [];
    }
  },
  save(items: Deadline[]): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(items));
  },
};

// ── CLAUDE'S SIDE: hard external dates (newest concerns first) ───────────────
export const DEADLINE_SEED: Deadline[] = [
  {
    id: "dl:worldcup",
    title: "World Cup kicks off — football autopilot uploading for real",
    date: "2026-06-11",
    note: "YT OAuth is the only step left (see HANDOFFS).",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:clinic-live",
    title: "Clinic pilot LIVE on its real number",
    date: MILESTONE_DATE,
    note: "Day-21 milestone — the single most important mover.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:ev-india",
    title: "Apply Emergent Ventures India (self-set)",
    date: "2026-08-10",
    note: "Rolling grant — trigger is client #1 live ~30 days. Ask = VayuVani toll-free line.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:iris-w1",
    title: "IRIS National Fair submission (window 1)",
    date: "2026-08-15",
    note: "Entry = HEART paper + clinic call data. Window 2 fallback Oct 15.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:spaceapps",
    title: "NASA Space Apps weekend — VayuVani v2",
    date: "2026-10-04",
    note: "Oct 4-5, Delhi local. Registration opens ~Jul 17 — register early.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:iris-w2",
    title: "IRIS submission window 2 (fallback)",
    date: "2026-10-15",
    note: "Only matters if Aug 15 was missed.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:conrad-activation",
    title: "Conrad Challenge activation stage (expected)",
    date: "2026-10-30",
    note: "Mirrors the 2025-26 cycle — confirm when registration opens.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:diamond-concept",
    title: "Diamond Challenge concept due (5PM EST)",
    date: "2027-01-14",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:masason-open",
    title: "Masason Foundation 11th gen expected to open",
    date: "2027-01-15",
    note: "10th gen ran Jan 15 - Mar 3 2026. Apply with paper + revenue in hand.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:rise-close",
    title: "Rise application closes (EXPECTED — confirm)",
    date: "2027-01-31",
    note: "2027 cohort dates unannounced; historically closes late Jan. Check apply.risefortheworld.org from Sept 2026.",
    done: false,
    seeded: true,
    source: "seed",
  },
  {
    id: "dl:blueocean",
    title: "Blue Ocean Competition pitch due",
    date: "2027-02-21",
    done: false,
    seeded: true,
    source: "seed",
  },
];

// ── Classroom sync feed ──────────────────────────────────────────────────────
export const CLASSROOM_RAW_URL = `https://raw.githubusercontent.com/${GH_OWNER}/command-center/main/public/status/classroom-deadlines.json`;

export interface ClassroomFeed {
  ts: string;
  items: { id: string; title: string; course: string; date: string }[];
}

/** Map the synced Classroom feed into Deadline rows (ids prefixed `gc:` so
 *  done/tombstone state keys on the coursework id across refreshes). */
export function classroomToDeadlines(feed: ClassroomFeed): Deadline[] {
  if (!Array.isArray(feed?.items)) return [];
  return feed.items
    .filter((it) => it.id && it.date && it.title)
    .map((it) => ({
      id: `gc:${it.id}`,
      title: it.course ? `${it.course} — ${it.title}` : it.title,
      date: it.date,
      done: false,
      seeded: true,
      source: "classroom" as const,
    }));
}

// ── merge + helpers ──────────────────────────────────────────────────────────
/** Stored state wins by id; tombstones suppress; everything sorted by date. */
export function mergeDeadlines(stored: Deadline[], extra: Deadline[]): Deadline[] {
  const byId = new Map(stored.map((d) => [d.id, d]));
  const out: Deadline[] = [];
  for (const e of extra) {
    const s = byId.get(e.id);
    if (s) {
      byId.delete(e.id);
      // refresh title/date from the source, keep the user's done state
      if (!s.removed) out.push({ ...s, title: e.title, date: e.date, note: e.note ?? s.note });
      continue;
    }
    out.push(e);
  }
  for (const s of byId.values()) if (!s.removed) out.push(s);
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Whole days from todayISO until the deadline (negative = overdue). */
export function daysLeft(dateISO: string, todayISO: string): number {
  const a = new Date(todayISO + "T00:00:00");
  const b = new Date(dateISO + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
