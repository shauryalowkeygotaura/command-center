"use client";

import { useEffect, useRef, useState } from "react";
import {
  KeyEntry,
  loadKeys,
  saveKeys,
  parseKeyLines,
  maskValue,
  DropSettings,
  loadDropSettings,
  saveDropSettings,
  pushToDoppler,
  smartDrop,
} from "@/lib/keys";

export function KeysPanel() {
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [project, setProject] = useState("");
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [drop, setDrop] = useState<DropSettings>({ endpoint: "", token: "" });
  const [showSettings, setShowSettings] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [smartDesc, setSmartDesc] = useState("");
  const [smartValue, setSmartValue] = useState("");
  const [smartBusy, setSmartBusy] = useState(false);
  // setState is async — a ref guards against double-push from rapid clicks.
  const pushingRef = useRef(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setKeys(loadKeys());
    setDrop(loadDropSettings());
    setMounted(true);
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (mounted) saveKeys(keys);
  }, [keys, mounted]);

  function addBatch() {
    const parsed = parseKeyLines(draft, project);
    if (parsed.length === 0) return;
    setKeys((prev) => [...prev, ...parsed]);
    setDraft("");
    setStatus(null);
  }

  function remove(id: string) {
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function toggleIntegrated(id: string) {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, integrated: !k.integrated } : k)),
    );
  }

  function updateSettings(next: DropSettings) {
    setDrop(next);
    saveDropSettings(next);
  }

  // Push every pending key straight into Doppler via the key-drop proxy.
  // Keys without a project can't be routed — they stay pending with a hint.
  async function pushPending() {
    if (pushingRef.current) return;
    if (!drop.endpoint || !drop.token) {
      setShowSettings(true);
      setStatus({ ok: false, msg: "set the endpoint + passphrase first (⚙)" });
      return;
    }
    const pending = keys.filter((k) => !k.integrated);
    const routable = pending.filter((k) => k.project);
    const skipped = pending.length - routable.length;
    if (routable.length === 0) {
      setStatus({ ok: false, msg: "pending keys need a project to route to Doppler" });
      return;
    }

    const byProject = new Map<string, KeyEntry[]>();
    for (const k of routable) {
      const p = k.project!;
      if (!byProject.has(p)) byProject.set(p, []);
      byProject.get(p)!.push(k);
    }

    pushingRef.current = true;
    setPushing(true);
    setStatus(null);
    const savedIds = new Set<string>();
    const errors: string[] = [];
    for (const [p, list] of byProject) {
      try {
        await pushToDoppler(drop, p, list);
        for (const k of list) savedIds.add(k.id);
      } catch (e) {
        errors.push(`${p}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    if (savedIds.size > 0) {
      setKeys((prev) =>
        prev.map((k) => (savedIds.has(k.id) ? { ...k, integrated: true } : k)),
      );
    }
    pushingRef.current = false;
    setPushing(false);
    if (errors.length > 0) {
      setStatus({ ok: false, msg: errors.join(" · ") });
    } else {
      setStatus({
        ok: true,
        msg:
          `${savedIds.size} key${savedIds.size === 1 ? "" : "s"} → Doppler ✓` +
          (skipped > 0 ? ` (${skipped} skipped: no project)` : ""),
      });
    }
  }

  // Smart drop: plain-language description + key -> Groq names and routes it
  // -> Doppler. The key value never touches the LLM, only the description.
  async function dropSmart() {
    if (smartBusy) return;
    if (!drop.endpoint || !drop.token) {
      setShowSettings(true);
      setStatus({ ok: false, msg: "set the endpoint + passphrase first (⚙)" });
      return;
    }
    const description = smartDesc.trim();
    const value = smartValue.trim();
    if (description.length < 3 || !value) {
      setStatus({ ok: false, msg: "describe the key and paste its value" });
      return;
    }
    setSmartBusy(true);
    setStatus(null);
    try {
      const r = await smartDrop(drop, description, value);
      // Record it in the list, already integrated — Doppler has it.
      setKeys((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: r.name,
          value,
          project: r.config === "dev" ? r.project : `${r.project}/${r.config}`,
          integrated: true,
        },
      ]);
      setSmartDesc("");
      setSmartValue("");
      setStatus({
        ok: true,
        msg: `${r.name} → ${r.project}/${r.config} ✓${r.note ? ` · ${r.note}` : ""}`,
      });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "smart drop failed" });
    } finally {
      setSmartBusy(false);
    }
  }

  // Manual fallback: copy pending keys as a paste-ready block for chat.
  async function copyForClaude() {
    const pending = keys.filter((k) => !k.integrated);
    if (pending.length === 0) return;
    const byProject = new Map<string, KeyEntry[]>();
    for (const k of pending) {
      const p = k.project || "unassigned";
      if (!byProject.has(p)) byProject.set(p, []);
      byProject.get(p)!.push(k);
    }
    let text =
      "Integrate these API keys (from Command Center). Route each into Doppler / the project .env, then tell me to mark them integrated:\n";
    for (const [p, list] of byProject) {
      text += `\n[project: ${p}]\n`;
      text += list.map((k) => `${k.name}=${k.value}`).join("\n") + "\n";
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  const pendingCount = keys.filter((k) => !k.integrated).length;

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          🔑 KEYS · DROP &amp; PUSH
        </span>
        <div className="flex items-center gap-3">
          {mounted && pendingCount > 0 && (
            <>
              <button
                onClick={pushPending}
                disabled={pushing}
                className="font-mono text-[10px] uppercase tracking-wide text-burgundy-bright transition hover:text-cream disabled:opacity-50"
                title="Push pending keys straight into Doppler"
              >
                {pushing ? "pushing…" : "push to doppler"}
              </button>
              <button
                onClick={copyForClaude}
                className="font-mono text-[10px] uppercase tracking-wide text-indigo transition hover:text-burgundy-bright"
                title="Fallback: copy pending keys to paste to Claude"
              >
                {copied ? "copied ✓" : "copy for claude"}
              </button>
            </>
          )}
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="font-mono text-xs text-cream-dim transition hover:text-cream"
            title="key-drop endpoint settings"
            aria-label="settings"
          >
            ⚙
          </button>
          <span className="font-mono text-xs tabular-nums text-cream-dim">
            {pendingCount} pending
          </span>
        </div>
      </div>

      {showSettings && (
        <div className="space-y-2 border-b border-line bg-ink/40 p-3">
          <input
            value={drop.endpoint}
            onChange={(e) => updateSettings({ ...drop, endpoint: e.target.value })}
            placeholder="key-drop endpoint, e.g. https://key-drop-xyz.vercel.app/api/keys"
            className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
          />
          <input
            value={drop.token}
            onChange={(e) => updateSettings({ ...drop, token: e.target.value })}
            type="password"
            placeholder="drop passphrase (x-drop-token)"
            className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
          />
          <p className="font-mono text-[10px] leading-snug text-cream-dim">
            Keys go browser → key-drop (Vercel) → Doppler. Nothing transits chat.
            Project field accepts <code>name</code> (config defaults to dev) or{" "}
            <code>name/config</code>.
          </p>
        </div>
      )}

      {status && (
        <div
          className={`border-b border-line px-3 py-2 font-mono text-[11px] leading-snug ${
            status.ok ? "bg-burgundy-bright/10 text-cream" : "bg-amber/10 text-amber"
          }`}
        >
          {status.msg}
        </div>
      )}

      {!mounted ? (
        <p className="p-3 font-mono text-xs text-cream-dim">loading…</p>
      ) : keys.length === 0 ? (
        <p className="p-4 font-mono text-xs text-cream-dim">
          No keys dropped yet. Paste <code>NAME=value</code> lines below.
        </p>
      ) : (
        <ul className="space-y-0.5 p-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-panel-2"
            >
              <button
                aria-label={k.integrated ? "mark pending" : "mark integrated"}
                onClick={() => toggleIntegrated(k.id)}
                className={`font-mono text-sm leading-none ${
                  k.integrated ? "text-burgundy-bright" : "text-cream-dim"
                }`}
                title={k.integrated ? "integrated" : "pending — push or click when wired in"}
              >
                {k.integrated ? "[x]" : "[ ]"}
              </button>
              <span className="font-mono text-xs font-bold text-cream">
                {k.name}
              </span>
              {k.project ? (
                <span className="rounded border border-line px-1 font-mono text-[10px] text-indigo">
                  {k.project}
                </span>
              ) : (
                !k.integrated && (
                  <span
                    className="rounded border border-amber/40 px-1 font-mono text-[10px] text-amber"
                    title="no project — can't auto-push to Doppler"
                  >
                    no project
                  </span>
                )
              )}
              <code
                className="flex-1 cursor-pointer truncate font-mono text-[11px] text-cream-dim"
                onClick={() => setReveal((r) => ({ ...r, [k.id]: !r[k.id] }))}
                title="click to reveal/hide"
              >
                {reveal[k.id] ? k.value : maskValue(k.value)}
              </code>
              <button
                aria-label="remove"
                onClick={() => remove(k.id)}
                className="font-mono text-xs text-cream-dim opacity-0 transition group-hover:opacity-100 hover:text-burgundy-bright"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          dropSmart();
        }}
        className="space-y-2 border-t border-line p-2"
      >
        <p className="font-mono text-[10px] uppercase tracking-wide text-burgundy-bright">
          smart drop — describe it, it gets named + routed
        </p>
        <input
          value={smartDesc}
          onChange={(e) => setSmartDesc(e.target.value)}
          placeholder="e.g. pexels key for football autopilot"
          className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
        />
        <input
          value={smartValue}
          onChange={(e) => setSmartValue(e.target.value)}
          type="password"
          placeholder="the key itself"
          className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
        />
        <button
          type="submit"
          disabled={smartBusy}
          className="rounded border border-burgundy-bright px-3 py-1 font-mono text-xs text-cream transition hover:bg-burgundy-bright/20 disabled:opacity-50"
        >
          {smartBusy ? "routing…" : "⚡ drop smart"}
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addBatch();
        }}
        className="space-y-2 border-t border-line p-2"
      >
        <p className="font-mono text-[10px] uppercase tracking-wide text-cream-dim">
          manual — NAME=value lines
        </p>
        <input
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="doppler project (e.g. philosopher-pipeline or jio/prd)"
          className="w-full rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
        />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={"GROQ_API_KEY=gsk_...\nVAPI_API_KEY=..."}
          className="w-full resize-y rounded bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-cream-dim focus:ring-1 focus:ring-burgundy-bright"
        />
        <button
          type="submit"
          className="rounded border border-burgundy-bright px-3 py-1 font-mono text-xs text-cream transition hover:bg-burgundy-bright/20"
        >
          + drop key(s)
        </button>
      </form>
    </section>
  );
}
