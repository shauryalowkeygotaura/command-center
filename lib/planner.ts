// Planner data layer: time blocks with three lenses (intraday / day / month).
//
// Two writers, one store:
//   - YOU add/edit blocks in the UI (saved to localStorage, like every store).
//   - CLAUDE adds blocks in code via DAY_TEMPLATE (recurring baseline) and
//     PLAN_SEED (dated one-offs). Code blocks have deterministic ids and merge
//     into the stored state the same way HANDOFF_SEED does — your done/edit
//     state always survives a deploy.
//
// Deleting a code-seeded block writes a `removed: true` tombstone instead of
// dropping the row, otherwise the merge would resurrect it on next load.

export type BlockKind = "deep" | "school" | "calls" | "content" | "ops" | "life";

export interface PlanBlock {
  id: string;
  /** YYYY-MM-DD the block belongs to */
  date: string;
  /** "HH:MM" 24h start — undefined = untimed (day-level intent, no slot) */
  start?: string;
  end?: string;
  title: string;
  kind: BlockKind;
  done: boolean;
  note?: string;
  /** true = generated from DAY_TEMPLATE / PLAN_SEED, not hand-added */
  seeded?: boolean;
  /** tombstone: user deleted a seeded block; suppress it on re-merge */
  removed?: boolean;
}

export const KIND_META: Record<BlockKind, { label: string; color: string }> = {
  deep: { label: "DEEP", color: "var(--color-indigo)" },
  school: { label: "SCHOOL", color: "var(--color-cream-dim)" },
  calls: { label: "CALLS", color: "var(--color-amber)" },
  content: { label: "CONTENT", color: "var(--color-burgundy-bright)" },
  ops: { label: "OPS", color: "var(--color-term)" },
  life: { label: "LIFE", color: "var(--color-cream)" },
};

export const KINDS = Object.keys(KIND_META) as BlockKind[];

/** KIND_META lookup that survives stale/foreign localStorage rows whose
 *  `kind` no longer exists in the enum. */
export function kindMeta(kind: BlockKind): { label: string; color: string } {
  return KIND_META[kind] ?? KIND_META.life;
}

// ── storage (same Store pattern as everything else on the board) ────────────
const KEY = "revengine.command-center.planner.v1";

export const planStore = {
  load(): PlanBlock[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as PlanBlock[]) : [];
    } catch {
      return [];
    }
  },
  save(blocks: PlanBlock[]): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(blocks));
  },
};

// ── time helpers ─────────────────────────────────────────────────────────────
/** "HH:MM" → minutes since midnight (NaN-safe: bad input → 0). */
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── CLAUDE'S SIDE: recurring baseline + dated one-offs ───────────────────────
// DAY_TEMPLATE renders on every matching weekday. `days` uses JS getDay()
// (0 = Sun … 6 = Sat); omit it for every day.
//
// ⚠ TIMINGS ARE MY BEST GUESS — edit the rows below to your real timetable
// (or tell me the real slots and I'll set them). See the HANDOFFS tab.
interface TemplateBlock {
  key: string;
  start: string;
  end: string;
  title: string;
  kind: BlockKind;
  days?: number[];
  note?: string;
}

export const DAY_TEMPLATE: TemplateBlock[] = [
  { key: "school", start: "08:00", end: "14:30", title: "School", kind: "school", days: [1, 2, 3, 4, 5] },
  { key: "calls", start: "16:00", end: "17:00", title: "Call list — clinics (target 50)", kind: "calls", note: "Numbers live on the CALL LIST tab." },
  { key: "deep", start: "17:30", end: "19:30", title: "Deep work — build / pipelines", kind: "deep" },
  { key: "content", start: "20:30", end: "21:30", title: "Reel + posts — today's brand-plan row", kind: "content" },
  { key: "plan", start: "22:30", end: "22:45", title: "Plan tomorrow (set blocks for D+1)", kind: "ops" },
];

