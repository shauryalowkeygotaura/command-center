"use client";

// SKILL TREE — everything from the Exun inductions (webdev / CP / ML) as one
// game-style tree. One root, three branches. Click a node → a half-screen
// panel slides in with the explanation, a worked example, and an exercise you
// type INTO the panel before revealing the solution (active recall, not
// re-reading). A node unlocks only when all its prerequisite nodes are done.

import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import {
  CHILDREN,
  NODES,
  NODE_BY_ID,
  PORTFOLIO_GROUP,
  Progress,
  SkillNode,
  TRACKS,
  computeLayout,
  isDone,
  isUnlocked,
  nextUp,
  progressStore,
  totalXp,
  trackStats,
} from "@/lib/skilltree";

const CHIP_W = 116;
const CHIP_H = 54;
const SETTINGS_KEY = "revengine.command-center.skilltree.settings.v1";
const PORTFOLIO_COUNT = NODES.filter((n) => n.group === PORTFOLIO_GROUP).length;
const INTERVIEW_COUNT = NODES.filter((n) => n.interview).length;

export function SkillTree() {
  const [progress, setProgress] = useState<Progress>({});
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidePortfolio, setHidePortfolio] = useState(false);
  const [interviewOnly, setInterviewOnly] = useState(false);

  useEffect(() => {
    setProgress(progressStore.load());
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setHidePortfolio(!!s.hidePortfolio);
        setInterviewOnly(!!s.interviewOnly);
      }
    } catch {
      /* no saved settings */
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) progressStore.save(progress);
  }, [progress, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ hidePortfolio, interviewOnly }),
      );
    } catch {
      /* private mode / quota */
    }
  }, [hidePortfolio, interviewOnly, mounted]);

  // close the panel with ESC
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // visible node set: interview-essentials filter and/or hide-portfolio.
  // Both layout and stats run off this so counts stay honest.
  const visibleNodes = useMemo(() => {
    let ns = NODES;
    if (interviewOnly) ns = ns.filter((n) => n.interview);
    if (hidePortfolio) ns = ns.filter((n) => n.group !== PORTFOLIO_GROUP);
    return ns;
  }, [interviewOnly, hidePortfolio]);
  const visibleIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );
  const layout = useMemo(() => computeLayout(visibleNodes), [visibleNodes]);

  function patchNode(id: string, patch: Partial<Progress[string]>) {
    setProgress((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  if (!mounted) {
    return <p className="font-mono text-sm text-cream-dim">growing tree…</p>;
  }

  const next = nextUp(progress, visibleNodes);
  const xp = totalXp(progress, visibleNodes);
  const total = visibleNodes.length;
  const selectedNode = selected ? NODE_BY_ID.get(selected) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* stats strip */}
      <div className="flex flex-wrap items-center gap-3">
        {TRACKS.map((t) => {
          const s = trackStats(t.id, progress, visibleNodes);
          return (
            <div
              key={t.id}
              className="hud flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs"
            >
              <span className="font-bold" style={{ color: t.accent }}>
                {t.label}
              </span>
              <span className="tabular-nums text-cream-dim">
                {s.done}/{s.total}
              </span>
              <span className="h-1 w-16 overflow-hidden rounded bg-line">
                <span
                  className="block h-full transition-all duration-300"
                  style={{
                    width: `${s.total ? (s.done / s.total) * 100 : 0}%`,
                    background: t.accent,
                  }}
                />
              </span>
            </div>
          );
        })}
        <div className="hud rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs">
          <span className="text-amber">
            {xp} / {total} XP
          </span>
          <span className="ml-1 text-cream-dim">(nodes done)</span>
        </div>
        {next && (
          <button
            onClick={() => setSelected(next.id)}
            className="rounded-lg border border-burgundy-bright bg-burgundy/30 px-3 py-2 font-mono text-xs text-cream transition hover:bg-burgundy"
          >
            next up → {next.title}
          </button>
        )}

        {/* view toggles */}
        <button
          onClick={() => setInterviewOnly((v) => !v)}
          title="show only the must-know nodes for the Exun interviews: the concept the examiner tests plus the project nuance only you would know"
          className={`rounded-lg border px-3 py-2 font-mono text-xs transition ${
            interviewOnly
              ? "border-amber bg-amber/20 text-amber"
              : "border-line bg-panel text-cream-dim hover:border-amber hover:text-cream"
          }`}
        >
          {interviewOnly ? "★ " : ""}
          interview essentials ({INTERVIEW_COUNT})
        </button>
        <button
          onClick={() => setHidePortfolio((v) => !v)}
          title="the Next.js self-iterating-site path is an optional aside, not part of the Exun submission"
          className="rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs text-cream-dim transition hover:border-burgundy-bright hover:text-cream"
        >
          {hidePortfolio ? "show" : "hide"} portfolio ({PORTFOLIO_COUNT})
        </button>
      </div>

      {/* tree canvas — horizontally scrollable on small screens */}
      <div className="hud overflow-x-auto rounded-lg border border-line bg-panel/60 p-2">
        <div
          className="relative mx-auto"
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className="absolute inset-0"
            width={layout.width}
            height={layout.height}
            aria-hidden
          >
            {/* root → track roots, then every parent → child edge.
                Hidden parents have no layout pos, so those edges drop out. */}
            {visibleNodes.map((n) =>
              n.parents.map((pid) => {
                const from =
                  pid === "root" ? layout.rootPos : layout.pos[pid];
                const to = layout.pos[n.id];
                if (!from || !to) return null;
                const done = isDone(n.id, progress);
                const open = isUnlocked(n.id, progress);
                const accent =
                  TRACKS.find((t) => t.id === n.track)?.accent ?? "#722f37";
                return (
                  <path
                    key={`${pid}->${n.id}`}
                    d={`M ${from.x} ${from.y + CHIP_H / 2} C ${from.x} ${
                      from.y + CHIP_H / 2 + 44
                    }, ${to.x} ${to.y - CHIP_H / 2 - 44}, ${to.x} ${
                      to.y - CHIP_H / 2
                    }`}
                    fill="none"
                    stroke={done ? accent : open ? accent : "#2a221f"}
                    strokeOpacity={done ? 0.9 : open ? 0.45 : 0.8}
                    strokeWidth={done ? 2 : 1.25}
                    strokeDasharray={done || open ? undefined : "4 4"}
                  />
                );
              }),
            )}
          </svg>

          {/* root chip */}
          <div
            className="hud absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-burgundy-bright bg-burgundy px-4 py-2 text-center"
            style={{ left: layout.rootPos.x, top: layout.rootPos.y, width: 190 }}
          >
            <p className="font-mono text-xs font-bold text-cream">
              EXUN SKILL TREE
            </p>
            <p className="font-mono text-[9px] text-cream/70">
              level 0 — start here
            </p>
          </div>

          {visibleNodes.map((n) => (
            <NodeChip
              key={n.id}
              node={n}
              pos={layout.pos[n.id]}
              done={isDone(n.id, progress)}
              unlocked={isUnlocked(n.id, progress)}
              active={selected === n.id}
              onClick={() => setSelected(n.id)}
            />
          ))}
        </div>
      </div>

      <p className="font-mono text-[10px] text-cream-dim">
        ■ done · ◇ unlocked (pulsing) · 🔒 locked until its parent concepts are
        done · progress saves on this device
      </p>

      {/* learning panel */}
      {selectedNode && (
        <>
          <div
            className="fixed inset-0 z-30 bg-ink/70 backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <LearnPanel
            node={selectedNode}
            progress={progress}
            visibleIds={visibleIds}
            onPatch={(patch) => patchNode(selectedNode.id, patch)}
            onJump={(id) => setSelected(id)}
            onClose={() => setSelected(null)}
          />
        </>
      )}
    </div>
  );
}

