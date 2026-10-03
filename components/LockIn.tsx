"use client";

// LOCK IN tab: today's whole job in one ranked list. Each row expands into the
// full instructions (scripts, phone numbers, shot lists), so nothing needs a
// question to Claude. Outcome boxes + "copy for claude" close the loop: the
// pasted recap is how tomorrow's list learns what happened today.
//
// Layout follows Apple's "Today" pattern (large title, progress ring, inset
// grouped glass sections: Non-negotiables / Do this now / Up next / Done) with
// a web approximation of Liquid Glass (.glass in globals.css). Interaction
// details follow the interaction-craft skill (Enrico Tartarotti): 44px hit
// targets, a fixed chevron that opens content below it, optimistic ticks with
// an undo toast instead of a confirm, a hit stop per tick and a boss stop
// when the whole day is cleared, all muted under prefers-reduced-motion.

import { useEffect, useMemo, useRef, useState } from "react";
import { isoDate } from "@/lib/day";
import { handoffStore } from "@/lib/lists";
import {
  LOCKIN,
  LockItem,
  LockState,
  Track,
  buildLockExport,
  buildLockIn,
  buildPrivate,
  lockDayNumber,
  lockStore,
  privateStore,
} from "@/lib/lockin";

const TRACK_STYLE: Record<Track, { label: string; cls: string }> = {
  private: { label: "Non-neg", cls: "bg-amber/15 text-amber" },
  clinic: { label: "Clinic", cls: "bg-burgundy-bright/20 text-[#e08a95]" },
  seniors: { label: "Seniors", cls: "bg-amber/12 text-amber" },
  t20: { label: "T20", cls: "bg-indigo/18 text-[#a99bff]" },
  brand: { label: "Brand", cls: "bg-cream/10 text-cream" },
  handoff: { label: "Handoff", cls: "bg-burgundy-bright/20 text-[#e08a95]" },
  systems: { label: "Ops", cls: "bg-cream/5 text-cream-dim" },
};

const UNDO_MS = 5000;

