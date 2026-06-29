"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isoDate } from "@/lib/day";
import { Math as MathText } from "@/lib/math";
import {
  Card,
  Grade,
  SatState,
  SAT_TARGET,
  SAT_TEST_DATE,
  crunchMode,
  dueCards,
  gradeCard,
  isRecallSuccess,
  logReview,
  nowStudyingBlock,
  recallRate,
  recordCalibration,
  reviewedToday,
  satStore,
  satTestDaysLeft,
  streakDays,
} from "@/lib/sat";

// SAT GRIND - a localStorage FSRS-4.5 drill toward the 1550 target. Burgundy/cream
// HUD styling, no terminal-green chrome. Static-export safe: mounts client-side
// only and never calls the network.
//
// The drill is built around forced ACTIVE RECALL: a card never flips passively.
// Stage 1 ATTEMPT hides the answer (and disables reveal for a short dwell so you
// cannot reflex-flip); vocab/writing cards take a typed recall. Stage 2 CHECK
// reveals the answer, echoes your attempt for self-compare, and only then offers
// the four-button self-grade that drives the scheduler.
const SUBJECT_LABEL: Record<Card["subject"], string> = {
  math: "MATH",
  reading: "READING",
  writing: "WRITING",
  vocab: "VOCAB",
};

// Cards you type a recall into vs cards you recall in your head then reveal.
const TYPED: Record<Card["subject"], boolean> = {
  vocab: true,
  writing: true,
  math: false,
  reading: false,
};

const GRADES: { g: Grade; label: string; hint: string }[] = [
  { g: 1, label: "AGAIN", hint: "blanked - press 1" },
  { g: 2, label: "HARD", hint: "recalled, but it hurt - press 2" },
  { g: 3, label: "GOOD", hint: "solid recall - press 3" },
  { g: 4, label: "EASY", hint: "instant - press 4" },
];

const DWELL_MS = 1500; // mandatory think time before reveal unlocks

type Stage = "attempt" | "check";