/* ---------------- node chip ---------------- */

function NodeChip({
  node,
  pos,
  done,
  unlocked,
  active,
  onClick,
}: {
  node: SkillNode;
  pos?: { x: number; y: number };
  done: boolean;
  unlocked: boolean;
  active: boolean;
  onClick: () => void;
}) {
  if (!pos) return null;
  const accent = TRACKS.find((t) => t.id === node.track)?.accent ?? "#722f37";
  const locked = !done && !unlocked;
  return (
    <button
      onClick={onClick}
      title={locked ? "locked — finish its parent nodes first" : node.subtitle}
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-1 text-center transition ${
        done
          ? "border-transparent bg-burgundy text-cream"
          : locked
            ? "border-dashed border-line bg-panel text-cream-dim opacity-60 hover:opacity-90"
            : "bg-panel-2 text-cream hover:scale-105"
      } ${active ? "ring-1 ring-amber" : ""}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: CHIP_W,
        minHeight: CHIP_H,
        borderColor: done ? accent : locked ? undefined : accent,
        boxShadow: done
          ? `0 0 10px ${accent}55`
          : !locked
            ? `0 0 8px ${accent}33`
            : undefined,
        animation:
          !done && !locked ? "cc-pulse 2.6s ease-in-out infinite" : undefined,
      }}
    >
      <span className="block font-sans text-[11px] font-bold leading-tight">
        {done ? "✓ " : locked ? "🔒 " : ""}
        {node.title}
      </span>
      <span className="block font-mono text-[8px] leading-tight text-cream-dim">
        {node.subtitle}
      </span>
    </button>
  );
}

