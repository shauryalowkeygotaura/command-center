"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Task, Lane, LANES } from "@/lib/types";
import { isoDate } from "@/lib/day";
import { store } from "@/lib/storage";
import { buildSeedTasks } from "@/lib/seed";
import { rolloverIncompleteTasks, mergeSeed } from "@/lib/rollover";
import { StatusBar } from "./StatusBar";
import { CallList } from "./CallList";
import { PipelineOps } from "./PipelineOps";
import { Checklist } from "./Checklist";
import { HabitTracker } from "./HabitTracker";
import { KeysPanel } from "./KeysPanel";
import { lifeStore, handoffStore, inboxStore, HANDOFF_SEED } from "@/lib/lists";

// Section groups surfaced as a sticky tab bar so the board stops being one
// long scroll. Only the active group mounts at a time.
const TABS = [
  { id: "board", label: "BOARD" },
  { id: "calls", label: "CALL LIST" },
  { id: "pipelines", label: "PIPELINES" },
  { id: "drops", label: "INBOX · KEYS" },
  { id: "life", label: "TO DOS · HANDOFFS" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const TAB_KEY = "cc.activeTab.v1";

export function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<TabId>("board");
  const today = useMemo(() => isoDate(), []);

  // Load → roll over yesterday's loose ends → seed today → persist.
  // Also restore the last-viewed tab (kept out of initial render to avoid a
  // hydration mismatch on the static export).
  useEffect(() => {
    const loaded = store.load();
    const rolled = rolloverIncompleteTasks(loaded, today);
    const merged = mergeSeed(rolled, buildSeedTasks(today));
    setTasks(merged);

    const saved = localStorage.getItem(TAB_KEY);
    const match = TABS.find((t) => t.id === saved);
    if (match) setTab(match.id);

    setMounted(true);
  }, [today]);

  function selectTab(id: TabId) {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* private mode / quota — tab just won't persist */
    }
  }

  // Persist on every change (but not the empty pre-mount state).
  useEffect(() => {
    if (mounted) store.save(tasks);
  }, [tasks, mounted]);

  const todays = useMemo(
    () => tasks.filter((t) => t.dueDate === today),
    [tasks, today],
  );
  const doneCount = todays.filter((t) => t.done).length;

  function update(id: string, patch: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  function remove(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }
  function add(lane: Lane, title: string) {
    const clean = title.trim();
    if (!clean) return;
    setTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: clean,
        lane,
        done: false,
        createdAt: new Date().toISOString(),
        dueDate: today,
      },
    ]);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <StatusBar todayISO={today} done={doneCount} total={todays.length} />

      {mounted && (
        <TabNav
          tab={tab}
          onSelect={selectTab}
          boardBadge={`${doneCount}/${todays.length}`}
        />
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {!mounted ? (
          <p className="font-mono text-sm text-cream-dim">loading board…</p>
        ) : (
          <>
            {tab === "board" && (
              <div className="flex flex-col gap-6">
                {/* progress meter */}
                <div className="h-1 w-full overflow-hidden rounded bg-line">
                  <div
                    className="h-full bg-burgundy-bright transition-all duration-300"
                    style={{
                      width: todays.length
                        ? `${(doneCount / todays.length) * 100}%`
                        : "0%",
                    }}
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  {LANES.map((lane) => (
                    <LaneColumn
                      key={lane.id}
                      lane={lane.id}
                      label={lane.label}
                      accent={lane.accent}
                      tasks={todays.filter((t) => t.lane === lane.id)}
                      onToggle={(id, done) => update(id, { done })}
                      onEdit={(id, title) => update(id, { title })}
                      onDelete={remove}
                      onAdd={(title) => add(lane.id, title)}
                    />
                  ))}
                </div>
              </div>
            )}

            {tab === "pipelines" && <PipelineOps />}

            {tab === "calls" && <CallList today={today} />}

            {tab === "drops" && (
              <div className="flex flex-col gap-6">
                <Checklist
                  title="INBOX · DROP IDEAS"
                  store={inboxStore}
                  placeholder="+ drop an idea or task for Claude to file"
                  emptyText="Drop raw ideas here. Hit “copy for claude” to hand them to me — I file them into the vault Inbox + todos."
                  exportForClaude
                />
                <KeysPanel />
              </div>
            )}

            {tab === "life" && (
              <div className="flex flex-col gap-5">
                <HabitTracker />
                <div className="grid gap-5 md:grid-cols-2">
                <Checklist
                  title="TO DOS"
                  store={lifeStore}
                  placeholder="+ add a real-life to-do"
                  emptyText="Your personal real-life to-dos go here. Type below to add."
                />
                <Checklist
                  title="HANDOFFS · CLAUDE → YOU"
                  store={handoffStore}
                  seed={HANDOFF_SEED}
                  placeholder="+ add your own note"
                  emptyText="Things only you can do for me show up here."
                  replies
                />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-3 text-right font-mono text-[10px] text-cream-dim/60">
        build {process.env.NEXT_PUBLIC_BUILD_STAMP ?? "dev"}
      </footer>
    </div>
  );
}

function TabNav({
  tab,
  onSelect,
  boardBadge,
}: {
  tab: TabId;
  onSelect: (id: TabId) => void;
  boardBadge: string;
}) {
  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 py-2 font-mono text-xs">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 transition ${
                active
                  ? "bg-burgundy font-bold text-cream"
                  : "text-cream-dim hover:bg-panel-2 hover:text-cream"
              }`}
            >
              <span>{t.label}</span>
              {t.id === "board" && (
                <span
                  className={`tabular-nums ${active ? "text-cream/80" : "text-cream-dim"}`}
                >
                  {boardBadge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function LaneColumn({
  label,
  accent,
  tasks,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
}: {
  lane: Lane;
  label: string;
  accent: string;
  tasks: Task[];
  onToggle: (id: string, done: boolean) => void;
  onEdit: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onAdd: (title: string) => void;
}) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <section className="flex flex-col rounded-lg border border-line bg-panel">
      <div
        className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-sm font-bold"
        style={{ color: accent }}
      >
        <span>{label}</span>
        <span className="tabular-nums text-cream-dim">
          {done}/{tasks.length}
        </span>
      </div>

      <ul className="flex-1 space-y-1 p-2">
        {tasks.length === 0 && (
          <li className="px-2 py-3 font-mono text-xs text-cream-dim">
            nothing queued
          </li>
        )}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>

      <AddTaskForm onAdd={onAdd} />
    </section>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: (id: string, done: boolean) => void;
  onEdit: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  function commit() {
    onEdit(task.id, draft.trim() || task.title);
    setEditing(false);
  }

  return (
    <li className="group rounded px-2 py-1.5 hover:bg-panel-2">
      <div className="flex items-start gap-2">
        <button
          aria-label={task.done ? "mark not done" : "mark done"}
          onClick={() => onToggle(task.id, !task.done)}
          className={`mt-0.5 font-mono text-sm leading-none ${
            task.done ? "text-burgundy-bright" : "text-cream-dim"
          }`}
        >
          {task.done ? "[x]" : "[ ]"}
        </button>

        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="flex-1 rounded border border-line bg-ink px-1.5 py-0.5 font-sans text-sm text-cream outline-none focus:border-burgundy-bright"
          />
        ) : (
          <button
            onDoubleClick={() => {
              setDraft(task.title);
              setEditing(true);
            }}
            className={`flex-1 text-left font-sans text-sm leading-snug ${
              task.done ? "text-cream-dim line-through" : "text-cream"
            }`}
            title="double-click to edit"
          >
            {task.title}
            {task.rolledOver && (
              <span className="ml-1.5 align-middle font-mono text-[10px] text-amber">
                ↻ carried
              </span>
            )}
          </button>
        )}

        <button
          aria-label="delete"
          onClick={() => onDelete(task.id)}
          className="font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
        >
          ✕
        </button>
      </div>

      {task.note && !editing && (
        <p className="ml-7 mt-0.5 font-mono text-[11px] leading-snug text-cream-dim">
          {task.note}
        </p>
      )}
    </li>
  );
}

function AddTaskForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(value);
        setValue("");
        ref.current?.focus();
      }}
      className="border-t border-line p-2"
    >
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+ add task"
        className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
      />
    </form>
  );
}
