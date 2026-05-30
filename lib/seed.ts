import { Task, Lane } from "./types";
import { dayNumber } from "./day";
import { brandDay, LINKEDIN_NOTE } from "./brandPlan";

interface SeedDef {
  key: string;
  lane: Lane;
  title: string;
  note?: string;
}

// Builds the day's to-dos: the BRAND lane is driven row-by-row from the
// 30-day plan (lib/brandPlan.ts); LEADS + OPS are the standing daily
// cadence from the client-acquisition-pipeline runbook.
function dailyDefs(dateISO: string): SeedDef[] {
  const defs: SeedDef[] = [];

  // ---- BRAND — straight from the 30-day plan row ----
  const plan = brandDay(dayNumber(dateISO));
  if (plan) {
    defs.push({
      key: "reel",
      lane: "brand",
      title: `Reel ${plan.reel}`,
      note: plan.series
        ? `${plan.series}. ≤5 min: reuse the status-bar template.`
        : "≤5 min: reuse the status-bar template, slot in new cuts.",
    });
    if (plan.carousel) {
      defs.push({
        key: "carousel",
        lane: "brand",
        title: `Carousel ${plan.carousel}`,
        note: plan.series,
      });
    }
    if (plan.linkedin) {
      defs.push({
        key: "linkedin",
        lane: "brand",
        title: "LinkedIn document mirror of today's carousel",
        note: LINKEDIN_NOTE,
      });
    }
    if (plan.milestone) {
      defs.push({
        key: "milestone",
        lane: "brand",
        title: `★ ${plan.milestone}`,
      });
    }
  } else {
    // Outside the 30-day window — keep the daily reel habit alive.
    defs.push({
      key: "reel",
      lane: "brand",
      title: "Ship daily Reel (Format A) from this week's source artifact",
      note: "Plan day 31+ — rewrite the next 30-day plan from the Day-30 retro.",
    });
  }

  // ---- BRAND — standing daily protocol (every day, all 30) ----
  defs.push({
    key: "notes",
    lane: "brand",
    title: "Post 1–3 raw stills to @revengine.notes",
    note: "Terminal scroll / traceback / cost sheet. Unpolished on purpose.",
  });
  defs.push({
    key: "engage",
    lane: "brand",
    title: "Reply to every comment (1h) + every DM (24h)",
    note: "Pin the top question; longer replies to indie-builder + T20 buckets.",
  });

  // ---- LEADS — client-acquisition-pipeline (daily) ----
  defs.push({
    key: "scrape",
    lane: "leads",
    title: "Run outreach loop:  doppler run -- python pipeline.py",
    note: "score ≥7 → email+LinkedIn+WhatsApp · 4–6 → email · <4 skip.",
  });
  defs.push({
    key: "replies",
    lane: "leads",
    title: "Check inbox + follow-ups:  doppler run -- python pipeline.py replies",
  });
  defs.push({
    key: "inbound",
    lane: "leads",
    title: "Qualify brand inbound via inbound_intake + log to sheet",
    note: "One mechanic, two doors (cold outbound + brand inbound).",
  });

  // ---- OPS (daily) ----
  defs.push({
    key: "bts",
    lane: "ops",
    title: "Capture 1 BTS clip for tomorrow's Reel",
    note: "Cron firing, Gumroad payout, VAPI call log, render in progress.",
  });

  return defs;
}

/** Deterministic Task objects for a given day. Idempotent ids so the
 *  merge in storage never double-adds the same seed. */
export function buildSeedTasks(dateISO: string): Task[] {
  const now = new Date().toISOString();
  return dailyDefs(dateISO).map((d) => ({
    id: `seed:${dateISO}:${d.key}`,
    title: d.title,
    lane: d.lane,
    done: false,
    createdAt: now,
    dueDate: dateISO,
    note: d.note,
    seeded: true,
  }));
}
