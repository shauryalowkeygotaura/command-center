"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChecklistItem, mergeChecklistSeed } from "@/lib/lists";
import {
  EXPECTED_OWNER,
  findOrCreateInboxGist,
  loadSyncToken,
  mergeInbox,
  pullInbox,
  pushInbox,
  saveSyncToken,
  verifyOwner,
} from "@/lib/inboxSync";

type SyncStatus = "off" | "syncing" | "synced" | "error";

interface Store {
  load: () => ChecklistItem[];
  save: (items: ChecklistItem[]) => void;
}

const REPLY_OPTIONS: { value: NonNullable<ChecklistItem["replyStatus"]>; label: string }[] = [
  { value: "done", label: "✓ done" },
  { value: "wontdo", label: "✕ won't" },
  { value: "needinfo", label: "? need info" },
];

export function Checklist({
  title,
  store,
  seed,
  placeholder,
  emptyText,
  replies = false,
  exportForClaude = false,
  sync = false,
}: {
  title: string;
  store: Store;
  seed?: ChecklistItem[];
  placeholder: string;
  emptyText: string;
  // replies: show one-tap verdict chips + a free-text reply box per item, and a
  // header button that copies your answers so I can act on them.
  replies?: boolean;
  // exportForClaude: header button that copies open items as a paste-ready block.
  exportForClaude?: boolean;
  // sync: cross-device gist sync (inbox only) — same pasted PAT as HABITS.
  // Items get updatedAt stamps and deletes become tombstones so they merge.
  sync?: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [syncState, setSyncState] = useState<SyncStatus>("off");
  const [syncError, setSyncError] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const tokenRef = useRef("");
  const gistRef = useRef("");
  const readyToPush = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull remote, merge with whatever is local, adopt + push the result.
  const startSync = useCallback(
    async (token: string, local: ChecklistItem[]) => {
      setSyncState("syncing");
      setSyncError("");
      try {
        await verifyOwner(token);
        const gistId = await findOrCreateInboxGist(token);
        tokenRef.current = token;
        gistRef.current = gistId;
        const remote = await pullInbox(token, gistId);
        const merged = remote ? mergeInbox(local, remote) : local;
        setItems(merged);
        await pushInbox(token, gistId, merged);
        readyToPush.current = true;
        setSyncState("synced");
      } catch (e) {
        readyToPush.current = false;
        setSyncState("error");
        setSyncError(e instanceof Error ? e.message : "sync failed");
      }
    },
    [],
  );

  useEffect(() => {
    const loaded = store.load();
    setItems(seed ? mergeChecklistSeed(loaded, seed) : loaded);
    setMounted(true);
    if (sync) {
      const token = loadSyncToken();
      if (token) void startSync(token, loaded);
    }
    // store/seed/sync are module-level constants; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    store.save(items);
    if (sync && readyToPush.current && tokenRef.current && gistRef.current) {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        setSyncState("syncing");
        pushInbox(tokenRef.current, gistRef.current, items)
          .then(() => setSyncState("synced"))
          .catch(() => setSyncState("error"));
      }, 2500);
    }
  }, [items, mounted, store, sync]);

  function stamp(p: Partial<ChecklistItem>): Partial<ChecklistItem> {
    return sync ? { ...p, updatedAt: new Date().toISOString() } : p;
  }

  function add() {
    const text = draft.trim();
    if (!text) return;
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, done: false, ...stamp({}) },
    ]);
    setDraft("");
  }

  function patch(id: string, p: Partial<ChecklistItem>) {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...stamp(p) } : x)),
    );
  }

  function remove(id: string) {
    // Synced lists tombstone (so the delete propagates); others hard-delete.
    if (sync) patch(id, { deleted: true });
    else setItems((prev) => prev.filter((x) => x.id !== id));
  }

  function connectSync() {
    const token = tokenDraft.trim();
    if (!token) return;
    saveSyncToken(token);
    setTokenDraft("");
    void startSync(token, items);
  }

  async function copyForClaude() {
    let text = "";
    if (replies) {
      const answered = items.filter(
        (i) => !i.deleted && (i.replyStatus || i.reply?.trim()),
      );
      if (answered.length === 0) {
        text = "(no handoff replies yet)";
      } else {
        text =
          "Handoff replies from Command Center:\n\n" +
          answered
            .map((i) => {
              const verdict = i.replyStatus ? `[${i.replyStatus}]` : "[reply]";
              const r = i.reply?.trim() ? ` — ${i.reply.trim()}` : "";
              return `${verdict} ${i.text}${r}`;
            })
            .join("\n");
      }
    } else {
      const open = items.filter((i) => !i.done && !i.deleted);
      text =
        open.length === 0
          ? "(inbox empty)"
          : "From Command Center inbox:\n\n" +
            open.map((i) => `- ${i.text}`).join("\n");
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op; user can still read.
    }
  }

  // Tombstoned items stay in state (they still need to sync out) but never render.
  const visible = items.filter((i) => !i.deleted);
  const done = visible.filter((i) => i.done).length;
  const showCopy = replies || exportForClaude;

  const syncChip =
    syncState === "synced"
      ? "sync ✓"
      : syncState === "syncing"
        ? "sync…"
        : syncState === "error"
          ? "sync ✕"
          : null;

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          {title}
        </span>
        <div className="flex items-center gap-3">
          {showCopy && mounted && (
            <button
              onClick={copyForClaude}
              className="font-mono text-[10px] uppercase tracking-wide text-indigo transition hover:text-burgundy-bright"
              title={
                replies
                  ? "Copy your replies to paste back to Claude"
                  : "Copy open items to paste to Claude"
              }
            >
              {copied ? "copied ✓" : "copy for claude"}
            </button>
          )}
          {sync && syncChip && (
            <span
              title={syncError || "cross-device sync via secret gist"}
              className={`font-mono text-[10px] ${
                syncState === "error" ? "text-burgundy-bright" : "text-indigo"
              }`}
            >
              {syncChip}
            </span>
          )}
          <span className="font-mono text-xs tabular-nums text-cream-dim">
            {done}/{visible.length} done
          </span>
        </div>
      </div>

      {sync && mounted && syncState === "off" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            connectSync();
          }}
          className="flex items-center gap-2 border-b border-line px-3 py-1.5"
        >
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder={`paste a gist-scope PAT (${EXPECTED_OWNER}) to sync across devices`}
            className="flex-1 rounded bg-ink px-2 py-1 font-mono text-[10px] text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
          />
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-wide text-indigo transition hover:text-burgundy-bright"
          >
            connect
          </button>
        </form>
      )}
      {sync && syncState === "error" && syncError && (
        <p className="border-b border-line px-3 py-1.5 font-mono text-[10px] leading-snug text-burgundy-bright">
          {syncError}
        </p>
      )}

      {!mounted ? (
        <p className="p-3 font-mono text-xs text-cream-dim">loading…</p>
      ) : visible.length === 0 ? (
        <p className="p-4 font-mono text-xs text-cream-dim">{emptyText}</p>
      ) : (
        <ul className="space-y-0.5 p-2">
          {visible.map((it) => (
            <li
              key={it.id}
              className="group rounded px-2 py-1.5 hover:bg-panel-2"
            >
              <div className="flex items-start gap-2">
                <button
                  aria-label={it.done ? "mark not done" : "mark done"}
                  onClick={() => patch(it.id, { done: !it.done })}
                  className={`mt-0.5 font-mono text-sm leading-none ${
                    it.done ? "text-burgundy-bright" : "text-cream-dim"
                  }`}
                >
                  {/* ASCII on purpose: █ renders as a tofu box on phones whose
                      fallback font lacks the FULL BLOCK glyph */}
                  {it.done ? "[x]" : "[ ]"}
                </button>
                <span
                  className={`flex-1 font-sans text-sm leading-snug ${
                    it.done ? "text-cream-dim line-through" : "text-cream"
                  }`}
                >
                  {it.text}
                  {it.seeded && (
                    <span className="ml-1.5 align-middle font-mono text-[10px] text-indigo">
                      ⮐ for-you
                    </span>
                  )}
                </span>
                <button
                  aria-label="remove"
                  onClick={() => remove(it.id)}
                  className="font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
                >
                  ✕
                </button>
              </div>
              {it.note && !it.done && (
                <p className="ml-7 mt-0.5 font-mono text-[11px] leading-snug text-cream-dim">
                  {it.note}
                </p>
              )}

              {replies && (
                <div className="ml-7 mt-1.5 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {REPLY_OPTIONS.map((opt) => {
                      const active = it.replyStatus === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() =>
                            patch(it.id, {
                              replyStatus: active ? undefined : opt.value,
                            })
                          }
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] transition ${
                            active
                              ? "border-burgundy-bright bg-burgundy-bright/20 text-cream"
                              : "border-line text-cream-dim hover:border-burgundy-bright hover:text-cream"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={it.reply ?? ""}
                    onChange={(e) => patch(it.id, { reply: e.target.value })}
                    placeholder="reply to Claude…"
                    className="w-full rounded bg-ink px-2 py-1 font-mono text-[11px] text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="border-t border-line p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
        />
      </form>
    </section>
  );
}
