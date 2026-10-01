"use client";

// LOCK IN tab: today's whole job in one ranked list. Each row expands into the
// full instructions (scripts, phone numbers, shot lists), so nothing needs a
// question to Claude. Outcome boxes + "copy for claude" close the loop: the
// pasted recap is how tomorrow's list learns what happened today.

import { useEffect, useMemo, useState } from "react";
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
  private: { label: "NON-NEG", cls: "text-amber border-amber/60" },
  clinic: { label: "CLINIC", cls: "text-burgundy-bright border-burgundy-bright/50" },
  seniors: { label: "SENIORS", cls: "text-amber border-amber/50" },
  t20: { label: "T20", cls: "text-indigo border-indigo/50" },
  brand: { label: "BRAND", cls: "text-cream border-cream/40" },
  handoff: { label: "HANDOFF", cls: "text-burgundy-bright border-burgundy-bright/50" },
  systems: { label: "OPS", cls: "text-cream-dim border-line" },
};

export function LockIn() {
  const [state, setState] = useState<LockState>({ done: {}, outcome: {} });
  const [handoffDone, setHandoffDone] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [privText, setPrivText] = useState("");
  const [editingPriv, setEditingPriv] = useState(false);
  const today = useMemo(() => isoDate(), []);

  useEffect(() => {
    setState(lockStore.load());
    setPrivText(privateStore.load());
    setHandoffDone(new Set(handoffStore.load().filter((h) => h.done).map((h) => h.id)));
    setMounted(true);
  }, []);

  const items = useMemo(
    () => (mounted ? [...buildPrivate(today, privText), ...buildLockIn(today, state, handoffDone)] : []),
    [mounted, today, state, handoffDone, privText],
  );

  function update(next: LockState) {
    setState(next);
    lockStore.save(next);
  }

  function toggle(it: LockItem) {
    const done = { ...state.done };
    const nowDone = !done[it.key];
    if (nowDone) done[it.key] = new Date().toISOString();
    else delete done[it.key];
    update({ ...state, done });
    // A P1 handoff ticked here is ticked on the HANDOFFS tab too.
    if (it.track === "handoff") {
      const id = it.key.replace(/^handoff:/, "");
      const all = handoffStore.load();
      const exists = all.some((h) => h.id === id);
      if (exists) handoffStore.save(all.map((h) => (h.id === id ? { ...h, done: nowDone } : h)));
    }
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

  if (!mounted) return <p className="font-mono text-sm text-cream-dim">loading lock in…</p>;

  const day = lockDayNumber(today);
  const doneCount = items.filter((i) => state.done[i.key]).length;
  const minutesLeft = items.filter((i) => !state.done[i.key]).reduce((s, i) => s + i.minutes, 0);
  const pct = items.length ? (doneCount / items.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="hud rounded-lg border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-mono text-sm font-bold text-cream">
            LOCK IN · DAY {day > 0 ? day : "–"} / 30
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingPriv((v) => !v)}
              className="font-mono text-[10px] uppercase tracking-wide text-amber transition hover:text-burgundy-bright"
              title="Your own non-negotiables, saved only in this browser, never on the public site"
            >
              {editingPriv ? "close private" : "private items"}
            </button>
            <button
              onClick={copyForClaude}
              className="font-mono text-[10px] uppercase tracking-wide text-indigo transition hover:text-burgundy-bright"
              title="Copy today's ticks + outcomes to paste back to Claude"
            >
              {copied ? "copied ✓" : "copy for claude"}
            </button>
            <span className="font-mono text-xs tabular-nums text-cream-dim">
              {doneCount}/{items.length} · ~{Math.round(minutesLeft / 6) / 10}h left
            </span>
          </div>
        </div>
        <p className="mt-1 font-mono text-[11px] leading-snug text-cream-dim">
          Ranked by how much each task moves your goals (AI-scored), deadlines on top. Tap a row for the
          full how-to. Day 21 ({LOCKIN.milestone.date}): {LOCKIN.milestone.label}.
        </p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded bg-line">
          <div
            className="h-full bg-gradient-to-r from-burgundy to-amber transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

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

      <ol className="flex flex-col gap-2">
        {items.map((it, idx) => {
          const done = Boolean(state.done[it.key]);
          const isOpen = open === it.key;
          const ts = TRACK_STYLE[it.track];
          return (
            <li
              key={it.key}
              className={`rounded-lg border border-line bg-panel px-3 py-2 transition ${done ? "opacity-50" : ""}`}
            >
              <div className="flex items-start gap-3">
                <button
                  aria-label={done ? "mark not done" : "mark done"}
                  onClick={() => toggle(it)}
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm border ${
                    done ? "border-burgundy-bright bg-burgundy-bright" : "border-cream-dim"
                  }`}
                />
                <button
                  onClick={() => setOpen(isOpen ? null : it.key)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                >
                  <span className={`font-mono text-sm ${done ? "line-through text-cream-dim" : "text-cream"}`}>
                    <span className="mr-2 tabular-nums text-cream-dim">{idx + 1}.</span>
                    {it.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-cream-dim">
                    <span className={`rounded border px-1 ${ts.cls}`}>{ts.label}</span>
                    <span title={it.why ?? "not scored yet"}>score {it.score}/10</span>
                    {it.due && <span className="text-amber">{it.due < today ? `overdue ${it.due}` : "due today"}</span>}
                    {it.minutes > 0 && <span>~{it.minutes} min</span>}
                    {it.why && <span className="italic">· {it.why}</span>}
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="ml-7 mt-2 flex flex-col gap-2">
                  <div className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-cream-dim">
                    {it.how.join("\n")}
                  </div>
                  <textarea
                    defaultValue={state.outcome[it.key] ?? ""}
                    onBlur={(e) => setOutcome(it.key, e.target.value)}
                    placeholder="outcome: who you spoke to, what they said, next step"
                    rows={2}
                    className="w-full rounded border border-line bg-transparent px-2 py-1 font-mono text-[11px] text-cream placeholder:text-cream-dim/60 focus:border-burgundy-bright focus:outline-none"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Paste-in editor for private items. Text lives in this browser's
// localStorage only: never committed, never synced, never sent to Claude.
function PrivateEditor({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <section className="hud rounded-lg border border-amber/40 bg-panel px-4 py-3">
      <p className="font-mono text-[11px] leading-snug text-cream-dim">
        PRIVATE · stays in this browser only (not on the public site, not synced to other devices). One item per
        &quot;- &quot; line, indented lines under it are its how-to. Optional: &quot;| 20&quot; = minutes,
        &quot;@tue @sat&quot; = only those days. These pin to the top every day.
      </p>
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
        className="mt-2 w-full rounded border border-line bg-transparent px-2 py-1 font-mono text-[11px] text-cream placeholder:text-cream-dim/50 focus:border-amber focus:outline-none"
      />
      <button
        onClick={() => onSave(text)}
        className="mt-2 rounded border border-amber/60 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-amber transition hover:bg-amber/10"
      >
        save private items
      </button>
    </section>
  );
}
