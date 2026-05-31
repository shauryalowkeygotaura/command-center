// The @revengineee 30-Day Plan (plain version), transcribed from
// Projects/personal-brand/brand/30-day-plan.md. Day 1 = 2026-05-31.
// Brand-lane to-dos are generated from the row matching today's day number.
// Every day also gets a 🛋️ lazy backup + engagement task (added in seed.ts).

export interface BrandDay {
  label: string; // "MM-DD Day" for reference
  reel: string; // the day's planned reel (always present)
  posts?: string[]; // extra posts/tasks beyond the reel
  linkedin?: boolean; // true → also post today's slide as a LinkedIn PDF
  milestone?: string; // hard event landing on this day
}

export const BRAND_PLAN: Record<number, BrandDay> = {
  // ---- Week 1 — Introduce yourself ----
  1: { label: "05-31 Sun", reel: "“8 of 10 test calls answered” — fast cuts of the AI receptionist picking up", posts: ["Breakdown post: simple rules vs AI for reading Hindi day-names, with cost numbers"], linkedin: true },
  2: { label: "06-01 Mon", reel: "the call where the AI got interrupted and failed (the “before” clip)" },
  3: { label: "06-02 Tue", reel: "the same call working after the fix", posts: ["Receipts post: what 10 calls/day actually costs"], linkedin: true },
  4: { label: "06-03 Wed", reel: "autoshop's first live run — terminal turning into a live Gumroad page" },
  5: { label: "06-04 Thu", reel: "week recap — your 3 best clips cut together" },
  6: { label: "06-05 Fri", reel: "“the autoshop cron crashed on day 2” — show the red error (sets up the It-broke post)" },
  7: { label: "06-06 Sat", reel: "the fix + the result (green/working)", posts: ["“It broke” full post: what happened → the fix → the cost → the one lesson"], linkedin: true },
  // ---- Week 2 — Keep showing up ----
  8: { label: "06-07 Sun", reel: "philosopher-pipeline rendering — the portraits cycling through in ~6 sec", posts: ["Plan this week's material: 1 design decision (with logs) + 1 clinic cold-outreach result"] },
  9: { label: "06-08 Mon", reel: "“why I chose plain rules over AI for the day-name parsing” — your design decision", posts: ["“AI replaced a boring job” slide post"], linkedin: true },
  10: { label: "06-09 Tue", reel: "a cold DM you sent a Jaipur clinic (screen, name hidden) + any reply" },
  11: { label: "06-10 Wed", reel: "vayuvani pulling live Delhi air-quality data on screen", posts: ["“Where AI still fails” slide post"], linkedin: true },
  12: { label: "06-11 Thu", reel: "a small bug you hit today + the quick fix" },
  13: { label: "06-12 Fri", reel: "Story Reel: talk through your week (setup → work → result)", posts: ["Receipts post: week 2 costs"], linkedin: true },
  14: { label: "06-13 Sat", reel: "recap clips from the week", posts: ["Fill in the numbers table"] },
  // ---- Week 3 — Land the clinic ----
  15: { label: "06-14 Sun", reel: "setting up the AI on the clinic's real number — screen recording", posts: ["Plan: close the clinic this week (AI live on their real number + first real call)"] },
  16: { label: "06-15 Mon", reel: "“what this AI costs per call” — numbers on screen", posts: ["“What it costs to run” slide post"], linkedin: true },
  17: { label: "06-16 Tue", reel: "a demo/test call with the clinic owner (with their permission)" },
  18: { label: "06-17 Wed", reel: "Story Reel: behind the scenes of the clinic setup", posts: ["Receipts post: week 3 costs"], linkedin: true },
  19: { label: "06-18 Thu", reel: "the first real test call ringing on their line" },
  20: { label: "06-19 Fri", reel: "“why I don't trust fully-automatic booking”", posts: ["Argue post (same take, with your numbers)"], linkedin: true },
  21: { label: "06-20 Sat 🎯", reel: "CLINIC LIVE TODAY — the agent answering their real line", milestone: "Clinic live on their real number — capture the first real call" },
  // ---- Week 4 — Use the real proof ----
  22: { label: "06-21 Sun", reel: "real call #1 — AI books an appointment", posts: ["Plan from the real call logs (which calls make good clips)"] },
  23: { label: "06-22 Mon", reel: "real call #2 — AI answers a question", posts: ["“AI replaced a boring job” slide post (first real workflow)"], linkedin: true },
  24: { label: "06-23 Tue", reel: "real call #3 — a tricky Hindi/English call" },
  25: { label: "06-24 Wed", reel: "a real call where the AI struggled + what you'd fix", posts: ["Receipts post"], linkedin: true },
  26: { label: "06-25 Thu", reel: "dev log — one thing you improved this week" },
  27: { label: "06-26 Fri", reel: "“where AI still fails” with the clinic's real data", posts: ["🎥 First YouTube long video — full walkthrough of the clinic setup"], milestone: "First YouTube long-form drops" },
  28: { label: "06-27 Sat", reel: "Story Reel: month almost done — how it's going" },
  29: { label: "06-28 Sun", reel: "“what it costs” with the clinic's real numbers", posts: ["Slide post (same)"], linkedin: true },
  30: { label: "06-29 Mon", reel: "30-day recap", posts: ["Day-30 recap slide post", "Do the Day-30 review (5 questions)"], linkedin: true },
};

/** Plan row for a day number, or null when outside the 30-day window. */
export function brandDay(day: number): BrandDay | null {
  return BRAND_PLAN[day] ?? null;
}
