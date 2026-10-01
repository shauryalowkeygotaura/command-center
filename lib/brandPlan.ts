// The @revengineee 30-Day Plan. Restarted 2026-10-01: rows now come from
// data/lockin.json (brandDays), the same source as the LOCK IN tab, so the
// BOARD brand lane and LOCK IN can never disagree. The June plan it replaces
// is archived at Projects/personal-brand/brand/30-day-plan.md.
// Every day also gets a 🛋️ lazy backup + engagement task (added in seed.ts).

import lockin from "@/data/lockin.json";
import { LAUNCH_DATE } from "./day";

export interface BrandDay {
  label: string; // "MM-DD Day" for reference
  reel: string; // the day's planned reel (always present)
  posts?: string[]; // extra posts/tasks beyond the reel
  linkedin?: boolean; // true → also post today's slide as a LinkedIn PDF
  milestone?: string; // hard event landing on this day
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function labelFor(day: number): string {
  const d = new Date(LAUNCH_DATE + "T00:00:00");
  d.setDate(d.getDate() + day - 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd} ${WEEKDAY[d.getDay()]}`;
}

export const BRAND_PLAN: Record<number, BrandDay> = Object.fromEntries(
  lockin.brandDays.map((b) => [
    b.day,
    {
      label: labelFor(b.day),
      reel: `${b.series}: ${b.reel}`,
      posts: b.posts,
      linkedin: b.linkedin,
      milestone: "milestone" in b ? b.milestone : undefined,
    },
  ]),
);

/** Plan row for a day number, or null when outside the 30-day window. */
export function brandDay(day: number): BrandDay | null {
  return BRAND_PLAN[day] ?? null;
}
