"use client";

import { useEffect, useMemo, useState } from "react";
import { isoDate } from "@/lib/day";
import {
  Card,
  Grade,
  SatState,
  SAT_TARGET,
  SAT_TEST_DATE,
  dueCards,
  gradeCard,
  logReview,
  nowStudyingBlock,
  reviewedToday,
  satStore,
  satTestDaysLeft,
  streakDays,
} from "@/lib/sat";

// SAT GRIND - a localStorage SM-2 drill toward the 1550 target. Burgundy/cream
// HUD styling, no terminal-green chrome. Static-export safe: mounts client-side
// only and never calls the network.
const SUBJECT_LABEL: Record<Card["subject"], string> = {
  math: "MATH",
  reading: "READING",
  writing: "WRITING",
  vocab: "VOCAB",
};

const GRADES: { q: Grade; label: string; hint: string }[] = [
  { q: 0, label: "AGAIN", hint: "blanked - see it tomorrow" },
  { q: 3, label: "HARD", hint: "recalled, but it hurt" },
  { q: 4, label: "GOOD", hint: "solid recall" },
  { q: 5, label: "EASY", hint: "instant" },
];

export function SatGrind() {
  const today = useMemo(() => isoDate(), []);
  const [state, setState] = useState<SatState | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [focusDraft, setFocusDraft] = useState("");

  useEffect(() => {
    const loaded = satStore.load();
    setState(loaded);
    setFocusDraft(loaded.progress.focus);
  }, []);

  // Persist whenever state changes (post-mount only).
  useEffect(() => {
    if (state) satStore.save(state);
  }, [state]);

  const queue = useMemo(
    () => (state ? dueCards(state.cards, today) : []),
    [state, today],
  );
  const current = queue[0];

  function grade(q: Grade) {
    if (!state || !current) return;
    const updated = gradeCard(current, q, today);
    setState({
      cards: state.cards.map((c) => (c.id === current.id ? updated : c)),
      progress: logReview(state.progress, today),
    });
    setRevealed(false);
  }

  function commitFocus() {
    if (!state) return;
    const clean = focusDraft.trim() || state.progress.focus;
    setState({ ...state, progress: { ...state.progress, focus: clean } });
  }

  // Download the now.json `studying` block so the build script
  // (scripts/build_now.py) can pick up live SM-2 state as data/now-studying.json.
  function downloadNowBlock() {
    if (!state) return;
    const block = nowStudyingBlock(state, today);
    const blob = new Blob([JSON.stringify(block, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "now-studying.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!state) {
    return <p className="font-mono text-sm text-cream-dim">loading deck…</p>;
  }

  const reviewed = reviewedToday(state.progress, today);
  const streak = streakDays(state.progress, today);
  const daysToTest = satTestDaysLeft(today);
  const totalCards = state.cards.length;

  return (
    <div className="flex flex-col gap-5">
      {/* header: target + countdown + streak */}
      <section className="hud rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-mono text-sm font-bold text-burgundy-bright">
              SAT GRIND
            </h2>
            <p className="font-mono text-[11px] text-cream-dim">
              spaced repetition toward {SAT_TARGET} · {SAT_TEST_DATE} sitting
            </p>
          </div>
          <div className="flex gap-5 text-right font-mono">
            <Stat label="TARGET" value={String(SAT_TARGET)} accent="amber" />
            <Stat
              label="TEST IN"
              value={daysToTest >= 0 ? `${daysToTest}d` : "past"}
              accent="cream"
            />
            <Stat label="STREAK" value={`${streak}d`} accent="amber" />
            <Stat label="TODAY" value={String(reviewed)} accent="cream" />
          </div>
        </div>

        {/* due meter */}
        <div className="px-4 py-3">
          <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-cream-dim">
            <span>{queue.length} due now</span>
            <span className="tabular-nums">
              {totalCards - queue.length}/{totalCards} ahead
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded bg-line">
            <div
              className="h-full bg-gradient-to-r from-burgundy to-amber transition-all duration-300"
              style={{
                width: totalCards
                  ? `${((totalCards - queue.length) / totalCards) * 100}%`
                  : "0%",
                boxShadow: "0 0 8px rgba(255, 122, 26, 0.35)",
              }}
            />
          </div>
        </div>
      </section>

      {/* drill card */}
      {current ? (
        <section className="hud rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-2 font-mono text-[11px]">
            <span className="font-bold text-indigo">
              {SUBJECT_LABEL[current.subject]}
            </span>
            <span className="text-cream-dim">
              rep {current.reps} · ease {current.ease.toFixed(2)}
            </span>
          </div>

          <div className="flex min-h-40 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
            <p className="font-sans text-lg leading-snug text-cream">
              {current.front}
            </p>
            {revealed && (
              <p className="max-w-xl font-sans text-sm leading-relaxed text-cream-dim">
                {current.back}
              </p>
            )}
          </div>

          <div className="border-t border-line p-3">
            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="w-full rounded bg-burgundy py-2 font-mono text-sm font-bold text-cream transition hover:bg-burgundy-bright"
              >
                REVEAL ANSWER
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map((g) => (
                  <button
                    key={g.q}
                    onClick={() => grade(g.q)}
                    title={g.hint}
                    className="flex flex-col items-center rounded border border-line bg-panel-2 py-2 font-mono text-xs text-cream transition hover:border-burgundy-bright hover:bg-burgundy"
                  >
                    <span className="font-bold">{g.label}</span>
                    <span className="text-[10px] text-cream-dim">+{g.q}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="hud rounded-lg border border-line bg-panel px-6 py-10 text-center">
          <p className="font-mono text-sm text-cream">
            Deck clear for today.
          </p>
          <p className="mt-1 font-mono text-[11px] text-cream-dim">
            {reviewed} cards reviewed · come back tomorrow or add more cards.
          </p>
        </section>
      )}

      {/* focus + now.json export */}
      <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
        <label className="mb-1 block font-mono text-[11px] text-cream-dim">
          CURRENT FOCUS (shown on the portfolio site-alive panel)
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            value={focusDraft}
            onChange={(e) => setFocusDraft(e.target.value)}
            onBlur={commitFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitFocus();
            }}
            placeholder="what you're grinding right now"
            className="min-w-0 flex-1 rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
          />
          <button
            onClick={downloadNowBlock}
            title="download data/now-studying.json for scripts/build_now.py"
            className="shrink-0 rounded border border-line bg-panel-2 px-3 py-1.5 font-mono text-xs text-cream transition hover:border-burgundy-bright hover:bg-burgundy"
          >
            export now.json block
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "amber" | "cream";
}) {
  return (
    <div>
      <div
        className={`text-sm font-bold tabular-nums ${
          accent === "amber" ? "text-amber" : "text-cream"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-cream-dim">{label}</div>
    </div>
  );
}
