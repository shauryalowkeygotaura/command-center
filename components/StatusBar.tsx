import { MILESTONE_LABEL } from "@/lib/day";
import { brandQueueDay, lockStore, projectedDate } from "@/lib/lockin";

export function StatusBar({
  todayISO,
  done,
  total,
}: {
  todayISO: string;
  done?: number; // omitted since BOARD was removed: LOCK IN shows its own ring
  total?: number;
}) {
  // Same clock as LOCK IN: the plan day is the brand queue position and the
  // milestone is its PROJECTED date, so the bar and the tab never disagree.
  // (StatusBar only renders after mount, so reading localStorage is safe.)
  const lock = lockStore.load();
  const day = brandQueueDay(lock, todayISO) ?? 30;
  const milestoneOn = projectedDate(lock, todayISO, 21);
  const toMilestone = milestoneOn
    ? Math.round((new Date(milestoneOn + "T00:00:00").getTime() - new Date(todayISO + "T00:00:00").getTime()) / 86_400_000)
    : 0;
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
        <span className="ml-auto" />
        {total !== undefined && (
          <span className="tabular-nums opacity-90">
            {done}/{total} done
          </span>
        )}
        <span className="opacity-70">{dateLabel}</span>
      </div>

      {/* Day-21 milestone meter — the single most important mover. */}
      <div className="flex flex-wrap items-center gap-x-2 border-b border-line bg-panel px-4 py-2 text-xs">
        <span className="font-bold text-amber">◎ MILESTONE</span>
        <span className="text-cream">{MILESTONE_LABEL}</span>
        <span className="text-cream-dim">· {milestoneOn ?? "reached"}</span>
        <span className="ml-auto font-bold tabular-nums text-amber">
          {toMilestone > 0
            ? `${toMilestone} days left`
            : toMilestone === 0
              ? "TODAY"
              : `${Math.abs(toMilestone)} days overdue`}
        </span>
      </div>

      {/* elapsed share of the 21-day runway, glowing as it fills */}
      <div className="h-px w-full bg-line">
        <div
          className="h-full bg-amber transition-all duration-500"
          style={{
            width: `${Math.min(Math.max((day / 21) * 100, 0), 100)}%`,
            boxShadow: "0 0 6px rgba(255, 122, 26, 0.5)",
          }}
        />
      </div>
    </header>
  );
}
