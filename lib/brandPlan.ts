// The @revengineee 30-Day Day-by-Day Plan, transcribed from
// Projects/personal-brand/brand/30-day-plan.md. Day 1 = 2026-05-20.
// Brand-lane to-dos are generated from the row matching today's day number.

export interface BrandDay {
  reel: string; // Format A reel — always present
  carousel?: string; // Format B carousel, when scheduled
  linkedin?: boolean; // true → mirror the carousel as a LinkedIn document PDF
  series?: string; // recurring-series tag
  milestone?: string; // hard event landing on this day
}

const LINKEDIN_NOTE =
  "Mirror the carousel as a LinkedIn document PDF. 4-line hook only; link in the FIRST comment.";

export const BRAND_PLAN: Record<number, BrandDay> = {
  // ---- Week 1 (fully scripted) ----
  1: { reel: "A1 — 8 of 10 calls answered, micro-cuts", carousel: "B1 — regex vs LLM Hindi day-name parsing, with cost numbers", linkedin: true, series: "Series 5" },
  2: { reel: "A1 — the interrupting-caller failure (before fix)", series: "Series 1 setup" },
  3: { reel: "A1 — same call, after the fix", carousel: "B2 — line-item monthly cost of 10 calls/day on the stack", linkedin: true, series: "Series 4" },
  4: { reel: "A1 — autoshop first live run" },
  5: { reel: "A1 — weekly recap, 3 best cuts" },
  6: { reel: "A2 setup — the autoshop cron crashed on day 2", series: "Series 1 setup" },
  7: { reel: "A2 close — the fix + outcome", carousel: "B3 ledger — full postmortem with stack + cost + lesson", linkedin: true, series: "Series 1 close + ledger" },
  // ---- Week 2 ----
  8: { reel: "A1", carousel: "B1 contrarian", linkedin: true, series: "Series 3 — Humans still needed here" },
  9: { reel: "A1" },
  10: { reel: "A1", carousel: "B2", linkedin: true, series: "Series 2 setup — replacing operational friction" },
  11: { reel: "A1" },
  12: { reel: "A1" },
  13: { reel: "A2", carousel: "B3 ledger (Wk2)", linkedin: true, series: "Series 1" },
  14: { reel: "A1" },
  // ---- Week 3 (milestone week) ----
  15: { reel: "A1", carousel: "B2", linkedin: true, series: "Series 4 — Cost to run this AI" },
  16: { reel: "A1" },
  17: { reel: "A1", carousel: "B3 ledger (Wk3)", linkedin: true, series: "Series 1" },
  18: { reel: "A1" },
  19: { reel: "A1" },
  20: { reel: "A1", carousel: "B1 contrarian", linkedin: true, series: "Series 5 — Deterministic > agentic" },
  21: { reel: "A1", milestone: "First pilot clinic deployed today — real number live + 1 real call + sign-off" },
  // ---- Week 4 (real call logs) ----
  22: { reel: "A1 — real clinic call #1", carousel: "B2", linkedin: true, series: "Series 2 — first real workflow replaced" },
  23: { reel: "A1 — real clinic call #2" },
  24: { reel: "A1 — real clinic call #3", carousel: "B3 ledger", linkedin: true, series: "Series 1 — failures from real calls" },
  25: { reel: "A1" },
  26: { reel: "A1" },
  27: { reel: "A1", carousel: "B1 contrarian (clinic-specific data)", linkedin: true, series: "Series 3 — Humans still needed here", milestone: "First YouTube long-form drops (Series 2 deep cut on the deployment)" },
  28: { reel: "A2" },
  29: { reel: "A1", carousel: "B2 (clinic's real cost numbers)", linkedin: true, series: "Series 4" },
  30: { reel: "A1", carousel: "Day-30 retro carousel", linkedin: true },
};

/** Plan row for a day number, or null when outside the 30-day window. */
export function brandDay(day: number): BrandDay | null {
  return BRAND_PLAN[day] ?? null;
}

export { LINKEDIN_NOTE };