export function LockIn() {
  const [state, setState] = useState<LockState>({ done: {}, outcome: {} });
  const [handoffDone, setHandoffDone] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [privText, setPrivText] = useState("");
  const [editingPriv, setEditingPriv] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [popKey, setPopKey] = useState<string | null>(null);
  const [boss, setBoss] = useState(false);
  const [undo, setUndo] = useState<{ key: string; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = useMemo(() => isoDate(), []);

  useEffect(() => {
    setState(lockStore.load());
    setPrivText(privateStore.load());
    setHandoffDone(new Set(handoffStore.load().filter((h) => h.done).map((h) => h.id)));
    setMounted(true);
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const items = useMemo(
    () => (mounted ? [...buildPrivate(today, privText), ...buildLockIn(today, state, handoffDone)] : []),
    [mounted, today, state, handoffDone, privText],
  );

  function update(next: LockState) {
    setState(next);
    lockStore.save(next);
  }

  function setDone(it: LockItem, nowDone: boolean) {
    const done = { ...state.done };
    if (nowDone) done[it.key] = new Date().toISOString();
    else delete done[it.key];
    update({ ...state, done });
    // A P1 handoff ticked here is ticked on the HANDOFFS tab too.
    if (it.track === "handoff") {
      const id = it.key.replace(/^handoff:/, "");
      const all = handoffStore.load();
      if (all.some((h) => h.id === id)) {
        handoffStore.save(all.map((h) => (h.id === id ? { ...h, done: nowDone } : h)));
      }
    }
    return done;
  }

  function toggle(it: LockItem) {
    const nowDone = !state.done[it.key];
    const done = setDone(it, nowDone);
    if (!nowDone) return;
    // Hit stop on the row; boss stop if that tick cleared the whole day.
    setPopKey(it.key);
    setTimeout(() => setPopKey((k) => (k === it.key ? null : k)), 260);
    if (items.every((i) => done[i.key])) {
      setBoss(true);
      setTimeout(() => setBoss(false), 950);
    }
    // Undo instead of "are you sure": the row leaves Up next immediately.
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ key: it.key, title: it.title });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }

  function undoLast() {
    if (!undo) return;
    const it = items.find((i) => i.key === undo.key);
    if (it) setDone(it, false);
    setUndo(null);
  }

  function setOutcome(key: string, text: string) {
    const outcome = { ...state.outcome };
    if (text.trim() === "") delete outcome[key];
    else outcome[key] = text;
    update({ ...state, outcome });
  }

  async function copyForClaude() {
    try {
      await navigator.clipboard.writeText(buildLockExport(today, items, state));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context): nothing to copy into.
    }
  }

  if (!mounted) return <SkeletonLockIn />;

  const day = lockDayNumber(today);
  const isDone = (i: LockItem) => Boolean(state.done[i.key]);
  const privItems = items.filter((i) => i.track === "private");
  const privGroups = [...new Set(privItems.map((i) => i.group ?? "Non-negotiables"))];
  const ranked = items.filter((i) => i.track !== "private");
  const pending = ranked.filter((i) => !isDone(i));
  const now = pending[0];
  const upNext = pending.slice(1);
  // Every tick of the day (private + ranked), newest first, for the corner sheet.
  const finishedItems = items
    .filter(isDone)
    .sort((x, y) => (state.done[y.key] ?? "").localeCompare(state.done[x.key] ?? ""));
  const doneCount = items.filter(isDone).length;
  const minutesLeft = items.filter((i) => !isDone(i)).reduce((s, i) => s + i.minutes, 0);
  const dateLine = new Date(today + "T00:00:00")
    .toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();

  const rowProps = (it: LockItem) => ({
    it,
    done: isDone(it),
    open: open === it.key,
    pop: popKey === it.key,
    outcome: state.outcome[it.key] ?? "",
    today,
    onToggle: () => toggle(it),
    onOpen: () => setOpen(open === it.key ? null : it.key),
    onOutcome: (t: string) => setOutcome(it.key, t),
  });

  return (
    <div className={`mx-auto flex max-w-3xl flex-col gap-7 rounded-3xl pb-24 ${boss ? "cc-boss" : ""}`}>
      {/* ── Large title header ─────────────────────────────── */}
      <header className="flex items-end justify-between gap-4 pt-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.14em] text-cream-dim">
            {dateLine} · <span className="whitespace-nowrap">DAY {day > 0 ? day : "–"} OF 30</span>
          </p>
          <h1 className="mt-1 font-sans text-[34px] font-bold leading-none tracking-tight text-cream">Lock In</h1>
          <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-amber/10 px-3 py-1 font-sans text-[12px] text-amber">
            <span aria-hidden>◎</span>
            <span className="truncate">
              Day 21 · {LOCKIN.milestone.date.slice(5)}: {LOCKIN.milestone.label}
            </span>
          </p>
        </div>
        <ProgressRing done={doneCount} total={items.length} minutesLeft={minutesLeft} />
      </header>

      {/* ── Actions: glass capsules ─────────────────────────── */}
      <div className="-mt-3 flex flex-wrap gap-2">
        <Capsule onClick={() => setEditingPriv((v) => !v)} active={editingPriv}>
          {editingPriv ? "Close private list" : "Private list"}
        </Capsule>
        <Capsule onClick={copyForClaude}>{copied ? "Copied ✓" : "Copy for Claude"}</Capsule>
      </div>

      {editingPriv && (
        <PrivateEditor
          initial={privText}
          onSave={(t) => {
            setPrivText(t);
            privateStore.save(t);
            setEditingPriv(false);
          }}
        />
      )}

      {/* ── Non-negotiables (private, browser-only) ──────────── */}
      {privItems.length === 0 ? (
        <Section title="Non-negotiables" count="0/0">
          <button
            onClick={() => setEditingPriv(true)}
            className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left font-sans text-[14px] text-cream-dim transition hover:text-cream"
          >
            <span className="grid h-6 w-6 place-items-center rounded-lg border border-dashed border-cream-dim/50">+</span>
            Add your morning formula, training and daily rules. Saved only in this browser.
          </button>
        </Section>
      ) : (
        privGroups.map((g) => {
          const rows = privItems.filter((i) => (i.group ?? "Non-negotiables") === g);
          return (
            <Section key={g} title={g} count={`${rows.filter(isDone).length}/${rows.length}`}>
              {rows.map((it) => (
                <Row key={it.key} {...rowProps(it)} compact />
              ))}
            </Section>
          );
        })
      )}

      {/* ── Do this now: the single biggest target (Fitts) ───── */}
      {now ? (
        <section>
          <SectionLabel title="Do this now" />
          <div className="glass glass-tint overflow-hidden rounded-2xl">
            <Row {...rowProps(now)} hero />
          </div>
        </section>
      ) : (
        <div className="glass rounded-2xl px-5 py-8 text-center font-sans">
          <p className="text-[22px] font-semibold text-cream">Day cleared.</p>
          <p className="mt-1 text-[13px] text-cream-dim">Fill the outcome boxes, then Copy for Claude.</p>
        </div>
      )}

      {/* ── Up next: ranked by goal score + urgency ─────────── */}
      {upNext.length > 0 && (
        <Section title="Up next" count={`${upNext.length}`} hint="ranked by goal score, deadlines first">
          {upNext.map((it) => (
            <Row key={it.key} {...rowProps(it)} />
          ))}
        </Section>
      )}

      {/* ── Finished: corner button + sheet, every tick of the day is
          one tap from being undone, long after the 5s toast is gone ─── */}
      {finishedItems.length > 0 && (
        <div className="fixed bottom-5 right-4 z-30 flex flex-col items-end gap-2">
          {showDone && (
            <div className="cc-toast max-h-[60vh] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-cream/10 bg-panel py-2 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
              <p className="px-4 pb-1 pt-1 font-sans text-[12px] font-semibold uppercase tracking-wide text-cream-dim">
                Finished today · tap Untick to fix a mistake
              </p>
              {finishedItems.map((it) => (
                <div key={it.key} className="flex min-h-11 items-center gap-3 border-t border-cream/[0.06] px-4 py-2">
                  <span className="min-w-0 flex-1 truncate font-sans text-[13.5px] text-cream-dim line-through decoration-cream-dim/40">
                    {it.title}
                  </span>
                  <button
                    onClick={() => setDone(it, false)}
                    className="min-h-9 shrink-0 rounded-full bg-cream/10 px-3 font-sans text-[12px] font-semibold text-amber transition hover:bg-cream/20"
                  >
                    Untick
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="glass flex min-h-11 items-center gap-2 rounded-full pl-3 pr-4 font-sans text-[13px] font-semibold text-cream transition hover:text-amber active:translate-y-px"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-amber text-[12px] font-bold tabular-nums text-ink">
              {finishedItems.length}
            </span>
            {showDone ? "Close" : "Finished"}
          </button>
        </div>
      )}

      {/* ── Undo toast, in context, 5s ───────────────────────── */}
      {undo && !showDone && (
        <div
          role="status"
          className="cc-toast glass fixed bottom-20 left-1/2 z-30 flex max-w-[92vw] -translate-x-1/2 items-center gap-4 rounded-full py-2 pl-5 pr-2 font-sans text-[13px] text-cream"
        >
          <span className="truncate">Done: {undo.title}</span>
          <button
            onClick={undoLast}
            className="min-h-9 rounded-full bg-cream/10 px-4 font-semibold text-amber transition hover:bg-cream/20"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

function SectionLabel({ title, count, hint }: { title: string; count?: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2 px-1">
      <h2 className="font-sans text-[13px] font-semibold uppercase tracking-wide text-cream-dim">{title}</h2>
      {count && <span className="font-mono text-[11px] tabular-nums text-cream-dim/70">{count}</span>}
      {hint && <span className="ml-auto font-sans text-[11px] text-cream-dim/60">{hint}</span>}
    </div>
  );
}

function Section({ title, count, hint, children }: { title: string; count?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionLabel title={title} count={count} hint={hint} />
      <div className="glass divide-y divide-cream/[0.06] overflow-hidden rounded-2xl">{children}</div>
    </section>
  );
}

function Capsule({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`glass min-h-9 rounded-full px-4 font-sans text-[13px] font-medium transition active:translate-y-px ${
        active ? "text-amber" : "text-cream hover:text-amber"
      }`}
    >
      {children}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressRing({ done, total, minutesLeft }: { done: number; total: number; minutesLeft: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  const hours = Math.round(minutesLeft / 6) / 10;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative h-[76px] w-[76px]">
        <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
          <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(240,228,204,0.08)" strokeWidth="7" />
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke="url(#lockin-ring)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.2,0.8,0.2,1)" }}
          />
          <defs>
            <linearGradient id="lockin-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9a3f4a" />
              <stop offset="100%" stopColor="#ff7a1a" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-sans text-[17px] font-bold tabular-nums text-cream">
            {done}
            <span className="text-[12px] font-medium text-cream-dim">/{total}</span>
          </span>
        </div>
      </div>
      <span className="font-mono text-[10px] tabular-nums text-cream-dim">~{hours}h left</span>
    </div>
  );
}

function Row({
  it,
  done,
  open,
  pop,
  outcome,
  today,
  onToggle,
  onOpen,
  onOutcome,
  hero,
  compact,
}: {
  it: LockItem;
  done: boolean;
  open: boolean;
  pop: boolean;
  outcome: string;
  today: string;
  onToggle: () => void;
  onOpen: () => void;
  onOutcome: (t: string) => void;
  hero?: boolean;
  compact?: boolean;
}) {
  const ts = TRACK_STYLE[it.track];
  const hasDetail = it.how.length > 0 || it.track !== "private";
  return (
    <div className={hero ? "px-2 py-3" : ""}>
      <div className="flex items-start">
        {/* 44px hit area around a 22px squircle (round would read as a radio button) */}
        <button
          aria-label={done ? "mark not done" : "mark done"}
          onClick={onToggle}
          className="grid h-11 w-11 shrink-0 place-items-center"
        >
          <span
            className={`grid h-[22px] w-[22px] place-items-center rounded-[7px] border-[1.5px] transition-colors duration-150 ${
              done ? "border-amber bg-amber text-ink" : "border-cream-dim/70"
            } ${pop ? "cc-hit" : ""}`}
          >
            {done && (
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </button>

        <button
          onClick={hasDetail ? onOpen : onToggle}
          aria-expanded={hasDetail ? open : undefined}
          className={`flex min-h-11 min-w-0 flex-1 items-start gap-3 py-2.5 pr-4 text-left ${compact ? "" : "pb-3"}`}
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block font-sans leading-snug ${hero ? "text-[19px] font-semibold" : "text-[15px]"} ${
                done ? "text-cream-dim line-through decoration-cream-dim/50" : "text-cream"
              }`}
            >
              {it.title}
            </span>
            {!compact && (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-cream-dim">
                <span className={`rounded-full px-2 py-0.5 font-sans text-[11px] font-medium ${ts.cls}`}>{ts.label}</span>
                {it.track !== "private" && (
                  <span className={it.score >= 8 ? "text-amber" : ""} title={it.why ?? "not scored yet"}>
                    {it.score}/10
                  </span>
                )}
                {it.due && <span className="text-amber">{it.due < today ? `overdue · ${it.due.slice(5)}` : "due today"}</span>}
                {it.minutes > 0 && <span>{it.minutes} min</span>}
              </span>
            )}
            {hero && it.why && <span className="mt-2 block font-sans text-[12.5px] italic text-cream-dim">{it.why}</span>}
          </span>
          {hasDetail && (
            <span className="mt-1 text-cream-dim">
              <Chevron open={open} />
            </span>
          )}
        </button>
      </div>

      {hasDetail && (
        <div className="cc-expand" data-open={open}>
          <div>
            <div className="ml-11 mr-4 flex flex-col gap-3 pb-4">
              {it.how.length > 0 && (
                <div className="whitespace-pre-wrap rounded-xl bg-ink/60 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-cream-dim">
                  {it.how.join("\n")}
                </div>
              )}
              <textarea
                defaultValue={outcome}
                onBlur={(e) => onOutcome(e.target.value)}
                placeholder="Outcome: who you spoke to, what they said, next step"
                rows={2}
                className="w-full rounded-xl border border-cream/10 bg-ink/40 px-3 py-2 font-sans text-[13px] text-cream placeholder:text-cream-dim/50 focus:border-amber/60 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton instead of a blank-then-pop: teaches the layout before data lands.
function SkeletonLockIn() {
  return (
    <div className="mx-auto flex max-w-3xl animate-pulse flex-col gap-7 motion-reduce:animate-none" aria-busy>
      <div className="flex items-end justify-between pt-2">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-48 rounded bg-cream/10" />
          <div className="h-8 w-32 rounded bg-cream/10" />
        </div>
        <div className="h-[76px] w-[76px] rounded-full bg-cream/10" />
      </div>
      {[3, 1, 5].map((n, i) => (
        <div key={i} className="glass flex flex-col gap-4 rounded-2xl p-4">
          {Array.from({ length: n }).map((_, j) => (
            <div key={j} className="h-4 w-3/4 rounded bg-cream/10" />
          ))}
        </div>
      ))}
    </div>
  );
}

// Paste-in editor for private items. Text lives in this browser's
// localStorage only: never committed, never synced, never sent to Claude.
function PrivateEditor({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  const [fileErr, setFileErr] = useState("");

  // Read a local .md/.txt straight into the box. The file never leaves this
  // browser: FileReader only, no upload.
  function loadFile(f: File | undefined) {
    if (!f) return;
    setFileErr("");
    if (f.size > 200_000) {
      setFileErr("That file is over 200 KB, pick the private list .md.");
      return;
    }
    const r = new FileReader();
    r.onload = () => setText(String(r.result ?? ""));
    r.onerror = () => setFileErr("Could not read that file.");
    r.readAsText(f);
  }

  return (
    <section className="glass rounded-2xl px-5 py-4">
      <p className="font-sans text-[12.5px] leading-snug text-cream-dim">
        <span className="font-semibold text-amber">Private</span> · stays in this browser only: not on the public site,
        not synced to other devices. One item per &quot;- &quot; line, indented lines under it are its how-to.
        Optional: &quot;| 20&quot; = minutes, &quot;@tue @sat&quot; = only those days, &quot;## Heading&quot; = a
        new section.
      </p>
      <label className="mt-3 inline-flex min-h-9 cursor-pointer items-center rounded-full border border-cream/15 px-4 font-sans text-[13px] text-cream transition hover:border-amber/60 hover:text-amber">
        Load from file
        <input
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          className="sr-only"
          onChange={(e) => loadFile(e.target.files?.[0])}
        />
      </label>
      {fileErr && <p className="mt-2 font-sans text-[12px] text-[#e08a95]">{fileErr}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder={[
          "- Morning formula + Wim Hof + 10 min wall stare | 20",
          "    read MORNING FORMULA.md out loud",
          "- Upper A @tue | 75",
          "    pulldown 2x4-8, cable lateral raise 2x8-12",
          "- 25 cold calls | 90",
        ].join("\n")}
        className="mt-3 w-full rounded-xl border border-cream/10 bg-ink/50 px-3 py-2 font-mono text-[12px] text-cream placeholder:text-cream-dim/40 focus:border-amber/60 focus:outline-none"
      />
      <button
        onClick={() => onSave(text)}
        className="mt-3 min-h-10 rounded-full bg-amber px-5 font-sans text-[13px] font-semibold text-ink transition hover:brightness-110 active:translate-y-px"
      >
        Save private list
      </button>
    </section>
  );
}
