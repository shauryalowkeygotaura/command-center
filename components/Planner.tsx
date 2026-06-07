"use client";

// PLANNER — one brain, three lenses:
//   INTRADAY : 05:00–24:00 timeline, freeform blocks, live NOW line
//   DAY      : agenda for any date — blocks + brand-plan row + board tasks
//              + call-list progress + pipeline health (today only)
//   MONTH    : calendar grid — heat dots (board tasks) + diamonds (plan
//              blocks), D-stamps for the 30-day plan, milestone day ringed
//
// Blocks come from two writers: the UI (you) and DAY_TEMPLATE / PLAN_SEED in
// lib/planner.ts (Claude). Board tasks are READ through props and toggled via
// the Board's own handler — Board owns that store; two writers would clobber
// each other's localStorage saves.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PlanBlock,
  BlockKind,
  KINDS,
  kindMeta,
  planStore,
  blocksForDate,
  plannedCount,
  toMin,
  parseQuickAdd,
} from "@/lib/planner";
import { Task, LANES } from "@/lib/types";
import {
  isoDate,
  dayNumber,
  daysToMilestone,
  MILESTONE_DATE,
  MILESTONE_LABEL,
} from "@/lib/day";
import { brandDay } from "@/lib/brandPlan";
import { callStore, CALL_TARGET } from "@/lib/callList";
import {
  PIPELINES,
  PipelineState,
  fetchActions,
  fetchMetrics,
  severity,
} from "@/lib/pipelines";

type View = "intraday" | "day" | "month";
const VIEW_KEY = "cc.plannerView.v1";
const VIEWS: { id: View; label: string }[] = [
  { id: "intraday", label: "INTRADAY" },
  { id: "day", label: "DAY" },
  { id: "month", label: "MONTH" },
];

// ── date math (local, same convention as lib/day.ts) ─────────────────────────
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function addMonths(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  return isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}
function human(iso: string): string {
  return new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit" })
    .toUpperCase();
}
function monthLabel(iso: string): string {
  return new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();
}