// Dated one-offs I schedule for you. Deterministic ids → safe re-merge.
export const PLAN_SEED: PlanBlock[] = [
  {
    id: "seed:2026-06-20:golive",
    date: "2026-06-20",
    start: "11:00",
    end: "13:00",
    title: "🎯 Clinic go-live — agent answering the real number",
    kind: "ops",
    done: false,
    seeded: true,
    note: "Day-21 milestone. Capture the first real call for the reel.",
  },
  {
    id: "seed:2026-06-26:yt",
    date: "2026-06-26",
    start: "17:00",
    end: "19:30",
    title: "🎥 Record + cut first YouTube long-form (clinic walkthrough)",
    kind: "content",
    done: false,
    seeded: true,
  },
];

// ── merge: stored state wins, code fills the gaps ────────────────────────────
function sortBlocks(a: PlanBlock, b: PlanBlock): number {
  if (a.start && b.start) return toMin(a.start) - toMin(b.start);
  if (a.start) return -1; // timed before untimed
  if (b.start) return 1;
  return a.title.localeCompare(b.title);
}

/** Display list for one date: stored blocks (tombstones filtered) + template
 *  and seed defaults whose ids aren't stored yet. Sorted by start time. */
export function blocksForDate(all: PlanBlock[], dateISO: string): PlanBlock[] {
  const byId = new Map(
    all.filter((b) => b.date === dateISO).map((b) => [b.id, b]),
  );
  const out: PlanBlock[] = [];
  const dow = new Date(dateISO + "T00:00:00").getDay();

  for (const t of DAY_TEMPLATE) {
    if (t.days && !t.days.includes(dow)) continue;
    const id = `tpl:${dateISO}:${t.key}`;
    const stored = byId.get(id);
    if (stored) {
      byId.delete(id);
      if (!stored.removed) out.push(stored);
      continue;
    }
    out.push({
      id,
      date: dateISO,
      start: t.start,
      end: t.end,
      title: t.title,
      kind: t.kind,
      note: t.note,
      done: false,
      seeded: true,
    });
  }

  for (const s of PLAN_SEED) {
    if (s.date !== dateISO) continue;
    const stored = byId.get(s.id);
    if (stored) {
      byId.delete(s.id);
      if (!stored.removed) out.push(stored);
      continue;
    }
    out.push(s);
  }

  for (const b of byId.values()) if (!b.removed) out.push(b);
  return out.sort(sortBlocks);
}

/** Month-view density: hand-added + dated-seed blocks only. The recurring
 *  template is baseline routine — counting it would light up every day. */
export function plannedCount(all: PlanBlock[], dateISO: string): number {
  const stored = all.filter(
    (b) => b.date === dateISO && !b.removed && !b.id.startsWith("tpl:"),
  );
  const seedExtra = PLAN_SEED.filter(
    (s) => s.date === dateISO && !all.some((b) => b.id === s.id),
  );
  return stored.length + seedExtra.length;
}

/** True for a real wall-clock time: 00:00–23:59. */
export function validTime(h: number, m: number): boolean {
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** Parse "16:30-17:15 follow up jaipur" → {start, end, title}. Accepts
 *  "1630-1715", "16.30 - 17.15" too. No (or invalid) time prefix → the
 *  whole line becomes an untimed block. */
export function parseQuickAdd(raw: string): {
  start?: string;
  end?: string;
  title: string;
} {
  const match = raw.match(
    /^(\d{1,2})[:.]?(\d{2})\s*[-–]\s*(\d{1,2})[:.]?(\d{2})\s+(.+)$/,
  );
  if (!match) return { title: raw.trim() };
  const [startH, startM, endH, endM] = match.slice(1, 5).map(Number);
  if (!validTime(startH, startM) || !validTime(endH, endM)) {
    return { title: raw.trim() };
  }
  const hhmm = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return {
    start: hhmm(startH, startM),
    end: hhmm(endH, endM),
    title: match[5].trim(),
  };
}
