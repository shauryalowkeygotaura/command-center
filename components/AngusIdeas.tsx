"use client";

// ANGUS tab: the numbered idea backlog mined from Angus Sewell's Substack.
// Data comes from data/angus-ideas.json (appended by the daily email-scout
// routine + Claude sessions); idea numbers are permanent, so telling Claude
// "build idea 12 from command center" always resolves to the same idea.
// Your yes/no marks are localStorage-only, like every other store here.

import { useEffect, useMemo, useState } from "react";
import {
  AngusIdea,
  IDEAS,
  IdeaStatus,
  Verdict,
  verdictStore,
} from "@/lib/angusIdeas";

const EFFORT_LABEL: Record<AngusIdea["effort"], string> = {
  S: "small",
  M: "medium",
  L: "large",
};

const STATUS_STYLE: Record<IdeaStatus, string> = {
  proposed: "text-cream-dim border-line",
  building: "text-amber border-amber/50",
  built: "text-burgundy-bright border-burgundy-bright/50",
  rejected: "text-cream-dim/50 border-line line-through",
};

export function AngusIdeas() {
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setVerdicts(verdictStore.load());
    setMounted(true);
  }, []);

  function mark(id: number, v: Verdict) {
    setVerdicts((prev) => {
      const next = { ...prev };
      // tapping the active verdict clears it
      if (next[id] === v) delete next[id];
      else next[id] = v;
      verdictStore.save(next);
      return next;
    });
  }

  // Group by source email, newest email first; ideas keep ascending numbers.
  const groups = useMemo(() => {
    const byThread = new Map<string, { date: string; subject: string; ideas: AngusIdea[] }>();
    for (const idea of IDEAS) {
      const g = byThread.get(idea.source.threadId) ?? {
        date: idea.source.date,
        subject: idea.source.subject,
        ideas: [],
      };
      g.ideas.push(idea);
      byThread.set(idea.source.threadId, g);
    }
    return [...byThread.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  const yesCount = Object.values(verdicts).filter((v) => v === "yes").length;
  const builtCount = IDEAS.filter((i) => i.status === "built").length;

  return (
    <div className="flex flex-col gap-6">
      <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-mono text-sm font-bold text-cream">
            ANGUS · IDEA BACKLOG
          </h2>
          <span className="font-mono text-xs tabular-nums text-cream-dim">
            {IDEAS.length} ideas · {builtCount} built
            {mounted && yesCount > 0 && ` · ${yesCount} marked yes`}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] leading-snug text-cream-dim">
          Mined daily from angussewell@substack.com by the email-scout routine.
          Mark yes/no, then tell Claude:{" "}
          <span className="text-amber">
            &quot;build idea N from command center&quot;
          </span>
          . Numbers are permanent.
        </p>
      </section>

      {groups.map((g) => (
        <section
          key={g.subject + g.date}
          className="hud rounded-lg border border-line bg-panel"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2">
            <h3 className="font-mono text-xs font-bold text-burgundy-bright">
              {g.subject}
            </h3>
            <span className="font-mono text-[10px] tabular-nums text-cream-dim">
              {g.date} · {g.ideas.length} ideas
            </span>
          </div>

          <ul className="divide-y divide-line/60">
            {g.ideas.map((idea) => (
              <IdeaRow
                key={idea.id}
                idea={idea}
                verdict={mounted ? verdicts[idea.id] : undefined}
                onMark={mark}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function IdeaRow({
  idea,
  verdict,
  onMark,
}: {
  idea: AngusIdea;
  verdict: Verdict | undefined;
  onMark: (id: number, v: Verdict) => void;
}) {
  const [open, setOpen] = useState(false);
  const retired = idea.status === "rejected";

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 font-mono text-sm font-bold tabular-nums text-amber">
          #{idea.id}
        </span>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-baseline gap-2 text-left"
            title={open ? "collapse" : "expand"}
          >
            <span
              className={`font-sans text-sm leading-snug ${
                retired ? "text-cream-dim/60 line-through" : "text-cream"
              }`}
            >
              {idea.title}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-cream-dim">
              {EFFORT_LABEL[idea.effort]}
            </span>
            <span
              className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10px] ${STATUS_STYLE[idea.status]}`}
            >
              {idea.status}
            </span>
          </button>

          {open && (
            <div className="mt-1.5 flex flex-col gap-1">
              <p className="font-sans text-[13px] leading-snug text-cream/90">
                {idea.summary}
              </p>
              <p className="font-mono text-[11px] leading-snug text-cream-dim">
                why you: {idea.relevance}
              </p>
              <p className="font-mono text-[11px] text-amber/90">
                say: &quot;build idea {idea.id} from command center&quot;
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1 font-mono text-[11px]">
          <button
            onClick={() => onMark(idea.id, "yes")}
            aria-pressed={verdict === "yes"}
            className={`rounded border px-1.5 py-0.5 transition ${
              verdict === "yes"
                ? "border-burgundy-bright bg-burgundy text-cream"
                : "border-line text-cream-dim hover:text-cream"
            }`}
          >
            yes
          </button>
          <button
            onClick={() => onMark(idea.id, "no")}
            aria-pressed={verdict === "no"}
            className={`rounded border px-1.5 py-0.5 transition ${
              verdict === "no"
                ? "border-line bg-panel-2 text-cream line-through"
                : "border-line text-cream-dim hover:text-cream"
            }`}
          >
            no
          </button>
        </div>
      </div>
    </li>
  );
}