export function Planner({
  today,
  tasks,
  onToggleTask,
}: {
  today: string;
  tasks: Task[];
  onToggleTask: (id: string, done: boolean) => void;
}) {
  const [blocks, setBlocks] = useState<PlanBlock[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("intraday");
  const [date, setDate] = useState(today);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    setBlocks(planStore.load());
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.some((v) => v.id === saved)) setView(saved as View);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) planStore.save(blocks);
  }, [blocks, loaded]);

  // live NOW line — a 30s tick is plenty for a 1px line
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  function selectView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode — view just won't persist */
    }
  }

  // ── block mutations (materialize template/seed blocks on first touch) ──────
  function upsert(b: PlanBlock) {
    setBlocks((prev) =>
      prev.some((x) => x.id === b.id)
        ? prev.map((x) => (x.id === b.id ? b : x))
        : [...prev, b],
    );
  }
  function toggleBlock(b: PlanBlock) {
    upsert({ ...b, done: !b.done });
  }
  function removeBlock(b: PlanBlock) {
    if (b.seeded) upsert({ ...b, removed: true }); // tombstone, or the merge resurrects it
    else setBlocks((prev) => prev.filter((x) => x.id !== b.id));
  }
  function addBlock(raw: string, kind: BlockKind) {
    const { start, end, title } = parseQuickAdd(raw);
    if (!title) return;
    upsert({
      id: crypto.randomUUID(),
      date,
      start,
      end,
      title,
      kind,
      done: false,
    });
  }

  const dayBlocks = useMemo(() => blocksForDate(blocks, date), [blocks, date]);
  const isToday = date === today;
  const dNum = dayNumber(date);
  const inPlan = dNum >= 1 && dNum <= 30;

  return (
    <div className="flex flex-col gap-4">
      {/* ── header: view switch + date nav + plan clock ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded border border-line font-mono text-xs">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => selectView(v.id)}
              className={`px-3 py-1.5 transition ${
                view === v.id
                  ? "bg-burgundy font-bold text-cream"
                  : "text-cream-dim hover:bg-panel-2 hover:text-cream"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view !== "month" && (
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => setDate(addDays(date, -1))}
              className="rounded border border-line px-2 py-1 text-cream-dim hover:text-cream"
              aria-label="previous day"
            >
              ‹
            </button>
            <span className="min-w-32 text-center font-bold text-cream">
              {human(date)}
              {inPlan && (
                <span className="ml-1.5 text-burgundy-bright">D{dNum}/30</span>
              )}
            </span>
            <button
              onClick={() => setDate(addDays(date, 1))}
              className="rounded border border-line px-2 py-1 text-cream-dim hover:text-cream"
              aria-label="next day"
            >
              ›
            </button>
            {!isToday && (
              <button
                onClick={() => setDate(today)}
                className="rounded bg-panel-2 px-2 py-1 text-amber hover:text-cream"
              >
                today
              </button>
            )}
          </div>
        )}

        <span className="font-mono text-[11px] text-cream-dim">
          {daysToMilestone(today) >= 0
            ? `${daysToMilestone(today)}d → milestone`
            : "milestone passed"}
        </span>
      </div>

      <div key={`${view}:${date}`} style={{ animation: "cc-in .18s ease-out" }}>
        {view === "intraday" && (
          <IntradayView
            blocks={dayBlocks}
            isToday={isToday}
            nowMin={nowMin}
            onToggle={toggleBlock}
            onRemove={removeBlock}
            onAdd={addBlock}
          />
        )}
        {view === "day" && (
          <DayView
            date={date}
            today={today}
            blocks={dayBlocks}
            tasks={tasks.filter((t) => t.dueDate === date)}
            onToggle={toggleBlock}
            onRemove={removeBlock}
            onAdd={addBlock}
            onToggleTask={onToggleTask}
          />
        )}
        {view === "month" && (
          <MonthView
            cursor={date}
            today={today}
            blocks={blocks}
            tasks={tasks}
            onNav={(n) => setDate(addMonths(date, n))}
            onPick={(iso) => {
              setDate(iso);
              selectView("day");
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── INTRADAY ─────────────────────────────────────────────────────────────────
const DAY_START = 5 * 60; // 05:00
const DAY_END = 24 * 60;
const PX_PER_MIN = 0.75; // 45px per hour

function IntradayView({
  blocks,
  isToday,
  nowMin,
  onToggle,
  onRemove,
  onAdd,
}: {
  blocks: PlanBlock[];
  isToday: boolean;
  nowMin: number;
  onToggle: (b: PlanBlock) => void;
  onRemove: (b: PlanBlock) => void;
  onAdd: (raw: string, kind: BlockKind) => void;
}) {
  const timed = blocks.filter((b) => b.start);
  const untimed = blocks.filter((b) => !b.start);
  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const nowTop = (nowMin - DAY_START) * PX_PER_MIN;
  const hours = Array.from({ length: 19 }, (_, i) => i + 5);

  return (
    <div className="flex flex-col gap-4">
      {untimed.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {untimed.map((b) => (
            <BlockPill key={b.id} block={b} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </div>
      )}

      <section className="rounded-lg border border-line bg-panel p-3">
        <div className="relative" style={{ height }}>
          {/* hour grid */}
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-line/60"
              style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}
            >
              <span className="absolute -top-2 left-0 w-12 font-mono text-[10px] text-cream-dim">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}

          {/* blocks */}
          {timed.map((b) => {
            const start = toMin(b.start!);
            const end = b.end ? toMin(b.end) : start + 30;
            const top = Math.max((start - DAY_START) * PX_PER_MIN, 0);
            const h = Math.max((end - start) * PX_PER_MIN, 20);
            const meta = kindMeta(b.kind);
            return (
              <div
                key={b.id}
                className={`group absolute left-14 right-1 overflow-hidden rounded-r border-l-2 bg-panel-2/90 px-2 py-0.5 transition hover:bg-panel-2 ${
                  b.done ? "opacity-45" : ""
                }`}
                style={{ top, height: h, borderColor: meta.color }}
              >
                <div className="flex items-start gap-1.5">
                  <button
                    aria-label={b.done ? "mark not done" : "mark done"}
                    onClick={() => onToggle(b)}
                    className={`font-mono text-xs leading-snug ${
                      b.done ? "text-burgundy-bright" : "text-cream-dim hover:text-cream"
                    }`}
                  >
                    {b.done ? "[x]" : "[ ]"}
                  </button>
                  <span
                    className={`flex-1 truncate font-sans text-xs leading-snug ${
                      b.done ? "text-cream-dim line-through" : "text-cream"
                    }`}
                  >
                    {b.title}
                  </span>
                  <span
                    className="hidden font-mono text-[9px] sm:inline"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <button
                    aria-label="delete block"
                    onClick={() => onRemove(b)}
                    className="font-mono text-[10px] text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
                  >
                    ✕
                  </button>
                </div>
                {h >= 34 && (
                  <span className="font-mono text-[9px] text-cream-dim">
                    {b.start}–{b.end ?? "…"}
                  </span>
                )}
              </div>
            );
          })}

          {/* live NOW line */}
          {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-10"
              style={{ top: nowTop, animation: "cc-now 2.4s ease-in-out infinite" }}
            >
              <div
                className="h-px w-full bg-amber"
                style={{ boxShadow: "0 0 6px 1px var(--color-amber)" }}
              />
              <span className="absolute -top-2 right-0 rounded bg-amber px-1 font-mono text-[9px] font-bold text-ink">
                NOW {String(Math.floor(nowMin / 60)).padStart(2, "0")}:
                {String(nowMin % 60).padStart(2, "0")}
              </span>
            </div>
          )}
        </div>
      </section>

      <AddBlockForm onAdd={onAdd} />
    </div>
  );
}