/* ---------------- learning panel ---------------- */

function LearnPanel({
  node,
  progress,
  visibleIds,
  onPatch,
  onJump,
  onClose,
}: {
  node: SkillNode;
  progress: Progress;
  visibleIds: Set<string>;
  onPatch: (patch: Partial<Progress[string]>) => void;
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const p = progress[node.id] ?? {};
  const done = !!p.done;
  const unlocked = isUnlocked(node.id, progress);
  const accent = TRACKS.find((t) => t.id === node.track)?.accent ?? "#722f37";
  const track = TRACKS.find((t) => t.id === node.track);

  const missingParents = node.parents
    .filter((pid) => pid !== "root" && !isDone(pid, progress))
    .map((pid) => NODE_BY_ID.get(pid))
    .filter((x): x is SkillNode => !!x);

  // children that became playable (all THEIR parents done) — the reward reveal.
  // Skip any that the current filter has hidden, so we never jump to a hidden node.
  const unlockedChildren = (CHILDREN[node.id] ?? [])
    .map((id) => NODE_BY_ID.get(id))
    .filter(
      (c): c is SkillNode =>
        !!c && done && isUnlocked(c.id, progress) && visibleIds.has(c.id),
    );

  const canComplete = !!p.draft?.trim();

  // lesson vs exercise (test) view. Pressing "attempt" hides the explanation
  // and worked example so the question is answered from memory, not copied.
  const [mode, setMode] = useState<"lesson" | "exercise">("lesson");
  // opening a different node always drops you back on the lesson side
  useEffect(() => {
    setMode("lesson");
  }, [node.id]);

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-panel md:w-1/2"
      style={{ animation: "cc-slide 0.22s ease-out" }}
      role="dialog"
      aria-label={node.title}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="font-mono text-[10px] font-bold" style={{ color: accent }}>
            {track?.label} · LEVEL {node.level} · ~{node.minutes} MIN
          </p>
          <h2 className="font-sans text-lg font-bold text-cream">
            {node.title}
          </h2>
          <p className="font-mono text-xs text-cream-dim">{node.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {done && (
            <span className="rounded border border-burgundy-bright bg-burgundy px-2 py-0.5 font-mono text-[10px] font-bold text-cream">
              ✓ DONE
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="close panel"
            className="rounded px-2 py-1 font-mono text-sm text-cream-dim transition hover:bg-panel-2 hover:text-cream"
          >
            ✕ esc
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!unlocked && !done ? (
          /* locked view — show the path in, not the content */
          <div className="flex flex-col gap-3">
            <p className="font-mono text-sm text-cream-dim">
              🔒 locked. Finish these first — they are what this node builds
              on:
            </p>
            {missingParents.map((mp) => (
              <button
                key={mp.id}
                onClick={() => onJump(mp.id)}
                className="hud flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-left transition hover:border-burgundy-bright"
              >
                <span className="font-sans text-sm text-cream">{mp.title}</span>
                <span className="font-mono text-[10px] text-cream-dim">
                  open →
                </span>
              </button>
            ))}
          </div>
        ) : mode === "lesson" ? (
          <div className="flex flex-col gap-5">
            {/* INTERVIEW — concept the examiner tests + the project nuance
                only the builder knows. Shown first for last-minute cramming. */}
            {node.interview && (
              <section className="rounded-lg border border-burgundy-bright/60 bg-burgundy/20 p-3">
                <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-cream">
                  🎤 INTERVIEW — BE READY TO EXPLAIN
                </h3>
                <div className="flex flex-col gap-2 font-sans text-sm leading-relaxed text-cream">
                  {renderMd(node.interview)}
                </div>
              </section>
            )}

            {/* HOW IT WORKS */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-cream-dim">
                HOW IT WORKS
              </h3>
              <div className="flex flex-col gap-2 font-sans text-sm leading-relaxed text-cream">
                {renderMd(node.explain)}
              </div>
            </section>

            {/* EXAMPLE — terminal green is code-content only, which this is */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-cream-dim">
                WORKED EXAMPLE
              </h3>
              <pre className="overflow-x-auto rounded-lg border border-line bg-ink p-3 font-mono text-xs leading-relaxed text-term">
                {node.example}
              </pre>
            </section>

            {/* FIELD NOTES — the real shortcut that shipped in the Exun build */}
            {node.loophole && (
              <section className="rounded-lg border border-amber/50 bg-amber/10 p-3">
                <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-amber">
                  ⚑ FIELD NOTES — THE SHORTCUT I SHIPPED
                </h3>
                <div className="flex flex-col gap-2 font-sans text-sm leading-relaxed text-cream">
                  {renderMd(node.loophole)}
                </div>
              </section>
            )}

            {/* start the exercise -> switches to the no-peeking test view */}
            <button
              onClick={() => setMode("exercise")}
              className="hud rounded-lg border border-amber/50 bg-amber/10 px-4 py-3 text-left transition hover:bg-amber/20"
            >
              <span className="block font-mono text-xs font-bold text-amber">
                ✎ attempt the exercise from memory →
              </span>
              <span className="mt-0.5 block font-sans text-xs text-cream-dim">
                opens on its own. the lesson hides, so you answer it yourself
                instead of copying.
              </span>
            </button>
          </div>
        ) : (
          /* EXERCISE (test) view — explanation + worked example are hidden */
          <div className="flex flex-col gap-5">
            <button
              onClick={() => setMode("lesson")}
              className="self-start rounded px-2 py-1 font-mono text-xs text-cream-dim transition hover:bg-panel-2 hover:text-cream"
            >
              ← back to the lesson
            </button>

            {/* EXERCISE */}
            <section className="hud rounded-lg border border-amber/40 bg-panel-2 p-3">
              <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-amber">
                YOUR TURN — NO PEEKING
              </h3>
              <div className="mb-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-cream">
                {renderInline(node.exercise)}
              </div>
              <textarea
                value={p.draft ?? ""}
                onChange={(e) => onPatch({ draft: e.target.value })}
                placeholder="type your answer / code here — then check it against the solution"
                spellCheck={false}
                className="min-h-36 w-full resize-y rounded border border-line bg-ink p-2 font-mono text-xs leading-relaxed text-term outline-none placeholder:text-cream-dim focus:border-amber"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!p.submitted ? (
                  <button
                    onClick={() => onPatch({ submitted: true, revealed: true })}
                    disabled={!canComplete}
                    title={
                      canComplete
                        ? "submit your answer and reveal the solution"
                        : "type your answer first — the solution stays hidden until you do"
                    }
                    className={`rounded px-3 py-1.5 font-mono text-xs font-bold transition ${
                      canComplete
                        ? "bg-amber/20 text-amber hover:bg-amber/30"
                        : "cursor-not-allowed bg-panel text-cream-dim"
                    }`}
                  >
                    submit answer →
                  </button>
                ) : (
                  <button
                    onClick={() => onPatch({ revealed: !p.revealed })}
                    className="rounded border border-line px-3 py-1.5 font-mono text-xs text-cream-dim transition hover:border-amber hover:text-cream"
                  >
                    {p.revealed ? "hide solution" : "show solution"}
                  </button>
                )}
                {!done ? (
                  <button
                    onClick={() =>
                      onPatch({ done: true, doneAt: new Date().toISOString() })
                    }
                    disabled={!canComplete}
                    title={
                      canComplete
                        ? "mark this concept mastered"
                        : "attempt the exercise first — type something above"
                    }
                    className={`rounded px-3 py-1.5 font-mono text-xs font-bold transition ${
                      canComplete
                        ? "bg-burgundy text-cream hover:bg-burgundy-bright"
                        : "cursor-not-allowed bg-panel text-cream-dim"
                    }`}
                  >
                    ✓ mark complete (+1 XP)
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      onPatch({ done: false, submitted: false, revealed: false })
                    }
                    className="rounded border border-line px-3 py-1.5 font-mono text-xs text-cream-dim transition hover:text-burgundy-bright"
                  >
                    reset node
                  </button>
                )}
              </div>
              {p.submitted && p.revealed && (
                <pre className="mt-3 overflow-x-auto rounded-lg border border-burgundy bg-ink p-3 font-mono text-xs leading-relaxed text-term">
                  {node.solution}
                </pre>
              )}
            </section>

            {/* SELF-CHECK */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-cream-dim">
                SELF-CHECK (no peeking)
              </h3>
              <ul className="flex flex-col gap-1.5">
                {node.checklist.map((c, i) => {
                  const ticked = p.checks?.includes(i);
                  return (
                    <li key={i}>
                      <button
                        onClick={() => {
                          const set = new Set(p.checks ?? []);
                          if (ticked) set.delete(i);
                          else set.add(i);
                          onPatch({ checks: [...set] });
                        }}
                        className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition hover:bg-panel-2"
                      >
                        <span
                          className={`mt-0.5 font-mono text-sm leading-none ${
                            ticked ? "text-burgundy-bright" : "text-cream-dim"
                          }`}
                        >
                          {ticked ? "[x]" : "[ ]"}
                        </span>
                        <span
                          className={`font-sans text-sm leading-snug ${
                            ticked ? "text-cream-dim" : "text-cream"
                          }`}
                        >
                          {renderInline(c)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* reward reveal */}
            {unlockedChildren.length > 0 && (
              <section className="rounded-lg border border-burgundy-bright/50 bg-burgundy/15 p-3">
                <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-cream">
                  ⬡ UNLOCKED
                </h3>
                <div className="flex flex-wrap gap-2">
                  {unlockedChildren.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onJump(c.id)}
                      className="rounded border border-burgundy-bright px-3 py-1.5 font-mono text-xs text-cream transition hover:bg-burgundy"
                    >
                      {c.title} →
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------------- markdown-lite ---------------- */
// Just enough for the curriculum content: \n\n paragraphs, "- " lists,
// **bold**, `inline code`. Anything fancier belongs in the example/solution
// pre blocks.

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-ink px-1 py-0.5 font-mono text-[0.85em] text-term"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function renderMd(text: string): ReactNode[] {
  return text.split(/\n{2,}/).map((block, i) => {
    const lines = block.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return (
        <ul key={i} className="ml-4 list-disc space-y-1">
          {lines.map((l, j) => (
            <li key={j}>{renderInline(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="whitespace-pre-wrap">
        {renderInline(block)}
      </p>
    );
  });
}
