"use client";

// ANGUS tab: the numbered idea backlog mined from Angus Sewell's Substack.
// Data comes from data/angus-ideas.json (appended by the daily email-scout
// routine + Claude sessions); idea numbers are permanent, so telling Claude
// "build idea 12 from command center" always resolves to the same idea.
// Verdicts (timestamped) and comments are localStorage-only. Ideas marked
// "no" for over a week auto-hide (never deleted — numbering must survive).

import { useEffect, useMemo, useState } from "react";
import {
  AngusIdea,
  IDEAS,
  IdeaStatus,
  NO_TTL_DAYS,
  Verdict,
  VerdictMark,
  buildClaudeExport,
  commentStore,
  isExpiredNo,
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
  const [verdicts, setVerdicts] = useState<Record<number, VerdictMark>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  // Frozen at mount: the TTL cutoff only needs day-level precision, and a
  // stable "now" keeps renders pure.
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    setVerdicts(verdictStore.load());
    setComments(commentStore.load());
    setMounted(true);
  }, []);

  function mark(id: number, v: Verdict) {
    setVerdicts((prev) => {
      const next = { ...prev };
      // tapping the active verdict clears it
      if (next[id]?.v === v) delete next[id];
      else next[id] = { v, at: new Date().toISOString() };
      verdictStore.save(next);
      return next;
    });
  }

  function comment(id: number, text: string) {
    setComments((prev) => {
      const next = { ...prev };
      if (text.trim() === "") delete next[id];
      else next[id] = text;
      commentStore.save(next);
      return next;
    });
  }

  async function copyForClaude() {
    try {
      await navigator.clipboard.writeText(
        buildClaudeExport(verdicts, comments, new Date()),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op.
    }
  }

  const hiddenIds = useMemo(
    () =>
      mounted
        ? new Set(
            IDEAS.filter((i) => isExpiredNo(verdicts[i.id], now)).map(
              (i) => i.id,
            ),
          )
        : new Set<number>(),
    [mounted, verdicts, now],
  );

  // Group by source email, newest email first; ideas keep ascending numbers.
  const groups = useMemo(() => {
    const shown = IDEAS.filter((i) => showHidden || !hiddenIds.has(i.id));
    const byThread = new Map<
      string,
      { date: string; subject: string; ideas: AngusIdea[] }
    >();
    for (const idea of shown) {
      const g = byThread.get(idea.source.threadId) ?? {
        date: idea.source.date,
        subject: idea.source.subject,
        ideas: [],
      };
      g.ideas.push(idea);
      byThread.set(idea.source.threadId, g);
    }
    return [...byThread.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [showHidden, hiddenIds]);

  const yesCount = Object.values(verdicts).filter((m) => m.v === "yes").length;
  const builtCount = IDEAS.filter((i) => i.status === "built").length;

  return (
    <div className="flex flex-col gap-6">
      <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-mono text-sm font-bold text-cream">
            ANGUS · IDEA BACKLOG
          </h2>
          <div className="flex items-center gap-3">
            {mounted && (
              <button
                onClick={copyForClaude}
                className="font-mono text-[10px] uppercase tracking-wide text-indigo transition hover:text-burgundy-bright"
                title="Copy your yes/no marks + comments to paste back to Claude"
              >
                {copied ? "copied ✓" : "copy for claude"}
              </button>
            )}
            <span className="font-mono text-xs tabular-nums text-cream-dim">
              {IDEAS.length} ideas · {builtCount} built
              {mounted && yesCount > 0 && ` · ${yesCount} yes`}
            </span>
          </div>
        </div>
        <p className="mt-1 font-mono text-[11px] leading-snug text-cream-dim">
          Mined daily from angussewell@substack.com by the email-scout routine.
          Mark yes/no, drop comments, then hit copy-for-claude or just say:{" "}
          <span className="text-amber">
            &quot;build idea N from command center&quot;
          </span>
          . Numbers are permanent; a &quot;no&quot; disappears after{" "}
          {NO_TTL_DAYS} days.
        </p>
        {mounted && hiddenIds.size > 0 && (
          <button
            onClick={() => setShowHidden((s) => !s)}
            className="mt-1.5 font-mono text-[10px] text-cream-dim underline decoration-dotted transition hover:text-cream"
          >
            {showHidden
              ? "re-hide passed ideas"
              : `${hiddenIds.size} passed idea${hiddenIds.size === 1 ? "" : "s"} hidden (no > ${NO_TTL_DAYS}d) · show`}
          </button>
        )}
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
                verdict={mounted ? verdicts[idea.id]?.v : undefined}
                comment={mounted ? (comments[idea.id] ?? "") : ""}
                dimmed={hiddenIds.has(idea.id)}
                onMark={mark}
                onComment={comment}
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
  comment,
  dimmed,
  onMark,
  onComment,
}: {
  idea: AngusIdea;
  verdict: Verdict | undefined;
  comment: string;
  dimmed: boolean;
  onMark: (id: number, v: Verdict) => void;
  onComment: (id: number, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const retired = idea.status === "rejected" || dimmed;

  return (
    <li className={`px-3 py-2.5 ${dimmed ? "opacity-50" : ""}`}>
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
            {comment.trim() && !open && (
              <span
                className="shrink-0 font-mono text-[10px] text-indigo"
                title="has a comment"
              >
                ✎
              </span>
            )}
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
            <div className="mt-1.5 flex flex-col gap-1.5">
              <p className="font-sans text-[13px] leading-snug text-cream/90">
                {idea.summary}
              </p>
              <p className="font-mono text-[11px] leading-snug text-cream-dim">
                why you: {idea.relevance}
              </p>
              <p className="font-mono text-[11px] text-amber/90">
                say: &quot;build idea {idea.id} from command center&quot;
              </p>
              <input
                value={comment}
                onChange={(e) => onComment(idea.id, e.target.value)}
                placeholder="comment for Claude… (e.g. build it but use Groq / merge with #3)"
                className="w-full rounded bg-ink px-2 py-1 font-mono text-[11px] text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
              />
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