// ── DAY ──────────────────────────────────────────────────────────────────────
function DayView({
  date,
  today,
  blocks,
  tasks,
  onToggle,
  onRemove,
  onAdd,
  onToggleTask,
}: {
  date: string;
  today: string;
  blocks: PlanBlock[];
  tasks: Task[];
  onToggle: (b: PlanBlock) => void;
  onRemove: (b: PlanBlock) => void;
  onAdd: (raw: string, kind: BlockKind) => void;
  onToggleTask: (id: string, done: boolean) => void;
}) {
  const plan = brandDay(dayNumber(date));
  const [calls, setCalls] = useState({ called: 0, total: 0 });
  useEffect(() => {
    const entries = callStore.load().filter((c) => c.dueDate === date);
    setCalls({ called: entries.filter((c) => c.called).length, total: entries.length });
  }, [date]);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* schedule column */}
      <section className="flex flex-col rounded-lg border border-line bg-panel">
        <header className="border-b border-line px-3 py-2 font-mono text-sm font-bold text-burgundy-bright">
          SCHEDULE
        </header>
        <ul className="flex-1 space-y-1 p-2">
          {blocks.length === 0 && (
            <li className="px-2 py-3 font-mono text-xs text-cream-dim">
              nothing planned — add below or let the template fill weekdays
            </li>
          )}
          {blocks.map((b) => (
            <li key={b.id} className="group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-panel-2">
              <button
                aria-label={b.done ? "mark not done" : "mark done"}
                onClick={() => onToggle(b)}
                className={`mt-0.5 font-mono text-sm leading-none ${
                  b.done ? "text-burgundy-bright" : "text-cream-dim"
                }`}
              >
                {b.done ? "[x]" : "[ ]"}
              </button>
              <span className="w-20 shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-cream-dim">
                {b.start ? `${b.start}–${b.end ?? "…"}` : "anytime"}
              </span>
              <span
                className={`flex-1 font-sans text-sm leading-snug ${
                  b.done ? "text-cream-dim line-through" : "text-cream"
                }`}
              >
                {b.title}
                {b.note && (
                  <span className="block font-mono text-[10px] text-cream-dim">{b.note}</span>
                )}
              </span>
              <span
                className="pt-0.5 font-mono text-[9px]"
                style={{ color: kindMeta(b.kind).color }}
              >
                {kindMeta(b.kind).label}
              </span>
              <button
                aria-label="delete block"
                onClick={() => onRemove(b)}
                className="font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-2">
          <AddBlockForm onAdd={onAdd} bare />
        </div>
      </section>

      {/* context column */}
      <div className="flex flex-col gap-5">
        <section className="rounded-lg border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-sm font-bold text-burgundy-bright">
            <span>BRAND PLAN</span>
            {plan && <span className="text-cream-dim">{plan.label}</span>}
          </header>
          <div className="space-y-1.5 p-3 font-sans text-sm">
            {!plan && (
              <p className="font-mono text-xs text-cream-dim">
                outside the 30-day window — keep the daily reel habit alive
              </p>
            )}
            {plan && (
              <>
                <p className="text-cream">
                  <span className="font-mono text-[10px] text-burgundy-bright">REEL </span>
                  {plan.reel}
                </p>
                {(plan.posts ?? []).map((p) => (
                  <p key={p} className="text-cream-dim">
                    <span className="font-mono text-[10px] text-indigo">POST </span>
                    {p}
                  </p>
                ))}
                {plan.linkedin && (
                  <p className="font-mono text-xs text-cream-dim">+ LinkedIn PDF slide</p>
                )}
                {plan.milestone && (
                  <p className="font-mono text-xs font-bold text-amber">★ {plan.milestone}</p>
                )}
              </>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-sm font-bold text-burgundy-bright">
            <span>BOARD · {human(date)}</span>
            <span className="tabular-nums text-cream-dim">
              {tasks.filter((t) => t.done).length}/{tasks.length}
            </span>
          </header>
          <ul className="space-y-1 p-2">
            {tasks.length === 0 && (
              <li className="px-2 py-2 font-mono text-xs text-cream-dim">
                no board tasks dated {date}
              </li>
            )}
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2 rounded px-2 py-1 hover:bg-panel-2">
                <button
                  aria-label={t.done ? "mark not done" : "mark done"}
                  onClick={() => onToggleTask(t.id, !t.done)}
                  className={`mt-0.5 font-mono text-sm leading-none ${
                    t.done ? "text-burgundy-bright" : "text-cream-dim"
                  }`}
                >
                  {t.done ? "[x]" : "[ ]"}
                </button>
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: LANES.find((l) => l.id === t.lane)?.accent,
                  }}
                />
                <span
                  className={`flex-1 font-sans text-sm leading-snug ${
                    t.done ? "text-cream-dim line-through" : "text-cream"
                  }`}
                >
                  {t.title}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-5">
          <section className="rounded-lg border border-line bg-panel p-3">
            <p className="font-mono text-[10px] text-cream-dim">CALLS</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-amber">
              {calls.called}
              <span className="text-sm text-cream-dim">/{calls.total || CALL_TARGET}</span>
            </p>
            <p className="font-mono text-[10px] text-cream-dim">
              {calls.total ? "queued today" : "none queued — paste on CALL LIST"}
            </p>
          </section>
          {date === today ? (
            <PipelineStrip />
          ) : (
            <section className="rounded-lg border border-line bg-panel p-3">
              <p className="font-mono text-[10px] text-cream-dim">PIPELINES</p>
              <p className="font-mono text-xs text-cream-dim">live status shows on today</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MONTH ────────────────────────────────────────────────────────────────────
function MonthView({
  cursor,
  today,
  blocks,
  tasks,
  onNav,
  onPick,
}: {
  cursor: string;
  today: string;
  blocks: PlanBlock[];
  tasks: Task[];
  onNav: (n: number) => void;
  onPick: (iso: string) => void;
}) {
  const d = new Date(cursor + "T00:00:00");
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday-start grid
  const cells = Array.from({ length: 42 }, (_, i) => {
    const cd = new Date(d.getFullYear(), d.getMonth(), 1 + i - offset);
    return { iso: isoDate(cd), inMonth: cd.getMonth() === d.getMonth(), num: cd.getDate() };
  });

  // task load per date, split open vs done so heavy finished days read calm
  const taskMap = useMemo(() => {
    const m = new Map<string, { open: number; done: number }>();
    for (const t of tasks) {
      const e = m.get(t.dueDate) ?? { open: 0, done: 0 };
      if (t.done) e.done += 1;
      else e.open += 1;
      m.set(t.dueDate, e);
    }
    return m;
  }, [tasks]);

  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-3 flex items-center justify-between font-mono text-sm">
        <button
          onClick={() => onNav(-1)}
          className="rounded border border-line px-2 py-1 text-cream-dim hover:text-cream"
          aria-label="previous month"
        >
          ‹
        </button>
        <span className="font-bold text-cream">{monthLabel(cursor)}</span>
        <button
          onClick={() => onNav(1)}
          className="rounded border border-line px-2 py-1 text-cream-dim hover:text-cream"
          aria-label="next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((w) => (
          <span key={w} className="pb-1 text-center font-mono text-[10px] text-cream-dim">
            {w}
          </span>
        ))}
        {cells.map((c) => {
          const load = taskMap.get(c.iso);
          const planned = plannedCount(blocks, c.iso);
          const dNum = dayNumber(c.iso);
          const isToday = c.iso === today;
          const isMilestone = c.iso === MILESTONE_DATE;
          return (
            <button
              key={c.iso}
              onClick={() => onPick(c.iso)}
              title={isMilestone ? MILESTONE_LABEL : c.iso}
              className={`flex min-h-16 flex-col rounded border p-1 text-left transition hover:bg-panel-2 ${
                isMilestone ? "border-amber" : isToday ? "border-burgundy-bright" : "border-line"
              } ${c.inMonth ? "" : "opacity-30"}`}
              style={isToday ? { animation: "cc-pulse 2.4s ease-in-out infinite" } : undefined}
            >
              <span className="flex items-baseline justify-between font-mono text-[11px]">
                <span className={isToday ? "font-bold text-cream" : "text-cream-dim"}>
                  {c.num}
                </span>
                {dNum >= 1 && dNum <= 30 && (
                  <span className="text-[9px] text-burgundy-bright">D{dNum}</span>
                )}
              </span>
              <span className="mt-auto flex flex-wrap items-center gap-0.5 pt-1">
                {Array.from({ length: Math.min(load?.open ?? 0, 4) }).map((_, i) => (
                  <span key={`o${i}`} className="h-1.5 w-1.5 rounded-[1px] bg-burgundy-bright" />
                ))}
                {(load?.open ?? 0) > 4 && (
                  <span className="font-mono text-[8px] text-burgundy-bright">
                    +{(load?.open ?? 0) - 4}
                  </span>
                )}
                {(load?.done ?? 0) > 0 && (load?.open ?? 0) === 0 && (
                  <span className="font-mono text-[9px] text-cream-dim">✓</span>
                )}
                {Array.from({ length: Math.min(planned, 3) }).map((_, i) => (
                  <span key={`p${i}`} className="h-1.5 w-1.5 rotate-45 bg-amber" />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 font-mono text-[9px] text-cream-dim">
        ▪ open board tasks · ◆ plan blocks · ✓ all done · amber ring = milestone day · click a day to drill in
      </p>
    </section>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function BlockPill({
  block,
  onToggle,
  onRemove,
}: {
  block: PlanBlock;
  onToggle: (b: PlanBlock) => void;
  onRemove: (b: PlanBlock) => void;
}) {
  const meta = kindMeta(block.kind);
  return (
    <span
      className={`group inline-flex items-center gap-1.5 rounded border border-line bg-panel px-2 py-1 font-sans text-xs ${
        block.done ? "opacity-50" : ""
      }`}
      style={{ borderLeftColor: meta.color, borderLeftWidth: 2 }}
    >
      <button
        aria-label={block.done ? "mark not done" : "mark done"}
        onClick={() => onToggle(block)}
        className="font-mono text-cream-dim hover:text-cream"
      >
        {block.done ? "[x]" : "[ ]"}
      </button>
      <span className={block.done ? "text-cream-dim line-through" : "text-cream"}>
        {block.title}
      </span>
      <button
        aria-label="delete block"
        onClick={() => onRemove(block)}
        className="font-mono text-[10px] text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
      >
        ✕
      </button>
    </span>
  );
}

function AddBlockForm({
  onAdd,
  bare,
}: {
  onAdd: (raw: string, kind: BlockKind) => void;
  bare?: boolean;
}) {
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<BlockKind>("deep");
  const ref = useRef<HTMLInputElement>(null);

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value, kind);
        setValue("");
        ref.current?.focus();
      }}
      className="flex flex-col gap-2"
    >
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+ 16:30-17:15 block title  ·  time prefix optional"
        className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
      />
      <div className="flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded border px-1.5 py-0.5 font-mono text-[9px] transition ${
              kind === k ? "border-transparent font-bold text-ink" : "border-line text-cream-dim hover:text-cream"
            }`}
            style={kind === k ? { background: kindMeta(k).color } : undefined}
          >
            {kindMeta(k).label}
          </button>
        ))}
      </div>
    </form>
  );

  if (bare) return form;
  return <section className="rounded-lg border border-line bg-panel p-2">{form}</section>;
}

function PipelineStrip() {
  const [states, setStates] = useState<PipelineState[]>(
    PIPELINES.map((cfg) => ({ cfg })),
  );
  useEffect(() => {
    let alive = true;
    // fetchActions/fetchMetrics catch internally and resolve undefined on
    // failure (same contract PipelineOps relies on), so no try/catch here.
    PIPELINES.forEach(async (cfg, i) => {
      const [actions, metrics] = await Promise.all([fetchActions(cfg), fetchMetrics(cfg)]);
      if (!alive) return;
      setStates((prev) => {
        const next = [...prev];
        next[i] = { cfg, actions, metrics };
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const DOT: Record<string, string> = {
    ok: "bg-term",
    warn: "bg-amber",
    bad: "bg-burgundy-bright",
    idle: "bg-cream-dim",
  };

  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <p className="font-mono text-[10px] text-cream-dim">PIPELINES</p>
      <ul className="mt-1 space-y-1">
        {states.map((s) => (
          <li key={s.cfg.key} className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[severity(s)]}`} />
            <span className="truncate text-cream-dim">{s.cfg.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