function isTypingInField(): boolean {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

export function SatGrind() {
  const today = useMemo(() => isoDate(), []);
  const [state, setState] = useState<SatState | null>(null);
  const [stage, setStage] = useState<Stage>("attempt");
  const [attempt, setAttempt] = useState("");
  const [confidence, setConfidence] = useState<"sure" | "unsure" | null>(null);
  const [canReveal, setCanReveal] = useState(false);
  const [sessionCalib, setSessionCalib] = useState({ hits: 0, total: 0 });
  const [overconfident, setOverconfident] = useState(false);
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

  // Forced-retrieval dwell: every time a new card enters the attempt stage, lock
  // reveal for DWELL_MS so the card cannot be reflex-flipped without thinking.
  useEffect(() => {
    if (!current || stage !== "attempt") return;
    setCanReveal(false);
    const t = setTimeout(() => setCanReveal(true), DWELL_MS);
    return () => clearTimeout(t);
  }, [current?.id, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = useCallback(() => {
    if (stage === "attempt" && canReveal) setStage("check");
  }, [stage, canReveal]);

  const grade = useCallback(
    (g: Grade) => {
      if (!state || !current || stage !== "check") return;
      const success = isRecallSuccess(g);
      const isOverconfident = confidence === "sure" && g <= 2;

      let updated = gradeCard(current, g, today);
      if (confidence) {
        updated = recordCalibration(updated, confidence, success);
        // Overconfident cards (SURE but missed) get pulled back sooner.
        if (isOverconfident) {
          updated = { ...updated, due: today, interval: 1 };
        }
      }

      // Session calibration: SURE+success or NOT SURE+miss is a calibrated call.
      if (confidence) {
        const calibrated =
          (confidence === "sure" && success) ||
          (confidence === "unsure" && !success);
        setSessionCalib((c) => ({
          hits: c.hits + (calibrated ? 1 : 0),
          total: c.total + 1,
        }));
      }
      setOverconfident(isOverconfident);

      setState({
        cards: state.cards.map((c) => (c.id === current.id ? updated : c)),
        progress: logReview(state.progress, success, today),
      });
      setStage("attempt");
      setAttempt("");
      setConfidence(null);
    },
    [state, current, stage, confidence, today],
  );

  // Keyboard-first drilling: space reveals, 1-4 grade. Ignore while typing a
  // recall so the textarea keeps normal behaviour.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      if (stage === "attempt") {
        if (e.key === " " && canReveal && !isTypingInField()) {
          e.preventDefault();
          reveal();
        }
        return;
      }
      if (stage === "check" && !isTypingInField()) {
        const g = { "1": 1, "2": 2, "3": 3, "4": 4 }[e.key];
        if (g) {
          e.preventDefault();
          grade(g as Grade);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, stage, canReveal, reveal, grade]);

  function commitFocus() {
    if (!state) return;
    const clean = focusDraft.trim() || state.progress.focus;
    setState({ ...state, progress: { ...state.progress, focus: clean } });
  }

  // Download the now.json `studying` block so the build script
  // (scripts/build_now.py) can pick up live scheduler state as
  // data/now-studying.json.
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
    return <p className="font-mono text-sm text-cream-dim">loading deck...</p>;
  }

  const reviewed = reviewedToday(state.progress, today);
  const streak = streakDays(state.progress, today);
  const daysToTest = satTestDaysLeft(today);
  const totalCards = state.cards.length;
  const rate = recallRate(state.progress, today);
  const crunch = crunchMode(today);
  const calibPct =
    sessionCalib.total > 0
      ? Math.round((sessionCalib.hits / sessionCalib.total) * 100)
      : null;
  const typed = current ? TYPED[current.subject] : false;

  return (
    <div className="flex flex-col gap-5">
      {/* header: target + countdown + retrieval stats */}
      <section className="hud rounded-lg border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-sm font-bold text-burgundy-bright">
                SAT GRIND
              </h2>
              {crunch && (
                <span className="rounded border border-amber/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber">
                  CRUNCH MODE
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-cream-dim">
              active recall + FSRS toward {SAT_TARGET} · {SAT_TEST_DATE} sitting
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-right font-mono">
            <Stat label="TARGET" value={String(SAT_TARGET)} accent="amber" />
            <Stat
              label="TEST IN"
              value={daysToTest >= 0 ? `${daysToTest}d` : "past"}
              accent={crunch ? "amber" : "cream"}
            />
            <Stat label="STREAK" value={`${streak}d`} accent="amber" />
            <Stat label="TODAY" value={String(reviewed)} accent="cream" />
            <Stat
              label="RECALL 7d"
              value={rate === null ? "--" : `${Math.round(rate * 100)}%`}
              accent="cream"
            />
            <Stat
              label="CALIB"
              value={calibPct === null ? "--" : `${calibPct}%`}
              accent="cream"
            />
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
              {current.skill && (
                <span className="ml-2 font-normal text-cream-dim">
                  {current.skill}
                </span>
              )}
            </span>
            <span className="text-cream-dim">
              {current.stability > 0
                ? `stability ${Math.round(current.stability)}d`
                : "new card"}
              {current.interval > 0 && ` · next ${current.interval}d`}
            </span>
          </div>

          <div className="flex min-h-44 flex-col items-center justify-center gap-4 px-6 py-7 text-center">
            <p className="font-sans text-lg leading-snug text-cream">
              <MathText text={current.front} />
            </p>

            {/* Stage 1: forced attempt */}
            {stage === "attempt" &&
              (typed ? (
                <textarea
                  value={attempt}
                  onChange={(e) => setAttempt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      reveal();
                    }
                  }}
                  rows={2}
                  placeholder="type what you remember, then reveal (Cmd/Ctrl+Enter)"
                  className="w-full max-w-xl resize-none rounded border border-line bg-ink px-3 py-2 font-sans text-sm text-cream outline-none placeholder:text-cream-dim focus:border-burgundy-bright"
                />
              ) : (
                <p className="font-mono text-[11px] text-cream-dim">
                  {current.subject === "writing" || current.subject === "reading"
                    ? "state the rule and one reason, then reveal"
                    : "recall it in full, then reveal"}
                </p>
              ))}

            {/* Stage 2: check - answer, echoed attempt, and the why */}
            {stage === "check" && (
              <div className="flex w-full max-w-xl flex-col items-center gap-3">
                {typed && attempt.trim() && (
                  <div className="w-full rounded border border-line bg-ink px-3 py-2 text-left">
                    <span className="font-mono text-[10px] text-cream-dim">
                      YOUR ATTEMPT
                    </span>
                    <p className="font-sans text-sm text-cream-dim">
                      {attempt}
                    </p>
                  </div>
                )}
                <p className="font-sans text-sm leading-relaxed text-cream">
                  <MathText text={current.back} />
                </p>
                {current.why && (
                  <p className="font-sans text-[13px] leading-relaxed text-cream-dim">
                    <span className="font-mono text-[10px] text-amber">
                      WHY:{" "}
                    </span>
                    <MathText text={current.why} />
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-line p-3">
            {stage === "attempt" ? (
              <div className="flex flex-col gap-2">
                {/* confidence pre-tap */}
                <div className="flex items-center justify-center gap-2 font-mono text-[11px]">
                  <span className="text-cream-dim">confidence:</span>
                  {(["sure", "unsure"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setConfidence(c)}
                      className={`rounded border px-2 py-0.5 transition ${
                        confidence === c
                          ? c === "sure"
                            ? "border-burgundy-bright bg-burgundy text-cream"
                            : "border-amber/60 bg-amber/15 text-amber"
                          : "border-line text-cream-dim hover:border-burgundy-bright"
                      }`}
                    >
                      {c === "sure" ? "SURE" : "NOT SURE"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={reveal}
                  disabled={!canReveal}
                  className="w-full rounded bg-burgundy py-2 font-mono text-sm font-bold text-cream transition hover:bg-burgundy-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {canReveal ? "REVEAL ANSWER (space)" : "think first..."}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {overconfident && (
                  <p className="text-center font-mono text-[10px] text-amber">
                    overconfident: you said SURE but missed it - back tomorrow
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADES.map((g) => (
                    <button
                      key={g.g}
                      onClick={() => grade(g.g)}
                      title={g.hint}
                      className="flex flex-col items-center rounded border border-line bg-panel-2 py-2 font-mono text-xs text-cream transition hover:border-burgundy-bright hover:bg-burgundy"
                    >
                      <span className="font-bold">{g.label}</span>
                      <span className="text-[10px] text-cream-dim">{g.g}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="hud rounded-lg border border-line bg-panel px-6 py-10 text-center">
          <p className="font-mono text-sm text-cream">Deck clear for today.</p>
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
