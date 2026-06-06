import { dayNumber, daysToMilestone, MILESTONE_DATE, MILESTONE_LABEL } from "@/lib/day";

export function StatusBar({
  todayISO,
  done,
  total,
}: {
  todayISO: string;
  done: number;
  total: number;
}) {
  const day = dayNumber(todayISO);
  const toMilestone = daysToMilestone(todayISO);
  const dateLabel = new Date(todayISO + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  return (
    <header className="font-mono">
      {/* The trademark visual tic: burgundy bar, cream mono text. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-burgundy px-4 py-2 text-cream">
        {/* ASCII prompt instead of █: the block glyph tofus on phone fallback fonts */}
        <span className="font-bold tracking-tight">&gt; [REVENGINE]</span>
        <span className="opacity-90">day {String(day).padStart(3, "0")}</span>
        <span className="opacity-70">command-center</span>
        <span className="ml-auto tabular-nums opacity-90">
          {done}/{total} done
        </span>
        <span className="opacity-70">{dateLabel}</span>
      </div>

      {/* Day-21 milestone meter — the single most important mover. */}
      <div className="flex flex-wrap items-center gap-x-2 border-b border-line bg-panel px-4 py-2 text-xs">
        <span className="font-bold text-amber">◎ MILESTONE</span>
        <span className="text-cream">{MILESTONE_LABEL}</span>
        <span className="text-cream-dim">· {MILESTONE_DATE}</span>
        <span className="ml-auto font-bold tabular-nums text-amber">
          {toMilestone > 0
            ? `${toMilestone} days left`
            : toMilestone === 0
              ? "TODAY"
              : `${Math.abs(toMilestone)} days overdue`}
        </span>
      </div>
    </header>
  );
}
