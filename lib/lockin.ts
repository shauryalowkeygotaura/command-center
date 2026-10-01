// LOCK IN tab: the one list Shaurya opens each day.
//
// Content lives in data/lockin.json (brand days, senior-home calls, clinic
// walk-ins, dated deadlines, standing habits), and every item carries its full
// instructions in `how`, so nothing needs a follow-up question to Claude.
// P1 handoffs from HANDOFF_SEED are folded in too.
//
// Ranking is Angus idea #42 (Angus Sewell's "goal-scored tasks" reel): a small
// model scores each item against the goals in lockin.json, written by
// scripts/focus_score.py to data/lockin-scores.json. Deadlines add urgency on
// top, because a goal score cannot know that something is due today.

import raw from "@/data/lockin.json";
import rawScores from "@/data/lockin-scores.json";
import { HANDOFF_SEED } from "./lists";

export type Track = "brand" | "seniors" | "clinic" | "t20" | "systems" | "handoff";

export interface LockItem {
  key: string; // done/outcome key: per-day items carry the date, persistent ones do not
  scoreKey: string; // key into lockin-scores.json
  track: Track;
  title: string;
  how: string[];
  minutes: number;
  due?: string; // dated items only
  score: number;
  why?: string;
  rank: number; // score + urgency, what the list sorts on
}

interface Scored {
  score: number;
  why?: string;
  goal?: string;
}

export interface LockState {
  done: Record<string, string>; // key -> ISO timestamp it was ticked
  outcome: Record<string, string>;
}

const SCORES: Record<string, Scored> = (rawScores as { scores?: Record<string, Scored> }).scores ?? {};
const DEFAULT_SCORE = 5;
const HOMES_PER_DAY = 3;
// P1 handoffs that already have a richer track here (clinic queue, dated
// T20 items, dated token re-mint); listing them twice would double-count.
const COVERED_HANDOFFS = new Set(["h-dental-targets-tier-a", "h-t20-deadlines", "h-revengine-linkedin-token"]);

export const LOCKIN = raw;
export const LAUNCH_DATE = raw.launchDate;

const STORE_KEY = "revengine.command-center.lockin.v1";

export const lockStore = {
  load(): LockState {
    if (typeof window === "undefined") return { done: {}, outcome: {} };
    try {
      const s = window.localStorage.getItem(STORE_KEY);
      const parsed = s ? (JSON.parse(s) as Partial<LockState>) : {};
      return { done: parsed.done ?? {}, outcome: parsed.outcome ?? {} };
    } catch {
      return { done: {}, outcome: {} };
    }
  },
  save(state: LockState): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* quota / private mode: state just won't persist */
    }
  },
};

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function lockDayNumber(todayISO: string): number {
  return daysBetween(LAUNCH_DATE, todayISO) + 1;
}

function scored(scoreKey: string): Scored {
  return SCORES[scoreKey] ?? { score: DEFAULT_SCORE };
}

const doneOn = (state: LockState, key: string, iso: string) =>
  (state.done[key] ?? "").slice(0, 10) === iso;

/** Persistent queue (homes, clinics, prep steps): keep what was ticked TODAY
 *  visible as done, then top up with the next undone ones, so ticking an item
 *  never makes a new one jump into its place mid-day. */
function queue<T extends { id: string }>(
  all: T[],
  prefix: string,
  perDay: number,
  state: LockState,
  todayISO: string,
): T[] {
  const doneToday = all.filter((x) => doneOn(state, prefix + x.id, todayISO));
  const pending = all.filter((x) => !state.done[prefix + x.id]);
  return [...doneToday, ...pending].slice(0, Math.max(perDay, doneToday.length));
}

