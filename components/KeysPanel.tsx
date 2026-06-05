"use client";

import { useEffect, useState } from "react";
import {
  KeyEntry,
  loadKeys,
  saveKeys,
  parseKeyLines,
  maskValue,
} from "@/lib/keys";

export function KeysPanel() {
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [project, setProject] = useState("");
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setKeys(loadKeys());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveKeys(keys);
  }, [keys, mounted]);

  function addBatch() {
    const parsed = parseKeyLines(draft, project);
    if (parsed.length === 0) return;
    setKeys((prev) => [...prev, ...parsed]);
    setDraft("");
  }

  function remove(id: string) {
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function toggleIntegrated(id: string) {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, integrated: !k.integrated } : k)),
    );
  }

  async function copyForClaude() {
    const pending = keys.filter((k) => !k.integrated);
    if (pending.length === 0) return;
    // Group by project so I can route each batch to the right Doppler config.
    const byProject = new Map<string, KeyEntry[]>();
    for (const k of pending) {
      const p = k.project || "unassigned";
      if (!byProject.has(p)) byProject.set(p, []);
      byProject.get(p)!.push(k);
    }
    let text = "Integrate these API keys (from Command Center). Route each into Doppler / the project .env, then tell me to mark them integrated:\n";
    for (const [p, list] of byProject) {
      text += `\n[project: ${p}]\n`;
      text += list.map((k) => `${k.name}=${k.value}`).join("\n") + "\n";
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  const pendingCount = keys.filter((k) => !k.integrated).length;

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          🔑 KEYS · DROP &amp; INTEGRATE
        </span>
        <div className="flex items-center gap-3">
          {mounted && pendingCount > 0 && (
            <button
              onClick={copyForClaude}
              className="font-mono text-[10px] uppercase tracking-wide text-indigo transition hover:text-burgundy-bright"
              title="Copy pending keys to paste to Claude for integration"
            >
              {copied ? "copied ✓" : "copy for claude"}
            </button>
          )}
          <span className="font-mono text-xs tabular-nums text-cream-dim">
            {pendingCount} pending
          </span>
        </div>
      </div>

      <div className="border-b border-line bg-amber/10 px-3 py-2 font-mono text-[11px] leading-snug text-amber">
        Local to this browser only — never committed, never deployed. Drop a key,
        hit “Copy for Claude”, paste it to me, and I wire it into Doppler. Clear
        the entry after. Anything you paste into chat should be rotated if it’s
        long-lived.
      </div>

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
                title={k.integrated ? "integrated" : "pending — click when wired in"}
              >
                {k.integrated ? "[█]" : "[ ]"}
              </button>
              <span className="font-mono text-xs font-bold text-cream">
                {k.name}
              </span>
              {k.project && (
                <span className="rounded border border-line px-1 font-mono text-[10px] text-indigo">
                  {k.project}
                </span>
              )}
              <code
                className="flex-1 cursor-pointer truncate font-mono text-[11px] text-cream-dim"
                onClick={() =>
                  setReveal((r) => ({ ...r, [k.id]: !r[k.id] }))
                }
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
          addBatch();
        }}
        className="space-y-2 border-t border-line p-2"
      >
        <input
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="project (e.g. philosopher-pipeline) — optional"
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