export function buildLockIn(todayISO: string, state: LockState, handoffDone: Set<string>): LockItem[] {
  const items: Omit<LockItem, "score" | "why" | "rank">[] = [];
  const day = lockDayNumber(todayISO);

  // ---- BRAND: today's row of the 30-day plan ----
  const bd = raw.brandDays.find((d) => d.day === day);
  if (bd) {
    items.push({
      key: `brand-d${day}`,
      scoreKey: `brand-d${day}`,
      track: "brand",
      title: `Day ${day} reel · ${bd.series}: ${bd.reel}`,
      how: [...bd.how, "", ...raw.reelRecipe],
      minutes: 60,
    });
    (bd.posts ?? []).forEach((p, i) =>
      items.push({
        key: `brand-d${day}-post${i}`,
        scoreKey: `brand-d${day}-post${i}`,
        track: "brand",
        title: p,
        how: ["Same source as today's reel. Write it as a short post: what happened, the one-line mistake or insight, the number, the lesson."],
        minutes: 30,
      }),
    );
    if (bd.linkedin) {
      items.push({
        key: `brand-d${day}-li`,
        scoreKey: "brand-li",
        track: "brand",
        title: "Post today's story on LinkedIn as a PDF carousel",
        how: [
          "Turn today's reel into 5 to 7 slides (one idea per slide, big text). Upload the PDF natively on LinkedIn, not a link.",
          "If there is a link, it goes in the FIRST comment, never the post body.",
        ],
        minutes: 30,
      });
    }
    if ("milestone" in bd && bd.milestone) {
      items.push({
        key: `brand-d${day}-milestone`,
        scoreKey: "milestone",
        track: "brand",
        title: `★ ${bd.milestone}`,
        how: [raw.milestone.label],
        minutes: 0,
      });
    }
  }

  // ---- SENIORS: next prep step + next calls ----
  for (const p of queue(raw.seniorPrep, "", 1, state, todayISO)) {
    items.push({ key: p.id, scoreKey: p.id, track: "seniors", title: p.title, how: p.how, minutes: p.minutes });
  }
  for (const h of queue(raw.seniorHomes, "home:", HOMES_PER_DAY, state, todayISO)) {
    items.push({
      key: `home:${h.id}`,
      scoreKey: "home",
      track: "seniors",
      title: `Call ${h.name} · ${h.area}`,
      how: [
        `PHONE: ${h.phones.join("  /  ")}`,
        ...("note" in h && h.note ? [`NOTE: ${h.note}`] : []),
        "",
        ...raw.seniorCallHow,
      ],
      minutes: 10,
    });
  }

  // ---- CLINIC: one walk-in at a time ----
  for (const c of queue(raw.clinics, "clinic:", 1, state, todayISO)) {
    items.push({
      key: `clinic:${c.id}`,
      scoreKey: "clinic",
      track: "clinic",
      title: `Walk into ${c.name} · ${c.area}`,
      how: [`PHONE: ${c.phones.join("  /  ")}`, `WHY THIS ONE: ${c.note}`, "", ...raw.clinicHow],
      minutes: 45,
    });
  }

  // ---- DATED: due today or overdue and not done ----
  for (const d of raw.dated) {
    const due = d.date <= todayISO;
    if (!due) continue;
    if (state.done[d.id] && !doneOn(state, d.id, todayISO)) continue;
    items.push({ key: d.id, scoreKey: d.id, track: d.track as Track, title: d.title, how: d.how, minutes: d.minutes, due: d.date });
  }

  // ---- P1 handoffs (done state shared with the HANDOFFS tab) ----
  for (const h of HANDOFF_SEED) {
    if (!h.text.startsWith("P1") || COVERED_HANDOFFS.has(h.id)) continue;
    const key = `handoff:${h.id}`;
    if (handoffDone.has(h.id) && !doneOn(state, key, todayISO)) continue;
    items.push({
      key,
      scoreKey: key,
      track: "handoff",
      title: h.text.replace(/^P1 · /, ""),
      how: h.note ? [h.note] : [],
      minutes: 15,
    });
  }

  // ---- STANDING: every day ----
  for (const s of raw.standing) {
    items.push({ key: `${s.id}:${todayISO}`, scoreKey: s.id, track: s.track as Track, title: s.title, how: s.how, minutes: s.minutes });
  }

  return items
    .map((it) => {
      const sc = scored(it.scoreKey);
      let urgency = 0;
      if (it.due) urgency = it.due < todayISO ? 3 : 2;
      return { ...it, score: sc.score, why: sc.why, rank: sc.score + urgency };
    })
    .sort((a, b) => b.rank - a.rank);
}

/** Plain-text recap to paste back to Claude at the end of the day. */
export function buildLockExport(todayISO: string, items: LockItem[], state: LockState): string {
  const lines = [`LOCK IN recap ${todayISO} (Day ${lockDayNumber(todayISO)})`, ""];
  for (const it of items) {
    const mark = state.done[it.key] ? "[x]" : "[ ]";
    const out = state.outcome[it.key]?.trim();
    lines.push(`${mark} ${it.key} | ${it.title}${out ? `\n    outcome: ${out}` : ""}`);
  }
  return lines.join("\n");
}
